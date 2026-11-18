import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lint } from '../src/lint.ts';
import { humanScore } from '../src/score.ts';
import { stripLayout, SCORE_KEYS, scoreFeatures } from '../src/score-features.ts';
import { signalContext } from '../src/human.ts';

test('one habit on its own is a hint, two distinct habits are a warning', () => {
  const one = lint('We leverage the cache for reads. It made the page faster on Tuesday.', { register: 'professional', noScore: true });
  assert.ok(one.findings.length > 0);
  assert.ok(one.findings.every((f) => f.severity === 'info'), 'a lone tell drops to a hint');
  assert.match(one.findings[0].message, /hint/);
  const two = lint('Great question! We delve into the robust, seamless pipeline. Here is why it matters.', { register: 'professional', noScore: true });
  assert.ok(two.findings.some((f) => f.severity !== 'info'), 'distinct habits corroborate each other');
});

test('corroborate: 0 reports every rule at its own severity', () => {
  const r = lint('We leverage the cache for reads.', { register: 'professional', corroborate: 0, noScore: true });
  assert.ok(r.findings.some((f) => f.ruleId === 'ai-vocabulary' && f.severity === 'warning'));
});

test('strong rules (two template slots) are not gated', () => {
  const r = lint('Hi [Client Name], the invoice for [Amount] is attached.', { register: 'professional', noScore: true });
  assert.ok(r.findings.some((f) => f.ruleId === 'unfilled-placeholder' && f.severity !== 'info'));
});

test('severity overrides are left alone by the gate', () => {
  const r = lint('We leverage the cache for reads.', { register: 'professional', severity: { 'ai-vocabulary': 'error' }, noScore: true });
  assert.equal(r.findings.find((f) => f.ruleId === 'ai-vocabulary')?.severity, 'error');
});

test('layout is stripped before scoring', () => {
  assert.equal(stripLayout('## Title\n\n- **one** thing\n- two'), 'Title\n\none thing\n\ntwo');
});

test('features line up with their keys', () => {
  const text = 'I tried the export on Tuesday and it broke. Not sure why, honestly, but the CSV had 41 rows instead of 42.';
  const x = scoreFeatures({ text, register: 'casual', findings: [], ctx: signalContext(text, 'casual') });
  assert.equal(x.length, SCORE_KEYS.length);
  assert.ok(x.every((v) => Number.isFinite(v)));
});

test('the score is null for short texts and a 0 to 100 number otherwise', () => {
  assert.equal(humanScore('Running late, ten minutes. Order me a beer?', 'casual', []), null);
  const long = lint(
    'We moved the queue from Redis to Postgres in March, mostly because one less thing to run at 3am is worth a lot to a team of four. ' +
      'It was slower at first. The polling loop hammered the table until Ana added an index on (status, run_at), and after that it was fine. ' +
      'I would not do it at ten times our volume, but at a few thousand jobs an hour nobody has noticed the difference, and backups got simpler. ' +
      'The one thing I miss is the dashboard.',
    { register: 'technical' },
  );
  const p = long.human.pattern;
  assert.ok(p === null || (p.score >= 0 && p.score <= 100));
});
