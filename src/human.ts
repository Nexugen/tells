import { countWords, mask, paragraphs, sentences } from './text.ts';
import type { Hit, Register, RuleContext } from './types.ts';
import PROFILES from './profiles.json' with { type: 'json' };

/**
 * Human signals: patterns that show up far more in people's writing than in model output.
 * Tells are things to remove. Signals are things a text has or lacks. A missing signal is
 * not an error, just a hint, and it depends on the register: a changelog has no reason to
 * say "I tried".
 */
export interface HumanSignal {
  id: string;
  name: string;
  description: string;
  why: string;
  /** How to add it without making things up. */
  add: string;
  example: string;
  detect: (ctx: RuleContext) => Hit[];
}

export interface SignalPresence {
  id: string;
  name: string;
  count: number;
  /** A few matched snippets, for display. */
  examples: string[];
  spans: Hit[];
}

export interface MissingSignal {
  id: string;
  name: string;
  /** Share of human samples in this register that have the signal (0 to 1). */
  humanShare: number;
  /** Share of model samples in this register that have it. */
  modelShare: number;
  add: string;
  message: string;
}

export interface HumanReport {
  register: Register;
  present: SignalPresence[];
  missing: MissingSignal[];
  tooShort: boolean;
  /** The human-pattern score (see score.ts), or null when the text is too short or the score is off. Set by lint(). */
  pattern?: import('./score.ts').HumanScore | null;
  words: number;
}

interface Profile {
  version: number;
  samples: { human: Record<string, number>; model: Record<string, number> };
  registers: Record<string, Record<string, { human: number; model: number }>>;
}

export const SIGNAL_PROFILES = PROFILES as Profile;

const A = `['’]`;

function scan(re: RegExp, text: string, offset = 0): Hit[] {
  const out: Hit[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!m[0]) {
      re.lastIndex++;
      continue;
    }
    out.push({ start: offset + m.index, end: offset + m.index + m[0].length });
  }
  return out;
}

const lens = (ctx: RuleContext) => ctx.sentences.map((s) => s.words);

function cv(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return mean ? sd / mean : 0;
}

const FIRST_HAND_VERBS =
  'tried|went|found|shipped|saw|ran|got|made|built|wrote|broke|fixed|spent|took|had|did|lost|noticed|thought|learned|switched|moved|tested|used|asked|told|bought|paid|missed|forgot|hit|wanted|needed|started|stopped|kept|left|heard|checked|realized|realised|figured|ended up|gave up|picked|chose|decided|rewrote|deleted|added|dropped|measured|counted|met|called|spoke|talked';

export const SIGNALS: HumanSignal[] = [
  {
    id: 'specific-number',
    name: 'Specific numbers',
    description: 'Exact figures, times, prices, sizes or counts: 14:05, $6,500, 8%, 3 to 5 days, 750 ml.',
    why: 'People who were there remember the number. Generated text rounds everything into "significant" and "many".',
    add: 'Use a number that is already in your notes or the source. If one would help and you do not have it, leave a placeholder like [number].',
    example: 'About 8% of checkout requests failed between 14:05 and 14:47 UTC.',
    detect: (ctx) => scan(/(?<![\p{L}\d])(?:[$£€₦]\s?)?\d[\d,]*(?:[.:]\d+)?(?:\s?(?:%|ms|s|kb|mb|gb|px|ml|km|kg|am|pm|utc|x))?(?![\p{L}\d])/giu, ctx.masked),
  },
  {
    id: 'named-thing',
    name: 'Names',
    description: 'Names of people, products, places, tools or files inside a sentence.',
    why: 'Real writing is about particular things. Model writing stays at the level of "your team" and "the platform".',
    add: 'Name the tool, place, person or file you mean. If the name is not in the source, use a placeholder like [name].',
    example: 'We moved the queue from Redis to Postgres in March.',
    detect: (ctx) => {
      const out: Hit[] = [];
      for (const s of ctx.sentences) {
        const re = /(?<=[\s(“"'])(?:\p{Lu}[\p{L}\p{N}]*(?:[.-]\p{L}[\p{L}\p{N}]*)*|[\p{Ll}]+\p{Lu}[\p{L}]*)/gu;
        for (const h of scan(re, s.text, s.start)) {
          const w = ctx.text.slice(h.start, h.end);
          if (w === 'I' || /^(?:I['’]\w+|OK|Hi|Hello|Dear|Thanks|Yes|No|The|A|An)$/.test(w)) continue;
          out.push(h);
        }
      }
      return out;
    },
  },
  {
    id: 'time-anchor',
    name: 'Dates and times',
    description: 'A day, date or time something happened: on Tuesday, last March, in 2019, this morning, Nov 3.',
    why: 'Anchoring a claim in time shows it actually happened to someone.',
    add: 'Say when it happened, if you know. Otherwise leave it out rather than guessing.',
    example: 'We shipped the fix on Tuesday, about an hour after the first report.',
    detect: (ctx) =>
      scan(
        /\b(?:on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:last|this|next) (?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday|spring|summer|autumn|fall|winter|morning|night|quarter)|yesterday|this morning|tonight|in (?:19|20)\d\d|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?|\d{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|(?:19|20)\d\d-\d\d-\d\d|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
        ctx.masked,
      ),
  },
  {
    id: 'first-hand',
    name: 'First-hand detail',
    description: 'The writer reports something they did or saw: "I tried", "we shipped", "I noticed".',
    why: 'A person who did the thing writes from inside it. Models default to describing things from outside.',
    add: 'If you did it, say what you did. Do not claim experience you do not have; leave [what you tried] instead.',
    example: 'I tried the XLSX export instead and every row was there.',
    detect: (ctx) => scan(new RegExp(`\\b(?:I|we|We)(?:${A}ve|${A}d)?\\s+(?:just\\s+|finally\\s+|also\\s+|actually\\s+|first\\s+|then\\s+|never\\s+|once\\s+)?(?:${FIRST_HAND_VERBS})\\b`, 'g'), ctx.masked),
  },
  {
    id: 'stake',
    name: 'An opinion with a stake',
    description: 'The writer takes a side or says what they would do: "I think", "I prefer", "my guess is", "we chose X because".',
    why: 'People commit. Generated text balances every view and decides nothing.',
    add: 'Say what you think or what you chose, and why, if that is true for you.',
    example: 'I would pick Postgres here. One less thing to run.',
    detect: (ctx) =>
      scan(
        new RegExp(
          `\\b(?:I think|I don${A}t think|I${A}d (?:pick|go|say|use|recommend|rather|avoid|start)|I would (?:pick|go|say|use|recommend|rather|avoid|start)|I prefer|I like|I love|I hate|I wouldn${A}t|my guess|in my experience|personally|we chose|we decided|we picked|I recommend|I${A}d recommend|honestly I|to be fair|I${A}m not sure|I suspect|I doubt|I bet)\\b`,
          'gi',
        ),
        ctx.masked,
      ),
  },
  {
    id: 'aside',
    name: 'Asides and self-correction',
    description: 'A parenthetical, an afterthought or a correction mid-thought: "(modulo compiler bugs, of course)", "or rather", "well,", "at least".',
    why: 'People think while they write and it shows. Generated prose arrives finished.',
    add: 'Keep the asides you would actually make. Do not add one for show.',
    example: 'It works on every browser (except Safari, of course).',
    detect: (ctx) => [
      ...scan(/\((?=[^)]*\p{L})[^()\n]{3,120}\)/gu, ctx.masked).filter((h) => !/^\((?:e\.g\.|i\.e\.|see |optional|default|required)/i.test(ctx.text.slice(h.start, h.end))),
      ...scan(new RegExp(`\\b(?:or rather|I mean|well,|actually,|at least|to be honest|mind you|that said|of course|anyway|though\\.|for what it${A}s worth|if I remember|I think|sort of|kind of|more or less)`, 'gi'), ctx.masked),
    ],
  },
  {
    id: 'contraction',
    name: 'Contractions',
    description: "Everyday contractions: it's, don't, we're, can't, you'll.",
    why: 'Most people write the way they talk. Fully expanded forms in casual text read as stiff or generated.',
    add: 'Use contractions where you would say them, in casual and marketing writing especially.',
    example: "It's fixed. You don't need to do anything.",
    detect: (ctx) => scan(new RegExp(`\\b\\p{L}+(?:${A}(?:s|t|re|ll|ve|d|m))\\b`, 'giu'), ctx.masked).filter((h) => /n['’]t|['’](?:re|ll|ve|m|d)$|^(?:it|that|there|here|what|who|he|she|let)['’]s$/i.test(ctx.text.slice(h.start, h.end))),
  },
  {
    id: 'plain-verb',
    name: 'Plain verbs',
    description: 'Short everyday verbs doing the work: get, put, run, fix, break, ship, send, pay, cut, try.',
    why: 'People say "fix" and "use". Generated text says "address" and "utilize".',
    add: 'Swap inflated verbs (utilize, facilitate, enhance, ensure) for the plain one.',
    example: 'Run the script, then send me the log.',
    detect: (ctx) => scan(/\b(?:get|gets|got|put|puts|run|runs|ran|fix|fixes|fixed|break|breaks|broke|ship|ships|shipped|send|sends|sent|pay|pays|paid|cut|cuts|try|tries|tried|grab|pick|picked|drop|dropped|keep|kept|hit|move|moved|check|checked|pull|pulled|push|pushed|set|sets)\b/gi, ctx.masked),
  },
  {
    id: 'real-question',
    name: 'A real question',
    description: 'A question the writer actually wants answered, or one left open, and not answered in the next breath.',
    why: 'People ask because they want to know. Models ask so they can answer.',
    add: 'If you are unsure of something the reader knows, ask it plainly.',
    example: 'Did the import finish on your side, or is it still running?',
    detect: (ctx) => {
      const out: Hit[] = [];
      const ss = ctx.sentences;
      for (let i = 0; i < ss.length; i++) {
        const s = ss[i];
        if (!s.text.endsWith('?') || s.words < 4) continue;
        const next = ss[i + 1]?.text ?? '';
        if (/^(?:because|simple|easy|the answer|here['’]s|well,|turns out)/i.test(next)) continue;
        out.push({ start: s.start, end: s.end });
      }
      return out;
    },
  },
  {
    id: 'bursty-rhythm',
    name: 'Uneven rhythm',
    description: 'Sentence lengths that jump around: a long one, then a short one.',
    why: 'Human sentence length varies a lot more than model sentence length. It is one of the strongest statistical differences.',
    add: 'Split one long sentence, or let one sentence be three words.',
    example: 'It failed. The migration had run for six hours, because the index rebuild was single-threaded and nobody had checked. Then it failed again. We gave up and restored from the snapshot taken at midnight.',
    detect: (ctx) => {
      const l = lens(ctx);
      if (l.length < 4 || cv(l) < 0.5) return [];
      // Point at the shortest sentence, which is usually what makes the rhythm uneven.
      const s = ctx.sentences.reduce((a, b) => (b.words < a.words ? b : a));
      return [{ start: s.start, end: s.end }];
    },
  },
  {
    id: 'uneven-paragraphs',
    name: 'Uneven paragraphs',
    description: 'Paragraphs of clearly different sizes, including a one-liner among longer ones.',
    why: 'People give a point the space it needs. Generated text gives every point the same three sentences.',
    add: 'Let a paragraph be one line when that is all it needs.',
    example: 'We spent Tuesday chasing the leak. Memory climbed by about 40 MB an hour on every worker, and restarting only bought us a few hours, so we bisected the last ten deploys until one stood out.\n\nIt was the image cache.\n\nNobody had set a size limit on it, because when we wrote it the largest customer had fifty products, and now the largest has nine thousand.',
    detect: (ctx) => {
      const ps = ctx.paragraphs.filter((p) => !p.heading && !/^\s*(?:[-*+]|\d+[.)])\s/.test(p.text));
      if (ps.length < 3 || cv(ps.map((p) => p.words)) < 0.45) return [];
      const p = ps.reduce((a, b) => (b.words < a.words ? b : a));
      return [{ start: p.start, end: p.end }];
    },
  },
  {
    id: 'concrete-first',
    name: 'Concrete opening',
    description: 'The first sentence carries a specific: a number, a name, a time or something the writer did.',
    why: 'People start with the thing. Models start with context and work toward it.',
    add: 'Move the most specific sentence to the top.',
    example: 'Order 4471 was charged twice. The second charge is refunded.',
    detect: (ctx) => {
      const first = ctx.sentences.find((s) => !/^\W*(?:hi|hello|hey|dear)\b[^.!?]{0,30}$/i.test(s.text));
      if (!first) return [];
      const sub: RuleContext = { ...ctx, sentences: [first] };
      const has = ['specific-number', 'named-thing', 'time-anchor', 'first-hand']
        .map((id) => SIGNALS.find((x) => x.id === id)!)
        .some((sig) => sig.detect(sub).some((h) => h.start >= first.start && h.end <= first.end));
      return has ? [{ start: first.start, end: first.end }] : [];
    },
  },
];

/** Every text-level weight is the human share minus the model share in the profile, floored at zero. */

export function detectSignals(ctx: RuleContext): SignalPresence[] {
  const out: SignalPresence[] = [];
  for (const sig of SIGNALS) {
    const spans = sig.detect(ctx);
    if (!spans.length) continue;
    out.push({
      id: sig.id,
      name: sig.name,
      count: spans.length,
      spans,
      examples: spans.slice(0, 3).map((h) => ctx.text.slice(h.start, h.end).replace(/\s+/g, ' ').slice(0, 60)),
    });
  }
  return out;
}

const REGISTER_WORDS: Record<Register, string> = {
  casual: 'casual writing',
  professional: 'professional writing',
  technical: 'technical writing',
  marketing: 'marketing writing',
};

/** Texts shorter than this get no missing-signal advice. */
export const MIN_WORDS = 60;

export function humanReport(ctx: RuleContext): HumanReport {
  const present = detectSignals(ctx);
  const have = new Set(present.map((p) => p.id));
  const words = countWords(ctx.masked);
  const missing: MissingSignal[] = [];
  for (const sig of SIGNALS) {
    const p = SIGNAL_PROFILES.registers[ctx.register]?.[sig.id];
    if (!p) continue;
    if (have.has(sig.id)) continue;
    // Only call a signal missing when people in this register usually have it, the text is
    // long enough to expect it, and people use it clearly more than models do.
    if (p.human >= 0.5 && p.human - p.model >= 0.15 && words >= 40) {
      missing.push({
        id: sig.id,
        name: sig.name,
        humanShare: p.human,
        modelShare: p.model,
        add: sig.add,
        message: `${cap(REGISTER_WORDS[ctx.register])} by people usually has this (${pct(p.human)} of human samples, ${pct(p.model)} of model samples). This text has none.`,
      });
    }
  }
  // Under this many words the shares say little about one text, so the report says so instead of scoring.
  const tooShort = words < MIN_WORDS;
  return { register: ctx.register, present, missing: tooShort ? [] : missing, tooShort, words };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Build the context the detectors need, for callers outside lint(). */
export function signalContext(text: string, register: Register = 'professional', plain = false): RuleContext {
  const masked = mask(text, plain);
  const paras = paragraphs(masked);
  return { text, masked, paragraphs: paras, sentences: sentences(masked, paras), register };
}

export function getSignal(id: string): HumanSignal | undefined {
  return SIGNALS.find((s) => s.id === id);
}
