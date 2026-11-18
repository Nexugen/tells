import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewrite, buildUnits, parseEdits } from '../src/rewrite.ts';
import { lint } from '../src/lint.ts';
import { fromFunction, type ModelRequest } from '../src/model.ts';

/** A fake model that answers from a lookup of sentence text to replacement. */
function fake(map: Record<string, string>, log: ModelRequest[] = []) {
  return fromFunction('fake', async (req) => {
    log.push(req);
    const { sentences } = JSON.parse(req.prompt) as { sentences: { id: number; text: string }[] };
    return {
      text: JSON.stringify({ edits: sentences.map((s) => ({ id: s.id, text: map[s.text] ?? s.text })) }),
      usage: { inputTokens: 100, outputTokens: 20 },
      costUsd: 0.0001,
    };
  });
}

test('only flagged sentences change; the rest is byte for byte', async () => {
  const text = 'The deploy ran at 02:10.\nIt was not a bug, it was a race. Logs are in `/var/log/app`.\n\nHope this helps!';
  const res = await rewrite(text, {
    model: fake({
      'It was not a bug, it was a race.': 'Two requests raced on the same row.',
      'Hope this helps!': '',
    }),
  });
  assert.equal(res.text, 'The deploy ran at 02:10.\nTwo requests raced on the same row. Logs are in `/var/log/app`.');
  assert.equal(res.changes.length, 2);
  assert.equal(res.after.counts.error, 0);
  assert.ok(res.before.score > res.after.score);
  assert.equal(res.calls, 1);
});

test('the prompt carries the rules, the context and register examples', async () => {
  const log: ModelRequest[] = [];
  await rewrite('We leverage robust tooling. Nothing else here.', { register: 'technical', model: fake({}, log) });
  const prompt = JSON.parse(log[0].prompt);
  assert.equal(prompt.sentences.length, 1);
  assert.equal(prompt.sentences[0].text, 'We leverage robust tooling.');
  assert.ok(prompt.sentences[0].problems.some((p: { rule: string }) => p.rule === 'AI vocabulary'));
  assert.match(log[0].system, /Register: technical/);
  assert.match(log[0].system, /<example source=/);
});

test('a span that still has the tell is retried once with the previous attempt', async () => {
  const log: ModelRequest[] = [];
  let n = 0;
  const model = fromFunction('stubborn', async (req) => {
    log.push(req);
    n++;
    const { sentences } = JSON.parse(req.prompt) as { sentences: { id: number }[] };
    const text = n === 1 ? 'We utilize a seamless flow.' : 'Sign-up takes one screen.';
    return JSON.stringify({ edits: sentences.map((s) => ({ id: s.id, text })) });
  });
  const res = await rewrite('Our seamless onboarding.', { model });
  assert.equal(res.calls, 2);
  assert.match(log[1].prompt, /previous_attempt_still_had_tells/);
  assert.equal(res.text, 'Sign-up takes one screen.');
});

test('clean text makes no model call', async () => {
  let called = false;
  const res = await rewrite('The cache keeps each page for five minutes.', {
    model: fromFunction('never', async () => {
      called = true;
      return '{}';
    }),
  });
  assert.equal(called, false);
  assert.equal(res.calls, 0);
  assert.equal(res.text, 'The cache keeps each page for five minutes.');
});

test('info-level hints are left alone unless asked for', async () => {
  const text = 'Your export is ready!!';
  assert.equal(lint(text).findings[0].severity, 'info');
  const res = await rewrite(text, { model: fake({ 'Your export is ready!!': 'Your export is ready.' }) });
  assert.equal(res.text, text);
  const res2 = await rewrite(text, { minSeverity: 'info', model: fake({ 'Your export is ready!!': 'Your export is ready.' }) });
  assert.equal(res2.text, 'Your export is ready.');
});

test('touching findings merge into one unit', () => {
  const text = 'Great question! We leverage robust tools — fast.';
  const units = buildUnits(text, lint(text).findings);
  assert.equal(units.length, 2);
  assert.equal(text.slice(units[1].start, units[1].end), 'We leverage robust tools — fast.');
});

test('model replies are parsed defensively', () => {
  assert.deepEqual([...parseEdits('Sure, here: {"edits":[{"id":1,"text":"ok"}]} done')], [[1, 'ok']]);
  assert.throws(() => parseEdits('no json here'), /did not return JSON/);
  assert.throws(() => parseEdits('{"edits": nope}'), /malformed/);
  assert.throws(() => parseEdits('{"other":[]}'), /no "edits"/);
});

test('model errors reach the caller', async () => {
  const model = fromFunction('broken', async () => 'I cannot help with that.');
  await assert.rejects(rewrite('We leverage it.', { model }), /did not return JSON/);
});

test('deleting a whole paragraph removes its blank lines too', async () => {
  const text = 'First line here.\n\nThat\'s the future of hiring.\n\nLast line here.\n';
  const res = await rewrite(text, { model: fake({ "That's the future of hiring.": '' }) });
  assert.equal(res.text, 'First line here.\n\nLast line here.\n');
});
