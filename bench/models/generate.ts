/**
 * Answers from one model to the 108 everyday requests in bench/everyday/prompts.json, with the
 * same plain system prompt the Claude answers had ("You are a helpful assistant."), default
 * temperature, one answer per prompt. Resumable: prompts already answered are skipped.
 *
 *   OPENAI_API_KEY=... node --experimental-strip-types bench/models/generate.ts --provider openai --model gpt-6.2-sol
 *   GEMINI_API_KEY=... node --experimental-strip-types bench/models/generate.ts --provider gemini --model gemini-4-hydrogen --gap 13
 *   node --experimental-strip-types bench/models/generate.ts --provider claude --model haiku   (Claude Code's print mode)
 *
 * Writes bench/models/out/<provider>-<model>.json. Prices for the spend estimate are dollars per
 * million tokens, given with --price in,out (or taken from PRICES below). --max-usd stops the run.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeCli } from '../../src/model.ts';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
export const SYSTEM = 'You are a helpful assistant.';

/** Published list prices, dollars per million tokens (input, output), as of Nov 2026. */
export const PRICES: Record<string, [number, number]> = {
  'gpt-6.2-astra': [8, 40],
  'gpt-6.2-sol': [2, 10],
  'gpt-6.1-terra': [1, 5],
  'gpt-6-luna': [0.1, 0.5],
};

interface P { id: string; family: string; genre: string; register: string; variant: string; adversarial: boolean; prompt: string }
export interface Item extends Omit<P, 'prompt'> { text: string; usage?: { input: number; output: number; reasoning?: number }; /** The answer hit the token cap and stops mid-way. */ cut?: boolean }
export interface ModelSet { name: string; provider: string; model: string; modelVersion?: string; system: string; settings?: Record<string, unknown>; createdAt: string; costUsd: number; items: Item[] }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** OpenAI request settings, from the command line: --max-tokens N (default 600) and --effort low|medium|high (default low). */
const OPENAI = { maxTokens: Number(arg('max-tokens', '600')), effort: arg('effort', 'low') };

async function openai(model: string, prompt: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_completion_tokens: OPENAI.maxTokens, ...(OPENAI.effort ? { reasoning_effort: OPENAI.effort } : {}), messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] }),
  });
  const j = (await res.json()) as { error?: { message?: string; code?: string }; model?: string; usage?: { prompt_tokens: number; completion_tokens: number; completion_tokens_details?: { reasoning_tokens?: number } }; choices?: { message: { content: string }; finish_reason: string }[] };
  if (!res.ok) throw Object.assign(new Error(`openai ${res.status}: ${j.error?.code ?? ''} ${j.error?.message?.slice(0, 200) ?? ''}`), { status: res.status, fatal: j.error?.code === 'insufficient_quota' });
  const c = j.choices?.[0];
  // An answer that spent the whole cap on reasoning comes back empty but is still billed.
  if (!c?.message?.content) throw Object.assign(new Error(`openai: empty answer (${c?.finish_reason})`), { usage: { input: j.usage?.prompt_tokens ?? 0, output: j.usage?.completion_tokens ?? 0 } });
  return { text: c.message.content, version: j.model, cut: c.finish_reason === 'length', usage: { input: j.usage?.prompt_tokens ?? 0, output: j.usage?.completion_tokens ?? 0, reasoning: j.usage?.completion_tokens_details?.reasoning_tokens ?? 0 } };
}

async function gemini(model: string, prompt: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
  });
  const j = (await res.json()) as { error?: { message?: string; details?: { violations?: { quotaId?: string }[] }[] }; modelVersion?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }; candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[] };
  // A per-day quota (the free tier allows 20 requests a day per model) will not clear by waiting minutes, so the run stops.
  const perDay = (j.error?.details ?? []).some((d) => (d.violations ?? []).some((v) => /PerDay/.test(v.quotaId ?? '')));
  if (!res.ok) throw Object.assign(new Error(`gemini ${res.status}: ${perDay ? 'daily quota reached. ' : ''}${j.error?.message?.slice(0, 200) ?? ''}`), { status: res.status, fatal: perDay });
  const c = j.candidates?.[0];
  const text = (c?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('');
  if (!text.trim()) throw new Error(`gemini: empty answer (${c?.finishReason})`);
  const u = j.usageMetadata ?? {};
  return { text, version: j.modelVersion, usage: { input: u.promptTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), reasoning: u.thoughtsTokenCount ?? 0 } };
}

async function claude(model: string, prompt: string) {
  const m = claudeCli({ model, configDir: process.env.TELLS_CLI_CONFIG_DIR, timeoutMs: 180_000 });
  const r = await m.complete({ system: SYSTEM, prompt, maxTokens: 1500 });
  return { text: r.text, version: undefined, usage: { input: r.usage?.inputTokens ?? 0, output: r.usage?.outputTokens ?? 0 } };
}

export async function generate(opts: { provider: string; model: string; name?: string; gap?: number; maxUsd?: number; maxTotalUsd?: number; price?: [number, number]; limit?: number; maxPct?: number }) {
  const { provider, model } = opts;
  const call = provider === 'openai' ? openai : provider === 'gemini' ? gemini : provider === 'claude' ? claude : null;
  if (!call) throw new Error(`unknown provider ${provider}`);
  const prompts = (JSON.parse(readFileSync(join(here, '..', 'everyday', 'prompts.json'), 'utf8')) as { prompts: P[] }).prompts;
  const name = opts.name ?? (model.startsWith(provider) ? model : `${provider}-${model}`).replace(/[^a-z0-9.-]+/gi, '_');
  const dir = join(here, 'out');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  const set: ModelSet = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { name, provider, model, system: SYSTEM, ...(provider === 'openai' ? { settings: { max_completion_tokens: OPENAI.maxTokens, reasoning_effort: OPENAI.effort } } : {}), createdAt: new Date().toISOString(), costUsd: 0, items: [] };
  // Spend already on this provider in other sets (bench/models/out and partial/), for --max-total-usd.
  const otherSpend = ['out', 'partial'].flatMap((d) => (existsSync(join(here, d)) ? readdirSync(join(here, d)).filter((f) => f.endsWith('.json') && join(here, d, f) !== file).map((f) => JSON.parse(readFileSync(join(here, d, f), 'utf8')) as ModelSet) : [])).filter((s) => s.provider === provider).reduce((a, s) => a + (s.costUsd ?? 0), 0);
  const price = opts.price ?? PRICES[model];
  const save = () => writeFileSync(file, JSON.stringify(set, null, 1) + '\n');
  const done = new Set(set.items.map((i) => i.id));
  // Interleaved so that any prefix covers every genre, both ways of asking, and both halves of the split:
  // a run cut short by a quota still answers a balanced subset.
  const seen = new Map<string, number>();
  const order = prompts.map((p) => {
    const k = `${p.genre}:${p.id.endsWith('#prose') ? 1 : 0}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return { p, n };
  });
  order.sort((a, b) => a.n - b.n || prompts.indexOf(a.p) - prompts.indexOf(b.p));
  const todo = order.map((o) => o.p).filter((p) => !done.has(p.id)).slice(0, opts.limit ?? 1e9);
  const usageFile = process.env.TELLS_USAGE_FILE ?? '/var/nexugen/claude-subscription-usage.json';
  console.log(`${name}: ${set.items.length} done, ${todo.length} to do`);
  let backoff = 20_000;
  for (let i = 0; i < todo.length; i++) {
    const p = todo[i];
    if (opts.maxUsd !== undefined && set.costUsd >= opts.maxUsd) {
      console.log(`stopping: estimated spend $${set.costUsd.toFixed(3)} reached --max-usd`);
      break;
    }
    if (opts.maxTotalUsd !== undefined && otherSpend + set.costUsd >= opts.maxTotalUsd) {
      console.log(`stopping: estimated ${provider} spend across sets $${(otherSpend + set.costUsd).toFixed(3)} reached --max-total-usd`);
      break;
    }
    if (provider === 'claude') {
      let pct = 100;
      try { pct = Number(JSON.parse(readFileSync(usageFile, 'utf8')).claude?.pct); } catch { /* unreadable counts as full */ }
      if (!(pct < (opts.maxPct ?? 94))) { console.log(`stopping: Claude usage ${pct}%`); break; }
    }
    try {
      const r = await call(model, p.prompt);
      const { prompt: _drop, ...meta } = p;
      set.items.push({ ...meta, text: r.text.trim(), usage: r.usage, ...('cut' in r && r.cut ? { cut: true } : {}) });
      if (r.version) set.modelVersion = r.version;
      if (price) set.costUsd = Math.round((set.costUsd + (r.usage.input * price[0] + r.usage.output * price[1]) / 1e6) * 1e6) / 1e6;
      save();
      backoff = 20_000;
      if ((set.items.length) % 10 === 0) console.log(`${name}: ${set.items.length} answers, about $${set.costUsd.toFixed(3)}`);
    } catch (e) {
      const err = e as Error & { status?: number; fatal?: boolean; usage?: { input: number; output: number } };
      if (err.usage && price) {
        set.costUsd = Math.round((set.costUsd + (err.usage.input * price[0] + err.usage.output * price[1]) / 1e6) * 1e6) / 1e6;
        save();
      }
      if (err.fatal) {
        console.log(`stopping: ${err.message.slice(0, 160)}`);
        break;
      }
      if (err.status === 429 || (err.status ?? 0) >= 500) {
        if (/quota/i.test(err.message) && /limit: 0|exceeded your current quota/i.test(err.message) && backoff > 160_000) {
          console.log(`stopping: ${err.message}`);
          break;
        }
        console.log(`${err.message.slice(0, 120)}; waiting ${backoff / 1000}s`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 320_000);
        i--;
        continue;
      }
      console.log(`failed ${p.id}: ${err.message.slice(0, 200)}`);
    }
    if (opts.gap) await sleep(opts.gap * 1000);
  }
  console.log(`${name}: ${set.items.length} of ${prompts.length} answered, about $${set.costUsd.toFixed(3)} (all ${provider} sets: $${(otherSpend + set.costUsd).toFixed(3)})${set.items.some((i) => i.cut) ? `, ${set.items.filter((i) => i.cut).length} cut at the token cap` : ''}`);
  return set;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const price = arg('price')?.split(',').map(Number) as [number, number] | undefined;
  await generate({ provider: arg('provider', 'openai')!, model: arg('model')!, name: arg('name'), gap: Number(arg('gap', '0')), maxUsd: arg('max-usd') ? Number(arg('max-usd')) : undefined, maxTotalUsd: arg('max-total-usd') ? Number(arg('max-total-usd')) : undefined, price, limit: arg('limit') ? Number(arg('limit')) : undefined });
}
