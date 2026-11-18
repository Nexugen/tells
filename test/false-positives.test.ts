import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lint } from '../src/lint.ts';
import { guessRegister } from '../src/register.ts';
import type { Register } from '../src/types.ts';

/**
 * Ordinary human messages that tells once flagged. Each must stay free of warnings and errors
 * in the register a person would pick, in professional (the default), and with 'auto'.
 */
const CASUAL: string[] = [
  "Hey, how have you been? It's been a little while, so I thought I'd check in. What's been going on with you lately? Hope everything's good. We should catch up sometime.",
  'Congrats on the new job! So happy for you.',
  'See you Friday! I’ll bring the chairs.',
  'Thanks so much! That really helped.',
  'How was the trip? Did you make it to the lake in the end? Send pics when you get a sec.',
  "Running about ten minutes late, sorry. What do you want to drink? I'll grab it on the way.",
  "Are you free Saturday? We're doing a small thing at ours from 7. No need to bring anything.",
  "Hi Sam, quick one: did you get my email about Thursday? No rush, just checking it didn't land in spam. Thanks!",
  'Happy birthday! Hope you have a great day. Drinks on me next week.',
  "What happened at the meeting? I had to leave early. Anything I need to do before Monday?",
  "Long time no see! How's the new place? Still settling in? Let me know when you're around and we'll grab lunch.",
  'Ha, that is brilliant. Where did you find it?',
  "Did the parcel arrive? Tracking says delivered but I'm never sure with them.",
];

const BLOCKING = new Set(['error', 'warning']);
const blocking = (text: string, register: Register | 'auto') => lint(text, { register }).findings.filter((f) => BLOCKING.has(f.severity)).map((f) => `${f.ruleId}: ${f.match}`);

test('ordinary casual messages get no warnings in any sensible register', () => {
  for (const text of CASUAL) {
    for (const register of ['casual', 'professional', 'auto'] as const) {
      assert.deepEqual(blocking(text, register), [], `${register}: ${text}`);
    }
  }
});

test('the check-in message is not a staged question, in any register', () => {
  const text = CASUAL[0];
  for (const register of ['casual', 'professional', 'technical', 'marketing', 'auto'] as const) {
    assert.ok(!lint(text, { register }).findings.some((f) => f.ruleId === 'rhetorical-qa'), register);
  }
});

test('one or two exclamation marks in a casual message are fine', () => {
  for (const text of ['Congrats!', 'See you Friday!', 'Thanks so much! See you soon!']) {
    assert.ok(!lint(text, { register: 'casual' }).findings.some((f) => f.ruleId === 'exclamation'), text);
  }
});

test('exclamation marks as a habit are still flagged', () => {
  const ex = (t: string, r: Register) => lint(t, { register: r }).findings.filter((f) => f.ruleId === 'exclamation').length;
  assert.ok(ex('Wow!!', 'casual') > 0);
  assert.ok(ex('Big news! It is here! Try it now!', 'casual') > 0);
  assert.ok(ex('Your report is ready! Download it today!', 'professional') > 0);
  assert.ok(ex('Run the migration first!', 'technical') > 0);
  assert.equal(ex('Thanks!', 'professional'), 0);
});

test('staged questions in copy are still flagged', () => {
  const hit = (t: string) => lint(t, { register: 'marketing' }).findings.some((f) => f.ruleId === 'rhetorical-qa');
  assert.ok(lint('The result? Faster builds.', { register: 'marketing' }).findings.some((f) => f.ruleId === 'setup-reveal'));
  assert.ok(hit("What's the secret? Simple: we cache everything."));
  assert.ok(hit('What changed? The cache changed.'));
  assert.ok(hit('Why does this matter? Because every minute counts.'));
  assert.ok(hit('No signal? No problem. It works offline.'));
  assert.ok(!hit('What do you think? Let me know.'));
});

test('too short to judge', () => {
  const r = lint('Congrats on the new job! So happy for you.', { register: 'casual' });
  assert.equal(r.human.tooShort, true);
  assert.equal(r.human.signalScore, null);
  assert.deepEqual(r.human.missing, []);
});

test('the register guess picks casual for a check-in, technical for docs, professional for an email', () => {
  assert.equal(guessRegister(CASUAL[0]).register, 'casual');
  assert.equal(guessRegister('Run `npm install tells`, then call `lint(text)` from your build script. The CLI exits with 1 when a check fails, so CI stops.').register, 'technical');
  assert.equal(
    guessRegister('Hi Dana,\n\nThe quote for the booking site is attached: four weeks, $6,500, half up front. The contract follows once you confirm the start date.\n\nBest,\nAmir').register,
    'professional',
  );
  assert.equal(guessRegister('Introducing Snap: scan receipts in one tap. Free for 30 days, starting today. #bookkeeping').register, 'marketing');
});
