// Pages that check one kind of writing (/cover-letter, /essay, ...). Each reuses the home page's checker and script.
// The habits listed on each page are the rules that fired most on AI-written samples of that kind of writing.
import BENCH from '../bench-figures.json' with { type: 'json' };
import type { Register } from '../types.ts';
import { checkerPanel, esc, headMeta, pageScript, siteFooter, STYLE, USE_LINKS, voicePanel, type PageOpts } from './page.ts';

export interface Habit {
  /** Rule id in src/rules*.ts that finds it. */
  rule: string;
  name: string;
  /** How it looks in AI-written text. Shown in quotes, and left out of the copy check because it is the habit itself. */
  examples: string[];
  /** What to do instead. */
  text: string;
}

export interface UseCase {
  path: string;
  title: string;
  description: string;
  h1: string;
  lede: string;
  label: string;
  register: Register;
  sample: string;
  habits: Habit[];
  /** Extra notes for this kind of writing, one paragraph each. */
  notes?: string[];
}

export const USE_CASES: UseCase[] = [
  {
    path: '/cover-letter',
    title: 'Does your cover letter sound AI-written? Free check | tells',
    description: 'Paste your cover letter and see which phrases make it read as AI-written. Then fix only those sentences and put your own details back in. Free.',
    h1: 'Does your cover letter sound AI-written?',
    lede: 'Paste it below. The phrases that make it read like ChatGPT get marked, and you can fix just those.',
    label: 'Paste your cover letter',
    register: 'professional',
    sample: `Dear Hiring Manager,

I am thrilled to apply for the Marketing Coordinator position. In my previous role, I streamlined our content workflow and fostered collaboration across departments. I thrive in fast-paced environments and leverage data to deliver impactful results.

It's not just about marketing, it's about telling stories that matter. I am deeply passionate about your company's mission.

I look forward to hearing from you.

Sincerely,
Alex`,
    habits: [
      { rule: 'corporate-excitement', name: 'Announcing your excitement', examples: ['I am thrilled to apply', 'I am excited to'], text: 'The most common first line in an AI cover letter. Start with the job and the one reason you fit it.' },
      { rule: 'ai-vocabulary', name: 'Words AI leans on', examples: ['leverage', 'pivotal', 'thrive', 'fast-paced', 'fostering', 'seamless'], text: 'Use the plain word, or better, the fact the word was standing in for.' },
      { rule: 'empty-adjective', name: 'Empty adjectives', examples: ['impactful results', 'meaningful change'], text: 'These tell the reader nothing. Say what changed and by how much.' },
      { rule: 'not-x-but-y', name: 'Contrast setups', examples: ['It\'s not just about writing code, it\'s about solving problems'], text: 'A favourite AI move. Say the second half on its own.' },
      { rule: 'email-boilerplate', name: 'A stock sign-off', examples: ['I look forward to hearing from you'], text: 'This closes thousands of letters. End with something only you would say, such as when you can start.' },
      { rule: 'intensifier', name: 'Words that only add weight', examples: ['deeply passionate', 'truly excited'], text: 'Delete the extra word and see if the sentence still holds up.' },
    ],
  },
  {
    path: '/linkedin-post',
    title: 'Does your LinkedIn post sound like ChatGPT? Free check | tells',
    description: 'Paste a LinkedIn post and see the habits that make it read like ChatGPT wrote it, from stock hooks to hashtags. Fix only what needs it. Free.',
    h1: 'Does your LinkedIn post sound like ChatGPT?',
    lede: 'Paste your post. You will see which lines read as AI-written and why.',
    label: 'Paste your LinkedIn post',
    register: 'casual',
    sample: `I got rejected from 10 jobs last year.

Today, I'm starting my dream role. 🚀

Here's what I learned along the way:

Leadership isn't about titles. It's about impact. Every no brought me closer to the right yes.

Here's to new beginnings, bold ideas, and the road ahead!

#CareerGrowth #Resilience #NeverGiveUp`,
    habits: [
      { rule: 'hashtag', name: 'A row of hashtags', examples: ['#CareerGrowth #Resilience #NeverGiveUp'], text: 'Cut them, or keep one that people really search for.' },
      { rule: 'emoji', name: 'Emoji as decoration', examples: ['🚀', '👇'], text: 'A rocket after the news, a finger pointing at the comments. Use words instead.' },
      { rule: 'stock-hook', name: 'A stock hook', examples: ['Here\'s what I learned'], text: 'Start with the moment itself.' },
      { rule: 'not-x-but-y', name: 'Contrast setups', examples: ['Leadership isn\'t about titles. It\'s about impact.'], text: 'Say what you mean once, without the setup.' },
      { rule: 'corporate-excitement', name: 'Announcing your excitement', examples: ['I\'m thrilled to announce'], text: 'Lead with the news and who it helps.' },
      { rule: 'upbeat-close', name: 'An upbeat moral at the end', examples: ['Here\'s to new beginnings'], text: 'End on the last real detail, or on a question you actually want answered.' },
    ],
  },
  {
    path: '/cold-email',
    title: 'Does your cold email sound AI-written? Free check | tells',
    description: 'Paste a cold or sales email and see the lines that make it read as AI-written or templated. Fix only those before you send it. Free.',
    h1: 'Does your cold email sound AI-written?',
    lede: 'Paste a cold or sales email. The lines that read like a template get marked before you send it.',
    label: 'Paste your cold email',
    register: 'professional',
    sample: `Hi Sarah,

I hope this email finds you well! I wanted to reach out because we help companies like yours streamline their sales process and unlock new revenue.

Our platform leverages cutting-edge AI to seamlessly find high-intent leads. It's not just software, it's a smarter way to grow.

Would you be open to a quick call next week?

Looking forward to hearing from you!

Best,
Mark`,
    habits: [
      { rule: 'sycophantic-opener', name: 'A stock opening line', examples: ['I hope this email finds you well'], text: 'This tells the reader a template is coming. Start with why you are writing to this person.' },
      { rule: 'email-boilerplate', name: 'Email filler', examples: ['I wanted to reach out', 'Looking forward to hearing from you'], text: 'Say the request once, in your own words.' },
      { rule: 'ai-vocabulary', name: 'Words AI leans on', examples: ['streamline', 'unlock', 'cutting-edge', 'seamlessly', 'leverage'], text: 'Name what the product does and what the customer stops doing.' },
      { rule: 'not-x-but-y', name: 'Contrast setups', examples: ['It\'s not just software, it\'s a smarter way to grow'], text: 'Drop the setup and give one concrete result.' },
      { rule: 'exclamation', name: 'Exclamation marks', examples: ['Looking forward to hearing from you!'], text: 'Cheerful marks on every other line read as forced. Use full stops.' },
      { rule: 'empty-adjective', name: 'Empty adjectives', examples: ['meaningful engagement', 'innovative solutions'], text: 'Replace them with a number or a customer\'s name.' },
    ],
  },
  {
    path: '/essay',
    title: 'Does your essay sound like you? Free writing check | tells',
    description: 'Paste a school or college essay and see which habits make it read as AI-generated, so you can put your own voice and examples back in. Free.',
    h1: 'Does your essay sound like you?',
    lede: 'Paste a school or college essay. You will see the habits that make writing read as machine-made, and where your own voice could come through.',
    label: 'Paste your essay',
    register: 'professional',
    sample: `In today's rapidly evolving world, social media plays a pivotal role in how young people communicate.

On one hand, it offers numerous benefits. Furthermore, it provides a platform for self-expression and creativity. Moreover, it can foster a sense of community.

On the other hand, excessive use can lead to anxiety. This is a multifaceted and crucial issue.

In conclusion, social media is a double-edged sword. Ultimately, it is up to each individual to navigate this complex landscape responsibly.`,
    habits: [
      { rule: 'sweeping-opener', name: 'A sweeping first line', examples: ['In today\'s world'], text: 'Open with a specific case, a person or a moment you can describe.' },
      { rule: 'filler-transition', name: 'Filler transitions', examples: ['Furthermore', 'Moreover', 'Additionally', 'In conclusion'], text: 'Most of these can go. Let the next sentence start with its subject.' },
      { rule: 'ai-vocabulary', name: 'Words AI leans on', examples: ['pivotal', 'multifaceted', 'crucial', 'transformative', 'embark'], text: 'Use the word you would say out loud.' },
      { rule: 'ordinal-sequence', name: 'Numbered steps through an argument', examples: ['Firstly', 'Secondly', 'Finally'], text: 'This reads like a template. Keep one marker at most.' },
      { rule: 'upbeat-close', name: 'A neat moral at the end', examples: ['Ultimately, it is up to each of us'], text: 'It sums up what you already said. End on your strongest point or an open question.' },
      { rule: 'triad', name: 'Lists of three', examples: ['empathy, resilience, and teamwork'], text: 'Keep the one that matters and show it with an example from your own life.' },
    ],
    notes: [
      `Careful, simple writing is easy to mistake for AI, so tells was tested on essays by students writing English as a second language. None of the 72 such essays in its locked test set got a warning. It can still be wrong, so treat what it marks as a suggestion.`,
      `If your school or college has rules about AI tools, follow them. This page is for making your own writing sound like you.`,
    ],
  },
  {
    path: '/email',
    title: 'Does your email sound like AI wrote it? Free check | tells',
    description: 'Paste a work email and see the stock phrases that make it read as AI-written. Fix only those and say it the way you would. Free.',
    h1: 'Does your email sound like AI wrote it?',
    lede: 'Paste an everyday work email. The stock phrases get marked so you can say it the way you would.',
    label: 'Paste your email',
    register: 'professional',
    sample: `Hi team,

I hope this email finds you well. I just wanted to quickly follow up on our discussion from yesterday's meeting regarding the Q3 roadmap.

As discussed, we will be prioritizing the onboarding improvements to ensure a seamless experience for our users. Please take a moment to review the attached document and share any feedback by end of day Friday.

If you have any questions or concerns, please don't hesitate to reach out. I'm happy to help!

Thanks so much for your continued hard work and dedication.

Best regards,
Maya`,
    habits: [
      { rule: 'sycophantic-opener', name: 'A stock opening line', examples: ['I hope this email finds you well'], text: 'Start with the reason you are writing.' },
      { rule: 'chatbot-closer', name: 'A helpdesk closing', examples: ['Please don\'t hesitate to reach out', 'I\'m happy to help!'], text: 'Cut it, or ask the one question you need answered.' },
      { rule: 'email-boilerplate', name: 'Email filler', examples: ['I look forward to hearing from you'], text: 'Say what you need and by when.' },
      { rule: 'ai-vocabulary', name: 'Words AI leans on', examples: ['seamless', 'a testament to'], text: 'Use the plain word.' },
      { rule: 'inflated-verb', name: 'Inflated verbs', examples: ['to ensure a smooth handover'], text: 'Write it the way you would say it: so the handover goes well.' },
      { rule: 'intensifier', name: 'Words that only add weight', examples: ['truly grateful', 'really appreciate'], text: 'Delete the extra word.' },
    ],
  },
  {
    path: '/resume',
    title: 'Does your resume sound AI-written? Free check | tells',
    description: 'Paste your resume summary or bullet points and see the words that make it read as AI-written. Then swap them for what you actually did. Free.',
    h1: 'Does your resume sound AI-written?',
    lede: 'Paste your summary or a few bullet points. The words that read as AI-written get marked.',
    label: 'Paste your resume summary or bullets',
    register: 'professional',
    sample: `Results-driven marketing professional with a proven track record of leveraging data-driven insights. Adept at fostering cross-functional collaboration and thriving in fast-paced environments.

- Spearheaded a rebranding initiative, resulting in impactful growth
- Leveraged cutting-edge analytics tools to streamline reporting
- Seamlessly integrated a wide range of tools to enhance decision-making`,
    habits: [
      { rule: 'ai-vocabulary', name: 'Words AI leans on', examples: ['leveraged', 'fostering', 'streamlined', 'robust', 'pivotal', 'seamlessly', 'cutting-edge'], text: 'These fill AI resumes. Name the tool, the team or the result instead.' },
      { rule: 'inflated-verb', name: 'Inflated verbs', examples: ['enhanced decision-making'], text: 'Say what you built or changed, in the verb you would use in an interview.' },
      { rule: 'empty-adjective', name: 'Empty adjectives', examples: ['impactful growth'], text: 'Give the number: how many people, how much time, how much money.' },
      { rule: 'over-qualified', name: 'Vague amounts', examples: ['a wide range of tools', 'numerous projects'], text: 'Name two of them.' },
      { rule: 'uniform-rhythm', name: 'Every line the same shape', examples: [], text: 'A summary where every sentence runs the same length reads machine-made. Make one line short.' },
    ],
    notes: [
      'Resume language is formulaic for everyone, so on a resume most of these come up as hints rather than warnings. A hint is worth a look. It does not mean the resume reads as AI.',
    ],
  },
  {
    path: '/bio',
    title: 'Does your bio sound AI-written? Free check for about pages | tells',
    description: 'Paste an about page or a short bio and see which phrases make it read as AI-written. Fix only those and add the details only you know. Free.',
    h1: 'Does your bio sound AI-written?',
    lede: 'Paste an about page, a speaker bio or a profile. The lines that read as generic get marked.',
    label: 'Paste your bio or about page',
    register: 'professional',
    sample: `Sarah is a visionary entrepreneur passionate about empowering women in business and fostering innovation in her community.

As the founder of Elevate Studio, she has helped countless businesses unlock their full potential. Her work is driven by authenticity, creativity, and impact.

Whether you're a startup or an established brand, Sarah is here to help you create meaningful change.`,
    habits: [
      { rule: 'ai-vocabulary', name: 'Words AI leans on', examples: ['empowering', 'fostering', 'elevate', 'unlock their full potential'], text: 'Say what you do for people in plain words.' },
      { rule: 'empty-adjective', name: 'Empty adjectives', examples: ['meaningful change'], text: 'Name one thing a client or customer got.' },
      { rule: 'over-qualified', name: 'Vague amounts', examples: ['countless businesses'], text: 'Give the real number, even if it is small.' },
      { rule: 'triad', name: 'Lists of three values', examples: ['authenticity, creativity, and impact'], text: 'Pick one and back it with something you did.' },
      { rule: 'whether-youre', name: 'Speaking to everyone at once', examples: ['Whether you\'re a startup or an established brand'], text: 'Name the one reader the page is for.' },
    ],
  },
];

const byPath = new Map(USE_CASES.map((u) => [u.path, u]));
export const useCaseFor = (path: string) => byPath.get(path);

/** The words a person reads on a use-case page, without the sample in the box. Used to check the copy with tells itself. */
export function useCaseCopy(u: UseCase): string {
  return [u.h1, u.lede, u.description, ...u.habits.map((h) => `${h.name}. ${h.text}`), ...(u.notes ?? []), BOX_NOTE, HABITS_INTRO, CANT_DO, VOICE_INTRO, u.label].join('\n\n');
}

const BOX_NOTE = 'The example in the box was written by AI. Replace it with yours. Marked lines show what to change, and the rewrite button fixes only those.';
const HABITS_INTRO = 'These came up most when we ran AI-written examples of this kind of writing through tells.';

const CANT_DO = `tells looks for habits that show up far more often in AI-written text than in writing by people. People have these habits too, so a marked line does not prove AI wrote it, and a clean result does not prove a person did. In its last held-out test, ${BENCH.freshHumanFlagged} of ${BENCH.freshHuman} texts by people got a warning, but no test covers every writer. Use it to make your own writing sound more like you. Please do not use it to accuse anyone.`;

const VOICE_INTRO = 'Paste ten or more things you wrote yourself, such as messages, posts or emails, with a line of three dashes between them. tells learns how you write and can rewrite the draft above in your voice, keeping every fact and adding none.';

export function useCasePage(u: UseCase, opts: PageOpts): string {
  const others = USE_LINKS.filter((l) => l.path !== u.path);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${headMeta({ title: u.title, description: u.description, path: u.path, name: `tells: ${u.h1}` })}
<style>
${STYLE}
</style>
</head>
<body>
<main class="use">
<p class="crumb"><a href="/">tells</a></p>
<h1>${esc(u.h1)}</h1>
<p class="lede">${esc(u.lede)}</p>

${checkerPanel(opts, { sample: u.sample, register: u.register, label: u.label })}
<p class="muted">${esc(BOX_NOTE)}</p>

<h2>What gives it away</h2>
<p>${esc(HABITS_INTRO)}</p>
<ol class="habits">
${u.habits.map((h) => `  <li><b>${esc(h.name)}</b>${h.examples.length ? `<span class="ex">${h.examples.map((e) => `“${esc(e)}”`).join(', ')}</span> ` : ''}${esc(h.text)}</li>`).join('\n')}
</ol>
${(u.notes ?? []).map((n) => `<p>${esc(n)}</p>`).join('\n')}

<h2>Sound like you</h2>
<p>${esc(VOICE_INTRO)}</p>
${voicePanel(opts)}

<h2>What tells can't do</h2>
<p>${esc(CANT_DO)}</p>

<h2>Check other writing</h2>
<ul class="uses-list">
${others.map((l) => `  <li><a href="${l.path}">${esc(l.label)}</a></li>`).join('\n')}
  <li><a href="/">Check any text</a></li>
</ul>

${siteFooter(false)}
</main>
${pageScript(opts)}
</body>
</html>`;
}

/** sitemap.xml for the home page and every use-case page. */
export function sitemapXml(site: string): string {
  const urls = ['/', ...USE_CASES.map((u) => u.path)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n')}
</urlset>
`;
}

export function robotsTxt(site: string): string {
  return `User-agent: *
Allow: /
Disallow: /v1/

Sitemap: ${site}/sitemap.xml
`;
}
