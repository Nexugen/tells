import { countWords, mask, paragraphs, sentences } from './text.ts';

/**
 * Measurements of a text that are not rule hits. None of these says "human" or "AI" on its
 * own; they describe shape, so the benchmark can show where two sources differ.
 */
export interface TextSignals {
  words: number;
  sentences: number;
  /** Mean words per sentence. */
  sentenceMean: number;
  /** Coefficient of variation of sentence length. Higher means a more uneven, bursty rhythm. */
  sentenceCv: number;
  /** Share of sentences with six words or fewer. */
  shortShare: number;
  /** Numbers, names, quoted terms, units and code per 100 words. */
  specificity: number;
  /** Share of word trigrams that appear more than once in the text. */
  repeatedTrigrams: number;
  /** Share of sentences whose first two words also open another sentence. */
  repeatedOpeners: number;
  /** Coefficient of variation of paragraph length (paragraphs of 2+ sentences or 20+ words). */
  paragraphCv: number;
  /** Share of paragraphs that are a single sentence. */
  oneSentenceParagraphs: number;
}

const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function cv(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (!mean) return 0;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return sd / mean;
}

const tokens = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];

export function textSignals(text: string): TextSignals {
  const masked = mask(text);
  const paras = paragraphs(masked).filter((p) => !p.heading);
  const ss = sentences(masked, paras);
  const words = countWords(masked);
  const lens = ss.map((s) => s.words);

  // Specificity: digits, capitalised words that do not open a sentence, quoted or code terms.
  let specific = (text.match(/\d+(?:[.,:]\d+)*\s?(?:%|ms|s|kb|mb|gb|px|usd|\$|£|€)?/gi) ?? []).length;
  specific += (text.match(/`[^`\n]+`/g) ?? []).length;
  for (const s of ss) {
    const ws = s.text.match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
    for (let i = 1; i < ws.length; i++) if (/^\p{Lu}/u.test(ws[i]) && ws[i] !== 'I') specific++;
  }

  const tri = new Map<string, number>();
  const toks = tokens(masked);
  for (let i = 0; i + 2 < toks.length; i++) {
    const k = `${toks[i]} ${toks[i + 1]} ${toks[i + 2]}`;
    tri.set(k, (tri.get(k) ?? 0) + 1);
  }
  const triTotal = Math.max(1, toks.length - 2);
  let triRepeated = 0;
  for (const n of tri.values()) if (n > 1) triRepeated += n;

  const openers = ss.map((s) => tokens(s.text).slice(0, 2).join(' ')).filter((o) => o.includes(' '));
  const openerCount = new Map<string, number>();
  for (const o of openers) openerCount.set(o, (openerCount.get(o) ?? 0) + 1);
  const repeatedOpeners = openers.filter((o) => (openerCount.get(o) ?? 0) > 1).length;

  const paraSentences = paras.map((p) => ss.filter((s) => s.start >= p.start && s.end <= p.end).length);
  const bodyParas = paras.filter((p, i) => paraSentences[i] >= 2 || p.words >= 20);

  return {
    words,
    sentences: ss.length,
    sentenceMean: r(lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length), 1),
    sentenceCv: r(cv(lens)),
    shortShare: r(lens.filter((n) => n <= 6).length / Math.max(1, lens.length)),
    specificity: r((specific / Math.max(words, 50)) * 100, 1),
    repeatedTrigrams: r(triRepeated / triTotal),
    repeatedOpeners: r(repeatedOpeners / Math.max(1, openers.length)),
    paragraphCv: r(cv(bodyParas.map((p) => p.words))),
    oneSentenceParagraphs: r(paraSentences.filter((n) => n === 1).length / Math.max(1, paras.length)),
  };
}

/**
 * Templates across a set of texts from one source: the share of texts that open or close
 * with the same three words as another text in the set ("Hi there, thanks", "let me know").
 */
export function sharedTemplates(texts: string[]): { openings: number; closings: number } {
  const ends = texts.map((t) => {
    const w = tokens(mask(t));
    return { open: w.slice(0, 3).join(' '), close: w.slice(-3).join(' ') };
  });
  const count = (key: 'open' | 'close') => {
    const m = new Map<string, number>();
    for (const e of ends) m.set(e[key], (m.get(e[key]) ?? 0) + 1);
    return ends.filter((e) => (m.get(e[key]) ?? 0) > 1).length / Math.max(1, ends.length);
  };
  return { openings: r(count('open')), closings: r(count('close')) };
}
