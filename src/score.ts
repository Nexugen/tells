import MODEL from './score-model.json' with { type: 'json' };
import { scoreFeatures, stripLayout, SCORE_KEYS } from './score-features.ts';
import { mask, paragraphs, sentences, countWords } from './text.ts';
import type { Finding, Register, RuleContext } from './types.ts';

/**
 * The human-pattern score: how much a text's measurable habits look like the people in the
 * benchmark rather than the models, as a calibrated probability from 0 to 100.
 *
 * It is a small boosted tree model over the counts in score-features.ts, trained on the
 * benchmark's training split and calibrated on its tune split (see bench/EVAL.md). It is a
 * prior, not a verdict: a person can write a low-scoring text, and a model told to sound like
 * a person can write a high-scoring one. It never raises a finding on its own.
 */

interface Tree { f: number[]; t: number[]; l: number[] }
interface ScoreModel {
  version: number;
  keys: string[];
  base: number;
  rate: number;
  trees: Tree[];
  /** Platt calibration on the tune split: p = 1 / (1 + exp(-(a * margin + b))). */
  calib: { a: number; b: number };
  /** Below this score the text reads as machine-like. Set so few human tune texts fall under it. */
  low: number;
  minWords: number;
}

const M = MODEL as unknown as ScoreModel;

/** Trees are stored breadth first: node i has children 2i+1 and 2i+2; f < 0 marks a leaf. */
function evalTree(tree: Tree, x: number[]): number {
  let i = 0;
  while (tree.f[i] >= 0) i = x[tree.f[i]] <= tree.t[i] ? 2 * i + 1 : 2 * i + 2;
  return tree.l[i];
}

export function margin(x: number[], model: ScoreModel = M): number {
  let m = model.base;
  for (const t of model.trees) m += model.rate * evalTree(t, x);
  return m;
}

export interface HumanScore {
  /** 0 to 100: the calibrated chance, at even odds, that a text with these habits was written by a person. */
  score: number;
  /** True when the score is under the model's low line. */
  low: boolean;
  /** The low line, for display. */
  lowLine: number;
}

/** Score a text. Returns null under the model's minimum length, where the counts say too little. */
export function humanScore(text: string, register: Register, findings: Pick<Finding, 'ruleId' | 'severity' | 'category'>[]): HumanScore | null {
  if (!M.trees?.length || M.keys.length !== SCORE_KEYS.length) return null;
  const prose = stripLayout(text);
  const masked = mask(prose);
  if (countWords(masked) < M.minWords) return null;
  const paras = paragraphs(masked);
  const ctx: RuleContext = { text: prose, masked, paragraphs: paras, sentences: sentences(masked, paras), register };
  const x = scoreFeatures({ text: prose, register, findings, ctx });
  const p = 1 / (1 + Math.exp(-(M.calib.a * margin(x) + M.calib.b)));
  const score = Math.round(p * 100);
  return { score, low: score < M.low, lowLine: M.low };
}

export const SCORE_MODEL_VERSION = M.version;
