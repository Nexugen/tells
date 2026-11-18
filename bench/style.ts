import { countWords, mask, paragraphs, sentences } from '../src/text.ts';

/**
 * An experiment, not part of the package: surface style measurements for the statistical layer in
 * eval.ts. It separates the benchmark sets well and then flags ordinary text messages, because it
 * learns where the samples came from as much as who wrote them. See EVAL.md.
 *
 * Surface style measurements used by the statistical layer: function words, punctuation,
 * rhythm and layout, each per 100 words or as a ratio. None of them reads meaning.
 */
export const FUNCTION_WORDS = [
  'the', 'a', 'an', 'and', 'but', 'or', 'so', 'if', 'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'as',
  'that', 'this', 'it', 'is', 'are', 'was', 'be', 'have', 'has', 'had', 'do', 'just', 'really', 'very', 'also', 'then',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'they', 'he', 'she', 'not', 'no', 'can', 'will', 'would', 'could',
  'should', 'all', 'some', 'any', 'more', 'about', 'like', 'which', 'what', 'when', 'how', 'there', 'than', 'even',
  'actually', 'though', 'because', 'into', 'while', 'without', 'each', 'every', 'whether', 'ensure', 'helps',
];

export const STYLE_KEYS: string[] = [
  ...FUNCTION_WORDS.map((w) => `fw:${w}`),
  'p:comma', 'p:semicolon', 'p:colon', 'p:exclaim', 'p:question', 'p:paren', 'p:quote', 'p:apostrophe', 'p:hyphen', 'p:ellipsis',
  'len:sentence', 'cv:sentence', 'cv:paragraph', 'len:word', 'ttr', 'r:contraction', 'r:lower-i', 'r:lower-start',
  'md:bullet', 'md:bold', 'md:heading', 'r:digits', 'r:caps-word', 'r:one-sentence-paras', 'r:emoji',
];

const per100 = (n: number, w: number) => (n / Math.max(w, 50)) * 100;
const cv = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  return m ? sd / m : 0;
};

export function styleFeatures(text: string): number[] {
  const masked = mask(text);
  const words = countWords(masked);
  const toks = (masked.toLowerCase().match(/[\p{L}][\p{L}'’]*/gu) ?? []).map((t) => t.replace(/’/g, "'"));
  const freq = new Map<string, number>();
  for (const t of toks) freq.set(t, (freq.get(t) ?? 0) + 1);
  const paras = paragraphs(masked);
  const sents = sentences(masked, paras);
  const lens = sents.map((s) => s.words).filter((n) => n > 0);
  const c = (re: RegExp) => (masked.match(re) ?? []).length;
  const prose = paras.filter((p) => !p.heading);
  const sentCounts = prose.map((p) => sents.filter((s) => s.start >= p.start && s.end <= p.end).length);
  return [
    ...FUNCTION_WORDS.map((w) => per100(freq.get(w) ?? 0, words)),
    per100(c(/,/g), words), per100(c(/;/g), words), per100(c(/:(?!\/\/)/g), words), per100(c(/!/g), words), per100(c(/\?/g), words),
    per100(c(/\(/g), words), per100(c(/["“”]/g), words), per100(c(/\b['’]\b/g), words), per100(c(/\s-\s|—|–/g), words), per100(c(/\.\.\.|…/g), words),
    lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0,
    cv(lens),
    cv(prose.map((p) => p.words)),
    toks.length ? toks.reduce((a, t) => a + t.length, 0) / toks.length : 0,
    toks.length ? new Set(toks).size / Math.sqrt(toks.length) : 0,
    per100(toks.filter((t) => /'(?:s|re|ve|ll|d|t|m)$/.test(t)).length, words),
    per100(c(/(?:^|\s)i(?=[\s',.!?])/g), words),
    sents.length ? sents.filter((s) => /^\W*\p{Ll}/u.test(s.text)).length / sents.length : 0,
    per100(c(/^\s{0,3}(?:[-*+]|\d+[.)])\s/gm), words),
    per100(c(/\*\*[^*\n]+\*\*/g), words),
    per100(c(/^\s{0,3}#{1,6}\s/gm), words),
    per100(c(/\d/g), words),
    per100(c(/\b[A-Z]{2,}\b/g), words),
    sentCounts.length ? sentCounts.filter((n) => n === 1).length / sentCounts.length : 0,
    per100(c(/\p{Extended_Pictographic}/gu), words),
  ];
}

