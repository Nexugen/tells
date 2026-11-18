/**
 * The accuracy check. Labelled human and model texts, a held-out 30% split (model answers split
 * by prompt), and three ways to call a text "flagged":
 *
 *   rules  any warning or error
 *   style  the statistical layer (function words, punctuation, rhythm, layout) over a threshold
 *          set on the training half so that 95% of human training texts pass
 *   both   either of the two
 *
 *   node --experimental-strip-types bench/eval.ts [--write]
 *
 * --write saves the style weights to bench/style-model.json and the numbers to bench/eval.json.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint } from '../src/lint.ts';
import { STYLE_KEYS, styleFeatures } from './style.ts';
import { detectSignals, signalContext, SIGNALS } from '../src/human.ts';
import type { Register } from '../src/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
interface Row { id: string; register: Register; text: string; y: 0 | 1; test: boolean; source: string }

const heldOut = (key: string) => parseInt(createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % 10 < 3;
const human = JSON.parse(readFileSync(join(here, 'human.json'), 'utf8')).samples as { id: string; register: Register; text: string }[];
const rows: Row[] = human.map((h) => ({ ...h, y: 1, test: heldOut(`h:${h.id}`), source: 'human' }));
for (const f of readdirSync(join(here, 'out')).filter((f) => f.endsWith('.json') && !f.includes('+'))) {
  const set = JSON.parse(readFileSync(join(here, 'out', f), 'utf8'));
  for (const it of set.items) rows.push({ id: `${set.name}:${it.id}`, register: it.register, text: it.text, y: 0, test: heldOut(`p:${it.id}`), source: set.name });
}

function train(X: number[][], y: number[], epochs = 2000, lr = 0.1, l2 = 0.05) {
  const d = X[0].length;
  const mu = Array.from({ length: d }, (_, j) => X.reduce((a, x) => a + x[j], 0) / X.length);
  const sd = Array.from({ length: d }, (_, j) => Math.sqrt(X.reduce((a, x) => a + (x[j] - mu[j]) ** 2, 0) / X.length) || 1);
  const Z = X.map((x) => x.map((v, j) => (v - mu[j]) / sd[j]));
  const w = new Array(d).fill(0);
  let b = 0;
  const pos = y.filter((v) => v === 1).length;
  const cw = y.map((v) => (v === 1 ? y.length / (2 * pos) : y.length / (2 * (y.length - pos))));
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    Z.forEach((z, i) => {
      const p = 1 / (1 + Math.exp(-z.reduce((a, v, j) => a + v * w[j], b)));
      const g = (p - y[i]) * cw[i];
      for (let j = 0; j < d; j++) gw[j] += g * z[j];
      gb += g;
    });
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / Z.length + l2 * w[j]);
    b -= (lr * gb) / Z.length;
  }
  return { mu, sd, w, b };
}
// Probability that a text is machine-written (label 0 is model, so flip).
const aiProb = (m: ReturnType<typeof train>, x: number[]) => 1 - 1 / (1 + Math.exp(-x.reduce((a, v, j) => a + ((v - m.mu[j]) / m.sd[j]) * m.w[j], m.b)));

function auc(scores: number[], isAi: boolean[]) {
  let pairs = 0, wins = 0;
  scores.forEach((s, i) => { if (!isAi[i]) return; scores.forEach((t, k) => { if (isAi[k]) return; pairs++; wins += s > t ? 1 : s === t ? 0.5 : 0; }); });
  return pairs ? wins / pairs : 0;
}

const r2 = (x: number) => Math.round(x * 1000) / 1000;
const tr = rows.filter((r) => !r.test);
const te = rows.filter((r) => r.test);
const X = (rs: Row[]) => rs.map((r) => styleFeatures(r.text));
const model = train(X(tr), tr.map((r) => r.y));

// Out-of-fold probabilities on the training half, so the threshold isn't set on texts the model memorised.
const trX = X(tr);
const fold = (r: Row) => parseInt(createHash('sha256').update('f:' + r.id).digest('hex').slice(0, 8), 16) % 5;
const oof: number[] = new Array(tr.length).fill(0);
for (let k = 0; k < 5; k++) {
  const idx = tr.map((_, i) => i).filter((i) => fold(tr[i]) !== k);
  const m = train(idx.map((i) => trX[i]), idx.map((i) => tr[i].y), 800);
  tr.forEach((r, i) => { if (fold(r) === k) oof[i] = aiProb(m, trX[i]); });
}
const trainHumanProbs = tr.map((r, i) => (r.y === 1 ? oof[i] : -1)).filter((p) => p >= 0).sort((a, b) => a - b);
const threshold = trainHumanProbs[Math.min(trainHumanProbs.length - 1, Math.floor(trainHumanProbs.length * 0.95))];

function score(rs: Row[], flag: (r: Row) => boolean) {
  const h = rs.filter((r) => r.y === 1), m = rs.filter((r) => r.y === 0);
  const fh = h.filter(flag).length, fm = m.filter(flag).length;
  return {
    humanLeftAlone: r2(1 - fh / Math.max(1, h.length)),
    aiFlagged: r2(fm / Math.max(1, m.length)),
    precision: r2(fm / Math.max(1, fm + fh)),
    human: h.length,
    ai: m.length,
  };
}
const rulesFlag = (r: Row) => lint(r.text, { register: r.register }).findings.some((f) => f.severity !== 'info');
const styleFlag = (r: Row) => aiProb(model, styleFeatures(r.text)) >= threshold;
const byRegister = (flag: (r: Row) => boolean) => Object.fromEntries((['casual', 'professional', 'technical', 'marketing'] as Register[]).map((g) => [g, score(te.filter((r) => r.register === g), flag)]));

// Lift of each human signal and the strongest style features, measured on the training half only.
const share = (rs: Row[], f: (r: Row) => boolean) => rs.filter(f).length / Math.max(1, rs.length);
const trH = tr.filter((r) => r.y === 1), trM = tr.filter((r) => r.y === 0);
const signalLift = SIGNALS.map((s) => {
  const has = (r: Row) => detectSignals(signalContext(r.text, r.register)).some((p) => p.id === s.id);
  const h = share(trH, has), m = share(trM, has);
  return { id: s.id, human: r2(h), model: r2(m), lift: r2((h + 0.02) / (m + 0.02)) };
}).sort((a, b) => b.lift - a.lift);
const styleWeights = STYLE_KEYS.map((k, j) => ({ feature: k, weight: r2(-model.w[j]) })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 15);

// A second human set from other sites, fetched after the rules were tuned. Nothing was changed to fit it.
const checkSet = (file: string) => {
  const rs = (JSON.parse(readFileSync(join(here, file), 'utf8')).samples as { id: string; register: Register; text: string }[]).map((h) => ({ ...h, y: 1 as const, test: true, source: file }));
  return Object.fromEntries((['casual', 'professional'] as Register[]).map((g) => {
    const xs = rs.filter((r) => r.register === g);
    const ok = (f: (r: Row) => boolean) => r2(1 - xs.filter(f).length / Math.max(1, xs.length));
    return [g, { samples: xs.length, rulesLeftAlone: ok(rulesFlag), styleLeftAlone: ok(styleFlag), bothLeftAlone: ok((r) => rulesFlag(r) || styleFlag(r)) }];
  }));
};
const freshBy = checkSet('human-fresh.json');
const finalBy = existsSync(join(here, 'human-final.json')) && process.argv.includes('--final') ? checkSet('human-final.json') : undefined;

const result = {
  scoredAt: new Date().toISOString().slice(0, 10),
  split: { train: { human: trH.length, ai: trM.length }, test: { human: te.filter((r) => r.y === 1).length, ai: te.filter((r) => r.y === 0).length } },
  heldOut: {
    rules: score(te, rulesFlag),
    style: { ...score(te, styleFlag), auc: r2(auc(te.map((r) => aiProb(model, styleFeatures(r.text))), te.map((r) => r.y === 0))), threshold: r2(threshold) },
    both: score(te, (r) => rulesFlag(r) || styleFlag(r)),
  },
  freshHuman: freshBy,
  ...(finalBy ? { finalHuman: finalBy } : {}),
  heldOutByRegister: { rules: byRegister(rulesFlag), style: byRegister(styleFlag) },
  signalLift,
  styleWeights,
};
console.log(JSON.stringify(result, null, 1));
if (process.argv.includes('--write')) {
  writeFileSync(join(here, 'eval.json'), JSON.stringify(result, null, 1) + '\n');
  writeFileSync(join(here, 'style-model.json'), JSON.stringify({ version: 1, keys: STYLE_KEYS, mu: model.mu.map(r2), sd: model.sd.map(r2), w: model.w.map(r2), b: r2(model.b), threshold: r2(threshold) }) + '\n');
}
