import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SIGNALS, detectSignals, signalContext } from '../src/human.ts';
import { lint } from '../src/lint.ts';
import { newFacts, rewrite } from '../src/rewrite.ts';
import { claudeCli, fromFunction } from '../src/model.ts';
import { textSignals } from '../src/signals.ts';

const found = (text: string, register = 'casual' as const) => new Set(detectSignals(signalContext(text, register)).map((s) => s.id));

test('every human signal is documented and finds its own example', () => {
  const ids = new Set<string>();
  for (const s of SIGNALS) {
    assert.match(s.id, /^[a-z]+(?:-[a-z]+)*$/);
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`);
    ids.add(s.id);
    for (const k of ['name', 'description', 'why', 'add'] as const) assert.ok(s[k].length > (k === 'name' ? 2 : 5), `${s.id}.${k}`);
    assert.ok(found(s.example).has(s.id), `${s.id}: example not detected`);
  }
});

test('specific detail, first-hand experience and asides are found', () => {
  const ids = found("I moved the cron to 02:10 on Tuesday after it ate 3 GB of Postgres logs (twice, actually). Honestly, I'd skip it.");
  for (const id of ['specific-number', 'time-anchor', 'first-hand', 'aside', 'contraction']) assert.ok(ids.has(id), id);
});

test('generic model prose shows few signals', () => {
  const ids = found('Effective communication is essential for team success. It enables collaboration and ensures alignment across departments. Organizations should prioritize clear processes.');
  assert.ok(!ids.has('first-hand') && !ids.has('specific-number') && !ids.has('aside'));
});

test('lint reports both sides', () => {
  const r = lint('Great question! We leverage robust tooling to streamline workflows.', { register: 'professional' });
  assert.ok(r.findings.length > 0);
  assert.ok(Array.isArray(r.human.present) && Array.isArray(r.human.missing));
  assert.equal(r.human.tooShort, true);
});

test('shape metrics: bursty text has a higher sentence-length spread', () => {
  const flat = textSignals('The app is fast. The app is cheap. The app is safe. The app is new.');
  const bursty = textSignals('It broke. I spent most of Tuesday reading the connection pool code before I saw the limit was five. Fixed.');
  assert.ok(bursty.sentenceCv > flat.sentenceCv);
});

test('the fact guard catches new numbers and names but allows placeholders', () => {
  const src = 'The release moves to Monday because the sandbox is down.';
  assert.deepEqual(newFacts(src, 'The release moves to Monday. The sandbox is down.'), []);
  assert.deepEqual(newFacts(src, 'The release moves to Monday, after 3 days of Stripe sandbox outages.').sort(), ['3', 'Stripe']);
  assert.deepEqual(newFacts(src, 'The sandbox has been down for [number] days, so it moves to Monday.'), []);
});

test('rewrite rejects an edit that invents a fact and keeps the original', async () => {
  const model = fromFunction('fake', async (req) => {
    const { sentences } = JSON.parse(req.prompt) as { sentences: { id: number }[] };
    return { text: JSON.stringify({ edits: sentences.map((s) => ({ id: s.id, text: 'Our 4,000 customers at Acme love it.' })) }) };
  });
  const text = 'We leverage robust tooling.';
  const res = await rewrite(text, { model, register: 'professional', humanize: false });
  assert.equal(res.text, text);
  assert.ok(res.rejected.length >= 1);
  assert.match(res.rejected[0].reason, /4,000|Acme/);
});

test('placeholders in a rewrite come back as suggestions', async () => {
  const model = fromFunction('fake', async (req) => {
    const { sentences } = JSON.parse(req.prompt) as { sentences: { id: number }[] };
    return { text: JSON.stringify({ edits: sentences.map((s) => ({ id: s.id, text: 'The tooling cut build time to [number] minutes.' })) }) };
  });
  const res = await rewrite('We leverage robust tooling.', { model, register: 'professional', humanize: false });
  assert.deepEqual(res.suggestions.map((s) => s.placeholder), ['[number]']);
});

test('the Claude Code backend runs with no tools, reads the JSON result, and keeps a clean env', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tells-cli-'));
  const bin = join(dir, 'claude');
  const log = join(dir, 'log.json');
  writeFileSync(
    bin,
    `#!/usr/bin/env node
let input = '';
process.stdin.on('data', (d) => (input += d)).on('end', () => {
  require('node:fs').writeFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), input, env: Object.keys(process.env), config: process.env.CLAUDE_CONFIG_DIR }));
  process.stdout.write(JSON.stringify({ result: '{"edits":[]}', is_error: false, total_cost_usd: 0.0012, usage: { input_tokens: 50, output_tokens: 7 } }));
});
`,
  );
  chmodSync(bin, 0o755);
  process.env.TELLS_TEST_SECRET = 'should-not-leak';
  const model = claudeCli({ bin, configDir: '/tmp/fake-config' });
  const res = await model.complete({ system: 'sys', prompt: 'hello', maxTokens: 100 });
  assert.equal(res.text, '{"edits":[]}');
  assert.equal(res.costUsd, 0.0012);
  const seen = JSON.parse(readFileSync(log, 'utf8'));
  assert.equal(seen.input, 'hello');
  assert.equal(seen.config, '/tmp/fake-config');
  assert.ok(seen.args.includes('--tools') && seen.args[seen.args.indexOf('--tools') + 1] === '');
  assert.ok(seen.args.includes('--no-session-persistence'));
  assert.ok(!seen.env.includes('TELLS_TEST_SECRET'));
  delete process.env.TELLS_TEST_SECRET;
});
