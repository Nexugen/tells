/**
 * Prompts for the fresh held-out rounds. Written after the v2 bank and kept apart from it:
 * different jobs, different topics, and adversarial instructions the training data never saw.
 *
 *   node --experimental-strip-types bench/fresh-prompts.ts 1     writes bench/fresh-1/prompts.json
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Register } from '../src/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const h = (s: string) => parseInt(createHash('sha256').update(s).digest('hex').slice(0, 8), 16);

interface Job { genre: string; register: Register; template: (t: string) => string; topics: string[] }

const ROUNDS: Record<number, { adv: string[]; jobs: Job[] }> = {
  2: {
    adv: [
      'Write it so nobody could tell it came from an AI. Be specific and a little messy.',
      'Sound like a tired person writing at the end of a long day.',
      'No bullet points, no bold, no dashes, no sign-off, and no summary at the end.',
      'Use American spelling, plain words, and at least one sentence fragment.',
      'Write like a regular person on a forum, not like a writer.',
      'Make it read like a first draft that was never edited.',
    ],
    jobs: [
      { genre: 'chat', register: 'casual', template: (t) => `Write a text ${t}.`, topics: ['to your mum saying you got home safe after the drive', 'to a friend asking if they want your old sofa', 'to a coworker saying you left your badge at home', 'to a friend after a bad first date', 'to your landlord saying the heating is back on', 'to a cousin asking for their wifi password'] },
      { genre: 'email', register: 'professional', template: (t) => `Write a work email ${t}.`, topics: ['asking a colleague for the latest sales figures before Thursday', 'to a supplier disputing an invoice that charges for 40 units instead of 30', 'to a customer explaining their warranty has expired but offering a repair price', 'to a new hire about their first day', 'to a client sending meeting notes and two action items', 'to your team about the holiday rota', 'to a venue asking to book a room for a 30-person workshop', 'to a manager asking to work from home on Fridays'] },
      { genre: 'qa', register: 'casual', template: (t) => `Someone asks online: "${t}" Write a helpful reply of up to 170 words.`, topics: ['How do I get rid of fruit flies in my kitchen?', 'Is it worth buying a bread maker?', 'What is the best way to learn chess as an adult?', 'How do I stop my puppy biting?', 'Should I fix my old phone or buy a new one?', 'How do I keep basil alive indoors?', 'What should I do if my boss keeps changing deadlines?', 'How do I get better at public speaking?'] },
      { genre: 'qa', register: 'technical', template: (t) => `Answer on a programming forum, under 200 words: "${t}"`, topics: ['Why does my Java app use so much memory?', 'How do I undo the last git commit but keep my changes?', 'What is the difference between a mutex and a semaphore?', 'Why is my REST API slow under load?', 'Should I learn Vue or React first?', 'Why does my CSS grid overflow on small screens?'] },
      { genre: 'docs', register: 'technical', template: (t) => `Write ${t}.`, topics: ['the README intro for a library that validates postcodes', 'a changelog entry for version 0.9 of a CLI that syncs dotfiles', 'a wiki page explaining how on-call handover works', 'a bug report for a calendar app that shows events an hour late after the clocks change', 'a short description of a feature flag system for new engineers'] },
      { genre: 'comment', register: 'casual', template: (t) => `Write a comment on a news site ${t}. One or two paragraphs.`, topics: ['about a plan to close a local post office', 'about rising train fares', 'about a new cycle lane on your street', 'about a school banning homework', 'about a supermarket removing self-checkouts', 'about a city getting a new football stadium'] },
      { genre: 'blog', register: 'casual', template: (t) => `Write a blog post ${t}. About 250 words.`, topics: ['about your first year running a small bakery', 'about walking the length of a canal', 'about getting back into drawing', 'about a family recipe you finally got right', 'about volunteering at a food bank'] },
      { genre: 'essay', register: 'professional', template: (t) => `Write a 350-word essay for a class on whether ${t}.`, topics: ['social media does more harm than good to teenagers', 'cities should ban cars from their centres', 'school should teach personal finance', 'space exploration is worth the money', 'students should be paid for good grades'] },
      { genre: 'fiction', register: 'professional', template: (t) => `Write the opening 300 words of a short story ${t}.`, topics: ['about a woman who inherits a failing cinema', 'about two neighbours who have not spoken in twenty years', 'set on the last bus of the night', 'about a boy who finds a key in a fish', 'about a translator who mistranslates on purpose'] },
      { genre: 'news', register: 'professional', template: (t) => `Write a 250-word local news report ${t}.`, topics: ['about a library fine amnesty', 'about a heatwave closing schools early', 'about a village shop saved by residents', 'about a new night bus route', 'about a stolen statue being returned'] },
      { genre: 'marketing', register: 'marketing', template: (t) => `Write ${t}.`, topics: ['a product description for a hand-knitted wool hat', 'a homepage for a dog grooming salon', 'a launch announcement for a meditation app', 'an email for a bookshop\'s summer reading club', 'a Facebook ad for a driving school', 'a listing for a two-bedroom flat to rent', 'copy for a craft brewery\'s new pale ale', 'a short promo for a community theatre play'] },
      { genre: 'review', register: 'casual', template: (t) => `Write a review ${t}. About 120 words.`, topics: ['of a budget airline flight', 'of a pizza place that changed owners', 'of a cheap Bluetooth speaker', 'of a hotel breakfast', 'of a language course'] },
      { genre: 'letter', register: 'casual', template: (t) => `Write a letter ${t}. About 200 words.`, topics: ['to a friend you lost touch with', 'to your future self in ten years', 'thanking a nurse who looked after your father'] },
    ],
  },
  1: {
    adv: [
      'Write this so that an AI detector would be sure a person wrote it.',
      'Type it the way you would on your phone, quickly, without polishing.',
      'Use British spelling and a dry sense of humour. No em dashes.',
      'Short sentences only. No lists, no headings, no sign-off.',
      'Leave in a typo or two and one sentence that trails off, like a real draft.',
      'Do not sound like ChatGPT or Claude in any way.',
    ],
    jobs: [
      { genre: 'chat', register: 'casual', template: (t) => `Send a WhatsApp message ${t}.`, topics: ['to your brother asking if he can pick up mum from the station on Friday', 'to a friend saying the concert tickets sold out in four minutes', 'to your flatmate about the washing machine leaking again', 'to a group of friends proposing a picnic if the rain stops', 'to a friend who just had a baby', 'to your partner asking what to cook tonight', 'to an old classmate who messaged you after ten years', 'to your neighbour asking them to move their car'] },
      { genre: 'email', register: 'professional', template: (t) => `Draft an email ${t}.`, topics: ['asking a printer for a quote on 500 flyers', 'telling a client their order shipped late because of a strike at the port', 'inviting a guest speaker to a school careers day', 'asking HR how many holiday days carry over to next year', 'following up after a sales call with a dental practice', 'turning down a job offer you accepted last week', 'asking a landlord to return a deposit', 'telling a team the office move is delayed until March', 'requesting a meeting with your child\'s teacher', 'thanking a mentor after a promotion'] },
      { genre: 'qa', register: 'casual', template: (t) => `Answer this question from a forum, in under 180 words: "${t}"`, topics: ['How do I stop my glasses fogging up with a mask?', 'Why does my sourdough not rise in winter?', 'Is it worth fixing a ten-year-old washing machine?', 'How do I get my cat to stop waking me at 5am?', 'What should I pack for a week of hiking in Scotland?', 'How do you clean a burnt saucepan?', 'Can I plant tulip bulbs in December?', 'How do I make friends after moving to a new country?', 'Why does my violin sound scratchy?', 'Is it rude to recline your seat on a plane?'] },
      { genre: 'qa', register: 'technical', template: (t) => `Answer this question on a developer forum, in under 200 words: "${t}"`, topics: ['Why is my Postgres query not using the index I added?', 'What is the difference between TCP and UDP for a game server?', 'Should I store images in the database or in object storage?', 'Why does my Kubernetes pod keep restarting?', 'Is it bad to use git push --force on my own branch?', 'What does a 502 Bad Gateway from nginx usually mean?', 'How do I make my bash script stop on the first error?', 'Why does my Python list change when I modify a copy?'] },
      { genre: 'docs', register: 'technical', template: (t) => `Write ${t}.`, topics: ['the opening section of a README for a tiny tool that renames photos by the date they were taken', 'release notes for version 3.1 of a Markdown editor: adds tables, fixes a crash on paste, drops Windows 7', 'a short explanation for a wiki of how the team reviews database migrations', 'a GitHub issue describing a bug where the search box ignores accented letters', 'the help text for a --since flag that filters log lines by time', 'an incident note about a cache that served stale prices for 20 minutes'] },
      { genre: 'comment', register: 'casual', template: (t) => `Write a reply in a discussion thread ${t}. One or two paragraphs.`, topics: ['about whether it is worth learning to drive in a big city', 'about the best cheap meal you know how to cook', 'about whether audiobooks count as reading', 'replying to someone who says nobody needs a desktop computer any more', 'about a teacher who was unfair to you', 'about switching careers at 40', 'about the oddest thing you found in a second-hand book', 'about whether people should still send Christmas cards'] },
      { genre: 'blog', register: 'casual', template: (t) => `Write a short personal blog entry ${t}. Around 250 words.`, topics: ['about the first time you tried sea swimming in winter', 'about clearing out your late grandfather\'s shed', 'about a month without a smartphone', 'about learning to knit from videos', 'about the allotment you took over this spring', 'about getting lost in Tokyo'] },
      { genre: 'essay', register: 'professional', template: (t) => `Write a school essay of about 350 words arguing ${t}.`, topics: ['whether students should wear uniforms', 'whether zoos should exist', 'whether homework should be banned in primary school', 'whether voting should be compulsory', 'whether video games can be art', 'whether the school day should be shorter'] },
      { genre: 'fiction', register: 'professional', template: (t) => `Write the first 300 words of a story ${t}.`, topics: ['about a postman who reads one letter too many', 'set in a power station during a blackout', 'about twin sisters who swap lives for a day', 'about an old man teaching a crow to talk', 'about a lift that stops between floors with three strangers inside', 'about a village where it has not rained in a year'] },
      { genre: 'news', register: 'professional', template: (t) => `Write a 250-word news story ${t}.`, topics: ['about a ferry service cancelled for a week by storms', 'about a school that switched to a four-day week', 'about a town opening its first public swimming pool in fifty years', 'about a hospital car park charging scheme being scrapped', 'about a record turnout at a regional book festival'] },
      { genre: 'marketing', register: 'marketing', template: (t) => `Write ${t}.`, topics: ['website copy for a mobile bike repair van', 'a product listing for a hand-thrown ceramic teapot', 'a launch post for a budgeting app for students', 'an email announcing a cinema\'s new loyalty card', 'a short ad for a weekend sourdough course', 'the about page for a small translation agency', 'a social post announcing a vegan bakery\'s second shop', 'app store copy for a bird identification app', 'a newsletter intro for a garden centre\'s autumn sale', 'a landing page for an invoicing tool for plumbers'] },
      { genre: 'review', register: 'casual', template: (t) => `Write a customer review ${t}. Around 120 words.`, topics: ['of an electric toothbrush', 'of a Greek restaurant that was too loud', 'of a guided kayak tour', 'of a co-working space', 'of a children\'s book about dinosaurs'] },
      { genre: 'letter', register: 'casual', template: (t) => `Write a handwritten-style letter ${t}. About 200 words.`, topics: ['to your grandmother about your first job', 'to a friend in prison', 'to a neighbour who is moving away', 'to your old school on its centenary'] },
    ],
  },
};

const n = Number(process.argv[2] ?? '1');
const round = ROUNDS[n];
if (!round) throw new Error(`no round ${n}`);
const prompts = [];
for (const job of round.jobs) {
  for (const topic of job.topics) {
    const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
    const family = `fresh${n}:${job.genre}:${slug}`;
    const base = job.template(topic);
    prompts.push({ id: `${family}#plain`, family, genre: job.genre, register: job.register, variant: 'plain', adversarial: false, prompt: base });
    const k = h(family);
    if (k % 5 < 3) {
      const v = (k >>> 4) % round.adv.length;
      prompts.push({ id: `${family}#adv${v}`, family, genre: job.genre, register: job.register, variant: `adv${v}`, adversarial: true, prompt: `${base} ${round.adv[v]}` });
    }
  }
}
mkdirSync(join(here, `fresh-${n}`), { recursive: true });
writeFileSync(join(here, `fresh-${n}`, 'prompts.json'), JSON.stringify({ version: 1, round: n, prompts }, null, 1) + '\n');
console.log(prompts.length, prompts.filter((p) => p.adversarial).length, 'adversarial');
