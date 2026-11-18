import { RULES, regexHits } from './rules.ts';
import { countWords, lineIndex, mask, paragraphs, sentences } from './text.ts';
import type { Finding, Grade, Hit, LintOptions, LintResult, Register, Rule, RuleContext, Severity } from './types.ts';
import { humanReport } from './human.ts';
import { guessRegister } from './register.ts';
import { humanScore } from './score.ts';

export const SEVERITY_WEIGHT: Record<Severity, number> = { error: 3, warning: 2, info: 1 };

const ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function severityFor(rule: Rule, register: Register, overrides?: Record<string, Severity | 'off'>): Severity | 'off' {
  return overrides?.[rule.id] ?? rule.registers?.[register] ?? rule.severity;
}

/** Find AI writing tells in `text`. Pure and synchronous: no network, no model. */
export function lint(text: string, options: LintOptions = {}): LintResult {
  // With no register given, it is picked from the text, so a lowercase chat message is not judged as a business letter.
  const guessed = (options.register ?? 'auto') === 'auto' ? guessRegister(text) : undefined;
  const register: Register = guessed ? guessed.register : (options.register as Register);
  const masked = mask(text, options.plain);
  const paras = paragraphs(masked);
  const ctx: RuleContext = { text, masked, paragraphs: paras, sentences: sentences(masked, paras), register };
  const at = lineIndex(text);
  const disabled = new Set(options.disable ?? []);
  const rules = [...RULES, ...(options.extraRules ?? [])];

  const findings: Finding[] = [];
  for (const rule of rules) {
    if (disabled.has(rule.id)) continue;
    const severity = severityFor(rule, register, options.severity);
    if (severity === 'off') continue;
    let hits: Hit[];
    if (rule.detect.kind === 'pattern') {
      const re = new RegExp(rule.detect.pattern.source, rule.detect.pattern.flags.includes('g') ? rule.detect.pattern.flags : rule.detect.pattern.flags + 'g');
      hits = regexHits(re, masked, rule.detect.group);
    } else {
      hits = rule.detect.run(ctx);
    }
    for (const h of hits) {
      // Trim whitespace so the span is exactly the visible tell.
      let { start, end } = h;
      while (start < end && /\s/.test(text[start])) start++;
      while (end > start && /\s/.test(text[end - 1])) end--;
      if (end <= start) continue;
      const pos = at(start);
      const match = text.slice(start, end);
      findings.push({
        ruleId: rule.id,
        name: rule.name,
        severity,
        category: rule.category,
        start,
        end,
        line: pos.line,
        column: pos.column,
        match,
        message: h.detail ? `${rule.name} (${h.detail})` : rule.name,
        fix: rule.fix,
      });
    }
  }
  findings.sort((a, b) => a.start - b.start || ORDER[a.severity] - ORDER[b.severity]);

  const words = countWords(masked);
  const pattern = options.noScore ? null : humanScore(text, register, findings);
  if (options.corroborate !== 0) gate(findings, options.corroborate ?? DEFAULT_CORROBORATE, pattern?.low ?? false, options.severity, 'category', register, (pattern?.score ?? 0) >= HIGH_SCORE);
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  const score = slopScore(findings, words);
  const human = { ...humanReport(ctx), pattern };
  return { findings, words, score, grade: grade(score), counts, human, register, ...(guessed ? { registerGuess: guessed } : {}) };
}

/**
 * Rules that are close to proof on their own: a model talking about itself, a template slot
 * left in, an opener no person writes to a friend. Everything else is a habit people share
 * with models, so one of them alone is a hint, not an accusation.
 */
export const STRONG_RULES = new Set(['assistant-leak', 'unfilled-placeholder']);

/**
 * Only a model talking about itself is proof. "Below is the revised schedule", "Here's a draft"
 * and "I've rewritten my answer" are things people write too, so those are gated like any habit.
 */
const STRONG_LEAK = /\b(?:as an ai|as a large language model|i cannot browse|real-time|knowledge cutoff|training data)/i;

const isStrong = (f: Pick<Finding, 'ruleId' | 'match'>, all: Pick<Finding, 'ruleId' | 'match'>[]) => {
  if (!STRONG_RULES.has(f.ruleId)) return false;
  if (f.ruleId === 'assistant-leak') return STRONG_LEAK.test(f.match);
  // One bracketed slot can be an editor's note or an anonymised name; a template leaves several.
  return new Set(all.filter((x) => x.ruleId === 'unfilled-placeholder').map((x) => x.match.toLowerCase())).size >= 2;
};

/** Distinct habits a text needs before any of them is reported above a hint. */
export const DEFAULT_CORROBORATE = 2;

/** At or above this human-pattern score, findings need one more kind of evidence. */
export const HIGH_SCORE = 90;

/**
 * Corroboration. A warning or error from a habit rule stands only when the text shows at least
 * `need` distinct kinds of habit at that level, counting a low human-pattern score as one.
 * Otherwise those findings drop to hints and say so. Kinds are rule categories by default
 * (`by: 'category'`), so two rhythm rules on the same clipped dialogue count once; `by: 'rule'`
 * counts rules. One AI-sounding word is not evidence: ai-vocabulary counts only when two
 * different words from the list appear. Severities set explicitly in options are left alone.
 */
export function gate(findings: Finding[], need: number, lowScore: boolean, explicit?: Record<string, Severity | 'off'>, by: 'rule' | 'category' = 'category', register?: Register, highScore = false) {
  // Marketing copy by people is full of exclamation marks and stock adjectives, so it takes one more.
  if (register === 'marketing') need += 1;
  // A text whose habits read clearly human needs one more kind of evidence, the mirror of a low score counting as one.
  if (highScore) need += 1;
  const soft = findings.filter((f) => f.severity !== 'info' && !isStrong(f, findings) && !explicit?.[f.ruleId]);
  const units = new Set<string>();
  for (const f of soft) {
    if (f.ruleId === 'ai-vocabulary') {
      const distinct = new Set(soft.filter((x) => x.ruleId === 'ai-vocabulary').map((x) => x.match.toLowerCase()));
      if (distinct.size < 2) continue;
    }
    units.add(by === 'rule' ? f.ruleId : f.category);
  }
  const evidence = units.size + (lowScore ? 1 : 0);
  if (evidence >= need) return;
  for (const f of soft) {
    f.severity = 'info';
    f.message += ' (a hint: on its own this is common in human writing too)';
  }
}

/**
 * Weighted tells per 100 words (error 3, warning 2, info 1). Short texts are scored as if
 * they had at least 50 words, so one tell in a tweet does not read as a disaster.
 */
export function slopScore(findings: Pick<Finding, 'severity'>[], words: number): number {
  const weight = findings.reduce((a, f) => a + SEVERITY_WEIGHT[f.severity], 0);
  return Math.round((weight / Math.max(words, 50)) * 1000) / 10;
}

export function grade(score: number): Grade {
  if (score === 0) return 'clean';
  if (score < 2) return 'light';
  if (score < 5) return 'noticeable';
  return 'heavy';
}

/** True when the result should fail a CI check. */
export function fails(result: LintResult, opts: { failOn?: Severity; maxScore?: number } = {}): boolean {
  const failOn = opts.failOn ?? 'error';
  if (result.findings.some((f) => ORDER[f.severity] <= ORDER[failOn])) return true;
  if (opts.maxScore !== undefined && result.score > opts.maxScore) return true;
  return false;
}
