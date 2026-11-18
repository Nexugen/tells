import { inDialogue, regexHits } from './rules-util.ts';
import type { Hit, Rule, RuleContext } from './types.ts';

/**
 * Rules added after mining model output from the benchmark prompts (Haiku, Sonnet and Opus
 * through Claude Code, 18 Nov 2026). Mostly structure: the habits are in how a reply is
 * built, not only in its words.
 */

const A = `['’]`;

function phraseRe(list: string[]): RegExp {
  const body = list.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, A).replace(/ /g, '\\s+')).join('|');
  return new RegExp(`\\b(?:${body})(?![\\p{L}\\p{N}])`, 'giu');
}

const isList = (t: string) => /^\s{0,3}(?:[-*+]|\d+[.)])\s/.test(t);

function summaryLines(ctx: RuleContext): Hit[] {
  const starts = /^\W*(?:this (?:means|ensures|makes|way|helps|allows|keeps|lets|gives|is why|matters)|that(?:['’]s| is) (?:why|what|how|the)|in short|overall|the result|so,|together,|the upshot|bottom line|all of this|in other words|net result|the takeaway|the goal is|the aim is)/i;
  const paras = ctx.paragraphs.filter((p) => !p.heading && !isList(p.text));
  const multi = paras.filter((p) => ctx.sentences.filter((s) => s.start >= p.start && s.end <= p.end).length >= 2);
  if (multi.length < 2) return [];
  const hits: Hit[] = [];
  for (const p of multi) {
    const ss = ctx.sentences.filter((s) => s.start >= p.start && s.end <= p.end);
    const last = ss[ss.length - 1];
    if (starts.test(last.text)) hits.push({ start: last.start, end: last.end });
  }
  // One summary line is a choice. Ending most paragraphs that way is the habit.
  return hits.length >= 2 && hits.length / multi.length >= 0.5 ? hits : [];
}

function listEverything(ctx: RuleContext): Hit[] {
  if (ctx.register === 'technical') return [];
  const items = ctx.paragraphs.filter((p) => isList(p.text));
  const words = ctx.paragraphs.reduce((a, p) => a + p.words, 0);
  if (items.length >= 4 && words <= 250 && items.reduce((a, p) => a + p.words, 0) / Math.max(words, 1) >= 0.5) {
    return [{ start: items[0].start, end: items[items.length - 1].end }];
  }
  return [];
}

function boldLabels(ctx: RuleContext): Hit[] {
  const re = /^\s{0,3}(?:[-*+]|\d+[.)])\s+\*\*[^*\n]{2,40}(?::\*\*|\*\*:)/gm;
  const hits = regexHits(re, ctx.masked);
  return hits.length >= 2 ? hits : [];
}

function prosCons(ctx: RuleContext): Hit[] {
  const pairs: [RegExp, RegExp][] = [
    [/\b(?:pros|advantages|benefits|upsides|strengths)\b/i, /\b(?:cons|disadvantages|drawbacks|downsides|weaknesses|trade-?offs)\b/i],
  ];
  const labels = ctx.paragraphs.filter((p) => p.heading || /^\s*(?:\*\*[^*]+\*\*|[A-Z][\w ]{1,30}:)\s*$/.test(p.text) || /^\s{0,3}(?:[-*+]\s+)?\*\*[^*\n]{2,30}\*\*/.test(p.text));
  for (const [a, b] of pairs) {
    const x = labels.find((p) => a.test(p.text));
    const y = labels.find((p) => b.test(p.text));
    if (x && y) return [{ start: x.start, end: x.end }, { start: y.start, end: y.end }];
  }
  return [];
}

function noPointOfView(ctx: RuleContext): Hit[] {
  if (ctx.register === 'technical') return [];
  const words = ctx.paragraphs.reduce((a, p) => a + p.words, 0);
  if (words < 90) return [];
  if (/\b(?:I|we|my|our|me|us|I['’]m|we['’]re|I['’]ve|we['’]ve|I['’]d|we['’]d)\b/.test(ctx.masked)) return [];
  const first = ctx.sentences[0];
  return first ? [{ start: first.start, end: first.end, detail: `${words} words with no I or we` }] : [];
}

function headingsInMessage(ctx: RuleContext): Hit[] {
  if (ctx.register === 'technical') return [];
  const heads = ctx.paragraphs.filter((p) => p.heading);
  const words = ctx.paragraphs.reduce((a, p) => a + p.words, 0);
  return heads.length >= 2 && words < 300 ? heads.map((h) => ({ start: h.start, end: h.end })) : [];
}

function boldOveruse(ctx: RuleContext): Hit[] {
  const hits = regexHits(/\*\*[^*\n]{2,60}\*\*/g, ctx.masked);
  const words = ctx.paragraphs.reduce((a, p) => a + p.words, 0);
  return hits.length >= 4 && hits.length / Math.max(words, 1) > 0.02 ? hits : [];
}

function ctaEnding(ctx: RuleContext): Hit[] {
  const prose = ctx.sentences.filter((s) => !/^\s*#/.test(s.text));
  const last = prose[prose.length - 1];
  if (!last || prose.length < 2) return [];
  const re = /^\W*(?:try it (?:today|now|out)|get started|sign up|start (?:your )?free|download (?:it )?(?:now|today)|update now|learn more|don['’]t miss|join us|book (?:a|your) (?:demo|spot|call)|grab your|register now|reserve your|ready to [^.?!]{2,40}\?|what are you waiting for|give it a try|check it out|see you there)/i;
  return re.test(last.text) ? [{ start: last.start, end: last.end }] : [];
}

const STOCK_COURTESY = [
  'thanks for your patience', 'thank you for your patience', 'thank you for your understanding', 'thanks for your understanding',
  'we apologize for any inconvenience', 'we apologise for any inconvenience', 'sorry for any inconvenience', 'apologies for any inconvenience',
  'sorry for any confusion', 'we appreciate your patience', 'i appreciate your patience', 'we value your business', 'your satisfaction is our',
  'we understand how frustrating', 'i understand how frustrating', 'i completely understand', 'i totally understand', 'i understand your frustration',
  'we understand your frustration', 'rest assured', 'please accept our apologies', 'we sincerely apologize', 'i sincerely apologize',
];

const OVER_QUALIFIED = [
  'can help', 'can help you', 'can be a great way', 'a great way to', 'helps ensure', 'help ensure', 'may help', 'in many cases', 'in most cases',
  'for many people', 'a variety of', 'a wide range of', 'a wide variety of', 'a number of', 'various', 'numerous', 'countless',
  'plays a key role', 'plays a crucial role', 'plays a vital role', 'an important role', 'a key role', 'it depends on your', 'depending on your needs',
  'every business is different', 'there is no one-size-fits-all', "there's no one-size-fits-all", 'one-size-fits-all',
];

const INFLATED_VERBS = [
  'utilize', 'utilizes', 'utilizing', 'utilise', 'utilising', 'facilitate', 'facilitates', 'facilitating', 'enhance', 'enhances', 'enhanced',
  'enhancing', 'ensure', 'ensures', 'ensuring', 'commence', 'commences', 'endeavor', 'endeavour', 'optimize your', 'maximize your',
  'enables you to', 'allows you to', 'empowers you to', 'helps you to', 'in order to', 'prior to', 'with regard to', 'in regards to',
];

const GENERIC_EXAMPLE = /\b(?:for example|for instance|e\.g\.|such as|like|say|imagine)\s*,?\s*(?:you(?:['’]re| are)\s+)?(?:a|an)\s+(?:small business(?: owner)?|startup|company|business|user|customer|team|developer|marketer|freelancer|bakery|coffee shop|cafe|café|restaurant|e-?commerce (?:store|site|business)|online store|local shop|retailer|agency|creator|blogger|student|busy professional)\b/gi;

const IF_YOURE_LOOKING = ["if you're looking for", 'if you are looking for', 'looking for a way to', 'are you looking for', 'ever wondered', 'have you ever wondered', 'tired of', 'struggling with', 'are you tired of'];

const QUICK_LABEL = /^\W*(?:(?:hey|hi) (?:all|everyone|team|folks),\s*)?(?:quick update|heads up|good news|great news|exciting news|big news|bad news|update|quick note|quick question|fun fact|pro tip|tip|tl;?dr|note|reminder|friendly reminder|bottom line|key takeaway|the short version)(?:,\s*(?:team|all|everyone|folks|y['’]all))?\s*[:!—–-]/gim;

const PARALLEL = /(?<=^|[.!?*]\s*)((?:more|less|better|faster|no|zero|fewer)\s+[\p{L}-]+(?:\s[\p{L}-]+)?)[,.]\s+((?:more|less|better|faster|no|zero|fewer)\s+[\p{L}-]+(?:\s[\p{L}-]+)?)[,.*]/giu;

const EMAIL_BOILERPLATE = [
  'after careful consideration', 'after careful review', 'thank you for taking the time', 'thanks for taking the time',
  'we appreciate the time and effort', 'we appreciate the thought and effort', 'not a reflection on', "isn't a reflection on",
  'welcome the chance to reconnect', 'keep your contact information on file', 'thanks for your flexibility', 'thank you for your flexibility',
  'please find attached', 'at your earliest convenience', 'looking forward to hearing from you', 'i look forward to hearing from you',
  'please do not hesitate', 'thank you again for', 'we truly appreciate', 'i wanted to reach out', 'just wanted to reach out', 'i am writing to inform you',
];

const BENEFIT_CLICHES = [
  'at a glance', 'with confidence', 'without worry', 'focus on what matters', 'what matters most', 'stop worrying', 'get back to running your business',
  'get back to what you do best', 'take care of themselves', 'on autopilot', 'like a pro', 'in no time', 'with ease', 'a breeze', 'out of the box',
  'the hard work for you', 'does the heavy lifting', 'all the heavy lifting', 'never miss a beat', 'stay ahead of the curve', 'up and running in minutes',
  'from day one', 'every step of the way', 'all in one place',
];

const EMPTY_ADJ = ['valuable insights', 'key insights', 'meaningful', 'impactful', 'innovative solution', 'innovative solutions', 'cutting edge solutions', 'peace of mind', 'top-notch', 'world-class service', 'hassle-free', 'stress-free', 'user-friendly', 'easy-to-use', 'intuitive', 'all-in-one', 'one-stop', 'next-generation', 'best-in-class', 'game-changing', 'second to none', 'unmatched'];

function placeholders(ctx: RuleContext): Hit[] {
  const out: Hit[] = [];
  const re = /\[(?:[^\]\n]{2,60})\]/g;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ctx.masked))) {
    const after = ctx.text[m.index + m[0].length];
    if (after === '(' || after === '[' || after === ':') continue; // a markdown link or reference
    const inner = m[0].slice(1, -1);
    if (/^(?:x| |\d+|[a-z]\.?|!\w+)$/i.test(inner)) continue; // checkboxes, footnotes
    if (/['’]s$/.test(inner)) continue; // "[company's] bylaws": an editorial substitution in a quote
    if (!/\b(?:name|your|link|date|number|company|client|insert|specific|example|tbd|todo|url|email|phone|amount|time|product|feature|detail)\b/i.test(inner)) continue;
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function fragmentTriad(ctx: RuleContext): Hit[] {
  const out: Hit[] = [];
  for (const s of ctx.sentences) {
    if (s.words > 9) continue;
    const para = ctx.paragraphs.find((p) => s.start >= p.start && s.start < p.end);
    if (inDialogue(ctx.text, para?.start ?? 0, s.start)) continue;
    const parts = s.text.replace(/[.!]\s*$/, '').split(/,\s+(?:and\s+|&\s+)?/);
    if (parts.length !== 3) continue;
    // "Yes, yes, and yes." is emphasis, and a shouted line is someone quoting or joking.
    if (new Set(parts.map((p) => p.trim().toLowerCase())).size < 3 || s.text === s.text.toUpperCase()) continue;
    if (!parts.every((p) => /^\W*[\p{L}\p{N}][\p{L}\p{N}'’-]*(?:\s[\p{L}\p{N}'’-]+){0,2}$/u.test(p.trim()))) continue;
    if (parts.some((p) => /^(?:but|so|and|or|which|because|then|if|when)\b/i.test(p.trim()))) continue;
    // "I bought eggs, milk, and bread" is a sentence with a list, not three fragments.
    if (/^\W*(?:i|we|you|they|he|she|it|the|this|that|my|our|your|their|his|her|there)\s/i.test(parts[0]) && parts[0].trim().split(/\s+/).length > 1) continue;
    out.push({ start: s.start, end: s.end });
  }
  return out;
}

function boldLine(ctx: RuleContext): Hit[] {
  return ctx.paragraphs
    .filter((p) => /^\s{0,3}\*\*[^*\n]{3,90}\*\*[.:]?\s*$/.test(p.text))
    .map((p) => ({ start: p.start, end: p.end }));
}

const STOCK_WARMTH = [
  "couldn't be happier for you", 'could not be happier for you', "they're lucky to have you", 'they are lucky to have you', 'exciting next chapter',
  'this next chapter', 'next chapter', "you're the best", 'you are the best', "couldn't have done it without you", 'could not have done it without you',
  'hope to see you there', "it's been way too long", 'been way too long', "hope life's been treating you well", 'hope life has been treating you well',
  'nothing fancy, just', 'good company', 'well deserved', 'well-deserved', 'wishing you all the best', "i'd love to catch up", 'i would love to catch up',
  'means the world', 'made my day', 'so grateful for you', 'truly appreciate', 'it means a lot', 'no worries if not',
];

const VALIDATION = /^\W*(?:oof,?\s*)?(?:that|this|it)(?:['’]s| is| was| sounds| must be| must have been| can be| can feel)\s+(?:so |really |genuinely |incredibly |understandably |completely )?(?:exhausting|frustrating|rough|tough|hard|stressful|infuriating|maddening|painful|awful|a lot|difficult|upsetting|overwhelming|stings|a tough spot|a hard spot)\b|^\W*(?:i['’]m|i am) (?:so )?sorry you(?:['’]re| are| had| have|['’]ve)\b|^\W*(?:i know how|i can only imagine how|i understand how) (?:much |hard |frustrating |tough )|^\W*(?:your (?:frustration|feelings|concern) (?:is|are) (?:valid|legitimate|understandable))|^\W*that stings\b|^\W*i['’]ve been there\b/i;

function validationOpener(ctx: RuleContext): Hit[] {
  const first = ctx.sentences.find((x) => x.words >= 2 && !/^\s*(?:hi|hey|hello|dear)\b[^.!?]{0,30}[,!]?\s*$/i.test(x.text));
  return first && VALIDATION.test(first.text) ? [{ start: first.start, end: first.end }] : [];
}

function boldLead(ctx: RuleContext): Hit[] {
  const leads = ctx.paragraphs.filter((p) => !p.heading && /^\s{0,3}(?:\d+[.)]\s+)?\*\*[^*\n]{3,80}\*\*\s*\S/.test(p.text));
  return leads.length >= 2 ? leads.map((p) => ({ start: p.start, end: Math.min(p.end, p.start + p.text.indexOf('**', p.text.indexOf('**') + 2) + 2) })) : [];
}

export const MORE_RULES: Rule[] = [
  {
    id: 'validation-opener',
    name: 'Validation opener',
    category: 'tone',
    severity: 'warning',
    registers: { technical: 'info' },
    description: 'A reply that opens by validating a feeling: "That sounds exhausting", "I\'m sorry you had to deal with that", "Your frustration is valid", "I\'ve been there".',
    why: 'Generated advice almost always starts with sympathy before the answer. People on forums mostly start with the answer, or with a question.',
    fix: 'Start with the answer or the useful fact. Keep the sympathy only if it says something specific.',
    example: {
      before: "That sounds exhausting. Try noise-cancelling headphones next time.",
      after: 'Noise-cancelling headphones with a white noise track got me through a twelve-hour flight next to a teething baby.',
    },
    detect: { kind: 'heuristic', summary: 'The first sentence (after any greeting) opens with a stock validation of the reader\'s feeling.', run: validationOpener },
  },
  {
    id: 'stock-warmth',
    name: 'Stock warmth',
    category: 'tone',
    severity: 'info',
    registers: { casual: 'warning' },
    description: '"Couldn\'t be happier for you", "They\'re lucky to have you", "this exciting next chapter", "you\'re the best", "Nothing fancy, just good company".',
    why: 'The greeting-card lines generated messages to friends are built from. A friend writes one specific thing instead.',
    fix: 'Replace it with one detail only you would know: what they did, where you are going, what you will bring.',
    example: {
      before: "Congrats on the new job! They're lucky to have you.",
      after: 'Congrats on the new job! Finally someone pays you for the spreadsheets you used to build for fun.',
    },
    detect: { kind: 'pattern', pattern: phraseRe(STOCK_WARMTH) },
  },
  {
    id: 'bold-lead',
    name: 'Bold lead-ins',
    category: 'format',
    severity: 'warning',
    registers: { technical: 'info' },
    description: 'Two or more paragraphs that open with a bold phrase: "**Document everything.** Save drafts..."',
    why: 'Generated advice is laid out as bold-headed steps. People answering a question write paragraphs.',
    fix: 'Drop the bold and let the first sentence of each paragraph do the work.',
    example: {
      before: '**Build your case.** List what you shipped.\n\n**Know your number.** Check salary surveys.',
      after: 'List what you shipped this year.\n\nCheck two salary surveys and pick a number.',
    },
    detect: { kind: 'heuristic', summary: 'At least two paragraphs that begin with a **bold** phrase followed by more text.', run: boldLead },
  },
  {
    id: 'unfilled-placeholder',
    name: 'Unfilled placeholder',
    category: 'format',
    severity: 'warning',
    description: 'A template slot left in the text: [Your name], [Client name], [link], [specific feature].',
    why: 'Models fill gaps with brackets and people paste them straight out. It is the fastest way to show a reader a template wrote to them.',
    fix: 'Fill it in with the real detail, or rewrite the sentence so it does not need one.',
    example: { before: 'Hi [Client name], the quote is attached.', after: 'Hi Dana, the quote is attached.' },
    detect: { kind: 'heuristic', summary: 'Square brackets around a slot word (name, link, date, number, your, specific...), not a markdown link.', run: placeholders },
  },
  {
    id: 'email-boilerplate',
    name: 'Email boilerplate',
    category: 'tone',
    severity: 'warning',
    description: '"After careful consideration", "Thank you for taking the time", "This is not a reflection on", "Please find attached".',
    why: 'Form-letter lines. Generated emails are built almost entirely from them.',
    fix: 'Say the decision or the request in your own words, once.',
    example: { before: 'After careful consideration, we have decided to stay on our current CRM.', after: "We're staying on our current CRM until the budget review in March." },
    detect: { kind: 'pattern', pattern: phraseRe(EMAIL_BOILERPLATE) },
  },
  {
    id: 'benefit-cliche',
    name: 'Benefit cliché',
    category: 'vocabulary',
    severity: 'info',
    registers: { marketing: 'warning' },
    description: '"at a glance", "with confidence", "focus on what matters", "on autopilot", "in no time", "every step of the way".',
    why: 'Stock benefit phrases. They fill the space where the real benefit should be.',
    fix: 'Say what the reader gets, concretely: what they stop doing, or how long it takes now.',
    example: { before: 'See every project at a glance.', after: 'Every project and its due date sits on one screen.' },
    detect: { kind: 'pattern', pattern: phraseRe(BENEFIT_CLICHES) },
  },
  {
    id: 'so-you-can',
    name: '"So you can" benefit chain',
    category: 'structure',
    severity: 'info',
    registers: { marketing: 'warning' },
    description: 'Two or more "so you can..." clauses in one text.',
    why: 'Generated copy bolts a benefit onto every feature with the same connector.',
    fix: 'Keep one. Let the other features stand on their own.',
    example: { before: 'It syncs offline, so you can work anywhere. It backs up nightly, so you can relax.', after: 'It syncs offline and backs up every night at 2am.' },
    detect: {
      kind: 'heuristic',
      summary: 'Two or more "so (you|your team|your customers) can" in one text.',
      run: (ctx) => {
        const hits = regexHits(/\bso (?:that )?(?:you|your (?:team|customers|patients|users|staff)|everyone|they) can\b/gi, ctx.masked);
        return hits.length >= 2 ? hits : [];
      },
    },
  },
  {
    id: 'turn-x-into-y',
    name: '"Turn X into Y" headline',
    category: 'tone',
    severity: 'info',
    registers: { marketing: 'warning' },
    description: 'A sentence that opens with "Turn your X into Y" or "Transform your X".',
    why: 'One of the most reused headline shapes in generated marketing.',
    fix: 'State what the product does in plain terms.',
    example: { before: 'Turn your reminders into confirmed visits.', after: 'Patients confirm their visit by replying to a text.' },
    detect: { kind: 'pattern', pattern: /(?<=^|[.!?]\s+|\*\*)(?:turn|transform) (?:your |every )?[\p{L} -]{2,40} into\b/gimu },
  },
  {
    id: 'fragment-triad',
    name: 'Three-fragment sentence',
    category: 'rhythm',
    severity: 'warning',
    description: 'A short sentence that is just three comma-separated fragments: "Less typing, cleaner books, zero hassle."',
    why: 'A slogan built from three noun phrases. It sounds finished and says nothing a reader can check.',
    fix: 'Replace it with the one concrete result.',
    example: { before: 'Less typing, cleaner books, zero hassle.', after: 'Most receipts take one photo and no typing.' },
    detect: { kind: 'heuristic', summary: 'A sentence of nine words or fewer made of three short comma-separated fragments.', run: fragmentTriad },
  },
  {
    id: 'bold-line',
    name: 'Bold line as a heading',
    category: 'format',
    severity: 'info',
    registers: { technical: 'off' },
    description: 'A line that is entirely bold, used as a headline or a heading.',
    why: 'Chat-style output fakes headings with bold lines. In an email, post or comment it reads as generated.',
    fix: 'Make it a normal first sentence, or cut it.',
    example: { before: '**Rotate the password now.**\n\nBots scan GitHub within minutes.', after: 'Rotate the password now. Bots scan GitHub within minutes.' },
    detect: { kind: 'heuristic', summary: 'A paragraph made of a single **bold** span.', run: boldLine },
  },
  {
    id: 'summary-line',
    name: 'Every paragraph ends on a summary',
    category: 'structure',
    severity: 'warning',
    description: 'Most paragraphs close with a line that sums up the paragraph: "This means...", "That\'s why...", "Overall...".',
    why: 'Models wrap each paragraph like a school essay. People move on once the point is made.',
    fix: 'Delete the summary lines. Keep one only if it adds something the paragraph did not say.',
    example: {
      before: 'We cache each page for five minutes. A refresh inside that window is free. This means pages load faster.\n\nWrites go straight to the database. A cache entry is dropped when its row changes. This ensures data stays fresh.',
      after: 'We cache each page for five minutes. A refresh inside that window is free.\n\nWrites go straight to the database. A cache entry is dropped when its row changes.',
    },
    detect: { kind: 'heuristic', summary: 'Two or more multi-sentence paragraphs, at least half of them ending on a sentence that opens with "This means/ensures/makes", "That\'s why", "In short", "Overall"...', run: summaryLines },
  },
  {
    id: 'list-everything',
    name: 'Everything in a list',
    category: 'format',
    severity: 'info',
    registers: { technical: 'off' },
    description: 'A short message where most of the words sit in bullet points.',
    why: 'Bullets are the default shape of generated replies. In a message to a person, sentences carry reasons and order better.',
    fix: 'Write it as two or three sentences. Keep a list only for real steps or items someone will tick off.',
    example: {
      before: '- The release moves to Monday\n- The sandbox is down\n- Testing is blocked\n- I will post an update',
      after: "The release moves to Monday. The payment sandbox has been down since Tuesday, so we can't finish testing. I'll post when it's back.",
    },
    detect: { kind: 'heuristic', summary: 'Four or more list items holding at least half the words of a text under 250 words (not in technical writing).', run: listEverything },
  },
  {
    id: 'bold-label-list',
    name: 'Bold-label bullets',
    category: 'format',
    severity: 'warning',
    registers: { technical: 'info' },
    description: 'Bullets that each open with a bold label and a colon ("- **Speed:** ...").',
    why: 'This exact layout is one of the most recognisable shapes of chatbot output.',
    fix: 'Drop the labels and write the items plainly, or turn them into sentences.',
    example: {
      before: '- **Speed:** builds take half as long\n- **Cost:** the bill went down',
      after: '- Builds take half as long.\n- The monthly bill went from $410 to $260.',
    },
    detect: { kind: 'heuristic', summary: 'Two or more list items that start with **Label:**.', run: boldLabels },
  },
  {
    id: 'pros-cons',
    name: 'Symmetrical pros and cons',
    category: 'structure',
    severity: 'info',
    description: 'Matched "Pros" and "Cons" (or benefits and drawbacks) sections.',
    why: 'Balanced halves look thorough and avoid a decision. People usually just say which one they would pick and why.',
    fix: 'Say which option you would choose and the one or two reasons that decided it.',
    example: {
      before: '**Pros**\n- Fast\n\n**Cons**\n- Costly',
      after: 'I would pick it anyway: the speed saves us more than the licence costs.',
    },
    detect: { kind: 'heuristic', summary: 'A heading, bold label or "Label:" line naming pros/advantages/benefits and another naming cons/drawbacks/trade-offs.', run: prosCons },
  },
  {
    id: 'no-point-of-view',
    name: 'No point of view',
    category: 'tone',
    severity: 'info',
    registers: { technical: 'off', professional: 'off', casual: 'off' },
    description: 'Marketing copy of 90 words or more with no "I" or "we" anywhere.',
    why: 'Someone wrote this for a reason. Text that never says who is speaking reads as generated or as a brochure.',
    fix: 'Say who is talking and what you did or think, where that is true.',
    example: {
      before: 'The tool reads receipts from photos and fills in the vendor, date and amount. It works offline and syncs later. It supports most receipt formats and currencies. Data is stored securely and can be exported at any time. Reports can be generated by month or by category. Teams can share a workspace and assign receipts to projects. Notifications are sent when a receipt needs review. The interface is available on phones and on the web, and the app is updated every month with fixes and new features based on feedback from people who use it.',
      after: 'We built the receipt reader after losing a month of taxi receipts. It fills in the vendor, date and amount from a photo, offline too, and syncs later.',
    },
    detect: { kind: 'heuristic', summary: 'At least 90 words of non-technical prose without I, we, my, our, me or us.', run: noPointOfView },
  },
  {
    id: 'over-qualified',
    name: 'Over-qualified claim',
    category: 'vocabulary',
    severity: 'info',
    description: '"can help", "a wide range of", "in many cases", "plays a key role", "depending on your needs".',
    why: 'These soften a claim until it says nothing. Models use them to stay safe.',
    fix: 'Make the claim exact, or drop it.',
    example: {
      before: 'Caching can help improve performance in many cases.',
      after: 'Caching cut our page load from 1.8 s to 0.4 s.',
    },
    detect: { kind: 'pattern', pattern: phraseRe(OVER_QUALIFIED) },
  },
  {
    id: 'inflated-verb',
    name: 'Inflated verb',
    category: 'vocabulary',
    severity: 'info',
    description: '"utilize", "facilitate", "enhance", "ensure", "allows you to", "in order to".',
    why: 'Plain verbs are what people say out loud. Inflated ones are a staple of generated and corporate prose.',
    fix: 'Use the plain verb: use, help, improve, make sure, lets you, to.',
    example: {
      before: 'Utilize the export feature in order to back up your data.',
      after: 'Use the export to back up your data.',
    },
    detect: { kind: 'pattern', pattern: phraseRe(INFLATED_VERBS) },
  },
  {
    id: 'generic-example',
    name: 'Generic example',
    category: 'structure',
    severity: 'warning',
    description: 'An example that could be anyone: "for example, a small business", "imagine you\'re a busy professional".',
    why: 'A generic example is a placeholder for a real one. People reach for the case they actually know.',
    fix: 'Use a real case from the source, or leave a marked placeholder like [example from your work].',
    example: {
      before: 'For example, a small business might use it to track invoices.',
      after: 'A print shop we work with uses it to chase 30 overdue invoices a month.',
    },
    detect: { kind: 'pattern', pattern: GENERIC_EXAMPLE },
  },
  {
    id: 'stock-courtesy',
    name: 'Stock courtesy',
    category: 'tone',
    severity: 'warning',
    description: '"Thanks for your patience", "We apologize for any inconvenience", "I completely understand", "Rest assured".',
    why: 'Script lines from support templates. They read as no one in particular, which is the opposite of what an apology needs.',
    fix: 'Say sorry once, plainly, for the specific thing, or skip it and fix the problem.',
    example: {
      before: 'We apologize for any inconvenience this may have caused.',
      after: 'Sorry about the double charge.',
    },
    detect: { kind: 'pattern', pattern: phraseRe(STOCK_COURTESY) },
  },
  {
    id: 'cta-ending',
    name: 'Call-to-action ending',
    category: 'structure',
    severity: 'info',
    registers: { marketing: 'warning' },
    description: 'A last line that pushes the reader to act: "Try it today", "Get started", "Ready to...?", "Don\'t miss it".',
    why: 'Generated posts end on the same handful of pushes. A person usually stops on the fact, or says plainly where to find it.',
    fix: 'End on the fact. If the reader needs a link or a date, give just that.',
    example: {
      before: 'It reads receipts from photos now. Try it today!',
      after: 'It reads receipts from photos now. The update is in the App Store.',
    },
    detect: { kind: 'heuristic', summary: 'The last sentence opens with a stock push: try it today, get started, sign up, learn more, ready to...?', run: ctaEnding },
  },
  {
    id: 'looking-for-hook',
    name: '"If you\'re looking for" hook',
    category: 'tone',
    severity: 'warning',
    description: '"If you\'re looking for...", "Tired of...?", "Ever wondered...?", "Struggling with...?".',
    why: 'An ad formula that guesses at the reader\'s problem. It reads as copy written for search engines.',
    fix: 'Start with what the thing does, or with the real problem one real user had.',
    example: {
      before: "If you're looking for a faster way to book appointments, this is it.",
      after: 'Patients confirm or move their appointment by replying to the reminder text.',
    },
    detect: {
      kind: 'heuristic',
      summary: 'One of the hook phrases at the start of one of the first two sentences.',
      run: (ctx) => {
        const re = phraseRe(IF_YOURE_LOOKING);
        const out: Hit[] = [];
        for (const sent of ctx.sentences.slice(0, 2)) {
          const h = regexHits(new RegExp(re.source, re.flags), sent.text)[0];
          if (h && h.start <= 3) out.push({ start: sent.start + h.start, end: sent.start + h.end });
        }
        return out;
      },
    },
  },
  {
    id: 'label-opener',
    name: 'Label opener',
    category: 'format',
    severity: 'info',
    description: 'A message that opens with a label: "Quick update:", "Heads up:", "Good news!", "TL;DR:".',
    why: 'Fine now and then, but models open nearly every message this way.',
    fix: 'Start with the news itself.',
    example: {
      before: 'Quick update: the release moves to Monday.',
      after: 'The release moves to Monday.',
    },
    detect: { kind: 'pattern', pattern: QUICK_LABEL },
  },
  {
    id: 'parallel-slogan',
    name: 'Parallel slogan',
    category: 'rhythm',
    severity: 'warning',
    description: 'Matched short phrases in a row: "More focus, less noise.", "No setup. No fees."',
    why: 'Ad-copy rhythm. It sounds punchy and says nothing specific.',
    fix: 'Replace the pair with the one concrete thing it was gesturing at.',
    example: {
      before: 'More signal, less noise. It sorts your inbox.',
      after: 'It moves newsletters out of your inbox, so the first screen is people.',
    },
    detect: { kind: 'pattern', pattern: PARALLEL },
  },
  {
    id: 'empty-adjective',
    name: 'Empty adjective',
    category: 'vocabulary',
    severity: 'info',
    registers: { marketing: 'warning' },
    description: '"user-friendly", "intuitive", "hassle-free", "peace of mind", "valuable insights", "innovative solutions".',
    why: 'Every product claims these, so they carry no information.',
    fix: 'Say what the user actually does or gets: "two taps", "no account needed".',
    example: {
      before: 'An intuitive, hassle-free booking experience.',
      after: 'Patients book in two taps, with no account.',
    },
    detect: { kind: 'pattern', pattern: phraseRe(EMPTY_ADJ) },
  },
  {
    id: 'headings-in-message',
    name: 'Headings in a short message',
    category: 'format',
    severity: 'info',
    registers: { technical: 'off' },
    description: 'Two or more markdown headings in a message under 300 words.',
    why: 'People do not put section headings in an email or a chat reply. Models do it by reflex.',
    fix: 'Remove the headings and let the paragraphs carry the order.',
    example: {
      before: '## Summary\nThe import failed.\n\n## Next steps\nWe rerun it tonight.',
      after: 'The import failed. We rerun it tonight.',
    },
    detect: { kind: 'heuristic', summary: 'Two or more headings in under 300 words of non-technical text.', run: headingsInMessage },
  },
  {
    id: 'bold-overuse',
    name: 'Too much bold',
    category: 'format',
    severity: 'info',
    description: 'Four or more bold phrases, more than one every 50 words.',
    why: 'When everything is bold, nothing is. Generated answers bold for skimmability by default.',
    fix: 'Keep bold for the one thing a reader must not miss, or none.',
    example: {
      before: '**Fast** builds, **cheap** hosting, **easy** setup and **great** support.',
      after: 'Builds take about a minute.',
    },
    detect: { kind: 'heuristic', summary: 'Four or more **bold** spans at a density above 2 per 100 words.', run: boldOveruse },
  },
];
