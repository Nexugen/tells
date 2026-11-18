/**
 * Markdown tables from saved v2 reports, for EVAL.md and RESULTS.md.
 *
 *   node --experimental-strip-types bench/v2-tables.ts bench/rounds/r1-fresh-1.json [more.json...]
 */
import { readFileSync } from 'node:fs';

const pct = (x: number | null | undefined) => (x === null || x === undefined ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const reports = process.argv.slice(2).map((f) => ({ f, d: JSON.parse(readFileSync(f, 'utf8')) }));

console.log('| Set | Human texts | With a warning or error | With an error | Low human-pattern score | Model texts | Plain model output flagged (60+ words) | All plain model output flagged | Adversarial flagged | AUC | AUC, adversarial | Calibration error |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const { f, d } of reports) {
  const name = f.replace(/^.*\//, '').replace('.json', '');
  console.log(`| ${name} | ${d.samples.human} | ${pct(d.humanFindings.blockLabel.warningOrError)} | ${pct(d.humanFindings.blockLabel.error)} | ${pct(d.humanLowScore)} | ${d.samples.model} | ${pct(d.modelFlagged.plainJudged.either)} | ${pct(d.modelFlagged.plain.either)} | ${pct(d.modelFlagged.adversarial.either)} | ${d.auc.all} | ${d.auc.adversarial} | ${d.calibration.ece} |`);
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
