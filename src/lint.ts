import { RULES, regexHits } from './rules.ts';
import { countWords, lineIndex, mask, paragraphs, sentences } from './text.ts';
import type { Finding, Grade, Hit, LintOptions, LintResult, Register, Rule, RuleContext, Severity } from './types.ts';
import { humanReport } from './human.ts';
import { guessRegister } from './register.ts';

export const SEVERITY_WEIGHT: Record<Severity, number> = { error: 3, warning: 2, info: 1 };

const ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function severityFor(rule: Rule, register: Register, overrides?: Record<string, Severity | 'off'>): Severity | 'off' {
  return overrides?.[rule.id] ?? rule.registers?.[register] ?? rule.severity;
}

/** Find AI writing tells in `text`. Pure and synchronous: no network, no model. */
export function lint(text: string, options: LintOptions = {}): LintResult {
  const guessed = options.register === 'auto' ? guessRegister(text) : undefined;
  const register: Register = guessed ? guessed.register : ((options.register as Register | undefined) ?? 'professional');
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
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  const score = slopScore(findings, words);
  return { findings, words, score, grade: grade(score), counts, human: humanReport(ctx), register, ...(guessed ? { registerGuess: guessed } : {}) };
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
