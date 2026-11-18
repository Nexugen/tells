/**
 * Model answers for the v2 prompt bank, through Claude Code's print mode.
 *
 *   TELLS_CLI_CONFIG_DIR=... node --experimental-strip-types bench/generate.ts \
 *     --bank bench/prompts-v2.json --out bench/out-v2 [--only haiku|sonnet|opus] [--all] [--limit N] [--concurrency 3]
 *
 * Each prompt goes to one model, picked by a hash of its id (haiku 45%, sonnet 35%, opus 20%),
 * so the budget buys more prompts rather than three answers to the same one. --all sends every
 * prompt to all three (used for the fresh rounds), and --second asks the next model in the
 * rotation for a second answer to every prompt. The run is
 * resumable and stops when the shared subscription's weekly usage reaches --max-pct (default 84),
 * read from TELLS_USAGE_FILE.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { claudeCli } from '../src/model.ts';

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const bankFile = arg('bank', 'bench/prompts-v2.json')!;
const outDir = arg('out', 'bench/out-v2')!;
const only = arg('only');
const limit = Number(arg('limit', '100000'));
const conc = Number(arg('concurrency', '3'));
const maxPct = Number(arg('max-pct', '84'));
const usageFile = process.env.TELLS_USAGE_FILE ?? '/var/nexugen/claude-subscription-usage.json';
// --system chat: the plain assistant setup people meet in a chat app, preamble and all.
const SYSTEM = arg('system') === 'chat' ? 'You are a helpful assistant.' : 'You are a helpful assistant. Write exactly what is asked. Output only the requested text, with no preamble.';

interface P { id: string; family: string; genre: string; register: string; variant: string; adversarial: boolean; prompt: string }
const prompts = (JSON.parse(readFileSync(bankFile, 'utf8')) as { prompts: P[] }).prompts;

export function assign(id: string): 'haiku' | 'sonnet' | 'opus' {
  const k = parseInt(createHash('sha256').update(`model:${id}`).digest('hex').slice(0, 8), 16) % 100;
  return k < 45 ? 'haiku' : k < 80 ? 'sonnet' : 'opus';
}

const usage = () => {
  try {
    return Number(JSON.parse(readFileSync(usageFile, 'utf8')).claude?.pct);
  } catch {
    return 100;
  }
};

mkdirSync(outDir, { recursive: true });
const sets = new Map<string, { name: string; model: string; createdAt: string; items: (Omit<P, 'prompt'> & { text: string })[] }>();
const load = (m: string) => {
  if (!sets.has(m)) {
    const f = join(outDir, `claude-${m}.json`);
    sets.set(m, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { name: `claude-${m}`, model: `claude-cli:${m}`, createdAt: new Date().toISOString(), items: [] });
  }
  return sets.get(m)!;
};
const save = (m: string) => writeFileSync(join(outDir, `claude-${m}.json`), JSON.stringify(sets.get(m), null, 1) + '\n');

const every = process.argv.includes('--all');
// --second: a second answer to every prompt from the next model in the rotation.
const second = process.argv.includes('--second');
const NEXT = { haiku: 'sonnet', sonnet: 'opus', opus: 'haiku' } as const;
const todo = prompts
  .flatMap((p) => (every ? (['haiku', 'sonnet', 'opus'] as const).map((m) => ({ p, m })) : [{ p, m: second ? NEXT[assign(p.id)] : assign(p.id) }]))
  .filter(({ p, m }) => (!only || m === only) && !load(m).items.some((i) => i.id === p.id))
  .slice(0, limit);
console.log(`to do: ${todo.length}, usage now ${usage()}%`);

const models = new Map<string, ReturnType<typeof claudeCli>>();
let stopped = false;
const retries = new Map<string, number>();
let done = 0;
async function worker() {
  while (todo.length && !stopped) {
    const pct = usage();
    if (!(pct < maxPct)) {
      stopped = true;
      console.log(`stopping: subscription usage is ${pct}%`);
      break;
    }
    const { p, m } = todo.shift()!;
    if (!models.has(m)) models.set(m, claudeCli({ model: m, configDir: process.env.TELLS_CLI_CONFIG_DIR, timeoutMs: 180_000 }));
    try {
      const res = await models.get(m)!.complete({ system: SYSTEM, prompt: p.prompt, maxTokens: 1500 });
      const { prompt: _drop, ...meta } = p;
      load(m).items.push({ ...meta, text: res.text.trim() });
      save(m);
      if (++done % 20 === 0) console.log(`${done} done, usage ${usage()}%`);
    } catch (e) {
      const msg = (e as Error).message;
      // The CLI binary is briefly missing while it updates itself; wait and try again.
      const tries = (retries.get(`${m}:${p.id}`) ?? 0) + 1;
      retries.set(`${m}:${p.id}`, tries);
      if ((/ENOENT|timed out|exited with/.test(msg)) && tries < 5) {
        todo.push({ p, m });
        await new Promise((r) => setTimeout(r, 15_000));
      } else console.log(`failed ${p.id} on ${m}: ${msg.slice(0, 160)}`);
    }
  }
}
await Promise.all(Array.from({ length: conc }, worker));
console.log(`finished ${done}, usage ${usage()}%`);
