/**
 * Builds bench/prompts-topic.json: model answers about the topics the human additions talk about
 * (software, apps, AI and machine learning, startups, pricing, customers), in the genres those
 * people wrote in (forum posts, Hacker News style comments, GitHub issue comments, chat with a
 * colleague or co-founder, emails to customers).
 *
 *   node --experimental-strip-types bench/topic-prompts.ts
 *
 * Without these, every human text about AI or apps would sit on the human side with nothing
 * from a model on the same subject, and the score could learn the topic instead of the style.
 * About half the families get an adversarial version, and the "loose" one asks for lowercase
 * typing, so lowercase is not something only people do in the data.
 *
 * No topic here may paraphrase a probe text (bench/EVAL.md): the probe has to stay unseen.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Register } from '../src/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const h = (s: string) => parseInt(createHash('sha256').update(s).digest('hex').slice(0, 8), 16);

const ADV = [
  'Type it the way people actually type in chat: all lowercase, quick, a typo or two, no polishing.',
  'Write it the way a real person would, not like an AI.',
  'No em dashes, no lists, no headings, no bold, no sign-off.',
  'Make it read like a first draft that nobody edited.',
];

interface Job { genre: string; register: Register; template: (t: string) => string; topics: string[] }

const JOBS: Job[] = [
  {
    genre: 'chat', register: 'casual', template: (t) => `Write a chat message to your co-founder ${t}. Three to seven sentences.`,
    topics: [
      'saying the new onboarding email is converting better',
      'about a competitor that just raised a big round',
      'asking whether to offer an annual plan with a discount', 'asking whether to pause the free tier', 'about which AI model to switch the app to', 'about the server bill doubling this month',
      'about a bug that only happens on Android', 'about whether to hire a contractor for the mobile app', 'about a user who churned after a week',
    ],
  },
  {
    genre: 'chat', register: 'casual', template: (t) => `Write a Slack message to a coworker ${t}. Two to six sentences.`,
    topics: [
      'asking them to review your pull request before lunch', 'saying the staging deploy is broken again', 'asking if the ML model retrain finished overnight',
      'saying the app store rejected the build', 'about the analytics dashboard showing zero signups', 'asking who owns the billing webhook',
      'saying the GPU instance was left running all weekend', 'asking whether the chatbot should say it is a bot',
    ],
  },
  {
    genre: 'comment', register: 'casual', template: (t) => `Write a Hacker News comment ${t}. One to three paragraphs.`,
    topics: [
      'on a thread about GPT-3 writing code', 'on a launch post for a no-code app builder', 'about why most startups underprice their product', 'about whether AI will replace junior developers',
      'on a thread about the App Store taking a 30% cut', 'about self-driving cars being further off than promised', 'about running a profitable side project', 'on a post about a company moving off the cloud',
      'about recommendation algorithms on social media', 'on a thread about remote work after the pandemic', 'about Copilot suggesting licensed code', 'about building a SaaS as a solo founder',
      'about deep learning hype in medical imaging', 'about why enterprise software is so bad', 'about subscription fatigue for mobile apps', 'on a thread about a data breach at a big company',
    ],
  },
  {
    genre: 'forum', register: 'casual', template: (t) => `Write a Reddit post ${t}. About 150 words.`,
    topics: [
      'in r/startups asking how to find the first ten customers', 'in r/Entrepreneur about quitting a job to run an app full time', 'in r/smallbusiness asking whether to build an app or a website',
      'in r/MachineLearning asking how to get into the field without a PhD', 'in r/Android complaining about battery life after an update', 'in r/cscareerquestions about a bad technical interview',
      'in r/personalfinance about whether to invest in AI stocks', 'in r/webdev about a client who will not pay', 'in r/iphone about an app that keeps asking for a review', 'in r/freelance about raising your rates',
      'in r/technology about a smart speaker listening in', 'in r/SaaS asking how to price per seat or per usage',
    ],
  },
  {
    genre: 'comment', register: 'technical', template: (t) => `Write a GitHub issue comment ${t}. One or two paragraphs, no code block.`,
    topics: [
      'saying the fix in the latest release did not solve your crash on startup', 'on a feature request for dark mode in a mobile app', 'reporting that the model gives different results on GPU and CPU',
      'asking when the next release with the tokenizer fix is coming out', 'explaining a workaround for a build that fails on M1 Macs', 'saying the stable diffusion web UI runs out of memory at 768 pixels',
      'on a pull request that changes the default learning rate', 'asking maintainers whether a paid tier would fund the project', 'about push notifications not arriving on iOS', 'saying a docs example for fine-tuning is outdated',
    ],
  },
  {
    genre: 'email', register: 'professional', template: (t) => `Write an email ${t}.`,
    topics: [
      'to a customer explaining a price rise on your software plan', 'to a client handing over the code of an app you built for them', 'to a beta user asking for feedback on the AI assistant',
      'to a prospect in the US following up after a demo', 'to a customer whose subscription payment failed', 'to an investor with a short monthly update on the app',
    ],
  },
  {
    genre: 'qa', register: 'casual', template: (t) => `Someone asks online: "${t}" Write a reply of up to 170 words.`,
    topics: [
      'Is it worth paying for an AI writing tool?', 'How do I know if my app idea is any good?', 'Should I learn machine learning or web development first?', 'How do apps make money if they are free?',
      'Can I build an app without knowing how to code?', 'How do I price my first freelance web project?', 'Is it safe to put my business data into a chatbot?', 'Why do so many startups fail in the first year?',
    ],
  },
];

// Longer chat messages, everyday and work, so chat of 60+ words is not only from people.
JOBS.push(
  {
    genre: 'chat', register: 'casual', template: (t) => `Write a long chat message (five to nine sentences) ${t}.`,
    topics: [
      'to a friend about a weekend trip that went wrong', 'to your sister about planning your dad\'s 60th birthday', 'to a friend explaining why you are moving cities',
      'to your partner about splitting the bills differently', 'to a group chat proposing a five-a-side football night', 'to a friend asking for advice on buying a used car',
      'to your flatmate about a cleaning rota', 'to a friend after a job interview that went badly', 'to your brother about your mum\'s health appointment',
      'to a friend recommending a TV series and why', 'to an old friend you have not spoken to in a year', 'to a neighbour about a parcel they took in for you',
      'to a friend about your new puppy keeping you awake', 'to a friend asking to borrow money and promising to pay it back', 'to your cousin about a family argument at dinner',
      'to a friend about trying to get fit again', 'to a group chat about who is driving to the wedding', 'to your landlord about a broken window, in a friendly tone',
    ],
  },
  {
    genre: 'chat', register: 'casual', template: (t) => `Write a long message (five to nine sentences) to a colleague or helper ${t}.`,
    topics: [
      'asking an IRC channel for help because your laptop will not boot after an update', 'explaining to a support chat that your router port forwarding is not working',
      'asking a friend who codes whether your app idea makes sense', 'asking a forum helper why your printer stopped working on Linux', 'asking a teammate to look at a failing test before the release', 'asking a freelancer to quote for a mobile app',
    ],
  },
);

// A third set of chat, everyday and hobby topics with a few tech ones, four to eight sentences.
JOBS.push({
  genre: 'chat', register: 'casual', template: (t) => `Write a chat message ${t}. Four to eight sentences, as one message.`,
  topics: [
    'to a friend about a concert you went to last night', 'to your mum about what to bring for Sunday lunch', 'to a friend whose dog just died', 'to a group chat organising a camping trip',
    'to a friend about a book club pick you hated', 'to your brother about fixing the leaking tap at your parents', 'to a friend asking how their new job is going', 'to your partner about a holiday you want to book',
    'to a friend about trying a new recipe that flopped', 'to a coworker about the office fridge situation', 'to a friend about learning guitar', 'to a friend about a bad haircut',
    'to your housemate about having friends over on Saturday', 'to a friend about a football match result', 'to a friend about getting a tattoo', 'to your aunt thanking her for a birthday present',
    'to a friend asking for help moving house', 'to a friend about a series finale', 'to your sister about babysitting next week', 'to a friend about planting a vegetable garden',
    'to a friend about a long delayed train', 'to your neighbour about their noisy party, nicely', 'to a friend about starting therapy', 'to a friend about a wedding speech you have to give',
    'to a gaming friend about a raid that went badly', 'to a friend asking if their phone has the same bug after an update', 'to a friend about building your first PC', 'to a friend about a smart watch you regret buying',
    'to a coworker about a meeting that ran over', 'to a friend about a job offer in another country', 'to a friend about a hiking route', 'to your dad about setting up his new tablet',
    'to a friend about a terrible flatshare viewing', 'to a group chat about a friend\'s surprise party', 'to a friend about quitting sugar', 'to a classmate about a group project nobody is doing',
    'to a friend about a stray cat you keep feeding', 'to a friend recommending a cheap restaurant', 'to a friend about losing your keys again', 'to your grandma about your exam results',
  ],
});

const prompts = [];
for (const job of JOBS) {
  for (const topic of job.topics) {
    const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
    const family = `topic:${job.genre}:${slug}`;
    const base = job.template(topic);
    prompts.push({ id: `${family}#plain`, family, genre: job.genre, register: job.register, variant: 'plain', adversarial: false, prompt: base });
    const k = h(family);
    if (k % 10 < 6) {
      const v = (k >>> 4) % ADV.length;
      prompts.push({ id: `${family}#adv${v}`, family, genre: job.genre, register: job.register, variant: `adv${v}`, adversarial: true, prompt: `${base} ${ADV[v]}` });
    }
  }
}
writeFileSync(join(here, 'prompts-topic.json'), JSON.stringify({ version: 1, prompts }, null, 1) + '\n');
console.log(prompts.length, prompts.filter((p) => p.adversarial).length, 'adversarial');
