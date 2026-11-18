/**
 * The v2 benchmark: false positives on human writing, model output flagged, and the
 * human-pattern score, on thousands of samples split by source and prompt.
 *
 *   node --experimental-strip-types bench/v2.ts stats                 dataset size by source, register and split
 *   node --experimental-strip-types bench/v2.ts train                 fit the score on train, calibrate on tune, write src/score-model.json
 *   node --experimental-strip-types bench/v2.ts report [--on tune]    the numbers on one split (train, tune, test) or a fresh round (fresh-1, fresh-2)
 *   node --experimental-strip-types bench/v2.ts fp [--on tune]        human texts with warnings or errors, for fixing rules
 *   node --experimental-strip-types bench/v2.ts probe [--json f]       the modern probe (AI, apps, lowercase chat), human only
 *
 * `--on test` and `--on fresh-N` print a one-time score. Do not tune on what they show.
 * `--json file` saves the report.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gate, lint, DEFAULT_CORROBORATE, HIGH_SCORE } from '../src/lint.ts';
import { guessRegister } from '../src/register.ts';
import { scoreFeatures, stripLayout, SCORE_KEYS } from '../src/score-features.ts';
import { mask, paragraphs, sentences, countWords } from '../src/text.ts';
import type { Register, RuleContext, Finding } from '../src/types.ts';
import { REGISTERS } from '../src/types.ts';
import { DATA_DIR, loadAll, loadFresh, loadProbe, type Sample } from './dataset.ts';
import { auc, platt, predictMargin, trainGbdt, type Gbdt } from './gbdt.ts';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const MIN_WORDS = 60;

// --- per-sample analysis, cached -----------------------------------------------------------

interface Row { s: Sample; words: number; blockLabel: Finding[]; blockAuto: Finding[]; blockDefault: Finding[]; autoRegister: Register; x: number[] }

const CODE_VERSION = createHash('sha256')
  .update(['rules.ts', 'rules-more.ts', 'rules-util.ts', 'lint.ts', 'human.ts', 'text.ts', 'register.ts', 'score-features.ts'].map((f) => readFileSync(join(here, '..', 'src', f), 'utf8')).join('\n'))
  .digest('hex')
  .slice(0, 12);
const cacheDir = join(DATA_DIR, 'cache');
const cacheFile = join(cacheDir, `rows-${CODE_VERSION}.json`);
let cache: Record<string, Omit<Row, 's'>> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
let dirty = 0;

const slim = (f: Finding[]) => f.filter((x) => x.severity !== 'info').map((x) => ({ ruleId: x.ruleId, severity: x.severity, category: x.category, match: x.match.slice(0, 80) }) as unknown as Finding);

export function features(text: string, register: Register, findings: Finding[]): number[] {
  const prose = stripLayout(text);
  const masked = mask(prose);
  const paras = paragraphs(masked);
  const ctx: RuleContext = { text: prose, masked, paragraphs: paras, sentences: sentences(masked, paras), register };
  return scoreFeatures({ text: prose, register, findings, ctx });
}

function analyse(s: Sample): Row {
  const key = createHash('sha256').update(`${s.register}\n${s.text}`).digest('hex').slice(0, 20);
  let r = cache[key];
  if (!r) {
    const label = lint(s.text, { register: s.register, noScore: true, corroborate: 0 });
    const auto = lint(s.text, { register: 'auto', noScore: true, corroborate: 0 });
    const def = lint(s.text, { noScore: true, corroborate: 0 });
    r = {
      words: countWords(stripLayout(s.text)),
      blockLabel: slim(label.findings),
      blockAuto: slim(auto.findings),
      blockDefault: slim(def.findings),
      autoRegister: auto.register,
      x: features(s.text, s.register, label.findings),
    };
    cache[key] = r;
    if (++dirty % 500 === 0) flush();
  }
  return { s, ...r };
}
function flush() {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(cache));
}

// --- weights: balance classes, and keep any one source from deciding the model ------------

function weights(rows: Row[]): number[] {
  const bySource = new Map<string, number>();
  for (const r of rows) bySource.set(`${r.s.y}:${r.s.source}`, (bySource.get(`${r.s.y}:${r.s.source}`) ?? 0) + 1);
  const raw = rows.map((r) => 1 / Math.sqrt(bySource.get(`${r.s.y}:${r.s.source}`)!));
  const tot = [0, 0];
  rows.forEach((r, i) => (tot[r.s.y] += raw[i]));
  return raw.map((w, i) => (w / tot[rows[i].s.y]) * rows.length * 0.5);
}

// --- commands ------------------------------------------------------------------------------

function load(on: string, gated = true): Row[] {
  const all = on === 'probe' ? loadProbe() : on.startsWith('fresh-') ? loadFresh(Number(on.slice(6))) : loadAll().filter((s) => s.split === on);
  const rows = all.map(analyse);
  flush();
  if (!gated) return rows;
  // Apply lint()'s corroboration gate with the current score model, the way lint() would.
  const need = Number(arg('corroborate', String(DEFAULT_CORROBORATE)));
  const sc = existsSync(join(here, '..', 'src', 'score-model.json')) ? modelScore() : null;
  const m = JSON.parse(readFileSync(join(here, '..', 'src', 'score-model.json'), 'utf8'));
  return rows.map((r) => {
    const judged = !!(sc && m.trees.length && r.words >= MIN_WORDS);
    const low = judged && sc!(r.x) < m.low;
    const high = judged && sc!(r.x) >= Number(arg('high', String(HIGH_SCORE)));
    const g = (fs: Finding[], reg: Register) => {
      if (need === 0) return fs;
      const copy = fs.map((f) => ({ ...f, message: '' }));
      gate(copy, need, low, undefined, (arg('gate-by', 'category') as 'rule' | 'category'), reg, high);
      return copy.filter((f) => f.severity !== 'info');
    };
    return { ...r, blockLabel: g(r.blockLabel, r.s.register), blockAuto: g(r.blockAuto, r.autoRegister), blockDefault: g(r.blockDefault, r.autoRegister) };
  });
}

function stats() {
  const all = loadAll();
  const t = (f: (s: Sample) => string) => {
    const m = new Map<string, Record<string, number>>();
    for (const s of all) {
      const k = f(s);
      const e = m.get(k) ?? { train: 0, tune: 0, test: 0, total: 0 };
      e[s.split]++;
      e.total++;
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  };
  const print = (title: string, rows: [string, Record<string, number>][]) => {
    console.log(`\n${title}`);
    for (const [k, v] of rows) console.log(`  ${k.padEnd(34)} ${String(v.total).padStart(5)}  train ${v.train} tune ${v.tune} test ${v.test}`);
  };
  print('by source', t((s) => `${s.y ? 'human' : 'model'} ${s.source}`));
  print('by register', t((s) => `${s.y ? 'human' : 'model'} ${s.register}`));
  print('by genre', t((s) => `${s.y ? 'human' : 'model'} ${s.genre}`));
  print('model by model', t((s) => (s.y ? 'human' : `${s.model}${s.adversarial ? ' adversarial' : ''}`)));
  const groups = new Set(all.map((s) => s.group));
  console.log(`\n${all.length} samples, ${groups.size} groups, ${all.filter((s) => s.nonNative).length} non-native`);
}

/**
 * Short pieces of the longer texts, cut at sentence ends to 70 to 150 words, as extra training rows
 * in the same split and group. Most texts in the pool run long, while the score is used from 60
 * words up; without these it had seen little short writing from either side and judged a short
 * chat message by habits that only mean something in a long one.
 */
export function chunkSamples(rows: Row[], perText: number): Row[] {
  const out: Row[] = [];
  for (const r of rows) {
    if (r.words < 160 || perText <= 0) continue;
    const sents = r.s.text.replace(/\r/g, '').split(/(?<=[.!?])\s+(?=[\p{L}"“(])|\n{2,}/u).filter((x) => x.trim());
    const seed = parseInt(createHash('sha256').update(`chunk:${r.s.id}`).digest('hex').slice(0, 8), 16);
    let start = seed % Math.max(1, Math.floor(sents.length / 3)), made = 0;
    while (made < perText && start < sents.length) {
      const target = 70 + ((seed >>> (made * 5)) % 81);
      let end = start, n = 0;
      while (end < sents.length && n < target) n += countWords(sents[end++]);
      if (n < 70 || n > 190) break;
      const text = sents.slice(start, end).join(' ');
      out.push(analyse({ ...r.s, id: `${r.s.id}#c${made}`, text }));
      made++;
      start = end + 1;
    }
  }
  flush();
  return out;
}

function train() {
  const base = load('train', false).filter((r) => r.words >= MIN_WORDS);
  const tr = [...base, ...chunkSamples(base, Number(arg('chunks', '0')))];
  const tu = load('tune', false).filter((r) => r.words >= MIN_WORDS);
  const opts = { trees: Number(arg('trees', '2000')), depth: Number(arg('depth', '3')), rate: Number(arg('rate', '0.03')), minLeaf: Number(arg('min-leaf', '25')), colsample: Number(arg('col', '0.5')) };
  const m = trainGbdt(tr.map((r) => r.x), tr.map((r) => r.s.y), weights(tr), opts);
  const mTu = tu.map((r) => predictMargin(m, r.x));
  const wTu = weights(tu);
  const cal = platt(mTu, tu.map((r) => r.s.y), wTu);
  const prob = (mm: number) => 1 / (1 + Math.exp(-(cal.a * mm + cal.b)));
  // The low line: the score under which at most 1% of human tune texts fall.
  const hs = tu.filter((r) => r.s.y === 1).map((r, i) => Math.round(prob(predictMargin(m, r.x)) * 100)).sort((a, b) => a - b);
  const low = Math.max(1, hs[Math.floor(hs.length * Number(arg('low-share', '0.01')))] ?? 1);
  const out = { version: 2, builtAt: new Date().toISOString().slice(0, 10), keys: SCORE_KEYS, base: m.base, rate: m.rate, trees: m.trees.map(compact), calib: { a: round(cal.a, 5), b: round(cal.b, 5) }, low, minWords: MIN_WORDS, trained: { train: tr.length, tune: tu.length } };
  writeFileSync(join(here, '..', 'src', 'score-model.json'), JSON.stringify(out) + '\n');
  console.log(`train ${tr.length}, tune ${tu.length}; tune AUC ${auc(mTu, tu.map((r) => r.s.y)).toFixed(4)}; calib a=${cal.a.toFixed(3)} b=${cal.b.toFixed(3)}; low line ${low}`);
  importance(m);
}

const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
function compact(t: Gbdt['trees'][number]) {
  // Trim trailing unused slots and round thresholds and leaves.
  let last = t.f.length - 1;
  while (last > 0 && t.f[last] < 0 && t.l[last] === 0) last--;
  return { f: t.f.slice(0, last + 1), t: t.t.slice(0, last + 1).map((v) => round(v, 5)), l: t.l.slice(0, last + 1).map((v) => round(v, 5)) };
}
function importance(m: Gbdt) {
  const n = new Map<number, number>();
  for (const t of m.trees) for (const f of t.f) if (f >= 0) n.set(f, (n.get(f) ?? 0) + 1);
  console.log('most used features:', [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([f, c]) => `${SCORE_KEYS[f]}(${c})`).join(' '));
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** A text about AI, apps, software or business: two or more of these words. */
const TECH_RE = /\b(?:AI|A\.I\.|artificial intelligence|machine learning|ML|deep learning|neural (?:net|network)s?|GPT-?\d?|chatbots?|models?|apps?|app store|startups?|SaaS|pricing|platforms?|software|APIs?|users?|customers?|business(?:es)?|revenue|margins?|subscriptions?|developers?|code|online|website|tech|technology|Android|iOS|iPhone)\b/gi;
export const isTech = (t: string) => (t.match(TECH_RE)?.length ?? 0) >= 3;
/** Typed mostly in lowercase: at least half the sentences start with a small letter. */
export function isLowercase(t: string): boolean {
  const s = t.split(/(?<=[.!?])\s+|\n\n/).filter((x) => /[A-Za-z]/.test(x));
  return s.length >= 3 && s.filter((x) => /^\W*[a-z]/.test(x)).length / s.length >= 0.5;
}

/** The modern probe, human only: score distribution by source, for tech and lowercase texts. */
function probe() {
  const rows = load('probe').filter((r) => r.words >= MIN_WORDS);
  const m = JSON.parse(readFileSync(join(here, '..', 'src', 'score-model.json'), 'utf8'));
  const sc = modelScore();
  const dist = (xs: Row[]) => {
    const v = xs.map((r) => sc(r.x)).sort((a, b) => a - b);
    const q = (p: number) => v[Math.floor(p * (v.length - 1))] ?? null;
    return { n: v.length, low: round(v.filter((x) => x < m.low).length / Math.max(1, v.length), 3), under50: round(v.filter((x) => x < 50).length / Math.max(1, v.length), 3), p10: q(0.1), p25: q(0.25), median: q(0.5), mean: round(v.reduce((a, b) => a + b, 0) / Math.max(1, v.length), 1), warn: round(xs.filter((r) => r.blockAuto.length).length / Math.max(1, xs.length), 3) };
  };
  const out: Record<string, unknown> = { scoreModel: m.builtAt, lowLine: m.low, all: dist(rows), tech: dist(rows.filter((r) => isTech(r.s.text))), lowercase: dist(rows.filter((r) => isLowercase(r.s.text))) };
  for (const src of [...new Set(rows.map((r) => r.s.source))].sort()) out[src] = dist(rows.filter((r) => r.s.source === src));
  console.log(JSON.stringify(out, null, 1));
  const j = arg('json');
  if (j) writeFileSync(j, JSON.stringify(out, null, 1) + '\n');
  if (arg('show')) for (const r of rows.filter((r) => sc(r.x) < m.low).slice(0, Number(arg('show')))) console.log(`--- ${r.s.id} ${sc(r.x)}\n${r.s.text.slice(0, 300).replace(/\n+/g, ' / ')}`);
}

function modelScore() {
  const m = JSON.parse(readFileSync(join(here, '..', 'src', 'score-model.json'), 'utf8'));
  return (x: number[]) => {
    const mm = predictMargin(m, x);
    return Math.round((1 / (1 + Math.exp(-(m.calib.a * mm + m.calib.b)))) * 100);
  };
}

function report() {
  const on = arg('on', 'tune')!;
  if (on === 'test' || on.startsWith('fresh-')) console.log(`*** scoring the locked set ${on}: look once, do not tune on it ***`);
  const rows = load(on);
  const m = JSON.parse(readFileSync(join(here, '..', 'src', 'score-model.json'), 'utf8'));
  const sc = modelScore();
  const H = rows.filter((r) => r.s.y === 1), A = rows.filter((r) => r.s.y === 0);
  const judged = (r: Row) => r.words >= MIN_WORDS;
  const blocking = (r: Row, mode: 'blockLabel' | 'blockAuto' | 'blockDefault', sev?: 'error') => r[mode].some((f) => (sev ? f.severity === 'error' : true));
  const out: Record<string, unknown> = { on, samples: { human: H.length, model: A.length }, scoreModel: m.builtAt, lowLine: m.low };

  // Humans: findings.
  const fp: Record<string, unknown> = {};
  for (const mode of ['blockLabel', 'blockAuto', 'blockDefault'] as const) {
    fp[mode] = { warningOrError: round(H.filter((r) => blocking(r, mode)).length / Math.max(1, H.length)), error: round(H.filter((r) => blocking(r, mode, 'error')).length / Math.max(1, H.length)), n: H.length };
  }
  out.humanFindings = fp;
  // Humans: low score.
  const Hj = H.filter(judged), Aj = A.filter(judged);
  out.humanLowScore = round(Hj.filter((r) => sc(r.x) < m.low).length / Math.max(1, Hj.length));
  // Human texts about AI, apps or tech against the rest: the score should not care which.
  const lowOf = (xs: Row[]) => ({ n: xs.length, low: round(xs.filter((r) => sc(r.x) < m.low).length / Math.max(1, xs.length)), mean: round(xs.reduce((a, r) => a + sc(r.x), 0) / Math.max(1, xs.length), 1) });
  const ht = lowOf(Hj.filter((r) => isTech(r.s.text))), ho = lowOf(Hj.filter((r) => !isTech(r.s.text)));
  out.techGap = { tech: ht, other: ho, gap: round(ht.low - ho.low), lowercase: lowOf(Hj.filter((r) => isLowercase(r.s.text))) };
  // Model output flagged: a warning or error under its own register, or a low score.
  const flaggedBy = (r: Row) => ({ rules: blocking(r, 'blockLabel'), score: judged(r) && sc(r.x) < m.low });
  const flagShare = (xs: Row[]) => {
    const f = xs.map(flaggedBy);
    return { n: xs.length, rules: round(f.filter((v) => v.rules).length / Math.max(1, xs.length)), score: round(f.filter((v) => v.score).length / Math.max(1, xs.length)), either: round(f.filter((v) => v.rules || v.score).length / Math.max(1, xs.length)) };
  };
  out.modelFlagged = { plain: flagShare(A.filter((r) => !r.s.adversarial)), adversarial: flagShare(A.filter((r) => r.s.adversarial)), plainJudged: flagShare(Aj.filter((r) => !r.s.adversarial)) };
  // AUC, overall and per register, texts of 60 words or more.
  const aucOf = (h: Row[], a: Row[]) => (h.length && a.length ? round(auc([...h, ...a].map((r) => predictMargin(m, r.x)), [...h, ...a].map((r) => r.s.y)), 3) : null);
  const aucR: Record<string, unknown> = { all: aucOf(Hj, Aj), plain: aucOf(Hj, Aj.filter((r) => !r.s.adversarial)), adversarial: aucOf(Hj, Aj.filter((r) => r.s.adversarial)) };
  for (const reg of REGISTERS) aucR[reg] = aucOf(Hj.filter((r) => r.s.register === reg), Aj.filter((r) => r.s.register === reg));
  out.auc = aucR;
  // Calibration: share of human texts in each score band (balanced by weighting model texts to the same total).
  const bands = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 101];
  const wH = 1 / Math.max(1, Hj.length), wA = 1 / Math.max(1, Aj.length);
  const cal = [];
  let ece = 0;
  for (let b = 0; b < bands.length - 1; b++) {
    const inH = Hj.filter((r) => sc(r.x) >= bands[b] && sc(r.x) < bands[b + 1]);
    const inA = Aj.filter((r) => sc(r.x) >= bands[b] && sc(r.x) < bands[b + 1]);
    const tw = inH.length * wH + inA.length * wA;
    if (!tw) continue;
    const meanScore = ([...inH.map((r) => sc(r.x) * wH), ...inA.map((r) => sc(r.x) * wA)].reduce((a, v) => a + v, 0) / tw) / 100;
    const share = (inH.length * wH) / tw;
    ece += (tw / 2) * Math.abs(share - meanScore);
    cal.push({ band: `${bands[b]}-${bands[b + 1] - 1}`, human: inH.length, model: inA.length, meanScore: round(meanScore, 2), humanShare: round(share, 2) });
  }
  out.calibration = { ece: round(ece, 3), bands: cal };
  // Per source and per register breakdowns.
  const bySrc: Record<string, unknown> = {};
  for (const src of [...new Set(rows.map((r) => `${r.s.y ? 'human' : 'model'}:${r.s.source}`))].sort()) {
    const xs = rows.filter((r) => `${r.s.y ? 'human' : 'model'}:${r.s.source}` === src);
    const js = xs.filter(judged);
    bySrc[src] = { n: xs.length, warnLabel: round(xs.filter((r) => blocking(r, 'blockLabel')).length / xs.length), warnAuto: round(xs.filter((r) => blocking(r, 'blockAuto')).length / xs.length), lowScore: js.length ? round(js.filter((r) => sc(r.x) < m.low).length / js.length) : null, meanScore: js.length ? round(js.reduce((a, r) => a + sc(r.x), 0) / js.length, 1) : null };
  }
  out.bySource = bySrc;
  const byReg: Record<string, unknown> = {};
  for (const reg of REGISTERS) {
    const h = H.filter((r) => r.s.register === reg), a = A.filter((r) => r.s.register === reg);
    byReg[reg] = { human: h.length, humanWarn: round(h.filter((r) => blocking(r, 'blockLabel')).length / Math.max(1, h.length)), humanLow: round(h.filter(judged).filter((r) => sc(r.x) < m.low).length / Math.max(1, h.filter(judged).length)), model: a.length, modelFlagged: flagShare(a).either };
  }
  out.byRegister = byReg;
  const byGenre: Record<string, unknown> = {};
  for (const g of [...new Set(rows.map((r) => r.s.genre))].sort()) {
    const h = H.filter((r) => r.s.genre === g), a = A.filter((r) => r.s.genre === g);
    byGenre[g] = { human: h.length, humanWarn: round(h.filter((r) => blocking(r, 'blockLabel')).length / Math.max(1, h.length)), model: a.length, modelFlagged: flagShare(a).either, auc: aucOf(h.filter(judged), a.filter(judged)) };
  }
  out.byGenre = byGenre;
  const nn = H.filter((r) => r.s.nonNative);
  out.nonNative = { n: nn.length, warn: round(nn.filter((r) => blocking(r, 'blockLabel')).length / Math.max(1, nn.length)), low: round(nn.filter(judged).filter((r) => sc(r.x) < m.low).length / Math.max(1, nn.filter(judged).length)) };
  const byModel: Record<string, unknown> = {};
  for (const mo of [...new Set(A.map((r) => r.s.model!))].sort()) byModel[mo] = flagShare(A.filter((r) => r.s.model === mo));
  out.byModel = byModel;
  // Rules firing on humans.
  const ruleFp = new Map<string, number>();
  for (const r of H) for (const id of new Set(r.blockLabel.map((f) => f.ruleId))) ruleFp.set(id, (ruleFp.get(id) ?? 0) + 1);
  out.humanRuleHits = Object.fromEntries([...ruleFp.entries()].sort((a, b) => b[1] - a[1]));
  const ruleTp = new Map<string, number>();
  for (const r of A) for (const id of new Set(r.blockLabel.map((f) => f.ruleId))) ruleTp.set(id, (ruleTp.get(id) ?? 0) + 1);
  out.modelRuleHits = Object.fromEntries([...ruleTp.entries()].sort((a, b) => b[1] - a[1]));
  console.log(JSON.stringify(out, null, 1));
  const j = arg('json');
  if (j) writeFileSync(j, JSON.stringify(out, null, 1) + '\n');
}

function fpList() {
  const on = arg('on', 'train')!;
  if (on === 'test' || on.startsWith('fresh-')) throw new Error('fp lists are for train and tune only');
  const mode = (arg('mode', 'blockLabel') as 'blockLabel' | 'blockAuto' | 'blockDefault');
  const rule = arg('rule');
  const rows = load(on).filter((r) => r.s.y === (arg('model') ? 0 : 1));
  const hits = rows.filter((r) => r[mode].some((f) => !rule || f.ruleId === rule));
  for (const r of hits.slice(0, Number(arg('limit', '60')))) {
    const fs = r[mode].filter((f) => !rule || f.ruleId === rule);
    console.log(`${r.s.id} [${r.s.source}/${r.s.register}${mode === 'blockAuto' ? '->' + r.autoRegister : ''}] ${fs.map((f) => `${f.severity[0]}:${f.ruleId} «${f.match}»`).join(' | ')}`);
  }
  console.log(`${hits.length} of ${rows.length}`);
}

/**
 * Leave one source out, on train and tune only: fit without a human source (and, in turn, a
 * model genre), then see how that unseen source scores. This is the closest the training data
 * gets to a source it has never seen.
 */
function loso() {
  const rows = [...load('train', false), ...load('tune', false)].filter((r) => r.words >= MIN_WORDS);
  const opts = { trees: Number(arg('trees', '2000')), depth: Number(arg('depth', '3')), rate: Number(arg('rate', '0.03')), minLeaf: Number(arg('min-leaf', '25')), colsample: Number(arg('col', '0.5')) };
  const lowLine = Number(arg('low', '20'));
  const humanSources = [...new Set(rows.filter((r) => r.s.y === 1).map((r) => r.s.source))].filter((src) => rows.filter((r) => r.s.source === src).length >= 30);
  const res: Record<string, unknown> = {};
  for (const src of humanSources) {
    const tr = rows.filter((r) => r.s.source !== src);
    const te = rows.filter((r) => r.s.source === src);
    const m = trainGbdt(tr.map((r) => r.x), tr.map((r) => r.s.y), weights(tr), opts);
    const cal = platt(tr.map((r) => predictMargin(m, r.x)), tr.map((r) => r.s.y), weights(tr));
    const sc = (x: number[]) => 100 / (1 + Math.exp(-(cal.a * predictMargin(m, x) + cal.b)));
    const scores = te.map((r) => sc(r.x));
    res[src] = { n: te.length, low: round(scores.filter((v) => v < lowLine).length / te.length, 3), mean: round(scores.reduce((a, b) => a + b, 0) / te.length, 1) };
    console.log(src, JSON.stringify(res[src]));
  }
  const genres = [...new Set(rows.filter((r) => r.s.y === 0).map((r) => r.s.genre))];
  for (const g of genres) {
    const out = (r: Row) => r.s.y === 0 && r.s.genre === g;
    const tr = rows.filter((r) => !out(r));
    const te = rows.filter(out);
    if (te.length < 15) continue;
    const m = trainGbdt(tr.map((r) => r.x), tr.map((r) => r.s.y), weights(tr), opts);
    const cal = platt(tr.map((r) => predictMargin(m, r.x)), tr.map((r) => r.s.y), weights(tr));
    const sc = (x: number[]) => 100 / (1 + Math.exp(-(cal.a * predictMargin(m, x) + cal.b)));
    const scores = te.map((r) => sc(r.x));
    console.log(`model genre ${g}`, JSON.stringify({ n: te.length, flaggedLow: round(scores.filter((v) => v < lowLine).length / te.length, 3), mean: round(scores.reduce((a, b) => a + b, 0) / te.length, 1) }));
  }
}

/**
 * Leave the topic out: fit on train with every text about AI, apps or tech removed (people and
 * models alike), then compare tech and other texts on tune. If the score had learned the topic,
 * the tech texts it never saw would land on one side.
 */
function topicout() {
  const tr = load('train', false).filter((r) => r.words >= MIN_WORDS && !isTech(r.s.text));
  const tu = load('tune', false).filter((r) => r.words >= MIN_WORDS);
  const opts = { trees: Number(arg('trees', '2000')), depth: Number(arg('depth', '3')), rate: Number(arg('rate', '0.03')), minLeaf: Number(arg('min-leaf', '25')), colsample: Number(arg('col', '0.5')) };
  const m = trainGbdt(tr.map((r) => r.x), tr.map((r) => r.s.y), weights(tr), opts);
  const cal = platt(tu.map((r) => predictMargin(m, r.x)), tu.map((r) => r.s.y), weights(tu));
  const sc = (x: number[]) => 100 / (1 + Math.exp(-(cal.a * predictMargin(m, x) + cal.b)));
  const hs = tu.filter((r) => r.s.y === 1).map((r) => sc(r.x)).sort((a, b) => a - b);
  const low = hs[Math.floor(hs.length * 0.01)];
  const part = (y: 0 | 1, tech: boolean) => {
    const xs = tu.filter((r) => r.s.y === y && isTech(r.s.text) === tech);
    return { n: xs.length, under: round(xs.filter((r) => sc(r.x) < low).length / Math.max(1, xs.length), 3), mean: round(xs.reduce((a, r) => a + sc(r.x), 0) / Math.max(1, xs.length), 1) };
  };
  console.log(JSON.stringify({ trainedOn: tr.length, lowLine: round(low, 1), humanTech: part(1, true), humanOther: part(1, false), modelTech: part(0, true), modelOther: part(0, false) }, null, 1));
}

/** Model texts the score misses on train or tune, to see what the features do not catch. */
function misses() {
  const on = arg('on', 'tune')!;
  if (on === 'test' || on.startsWith('fresh-')) throw new Error('misses are for train and tune only');
  const m = JSON.parse(readFileSync(join(here, '..', 'src', 'score-model.json'), 'utf8'));
  const sc = modelScore();
  const rows = load(on).filter((r) => r.s.y === (arg('human') ? 1 : 0) && r.words >= MIN_WORDS);
  const bad = rows.filter((r) => (arg('human') ? sc(r.x) < m.low : sc(r.x) >= m.low && !r.blockLabel.length));
  for (const r of bad.slice(0, Number(arg('limit', '40')))) console.log(`--- ${r.s.id} [${r.s.genre}/${r.s.register}${r.s.adversarial ? ' adv' : ''}] score ${sc(r.x)}\n${r.s.text.slice(0, Number(arg('chars', '300'))).replace(/\n+/g, ' / ')}`);
  console.log(`${bad.length} of ${rows.length}`);
}

/** Rebuild src/profiles.json (signal shares per register) from the v2 train split. */
async function profiles() {
  const { SIGNALS, detectSignals, signalContext } = await import('../src/human.ts');
  const rows = loadAll().filter((s) => s.split === 'train' && countWords(s.text) >= MIN_WORDS);
  const registers: Record<string, Record<string, { human: number; model: number }>> = {};
  const samples = { human: {} as Record<string, number>, model: {} as Record<string, number> };
  for (const reg of REGISTERS) {
    const h = rows.filter((s) => s.y === 1 && s.register === reg), a = rows.filter((s) => s.y === 0 && s.register === reg);
    samples.human[reg] = h.length;
    samples.model[reg] = a.length;
    const has = (xs: Sample[]) => xs.map((s) => new Set(detectSignals(signalContext(s.text, reg)).map((p) => p.id)));
    const hh = has(h), aa = has(a);
    registers[reg] = {};
    for (const sig of SIGNALS) registers[reg][sig.id] = { human: round(hh.filter((x) => x.has(sig.id)).length / Math.max(1, h.length), 2), model: round(aa.filter((x) => x.has(sig.id)).length / Math.max(1, a.length), 2) };
  }
  writeFileSync(join(here, '..', 'src', 'profiles.json'), JSON.stringify({ version: 2, builtAt: new Date().toISOString().slice(0, 10), samples, registers }, null, 1) + '\n');
  console.log(JSON.stringify(samples));
}

const cmd = process.argv[2];
const run: Record<string, () => unknown> = { stats, train, report, fp: fpList, loso, misses, profiles, probe, topicout };
if (!run[cmd]) {
  console.error('usage: bench/v2.ts stats|train|report|fp [--on split]');
  process.exit(2);
}
await run[cmd]();
void guessRegister;
