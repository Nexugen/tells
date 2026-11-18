/**
 * Builds bench/prompts-v2.json: everyday writing jobs across genres and registers, each with a
 * plain version and, for some, an adversarial version that asks the model to sound human.
 *
 *   node --experimental-strip-types bench/prompt-bank.ts
 *
 * Every prompt has a `family` (genre plus topic). Splits are made by family, so a topic's plain
 * and adversarial answers always land on the same side. Essay topics that match a human corpus
 * (PERSUADE, ELLIPSE) use that corpus's group key as the family, so the topic sits on one side
 * for people and models alike.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Register } from '../src/types.ts';

const here = dirname(fileURLToPath(import.meta.url));

export interface BankPrompt {
  id: string;
  family: string;
  genre: string;
  register: Register;
  variant: string;
  adversarial: boolean;
  prompt: string;
}

const h = (s: string) => parseInt(createHash('sha256').update(s).digest('hex').slice(0, 8), 16);

interface Genre {
  genre: string;
  register: Register;
  template: (topic: string) => string;
  topics: string[];
  /** Adversarial variants that make sense for this genre. */
  adv: string[];
  familyPrefix?: string;
}

const ADV: Record<string, string> = {
  human: 'Write it the way a real person would, not like an AI. Nothing that sounds machine-written.',
  nodash: 'Do not use em dashes, bullet points, headings or bold.',
  loose: 'Keep it loose, the way people actually type it. Lowercase and fragments are fine.',
  detail: 'Make it sound human: vary sentence length, use contractions, and include one small personal detail.',
  nonnative: 'Write it as a fluent but non-native English speaker would, with a few small natural mistakes.',
  student: 'Write it as a 10th grade student would, not as a polished writer.',
  plainwords: 'Avoid words like delve, tapestry, testament, seamless, robust, leverage, elevate and crucial. No em dashes.',
  noai: 'It must pass as human-written. Avoid the usual AI phrasing and structure.',
};

const GENRES: Genre[] = [
  {
    genre: 'chat', register: 'casual', adv: ['loose', 'human', 'nodash'],
    template: (t) => `Write a text message to a friend ${t}. Two to five sentences.`,
    topics: [
      'saying you finally finished the bookshelf you have been building for a month', 'asking if they still have your camping stove', 'telling them the band you both like is playing in town in May',
      'apologising for missing their birthday drinks because of a work deadline', 'asking for their lasagne recipe', 'recommending a podcast about the history of maps',
      'complaining that your landlord still has not fixed the boiler', 'asking whether they want to split a cabin for a long weekend', 'telling them you got the job you interviewed for',
      'checking how their first week at the new school went for their kid', 'asking to borrow their drill on Sunday', 'saying your cat knocked your phone into the bath',
      'asking which day works for helping you paint the kitchen', 'telling them you started running again and it is going badly', 'asking if they watched the season finale yet',
      'suggesting a board game night next Friday', 'telling them their package came to your address by mistake', 'asking how their dad is doing after his surgery',
      'saying you are stuck at the airport because your flight got cancelled', 'asking for a dentist recommendation', 'saying you found their sunglasses in your car',
      'inviting them to try a new ramen place', 'telling them you adopted a dog', 'asking whether they are going to the reunion',
      'saying thanks for the book they lent you and what you thought of the ending', 'asking if they can feed your fish while you are away', 'saying you burned dinner and ordered pizza instead',
      'asking whether the gym near them is any good', 'telling them about a weird dream you had about them', 'asking if they want to go halves on a gift for a mutual friend',
    ],
  },
  {
    genre: 'chat', register: 'casual', adv: ['loose', 'human'], familyPrefix: 'work-chat',
    template: (t) => `Write a Slack message to your team ${t}. Keep it short.`,
    topics: [
      'saying the staging server is down and you are looking into it', 'asking who has the login for the analytics dashboard', 'saying you will be offline Thursday afternoon for a doctor appointment',
      'sharing that the client signed the renewal', 'asking whether anyone else is seeing slow builds today', 'saying you pushed a fix for the date picker bug',
      'asking the team where to order lunch for the offsite', 'reminding everyone that timesheets are due Friday', 'saying the coffee machine on floor two is broken again',
      'asking for a second pair of eyes on a tricky customer email', 'welcoming a new designer who starts today', 'saying the demo went well but the client wants changes to the onboarding flow',
      'asking whether the Monday standup can move to 10:30', 'sharing that the office will be closed on the bank holiday', 'saying you accidentally deleted a shared calendar event and restored it',
      'asking who is going to the conference in Lisbon', 'saying you are out sick today', 'thanking the team for covering during your holiday',
      'flagging that the invoice template has the old company address', 'asking which version of the pitch deck is the latest',
    ],
  },
  {
    genre: 'email', register: 'professional', adv: ['human', 'nodash', 'plainwords'],
    template: (t) => `Write an email ${t}.`,
    topics: [
      'to a supplier asking why the last delivery of paper stock arrived two days late', 'to a colleague handing over a project before you go on parental leave', 'to your manager asking to move your one-to-one to Thursday',
      'to a client confirming the scope and price of a website redesign', 'to a landlord reporting a leaking ceiling in the office kitchen', 'to the finance team asking why an expense claim was rejected',
      'to a job candidate offering them a second interview', 'to a job candidate telling them they did not get the role', 'to a conference organiser declining a speaking invitation',
      'to a vendor cancelling a software subscription at the end of the contract', 'to a team announcing a new process for booking meeting rooms', 'to a customer apologising for a billing error and explaining the refund',
      'to a professor asking for an extension on a paper', 'to a recruiter saying you are not looking right now but open to talk next year', 'to a new client welcoming them and listing next steps',
      'to a colleague in another office introducing two people who should meet', 'to a contractor asking for an updated quote after a change in requirements', 'to a school asking about after-school care places',
      'to a hotel asking to change the dates of a booking for a group of twelve', 'to your team summarising decisions from a budget meeting', 'to a partner organisation proposing a joint event in the autumn',
      'to an insurance company following up on a claim for water damage', 'to a former colleague asking for a reference', 'to IT reporting that your laptop will not connect to the VPN',
      'to a client explaining that a deadline will slip by one week and why', 'to a vendor asking for a discount on a three-year renewal', 'to the building manager asking for parking for two visitors',
      'to all staff about a fire drill next Tuesday at 11am', 'to a customer asking for feedback on a recent installation', 'to a team member giving feedback on a report draft',
      'to a client chasing an unpaid invoice that is 30 days overdue', 'to your accountant sending documents for the tax return', 'to a journalist answering a request for comment about a product recall',
      'to a volunteer group thanking them for organising a charity run', 'to a supplier asking for samples of three fabric types', 'to your team announcing that you are leaving the company',
    ],
  },
  {
    genre: 'email', register: 'casual', adv: ['human', 'loose'], familyPrefix: 'personal-email',
    template: (t) => `Write a personal email ${t}.`,
    topics: [
      'to an old university friend you have not seen in five years', 'to your sister about plans for your parents\' anniversary', 'to a neighbour about trimming the hedge between your gardens',
      'to your book club suggesting next month\'s book', 'to a friend who just moved abroad asking how it is going', 'to your aunt thanking her for a birthday present',
      'to your kid\'s football coach saying they will miss two practices', 'to friends sharing photos from a wedding and some stories from the day', 'to a cousin asking if you can stay with them for a weekend',
      'to a friend recommending a builder who did your bathroom', 'to the other parents organising a carpool for swimming lessons', 'to a former teacher telling them how you are doing',
      'to a friend apologising for a heated argument at dinner', 'to your running club about a route change for Sunday', 'to your grandparents describing your new flat',
    ],
  },
  {
    genre: 'qa', register: 'casual', adv: ['human', 'detail', 'nodash'],
    template: (t) => `Someone on a Q&A forum asks: "${t}" Write an answer. Under 200 words.`,
    topics: [
      'Why does my sourdough starter smell like nail polish remover?', 'Is it safe to leave a laptop plugged in all the time?', 'How do I stop my dog pulling on the lead?',
      'Should I repaint over old gloss paint or sand it first?', 'What is the best way to learn to touch type as an adult?', 'Why do my tomato plants have yellow leaves at the bottom?',
      'Is it rude to bring your own food to a potluck if you have allergies?', 'How do I get over a fear of driving on motorways?', 'Can I use olive oil to season a cast iron pan?',
      'My bike chain keeps falling off when I change gears. What is wrong?', 'How do you deal with a neighbour who plays loud music at night?', 'Is a 20-minute nap actually better than a longer one?',
      'How should I store fresh herbs so they last?', 'What do I do if my toddler refuses to eat vegetables?', 'Why do my houseplants keep getting fungus gnats?',
      'Is it worth getting travel insurance for a short trip in Europe?', 'How do I remove a stripped screw?', 'Should I tell my friend her boyfriend is cheating?',
      'How long should I rest between sets when lifting weights?', 'Why does my rice always come out mushy?', 'How do I ask my boss for more responsibility?',
      'What can I do about a cat that scratches the sofa?', 'Is it okay to wash wool sweaters in the machine?', 'How do I stop procrastinating on my thesis?',
      'How do I tell if eggs are still good?', 'Why does my car smell like burning when I brake?', 'How can I make small talk less awkward?',
      'Is learning two languages at once a bad idea?', 'What is the easiest way to keep a garden alive while on holiday?', 'How do I fix a door that sticks in summer?',
      'What should I look for when buying a used road bike?', 'How do I get my teenager to talk to me more?', 'Why does my bread crust go soft after a few hours?',
      'Should I buy or rent a wetsuit for a week of surfing lessons?', 'How do I politely leave a group chat?', 'What is a good first houseplant for a dark flat?',
      'Can I freeze cooked pasta?', 'How do I handle a coworker who interrupts me in meetings?', 'Is it bad to run every day?',
      'How do I start journaling and actually keep it up?',
    ],
  },
  {
    genre: 'qa', register: 'technical', adv: ['human', 'nodash'], familyPrefix: 'tech-qa',
    template: (t) => `Someone on a programming Q&A site asks: "${t}" Write an answer. Under 220 words, with little or no code.`,
    topics: [
      'Why is my Docker image 2 GB when my app is tiny?', 'What is the difference between a process and a thread?', 'Should I use UUIDs or auto-increment ids as primary keys?',
      'Why does git say my branch has diverged?', 'Why does my Python script get slower the longer it runs?', 'Is it bad to store JWTs in localStorage?',
      'Why does my cron job work by hand but not on schedule?', 'What does "eventual consistency" actually mean in practice?', 'Why does my SQL query get slower with an index?',
      'How do I choose between REST and GraphQL for a small app?', 'Why is my React component rendering twice?', 'What causes "too many open files" on Linux?',
      'Why does floating point say 0.1 + 0.2 is not 0.3?', 'Should I use a monorepo for three small services?', 'Why does SSH ask for my password even though I added my key?',
      'What is the point of a message queue if I already have a database?', 'Why does my website look fine locally but break on mobile?', 'How do I find what is using all the disk space on a server?',
      'Why are my unit tests passing locally but failing in CI?', 'What is the difference between authentication and authorisation?', 'When should I use a hash map versus a sorted array?',
      'Why does my Node server crash with "heap out of memory"?', 'Is it worth learning Rust if I already know Go?', 'How does HTTPS stop someone reading my traffic on public wifi?',
      'Why is my DNS change not showing up?', 'What is a race condition and how do I spot one?', 'Why do people say not to use regex to parse HTML?',
      'How do I safely rename a column in a production database?', 'What is the difference between merge and rebase?', 'Why does my laptop fan spin up when I open the browser?',
    ],
  },
  {
    genre: 'docs', register: 'technical', adv: ['human', 'nodash'],
    template: (t) => `Write ${t}.`,
    topics: [
      'a README introduction for a small library that parses ISO 8601 durations', 'a docs section explaining how to configure retries in an HTTP client library', 'a pull request description for adding pagination to a list endpoint',
      'a changelog entry for a release that drops Node 16 support and fixes a memory leak', 'a code review comment asking for tests on a new date formatting function', 'a short runbook entry for what to do when the job queue backs up',
      'a commit message for fixing an off-by-one error in a CSV parser', 'an internal wiki page explaining how the team names git branches', 'a migration guide paragraph for moving from callbacks to promises in a library',
      'a bug report for a mobile app that crashes when the device language is Turkish', 'a design doc summary proposing to move image resizing to a background worker', 'a postmortem summary for a 40-minute outage caused by an expired TLS certificate',
      'docs for a CLI flag --dry-run that prints what would change without changing it', 'a GitHub issue reply explaining why a feature request will not be accepted', 'an explanation of the difference between soft and hard deletes for a team wiki',
      'a release note for a database client that adds connection pooling', 'a contributing guide paragraph about how to run the tests locally', 'the security section of a README that explains how to report vulnerabilities',
      'an architecture overview paragraph for a web app with a Postgres database and a Redis cache', 'a short tutorial intro for setting up a static site with a custom domain', 'an API docs paragraph for a rate limit of 100 requests per minute per key',
      'a deprecation notice for an old v1 API endpoint that will be removed in six months', 'a code comment block explaining why a function retries exactly three times', 'an onboarding doc paragraph telling new engineers how deploys work',
      'a FAQ answer for why the app needs location permission',
    ],
  },
  {
    genre: 'comment', register: 'casual', adv: ['human', 'loose', 'nodash'],
    template: (t) => `Write a comment for an online discussion thread ${t}. One or two short paragraphs.`,
    topics: [
      'about whether remote work makes junior developers worse', 'disagreeing that electric scooters should be banned from city centres', 'about the best advice you got from a first manager',
      'about why you stopped using social media for a year', 'replying to someone who says college is a waste of money', 'about a bug you once spent a week chasing',
      'about whether open-plan offices should come back', 'about learning to cook in your thirties', 'about a book that changed how you think about money',
      'about whether kids should have phones before age 12', 'arguing that public libraries are underrated', 'about a city you visited that surprised you',
      'replying to someone who says tipping culture is out of control', 'about why you switched from Windows to Linux', 'about the worst job interview you ever had',
      'about whether four-day work weeks are realistic for small businesses', 'about a startup idea that failed and what you learned', 'about why vinyl records are popular again',
      'replying to a post about burnout in nursing', 'about whether self-driving cars will happen in the next ten years', 'about a hobby you picked up during a hard year',
      'about the case for and against homework in primary school', 'about whether tech interviews with whiteboard puzzles are useful', 'about your experience buying a used car',
      'about why old video games felt harder',
    ],
  },
  {
    genre: 'forum', register: 'casual', adv: ['human', 'loose', 'detail'],
    template: (t) => `Write a Reddit-style post ${t}. Around 150 to 250 words.`,
    topics: [
      'asking for advice because your roommate never pays utilities on time', 'telling the story of getting lost on a hike and finding the trail again', 'asking whether you should take a job with more money but a longer commute',
      'about your first month learning the guitar', 'asking how to tell your parents you are dropping out of law school', 'about a funny misunderstanding at a hardware store',
      'asking for help choosing between two used cars', 'about finally paying off your credit card debt', 'asking whether you overreacted when a friend cancelled plans again',
      'about a small win at work that made your week', 'asking for tips on moving to a new city alone', 'about your neighbour\'s chickens escaping into your garden',
      'asking how to deal with a boss who messages you at night', 'about trying to grow vegetables on a balcony', 'asking for advice on a first solo trip abroad',
      'about getting your first rejection from a literary magazine', 'asking whether to confront a coworker who takes credit for your work', 'about adopting a senior dog',
      'asking for budget meal ideas for a student', 'about selling your car and cycling everywhere for a year',
    ],
  },
  {
    genre: 'blog', register: 'casual', adv: ['human', 'detail', 'nodash'],
    template: (t) => `Write a personal blog post ${t}. About 250 words.`,
    topics: [
      'about your weekend trip to the coast', 'about why you quit your job to teach', 'about learning to bake bread during a cold winter',
      'about the day your car broke down on the motorway', 'about a year of keeping a journal', 'about your grandmother\'s garden',
      'about moving back to your hometown', 'about running your first half marathon', 'about what you learned from a failed side project',
      'about the books you read this summer', 'about becoming a parent', 'about a concert that changed your taste in music',
      'about starting therapy', 'about trying to spend nothing for a month', 'about your commute by train',
      'about fixing up an old bicycle', 'about a teacher who mattered to you', 'about living with roommates in your thirties',
      'about giving up coffee', 'about a holiday that went wrong',
    ],
  },
  {
    genre: 'essay', register: 'professional', adv: ['student', 'human', 'nonnative', 'nodash'], familyPrefix: 'persuade',
    template: (t) => `Write an argumentative essay for school on this topic: ${t}. About 350 words.`,
    topics: [
      'Phones and driving', 'Car-free cities', 'Summer projects', 'Mandatory extracurricular activities', 'Exploring Venus', 'Facial action coding system', 'The Face on Mars',
      'Community service', 'Grades for extracurricular activities', 'Driverless cars', 'Does the electoral college work?', 'Cell phones at school', 'Distance learning', 'Seeking multiple opinions',
      'A Cowboy Who Rode the Waves',
    ],
  },
  {
    genre: 'essay', register: 'professional', adv: ['nonnative', 'student', 'human'], familyPrefix: 'ellipse',
    template: (t) => `Write a short essay for an English class answering this question: ${t} About 300 words.`,
    topics: [
      'Should students be required to take a year of community service before graduating?', 'Is it better to work in a team or alone?', 'Should schools have a four-day week?',
      'Is it better to learn from your own mistakes or from others\' advice?', 'Should students choose their own classes?', 'What makes a good friend?',
      'Should young people start working part-time jobs in high school?', 'Is technology making people less social?', 'Should school start later in the morning?',
      'Is it important to have a positive attitude?', 'Should students be allowed to take classes online from home?', 'What is the best age to start a career?',
    ],
  },
  {
    genre: 'essay', register: 'professional', adv: ['human', 'nodash', 'plainwords'], familyPrefix: 'reflective',
    template: (t) => `Write a reflective essay of about 400 words ${t}.`,
    topics: [
      'on the value of boredom', 'on walking in cities at night', 'on why we keep old letters', 'on friendship between generations', 'on the pleasure of reading slowly',
      'on travelling alone', 'on growing up in a small town', 'on the habit of making lists', 'on public transport as a place to watch people', 'on learning to fail',
      'on the ethics of eating meat', 'on what we owe our neighbours', 'on the decline of handwriting', 'on idleness', 'on the seasons',
    ],
  },
  {
    genre: 'letter', register: 'casual', adv: ['human', 'detail'],
    template: (t) => `Write a letter ${t}. About 250 words.`,
    topics: [
      'to your younger self at sixteen', 'from a soldier to his mother in 1917', 'to a pen pal in another country describing your town', 'to a friend who is grieving',
      'to your future child', 'from a traveller in Rome to a friend back home in 1890', 'to the editor of a local newspaper about a closing library', 'to a teacher thanking them',
      'to a brother you have fallen out with', 'from a farmer to a relative describing the harvest',
    ],
  },
  {
    genre: 'fiction', register: 'professional', adv: ['human', 'nodash', 'noai'],
    template: (t) => `Write the opening of a short story ${t}. About 300 words.`,
    topics: [
      'about a lighthouse keeper who finds a stranger on the rocks', 'about two brothers selling their late father\'s house', 'set in a laundromat at 3am',
      'about a girl who can hear what plants think', 'about a retired detective who takes one last case', 'about a wedding where the groom does not show up',
      'about a night shift nurse', 'set on a long train journey across Siberia', 'about a boy who finds a letter in a library book', 'about a chef who loses her sense of taste',
      'about the last day of summer camp', 'about a small-town mayor hiding a secret', 'about a woman who returns to her childhood home after thirty years',
      'about a robot that wants to retire', 'about a man who misses the last ferry', 'about a marriage told through grocery lists', 'about a forger of old maps',
      'about a storm that cuts off a village', 'about a teenage chess prodigy', 'about a ghost who is bad at haunting',
    ],
  },
  {
    genre: 'fiction', register: 'casual', adv: ['human', 'noai'], familyPrefix: 'dialogue',
    template: (t) => `Write a short scene, mostly dialogue, ${t}. About 250 words.`,
    topics: [
      'between a mother and daughter arguing about a tattoo', 'between two old friends meeting by chance at an airport', 'between a customer and a tired waiter',
      'between two roommates deciding who gets the bigger room', 'between a detective and a nervous witness', 'between a couple lost on a road trip',
      'between a teacher and a student caught cheating', 'between two kids planning a treehouse', 'between a landlord and a tenant who is behind on rent', 'between strangers stuck in a lift',
    ],
  },
  {
    genre: 'news', register: 'professional', adv: ['human', 'nodash'],
    template: (t) => `Write a short local news article ${t}. About 250 words.`,
    topics: [
      'about a city council voting to extend bike lanes', 'about a bakery that has been open for 100 years', 'about flooding closing a main road',
      'about a high school robotics team winning a regional competition', 'about a new hospital wing opening', 'about a power cut affecting 4,000 homes',
      'about a library launching a seed lending scheme', 'about a factory closing and 200 jobs lost', 'about a marathon raising money for a children\'s charity',
      'about a rare bird spotted in a city park', 'about rising rents in a university town', 'about a bridge closing for repairs for six months',
      'about a local election result', 'about a museum returning artefacts to their country of origin', 'about a school banning phones in class',
    ],
  },
  {
    genre: 'guidance', register: 'professional', adv: ['nodash', 'plainwords'],
    template: (t) => `Write a short public guidance page from a government agency ${t}. About 250 words.`,
    topics: [
      'explaining how to apply for a parking permit', 'about what to do if your home is flooded', 'explaining how to report a pothole', 'about keeping warm and safe in cold weather',
      'about registering a birth', 'about renewing a passport for a child', 'about recycling rules for households', 'about applying for a small business grant',
      'about food hygiene ratings for restaurants', 'about what to do if you lose your job', 'about getting a fishing licence', 'about school admissions deadlines',
    ],
  },
  {
    genre: 'marketing', register: 'marketing', adv: ['human', 'nodash', 'plainwords', 'noai'],
    template: (t) => `Write ${t}.`,
    topics: [
      'a product description for a handmade leather wallet', 'the homepage hero text for an accounting app for freelancers', 'a launch announcement for a new flavour of oat milk',
      'an email newsletter intro for a bike shop\'s spring sale', 'a social post announcing a bakery\'s new Sunday opening hours', 'a product page for noise-cancelling headphones',
      'a landing page section for a language learning app', 'a launch post for a password manager\'s new family plan', 'an Instagram caption for a coffee roaster\'s new single-origin beans',
      'a press release for a startup that raised a seed round to build solar-powered fridges', 'an ad for a weekend pottery class', 'a product description for a kids\' raincoat',
      'a landing page for a project management tool aimed at construction firms', 'a LinkedIn post announcing a company\'s tenth anniversary', 'an app store description for a habit tracker',
      'a crowdfunding page intro for a card game about birds', 'a newsletter announcing a gym\'s new outdoor classes', 'a product page for a standing desk',
      'a short ad script for a local plumbing company', 'a tweet announcing a podcast\'s 100th episode', 'a hotel description for a booking site, a small inn by a lake',
      'a launch email for a meal kit service adding vegetarian boxes', 'a website about page for a family-run hardware store', 'a product description for organic dog treats',
      'an event page for a free coding workshop for teenagers', 'a release announcement for an open-source text editor\'s version 2.0', 'the pricing page copy for a website builder',
      'a social post for a bookshop\'s author signing event', 'a brochure paragraph for a yoga retreat in Portugal', 'a feature announcement for a banking app that now splits bills',
      'a sales email to restaurants for a table booking system', 'a product page for a reusable silicone food bag', 'a Facebook post for a farmers market opening for the season',
      'a homepage for a dog walking business', 'an announcement for a SaaS product\'s new AI-free privacy mode', 'a menu description for a new brunch menu at a cafe',
      'a cold outreach email offering web design services to small businesses', 'a product launch post for a budget e-reader', 'a fundraising appeal email for an animal shelter',
      'a short promotional blurb for a city walking tour',
    ],
  },
  {
    genre: 'review', register: 'casual', adv: ['human', 'loose', 'detail'],
    template: (t) => `Write an online review ${t}. About 150 words.`,
    topics: [
      'of a Thai restaurant you went to for a birthday dinner', 'of a budget hotel near a train station', 'of a cordless vacuum cleaner after six months', 'of a novel you found disappointing',
      'of a dentist\'s office', 'of a hiking backpack', 'of a car rental company at an airport', 'of a video game you played over the holidays', 'of a local plumber', 'of a coffee grinder',
      'of a yoga studio', 'of a camping site by a river', 'of a pair of running shoes', 'of a museum exhibition about ancient Egypt', 'of a phone case',
    ],
  },
  // Added in the second round, to match the human sources for jobs, reviews and marketing, and
  // to have chat messages long enough to score.
  {
    genre: 'marketing', register: 'marketing', adv: ['human', 'nodash', 'noai'], familyPrefix: 'job-ad',
    template: (t) => `Write a job advertisement ${t}. About 200 words.`,
    topics: [
      'for a junior accountant at a family-owned firm', 'for a barista at a busy city cafe', 'for a senior backend engineer at a payments startup', 'for a warehouse shift supervisor',
      'for a part-time receptionist at a vet clinic', 'for a social media manager at a fashion brand', 'for a delivery driver with a clean licence', 'for a data analyst at a hospital trust',
      'for a sales representative selling solar panels', 'for a teaching assistant at a primary school', 'for a UX designer at an agency', 'for a chef de partie at a hotel restaurant',
      'for a customer support agent for a SaaS company', 'for an electrician apprentice', 'for a marketing intern at a nonprofit',
    ],
  },
  {
    genre: 'marketing', register: 'marketing', adv: ['human', 'plainwords', 'nodash'], familyPrefix: 'product',
    template: (t) => `Write ${t}.`,
    topics: [
      'an online shop description for a cast iron skillet', 'a listing for a refurbished laptop', 'copy for a subscription box of Japanese snacks', 'a description of a wooden toddler balance bike',
      'a product page for a smart thermostat', 'a description for a set of linen bed sheets', 'a listing for a vintage leather armchair', 'copy for a portable espresso maker',
      'a product page for trail running shoes', 'a description for a beginner\'s watercolour set', 'a listing for a used electric guitar', 'a description for a weekly vegetable box delivery',
      'the landing page for a note-taking app', 'the homepage for a small web hosting company', 'the features section for an open-source database', 'a description of a city hotel for a booking site',
      'an email announcing a summer sale at a shoe shop', 'a flyer for a local gym\'s January offer', 'a short radio ad for a car wash', 'a description for a holiday cottage in Cornwall',
    ],
  },
  {
    genre: 'review', register: 'marketing', adv: ['human', 'nodash'], familyPrefix: 'tasting',
    template: (t) => `Write a short tasting note ${t}, like the ones in a wine magazine. About 60 words.`,
    topics: [
      'for a Rioja Reserva', 'for a New Zealand Sauvignon Blanc', 'for a Napa Cabernet Sauvignon', 'for a Beaujolais', 'for a dry Riesling from the Mosel', 'for an Australian Shiraz',
      'for a Chianti Classico', 'for a cheap supermarket Prosecco', 'for an Oregon Pinot Noir', 'for a Portuguese Vinho Verde',
    ],
  },
  {
    genre: 'review', register: 'casual', adv: ['human', 'loose'], familyPrefix: 'shop-review',
    template: (t) => `Write an Amazon customer review ${t}. About 120 words.`,
    topics: [
      'of a USB-C charging cable that stopped working after a month', 'of a cookbook for beginners', 'of a kids\' tablet', 'of wireless earbuds you really like', 'of a blender that is too loud',
      'of a mystery novel', 'of a yoga mat', 'of a cheap smartwatch', 'of a board game for families', 'of a phone tripod', 'of a set of kitchen knives', 'of a dog bed',
    ],
  },
  {
    genre: 'chat', register: 'casual', adv: ['loose', 'human', 'detail'], familyPrefix: 'long-chat',
    template: (t) => `Write a long message to a close friend ${t}. About 120 words, the way you would type it in a chat app.`,
    topics: [
      'catching them up on a chaotic week at work', 'about the trip you just got back from', 'venting about your landlord', 'about meeting someone new',
      'about your kid starting school', 'about quitting your job', 'about your dad\'s birthday party that went wrong', 'about a show you are obsessed with',
      'asking for advice about a fight with your sister', 'about finally passing your driving test',
    ],
  },
  {
    genre: 'qa', register: 'technical', adv: ['human', 'nodash'], familyPrefix: 'tech-qa2',
    template: (t) => `Reply to this question on a sysadmin or developer forum: "${t}" Under 200 words, little or no code.`,
    topics: [
      'My server clock keeps drifting, what should I check?', 'Why does my laptop battery drain in sleep mode?', 'How do I move a website to a new host without downtime?',
      'Why is my wifi slow in one room only?', 'What is the safest way to store passwords in my app?', 'Should I use SQLite in production for a small app?',
      'Why do my emails from my domain go to spam?', 'How do I choose a backup strategy for a small office?', 'Why does my build take ten minutes?',
      'Is it worth upgrading from HDD to SSD on an old PC?', 'What does a load average of 4 mean on a 4-core server?', 'Why does my phone app drain data in the background?',
      'How do I debug a memory leak in a long-running service?', 'Why is my website slow only for users in Asia?', 'What is the difference between a VPN and a proxy?',
    ],
  },
  {
    genre: 'docs', register: 'technical', adv: ['human', 'nodash'], familyPrefix: 'docs2',
    template: (t) => `Write ${t}.`,
    topics: [
      'the README introduction for a command-line tool that compresses PNG images', 'a changelog entry for a library that adds TypeScript types', 'a short explanation of what a webhook is for a product\'s help centre',
      'a troubleshooting section for when a desktop app will not start', 'the docs page intro for a REST API for booking appointments', 'a code review comment suggesting a function be split in two',
      'a pull request description that upgrades a framework to a new major version', 'an engineering blog intro about moving from cron jobs to a job queue', 'the getting started paragraph for a static site generator',
      'a short note explaining semantic versioning to new contributors', 'a commit message for removing a deprecated config option', 'a design doc problem statement for slow search results',
    ],
  },
];

export function buildBank(): BankPrompt[] {
  const out: BankPrompt[] = [];
  for (const g of GENRES) {
    for (const topic of g.topics) {
      const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
      const family = g.familyPrefix === 'persuade' ? `persuade:${topic}` : g.familyPrefix === 'ellipse' ? `ellipse-ai:${slug}` : `${g.familyPrefix ?? g.genre}:${slug}`;
      const base = g.template(topic);
      out.push({ id: `${family}#plain`, family, genre: g.genre, register: g.register, variant: 'plain', adversarial: false, prompt: base });
      // About half the topics also get one adversarial version, picked by hash so it is stable.
      const k = h(family);
      if (k % 2 === 0) {
        const v = g.adv[(k >>> 3) % g.adv.length];
        out.push({ id: `${family}#${v}`, family, genre: g.genre, register: g.register, variant: v, adversarial: true, prompt: `${base} ${ADV[v]}` });
      }
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bank = buildBank();
  writeFileSync(join(here, 'prompts-v2.json'), JSON.stringify({ version: 2, note: 'Built by bench/prompt-bank.ts. Split by family.', prompts: bank }, null, 1) + '\n');
  const by: Record<string, number> = {};
  for (const p of bank) by[`${p.register}${p.adversarial ? '+adv' : ''}`] = (by[`${p.register}${p.adversarial ? '+adv' : ''}`] ?? 0) + 1;
  console.log(bank.length, by);
}
