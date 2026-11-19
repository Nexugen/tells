import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildVoice, styleMatch, checkVoice, splitSamples, VOICE_KEYS } from '../src/voice.ts';
import { factProblems } from '../src/voice-rewrite.ts';
import { rewrite } from '../src/rewrite.ts';
import { fromFunction, type ModelRequest } from '../src/model.ts';

// Public-domain passages by Jerome K. Jerome (see the fixture's note).
const JEROME = JSON.parse(readFileSync(new URL('./fixtures/voice-jerome.json', import.meta.url), 'utf8')) as { samples: string[]; heldOut: string[] };

// A synthetic writer: short lowercase chat messages, lots of questions, no apostrophes.
const CHATTY = [
  'okay so the build finished but the logo is still wrong. can you fix that? i think its the old file',
  'maybe we should move the button up. people dont scroll that far on mobile, at least i dont',
  'why is the price showing twice? it should be once. also the font looks too small to me',
  'thats fine for now. we can change it later if people complain. ship it',
  'did the email go out? i didnt get mine. check the spam folder maybe, or the logs',
  'i like the second one better. the first one feels kinda busy. lets go with two',
  'can it work offline too? a lot of shops here lose signal in the afternoon. that matters',
  'okay good. now do the same for the admin page. and make the table sortable if its easy',
  'no, leave the colours. the green is fine. just fix the spacing on the cards',
  'is that the real number or a guess? if its a guess say so. i dont want to post a guess',
  'okay that works. one thing, the date format should be day first. thats how people read it here',
  'thats too long for a tweet. cut it down. keep the part about the receipts, thats the good bit',
  'the receipts look good now. can we add the shop address at the bottom? some customers asked for it last week',
  'why does the login page take so long? it was fast yesterday. maybe its the new image on the background, try removing it',
  'okay i tested it on my phone. the menu opens but it wont close unless you tap twice. thats annoying, fix it before friday',
  'i dont think we need the second chart. nobody looks at it. keep the sales one and drop the rest',
  'can you make the export button bigger? my mum couldnt find it. if she cant find it nobody can',
  'okay the new colours are better. still a bit too bright on the header though. maybe tone it down a little',
  'is there a way to send the report every monday morning? i keep forgetting to check it. email is fine',
  'thats not what i meant. i want the old prices to stay on old orders. only new orders get the new price',
  'lets not add the chat feature yet. its a lot of work and i dont know if people want it. ask a few customers first',
  'okay so two things. the search is slow and the photos are blurry. the search matters more, start there',
  'did you change the font? it looks different on the laptop. i liked the old one, can we go back',
  'the delivery fee should change with the distance. right now its the same for everyone and thats not fair to people close by',
  'i think the onboarding is too long. five screens is a lot. can we do it in two? name and phone number, thats it',
  'okay perfect. now write a short message for the customers telling them about it. keep it simple, no big words',
  'why are there two buttons that do the same thing? remove one. the green one, keep the blue',
  'can it remember the last address? people order from home most of the time. saves them typing it again',
  'thats a good idea actually. do it. but make sure it doesnt break the old orders, we cant lose those',
  'okay i see the problem. the time is in the wrong zone. it says 3am when it was 9am here. check the server settings',
  'the staff page should show who is on today. just names and the time they started. nothing fancy',
  'maybe add a small note under the price saying it includes tax. people keep asking about it on whatsapp',
];

const DRAFT = 'We are excited to announce that our new dashboard is now available. It provides a comprehensive overview of your sales, and it updates every 5 minutes. Additionally, it supports exports to CSV.';

test('a profile comes from the samples and carries habits, summary and excerpts', () => {
  const v = buildVoice(JEROME.samples, { name: 'jerome' });
  assert.equal(v.format, 'tells-voice');
  assert.equal(v.samples, JEROME.samples.length);
  assert.ok(v.words > 1500);
  assert.equal(v.stats.keys.length, VOICE_KEYS.length);
  assert.ok(v.summary.length >= 5);
  assert.ok(v.excerpts.length >= 3 && v.excerpts.every((e) => JEROME.samples.some((s) => s.includes(e.slice(0, 80)))));
  assert.doesNotThrow(() => checkVoice(JSON.parse(JSON.stringify(v))));
});

test('the chatty writer is described as such', () => {
  const v = buildVoice(CHATTY);
  assert.ok(v.habits.lowercaseStarts > 0.8);
  assert.ok(v.habits.bareContractions > v.habits.contractions);
  assert.ok(v.habits.questions > 0.1);
  assert.ok(v.never.includes('em dashes'));
  assert.match(v.summary.join('\n'), /lowercase/);
  assert.ok(v.openers.some((o) => o.text === 'okay'));
});

test('too few samples or words is refused with a reason', () => {
  assert.throws(() => buildVoice(CHATTY.slice(0, 3)), /at least 5 samples/);
  assert.throws(() => buildVoice(CHATTY.slice(0, 12)), /at least 600 words/);
});

test('held-out text by the same writer matches better than a stock announcement', () => {
  const jerome = buildVoice(JEROME.samples);
  const own = JEROME.heldOut.map((t) => styleMatch(t, jerome).score);
  const other = styleMatch(DRAFT.repeat(3), jerome).score;
  assert.ok(Math.min(...own) > other, `own ${own} vs other ${other}`);
  const chatty = buildVoice(CHATTY);
  const chatMsg = 'okay the export works now but the dates are wrong again. can you check? i think its the timezone thing from before';
  assert.ok(styleMatch(chatMsg, chatty).score > styleMatch(DRAFT, chatty).score);
});

test('polish ignores casing and apostrophe habits', () => {
  const chatty = buildVoice(CHATTY);
  const raw = 'okay so the export works now but the dates are wrong again. can you check? i think its the timezone thing. dont ship it yet';
  const clean = "Okay, so the export works now but the dates are wrong again. Can you check? I think it's the timezone thing. Don't ship it yet.";
  const gapRaw = Math.abs(styleMatch(raw, chatty).distance - styleMatch(clean, chatty).distance);
  const gapPolish = Math.abs(styleMatch(raw, chatty, { polish: true }).distance - styleMatch(clean, chatty, { polish: true }).distance);
  assert.ok(gapPolish < gapRaw);
});

test('a profile from another version is refused', () => {
  const v = buildVoice(CHATTY);
  assert.throws(() => checkVoice({ ...v, stats: { ...v.stats, keys: v.stats.keys.slice(1) } }), /different version/);
  assert.throws(() => checkVoice({ format: 'other' }), /Not a tells voice/);
});

test('samples split on --- lines', () => {
  assert.deepEqual(splitSamples('one\n---\ntwo\n\n----\nthree'), ['one', 'two', 'three']);
});

test('factProblems catches added and dropped facts', () => {
  assert.deepEqual(factProblems(DRAFT, DRAFT), []);
  assert.match(factProblems(DRAFT, DRAFT.replace('5 minutes', '10 minutes')).join(), /added 10.*dropped 5/s);
  assert.match(factProblems(DRAFT, DRAFT + ' Ask Priya.').join(), /added Priya/);
  assert.match(factProblems(DRAFT, DRAFT.replace(' to CSV', '')).join(), /dropped CSV/);
});

function voiceModel(reply: (req: ModelRequest, n: number) => string, log: ModelRequest[] = []) {
  let n = 0;
  return fromFunction('fake', async (req) => {
    log.push(req);
    return { text: reply(req, n++), usage: { inputTokens: 100, outputTokens: 50 }, costUsd: 0.0001 };
  });
}

test('a voice rewrite replaces the whole draft, keeps the facts and reports the match', async () => {
  const voice = buildVoice(CHATTY);
  const out = 'the new dashboard is out. it shows your sales and updates every 5 minutes. you can export to CSV too';
  const log: ModelRequest[] = [];
  const res = await rewrite(DRAFT, { voice, model: voiceModel(() => JSON.stringify({ text: out }), log), register: 'casual' });
  assert.equal(res.text, out);
  assert.equal(res.calls, 1);
  assert.ok(res.voice);
  assert.ok(res.voice.after.score > res.voice.before.score);
  assert.match(log[0].system, /<how_they_write>/);
  assert.match(log[0].system, /<sample>/);
  assert.equal(JSON.parse(log[0].prompt).draft, DRAFT);
});

test('a voice rewrite that adds a fact is retried, then the draft is kept', async () => {
  const voice = buildVoice(CHATTY);
  const log: ModelRequest[] = [];
  const res = await rewrite(DRAFT, { voice, register: 'casual', model: voiceModel(() => JSON.stringify({ text: 'the dashboard is out, it updates every 2 minutes and exports to CSV' }), log) });
  assert.equal(res.calls, 2);
  assert.ok(JSON.parse(log[1].prompt).problems_with_previous_attempt.some((p: string) => /added 2/.test(p)));
  assert.equal(res.text, DRAFT);
  assert.equal(res.rejected.length, 1);
});

test('tells left after the voice pass go through the span rewrite', async () => {
  const voice = buildVoice(CHATTY);
  const voiced = 'the dashboard is out. it updates every 5 minutes and exports to CSV. Hope this helps!';
  const res = await rewrite(DRAFT, {
    voice,
    register: 'casual',
    model: voiceModel((req, n) => {
      if (n === 0) return JSON.stringify({ text: voiced });
      const { sentences } = JSON.parse(req.prompt) as { sentences: { id: number; text: string }[] };
      return JSON.stringify({ edits: sentences.map((s) => ({ id: s.id, text: s.text.includes('Hope this helps') ? '' : s.text })) });
    }),
  });
  assert.equal(res.text, 'the dashboard is out. it updates every 5 minutes and exports to CSV.');
  assert.ok(res.voice && res.voice.fixedSpans >= 1);
  assert.ok(res.calls >= 2);
});
