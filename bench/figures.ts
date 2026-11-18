/**
 * Writes src/bench-figures.json, the benchmark numbers the landing page shows, from the saved
 * round reports and the dataset itself, so the page never carries hand-copied figures.
 *
 *   node --experimental-strip-types bench/figures.ts --fresh bench/rounds/r3-fresh-3.json --test bench/rounds/r3-test.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll, loadFresh, SPENT_ROUNDS } from './dataset.ts';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  if (i < 0) throw new Error(`--${k} is required`);
  return process.argv[i + 1];
};
const fresh = JSON.parse(readFileSync(arg('fresh'), 'utf8'));
const test = JSON.parse(readFileSync(arg('test'), 'utf8'));
const round = Number(String(fresh.on).replace('fresh-', ''));

// The pool, plus every held-out round not yet merged into it.
const unmerged = Array.from({ length: round }, (_, i) => i + 1).filter((r) => !SPENT_ROUNDS.includes(r));
const all = [...loadAll(), ...unmerged.flatMap((r) => loadFresh(r))];
const human = all.filter((s) => s.y === 1), model = all.filter((s) => s.y === 0);
const banks = ['prompts-v2.json', 'prompts-topic.json', ...Array.from({ length: round }, (_, i) => `fresh-${i + 1}/prompts.json`)];
const bankPrompts = banks.flatMap((f) => JSON.parse(readFileSync(join(here, f), 'utf8')).prompts as { genre: string }[]);
const prompts = bankPrompts.length;
const pct = (x: number) => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;
const n = (x: number) => x.toLocaleString('en-US');

const figures = {
  note: 'Written by bench/figures.ts from the round reports. Do not edit by hand.',
  round: fresh.on,
  humanSamples: n(human.length),
  modelSamples: n(model.length),
  prompts: n(prompts),
  genres: new Set(bankPrompts.map((p) => p.genre)).size,
  sources: new Set(human.map((s) => s.source)).size,
  freshHuman: n(fresh.samples.human),
  freshHumanFlagged: Math.round(fresh.humanFindings.blockLabel.warningOrError * fresh.samples.human),
  freshPlainFlagged: pct(fresh.modelFlagged.plainJudged.either),
  freshAuc: String(fresh.auc.all),
  freshTechGap: `${(Math.round(fresh.techGap.gap * 1000) / 10).toFixed(1)} points`,
  testHuman: n(test.samples.human),
  testFlagged: pct(test.humanFindings.blockLabel.warningOrError),
  adversarialFlagged: `${Math.round(fresh.modelFlagged.adversarial.either * 100)}%`,
};
writeFileSync(join(here, '..', 'src', 'bench-figures.json'), JSON.stringify(figures, null, 1) + '\n');
console.log(figures);
