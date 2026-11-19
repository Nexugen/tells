import BASELINE from './voice-baseline.json' with { type: 'json' };
import { featureVector } from './score.ts';
import { SCORE_KEYS, FUNCTION_WORDS, stripLayout } from './score-features.ts';
import { countWords, mask, paragraphs, sentences } from './text.ts';
import { guessRegister } from './register.ts';
import type { Register } from './types.ts';

/**
 * A voice profile: how one person or brand writes, measured from samples of their writing.
 *
 * It is built from the same counts as the human-pattern score (function words, punctuation,
 * rhythm, casing, contractions and the human signals), compared with ordinary human writing
 * from the benchmark, plus the words, openings and endings the samples keep returning to and a
 * few short excerpts. It never stores the samples themselves beyond those excerpts, and it is
 * plain JSON, so you keep it and pass it in when you want a rewrite in that voice.
 */
export interface VoiceProfile {
  format: 'tells-voice';
  version: 1;
  name?: string;
  createdAt: string;
  samples: number;
  words: number;
  register: Register;
  /** Plain-language habits, most distinctive first. This is what the rewrite model reads. */
  summary: string[];
  habits: VoiceHabits;
  /** How samples usually start, with the share of samples that start that way. */
  openers: { text: string; share: number }[];
  /** How samples usually end. */
  endings: { text: string; share: number }[];
  /** Everyday words this writer uses far more often than most people. */
  favourites: { word: string; ratio: number }[];
  /** Two- and three-word phrasings that recur across samples. */
  phrasings: { text: string; share: number }[];
  /** Things common in other people's writing that never appear in these samples. */
  never: string[];
  /** A few short, typical samples, for the model to hear the voice. */
  excerpts: string[];
  /** Per-measure centre and spread of the samples, in standard units against the baseline. */
  stats: { keys: string[]; center: number[]; spread: number[] };
}

export interface VoiceHabits {
  sentenceWords: number;
  sentenceSpread: number;
  shortSentences: number;
  longSentences: number;
  lowercaseStarts: number;
  lowercaseI: number;
  contractions: number;
  bareContractions: number;
  informal: number;
  /** Punctuation per 100 words. */
  punctuation: Record<string, number>;
  questions: number;
  asides: number;
  /** 0 formal, 1 everyday, 2 casual, 3 chatty. */
  informality: number;
}

export interface BuildVoiceOptions {
  name?: string;
  /** How many excerpts to keep. Default 6. */
  excerpts?: number;
  register?: Register;
}

export interface StyleMatch {
  /** 0 to 100: the share of other people's texts in the baseline that sit further from this voice than this text does. */
  score: number;
  /** Mean distance per measure, in standard units. Lower is closer. */
  distance: number;
  words: number;
  /** The measures where this text is furthest from the voice, for display. */
  furthest: { key: string; label: string; text: number; voice: number }[];
}

export interface MatchOptions {
  /**
   * Ignore casing and apostrophe habits (lowercase starts, "im" for "I'm"), for text that is
   * meant to be cleaned up for publishing while keeping the writer's shape.
   */
  polish?: boolean;
}

interface Baseline {
  version: number;
  keys: string[];
  mean: number[];
  sd: number[];
  /** Share of baseline texts where each measure is above zero. */
  nz: number[];
  /** Reference texts' measures, in standard units, rounded. */
  refs: number[][];
  /** Share of baseline texts each common word appears in. */
  df: Record<string, number>;
}

const B = BASELINE as unknown as Baseline;

export const MIN_VOICE_WORDS = 600;
export const MIN_VOICE_SAMPLES = 5;

/** Measures used for voice. Rule hits and the register flag are about tells, not about a person. */
export const VOICE_KEYS = SCORE_KEYS.filter((k) => !k.startsWith('reg:') && !k.startsWith('rule:'));

/** Measures a cleaned-up, published version of someone's writing is allowed to differ on. */
const POLISH_KEYS = new Set(['r:lower-i', 'r:lower-start', 'r:bare-contraction', 'r:contraction', 'p:apostrophe', 'sig:contraction', 'p:caps-word']);

const IDX = new Map(SCORE_KEYS.map((k, i) => [k, i]));
const CLIP = 3;

const INFORMAL = /\b(?:kinda|sorta|gonna|wanna|gotta|yeah|yep|nope|nah|ok|okay|lol|lmao|haha|tbh|idk|imo|btw|pls|plz|thx|u|ur|yk|cuz|coz|ya|dunno|alright)\b/gi;

const LABELS: Record<string, string> = {
  'len:sentence': 'sentence length',
  'cv:sentence': 'spread of sentence lengths',
  'short-share': 'short sentences',
  'long-share': 'long sentences',
  'len:word': 'word length',
  'long-words': 'long words',
  mattr: 'word variety',
  'r:lower-i': 'lowercase "i"',
  'r:lower-start': 'sentences starting in lowercase',
  'r:bare-contraction': 'contractions without apostrophes',
  'r:contraction': 'contractions',
  'r:start-conj': 'sentences starting with and, but or so',
  'r:start-i': 'sentences starting with I',
  'r:start-the-this': 'sentences starting with the or this',
  'r:you': 'you and your',
  'p:comma': 'commas',
  'p:semicolon': 'semicolons',
  'p:colon': 'colons',
  'p:exclaim': 'exclamation marks',
  'p:question': 'question marks',
  'p:paren': 'brackets',
  'p:dquote': 'double quotes',
  'p:apostrophe': 'apostrophes',
  'p:spaced-hyphen': 'spaced hyphens',
  'p:emdash': 'em dashes',
  'p:endash': 'en dashes',
  'p:ellipsis': 'ellipses',
  'p:repeat': 'repeated punctuation (?? or !!)',
  'p:digits': 'digits',
  'p:caps-word': 'all-caps words',
  'p:emoji': 'emoji',
  'p:emoticon': 'emoticons',
  'p:slash': 'slashes',
  'p:ampersand': 'ampersands',
};

const SIGNAL_LABELS: Record<string, string> = {
  'specific-number': 'specific numbers',
  'named-thing': 'names',
  'time-anchor': 'dates and times',
  'first-hand': 'first-hand detail ("I tried", "we shipped")',
  stake: 'stated opinions ("I think", "I prefer")',
  aside: 'asides and self-corrections',
  contraction: 'contractions',
  'plain-verb': 'plain verbs (get, fix, run)',
  'real-question': 'real questions',
  'bursty-rhythm': 'uneven rhythm',
  'concrete-first': 'concrete openings',
};

const STYLE_WORDS = new Set([
  ...FUNCTION_WORDS,
  'kinda', 'sorta', 'gonna', 'wanna', 'gotta', 'yeah', 'yep', 'nope', 'nah', 'ok', 'okay', 'lol', 'haha', 'tbh', 'idk', 'imo', 'btw', 'pls', 'thx', 'u', 'ur', 'yk', 'cuz', 'dunno', 'alright',
  'basically', 'honestly', 'literally', 'definitely', 'obviously', 'sure', 'fine', 'cool', 'great', 'nice', 'thanks', 'please', 'yes', 'right', 'exactly', 'totally',
  'kind', 'sort', 'guess', 'mean', 'seems', 'bit', 'little', 'much', 'super', 'fairly', 'already', 'again', 'first', 'next', 'sometimes', 'usually', 'often',
  'especially', 'clearly', 'perfect', 'good', 'bad', 'weird', 'wild', 'crazy', 'awesome', 'hmm', 'oh', 'ah', 'wow', 'hey', 'cos', 'cause', 'gotcha', 'oops', 'sorry',
  'dont', 'im', 'ive', 'thats', 'isnt', 'doesnt', 'didnt', 'cant', 'wont', 'youre', 'whats', "don't", "i'm", "i've", "that's", "isn't", "doesn't", "didn't", "can't", "won't", "you're", "what's", "it's", "let's", 'lets',
  'able', 'sure', 'enough', 'else', 'everything', 'anything', 'nothing', 'someone', 'anyone', 'everyone', 'say', 'said', 'see', 'look', 'go', 'going', 'do', 'does', 'done', 'try', 'put', 'use', 'fix',
]);

/** Words too common to make a phrasing worth naming on their own. */
const BORING = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'and', 'is', 'it', 'that', 'for', 'with', 'as', 'at', 'by', 'be', 'this', 'are', 'was']);

export function labelFor(key: string): string {
  if (LABELS[key]) return LABELS[key];
  if (key.startsWith('fw:')) return `"${key.slice(3)}"`;
  if (key.startsWith('sig:')) return SIGNAL_LABELS[key.slice(4)] ?? key.slice(4).replace(/-/g, ' ');
  return key;
}

/** The voice measures of one text, raw. */
function rawVector(text: string): number[] {
  const x = featureVector(text, 'casual', []) ?? [];
  return VOICE_KEYS.map((k) => x[IDX.get(k)!] ?? 0);
}

function zOf(raw: number[]): number[] {
  return raw.map((v, i) => {
    const z = (v - B.mean[i]) / (B.sd[i] || 1);
    return Math.max(-CLIP, Math.min(CLIP, z));
  });
}

/** The voice measures of a text in standard units against the baseline, clipped. For tools and benchmarks. */
export function voiceVector(text: string): number[] {
  return zOf(rawVector(text));
}

const tokensOf = (s: string) => (s.toLowerCase().match(/[\p{L}][\p{L}'’]*/gu) ?? []).map((t) => t.replace(/’/g, "'"));
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const per100 = (n: number, w: number) => (n / Math.max(w, 1)) * 100;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

/** Split one file of samples on lines of three dashes, or on blank-line-separated blocks when asked. */
export function splitSamples(text: string): string[] {
  return text
    .split(/^\s*---+\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Build a voice profile from samples of one person's writing. Pure: no model, no network. */
export function buildVoice(samples: string[], options: BuildVoiceOptions = {}): VoiceProfile {
  const texts = samples.map((s) => stripLayout(s).trim()).filter((s) => countWords(s) >= 5);
  if (texts.length < MIN_VOICE_SAMPLES) throw new Error(`A voice needs at least ${MIN_VOICE_SAMPLES} samples of 5 words or more; got ${texts.length}.`);
  const words = texts.reduce((a, t) => a + countWords(t), 0);
  if (words < MIN_VOICE_WORDS) throw new Error(`A voice needs at least ${MIN_VOICE_WORDS} words of samples; got ${words}. Ten or more samples and 1,500 words work better.`);

  const raws = texts.map(rawVector);
  const zs = raws.map(zOf);
  const center = VOICE_KEYS.map((_, i) => round(zs.reduce((a, z) => a + z[i], 0) / zs.length));
  const spread = VOICE_KEYS.map((_, i) => {
    const m = center[i];
    return round(Math.sqrt(zs.reduce((a, z) => a + (z[i] - m) ** 2, 0) / zs.length));
  });

  // Habits from the pooled text, so short samples count by their words.
  let sCount = 0, sWords: number[] = [], lowerStarts = 0, wordsAll = 0;
  const punctCount: Record<string, number> = {};
  let lowerI = 0, apos = 0, bare = 0, informal = 0, questions = 0, asides = 0;
  const PUNCT: [string, RegExp][] = [
    ['commas', /,/g], ['full stops', /\./g], ['question marks', /\?/g], ['exclamation marks', /!/g], ['colons', /:(?!\/\/)/g],
    ['semicolons', /;/g], ['brackets', /\(/g], ['ellipses', /\.\.\.|…/g], ['em dashes', /—/g], ['en dashes', /–/g],
    ['spaced hyphens', /\s-\s/g], ['double quotes', /["“”]/g], ['emoji', /(?![©®™‼])\p{Extended_Pictographic}/gu], ['slashes', /\w\/\w/g],
  ];
  const opener = new Map<string, number>();
  const ending = new Map<string, number>();
  const docFreq = new Map<string, number>();
  const phraseFreq = new Map<string, number>();
  let bulletSamples = 0, greetSamples = 0;

  for (const t of texts) {
    const m = mask(t);
    const ss = sentences(m, paragraphs(m));
    const w = countWords(m);
    wordsAll += w;
    for (const s of ss) {
      if (!s.words) continue;
      sCount++;
      sWords.push(s.words);
      if (/^\W*\p{Ll}/u.test(s.text)) lowerStarts++;
    }
    for (const [name, re] of PUNCT) punctCount[name] = (punctCount[name] ?? 0) + (m.match(re) ?? []).length;
    lowerI += (m.match(/(?:^|\s)i(?=[\s',.!?])/g) ?? []).length;
    const toks = tokensOf(m);
    apos += toks.filter((x) => /n't$|'(?:re|ve|ll|d|m)$|^(?:it|that|what|there|here|he|she|who)'s$/.test(x)).length;
    bare += (m.match(/\b(?:dont|cant|wont|didnt|doesnt|isnt|wasnt|im|ive|youre|thats|theyre|wouldnt|couldnt|shouldnt|havent|aint|whats|theres|wasnt|arent)\b/gi) ?? []).length;
    informal += (m.match(INFORMAL) ?? []).length;
    questions += ss.filter((s) => s.text.trim().endsWith('?')).length;
    asides += (m.match(/\([^()\n]{3,120}\)/g) ?? []).length;
    if (/^\s*(?:[-*+]|\d+[.)])\s/m.test(samples[texts.indexOf(t)] ?? '')) bulletSamples++;
    if (/^\W*(?:hi|hello|hey|dear|good (?:morning|afternoon|evening))\b/i.test(t)) greetSamples++;

    const first = toks.slice(0, 2).join(' ');
    const first1 = toks[0] ?? '';
    if (first1) opener.set(first1, (opener.get(first1) ?? 0) + 1);
    if (first.includes(' ')) opener.set(first, (opener.get(first) ?? 0) + 1);
    const last = toks.slice(-2).join(' ');
    if (last) ending.set(last, (ending.get(last) ?? 0) + 1);
    const lastSentence = ss.length ? ss[ss.length - 1].text.trim() : '';
    if (lastSentence && countWords(lastSentence) <= 4) ending.set(lastSentence.toLowerCase().replace(/[.!?]+$/, ''), (ending.get(lastSentence.toLowerCase().replace(/[.!?]+$/, '')) ?? 0) + 1);

    for (const tok of new Set(toks)) docFreq.set(tok, (docFreq.get(tok) ?? 0) + 1);
    const seen = new Set<string>();
    for (let i = 0; i + 1 < toks.length; i++) {
      seen.add(`${toks[i]} ${toks[i + 1]}`);
      if (i + 2 < toks.length) seen.add(`${toks[i]} ${toks[i + 1]} ${toks[i + 2]}`);
    }
    for (const p of seen) phraseFreq.set(p, (phraseFreq.get(p) ?? 0) + 1);
  }

  const n = texts.length;
  const mean = sWords.reduce((a, b) => a + b, 0) / Math.max(1, sWords.length);
  const sd = Math.sqrt(sWords.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, sWords.length));
  const punctuation: Record<string, number> = {};
  for (const [name] of PUNCT) punctuation[name] = round(per100(punctCount[name], wordsAll));
  const lowercaseStarts = round(lowerStarts / Math.max(1, sCount));
  const contractions = round(per100(apos, wordsAll));
  const bareContractions = round(per100(bare, wordsAll));
  const informalRate = round(per100(informal, wordsAll));
  const informality = Math.min(3, (lowercaseStarts > 0.5 ? 1 : 0) + (bareContractions > contractions && bareContractions > 0.5 ? 1 : 0) + (informalRate > 0.5 ? 1 : 0) + (contractions + bareContractions > 1.5 ? 0.5 : 0) | 0);
  const habits: VoiceHabits = {
    sentenceWords: round(mean, 1),
    sentenceSpread: round(mean ? sd / mean : 0),
    shortSentences: round(sWords.filter((x) => x <= 6).length / Math.max(1, sWords.length)),
    longSentences: round(sWords.filter((x) => x >= 30).length / Math.max(1, sWords.length)),
    lowercaseStarts,
    lowercaseI: round(per100(lowerI, wordsAll)),
    contractions,
    bareContractions,
    informal: informalRate,
    punctuation,
    questions: round(questions / Math.max(1, sCount)),
    asides: round(per100(asides, wordsAll)),
    informality,
  };

  const share = (c: number) => round(c / n);
  const minShare = Math.max(2, Math.ceil(n * 0.06));
  const openers = [...opener.entries()].filter(([, c]) => c >= minShare).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([text, c]) => ({ text, share: share(c) }));
  const endings = [...ending.entries()].filter(([, c]) => c >= minShare).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([text, c]) => ({ text, share: share(c) }));

  // Favourites: style words (small words, hedges, discourse markers, informal words) used in
  // far more of these samples than in other people's. Topic words are left out on purpose.
  const favourites = [...docFreq.entries()]
    .filter(([w, c]) => c >= minShare && STYLE_WORDS.has(w) && B.df[w] !== undefined)
    .map(([word, c]) => ({ word, ratio: round(c / n / Math.max(B.df[word], 0.002), 1) }))
    .filter((f) => f.ratio >= 1.5)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 16);
  const phrasings = [...phraseFreq.entries()]
    .filter(([p, c]) => c >= Math.max(3, Math.ceil(n * 0.04)) && p.split(' ').every((w) => STYLE_WORDS.has(w)) && p.split(' ').some((w) => !BORING.has(w)))
    .sort((a, b) => b[1] * b[0].split(' ').length - a[1] * a[0].split(' ').length)
    .filter(([p], i, all) => !all.slice(0, i).some(([q]) => q.includes(p)))
    .slice(0, 12)
    .map(([text, c]) => ({ text, share: share(c) }));

  // Never: things at least one in five ordinary texts has (by the baseline) that no sample has.
  const never: string[] = [];
  const rarely: string[] = [];
  const NEVER_KEYS = ['p:emdash', 'p:endash', 'p:semicolon', 'p:exclaim', 'p:emoji', 'p:dquote', 'p:paren', 'p:ellipsis', 'p:colon', 'p:caps-word', 'p:ampersand'];
  for (const k of NEVER_KEYS) {
    const i = VOICE_KEYS.indexOf(k);
    if ((B.nz[i] ?? 0) >= 0.05 && raws.every((r) => r[i] === 0)) never.push(labelFor(k));
    else if ((B.nz[i] ?? 0) >= 0.1 && raws.reduce((a, r) => a + r[i], 0) / raws.length <= 0.15 * B.mean[i]) rarely.push(labelFor(k));
  }
  if (!bulletSamples) never.push('bullet lists');
  if (!greetSamples) never.push('greetings such as "Hi" or "Hello"');
  if (habits.contractions === 0 && habits.bareContractions === 0) never.push('contractions');

  const summary = describe(habits, center, openers, endings, favourites, phrasings, never, rarely);
  const excerpts = pickExcerpts(texts, zs, center, options.excerpts ?? 6);

  return {
    format: 'tells-voice',
    version: 1,
    ...(options.name ? { name: options.name } : {}),
    createdAt: new Date().toISOString().slice(0, 10),
    samples: n,
    words,
    register: options.register ?? majorityRegister(texts),
    summary,
    habits,
    openers,
    endings,
    favourites,
    phrasings,
    never,
    excerpts,
    stats: { keys: VOICE_KEYS, center, spread },
  };
}

function majorityRegister(texts: string[]): Register {
  const c = new Map<Register, number>();
  for (const t of texts) {
    const r = guessRegister(t).register;
    c.set(r, (c.get(r) ?? 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function describe(
  h: VoiceHabits,
  center: number[],
  openers: VoiceProfile['openers'],
  endings: VoiceProfile['endings'],
  favourites: VoiceProfile['favourites'],
  phrasings: VoiceProfile['phrasings'],
  never: string[],
  rarely: string[],
): string[] {
  const out: string[] = [];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const len = h.sentenceWords < 11 ? 'short' : h.sentenceWords > 22 ? 'long' : 'medium-length';
  out.push(`Sentences are ${len}, about ${h.sentenceWords} words on average, ${h.sentenceSpread >= 0.6 ? 'and lengths jump around a lot' : h.sentenceSpread >= 0.45 ? 'with some variety' : 'and fairly even'} (${pct(h.shortSentences)} are six words or fewer, ${pct(h.longSentences)} are 30 or more).`);
  const level = ['formal', 'everyday', 'casual', 'chatty'][h.informality];
  out.push(`Tone is ${level}.${h.lowercaseStarts > 0.3 ? ` ${pct(h.lowercaseStarts)} of sentences start in lowercase.` : ''}${h.lowercaseI > 0.3 ? ' Often types "i" in lowercase.' : ''}`);
  if (h.bareContractions > 0.3 || h.contractions > 0.3) out.push(h.bareContractions > h.contractions ? `Uses contractions, usually without the apostrophe ("dont", "im", "thats"): about ${h.bareContractions} per 100 words.` : `Uses contractions with apostrophes, about ${h.contractions} per 100 words.`);
  else out.push('Rarely uses contractions.');
  if (h.informal > 0.3) out.push(`Uses informal words such as okay, kinda or yeah (about ${h.informal} per 100 words).`);
  if (h.questions >= 0.12) out.push(`Asks a lot of questions: ${pct(h.questions)} of sentences are questions, often reasoning out loud.`);
  if (h.asides > 0.3) out.push(`Uses bracketed asides (about ${h.asides} per 100 words).`);
  const p = h.punctuation;
  out.push(`Punctuation per 100 words: commas ${p.commas}, full stops ${p['full stops']}, question marks ${p['question marks']}, exclamation marks ${p['exclamation marks']}, colons ${p.colons}.`);

  // The most distinctive measures against ordinary writing.
  const ranked = VOICE_KEYS.map((k, i) => ({ k, z: center[i] }))
    .filter((x) => Math.abs(x.z) >= 0.6 && !x.k.startsWith('fw:'))
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, 6);
  if (ranked.length) out.push(`Compared with most people: ${ranked.map((x) => `${x.z > 0 ? 'more' : 'fewer'} ${labelFor(x.k)}`).join('; ')}.`);
  const fwRanked = VOICE_KEYS.map((k, i) => ({ k, z: center[i] })).filter((x) => x.k.startsWith('fw:') && Math.abs(x.z) >= 0.5).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const more = fwRanked.filter((x) => x.z > 0).slice(0, 8).map((x) => x.k.slice(3));
  const less = fwRanked.filter((x) => x.z < 0).slice(0, 6).map((x) => x.k.slice(3));
  if (more.length) out.push(`Leans on small words such as ${more.map((w) => `"${w}"`).join(', ')}${less.length ? `, and uses ${less.map((w) => `"${w}"`).join(', ')} less than most` : ''}.`);
  if (openers.length) out.push(`Often opens with: ${openers.slice(0, 5).map((o) => `"${o.text}" (${pct(o.share)})`).join(', ')}.`);
  if (endings.length) out.push(`Often ends with: ${endings.slice(0, 4).map((o) => `"${o.text}" (${pct(o.share)})`).join(', ')}.`);
  if (favourites.length) out.push(`Favourite words: ${favourites.slice(0, 10).map((f) => f.word).join(', ')}.`);
  if (phrasings.length) out.push(`Recurring phrasings: ${phrasings.slice(0, 8).map((f) => `"${f.text}"`).join(', ')}.`);
  if (never.length) out.push(`Never uses: ${never.join(', ')}.`);
  if (rarely.length) out.push(`Almost never uses: ${rarely.join(', ')}.`);
  return out;
}

function pickExcerpts(texts: string[], zs: number[][], center: number[], k: number): string[] {
  const dist = (z: number[]) => z.reduce((a, v, i) => a + Math.abs(v - center[i]), 0) / z.length;
  const cands = texts
    .map((t, i) => ({ t, d: dist(zs[i]), w: countWords(t) }))
    .filter((c) => c.w >= 25)
    // Longer samples show more of the voice, so they go first when they are about as typical.
    .sort((a, b) => a.d - (a.w >= 45 ? 0.15 : 0) - (b.d - (b.w >= 45 ? 0.15 : 0)));
  const out: string[] = [];
  const openers = new Set<string>();
  for (const c of cands) {
    if (out.length >= k) break;
    const o = tokensOf(c.t).slice(0, 2).join(' ');
    if (openers.has(o)) continue;
    openers.add(o);
    out.push(c.w <= 180 ? c.t : firstWords(c.t, 150));
  }
  return out;
}

/** The opening sentences of a text, up to about `max` words, cut at a sentence end. */
function firstWords(t: string, max: number): string {
  const ss = sentences(mask(t));
  let end = 0, w = 0;
  for (const s of ss) {
    if (w && w + s.words > max) break;
    w += s.words;
    end = s.end;
  }
  return t.slice(0, end || Math.min(t.length, 1000)).trim();
}

function keyWeights(voice: VoiceProfile, polish?: boolean): number[] {
  // Measures the writer is steady on count for more than ones that swing from sample to sample.
  return voice.stats.keys.map((k, i) => (polish && POLISH_KEYS.has(k) ? 0 : 1 / (0.3 + (voice.stats.spread[i] ?? 1))));
}

function distanceOf(z: number[], voice: VoiceProfile, weights: number[]): number {
  let sum = 0, wsum = 0;
  for (let i = 0; i < z.length; i++) {
    if (!weights[i]) continue;
    sum += weights[i] * Math.abs(z[i] - voice.stats.center[i]);
    wsum += weights[i];
  }
  return wsum ? sum / wsum : 0;
}

/** Distance from a text's voice vector (see voiceVector) to a voice, in standard units per measure. */
export function voiceDistance(z: number[], voice: VoiceProfile, options: MatchOptions = {}): number {
  return distanceOf(z, voice, keyWeights(voice, options.polish));
}

/**
 * How close a text is to a voice. The score is a percentile against the baseline: 90 means the
 * text sits closer to the voice than 90% of the ordinary human texts tells was tested on.
 * Short texts are noisy: under about 60 words, read it loosely.
 */
export function styleMatch(text: string, voice: VoiceProfile, options: MatchOptions = {}): StyleMatch {
  checkVoice(voice);
  const z = voiceVector(text);
  const w = keyWeights(voice, options.polish);
  const d = distanceOf(z, voice, w);
  const further = B.refs.filter((r) => distanceOf(r, voice, w) > d).length;
  const furthest = voice.stats.keys
    .map((key, i) => ({ key, i, gap: w[i] ? Math.abs(z[i] - voice.stats.center[i]) : 0 }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 5)
    .map(({ key, i }) => ({ key, label: labelFor(key), text: round(z[i]), voice: voice.stats.center[i] }));
  return { score: Math.round((further / B.refs.length) * 100), distance: round(d, 3), words: countWords(mask(text)), furthest };
}

/** Throws when `v` is not a voice profile this version can use. */
export function checkVoice(v: unknown): asserts v is VoiceProfile {
  const p = v as VoiceProfile;
  if (!p || typeof p !== 'object' || p.format !== 'tells-voice' || p.version !== 1) throw new Error('Not a tells voice profile (format "tells-voice", version 1).');
  if (!p.stats || !Array.isArray(p.stats.keys) || p.stats.keys.length !== VOICE_KEYS.length || p.stats.keys.some((k, i) => k !== VOICE_KEYS[i])) {
    throw new Error('This voice profile was built by a different version of tells. Build it again from the samples.');
  }
  if (!Array.isArray(p.stats.center) || p.stats.center.length !== VOICE_KEYS.length || p.stats.center.some((x) => typeof x !== 'number' || !Number.isFinite(x))) throw new Error('The voice profile has bad stats.');
  if (!Array.isArray(p.summary) || p.summary.some((s) => typeof s !== 'string')) throw new Error('The voice profile has no summary.');
  if (!Array.isArray(p.excerpts) || p.excerpts.some((s) => typeof s !== 'string')) throw new Error('The voice profile has bad excerpts.');
}

/** A short form of the voice for prompts, capped so a large profile cannot blow up a request. */
export function voicePrompt(voice: VoiceProfile, maxChars = 6000, polish = false): { habits: string; excerpts: string[] } {
  // Polished output keeps standard casing and apostrophes, so the lines about them would only mislead.
  const lines = polish ? voice.summary.filter((l) => !/lowercase|apostrophe/i.test(l)) : voice.summary;
  const habits = lines.join('\n').slice(0, 2500);
  const excerpts: string[] = [];
  let used = habits.length;
  for (const e of voice.excerpts) {
    const cut = e.slice(0, 1200);
    if (used + cut.length > maxChars) break;
    excerpts.push(cut);
    used += cut.length;
  }
  return { habits, excerpts };
}

export const VOICE_BASELINE_SIZE = B.refs.length;
