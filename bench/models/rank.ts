/**
 * The model ranking: how AI-sounding each model's everyday writing is, by tells.
 *
 *   node --experimental-strip-types bench/models/rank.ts                 score every set, write bench/models/ranking.json and src/model-ranking.json
 *   node --experimental-strip-types bench/models/rank.ts add --provider openai --model gpt-7 [--label "GPT-7"]
 *                                                                        answer the 108 prompts with a new model, then rank (the one command for a new release)
 *   node --experimental-strip-types bench/models/rank.ts --src old/src --partial --json f   score with another copy of src/ (before and after a retrain), stopped runs included, nothing written but f
 *
 * Answers come from bench/models/out/*.json (OpenAI, Gemini, new releases) and bench/everyday/out/*.json
 * (Claude Haiku, Sonnet, Opus, through Claude Code's print mode). Every set answers the same 108 prompts
 * (bench/everyday/prompts.json) with the system prompt "You are a helpful assistant.".
 *
 * Per model: share of answers with at least one warning or error, warnings and errors per 100 words,
 * mean human-pattern score (answers of 60+ words), share the score calls machine-like (under the low line),
 * each with a 95% bootstrap interval (2,000 resamples of answers, fixed seed). Scoring never calls a model.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from './generate.ts';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const srcDir = resolve(arg('src', join(here, '..', '..', 'src'))!);
const { lint } = (await import(join(srcDir, 'lint.ts'))) as typeof import('../../src/lint.ts');
const RULE_NAMES = new Map<string, string>(((await import(join(srcDir, 'rules.ts'))) as typeof import('../../src/rules.ts')).RULES.map((r: { id: string; name: string }) => [r.id, r.name]));

/** Display names and providers. A set with no entry here shows its model id. */
export const LABELS: Record<string, { label: string; provider: string }> = {
  'claude-cli:haiku': { label: 'Claude Haiku 5.5', provider: 'Anthropic' },
  'claude-cli:sonnet': { label: 'Claude Sonnet 5.5', provider: 'Anthropic' },
  'claude-cli:opus': { label: 'Claude Opus 5.5', provider: 'Anthropic' },
  'gpt-6.2-astra': { label: 'GPT-6.2 Astra', provider: 'OpenAI' },
  'gpt-6.2-sol': { label: 'GPT-6.2 Sol', provider: 'OpenAI' },
  'gpt-6.1-terra': { label: 'GPT-6.1 Terra', provider: 'OpenAI' },
  'gpt-6-luna': { label: 'GPT-6 Luna', provider: 'OpenAI' },
  'gemini-4-hydrogen': { label: 'Gemini 4 Hydrogen', provider: 'Google' },
  'gemini-3.8-flash': { label: 'Gemini 3.8 Flash', provider: 'Google' },
  'Gemini app (gemini.google.com)': { label: 'Gemini (app)', provider: 'Google' },
};
const PROVIDER: Record<string, string> = { openai: 'OpenAI', gemini: 'Google', claude: 'Anthropic' };

const CLAUDE_WRITTEN = ['reassurance-frame', 'listicle-intro', 'ordinal-sequence', 'upbeat-close'];

interface Item { id: string; variant: string; genre: string; text: string }
interface Set { name: string; model: string; provider?: string; label?: string; costUsd?: number; items: Item[] }

export function loadSets(): Set[] {
  const sets: Set[] = [];
  // --partial adds bench/models/partial: short runs that were stopped (not ranked, used as extra unseen answers when checking a retrain).
  for (const dir of [join(here, '..', 'everyday', 'out'), join(here, 'out'), ...(process.argv.includes('--partial') ? [join(here, 'partial')] : [])]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      const s = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Set;
      if (dir.endsWith('partial')) s.label = `${LABELS[s.model]?.label ?? s.model} (partial, ${s.items.length})`;
      sets.push(s);
    }
  }
  return sets;
}

/** Mulberry32: a small seeded generator, so the intervals are the same on every run. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Point estimate and 95% percentile interval of stat over xs. */
function boot<T>(xs: T[], stat: (s: T[]) => number, n = 2000, seed = 7): { v: number; lo: number; hi: number } {
  if (!xs.length) return { v: NaN, lo: NaN, hi: NaN };
  const r = rng(seed), vals: number[] = [];
  for (let b = 0; b < n; b++) {
    const s = Array.from({ length: xs.length }, () => xs[Math.floor(r() * xs.length)]);
    vals.push(stat(s));
  }
  vals.sort((a, b) => a - b);
  return { v: stat(xs), lo: vals[Math.floor(n * 0.025)], hi: vals[Math.floor(n * 0.975)] };
}
const r1 = (x: { v: number; lo: number; hi: number }, d = 1) => ({ v: +x.v.toFixed(d), lo: +x.lo.toFixed(d), hi: +x.hi.toFixed(d) });

interface Scored { id: string; variant: string; genre: string; words: number; strong: number; rules: string[]; hints: string[]; score: number | null; low: boolean; rawRules: string[] }

export function scoreText(it: Item): Scored {
  const out = lint(it.text);
  const strong = out.findings.filter((f) => f.severity !== 'info');
  // The rules alone, with no score in the gate and every rule at its own severity: does not depend on what the score was trained on.
  const raw = lint(it.text, { noScore: true, corroborate: 0 }).findings.filter((f) => f.severity !== 'info');
  return {
    id: it.id, variant: it.variant, genre: it.genre, words: out.words, strong: strong.length,
    rules: [...new Set(strong.map((f) => f.ruleId))],
    hints: [...new Set(out.findings.filter((f) => f.severity === 'info').map((f) => f.ruleId))],
    score: out.words >= 60 ? (out.human.pattern?.score ?? null) : null, low: !!out.human.pattern?.low,
    rawRules: [...new Set(raw.map((f) => f.ruleId))],
  };
}

function summarise(rows: Scored[]) {
  const judged = rows.filter((r) => r.score !== null);
  const share = (f: (r: Scored) => boolean) => (s: Scored[]) => (s.filter(f).length / Math.max(1, s.length)) * 100;
  return {
    n: rows.length,
    nScored: judged.length,
    withWarning: r1(boot(rows, share((r) => r.strong > 0))),
    per100: r1(boot(rows, (s) => (s.reduce((a, r) => a + r.strong, 0) / Math.max(1, s.reduce((a, r) => a + r.words, 0))) * 100), 2),
    score: r1(boot(judged, (s) => s.reduce((a, r) => a + r.score!, 0) / Math.max(1, s.length))),
    machineLike: r1(boot(judged, share((r) => r.low))),
    flagged: r1(boot(rows, share((r) => r.strong > 0 || r.low))),
    rulesOnly: r1(boot(rows, share((r) => r.rawRules.length > 0))),
    medianWords: rows.map((r) => r.words).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
  };
}

function topRules(rows: Scored[], key: 'rules' | 'rawRules', k = 6) {
  const hits = new Map<string, number>();
  for (const r of rows) for (const id of r[key]) hits.set(id, (hits.get(id) ?? 0) + 1);
  return [...hits.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, k).map(([id, c]) => ({ id, name: RULE_NAMES.get(id) ?? id, share: +((c / rows.length) * 100).toFixed(0) }));
}

export function rank() {
  const scoreModel = JSON.parse(readFileSync(join(srcDir, 'score-model.json'), 'utf8')) as { builtAt: string; low: number };
  const version = (JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8')) as { version: string }).version;
  const models = [];
  for (const set of loadSets()) {
    const lab = set.label ? { label: set.label, provider: LABELS[set.model]?.provider ?? PROVIDER[set.provider ?? ''] ?? '' } : LABELS[set.model] ?? { label: set.model, provider: PROVIDER[set.provider ?? ''] ?? set.provider ?? '' };
    const rows = set.items.map(scoreText);
    models.push({
      name: set.name, model: set.model, ...lab, costUsd: set.costUsd ?? null,
      all: summarise(rows),
      heldOut: summarise(rows.filter((r) => r.variant === 'test')),
      byGenre: Object.fromEntries([...new Set(rows.map((r) => r.genre))].map((g) => [g, +((rows.filter((r) => r.genre === g && (r.strong > 0)).length / rows.filter((r) => r.genre === g).length) * 100).toFixed(0)])),
      top: topRules(rows, 'rules'),
      topRaw: topRules(rows, 'rawRules', 10),
      // Share of answers with a warning from one of the four rules written in 0.3.3 by reading Claude's dev-half everyday answers.
      claudeWritten: +((rows.filter((r) => r.rules.some((id) => CLAUDE_WRITTEN.includes(id))).length / Math.max(1, rows.length)) * 100).toFixed(1),
      plainVsProse: { plain: summarise(rows.filter((r) => r.id.endsWith('#plain'))).withWarning.v, prose: summarise(rows.filter((r) => r.id.endsWith('#prose'))).withWarning.v },
    });
  }
  models.sort((a, b) => b.all.per100.v - a.all.per100.v);
  const out = { date: new Date().toISOString().slice(0, 10), tellsVersion: version, scoreModel: scoreModel.builtAt, lowLine: scoreModel.low, prompts: 108, system: 'You are a helpful assistant.', models };
  return out;
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
function print(r: ReturnType<typeof rank>) {
  console.log(`tells ${r.tellsVersion}, score model ${r.scoreModel}, low line ${r.lowLine}`);
  for (const view of ['all', 'heldOut'] as const) {
    console.log(`\n${view === 'all' ? 'All 108 answers' : 'Held-out prompts (the test half of bench/everyday: 62 of 108, never trained on)'}`);
    console.log(`${'model'.padEnd(20)}    n  warning% [95% CI]     per100 [CI]          score [CI]         machine% [CI]     flagged%  rules-only%`);
    for (const m of r.models) {
      const s = m[view];
      const ci = (x: { v: number; lo: number; hi: number }) => `${pad(x.v, 5)} [${x.lo}-${x.hi}]`.padEnd(20);
      console.log(`${m.label.padEnd(20)} ${pad(s.n, 4)}  ${ci(s.withWarning)} ${ci(s.per100)} ${ci(s.score)} ${ci(s.machineLike)} ${pad(s.flagged.v, 6)}  ${pad(s.rulesOnly.v, 6)}`);
    }
  }
  console.log('\nMost common warnings (share of answers):');
  for (const m of r.models) console.log(`${m.label.padEnd(20)} ${m.top.map((t) => `${t.id} ${t.share}%`).join(', ')}`);
  console.log('\nRules alone, no gate (share of answers):');
  for (const m of r.models) console.log(`${m.label.padEnd(20)} ${m.topRaw.map((t) => `${t.id} ${t.share}%`).join(', ')}`);
  console.log('\nWith a warning from a rule written from Claude answers (reassurance-frame, listicle-intro, ordinal-sequence, upbeat-close):');
  for (const m of r.models) console.log(`${m.label.padEnd(20)} ${m.claudeWritten}%`);
  console.log('\nWith a warning, plain ask vs plain-paragraphs ask:');
  for (const m of r.models) console.log(`${m.label.padEnd(20)} plain ${m.plainVsProse.plain}%  prose ${m.plainVsProse.prose}%  median words ${m.all.medianWords}  by genre ${JSON.stringify(m.byGenre)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'add') {
    const price = arg('price')?.split(',').map(Number) as [number, number] | undefined;
    await generate({ provider: arg('provider', 'openai')!, model: arg('model')!, gap: Number(arg('gap', '0')), maxUsd: Number(arg('max-usd', '5')), price });
  }
  const r = rank();
  print(r);
  if (arg('json')) writeFileSync(arg('json')!, JSON.stringify(r, null, 1) + '\n');
  if (!arg('src') && !process.argv.includes('--dry') && !process.argv.includes('--partial')) {
    writeFileSync(join(here, 'ranking.json'), JSON.stringify(r, null, 1) + '\n');
    // The site's copy: only what the /models page shows.
    const site = { date: r.date, tellsVersion: r.tellsVersion, models: r.models.map((m) => ({ label: m.label, provider: m.provider, n: m.all.n, withWarning: m.all.withWarning, per100: m.all.per100, score: m.all.score, machineLike: m.all.machineLike, nScored: m.all.nScored, top: m.top.slice(0, 5) })) };
    writeFileSync(join(here, '..', '..', 'src', 'model-ranking.json'), JSON.stringify(site, null, 1) + '\n');
    console.log('\nwrote bench/models/ranking.json and src/model-ranking.json');
  }
}
