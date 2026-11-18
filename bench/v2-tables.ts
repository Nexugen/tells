/**
 * Markdown tables from saved v2 reports, for EVAL.md and RESULTS.md.
 *
 *   node --experimental-strip-types bench/v2-tables.ts bench/rounds/r1-fresh-1.json [more.json...]
 *   node --experimental-strip-types bench/v2-tables.ts --probe bench/rounds/r3-probe-before.json bench/rounds/r3-probe.json
 */
import { readFileSync } from 'node:fs';

const pct = (x: number | null | undefined) => (x === null || x === undefined ? 'n/a' : `${(x * 100).toFixed(1)}%`);
if (process.argv[2] === '--probe') {
  const [before, after] = process.argv.slice(3).map((f) => JSON.parse(readFileSync(f, 'utf8')));
  console.log(`| Probe set | Texts | Under the line, before (${before.lowLine}) | After (${after.lowLine}) | Under 50, before | After | 10th percentile, before | After | Mean, before | After |`);
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const k of Object.keys(after).filter((k) => typeof after[k] === 'object')) {
    const b = before[k], a = after[k];
    console.log(`| ${k} | ${a.n} | ${pct(b.low)} | ${pct(a.low)} | ${pct(b.under50)} | ${pct(a.under50)} | ${b.p10} | ${a.p10} | ${b.mean} | ${a.mean} |`);
  }
  process.exit(0);
}
const reports = process.argv.slice(2).map((f) => ({ f, d: JSON.parse(readFileSync(f, 'utf8')) }));

console.log('| Set | Human texts | With a warning or error | With an error | Low human-pattern score | Model texts | Plain model output flagged (60+ words) | All plain model output flagged | Adversarial flagged | AUC | AUC, adversarial | Calibration error |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const { f, d } of reports) {
  const name = f.replace(/^.*\//, '').replace('.json', '');
  console.log(`| ${name} | ${d.samples.human} | ${pct(d.humanFindings.blockLabel.warningOrError)} | ${pct(d.humanFindings.blockLabel.error)} | ${pct(d.humanLowScore)} | ${d.samples.model} | ${pct(d.modelFlagged.plainJudged.either)} | ${pct(d.modelFlagged.plain.either)} | ${pct(d.modelFlagged.adversarial.either)} | ${d.auc.all} | ${d.auc.adversarial} | ${d.calibration.ece} |`);
}
console.log('\n| Set | Human texts about AI, apps or tech | Under the line | Other human texts | Under the line | Gap | Lowercase human texts | Under the line |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const { f, d } of reports) {
  const t = d.techGap;
  if (t) console.log(`| ${f.replace(/^.*\//, '').replace('.json', '')} | ${t.tech.n} | ${pct(t.tech.low)} | ${t.other.n} | ${pct(t.other.low)} | ${(t.gap * 100).toFixed(1)} points | ${t.lowercase.n} | ${pct(t.lowercase.low)} |`);
}
for (const { f, d } of reports) {
  console.log(`\n${f.replace(/^.*\//, '')}, by register\n`);
  console.log('| Register | Human texts | With a warning or error | Low score | Model texts | Model flagged | AUC |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [reg, v] of Object.entries(d.byRegister) as [string, any][]) console.log(`| ${reg} | ${v.human} | ${pct(v.humanWarn)} | ${pct(v.humanLow)} | ${v.model} | ${pct(v.modelFlagged)} | ${d.auc[reg] ?? 'n/a'} |`);
  console.log(`\n${f.replace(/^.*\//, '')}, by source\n`);
  console.log('| Source | Texts | With a warning or error | Low score | Mean score |');
  console.log('| --- | ---: | ---: | ---: | ---: |');
  for (const [src, v] of Object.entries(d.bySource) as [string, any][]) console.log(`| ${src} | ${v.n} | ${pct(v.warnLabel)} | ${pct(v.lowScore)} | ${v.meanScore ?? 'n/a'} |`);
  console.log(`\n${f.replace(/^.*\//, '')}, by model\n`);
  console.log('| Model | Texts | Rules flag | Score flags | Either |');
  console.log('| --- | ---: | ---: | ---: | ---: |');
  for (const [m, v] of Object.entries(d.byModel) as [string, any][]) console.log(`| ${m} | ${v.n} | ${pct(v.rules)} | ${pct(v.score)} | ${pct(v.either)} |`);
}
