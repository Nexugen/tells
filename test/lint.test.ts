import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lint, fails, slopScore, grade } from '../src/lint.ts';
import { RULES } from '../src/rules.ts';
import { EXEMPLARS } from '../src/exemplars.ts';
import { rulesAsJson } from '../src/serialize.ts';
import { mask, sentences } from '../src/text.ts';
import type { Register } from '../src/types.ts';

const ids = (text: string, register?: Register) => lint(text, { register }).findings.map((f) => f.ruleId);

function registerFor(ruleId: string): Register {
  // A register where the rule is on.
  const rule = RULES.find((r) => r.id === ruleId)!;
  for (const r of ['professional', 'casual', 'marketing', 'technical'] as Register[]) if (rule.registers?.[r] !== 'off') return r;
  return 'professional';
}

test('every rule catches its own "before" example and passes its own "after" example', () => {
  for (const rule of RULES) {
    const register = rule.id === 'semicolon' ? 'casual' : registerFor(rule.id);
    const before = lint(rule.example.before, { register }).findings.filter((f) => f.ruleId === rule.id);
    assert.ok(before.length > 0, `${rule.id}: before example not caught`);
    const after = lint(rule.example.after, { register }).findings;
    assert.deepEqual(after.map((f) => f.ruleId), [], `${rule.id}: after example has findings`);
  }
});

test('rule ids are unique, kebab-case, and fully documented', () => {
  const seen = new Set<string>();
  for (const r of RULES) {
    assert.match(r.id, /^[a-z]+(?:-[a-z]+)*$/);
    assert.ok(!seen.has(r.id), `duplicate id ${r.id}`);
    seen.add(r.id);
    for (const k of ['name', 'description', 'why', 'fix'] as const) assert.ok(r[k].length > 2, `${r.id}.${k}`);
    // The rule text itself follows the house style: no dashes in the advice.
    for (const k of ['why', 'fix'] as const) assert.doesNotMatch(r[k], /[—–]/, `${r.id}.${k} uses a dash`);
  }
});

test('em dash, en dash and double hyphen', () => {
  assert.deepEqual(ids('It works — mostly.'), ['dash']);
  assert.deepEqual(ids('Pages 3–5 are blank.'), ['dash']);
  assert.deepEqual(ids('It works -- mostly.'), ['dash']);
  assert.deepEqual(ids('A well-known fix.'), []);
});

test('"not X, it\'s Y" frames in their common shapes', () => {
  for (const t of [
    "It's not a tool, it's a teammate.",
    'This isn\'t just a linter. It\'s a style guide.',
    'It is not about speed. It is about trust.',
    'We built it not just for developers, but for everyone.',
    'Less meetings, more shipping.',
    "It's not just a tool — it's a movement.",
  ]) {
    assert.ok(ids(t).includes('not-x-but-y'), t);
  }
  assert.ok(!ids('The server is not running, so restart it.').includes('not-x-but-y'));
  assert.ok(!ids('It was not cheap.').includes('not-x-but-y'));
});

test('openers and closers only count at the start and end', () => {
  assert.ok(ids('Great question! Use a lock file.').includes('sycophantic-opener'));
  assert.ok(!ids('I said it was a great question, and moved on.').includes('sycophantic-opener'));
  assert.ok(ids('Restart the worker. Hope this helps!').includes('chatbot-closer'));
  assert.ok(ids("In today's fast-paced world, teams ship daily.").includes('sweeping-opener'));
  assert.ok(ids('We shipped. Then it booked twelve seats. That\'s the future of travel.').includes('slogan-ending'));
});

test('staccato fragments, staged questions and hedges', () => {
  assert.ok(ids('No code. No team. No problem.').includes('staccato'));
  assert.ok(ids('Fast. Cheap. Done.').includes('staccato'));
  assert.ok(!ids('The build passed. The deploy did not.').includes('staccato'));
  assert.ok(ids('Why does this matter? Because users leave.').includes('rhetorical-qa'));
  assert.ok(!ids('Why does the build fail on Linux only? I have checked the paths twice.').includes('rhetorical-qa'));
  assert.ok(ids('This may potentially affect some users.').includes('hedge-stack'));
  assert.ok(!ids('This might affect users on the old plan.').includes('hedge-stack'));
});

test('vocabulary is matched as whole words, any case', () => {
  assert.deepEqual(ids('Let us Delve into it.').filter((i) => i === 'ai-vocabulary').length, 1);
  assert.ok(!ids('The delver found it.').includes('ai-vocabulary'));
  assert.ok(ids('A seamless, robust experience.').filter((i) => i === 'ai-vocabulary').length === 2);
});

test('code, URLs and ignored regions are not linted', () => {
  const md = [
    'Run `seamless --robust` first.',
    '',
    '```',
    "It's not a bug, it's a feature — delve",
    '```',
    '',
    'See https://example.com/delve-seamless-robust for more.',
    '',
    '<!-- tells-off -->',
    'Great question! We leverage synergy.',
    '<!-- tells-on -->',
    'Bad example: "Unlock your potential" tells-ignore',
  ].join('\n');
  assert.deepEqual(ids(md), []);
});

test('masking keeps offsets, so findings point at the original text', () => {
  const text = 'Use `x`. We leverage it.';
  const m = mask(text);
  assert.equal(m.length, text.length);
  const f = lint(text).findings[0];
  assert.equal(text.slice(f.start, f.end), 'leverage');
  assert.equal(f.line, 1);
  assert.equal(f.column, 13);
});

test('sentence splitting handles abbreviations and list items', () => {
  const s = sentences(mask('We use e.g. Redis here. It works.\n\n- First item\n- Second item'));
  assert.deepEqual(s.map((x) => x.text), ['We use e.g. Redis here.', 'It works.', 'First item', 'Second item']);
});

test('registers change severity or switch rules off', () => {
  const text = 'The build passed; the deploy did not.';
  assert.ok(ids(text, 'casual').includes('semicolon'));
  assert.ok(!ids(text, 'technical').includes('semicolon'));
  assert.equal(lint('Ship it now!!', { register: 'marketing' }).findings[0].severity, 'warning');
  assert.equal(lint('Ship it now!!', { register: 'casual' }).findings[0].severity, 'info');
});

test('disable and severity overrides', () => {
  assert.deepEqual(lint('It works — mostly.', { disable: ['dash'] }).findings, []);
  assert.equal(lint('It works — mostly.', { severity: { dash: 'info' } }).findings[0].severity, 'info');
  assert.deepEqual(lint('It works — mostly.', { severity: { dash: 'off' } }).findings, []);
});

test('score, grade and the CI gate', () => {
  assert.equal(slopScore([], 100), 0);
  assert.equal(grade(0), 'clean');
  assert.equal(slopScore([{ severity: 'error' }], 10), 6); // short texts count as 50 words
  const r = lint('Great question! We leverage robust AI — seamlessly.');
  assert.equal(r.grade, 'heavy');
  assert.ok(fails(r));
  const soft = lint('Your export is ready!!');
  assert.ok(!fails(soft));
  assert.ok(fails(soft, { failOn: 'info' }));
  assert.ok(fails(soft, { maxScore: 0 }));
});

test('human exemplars mostly score clean', () => {
  const human = EXEMPLARS.filter((e) => e.human);
  const scores = human.map((e) => lint(e.text, { register: e.register }).score);
  const clean = scores.filter((s) => s < 2).length;
  // People use em dashes and say "thrilled" sometimes. Most samples should still be light or clean.
  assert.ok(clean / human.length >= 0.6, `only ${clean} of ${human.length} human samples under 2`);
});

test('every exemplar has a source and a licence', () => {
  for (const e of EXEMPLARS) {
    assert.ok(e.source.url.startsWith('https://'), e.id);
    assert.ok(e.licence.name && e.licence.url && e.licence.attribution, e.id);
    assert.ok(e.text.length > 80, e.id);
  }
});

test('rules serialize to JSON with patterns that compile', () => {
  const json = rulesAsJson();
  assert.equal(json.rules.length, RULES.length);
  for (const r of json.rules) if (r.detect.kind === 'pattern') assert.doesNotThrow(() => new RegExp(r.detect.pattern!, r.detect.flags));
});

test('lint is fast enough for CI on long documents', () => {
  const para = 'We shipped the fix on Tuesday and the error rate dropped. ';
  const text = Array.from({ length: 2000 }, (_, i) => para + (i % 7 === 0 ? 'It is robust. ' : '')).join('\n\n');
  const t = performance.now();
  lint(text);
  assert.ok(performance.now() - t < 3000);
});

test('snap question-and-answer pairs and openers after a greeting', () => {
  assert.ok(ids('No signal? No problem. It syncs later.').includes('rhetorical-qa'));
  assert.ok(ids('Hi there,\n\nThanks for reaching out, and sorry for the trouble.').includes('sycophantic-opener'));
  assert.ok(!ids('Hi Sam,\n\nThe invoice is attached.').includes('sycophantic-opener'));
});

test('hashtags, and morals just above a sign-off', () => {
  assert.equal(ids('Shipped. #DevOps #AI').filter((i) => i === 'hashtag').length, 2);
  assert.ok(!ids('# A heading\n\nText here.').includes('hashtag'));
  assert.ok(ids("We reroute late trucks now. That's the difference between reacting and planning. Welcome aboard, Sam.").includes('slogan-ending'));
});
