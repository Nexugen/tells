// Everyday names for each rule, for the web page, the browser extension and the assistant tools.
// The rule's own name stays the reference name in the CLI, the API and the rules list.
import { RULES } from './rules.ts';

const NAMES: Record<string, string> = {
  'dash': 'Long dashes',
  'not-x-but-y': '"It\'s not X, it\'s Y"',
  'setup-reveal': 'A drumroll before the point',
  'rhetorical-qa': 'Asking and answering yourself',
  'staccato': 'Short dramatic fragments',
  'triad': 'Lists of three',
  'sweeping-opener': 'A big, vague opening',
  'slogan-ending': 'A slogan at the end',
  'sycophantic-opener': 'Praising the question',
  'chatbot-closer': 'A chatbot sign-off',
  'assistant-leak': 'Leftover chatbot text',
  'ai-vocabulary': 'Words chatbots overuse',
  'hype': 'Hype words',
  'intensifier': 'Words that only add weight',
  'filler-transition': 'Filler transitions',
  'stock-hook': 'A stock social media hook',
  'hedge-stack': 'Too many hedges',
  'corporate-excitement': 'Announcing your excitement',
  'whether-youre': 'Speaking to everyone at once',
  'lecturing': 'Lecturing the reader',
  'crowd-address': 'Talking to a crowd',
  'signposting': 'Describing the text instead of saying it',
  'vague-attribution': '"Experts say" with no source',
  'tagline': 'A tagline',
  'explainer': 'An explainer under a heading',
  'exclamation': 'Exclamation marks',
  'emoji': 'Emoji as decoration',
  'hashtag': 'A row of hashtags',
  'semicolon': 'Semicolons for rhythm',
  'scare-quotes': 'Quotes for emphasis',
  'bold-mid-sentence': 'Bold words mid-sentence',
  'title-case-heading': 'Title Case headings',
  'uniform-rhythm': 'Every sentence the same length',
  'validation-opener': 'Sympathy before the answer',
  'stock-warmth': 'Greeting card lines',
  'bold-lead': 'Bold headings on every step',
  'unfilled-placeholder': 'A placeholder left in',
  'email-boilerplate': 'Form letter lines',
  'benefit-cliche': 'Stock benefit phrases',
  'so-you-can': '"So you can" on every feature',
  'turn-x-into-y': '"Turn X into Y"',
  'fragment-triad': 'A slogan of three short phrases',
  'bold-line': 'Bold lines used as headings',
  'summary-line': 'A summary at the end of every paragraph',
  'list-everything': 'Everything in a list',
  'bold-label-list': 'Bullets with bold labels',
  'pros-cons': 'Perfectly balanced pros and cons',
  'no-point-of-view': 'No point of view',
  'over-qualified': 'Vague amounts',
  'inflated-verb': 'Inflated verbs',
  'generic-example': 'A generic example',
  'stock-courtesy': 'Support script lines',
  'cta-ending': 'A stock call to action',
  'looking-for-hook': '"If you\'re looking for"',
  'label-opener': 'A label to open with',
  'parallel-slogan': 'Punchy parallel lines',
  'empty-adjective': 'Empty adjectives',
  'headings-in-message': 'Headings in a short message',
  'bold-overuse': 'Too much bold',
  'reassurance-frame': 'Reassurance before the answer',
  'listicle-intro': 'Announcing a list',
  'ordinal-sequence': 'First, second, finally',
  'upbeat-close': 'An upbeat moral at the end',
};

export interface PlainRule { name: string; why: string; fix: string }

const BY_ID = new Map(RULES.map((r) => [r.id, r]));

/** The everyday name, the one-line reason and what to do instead, for one rule id. */
export function plainRule(id: string): PlainRule {
  const r = BY_ID.get(id);
  return { name: NAMES[id] ?? r?.name ?? id, why: r?.why ?? '', fix: r?.fix ?? '' };
}

/** Every rule as { id: [name, why] }, small enough to send with a page. */
export function plainTable(): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  for (const r of RULES) out[r.id] = [NAMES[r.id] ?? r.name, r.why];
  return out;
}
