/**
 * Slop score benchmark.
 *
 *   node --experimental-strip-types bench/run.ts generate --via claude-cli --model haiku
 *   node --experimental-strip-types bench/run.ts generate --via anthropic --model claude-haiku-5-5
 *   node --experimental-strip-types bench/run.ts rewrite --source <name> --via claude-cli --model haiku
 *   node --experimental-strip-types bench/run.ts score
 *
 * `generate` writes bench/out/<name>.json with one answer per prompt. `rewrite` runs the
 * tells rewrite over an existing output set and writes <name>+tells.json. `score` lints
 * every output set plus the human exemplars and writes bench/results.json and
 * bench/RESULTS.md. Scoring is free: it never calls a model.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint } from '../src/lint.ts';
import { rewrite } from '../src/rewrite.ts';
import { EXEMPLARS } from '../src/exemplars.ts';
import { anthropic, fromFunction, type Model } from '../src/model.ts';
import type { Register } from '../src/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'out');

interface Prompt { id: string; register: Register; prompt: string }
interface OutputSet { name: string; via: string; model: string; createdAt: string; costUsd: number; items: { id: string; register: Register; text: string }[] }

const SYSTEM = 'You are a helpful assistant. Write exactly what is asked. Output only the requested text, with no preamble.';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i > 0 ? process.argv[i + 1] : undefined;
  if (v === undefined && fallback === undefined) throw new Error(`missing --${name}`);
  return v ?? fallback!;
}

/**
 * Claude Code's print mode as a model. Useful for testing an agent product as people use
 * it, and for running the bench without an API key.
 */
function claudeCli(model: string): Model {
  const cwd = mkdtempSync(join(tmpdir(), 'tells-bench-'));
  return fromFunction(`claude-cli:${model}`, (req) =>
    new Promise((resolve, reject) => {
      execFile(
        'claude',
        ['-p', '--model', model, '--output-format', 'json', '--no-session-persistence', '--system-prompt', req.system, req.prompt],
        { cwd, timeout: 180_000, maxBuffer: 4 << 20 },
        (err, stdout) => {
          if (err) return reject(err);
          try {
            const j = JSON.parse(stdout) as { result: string; total_cost_usd?: number; usage?: { input_tokens: number; output_tokens: number } };
            resolve({ text: j.result, costUsd: j.total_cost_usd, usage: j.usage ? { inputTokens: j.usage.input_tokens, outputTokens: j.usage.output_tokens } : undefined });
          } catch (e) {
            reject(e);
          }
        },
      );
    }),
  );
}

function pickModel(): Model {
  const via = arg('via', 'anthropic');
  const model = arg('model', 'claude-haiku-5-5');
  if (via === 'claude-cli') return claudeCli(model);
  if (via === 'anthropic') return anthropic({ model });
  throw new Error(`unknown --via ${via}`);
}

async function generate() {
  const { prompts } = JSON.parse(readFileSync(join(here, 'prompts.json'), 'utf8')) as { prompts: Prompt[] };
  const model = pickModel();
  const name = arg('name', model.name.replace(/[^a-z0-9.-]+/gi, '_'));
  const set: OutputSet = { name, via: arg('via', 'anthropic'), model: model.name, createdAt: new Date().toISOString(), costUsd: 0, items: [] };
  for (const p of prompts) {
    const res = await model.complete({ system: SYSTEM, prompt: p.prompt, maxTokens: 1200 });
    set.items.push({ id: p.id, register: p.register, text: res.text.trim() });
    set.costUsd += res.costUsd ?? 0;
    process.stderr.write(`${p.id} done\n`);
  }
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(set, null, 2));
  console.log(`wrote out/${name}.json, about $${set.costUsd.toFixed(4)}`);
}

async function rewriteSet() {
  const source = arg('source');
  const set = JSON.parse(readFileSync(join(OUT, `${source}.json`), 'utf8')) as OutputSet;
  const model = pickModel();
  const out: OutputSet = { ...set, name: `${source}+tells`, model: `${set.model} rewritten by ${model.name}`, createdAt: new Date().toISOString(), costUsd: 0, items: [] };
  for (const item of set.items) {
    const res = await rewrite(item.text, { register: item.register, model });
    out.items.push({ ...item, text: res.text });
    out.costUsd += res.costUsd;
    process.stderr.write(`${item.id}: ${res.before.score} -> ${res.after.score}\n`);
  }
  writeFileSync(join(OUT, `${out.name}.json`), JSON.stringify(out, null, 2));
  console.log(`wrote out/${out.name}.json, about $${out.costUsd.toFixed(4)}`);
}

function summarize(name: string, items: { register: Register; text: string }[]) {
  const results = items.map((i) => lint(i.text, { register: i.register }));
  const words = results.reduce((a, r) => a + r.words, 0);
  const rules = new Map<string, number>();
  for (const r of results) for (const f of r.findings) rules.set(f.ruleId, (rules.get(f.ruleId) ?? 0) + 1);
  const scores = results.map((r) => r.score).sort((a, b) => a - b);
  const mean = scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1);
  return {
    name,
    samples: items.length,
    words,
    meanScore: Math.round(mean * 10) / 10,
    medianScore: scores[Math.floor(scores.length / 2)] ?? 0,
    withErrors: results.filter((r) => r.counts.error > 0).length,
    clean: results.filter((r) => r.score === 0).length,
    topRules: [...rules.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => `${id} (${n})`),
  };
}

function score() {
  const rows = [summarize('human exemplars', EXEMPLARS.filter((e) => e.human))];
  for (const f of readdirSync(OUT).filter((f) => f.endsWith('.json')).sort()) {
    const set = JSON.parse(readFileSync(join(OUT, f), 'utf8')) as OutputSet;
    rows.push({ ...summarize(set.name, set.items), name: `${set.name} (${set.model})` });
  }
  writeFileSync(join(here, 'results.json'), JSON.stringify({ scoredAt: new Date().toISOString(), rows }, null, 2));
  const md = [
    '| Source | Samples | Mean score | Median | With errors | Clean | Most common tells |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...rows.map((r) => `| ${r.name} | ${r.samples} | ${r.meanScore} | ${r.medianScore} | ${r.withErrors} | ${r.clean} | ${r.topRules.join(', ') || 'none'} |`),
  ].join('\n');
  writeFileSync(join(here, 'RESULTS.md'), `# Results\n\nGenerated by \`bench/run.ts score\`. Lower is better. The score is weighted tells per 100 words.\n\n${md}\n`);
  console.log(md);
}

const cmd = process.argv[2];
const run = { generate, rewrite: rewriteSet, score } as Record<string, () => unknown>;
if (!run[cmd]) {
  console.error('usage: bench/run.ts generate|rewrite|score [--via anthropic|claude-cli] [--model id] [--source name] [--name name]');
  process.exit(2);
}
await run[cmd]();
