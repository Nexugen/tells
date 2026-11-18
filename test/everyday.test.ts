import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { lint } from '../src/lint.ts';

/**
 * Ordinary model output, not cliché-stuffed: the helpful answers, how-tos, LinkedIn posts and
 * emails people paste in. Linted with no options, as the web page and the CLI do. Neither set is
 * trained on: everyday-prose.json was written for this test, everyday.json is the held-out half
 * of bench/everyday (bench/everyday.ts --fixtures).
 */
const load = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')).items as { id: string; text: string }[];
const judge = (text: string) => {
  const r = lint(text);
  const strong = r.findings.filter((f) => f.severity !== 'info');
  return { strong: strong.length, rules: new Set(strong.map((f) => f.ruleId)), low: !!r.human.pattern?.low, score: r.human.pattern?.score ?? 100 };
};

test('the reported "moving abroad" answer gets real warnings and a low-ish score', () => {
  const j = judge(load('everyday-prose.json').find((i) => i.id === 'move-abroad')!.text);
  for (const id of ['reassurance-frame', 'listicle-intro', 'ordinal-sequence', 'upbeat-close']) assert.ok(j.rules.has(id), `missing ${id}`);
  assert.ok(j.score < 50, `score ${j.score}`);
});

test('plain-prose assistant answers are flagged', () => {
  const items = load('everyday-prose.json');
  const res = items.map((i) => ({ id: i.id, ...judge(i.text) }));
  const warned = res.filter((r) => r.strong > 0);
  const flagged = res.filter((r) => r.strong > 0 || r.low);
  assert.ok(warned.length >= Math.ceil(items.length * 0.8), `with a warning: ${warned.length}/${items.length}; none: ${res.filter((r) => !r.strong).map((r) => r.id)}`);
  assert.ok(flagged.length >= items.length - 1, `flagged ${flagged.length}/${items.length}; missed: ${res.filter((r) => !r.strong && !r.low).map((r) => r.id)}`);
});

test('held-out everyday chat answers are flagged', { skip: !existsSync(new URL('./fixtures/everyday.json', import.meta.url)) }, () => {
  const items = load('everyday.json');
  const res = items.map((i) => judge(i.text));
  const warned = res.filter((r) => r.strong > 0).length, flagged = res.filter((r) => r.strong > 0 || r.low).length;
  assert.ok(warned / items.length >= 0.5, `with a warning ${warned}/${items.length}`);
  assert.ok(flagged / items.length >= 0.95, `flagged ${flagged}/${items.length}`);
});
