/**
 * The v2 benchmark data: every human and model sample in one list, with a split.
 *
 * Human samples come from bench/human*.json (the v1 sets), bench/data/human/*.jsonl (sources we
 * may redistribute, committed) and $TELLS_DATA/human/*.jsonl (sources we may not, fetched with
 * the scripts in bench/fetch/; default /root/tells-data). Model samples come from bench/out
 * (v1 prompts) and bench/out-v2 (the v2 bank).
 *
 * Splits are by group: a Stack Exchange site, a mailbox, a book, a subreddit, an essay prompt, or
 * for model output a prompt family (one topic, plain and adversarial). 60% train, 20% tune, 20%
 * test. The test split is locked: nothing in bench/ reads it except `report --test`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Register } from '../src/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.TELLS_DATA ?? '/root/tells-data';

export type Split = 'train' | 'tune' | 'test';
export interface Sample {
  id: string;
  /** 1 for human writing, 0 for model output. */
  y: 0 | 1;
  source: string;
  group: string;
  genre: string;
  register: Register;
  adversarial: boolean;
  nonNative: boolean;
  /** For model output: the model. */
  model?: string;
  text: string;
  split: Split;
}

const bucket = (key: string) => parseInt(createHash('sha256').update(`split:${key}`).digest('hex').slice(0, 8), 16) % 100;
export const splitOf = (group: string): Split => {
  const b = bucket(group);
  return b < 60 ? 'train' : b < 80 ? 'tune' : 'test';
};

const host = (u: string) => (u.match(/^https?:\/\/([^/]+)/)?.[1] ?? 'unknown').replace(/^www\./, '');

function v1Human(): Sample[] {
  const out: Sample[] = [];
  for (const f of ['human.json', 'human-fresh.json', 'human-final.json']) {
    const p = join(here, f);
    if (!existsSync(p)) continue;
    for (const s of JSON.parse(readFileSync(p, 'utf8')).samples as { id: string; register: Register; text: string; source: string | { url: string } }[]) {
      const url = typeof s.source === 'string' ? s.source : s.source.url;
      const h = host(url);
      const site = h.endsWith('.stackexchange.com') ? `se:${h.split('.')[0]}` : h === 'stackoverflow.com' ? 'se:stackoverflow' : h;
      const genre = site.startsWith('se:') ? (s.id.includes('comment') ? 'comment' : 'qa') : h.includes('gov.uk') ? 'guidance' : 'blog';
      out.push({ id: `v1:${s.id}`, y: 1, source: site.startsWith('se:') ? 'stackexchange-v1' : h, group: site, genre, register: s.register, adversarial: false, nonNative: false, text: s.text, split: splitOf(site) });
    }
  }
  return out;
}

interface Jsonl { id: string; source: string; group: string; genre: string; register: Register; nonNative?: boolean; text: string; date?: string }

export function readJsonl(file: string): Jsonl[] {
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function v2Human(dirs = [join(here, 'data', 'human'), join(DATA_DIR, 'human')]): Sample[] {
  const seen = new Set<string>();
  const out: Sample[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
      for (const s of readJsonl(join(dir, f))) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        out.push({ id: s.id, y: 1, source: s.source, group: s.group, genre: s.genre, register: s.register, adversarial: false, nonNative: !!s.nonNative, text: s.text, split: splitOf(s.group) });
      }
    }
  }
  return out;
}

function modelSets(dir: string, v1: boolean): Sample[] {
  if (!existsSync(dir)) return [];
  const out: Sample[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json') && !f.includes('+tells')).sort()) {
    const set = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { name: string; model: string; items: { id: string; family?: string; genre?: string; register: Register; adversarial?: boolean; text: string }[] };
    for (const it of set.items) {
      const family = v1 ? `v1:${it.id}` : it.family!;
      out.push({ id: `${set.name}:${it.id}`, y: 0, source: v1 ? 'claude-v1' : 'claude-v2', group: family, genre: it.genre ?? 'mixed', register: it.register, adversarial: !!it.adversarial, nonNative: false, model: set.model, text: it.text, split: splitOf(family) });
    }
  }
  return out;
}

/**
 * Fresh rounds that have been scored and reported. Once a round is spent it joins the pool
 * (split by group like everything else), so the next round is the only untouched data.
 */
export const SPENT_ROUNDS = [1];

export function loadAll(): Sample[] {
  const spent = SPENT_ROUNDS.flatMap((n) => loadFresh(n).map((s) => ({ ...s, split: splitOf(s.group) })));
  const topic = modelSets(join(here, 'out-topic'), false).map((s) => ({ ...s, source: 'claude-topic' }));
  // Plain chat-assistant answers to everyday requests: the dev half trains, the test half is the regression set (bench/everyday.ts).
  const dev = new Set((existsSync(join(here, 'everyday', 'prompts.json')) ? JSON.parse(readFileSync(join(here, 'everyday', 'prompts.json'), 'utf8')).prompts : []).filter((p: { variant: string }) => p.variant === 'dev').map((p: { id: string }) => p.id));
  const everyday = modelSets(join(here, 'everyday', 'out'), false).filter((s) => dev.has(s.id.slice(s.id.indexOf(':') + 1))).map((s) => ({ ...s, source: 'claude-everyday', split: 'train' as Split }));
  const all = [...v1Human(), ...v2Human(), ...modelSets(join(here, 'out'), true), ...modelSets(join(here, 'out-v2'), false), ...topic, ...everyday, ...spent];
  // Drop exact duplicates and texts too short to judge.
  const seen = new Set<string>();
  return all.filter((s) => {
    const k = s.text.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** A fresh held-out round: bench/fresh-<n>/human/*.jsonl plus bench/fresh-<n>/out/*.json. Never split, never trained on. */
export function loadFresh(n: number): Sample[] {
  const dir = join(here, `fresh-${n}`);
  const human = v2Human([join(dir, 'human'), join(DATA_DIR, `fresh-${n}`, 'human')]).map((s) => ({ ...s, split: 'test' as Split }));
  const ai = modelSets(join(dir, 'out'), false).map((s) => ({ ...s, source: `claude-fresh-${n}`, split: 'test' as Split }));
  return [...human, ...ai];
}

/**
 * The modern probe: human writing about AI, apps, startups and software from 2014 to Oct 2022
 * (Hacker News, GitHub issues, Reddit), plus lowercase chat-style posts. Kept apart from the pool
 * and never trained on; it measures whether the score holds up on present-day topics.
 */
export function loadProbe(): Sample[] {
  return v2Human([join(here, 'probe', 'human'), join(DATA_DIR, 'probe')]).map((s) => ({ ...s, split: 'test' as Split }));
}
