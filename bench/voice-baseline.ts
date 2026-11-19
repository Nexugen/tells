import { writeFileSync } from 'node:fs';
import { loadAll } from './dataset.ts';
import { featureVector } from '../src/score.ts';
import { SCORE_KEYS } from '../src/score-features.ts';
import { countWords, mask } from '../src/text.ts';
import { heldBack } from './voice-split.ts';

/**
 * Writes src/voice-baseline.json: how ordinary human writing measures on the voice measures,
 * from the benchmark's human samples (train and tune splits, see dataset.ts). It keeps only numbers: per-measure
 * mean and spread, a set of reference vectors in standard units for the match percentile,
 * and how often common words appear. No sample text goes into the file.
 *
 * Samples whose id hashes into the last fifth are held back (refs skip them) so bench/voice.ts
 * can use them as "other people" without them also being the reference.
 *
 *   node --experimental-strip-types bench/voice-baseline.ts
 */
const VOICE_KEYS = SCORE_KEYS.filter((k) => !k.startsWith('reg:') && !k.startsWith('rule:'));
const IDX = VOICE_KEYS.map((k) => SCORE_KEYS.indexOf(k));
// Human samples from the train and tune splits only: the locked test split stays unread.
const all = loadAll().filter((s) => s.y === 1 && s.split !== 'test' && countWords(mask(s.text)) >= 25 && countWords(mask(s.text)) <= 600);

const vecs = all.map((s) => {
  const x = featureVector(s.text, 'casual', []) ?? [];
  return IDX.map((i) => x[i] ?? 0);
});
const mean = VOICE_KEYS.map((_, i) => vecs.reduce((a, v) => a + v[i], 0) / vecs.length);
const sd = VOICE_KEYS.map((_, i) => Math.sqrt(vecs.reduce((a, v) => a + (v[i] - mean[i]) ** 2, 0) / vecs.length) || 1);
const nz = VOICE_KEYS.map((_, i) => vecs.filter((v) => v[i] > 0).length / vecs.length);
const r = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

// Reference vectors: up to 16 per source, spread across sources, from the non-held-back samples.
const bySource = new Map<string, number[]>();
all.forEach((s, i) => {
  if (heldBack(s.id)) return;
  const list = bySource.get(s.source) ?? [];
  list.push(i);
  bySource.set(s.source, list);
});
const refs: number[][] = [];
for (const [, idx] of [...bySource.entries()].sort()) {
  const step = Math.max(1, Math.floor(idx.length / 16));
  for (let j = 0; j < idx.length && j / step < 16; j += step) {
    const v = vecs[idx[j]];
    refs.push(v.map((x, k) => r(Math.max(-3, Math.min(3, (x - mean[k]) / sd[k])), 1)));
  }
}

// Document frequency of common words, for "favourite words".
const df = new Map<string, number>();
for (const s of all) for (const t of new Set((mask(s.text).toLowerCase().match(/[\p{L}][\p{L}'’]*/gu) ?? []).map((t) => t.replace(/’/g, "'")))) df.set(t, (df.get(t) ?? 0) + 1);
const vocab = Object.fromEntries([...df.entries()].filter(([, c]) => c >= 8).sort((a, b) => b[1] - a[1]).slice(0, 4000).map(([w, c]) => [w, r(c / all.length, 4)]));

writeFileSync('src/voice-baseline.json', JSON.stringify({ version: 1, builtAt: new Date().toISOString().slice(0, 10), samples: all.length, keys: VOICE_KEYS, mean: mean.map((x) => r(x, 4)), sd: sd.map((x) => r(x, 4)), nz: nz.map((x) => r(x)), refs, df: vocab }) + '\n');
console.log(`baseline: ${all.length} samples, ${refs.length} reference vectors, ${Object.keys(vocab).length} words`);
