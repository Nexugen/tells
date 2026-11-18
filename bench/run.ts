/**
 * Benchmark: known tells, human signals and text shape, model output next to human writing.
 *
 *   node --experimental-strip-types bench/run.ts generate --via claude-cli --model haiku
 *   node --experimental-strip-types bench/run.ts rewrite --source <name> --via claude-cli --model haiku
 *   node --experimental-strip-types bench/run.ts profiles     writes src/profiles.json
 *   node --experimental-strip-types bench/run.ts score        writes results.json and RESULTS.md
 *
 * Scoring never calls a model. Output sets live in bench/out, human samples in bench/human.json.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint } from '../src/lint.ts';
import { rewrite } from '../src/rewrite.ts';
import { SIGNALS, detectSignals, signalContext } from '../src/human.ts';
import { sharedTemplates, textSignals } from '../src/signals.ts';
import { anthropic, claudeCli, type Model } from '../src/model.ts';
import { sentences, mask } from '../src/text.ts';
import { REGISTERS, type Register } from '../src/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'out');

interface Prompt { id: string; register: Register; prompt: string }
interface Item { id: string; register: Register; text: string }
interface OutputSet { name: string; via: string; model: string; createdAt: string; costUsd: number; items: Item[] }

const SYSTEM = 'You are a helpful assistant. Write exactly what is asked. Output only the requested text, with no preamble.';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i > 0 ? process.argv[i + 1] : undefined;
  if (v === undefined && fallback === undefined) throw new Error(`missing --${name}`);
  return v ?? fallback!;
}

function pickModel(): Model {
  const via = arg('via', 'anthropic');
  const model = arg('model', via === 'claude-cli' ? 'haiku' : 'claude-haiku-5-5');
  if (via === 'claude-cli') return claudeCli({ model, configDir: process.env.TELLS_CLI_CONFIG_DIR });
  if (via === 'anthropic') return anthropic({ model });
  throw new Error(`unknown --via ${via}`);
}

const loadHuman = () => (JSON.parse(readFileSync(join(here, 'human.json'), 'utf8')) as { samples: Item[] }).samples;
const loadSets = (withRewrites: boolean) =>
  readdirSync(OUT)
    .filter((f) => f.endsWith('.json') && (withRewrites || !f.includes('+tells')))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(OUT, f), 'utf8')) as OutputSet);

async function generate() {
  const { prompts } = JSON.parse(readFileSync(join(here, 'prompts.json'), 'utf8')) as { prompts: Prompt[] };
  const model = pickModel();
  const name = arg('name', model.name.replace(/[^a-z0-9.-]+/gi, '_'));
  // Adds answers for prompts the set doesn't have yet, so new prompts don't mean paying for the old ones again.
  const file = join(OUT, `${name}.json`);
  const set: OutputSet = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as OutputSet)
    : { name, via: arg('via', 'anthropic'), model: model.name, createdAt: new Date().toISOString(), costUsd: 0, items: [] };
  const done = new Set(set.items.map((i) => i.id));
  for (const p of prompts) {
    if (done.has(p.id)) continue;
    const res = await model.complete({ system: SYSTEM, prompt: p.prompt, maxTokens: 1200 });
    set.items.push({ id: p.id, register: p.register, text: res.text.trim() });
    set.costUsd += res.costUsd ?? 0;
  }
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(set, null, 2));
  console.log(`wrote out/${name}.json, about $${set.costUsd.toFixed(4)}`);
}

async function rewriteSet() {
  const source = arg('source');
  const set = JSON.parse(readFileSync(join(OUT, `${source}.json`), 'utf8')) as OutputSet;
  const model = pickModel();
  const out: OutputSet = { ...set, name: `${source}+tells`, model: `${set.model}, rewritten by ${model.name}`, createdAt: new Date().toISOString(), costUsd: 0, items: [] };
  for (const item of set.items) {
    const res = await rewrite(item.text, { register: item.register, model });
    out.items.push({ ...item, text: res.text });
    out.costUsd += res.costUsd;
  }
  writeFileSync(join(OUT, `${out.name}.json`), JSON.stringify(out, null, 2));
  console.log(`wrote out/${out.name}.json, about $${out.costUsd.toFixed(4)}`);
}

// --- features ---------------------------------------------------------------------------

/** Compare like with like: score the first ~150 words of every sample, cut at a sentence end. */
function clip(text: string, words = 150): string {
  const ss = sentences(mask(text));
  let n = 0;
  let end = text.length;
  for (const s of ss) {
    n += s.words;
    if (n >= words) {
      end = s.end;
      break;
    }
  }
  return text.slice(0, end);
}

const SHAPE_KEYS = ['sentenceCv', 'shortShare', 'specificity', 'repeatedOpeners', 'paragraphCv', 'oneSentenceParagraphs'] as const;

function features(item: Item): { names: string[]; values: number[] } {
  const text = clip(item.text);
  const l = lint(text, { register: item.register });
  const ctx = signalContext(text, item.register);
  const present = new Map(detectSignals(ctx).map((p) => [p.id, p.count]));
  const words = Math.max(l.words, 1);
  const shape = textSignals(text);
  const names = ['tells', ...SIGNALS.map((s) => `has:${s.id}`), ...SIGNALS.map((s) => `rate:${s.id}`), ...SHAPE_KEYS];
  const values = [
    l.score,
    ...SIGNALS.map((s) => (present.has(s.id) ? 1 : 0)),
    ...SIGNALS.map((s) => ((present.get(s.id) ?? 0) / words) * 100),
    ...SHAPE_KEYS.map((k) => shape[k]),
  ];
  return { names, values };
}

// --- a small logistic regression, so the separation claim can be checked on held-out data ---

function train(X: number[][], y: number[], epochs = 3000, lr = 0.1, l2 = 0.01) {
  const d = X[0].length;
  const mu = Array.from({ length: d }, (_, j) => X.reduce((a, x) => a + x[j], 0) / X.length);
  const sd = Array.from({ length: d }, (_, j) => Math.sqrt(X.reduce((a, x) => a + (x[j] - mu[j]) ** 2, 0) / X.length) || 1);
  const Z = X.map((x) => x.map((v, j) => (v - mu[j]) / sd[j]));
  const w = new Array(d).fill(0);
  let b = 0;
  // Balance the classes so the larger set does not decide the boundary.
  const pos = y.filter((v) => v === 1).length;
  const cw = y.map((v) => (v === 1 ? y.length / (2 * pos) : y.length / (2 * (y.length - pos))));
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    Z.forEach((z, i) => {
      const p = 1 / (1 + Math.exp(-(z.reduce((a, v, j) => a + v * w[j], b))));
      const g = (p - y[i]) * cw[i];
      for (let j = 0; j < d; j++) gw[j] += g * z[j];
      gb += g;
    });
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / Z.length + l2 * w[j]);
    b -= (lr * gb) / Z.length;
  }
  return (x: number[]) => 1 / (1 + Math.exp(-(x.reduce((a, v, j) => a + ((v - mu[j]) / sd[j]) * w[j], b))));
}

function auc(scores: number[], y: number[]): number {
  let pairs = 0;
  let wins = 0;
  scores.forEach((s, i) => {
    if (y[i] !== 1) return;
    scores.forEach((t, k) => {
      if (y[k] !== 0) return;
      pairs++;
      wins += s > t ? 1 : s === t ? 0.5 : 0;
    });
  });
  return pairs ? wins / pairs : 0;
}

/** Deterministic split. Model outputs split by prompt, so a prompt's answers never sit on both sides. */
const heldOut = (key: string) => parseInt(createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % 10 < 3;

function separation() {
  const human = loadHuman();
  const sets = loadSets(false);
  const rows: { item: Item; y: number; test: boolean; source: string }[] = [
    ...human.map((item) => ({ item, y: 1, test: heldOut(`h:${item.id}`), source: 'human' })),
    ...sets.flatMap((s) => s.items.map((item) => ({ item, y: 0, test: heldOut(`p:${item.id}`), source: s.name }))),
  ];
  const feats = rows.map((r) => features(r.item).values);
  const tr = rows.map((r, i) => i).filter((i) => !rows[i].test);
  const te = rows.map((r, i) => i).filter((i) => rows[i].test);
  const predict = train(tr.map((i) => feats[i]), tr.map((i) => rows[i].y));
  const p = te.map((i) => predict(feats[i]));
  const y = te.map((i) => rows[i].y);
  const correct = p.filter((v, k) => (v >= 0.5 ? 1 : 0) === y[k]).length;
  const tellsOnly = auc(te.map((i) => -feats[i][0]), y);

  // Before and after rewrite, on held-out prompts only.
  const rewrites = loadSets(true).filter((s) => s.name.includes('+tells'));
  const shift = rewrites.map((s) => {
    const base = sets.find((b) => `${b.name}+tells` === s.name);
    const ids = new Set(s.items.filter((it) => heldOut(`p:${it.id}`)).map((it) => it.id));
    const mean = (items: Item[]) => {
      const xs = items.filter((it) => ids.has(it.id)).map((it) => predict(features(it).values));
      return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    };
    const tells = (items: Item[]) => {
      const xs = items.filter((it) => ids.has(it.id)).map((it) => lint(it.text, { register: it.register }).score);
      return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    };
    return { set: s.name, prompts: ids.size, humanLikeBefore: base ? r2(mean(base.items)) : null, humanLikeAfter: r2(mean(s.items)), tellsBefore: base ? r1(tells(base.items)) : null, tellsAfter: r1(tells(s.items)) };
  });

  return {
    train: { human: tr.filter((i) => rows[i].y === 1).length, model: tr.filter((i) => rows[i].y === 0).length },
    test: { human: te.filter((i) => rows[i].y === 1).length, model: te.filter((i) => rows[i].y === 0).length },
    auc: r2(auc(p, y)),
    accuracy: r2(correct / Math.max(1, te.length)),
    tellsOnlyAuc: r2(tellsOnly),
    rewriteShift: shift,
  };
}

// --- profiles ---------------------------------------------------------------------------

function shares(items: Item[]) {
  const out: Record<string, Record<string, number>> = {};
  for (const reg of REGISTERS) {
    const xs = items.filter((i) => i.register === reg);
    out[reg] = {};
    for (const sig of SIGNALS) {
      const n = xs.filter((i) => detectSignals(signalContext(clip(i.text), reg)).some((p) => p.id === sig.id)).length;
      out[reg][sig.id] = xs.length ? r2(n / xs.length) : 0;
    }
  }
  return out;
}

function profiles() {
  // Training split only, so the held-out samples in the score stay unseen.
  const human = loadHuman().filter((i) => !heldOut(`h:${i.id}`));
  const model = loadSets(false).flatMap((s) => s.items).filter((i) => !heldOut(`p:${i.id}`));
  const h = shares(human);
  const m = shares(model);
  const count = (items: Item[]) => Object.fromEntries(REGISTERS.map((r) => [r, items.filter((i) => i.register === r).length]));
  const registers: Record<string, Record<string, { human: number; model: number }>> = {};
  for (const reg of REGISTERS) {
    registers[reg] = {};
    for (const sig of SIGNALS) registers[reg][sig.id] = { human: h[reg][sig.id], model: m[reg][sig.id] };
  }
  const profile = { version: 1, builtAt: new Date().toISOString().slice(0, 10), samples: { human: count(human), model: count(model) }, registers };
  writeFileSync(join(here, '..', 'src', 'profiles.json'), JSON.stringify(profile, null, 1) + '\n');
  console.log(JSON.stringify(profile.samples));
}

// --- score ------------------------------------------------------------------------------

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function summarize(name: string, items: Item[]) {
  const clipped = items.map((i) => ({ ...i, text: clip(i.text) }));
  const lints = clipped.map((i) => lint(i.text, { register: i.register }));
  const sig = clipped.map((i) => textSignals(i.text));
  const present = clipped.map((i) => new Set(detectSignals(signalContext(i.text, i.register)).map((p) => p.id)));
  const rules = new Map<string, number>();
  for (const r of lints) for (const f of r.findings) rules.set(f.ruleId, (rules.get(f.ruleId) ?? 0) + 1);
  const byRegister: Record<string, number> = {};
  for (const reg of REGISTERS) byRegister[reg] = r1(mean(lints.filter((_, i) => items[i].register === reg).map((l) => l.score)));
  return {
    name,
    samples: items.length,
    knownTellsPer100: r1(mean(lints.map((l) => l.score))),
    byRegister,
    withErrors: lints.filter((r) => r.counts.error > 0).length,
    noTells: lints.filter((r) => r.score === 0).length,
    topRules: [...rules.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => `${id} (${n})`),
    signals: Object.fromEntries(SIGNALS.map((s) => [s.id, r2(present.filter((p) => p.has(s.id)).length / Math.max(1, items.length))])),
    shape: {
      sentenceMean: r1(mean(sig.map((s) => s.sentenceMean))),
      sentenceCv: r2(mean(sig.map((s) => s.sentenceCv))),
      specificity: r1(mean(sig.map((s) => s.specificity))),
      repeatedOpeners: r2(mean(sig.map((s) => s.repeatedOpeners))),
      paragraphCv: r2(mean(sig.map((s) => s.paragraphCv))),
      ...sharedTemplates(items.map((i) => i.text)),
    },
  };
}

function score() {
  const rows = [summarize('Human writing', loadHuman()), ...loadSets(true).map((s) => summarize(`${s.name} (${s.model})`, s.items))];
  const sep = separation();
  writeFileSync(join(here, 'results.json'), JSON.stringify({ scoredAt: new Date().toISOString(), rows, separation: sep }, null, 2));

  const tells = [
    '| Source | Samples | Known tells per 100 words | Casual | Professional | Technical | Marketing | With an error | No known tells | Most common |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...rows.map((r) => `| ${r.name} | ${r.samples} | ${r.knownTellsPer100} | ${r.byRegister.casual} | ${r.byRegister.professional} | ${r.byRegister.technical} | ${r.byRegister.marketing} | ${r.withErrors} | ${r.noTells} | ${r.topRules.join(', ') || 'none'} |`),
  ].join('\n');
  const signals = [
    `| Source | ${SIGNALS.map((s) => s.name).join(' | ')} |`,
    `| --- | ${SIGNALS.map(() => '---:').join(' | ')} |`,
    ...rows.map((r) => `| ${r.name} | ${SIGNALS.map((s) => Math.round(r.signals[s.id] * 100) + '%').join(' | ')} |`),
  ].join('\n');
  const shape = [
    '| Source | Words per sentence | Sentence length variation | Specifics per 100 words | Repeated openers | Paragraph variation | Shared openings | Shared closings |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map((r) => `| ${r.name} | ${r.shape.sentenceMean} | ${r.shape.sentenceCv} | ${r.shape.specificity} | ${r.shape.repeatedOpeners} | ${r.shape.paragraphCv} | ${r.shape.openings} | ${r.shape.closings} |`),
  ].join('\n');
  const shift = [
    '| Rewritten set | Held-out prompts | Known tells before | After | Human-pattern probability before | After |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...sep.rewriteShift.map((s) => `| ${s.set} | ${s.prompts} | ${s.tellsBefore} | ${s.tellsAfter} | ${s.humanLikeBefore} | ${s.humanLikeAfter} |`),
  ].join('\n');

  const md = `# Results

Generated by \`node --experimental-strip-types bench/run.ts score\`. Raw numbers are in \`results.json\`. Every sample is cut to its first 150 words or so (at a sentence end) before scoring, so long human posts and short model replies are compared on the same footing.

Read these with care:

- **Known tells per 100 words** counts hits on the rules and nothing else. A text can have no known tells and still read as generated, and people trip the rules too: the Go blog uses em dashes, and Rust release posts open with "The Rust team is happy to announce". It is not a measure of how human a text sounds.
- The human set (\`human.json\`, ${rows[0].samples} samples) is published writing from before 2021: Stack Exchange answers and comments, the Go and Rust blogs, and GOV.UK guidance and press releases. It has no private messages or emails, so it is not a sample of how everyone writes. False-positive rates per rule are in \`EVAL.md\`.
- The model set is the ${JSON.parse(readFileSync(join(here, 'prompts.json'), 'utf8')).prompts.length} everyday jobs in \`prompts.json\`, six per register, answered by each model through Claude Code's print mode with a plain system prompt.
- Both sets are small. Differences of a few points are noise.

## Can the patterns tell people from models?

A logistic regression on the features below (known tells, which human signals are present and how often, and the shape measures), trained on ${sep.train.human} human and ${sep.train.model} model samples and tested on ${sep.test.human} human and ${sep.test.model} model samples it never saw. Model answers are split by prompt, so no prompt appears on both sides.

- Held-out AUC: **${sep.auc}** (1.0 separates perfectly, 0.5 is a coin flip). Accuracy at the midpoint: ${sep.accuracy}.
- Known tells alone: AUC ${sep.tellsOnlyAuc}. Adding the human signals and the shape measures takes it to ${sep.auc}.

This shows the two sets differ in measurable ways. It does not make the analyzer a detector: the human set is a narrow kind of writing, and a model told to write like these samples would close much of the gap.

## Before and after rewrite

Held-out prompts only. The human-pattern probability is the classifier's output above, averaged. Rewrites ran with the defaults: warnings and errors fixed, info-level hints (such as \`bold-overuse\`) left alone, and up to two flat sentences per text reworked toward missing signals.

${shift}

The rewrite cuts known tells by about a third for the Sonnet and Opus sets and by three quarters for Haiku. Much of what is left is info-level bold and emoji, which the defaults leave alone. It moves the human-pattern probability much less, and that is expected: the signals that separate people from models most here (asides, first-hand detail, an opinion with a stake) need facts the draft doesn't have, and the rewrite is not allowed to invent them. Where one would help, it leaves a bracketed placeholder for the writer, and a placeholder counts as a tell (\`unfilled-placeholder\`) until someone fills it in.

## Known tells

${tells}

## Human signals

Share of samples where each signal appears at least once.

${signals}

## Shape

Measurements, not grades.

${shape}

- **Sentence length variation:** standard deviation of sentence length divided by the mean.
- **Specifics per 100 words:** numbers, names inside a sentence, code spans and units.
- **Repeated openers:** share of sentences whose first two words also open another sentence in the same sample.
- **Paragraph variation:** like sentence variation, across paragraphs.
- **Shared openings and closings:** share of samples in a set that start or end with the same three words as another sample in that set. High values point to templates.
`;
  writeFileSync(join(here, 'RESULTS.md'), md);
  console.log(md);
}

const cmd = process.argv[2];
const run = { generate, rewrite: rewriteSet, score, profiles } as Record<string, () => unknown>;
if (!run[cmd]) {
  console.error('usage: bench/run.ts generate|rewrite|profiles|score [--via anthropic|claude-cli] [--model id] [--source name] [--name name]');
  process.exit(2);
}
await run[cmd]();
