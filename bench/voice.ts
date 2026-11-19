import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildVoice, styleMatch, voiceDistance, voiceVector, type VoiceProfile } from '../src/voice.ts';
import { countWords, mask } from '../src/text.ts';
import { heldBack } from './voice-split.ts';
import { loadAll } from './dataset.ts';

/**
 * Checks the voice measure on public-domain authors (bench/data/human/gutenberg.jsonl).
 * For each author with enough samples, a profile is built from 80% of their samples and the
 * other 20% are held out. Two questions:
 *  1. Attribution: is a held-out passage closest to its own author's profile?
 *  2. Match score: do held-out passages by the author score higher than passages by other
 *     people (other authors, and held-back non-fiction human samples)? Reported as AUC.
 *
 *   node --experimental-strip-types bench/voice.ts [--write]
 */
interface S { id: string; source: string; text: string; note?: string; author?: string }
const dir = 'bench/data/human';
const rows: S[] = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) for (const l of readFileSync(join(dir, f), 'utf8').split('\n')) if (l.trim()) rows.push(JSON.parse(l));
const ok = (s: S) => countWords(mask(s.text)) >= 25 && countWords(mask(s.text)) <= 600;
const authorOf = (s: S) => s.author ?? /Author: ([^.]+)/.exec(s.note ?? '')?.[1];

const byAuthor = new Map<string, S[]>();
for (const s of rows.filter((s) => s.source === 'gutenberg' && ok(s))) {
  const a = authorOf(s);
  if (!a) continue;
  byAuthor.set(a, [...(byAuthor.get(a) ?? []), s]);
}
const authors = [...byAuthor.entries()].filter(([, v]) => v.length >= 25).sort((a, b) => a[0].localeCompare(b[0]));
const split = (id: string) => {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 5 === 0;
};
const profiles = new Map<string, VoiceProfile>();
const held: { author: string; text: string }[] = [];
for (const [a, ss] of authors) {
  const train = ss.filter((s) => !split(s.id));
  profiles.set(a, buildVoice(train.map((s) => s.text), { name: a }));
  for (const s of ss.filter((s) => split(s.id))) held.push({ author: a, text: s.text });
}
// Other people: human samples outside the baseline's reference set, never from the locked test split.
const others = loadAll().filter((s) => s.y === 1 && s.split !== 'test' && s.source !== 'gutenberg' && heldBack(s.id) && ok(s as S)).map((s) => s.text);

function auc(pos: number[], neg: number[]): number {
  let w = 0;
  for (const p of pos) for (const n of neg) w += p > n ? 1 : p === n ? 0.5 : 0;
  return w / (pos.length * neg.length);
}

let correct = 0;
const aucsAuthors: number[] = [];
const aucsOthers: number[] = [];
const ownMedian: number[] = [];
const heldVecs = held.map((h) => voiceVector(h.text));
for (let i = 0; i < held.length; i++) {
  let best = '', bd = Infinity;
  for (const [name, p] of profiles) {
    const d = voiceDistance(heldVecs[i], p);
    if (d < bd) { bd = d; best = name; }
  }
  if (best === held[i].author) correct++;
}
const otherScores = new Map<string, number[]>();
for (const [a, p] of profiles) {
  const own = held.filter((h) => h.author === a).map((h) => styleMatch(h.text, p).score);
  const rest = held.filter((h) => h.author !== a).map((h) => styleMatch(h.text, p).score);
  const out = others.map((t) => styleMatch(t, p).score);
  otherScores.set(a, out);
  aucsAuthors.push(auc(own, rest));
  aucsOthers.push(auc(own, out));
  ownMedian.push(own.sort((x, y) => x - y)[Math.floor(own.length / 2)]);
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const res = {
  authors: authors.length,
  heldOut: held.length,
  otherHumans: others.length,
  attribution: Math.round((correct / held.length) * 1000) / 10,
  chance: Math.round((100 / authors.length) * 10) / 10,
  aucVsOtherAuthors: Math.round(mean(aucsAuthors) * 1000) / 1000,
  aucVsOtherHumans: Math.round(mean(aucsOthers) * 1000) / 1000,
  medianOwnMatch: Math.round(mean(ownMedian)),
};
console.log(JSON.stringify(res, null, 1));
if (process.argv.includes('--write')) {
  writeFileSync('bench/voice-results.json', JSON.stringify(res, null, 1) + '\n');
  // The figures the landing page shows.
  writeFileSync('src/voice-figures.json', JSON.stringify({ note: 'Written by bench/voice.ts --write. Do not edit by hand.', authors: res.authors, attribution: `${Math.round(res.attribution)}%`, chance: `${Math.round(res.chance)}%`, aucVsOtherHumans: res.aucVsOtherHumans.toFixed(2), aucVsOtherAuthors: res.aucVsOtherAuthors.toFixed(2) }, null, 1) + '\n');
}
