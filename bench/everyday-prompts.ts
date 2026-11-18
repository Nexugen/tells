/**
 * Builds bench/everyday/prompts.json: requests the way people type them into a chat assistant,
 * with no style instructions, for the regression set of ordinary model output (test/fixtures/everyday.json).
 *
 *   node --experimental-strip-types bench/everyday-prompts.ts
 *   node --experimental-strip-types bench/generate.ts --bank bench/everyday/prompts.json --out bench/everyday/out --system chat
 *
 * Each request comes plain and as "a few plain paragraphs". Families whose hash is even are for building and checking rules ("dev"); odd ones are the
 * regression test and are not looked at while rules are written.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const h = (s: string) => parseInt(createHash('sha256').update(s).digest('hex').slice(0, 8), 16);

const ASKS: Record<string, { register: string; asks: string[] }> = {
  advice: { register: 'casual', asks: [
    'How do I prepare for moving to a new country?', 'Give me some tips for my first week at a new job.', 'How can I get better sleep?', 'What should I know before adopting a dog?',
    'How do I start saving money when I live paycheck to paycheck?', 'How can I be more productive working from home?', 'How do I deal with a difficult coworker?', 'Tips for a long-haul flight?',
    'How do I make friends as an adult?', 'How do I prepare for a job interview?', 'How can I stop procrastinating?', 'What are some ways to reduce stress?',
    'How do I start running if I have never exercised?', 'How do I ask my landlord to fix something?', 'How do I plan a budget wedding?', 'How do I get my kids to read more?',
  ] },
  howto: { register: 'casual', asks: [
    'How do I clean a cast iron pan?', 'How do I change a flat tyre?', 'How do I start a vegetable garden?', 'How do I learn a new language fast?',
    'How do I set up a home network?', 'How do I write a good CV?', 'How do I make sourdough bread?', 'How do I start a podcast?',
  ] },
  explain: { register: 'professional', asks: [
    'Explain inflation in simple terms.', 'What is the difference between a Roth IRA and a traditional IRA?', 'Why is the sky blue?', 'What is machine learning?',
    'How does compound interest work?', 'What causes jet lag?', 'Explain how vaccines work.', 'What is a credit score and why does it matter?',
  ] },
  linkedin: { register: 'marketing', asks: [
    'Write a LinkedIn post about starting a new job as a product manager.', 'Write a LinkedIn post about lessons from my first year as a founder.', 'Write a LinkedIn post celebrating my team shipping a big project.',
    'Write a LinkedIn post about being laid off and looking for work.', 'Write a LinkedIn post about why soft skills matter in engineering.', 'Write a LinkedIn post about getting a certification in data analytics.',
  ] },
  email: { register: 'professional', asks: [
    'Write an email to my manager asking for a day off next Friday.', 'Write an email to a client saying the project will be a week late.', 'Write an email following up after a job interview.',
    'Write an email to a landlord asking for my deposit back.', 'Write an email declining a meeting invitation politely.', 'Write an email introducing myself to a new team.',
  ] },
  article: { register: 'professional', asks: [
    'Write a short blog post in the first person about what I learned from a year of journaling.', 'Write a first-person article about switching careers into tech at 35.', 'Write a short first-person blog post about my experience with minimalism.',
    'Write a short blog post about the benefits of walking every day.', 'Write a short article about how to stay motivated while learning to code.', 'Write a first-person post about traveling solo for the first time.',
  ] },
  product: { register: 'marketing', asks: [
    'Write a product description for a bamboo cutting board.', 'Write a short description for a meditation app.', 'Write an Instagram caption for a new coffee shop opening.', 'Write the about section for a small bakery website.',
  ] },
};

const prompts = [];
for (const [genre, { register, asks }] of Object.entries(ASKS)) {
  for (const ask of asks) {
    const slug = ask.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
    const family = `everyday:${genre}:${slug}`;
    prompts.push({ id: `${family}#plain`, family, genre, register, variant: h(family) % 2 ? 'test' : 'dev', adversarial: false, prompt: ask });
    // The same request asked for as plain paragraphs, the way many people ask for an answer they will paste somewhere.
    prompts.push({ id: `${family}#prose`, family, genre, register, variant: h(family) % 2 ? 'test' : 'dev', adversarial: false, prompt: `${ask} Write it as a few plain paragraphs, no lists, headings or bold.` });
  }
}
mkdirSync(join(here, 'everyday'), { recursive: true });
writeFileSync(join(here, 'everyday', 'prompts.json'), JSON.stringify({ version: 1, prompts }, null, 1) + '\n');
console.log(prompts.length, prompts.filter((p) => p.variant === 'test').length, 'test');
