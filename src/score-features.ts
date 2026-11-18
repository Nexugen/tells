import { SIGNALS } from './human.ts';
import { RULES } from './rules.ts';
import { countWords, mask, paragraphs, sentences } from './text.ts';
import type { Finding, Register, RuleContext } from './types.ts';
import { REGISTERS } from './types.ts';

/**
 * Measurements the human-pattern score is computed from. Every one is a count or a ratio a
 * person could check by hand: function words, punctuation, sentence and paragraph rhythm,
 * the human signals and the rule hits. None of them reads meaning.
 *
 * Layout is taken out first (bold markers, heading marks, list bullets), so the score is about
 * the prose. Markdown habits are left to the rules, which name them.
 */

export const FUNCTION_WORDS = [
  'the', 'a', 'an', 'and', 'but', 'or', 'so', 'if', 'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'as',
  'that', 'this', 'it', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'did', 'just', 'really', 'very', 'also', 'then',
  'i', 'me', 'my', 'we', 'our', 'us', 'you', 'your', 'they', 'them', 'he', 'she', 'his', 'her', 'not', 'no', 'can', 'will', 'would', 'could',
  'should', 'might', 'must', 'all', 'some', 'any', 'more', 'most', 'about', 'like', 'which', 'what', 'when', 'how', 'there', 'than', 'even',
  'actually', 'though', 'because', 'into', 'while', 'without', 'each', 'every', 'whether', 'ensure', 'helps', 'well', 'still', 'only',
  'here', 'now', 'yet', 'too', 'quite', 'maybe', 'probably', 'perhaps', 'anyway', 'however', 'additionally', 'overall', 'ultimately',
  'key', 'clear', 'specific', 'important', 'whole', 'simply', 'help', 'make', 'get', 'got', 'thing', 'things', 'stuff', 'lot', 'pretty',
  'feel', 'think', 'know', 'want', 'need', 'one', 'way', 'time', 'people', 'something', 'never', 'always', 'whatever', 'unless', 'since',
  'though', 'instead', 'rather', 'both', 'either', 'own', 'such', 'these', 'those', 'its', 'their', 'who', 'where', 'why', 'let',
];

const UNIQUE_FW = [...new Set(FUNCTION_WORDS)];

// Nothing here depends on paragraph breaks or text length: scraped human text often loses its
// line breaks, and a feature that learned that would accuse people who use paragraphs.
const SHAPE_KEYS = ['len:sentence', 'cv:sentence', 'short-share', 'long-share', 'len:word', 'long-words', 'mattr'];
const PUNCT_KEYS = [
  'p:comma', 'p:semicolon', 'p:colon', 'p:exclaim', 'p:question', 'p:paren', 'p:dquote', 'p:apostrophe', 'p:spaced-hyphen', 'p:emdash',
  'p:endash', 'p:ellipsis', 'p:repeat', 'p:digits', 'p:caps-word', 'p:emoji', 'p:emoticon', 'p:slash', 'p:ampersand',
];
const CASUAL_KEYS = ['r:lower-i', 'r:lower-start', 'r:bare-contraction', 'r:contraction', 'r:start-conj', 'r:start-i', 'r:start-the-this', 'r:you'];
const RULE_CATS = ['punctuation', 'structure', 'vocabulary', 'tone', 'format', 'rhythm'] as const;
const RULE_KEYS = [...RULE_CATS.map((c) => `rule:${c}`), 'rule:all', 'rule:distinct', 'rule:blocking'];
// Signals about paragraphs are left out for the same reason as the paragraph shape measures.
const SCORE_SIGNALS = SIGNALS.filter((s) => s.id !== 'uneven-paragraphs');
const SIGNAL_KEYS = SCORE_SIGNALS.map((s) => `sig:${s.id}`);
const REG_KEYS = REGISTERS.map((r) => `reg:${r}`);

export const SCORE_KEYS: string[] = [
  ...UNIQUE_FW.map((w) => `fw:${w}`),
  ...PUNCT_KEYS,
  ...SHAPE_KEYS,
  ...CASUAL_KEYS,
  ...RULE_KEYS,
  ...SIGNAL_KEYS,
  ...REG_KEYS,
];

/** Remove markdown layout so prose from a chat app and prose from a forum look alike. */
export function stripLayout(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    // Each list item becomes its own paragraph, as it would read in plain text.
    .replace(/^[ \t]{0,3}(?:[-*+•]|\d+[.)])[ \t]+(.*)$/gm, '\n$1\n')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, '$1')
    .replace(/^[ \t]{0,3}>[ \t]?/gm, '')
    // Tables are layout, not prose.
    .replace(/^[ \t]*\|.*\|[ \t]*$/gm, '')
    .replace(/^[ \t]*(?:---+|\*\*\*+)[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const RULE_BY_ID = new Map(RULES.map((r) => [r.id, r]));
function baseSeverity(id: string, register: Register): string {
  const r = RULE_BY_ID.get(id);
  return r ? (r.registers?.[register] ?? r.severity) : 'info';
}

const per100 = (n: number, w: number) => (n / Math.max(w, 50)) * 100;
function cv(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  return m ? sd / m : 0;
}

/** Moving-average type-token ratio over 50-word windows, so length does not decide it. */
function mattr(toks: string[], win = 50): number {
  if (toks.length < win) return toks.length ? new Set(toks).size / toks.length : 0;
  let sum = 0;
  let n = 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < toks.length; i++) {
    counts.set(toks[i], (counts.get(toks[i]) ?? 0) + 1);
    if (i >= win) {
      const old = toks[i - win];
      const c = counts.get(old)! - 1;
      if (c) counts.set(old, c);
      else counts.delete(old);
    }
    if (i >= win - 1) {
      sum += counts.size / win;
      n++;
    }
  }
  return sum / n;
}

export interface FeatureInput {
  /** The text with layout already stripped. */
  text: string;
  register: Register;
  /** Findings from lint() on the original text. */
  findings: Pick<Finding, 'ruleId' | 'severity' | 'category'>[];
  /** The rule context built for the original text, for the human signals. */
  ctx: RuleContext;
}

export function scoreFeatures(input: FeatureInput): number[] {
  const masked = mask(input.text);
  const words = countWords(masked);
  const toks = (masked.toLowerCase().match(/[\p{L}][\p{L}'’]*/gu) ?? []).map((t) => t.replace(/’/g, "'"));
  const freq = new Map<string, number>();
  for (const t of toks) freq.set(t, (freq.get(t) ?? 0) + 1);
  const paras = paragraphs(masked).filter((p) => !p.heading);
  const sents = sentences(masked, paras);
  const lens = sents.map((s) => s.words).filter((n) => n > 0);
  const c = (re: RegExp) => (masked.match(re) ?? []).length;
  const nS = Math.max(1, sents.length);
  const startsWith = (re: RegExp) => sents.filter((s) => re.test(s.text.trimStart())).length / nS;

  const fw = UNIQUE_FW.map((w) => per100(freq.get(w) ?? 0, words));
  const punct = [
    per100(c(/,/g), words), per100(c(/;/g), words), per100(c(/:(?!\/\/)/g), words), per100(c(/!/g), words), per100(c(/\?/g), words),
    per100(c(/\(/g), words), per100(c(/["“”]/g), words), per100(c(/\b['’]\b/g), words), per100(c(/\s-\s/g), words), per100(c(/—/g), words),
    per100(c(/–/g), words), per100(c(/\.\.\.|…/g), words), per100(c(/([!?.])\1{1,}/g), words), per100(c(/\d/g), words), per100(c(/\b[A-Z]{2,}\b/g), words),
    per100(c(/(?![©®™‼])\p{Extended_Pictographic}/gu), words), per100(c(/(?:^|\s)[:;=]-?[)(DPp](?=\s|$)/g), words), per100(c(/\w\/\w/g), words), per100(c(/&/g), words),
  ];
  const shape = [
    lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0,
    cv(lens),
    lens.length ? lens.filter((n) => n <= 6).length / lens.length : 0,
    lens.length ? lens.filter((n) => n >= 30).length / lens.length : 0,
    toks.length ? toks.reduce((a, t) => a + t.length, 0) / toks.length : 0,
    toks.length ? toks.filter((t) => t.length >= 10).length / toks.length : 0,
    mattr(toks),
  ];
  const casual = [
    per100(c(/(?:^|\s)i(?=[\s',.!?])/g), words),
    sents.length ? sents.filter((s) => /^\W*\p{Ll}/u.test(s.text)).length / nS : 0,
    per100(c(/\b(?:dont|cant|wont|didnt|doesnt|isnt|wasnt|im|ive|youre|thats|theyre|wouldnt|couldnt|shouldnt|havent|aint)\b/gi), words),
    per100(toks.filter((t) => /'(?:s|re|ve|ll|d|t|m)$/.test(t)).length, words),
    startsWith(/^(?:and|but|so|or)\b/i),
    startsWith(/^I\b/),
    startsWith(/^(?:the|this|these|it)\b/i),
    per100((freq.get('you') ?? 0) + (freq.get('your') ?? 0), words),
  ];
  // Format findings (bold, headings, bullets) are left out: the score is about the prose.
  const prose = input.findings.filter((f) => f.category !== 'format');
  const cats = RULE_CATS.map((cat) => per100(prose.filter((f) => f.category === cat).length, words));
  const rules = [
    ...cats,
    per100(prose.length, words),
    per100(new Set(prose.map((f) => f.ruleId)).size, words),
    // By each rule's own severity for the register, so the count does not depend on how lint() gates findings.
    per100(prose.filter((f) => baseSeverity(f.ruleId, input.register) !== 'info').length, words),
  ];
  const sig = SCORE_SIGNALS.map((s) => per100(s.detect(input.ctx).length, words));
  const reg = REGISTERS.map((r) => (r === input.register ? 1 : 0));
  return [...fw, ...punct, ...shape, ...casual, ...rules, ...sig, ...reg];
}
