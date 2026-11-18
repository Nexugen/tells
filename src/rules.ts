import type { Hit, Rule, RuleContext, Sentence } from './types.ts';
import { regexHits } from './rules-util.ts';
import { MORE_RULES } from './rules-more.ts';

const A = `['’]`; // straight or curly apostrophe

/** Build a case-insensitive, whole-word pattern from a list of phrases. */
function phrases(list: string[], opts: { start?: boolean } = {}): RegExp {
  const body = list
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, A).replace(/ /g, '\\s+'))
    .join('|');
  const lead = opts.start ? `(?<=(?:^|[\\n.!?])\\s*(?:(?:[-*+>]|#{1,6})\\s+)?)` : '\\b';
  return new RegExp(`${lead}(?:${body})(?![\\p{L}\\p{N}])`, 'giu');
}


function inSentences(ctx: RuleContext, re: RegExp, filter?: (s: Sentence) => boolean): Hit[] {
  const out: Hit[] = [];
  for (const s of ctx.sentences) {
    if (filter && !filter(s)) continue;
    for (const h of regexHits(re, s.text)) out.push({ start: s.start + h.start, end: s.start + h.end });
  }
  return out;
}

// --- word lists -------------------------------------------------------------------------

/** Words that turn up far more often in model output than in people's writing. */
export const AI_VOCABULARY = [
  'delve', 'delves', 'delved', 'delving',
  'seamless', 'seamlessly',
  'robust',
  'leverage', 'leverages', 'leveraging', 'leveraged',
  'unlock', 'unlocks', 'unlocking',
  'empower', 'empowers', 'empowering',
  'elevate', 'elevates', 'elevating',
  'supercharge', 'supercharges', 'supercharged',
  'streamline', 'streamlines', 'streamlined', 'streamlining',
  'game changer', 'game-changer', 'game changing', 'game-changing',
  'revolutionize', 'revolutionizes', 'revolutionise', 'revolutionizing',
  'cutting-edge', 'cutting edge', 'next-level', 'state-of-the-art', 'best-in-class', 'world-class',
  'effortless', 'effortlessly',
  'tapestry', 'testament', 'realm',
  'pivotal', 'crucial', 'paramount',

  'navigate the', 'navigating the', 'navigate complex', 'navigate the complexities',
  'embark', 'embarks', 'embarking',
  'fosters', 'fostering',
  'harness the', 'harness its', 'harness your', 'harnessing the',
  'holistic', 'synergy', 'synergies', 'paradigm',
  'multifaceted', 'intricate', 'intricacies',
  'meticulous', 'meticulously',
  'bustling', 'vibrant',
  'showcase', 'showcases', 'showcasing',
  'underscore', 'underscores', 'underscoring',
  'boasts', 'nestled',
  'myriad', 'a plethora of', 'plethora',
  'ever-evolving', 'ever-changing', 'fast-paced',
  'transformative', 'unparalleled', 'groundbreaking',
  'in the realm of', 'a deep dive', 'deep dive into',
  'actionable insights', 'key takeaways', 'unleash', 'unleashes',
];

const HYPE = [
  'insane', 'insanely', 'mind-blowing', 'mind blowing', 'mindblowing',
  'jaw-dropping', 'next level', 'the most powerful', 'incredibly powerful',
  'revolutionary', 'unbelievable', 'unbelievably', 'feels magical', 'magical experience', 'like magic', 'the magic of',
  'blew my mind', 'changes everything', 'a whole new level', 'on another level',
];

const INTENSIFIERS = [
  'genuinely', 'truly', 'deeply', 'incredibly', 'remarkably', 'profoundly',
  'quietly changing', 'quietly reshaping', 'quietly becoming', 'quietly transforming',
  'just works', 'simply put', 'absolutely essential',
];

const FILLER_TRANSITIONS = [
  "it's worth noting", 'it is worth noting', 'worth noting that', 'it is important to note',
  "it's important to note", 'it should be noted', 'notably,', 'importantly,', 'ultimately,',
  'additionally,', 'furthermore,', 'moreover,', 'in conclusion', 'in summary', 'to summarize',
  'at the end of the day', 'when it comes to', 'in essence', 'needless to say',
  'that being said', 'with that said', 'all in all', 'it goes without saying',
];

const STOCK_HOOKS = [
  'hot take', 'unpopular opinion', "let's dive in", 'let’s dive in', "let's dive into", 'dive into',
  'buckle up', "here's why", 'here is why', 'a thread', "i'll be honest", 'i will be honest',
  'honestly?', "here's what i learned", 'here is what i learned', 'without further ado',
  'read that again', 'let that sink in', "you won't believe", 'you will not believe',
  'stop scrolling', "here's the deal", 'spoiler alert',
];

const SETUP_REVEAL = [
  "here's the thing", 'here is the thing', 'the kicker', 'the best part?', 'the result?',
  'the catch?', 'the twist?', 'plot twist', 'turns out', 'guess what', 'the secret?',
  'the answer?', 'the truth is', 'the reality is', 'the problem?', 'the difference?',
  'the real reason?', 'here’s the kicker', "here's the kicker", 'the punchline',
];

const SYCOPHANTIC_OPENERS = [
  'great question', 'what a great question', 'excellent question', 'good question',
  'absolutely!', 'certainly!', 'of course!', 'sure thing!', 'sure!',
  "i'd be happy to", 'i would be happy to', "i'd be glad to", 'happy to help!',
  'i hope this email finds you well', 'i hope this message finds you well', 'i hope you are doing well',
  "i hope you're doing well", 'thanks for reaching out', 'thank you for reaching out',
  'been there', 'love this', 'so true', "you're absolutely right", 'you are absolutely right',
  'what a fantastic', 'what an amazing', 'great point', 'i love this question',
];

const CHATBOT_CLOSERS = [
  'i hope this helps', 'hope this helps', 'hope that helps', 'let me know if you have any questions',
  'let me know if you have any other questions', 'feel free to reach out', 'feel free to ask',
  "don't hesitate to", 'do not hesitate to', 'happy to help', 'happy coding', 'happy building',
  'let me know if you need anything else', 'let me know if you would like', 'let me know if you’d like',
  "let me know if you'd like", 'i hope you find this helpful', 'is there anything else',
];

const SWEEPING_OPENERS = [
  "in today's fast-paced world", "in today's world", "in today's digital", 'in today’s',
  "in today's", 'in an era of', 'in an era where', 'in a world where', 'imagine a world',
  'ai is changing everything', 'ai is changing the way', 'ai is transforming', 'ai is reshaping',
  'we all know', "let's face it", 'let’s face it', 'the world is changing', 'now more than ever',
  'most founders get this wrong', 'most people get this wrong', 'everyone is talking about',
  'as we all know', 'it is no secret', "it's no secret", 'since the dawn of',
];

const SLOGAN_ENDINGS = [
  "that's the future of", 'that is the future of', 'the future is here', 'the future is now',
  'let that sink in', 'build different', 'think about that', 'the rest is history',
  'and that makes all the difference', "and that's the point", "that's the power of",
  'that is the power of', 'welcome to the future', 'the choice is yours', 'the possibilities are endless',
  'and that changes everything', "and that's a wrap", 'game on', 'stay tuned',
  "and honestly? that's", 'onward', 'the journey continues', 'this is just the beginning',
  "we're just getting started", 'we are just getting started', 'the sky is the limit',
  "that's the difference between", 'that is the difference between', "that's what it's all about",
  "that's what matters", 'and that matters', "that's the kind of", 'and that is the point', 'more on that soon',
  "can't wait to see what", 'cannot wait to see what', 'excited to see what', 'we look forward to seeing what',
];

const CORPORATE_EXCITEMENT = [
  'we are excited to announce', "we're excited to announce", 'we are thrilled', "we're thrilled",
  'we are delighted', "we're delighted", 'proud to announce', 'excited to share', 'thrilled to share',
  'thrilled to announce', 'delighted to announce', 'we are pleased to announce', "we're pleased to announce",
  'thrilled to introduce', 'excited to introduce',
];

const ASSISTANT_LEAKS = [
  'as an ai language model', 'as an ai model', 'as a large language model', 'as an ai,',
  'i cannot browse', "i don't have access to real-time", 'my knowledge cutoff', 'my training data',
  'here is a revised version', "here's a revised version", 'here is the revised', "here's the revised",
  'here is a draft', "here's a draft", 'here is a rewritten', "here's a rewritten", 'certainly! here',
  'sure! here', 'here is an improved version', "here's an improved version", 'i have rewritten',
  "i've rewritten", 'below is a', 'below is the',
];

const HEDGES = [
  'may', 'might', 'could', 'potentially', 'perhaps', 'possibly', 'arguably', 'somewhat',
  'generally', 'typically', 'likely', 'it seems', 'it appears', 'to some extent', 'in some cases',
  'tends to', 'relatively', 'fairly', 'kind of', 'sort of', 'probably', 'presumably', 'conceivably',
];

const LECTURE_STARTS = [
  'you need to', 'you should', 'you must', 'stop doing', 'stop using', "don't make this mistake",
  'here’s what you need to know', "here's what you need to know", 'you have to', 'never ever',
];

const CROWD = [
  'hey everyone', 'hi everyone', 'hello everyone', 'dear builders', 'dear founders', 'fellow founders',
  'fellow builders', 'fellow developers', 'hey founders', 'hey builders', 'calling all',
  'founders,', 'builders,', 'creators,', 'friends,', 'folks,',
];

const SIGNPOSTING = [
  'in this article', 'in this post', 'in this guide', 'in this blog post', 'in this section',
  "in this article, we'll", "let's explore", 'let’s explore', "let's take a look", 'let’s take a look',
  "let's break it down", 'let’s break it down', "let's unpack", 'let’s unpack', "here's a breakdown",
  'here is a breakdown', "here's a quick overview", 'here is an overview', 'read on to learn', 'read on for',
];

const VAGUE_ATTRIBUTION = [
  'studies show', 'studies have shown', 'research shows', 'research suggests', 'experts say',
  'experts agree', 'many believe', 'some say', 'it is widely believed', 'it is often said',
  'according to experts', 'data shows', 'science says',
];

const TAGLINES = [
  'say goodbye to', 'say hello to', 'meet your new', 'reimagined', 're-imagined',
  'the future of', 'built for the way you', 'designed for the way you', 'made simple',
  'the only tool you need', 'all in one place', 'at your fingertips', 'the way it should be',
  'like never before', 'the power of', 'take it to the next level', 'level up your',
  'your one-stop', 'one-stop shop', 'look no further', "you'll actually want to", "you'll actually use", "you didn't know you needed",
];

const EXPLAINER_STARTS = [
  'this section', 'this page', 'here you can', 'below you will find', "below you'll find",
  'use this to', 'use this page to', 'manage your', 'view and manage', 'keep track of',
  'this is where you', 'here you will find', "here you'll find", 'easily manage', 'quickly find',
];

// --- heuristics -------------------------------------------------------------------------

function staccato(ctx: RuleContext): Hit[] {
  const out: Hit[] = [];
  const ss = ctx.sentences;
  let i = 0;
  while (i < ss.length) {
    let j = i;
    while (j < ss.length && ss[j].words <= 3 && /[.!]$/.test(ss[j].text) && sameParagraph(ctx, ss[i], ss[j])) j++;
    if (j - i >= 3) {
      out.push({ start: ss[i].start, end: ss[j - 1].end });
      i = j;
    } else {
      // Two or more fragments in a row that open with the same word ("No code. No team.")
      if (ss[i].text.trim().endsWith('?')) {
        i++;
        continue;
      }
      let k = i;
      const first = firstWord(ss[i].text);
      const weak = new Set(['the', 'a', 'an', 'it', 'i', 'we', 'this', 'that', 'they', 'you', 'he', 'she']);
      while (k + 1 < ss.length && ss[k + 1].words <= 3 && ss[k].words <= 3 && !ss[k + 1].text.trim().endsWith('?') && first && !weak.has(first) && firstWord(ss[k + 1].text) === first && sameParagraph(ctx, ss[i], ss[k + 1])) k++;
      if (k > i) {
        out.push({ start: ss[i].start, end: ss[k].end });
        i = k + 1;
      } else i++;
    }
  }
  return out;
}

function firstWord(s: string): string {
  return (s.match(/[\p{L}']+/u)?.[0] ?? '').toLowerCase();
}

function sameParagraph(ctx: RuleContext, a: Sentence, b: Sentence): boolean {
  return ctx.paragraphs.some((p) => a.start >= p.start && b.end <= p.end);
}

function hedgeStack(ctx: RuleContext): Hit[] {
  const re = new RegExp(`\\b(?:${HEDGES.map((h) => h.replace(/ /g, '\\s+')).join('|')})\\b`, 'gi');
  const out: Hit[] = [];
  for (const s of ctx.sentences) {
    const hits = regexHits(re, s.text);
    const gapWords = (a: Hit, b: Hit) => (s.text.slice(a.end, b.start).match(/\S+/g) ?? []).length;
    const stacked = hits.some((h, i) => i > 0 && gapWords(hits[i - 1], h) <= 2);
    if ((stacked && hits.length >= 2) || (hits.length >= 3 && hits.length / Math.max(s.words, 1) >= 0.1)) {
      out.push({ start: s.start + hits[0].start, end: s.start + hits[hits.length - 1].end, detail: `${hits.length} hedges` });
    }
  }
  return out;
}

function uniformRhythm(ctx: RuleContext): Hit[] {
  const prose = ctx.sentences.filter((s) => s.words >= 3);
  const out: Hit[] = [];
  // Slide a window of six sentences; flag a run where lengths barely change.
  const W = 6;
  for (let i = 0; i + W <= prose.length; i++) {
    const win = prose.slice(i, i + W);
    const lens = win.map((s) => s.words);
    const mean = lens.reduce((a, b) => a + b, 0) / W;
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / W);
    if (mean >= 7 && sd / mean < 0.18) {
      out.push({ start: win[0].start, end: win[W - 1].end, detail: `six sentences of about ${Math.round(mean)} words` });
      i += W - 1;
    }
  }
  return out;
}

function staticParagraphs(ctx: RuleContext): Hit[] {
  const ps = ctx.paragraphs.filter((p) => !p.heading && p.words >= 25);
  if (ps.length < 4) return [];
  const lens = ps.map((p) => p.words);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
  if (sd / mean < 0.12) return [{ start: ps[0].start, end: ps[0].start + Math.min(ps[0].text.length, 60), detail: `${ps.length} paragraphs of about ${Math.round(mean)} words` }];
  return [];
}

function staticTriads(ctx: RuleContext): Hit[] {
  // "faster, cheaper, and better": three one- or two-word items in a row, often adjectives.
  const re = /(?<!, )(?<![\p{L}-])([\p{L}-]+), ([\p{L}-]+),? (?:and|&) ([\p{L}-]+)(?=[.!?,;:]|$)/gu;
  const out: Hit[] = [];
  for (const s of ctx.sentences) {
    for (const h of regexHits(re, s.text)) {
      const span = s.text.slice(h.start, h.end);
      const items = span.split(/,\s*|\s+(?:and|&)\s+/).filter(Boolean);
      // Skip lists of proper nouns or numbers; the tell is abstract qualities.
      if (items.some((x) => /^[A-Z0-9]/.test(x.trim()))) continue;
      if (items.length !== 3) continue;
      out.push({ start: s.start + h.start, end: s.start + h.end });
    }
  }
  // Three sentences in a row built the same way ("We build. We ship. We learn.") are caught by staccato.
  return out;
}

const TO_READER = /\b(?:you|your|you're|you've|you'd|you'll|yours|ya|u)\b/i;
const PLEASANTRY = /^(?:hope|thanks|thank|cheers|let me know|talk soon|see you|see ya|anyway|lol|haha|take care|miss you|love|xx|best|bye|ok|okay|sure|great|cool|nice|congrats)\b/i;
const STOP = new Set(['that', 'this', 'what', 'when', 'where', 'which', 'with', 'have', 'been', 'does', 'they', 'there', 'their', 'from', 'about', 'just', 'really', 'going', 'into', 'than', 'then', 'them', 'were', 'will', "what's", "it's", "that's"]);

function exclamations(ctx: RuleContext): Hit[] {
  const hits = regexHits(/(?<=[\p{L}\p{N})])!+(?=\s|$|["'”’)])/gu, ctx.masked);
  if (!hits.length) return [];
  const words = Math.max(1, ctx.paragraphs.reduce((a, p) => a + p.words, 0));
  const doubled = hits.filter((h) => h.end - h.start > 1);
  // One or two in a message is how people write. Flag a doubled "!!" anywhere, and a habit
  // of them: how many it takes depends on the register.
  const limit = { casual: 3, professional: 2, marketing: 2, technical: 1 }[ctx.register];
  const dense = hits.length >= limit && (ctx.register !== 'casual' || hits.length / words >= 1 / 30);
  return dense ? hits : doubled;
}

function rhetoricalQA(ctx: RuleContext): Hit[] {
  const out: Hit[] = [];
  const ss = ctx.sentences;
  for (let i = 0; i + 1 < ss.length; i++) {
    const q = ss[i];
    const a = ss[i + 1];
    if (!q.text.endsWith('?') || q.words > 9 || !sameParagraph(ctx, q, a)) continue;
    const qt = q.text.replace(/^\W+/, '').replace(/’/g, "'");
    const at = a.text.replace(/^\W+/, '').replace(/’/g, "'");
    // "No signal? No problem." A two- or three-word question answered by a fragment that echoes it.
    const qWords = new Set(qt.toLowerCase().match(/[a-z']+/g) ?? []);
    const echoes = (at.toLowerCase().match(/[a-z']+/g) ?? []).some((w) => qWords.has(w)) || /^(?:no|zero|none|nope|not)\b/i.test(at);
    const snap = q.words <= 3 && a.words <= 3 && /[.!]$/.test(a.text) && echoes && !PLEASANTRY.test(at);
    if (snap) {
      out.push({ start: q.start, end: a.end });
      continue;
    }
    // A question asked of the reader is a real question, and casual writing asks plenty of them.
    if (ctx.register === 'casual' || TO_READER.test(qt)) continue;
    const staged = /^(?:why|what|how|so what|the result|the answer|the catch|the problem|the best part|want to know|ever wonder(?:ed)?)\b/i.test(qt);
    if (!staged) continue;
    const answer = /^(?:because|simple|easy|it's simple|the answer|here's|short answer|well,|turns out|it turns out|that's where|enter\b)/i.test(at);
    // The short follow-up only counts when it answers: it restates a word from the question.
    const content = (w: string) => w.length >= 4 && !STOP.has(w);
    const restates = (at.toLowerCase().match(/[a-z']+/g) ?? []).filter(content).some((w) => qWords.has(w));
    if (answer || (a.words <= 4 && restates && !PLEASANTRY.test(at))) out.push({ start: q.start, end: a.end });
  }
  return out;
}

function sweepingOpener(ctx: RuleContext): Hit[] {
  const re = phrases(SWEEPING_OPENERS);
  for (const s of ctx.sentences.filter((x) => !/^\s*#/.test(x.text)).slice(0, 2)) {
    const m = regexHits(re, s.text)[0];
    if (m && m.start <= 3) return [{ start: s.start + m.start, end: s.start + m.end }];
  }
  return [];
}

function sloganEnding(ctx: RuleContext): Hit[] {
  const prose = ctx.sentences.filter((s) => !/^\s*#/.test(s.text) && !/^\s*(?:#\w+\s*)+$/.test(s.text));
  const last = prose[prose.length - 1];
  if (!last) return [];
  const hits: Hit[] = [];
  // Look at the closing few sentences: a moral often sits just above a sign-off.
  for (const s of prose.slice(-3)) for (const h of regexHits(phrases(SLOGAN_ENDINGS), s.text)) hits.push({ start: s.start + h.start, end: s.start + h.end });
  // A short closing line that names "the future" or a grand abstraction reads as a moral.
  if (!hits.length && last.words <= 9 && prose.length >= 3 && /\b(?:future|revolution|everything|movement|journey|possible|the point)\b/i.test(last.text)) {
    hits.push({ start: last.start, end: last.end });
  }
  return hits;
}

function sycophanticOpener(ctx: RuleContext): Hit[] {
  // Skip a greeting line such as "Hi Sam," and look at what comes after it.
  const greeting = /^\W*(?:hi|hello|hey|dear|good (?:morning|afternoon|evening))\b[^.!?\n]{0,30}[,!]?\s*$/i;
  const first = ctx.sentences.find((s) => !greeting.test(s.text));
  if (!first) return [];
  const re = phrases(SYCOPHANTIC_OPENERS);
  const m = regexHits(re, first.text)[0];
  if (m && m.start <= 6) return [{ start: first.start + m.start, end: first.start + m.end }];
  return [];
}

function lecturing(ctx: RuleContext): Hit[] {
  const re = new RegExp(`^\\W*(?:${LECTURE_STARTS.map((p) => p.replace(/'/g, A).replace(/ /g, '\\s+')).join('|')})\\b`, 'i');
  const out: Hit[] = [];
  for (const s of ctx.sentences) {
    const m = s.text.match(re);
    if (m) out.push({ start: s.start, end: s.start + m[0].length });
  }
  return out;
}

function explainer(ctx: RuleContext): Hit[] {
  const re = new RegExp(`^\\W*(?:${EXPLAINER_STARTS.map((p) => p.replace(/'/g, A).replace(/ /g, '\\s+')).join('|')})\\b`, 'i');
  const out: Hit[] = [];
  const ps = ctx.paragraphs;
  for (let i = 0; i + 1 < ps.length; i++) {
    if (!ps[i].heading || ps[i + 1].heading) continue;
    const next = ps[i + 1];
    if (next.words > 30) continue;
    const m = next.text.trimStart().match(re);
    if (m) {
      const lead = next.text.length - next.text.trimStart().length;
      out.push({ start: next.start + lead, end: next.end });
    }
  }
  return out;
}

function titleCaseHeading(ctx: RuleContext): Hit[] {
  const small = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by', 'vs', 'is', 'as', 'from']);
  const out: Hit[] = [];
  for (const p of ctx.paragraphs) {
    if (!p.heading) continue;
    const title = p.text.replace(/^\s*#{1,6}\s+/, '');
    const words = title.match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
    const content = words.slice(1).filter((w) => !small.has(w.toLowerCase()));
    if (content.length < 3) continue;
    // All later content words capitalised, and not all-caps acronyms.
    if (content.every((w) => /^\p{Lu}\p{Ll}/u.test(w))) {
      const at = p.start + p.text.indexOf(title);
      out.push({ start: at, end: at + title.length });
    }
  }
  return out;
}

// --- the rules --------------------------------------------------------------------------

const BASE_RULES: Rule[] = [
  {
    id: 'dash',
    name: 'Em or en dash',
    category: 'punctuation',
    severity: 'info',
    registers: { marketing: 'info' },
    description: 'An em dash (—), an en dash (–), or a double hyphen used as a dash.',
    why: 'Models reach for the em dash constantly, and readers have noticed. Most people type a comma, a colon or a full stop.',
    fix: 'Write the punctuation the dash stood in for: a comma for an aside, a colon before an explanation, or a full stop and a new sentence. Do not just swap in a hyphen.',
    example: {
      before: 'The deploy finished — but the cache was still stale.',
      after: 'The deploy finished, but the cache was still stale.',
    },
    detect: { kind: 'pattern', pattern: /\s?[—–]\s?|\s--\s/g },
  },
  {
    id: 'not-x-but-y',
    name: '"Not X, it\'s Y"',
    category: 'structure',
    severity: 'error',
    registers: { casual: 'info', professional: 'info' },
    description: '"It\'s not X, it\'s Y", "This isn\'t just X. It\'s Y.", "not just X, but Y", "Less X, more Y".',
    why: 'The contrast frame is the most recognised model habit there is. It invents a claim nobody made so it can knock it down.',
    fix: 'Say the concrete thing directly, and drop the thing it supposedly is not.',
    example: {
      before: "It's not a demo. It's the product.",
      after: 'Every screen in the video is from the live app.',
    },
    detect: {
      kind: 'heuristic',
      summary: 'Contrast frames across one or two sentences: "(it|this|that) (is|was)n\'t (just) X[,.;] (it|this|that)\'s Y", "not just X, but Y", "less X, more Y".',
      run: (ctx) => {
        const a = A;
        const neg = `(?:it${a}s not|it is not|this is not|that${a}s not|that is not|it isn${a}t|this isn${a}t|that isn${a}t|it wasn${a}t|this wasn${a}t|it was not|this was not|they${a}re not|they aren${a}t|it${a}s no longer|this is no longer)`;
        const turn = `(?:it${a}s|it is|it was|this is|this was|that${a}s|that is|that was|they${a}re|they are|they were|we${a}re|it${a}s about|it${a}s a|it${a}s the)`;
        const res = [
          new RegExp(`\\b${neg}\\s+(?:just|only|merely|simply|about|really)?\\s*(?:[^\\s.!?;:,]+\\s*){1,6}?(?:[,;:]|[.!?]\\s+|\\s*[—–]\\s*|\\s+--?\\s+)\\s*${turn}\\b`, 'gi'),
          /\bnot (?:just|merely) (?:about )?[^,.!?;\n]{1,50}, but (?:also )?/gi,
          /(?:^|[.!?]\s+)less [\p{L}-]+(?: [\p{L}-]+)?, more [\p{L}-]+/giu,
          /\b(?:isn|wasn|aren)['’]t about [^.!?\n]{1,50}[.,;] (?:it['’]s|it is) about\b/gi,
        ];
        const out: Hit[] = [];
        for (const re of res) for (const h of inSentenceWindows(ctx, re)) {
          if (!out.some((o) => h.start < o.end && o.start < h.end)) out.push(h);
        }
        return out;
      },
    },
  },
  {
    id: 'setup-reveal',
    name: 'Setup and reveal',
    category: 'structure',
    severity: 'warning',
    description: '"Here\'s the thing:", "The kicker?", "The best part?", "Plot twist:", "Turns out..."',
    why: 'A drumroll before the point. People who know the point just say it.',
    fix: 'Delete the setup and start the sentence with the point.',
    example: {
      before: "Here's the thing: most of the bugs were in one file.",
      after: 'Most of the bugs were in one file.',
    },
    detect: { kind: 'pattern', pattern: phrases(SETUP_REVEAL) },
  },
  {
    id: 'rhetorical-qa',
    name: 'Staged question',
    category: 'structure',
    severity: 'warning',
    registers: { professional: 'info', technical: 'info', marketing: 'warning' },
    description: 'A short rhetorical question answered straight away ("Why does this matter? Because...", "No signal? No problem.").',
    why: 'Real questions are asked because the writer wants to know. A question the writer answers in the next breath is a format, not a thought.',
    fix: 'State the answer as a plain sentence.',
    example: {
      before: 'Why does this matter? Because retries double-charge cards.',
      after: 'Retries were double-charging cards.',
    },
    detect: { kind: 'heuristic', summary: 'A question of nine words or fewer that opens with why/what/how/the result..., followed by "Because", "Simple", "Here\'s" or a fragment.', run: rhetoricalQA },
  },
  {
    id: 'staccato',
    name: 'Staccato fragments',
    category: 'rhythm',
    severity: 'warning',
    description: 'Three or more very short sentences in a row, or fragments that repeat the same opening ("No code. No team. No problem.").',
    why: 'Drama by punctuation. It reads like an ad voice-over, and models use it to fake emphasis.',
    fix: 'Join the fragments into one sentence that says what actually happened.',
    example: {
      before: 'No code. No team. No problem.',
      after: 'She built the booking flow herself over a weekend.',
    },
    detect: { kind: 'heuristic', summary: 'Three or more sentences of three words or fewer in one paragraph, or two or more fragments of four words or fewer starting with the same word.', run: staccato },
  },
  {
    id: 'triad',
    name: 'List of three',
    category: 'structure',
    severity: 'info',
    description: 'Three one-word items in a row ("faster, cheaper, and better").',
    why: 'Models default to threes because they sound complete. One real reason is usually stronger than three vague ones.',
    fix: 'Keep the one item that matters, or give two, or four. Make each one specific.',
    example: {
      before: 'The new flow is faster, simpler, and smarter.',
      after: 'Checkout now takes two taps instead of five.',
    },
    detect: { kind: 'heuristic', summary: 'Three lower-case one-word items joined by commas and "and".', run: staticTriads },
  },
  {
    id: 'sweeping-opener',
    name: 'Sweeping opener',
    category: 'structure',
    severity: 'warning',
    description: 'Opening with a claim about the whole world ("In today\'s fast-paced world", "AI is changing everything").',
    why: 'It delays the point and could open any post ever written. Readers skip it, and so the rest gets skipped too.',
    fix: 'Open with the specific thing that happened.',
    example: {
      before: "In today's fast-paced world, teams need to ship quickly.",
      after: 'We shipped the fix at 2am, about twenty minutes after the first report.',
    },
    detect: { kind: 'heuristic', summary: 'The first sentence starts with a stock world-claim phrase.', run: sweepingOpener },
  },
  {
    id: 'slogan-ending',
    name: 'Moral or slogan ending',
    category: 'structure',
    severity: 'warning',
    description: 'Ending on a moral, summary or slogan ("That\'s the future of building.", "Let that sink in.").',
    why: 'The reader already got it. A closing slogan is the line most likely to be AI, and the easiest to cut.',
    fix: 'Delete the last line. End on the fact or a small honest reaction.',
    example: {
      before: 'It booked twelve seats before lunch. That\'s the future of travel.',
      after: 'It booked twelve seats before lunch. Still a bit wild to me.',
    },
    detect: { kind: 'heuristic', summary: 'The last sentence contains a stock closing phrase, or is a short line about "the future", "everything" or "the journey".', run: sloganEnding },
  },
  {
    id: 'sycophantic-opener',
    name: 'Sycophantic or stock opener',
    category: 'tone',
    severity: 'error',
    description: '"Great question!", "Absolutely!", "I\'d be happy to help", "I hope this email finds you well", "Been there".',
    why: 'This is the assistant voice. Nobody opens a reply to a colleague by praising the question.',
    fix: 'Start with the answer.',
    example: {
      before: 'Great question! The timeout is set in the client config.',
      after: 'The timeout is set in the client config.',
    },
    detect: { kind: 'heuristic', summary: 'The first sentence opens with a stock pleasantry.', run: sycophanticOpener },
  },
  {
    id: 'chatbot-closer',
    name: 'Chatbot closer',
    category: 'tone',
    severity: 'warning',
    description: '"I hope this helps!", "Let me know if you have any questions", "Feel free to reach out".',
    why: 'An offer nobody asked for, written the same way every time. People end when they are done.',
    fix: 'Cut it. If a follow-up is really needed, ask the one specific question.',
    example: {
      before: 'Set the header and redeploy. Hope this helps! Let me know if you have any questions.',
      after: 'Set the header and redeploy.',
    },
    detect: { kind: 'pattern', pattern: phrases(CHATBOT_CLOSERS) },
  },
  {
    id: 'assistant-leak',
    name: 'Assistant leak',
    category: 'tone',
    severity: 'error',
    description: 'Text that shows a model wrote it ("As an AI language model", "Here is a revised version").',
    why: 'It is the clearest possible tell, and it usually means a prompt or a preamble got pasted along with the answer.',
    fix: 'Delete the line and keep only the content.',
    example: {
      before: "Here's a revised version of your email: Hi Sam, the invoice is attached.",
      after: 'Hi Sam, the invoice is attached.',
    },
    detect: { kind: 'pattern', pattern: phrases(ASSISTANT_LEAKS) },
  },
  {
    id: 'ai-vocabulary',
    name: 'AI vocabulary',
    category: 'vocabulary',
    severity: 'warning',
    registers: { technical: 'info', marketing: 'info' },
    description: 'Words that show up far more in model output than in people\'s writing: delve, seamless, robust, leverage, unlock, tapestry, crucial, landscape...',
    why: 'Each one is fine on its own. Together they are the signature of generated text, and most of them are vague.',
    fix: 'Use the plain word, or better, the specific fact the word was covering for.',
    example: {
      before: 'We leverage a robust pipeline to seamlessly sync your data.',
      after: 'Your data syncs every five minutes, and a failed sync retries on its own.',
    },
    detect: { kind: 'pattern', pattern: phrases(AI_VOCABULARY) },
  },
  {
    id: 'hype',
    name: 'Hype',
    category: 'vocabulary',
    severity: 'info',
    registers: { marketing: 'warning' },
    description: 'Superlatives and hype ("insane", "mind-blowing", "revolutionary", "changes everything").',
    why: 'Hype tells the reader how to feel instead of showing them why. It also reads as a sales voice.',
    fix: 'Replace the adjective with the detail that impressed you.',
    example: {
      before: 'The results were insane.',
      after: 'Load time went from 4.1 seconds to 900 milliseconds.',
    },
    detect: { kind: 'pattern', pattern: phrases(HYPE) },
  },
  {
    id: 'intensifier',
    name: 'Empty intensifier',
    category: 'vocabulary',
    severity: 'info',
    description: '"genuinely", "truly", "deeply", "incredibly", "quietly changing", "just works".',
    why: 'These words promise sincerity or weight without adding any. Models sprinkle them everywhere.',
    fix: 'Delete the word. If the sentence goes flat, it needed a fact, not an adverb.',
    example: {
      before: 'This is a truly useful feature.',
      after: 'This saved me about an hour on Friday.',
    },
    detect: { kind: 'pattern', pattern: phrases(INTENSIFIERS) },
  },
  {
    id: 'filler-transition',
    name: 'Filler transition',
    category: 'vocabulary',
    severity: 'info',
    registers: { marketing: 'info' },
    description: '"It\'s worth noting", "Notably,", "Additionally,", "Furthermore,", "Ultimately,", "In conclusion", "When it comes to".',
    why: 'Essay glue. It announces that a point is coming instead of making it.',
    fix: 'Delete the transition and let the sentence start with its subject.',
    example: {
      before: "It's worth noting that the API is rate limited.",
      after: 'The API allows 60 requests a minute.',
    },
    detect: { kind: 'pattern', pattern: phrases(FILLER_TRANSITIONS) },
  },
  {
    id: 'stock-hook',
    name: 'Stock hook',
    category: 'tone',
    severity: 'warning',
    registers: { technical: 'info' },
    description: '"Hot take", "Unpopular opinion", "Let\'s dive in", "Buckle up", "Here\'s why", "A thread", "I\'ll be honest".',
    why: 'Borrowed social-media formats. They signal that a template is running, not a person.',
    fix: 'Cut the hook and lead with the moment or the fact.',
    example: {
      before: "Unpopular opinion: most bugs are config bugs. Here's why.",
      after: 'Four of the five outages last month were a wrong environment variable.',
    },
    detect: { kind: 'pattern', pattern: phrases(STOCK_HOOKS) },
  },
  {
    id: 'hedge-stack',
    name: 'Stacked hedges',
    category: 'tone',
    severity: 'info',
    description: 'Two or more hedges in one sentence ("may potentially", "could perhaps", "generally tends to").',
    why: 'One small hedge is honest. A pile of them is a model covering itself, and the sentence ends up saying nothing.',
    fix: 'Keep at most one hedge, and only if you really are unsure.',
    example: {
      before: 'This may potentially cause some issues in certain cases.',
      after: 'This breaks uploads over 10 MB.',
    },
    detect: { kind: 'heuristic', summary: 'At least two hedge words (may, might, could, potentially, perhaps, possibly, arguably, generally, typically, likely, it seems...) in one sentence.', run: hedgeStack },
  },
  {
    id: 'corporate-excitement',
    name: 'Announcement voice',
    category: 'tone',
    severity: 'info',
    registers: { technical: 'info' },
    description: '"We\'re excited to announce", "thrilled to share", "proud to announce".',
    why: 'Every launch post says it, so it says nothing. The news is the thing you shipped.',
    fix: 'Start with what changed and who it helps.',
    example: {
      before: "We're excited to announce dark mode!",
      after: 'Dark mode is out. It follows your system setting, or you can pick one in Settings.',
    },
    detect: { kind: 'pattern', pattern: phrases(CORPORATE_EXCITEMENT) },
  },
  {
    id: 'whether-youre',
    name: '"Whether you\'re a X or a Y"',
    category: 'structure',
    severity: 'warning',
    description: '"Whether you\'re a beginner or a pro", "from startups to enterprises".',
    why: 'It addresses everyone, so it speaks to no one. It is filler that models add to sound inclusive.',
    fix: 'Name the one reader this is for, or cut the clause.',
    example: {
      before: "Whether you're a beginner or a seasoned pro, this guide has you covered.",
      after: 'This guide assumes you have deployed a Node app before.',
    },
    detect: { kind: 'pattern', pattern: /\bwhether (?:you['’]re|you are) (?:a |an )?[^,.!?\n]{1,40} or (?:a |an )?[^,.!?\n]{1,40}|\bfrom (?:startups|beginners|small businesses|solo creators|individuals|freelancers) to (?:enterprises|experts|large enterprises|pros|global brands|fortune 500)/gi },
  },
  {
    id: 'lecturing',
    name: 'Lecturing the reader',
    category: 'tone',
    severity: 'info',
    registers: { technical: 'off' },
    description: 'Sentences that open by telling the reader what they must do ("You need to...", "Stop doing X").',
    why: 'Sharing what happened lets the reader draw the lesson. Telling them what to do reads as a thought-leader post.',
    fix: 'Say what you did and what happened. Keep instructions for actual instructions.',
    example: {
      before: 'You need to stop shipping without tests.',
      after: 'We shipped without tests twice in March, and both times a refund bug got out.',
    },
    detect: { kind: 'heuristic', summary: 'A sentence that starts with "You need to", "You should", "You must", "Stop doing"...', run: lecturing },
  },
  {
    id: 'crowd-address',
    name: 'Addressing a crowd',
    category: 'tone',
    severity: 'info',
    description: '"Hey everyone", "Founders,", "Fellow builders".',
    why: 'Good writing talks to one person. Addressing a crowd sounds like a newsletter template.',
    fix: 'Drop the salutation and write to one reader.',
    example: {
      before: 'Founders, listen up: your onboarding is too long.',
      after: 'Our onboarding had nine steps. We cut it to three.',
    },
    detect: { kind: 'pattern', pattern: phrases(CROWD, { start: true }) },
  },
  {
    id: 'signposting',
    name: 'Signposting',
    category: 'structure',
    severity: 'info',
    description: '"In this article, we\'ll explore", "Let\'s break it down", "Here\'s a quick overview".',
    why: 'It describes the text instead of being the text.',
    fix: 'Cut it and start with the first real point.',
    example: {
      before: "In this article, we'll explore how caching works.",
      after: 'The cache keeps each page for five minutes.',
    },
    detect: { kind: 'pattern', pattern: phrases(SIGNPOSTING) },
  },
  {
    id: 'vague-attribution',
    name: 'Vague attribution',
    category: 'tone',
    severity: 'info',
    description: '"Studies show", "Experts say", "Research suggests", with no source.',
    why: 'Unsourced authority is a common model habit and a common way to make things up.',
    fix: 'Name the study or person, or say it as your own observation.',
    example: {
      before: 'Studies show that users prefer dark mode.',
      after: 'About 60 percent of our users switched dark mode on in the first week.',
    },
    detect: { kind: 'pattern', pattern: phrases(VAGUE_ATTRIBUTION) },
  },
  {
    id: 'tagline',
    name: 'Tagline phrase',
    category: 'tone',
    severity: 'info',
    registers: { marketing: 'warning' },
    description: '"Say goodbye to", "X, reimagined", "at your fingertips", "the future of X", "level up your".',
    why: 'Slogans fail the scroll test: they could sit under any product. Specific claims do not.',
    fix: 'Replace the slogan with one specific thing the product does.',
    example: {
      before: 'Say goodbye to messy spreadsheets.',
      after: 'Stock counts update when a sale goes through, so nobody re-counts the shelf on Friday.',
    },
    detect: { kind: 'pattern', pattern: phrases(TAGLINES) },
  },
  {
    id: 'explainer',
    name: 'Explainer under a heading',
    category: 'format',
    severity: 'info',
    description: 'A short sentence under a heading that only restates it ("Manage your orders", "This section shows...").',
    why: 'Read once, ignored for ever. Generated pages put one under every heading.',
    fix: 'Delete it unless it carries a number, a date, a format or a consequence the reader needs.',
    example: {
      before: '## Orders\nView and manage all your orders in one place.',
      after: '## Orders\nOrders older than 90 days move to the archive.',
    },
    detect: { kind: 'heuristic', summary: 'A paragraph of 30 words or fewer right after a markdown heading that opens with "This section", "Here you can", "Manage your", "View and manage"...', run: explainer },
  },
  {
    id: 'exclamation',
    name: 'Exclamation mark',
    category: 'punctuation',
    severity: 'info',
    registers: { casual: 'info', marketing: 'warning' },
    description: 'Exclamation marks used as a habit: "!!", or more than the register usually has (three in a short casual message, two in an email or on a landing page, any in technical prose).',
    why: 'One "Congrats!" is normal. Generated copy uses them on every line to fake enthusiasm.',
    fix: 'Use a full stop. If the sentence needs the exclamation to land, it needs a better detail.',
    example: {
      before: 'Your export is ready! Download it now!',
      after: 'Your export is ready. It is under Settings, then Exports.',
    },
    detect: { kind: 'heuristic', summary: 'A doubled "!!", or at least 3 (casual, and 1 per 30 words), 2 (professional, marketing) or 1 (technical) exclamation marks.', run: exclamations },
  },
  {
    id: 'emoji',
    name: 'Emoji',
    category: 'punctuation',
    severity: 'info',
    registers: { technical: 'warning', professional: 'warning', marketing: 'warning' },
    description: 'Emoji in prose, especially as bullet markers or headings (🚀 ✅ 💡 🔥).',
    why: 'Emoji bullets are a hallmark of generated posts and READMEs.',
    fix: 'Remove it. Use words or plain list markers.',
    example: {
      before: '🚀 Faster builds',
      after: 'Builds take about half as long.',
    },
    detect: { kind: 'pattern', pattern: /\p{Extended_Pictographic}\uFE0F?/gu },
  },
  {
    id: 'hashtag',
    name: 'Hashtags',
    category: 'format',
    severity: 'warning',
    registers: { technical: 'info' },
    description: 'Hashtags in a post or message (#Startup #AI).',
    why: 'A block of hashtags at the end of a post is a template habit. Generated social posts almost always add one.',
    fix: 'Delete them. If a tag really helps people find the post, keep one and put it in the sentence.',
    example: {
      before: 'We hired our first data engineer. #Hiring #DataEngineering #Startup',
      after: 'We hired our first data engineer.',
    },
    detect: { kind: 'pattern', pattern: /(?<=^|[\s(])#[\p{L}][\p{L}\p{N}_]*/gmu },
  },
  {
    id: 'semicolon',
    name: 'Semicolon for rhythm',
    category: 'punctuation',
    severity: 'info',
    registers: { technical: 'off', professional: 'off' },
    description: 'A semicolon in casual or marketing prose.',
    why: 'In short-form writing a semicolon usually joins two clauses for rhythm, a model habit. People write two sentences.',
    fix: 'Split into two sentences, or use a comma and "and".',
    example: {
      before: 'The build passed; the deploy did not.',
      after: 'The build passed. The deploy did not.',
    },
    detect: { kind: 'pattern', pattern: /(?<=\p{L})\s?;(?=\s+\p{L})/gu },
  },
  {
    id: 'scare-quotes',
    name: 'Scare quotes',
    category: 'punctuation',
    severity: 'info',
    description: 'Quotation marks around one ordinary word for emphasis ("smart" defaults).',
    why: 'Quotes for emphasis read as sarcasm or as a model hedging a word it is not sure of.',
    fix: 'Drop the quotes, or use the more exact word.',
    example: {
      before: 'It ships with "smart" defaults.',
      after: 'It ships with defaults that match your framework.',
    },
    detect: { kind: 'pattern', pattern: /(?<=\s)["“][a-z][a-z-]{2,20}["”](?=[\s,.;:])/g },
  },
  {
    id: 'bold-mid-sentence',
    name: 'Bold phrase mid-sentence',
    category: 'format',
    severity: 'info',
    registers: { technical: 'off' },
    description: 'A **bold phrase** inside a running sentence.',
    why: 'Generated posts bold key phrases to look skimmable. In a short text it just shouts.',
    fix: 'Remove the bold. If the phrase matters, put it first in the sentence.',
    example: {
      before: 'Pilot fixed it in **under two minutes** without a redeploy.',
      after: 'Pilot fixed it in under two minutes without a redeploy.',
    },
    detect: { kind: 'pattern', pattern: /(?<=[\p{L},] )\*\*[^*\n]{2,60}\*\*(?= ?[\p{L},.])/gu },
  },
  {
    id: 'title-case-heading',
    name: 'Title Case heading',
    category: 'format',
    severity: 'info',
    description: 'A markdown heading with every word capitalised.',
    why: 'Generated documents default to Title Case. Sentence case reads like a person wrote it.',
    fix: 'Use sentence case: capitalise the first word and names only.',
    example: {
      before: '## How To Deploy Your App Safely',
      after: '## How to deploy your app safely',
    },
    detect: { kind: 'heuristic', summary: 'A heading whose content words after the first are all capitalised (three or more of them).', run: titleCaseHeading },
  },
  {
    id: 'uniform-rhythm',
    name: 'Uniform rhythm',
    category: 'rhythm',
    severity: 'info',
    description: 'Six sentences in a row of almost the same length, or paragraphs that are all the same size.',
    why: 'People write a long sentence, then a short one. Even rhythm across a whole passage is a strong statistical sign of generated text.',
    fix: 'Break one sentence up, merge two others, and let at least one sentence be very short.',
    example: {
      before: 'The team reviewed the incident on Monday morning. They found the root cause in the cache layer. The fix was deployed to production that afternoon. Monitoring showed the errors dropped right away. Customers stopped reporting the issue by evening. The postmortem was shared with everyone on Tuesday.',
      after: 'We found it Monday: a cache key that ignored the tenant. Fixed by lunch. Errors were flat by evening, and the write-up went out on Tuesday with the one-line diff that caused it.',
    },
    detect: {
      kind: 'heuristic',
      summary: 'Coefficient of variation under 0.18 across six consecutive sentences averaging 8+ words, or under 0.12 across four or more paragraphs of 25+ words.',
      run: (ctx) => [...uniformRhythm(ctx), ...staticParagraphs(ctx)],
    },
  },
];

export const RULES: Rule[] = [...BASE_RULES, ...MORE_RULES];

/** Run a regex across each sentence and the boundary with the next one (for two-sentence frames). */
function inSentenceWindows(ctx: RuleContext, re: RegExp): Hit[] {
  const out: Hit[] = [];
  const ss = ctx.sentences;
  for (let i = 0; i < ss.length; i++) {
    const end = i + 1 < ss.length && sameParagraph(ctx, ss[i], ss[i + 1]) ? ss[i + 1].end : ss[i].end;
    const chunk = ctx.masked.slice(ss[i].start, end);
    for (const h of regexHits(re, chunk)) {
      // Only count frames that start inside this sentence, so a frame is not reported twice.
      if (h.start >= ss[i].end - ss[i].start) continue;
      const lead = chunk.slice(h.start, h.end).search(/\S/);
      out.push({ start: ss[i].start + h.start + Math.max(lead, 0), end: ss[i].start + h.end });
    }
  }
  return out;
}

export function getRule(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id);
}

export { regexHits };
