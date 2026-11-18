/**
 * False positives on human writing: for each rule and register, the share of human samples it
 * fires on. Every human sample counts, held-out ones included, and each is linted whole, the way
 * someone would paste it.
 *
 *   node --experimental-strip-types bench/fp.ts [path/to/src] [--json out.json]
 *
 * Pass another copy's src folder to measure an older version against the same samples.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : join(here, '..', 'src'));
const { lint } = (await import(join(srcDir, 'lint.ts'))) as typeof import('../src/lint.ts');
const REGS = ['casual', 'professional', 'technical', 'marketing'] as const;

const human = (JSON.parse(readFileSync(join(here, 'human.json'), 'utf8')).samples as { id: string; register: (typeof REGS)[number]; text: string }[]);

export interface FpReport {
  samples: Record<string, number>;
  /** Share of samples with at least one warning or error, by register. */
  anyBlocking: Record<string, number>;
  /** Share of samples with any finding at all, hints included. */
  anyFinding: Record<string, number>;
  /** rule id -> register -> { any: share with any hit, blocking: share with a warning or error hit } */
  rules: Record<string, Record<string, { any: number; blocking: number }>>;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const report: FpReport = { samples: {}, anyBlocking: {}, anyFinding: {}, rules: {} };
for (const reg of REGS) {
  const xs = human.filter((h) => h.register === reg);
  report.samples[reg] = xs.length;
  let blockingTexts = 0;
  let anyTexts = 0;
  const any = new Map<string, number>();
  const block = new Map<string, number>();
  for (const h of xs) {
    const f = lint(h.text, { register: reg }).findings;
    if (f.length) anyTexts++;
    if (f.some((x) => x.severity !== 'info')) blockingTexts++;
    for (const id of new Set(f.map((x) => x.ruleId))) any.set(id, (any.get(id) ?? 0) + 1);
    for (const id of new Set(f.filter((x) => x.severity !== 'info').map((x) => x.ruleId))) block.set(id, (block.get(id) ?? 0) + 1);
  }
  report.anyBlocking[reg] = r3(blockingTexts / Math.max(1, xs.length));
  report.anyFinding[reg] = r3(anyTexts / Math.max(1, xs.length));
  for (const [id, n] of any) {
    report.rules[id] ??= {};
    report.rules[id][reg] = { any: r3(n / xs.length), blocking: r3((block.get(id) ?? 0) / xs.length) };
  }
}

const out = process.argv.indexOf('--json');
if (out > 0) writeFileSync(process.argv[out + 1], JSON.stringify(report, null, 1));
else {
  console.log('samples', JSON.stringify(report.samples));
  console.log('texts with a warning or error', JSON.stringify(report.anyBlocking));
  const rows = Object.entries(report.rules).sort((a, b) => Math.max(...Object.values(b[1]).map((v) => v.any)) - Math.max(...Object.values(a[1]).map((v) => v.any)));
  for (const [id, regs] of rows) console.log(id.padEnd(22), REGS.map((r) => `${r.slice(0, 4)} ${regs[r] ? `${(regs[r].any * 100).toFixed(0)}%/${(regs[r].blocking * 100).toFixed(0)}%` : '-'}`.padEnd(15)).join(''));
}
