import { regexHits } from './rules-util.ts';
import type { Hit, Rule, RuleContext } from './types.ts';

/**
 * Rules for the default voice of a chat assistant answering an everyday question: the
 * reassuring setup, "Here are some key steps", First, Second, Finally, and the upbeat moral at
 * the end. Added after a reader's report (19 Nov 2026) that a stock "how to move abroad" answer
 * got one hint. Each of these is a habit people have too, so the corroboration gate still decides.
 */

const A = `['’]`;
const lower = (s: string) => s.replace(/'/g, A);

const HARD = '(?:overwhelming|daunting|intimidating|stressful|confusing|nerve-wracking|tricky|challenging|scary|frustrating|difficult|tough|hard|a challenge|a daunting task|a big step|a big decision|a lot to handle|an exciting journey|an exciting adventure|exciting)';

function reassuranceFrame(ctx: RuleContext): Hit[] {
  const can = new RegExp(`\\b(?:can|may|might|often|sometimes) (?:feel|seem|be|sound|get)(?: like)? (?:a bit |a little |quite |really |incredibly |pretty |very |so |somewhat )?${HARD}\\b`, 'i');
  const turn = new RegExp(`\\b(?:but|however|yet)\\b[^.!?]{0,80}?(?:it doesn${A}t have to be|with the right|with a (?:little|bit of|few)|with some|by following|by breaking|a few (?:simple|key|practical|smart)|a little (?:preparation|planning|practice|effort)|goes a long way|(?:it${A}s|it is) (?:definitely |totally |entirely |absolutely )?(?:possible|doable|manageable)|isn${A}t always easy|is not always easy|there are (?:several|many|a few|some) (?:ways|steps|things|strategies))|\\bdoesn${A}t have to be\\b`, 'i');
  const hits: Hit[] = [];
  for (const s of ctx.sentences.slice(0, 4)) {
    if (can.test(s.text) && turn.test(s.text)) hits.push({ start: s.start, end: s.end });
    else if (/^\W*navigating\b[^.!?]{0,80}\bcan (?:be|feel|seem)\b/i.test(s.text)) hits.push({ start: s.start, end: s.end });
  }
  return hits.slice(0, 1);
}

// A count alone ("Here are 10 things") is how people introduce a list too; the vague quantity or the stock adjective is the habit.
const ADJ = `(?:key|practical|simple|essential|helpful|effective|proven|useful|important|great|easy|actionable|quick|top|main|basic|general|core|crucial|smart|expert)`;
const NOUN = `(?:steps|tips|ways|strategies|things|ideas|reasons|tricks|considerations|factors|suggestions|benefits|pointers|guidelines|recommendations|options|questions to ask)`;
const LISTICLE = new RegExp(
  `\\b(?:here are|below are|here${A}s|consider these|try these|follow these)` +
    `(?:(?: some| a few| several| a couple of)(?: ${ADJ}(?:,? (?:and )?${ADJ})*)?|(?: the| my| \\d+| two| three| four| five| six| seven| eight| nine| ten)? ${ADJ}(?:,? (?:and )?${ADJ})*) ${NOUN}\\b`,
  'giu',
);
const BREAKDOWN = new RegExp(`\\bhere${A}s (?:a |an )?(?:quick |simple |step-by-step |brief |short )?(?:breakdown|overview|rundown|step-by-step guide|guide to|quick guide|roadmap)\\b`, 'giu');

const THERE_ARE = new RegExp(`\\b(?:the good news is(?: that)? )?there are (?:several|many|a few|some|a number of|plenty of) (?:simple |practical |effective |proven |easy |key |smart )?(?:ways|steps|strategies|things you can do|tips|options|methods|approaches) (?:to|you can|that can|that will)\\b|\\bthe good news is(?: that)?\\b`, 'giu');

function listicleIntro(ctx: RuleContext): Hit[] {
  return [...regexHits(LISTICLE, ctx.masked), ...regexHits(BREAKDOWN, ctx.masked), ...regexHits(THERE_ARE, ctx.masked)].slice(0, 2);
}

function ordinalSequence(ctx: RuleContext): Hit[] {
  const first = /^\W*(?:first(?:ly)?|to start|to begin(?: with)?|start by|begin by|the first step is)\b,?/i;
  const middle = /^\W*(?:second(?:ly)?|third(?:ly)?|next|then|after that|additionally|also|another (?:key |important |helpful )?(?:step|tip|thing|strategy)|once you(?:'|’)ve|it(?:'|’)s also (?:important|a good idea|helpful))\b,?/i;
  const last = /^\W*(?:finally|lastly|last but not least|last of all|most importantly)\b,?/i;
  const ss = ctx.sentences;
  const i = ss.findIndex((s) => first.test(s.text));
  if (i < 0) return [];
  const rest = ss.slice(i + 1);
  const mids = rest.filter((s) => middle.test(s.text));
  const end = rest.find((s) => last.test(s.text));
  // "First ... Finally" with a step between, or three steps marked in a row without the "Finally".
  if (!(end && mids.length) && mids.length < 2) return [];
  const hit = (s: { start: number; text: string }, re: RegExp) => ({ start: s.start + s.text.search(/\S/), end: s.start + (s.text.match(re)?.[0].length ?? 5) });
  return [hit(ss[i], first), ...mids.slice(0, 2).map((s) => hit(s, middle)), ...(end ? [hit(end, last)] : [])];
}

const UPBEAT_CLOSE = [
  'exciting and rewarding', 'rewarding and exciting', 'a rewarding experience', 'a rewarding journey', 'an exciting journey', 'an exciting adventure', 'an exciting new chapter',
  'with an open mind', 'and an open mind', 'every journey begins with', 'a journey of a thousand miles', "rome wasn't built in a day", 'the key is to', 'the key is consistency',
  'progress, not perfection', 'small steps add up', 'be patient with yourself', 'be kind to yourself', 'trust the process', 'you\'ve got this', 'you got this', 'enjoy the journey', 'enjoy the process',
  'embrace the journey', 'embrace the adventure', 'embrace the process', 'you\'ll be well on your way', 'you will be well on your way', 'well on your way to', 'set yourself up for success',
  'make the most of', 'the most important thing is', 'don\'t be afraid to', 'it\'s all about', 'the possibilities are', 'can make all the difference', 'goes a long way',
  'i encourage you to', 'give it a try', 'you might be surprised', 'you may be surprised', 'here\'s to', 'new beginnings', 'the exciting challenges ahead', 'the fruits of your labor',
  'happy gardening', 'happy cooking', 'happy travels', 'happy coding', 'happy reading', 'happy baking', 'happy writing', 'happy learning', 'good luck!', 'best of luck',
  'every little bit counts', 'every step counts', 'on your way to', 'with confidence', 'ready to take on the day', 'learn and grow', 'opportunity to learn and grow',
  'with patience and', 'with consistency and', 'with a little patience', 'stay positive', 'keep going', 'it will be worth it', 'it\'ll be worth it',
];

function upbeatClose(ctx: RuleContext): Hit[] {
  const prose = ctx.sentences.filter((s) => !/^\s*#/.test(s.text));
  if (prose.length < 4) return [];
  const tail = prose.slice(-2);
  const re = new RegExp(`\\b(?:${UPBEAT_CLOSE.map((p) => lower(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).replace(/ /g, '\\s+')).join('|')})`, 'i');
  const opener = /^\W*(?:remember|ultimately|in the end|at the end of the day|above all|most importantly|overall|in summary|by (?:making|following|taking|using) (?:these|this)|whatever you (?:choose|decide)|no matter (?:what|how|where|which))\b,?/i;
  const hits: Hit[] = [];
  for (const s of tail) {
    const m = s.text.match(opener) ?? s.text.match(re);
    if (m) hits.push({ start: s.start, end: s.end });
  }
  return hits.slice(0, 1);
}

export const EVERYDAY_RULES: Rule[] = [
  {
    id: 'reassurance-frame',
    name: 'Reassurance setup',
    category: 'tone',
    severity: 'warning',
    registers: { technical: 'info' },
    description: 'Opening by calling the task hard and promising it need not be: "Moving abroad can feel overwhelming, but with the right preparation, it doesn\'t have to be."',
    why: 'This is how a chat assistant opens almost every how-to answer. A person who knows the answer starts with it.',
    fix: 'Cut the first sentence and start with the first real step or fact.',
    example: {
      before: 'Starting a garden can feel daunting, but it doesn\'t have to be. Pick a sunny spot first.',
      after: 'Pick the sunniest spot you have: tomatoes want six hours of sun a day.',
    },
    detect: { kind: 'heuristic', summary: 'One of the first four sentences calls the task overwhelming, daunting or similar and turns with "but it doesn\'t have to be", "but with the right..." and the like.', run: reassuranceFrame },
  },
  {
    id: 'listicle-intro',
    name: 'List announcement',
    category: 'structure',
    severity: 'warning',
    registers: { technical: 'info' },
    description: '"Here are some key steps to help you get started", "Here are five tips", "Here\'s a quick breakdown".',
    why: 'The answer is announced before it is given, in words that fit any topic. People skip the announcement or say what the list is for.',
    fix: 'Delete the line, or name what the list covers ("The visa takes longest, so start there").',
    example: {
      before: 'Here are some key steps to help you get started. First, check the visa rules.',
      after: 'The visa takes longest, so start there.',
    },
    detect: { kind: 'heuristic', summary: '"Here are (some|a few|five) (key|practical|simple...) steps/tips/ways/strategies..." or "Here\'s a quick breakdown/overview".', run: listicleIntro },
  },
  {
    id: 'ordinal-sequence',
    name: 'First, second, finally',
    category: 'structure',
    severity: 'warning',
    registers: { technical: 'info' },
    description: 'Prose steps marked "First, ... Second, ... Finally," (or "To start", "Next", "Lastly").',
    why: 'A numbered list written out as sentences, the shape of a generated how-to. People who write steps in prose let the order show through the content.',
    fix: 'Keep one marker at most, or make it a real list if the order matters.',
    example: {
      before: 'First, research the visa. Second, set a budget. Finally, join an expat group.',
      after: 'The visa decides your timeline, so sort that before anything else. Budget after that.',
    },
    detect: { kind: 'heuristic', summary: 'A sentence opening "First," followed by one opening "Second,", "Next," or "Then," and one opening "Finally," or "Lastly,".', run: ordinalSequence },
  },
  {
    id: 'upbeat-close',
    name: 'Upbeat closing moral',
    category: 'structure',
    severity: 'warning',
    description: 'Ending on encouragement or a proverb: "Remember, every journey begins with a single step", "an exciting and rewarding experience", "you\'ll be well on your way".',
    why: 'The pep talk at the end of every generated answer. It could close any answer on any subject, which is how readers spot it.',
    fix: 'End on the last useful fact, or on what you would do yourself.',
    example: {
      before: 'Book the visa appointment first. Then sort the flat. Join a local group once you land. Remember, every journey begins with a single step.',
      after: 'Book the visa appointment first. Then sort the flat. Join a local group once you land. The visa waits run to eight weeks, so start there.',
    },
    detect: { kind: 'heuristic', summary: 'One of the last two sentences opens with "Remember,", "Ultimately,", "In the end," and the like, or contains a stock encouragement.', run: upbeatClose },
  },
];
