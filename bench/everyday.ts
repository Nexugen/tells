/**
 * Ordinary model output, the way people meet it: answers from a plain chat assistant to everyday
 * requests (bench/everyday/prompts.json). Checks what lint() reports with no options, as the web
 * page and the CLI do by default.
 *
 *   node --experimental-strip-types bench/everyday.ts [--split dev|test] [--show N] [--fixtures]
 *
 * --fixtures writes test/fixtures/everyday.json (the test split) for the regression test.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint } from '../src/lint.ts';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const bank = JSON.parse(readFileSync(join(here, 'everyday', 'prompts.json'), 'utf8')).prompts as { id: string; genre: string; variant: string; prompt: string }[];
const split = new Map(bank.map((p) => [p.id, p]));
const rows: { id: string; model: string; split: string; genre: string; prompt: string; text: string }[] = [];
for (const m of ['haiku', 'sonnet', 'opus']) {
  const f = join(here, 'everyday', 'out', `claude-${m}.json`);
  if (!existsSync(f)) continue;
  for (const it of JSON.parse(readFileSync(f, 'utf8')).items) {
    const p = split.get(it.id);
    if (p) rows.push({ id: `${m}:${it.id}`, model: m, split: p.variant, genre: p.genre, prompt: p.prompt, text: it.text });
  }
}

const want = arg('split');
const pick = rows.filter((r) => !want || r.split === want);
const res = pick.map((r) => {
  const out = lint(r.text);
  const strong = out.findings.filter((f) => f.severity !== 'info');
  return { ...r, register: out.register, words: out.words, strong: strong.length, rules: [...new Set(strong.map((f) => f.ruleId))], hints: out.findings.length - strong.length, grade: out.grade, score: out.human.pattern?.score ?? null, low: !!out.human.pattern?.low };
});
const pct = (n: number, d: number) => `${((n / Math.max(1, d)) * 100).toFixed(0)}%`;
const sum = (xs: typeof res, name: string) => {
  const scored = xs.filter((r) => r.score !== null);
  const flagged = xs.filter((r) => r.strong > 0 || r.low);
  console.log(`${name.padEnd(14)} n ${String(xs.length).padStart(3)}  with a warning ${pct(xs.filter((r) => r.strong).length, xs.length).padStart(4)}  low score ${pct(scored.filter((r) => r.low).length, scored.length).padStart(4)}  flagged ${pct(flagged.length, xs.length).padStart(4)}  score<50 ${pct(scored.filter((r) => (r.score ?? 100) < 50).length, scored.length).padStart(4)}  median score ${scored.map((r) => r.score!).sort((a, b) => a - b)[Math.floor(scored.length / 2)] ?? '-'}`);
};
for (const s of ['dev', 'test']) sum(res.filter((r) => r.split === s), s);
for (const g of [...new Set(res.map((r) => r.genre))]) sum(res.filter((r) => r.genre === g), g);
for (const m of ['haiku', 'sonnet', 'opus']) sum(res.filter((r) => r.model === m), m);
const hits = new Map<string, number>();
for (const r of res) for (const id of r.rules) hits.set(id, (hits.get(id) ?? 0) + 1);
console.log('rules that stand:', [...hits.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
for (const r of res.filter((r) => !r.strong && !r.low).slice(0, Number(arg('show', '0')))) console.log(`--- ${r.id} [${r.register}] score ${r.score} hints ${r.hints}\n${r.text.slice(0, 500)}`);
if (process.argv.includes('--fixtures')) {
  const fx = rows.filter((r) => r.split === 'test').map(({ id, genre, prompt, text }) => ({ id, genre, prompt, text }));
  writeFileSync(join(here, '..', 'test', 'fixtures', 'everyday.json'), JSON.stringify({ note: 'Answers from Claude Haiku, Sonnet and Opus to everyday requests with a plain "You are a helpful assistant." system prompt. Written by bench/everyday.ts --fixtures from the test half of bench/everyday/prompts.json.', items: fx }, null, 1) + '\n');
  console.log(`wrote ${fx.length} fixtures`);
}
