import { exemplarsFor } from './exemplars.ts';
import { lint } from './lint.ts';
import { getRule } from './rules.ts';
import { mask, sentences } from './text.ts';
import type { Finding, LintOptions, LintResult, Register, Severity } from './types.ts';
import { anthropic, ModelError, type Model } from './model.ts';

export interface RewriteOptions extends LintOptions {
  /** Defaults to the Anthropic adapter (ANTHROPIC_API_KEY). */
  model?: Model;
  /** Lowest severity to fix. Defaults to 'warning', so info-level hints are left alone. */
  minSeverity?: Severity;
  /** How many times to retry spans that still carry a tell after the first pass. Default 1. */
  retries?: number;
  /** Extra guidance for the model, such as a style guide of your own. Kept short. */
  guidance?: string;
}

export interface Change {
  start: number;
  end: number;
  before: string;
  after: string;
  rules: string[];
}

export interface RewriteResult {
  text: string;
  changes: Change[];
  before: LintResult;
  after: LintResult;
  model: string;
  calls: number;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
}

interface Unit {
  id: number;
  start: number;
  end: number;
  findings: Finding[];
}

const RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/**
 * Rewrite only the sentences that carry a tell. Everything else in `text` is returned
 * byte for byte. Each flagged sentence goes to the model with the rules it broke, a little
 * surrounding context, and a few human examples in the same register.
 */
export async function rewrite(text: string, options: RewriteOptions = {}): Promise<RewriteResult> {
  const register: Register = options.register ?? 'professional';
  const minSeverity = options.minSeverity ?? 'warning';
  const model = options.model ?? anthropic();
  const before = lint(text, options);
  const wanted = (f: Finding) => RANK[f.severity] <= RANK[minSeverity];

  let units = buildUnits(text, before.findings.filter(wanted), options.plain);
  const replacements = new Map<string, Change>();
  const usage = { inputTokens: 0, outputTokens: 0 };
  let costUsd = 0;
  let calls = 0;
  const retries = options.retries ?? 1;

  for (let round = 0; round <= retries && units.length; round++) {
    const res = await model.complete({
      system: systemPrompt(register, options.guidance),
      prompt: userPrompt(text, units, replacements),
      maxTokens: Math.min(8000, 600 + units.reduce((a, u) => a + (u.end - u.start), 0)),
    });
    calls++;
    usage.inputTokens += res.usage?.inputTokens ?? 0;
    usage.outputTokens += res.usage?.outputTokens ?? 0;
    costUsd += res.costUsd ?? 0;
    const edits = parseEdits(res.text);
    const retry: Unit[] = [];
    for (const u of units) {
      const edit = edits.get(u.id);
      if (edit === undefined) {
        retry.push(u);
        continue;
      }
      const original = text.slice(u.start, u.end);
      const targetRules = new Set(u.findings.map((f) => f.ruleId));
      const still = edit.trim() ? lint(edit, { ...options, register }).findings.filter((f) => targetRules.has(f.ruleId) && wanted(f)) : [];
      replacements.set(`${u.start}:${u.end}`, { start: u.start, end: u.end, before: original, after: edit.trim(), rules: [...targetRules] });
      if (still.length) retry.push(u);
    }
    units = retry;
  }

  const changes = [...replacements.values()].filter((c) => c.after !== c.before).sort((a, b) => a.start - b.start);
  const out = apply(text, changes);
  return { text: out, changes, before, after: lint(out, options), model: model.name, calls, usage, costUsd };
}

/** Grow each finding to the sentence (or sentences) around it, and merge units that touch. */
export function buildUnits(text: string, findings: Finding[], plain?: boolean): Unit[] {
  if (!findings.length) return [];
  const ss = sentences(mask(text, plain));
  const raw = findings.map((f) => {
    const first = ss.find((s) => f.start >= s.start && f.start < s.end) ?? { start: f.start, end: f.end };
    const last = ss.find((s) => f.end > s.start && f.end <= s.end) ?? first;
    return { start: Math.min(first.start, f.start), end: Math.max(last.end, f.end), findings: [f] };
  });
  raw.sort((a, b) => a.start - b.start);
  const merged: Omit<Unit, 'id'>[] = [];
  for (const r of raw) {
    const prev = merged[merged.length - 1];
    if (prev && r.start < prev.end) {
      prev.end = Math.max(prev.end, r.end);
      prev.findings.push(...r.findings);
    } else merged.push({ ...r, findings: [...r.findings] });
  }
  return merged.map((u, i) => ({ ...u, id: i + 1 }));
}

function apply(text: string, changes: Change[]): string {
  let out = '';
  let at = 0;
  for (const c of changes) {
    let start = c.start;
    let end = c.end;
    let insert = c.after;
    if (!insert) {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const nl = text.indexOf('\n', end);
      const lineEnd = nl < 0 ? text.length : nl;
      if (!text.slice(lineStart, start).trim() && !text.slice(end, lineEnd).trim()) {
        // The deleted sentence was a whole line or paragraph: take its blank lines with it.
        start = lineStart;
        let e = lineEnd;
        while (text[e] === '\n') e++;
        if (e < text.length) end = e;
        else {
          while (start > at && text[start - 1] === '\n') start--;
          end = text.length;
          insert = /\n$/.test(text) ? '\n' : '';
        }
      } else if (text[end] === ' ') end++;
      else if (text[start - 1] === ' ') start--;
    }
    if (start < at) start = at;
    out += text.slice(at, start) + insert;
    at = end;
  }
  return out + text.slice(at);
}

function systemPrompt(register: Register, guidance?: string): string {
  const examples = exemplarsFor(register, 3)
    .map((e) => `<example source="${e.source.author}">\n${e.text}\n</example>`)
    .join('\n');
  return [
    'You edit sentences so they read like a specific person wrote them, not a language model.',
    'You get numbered sentences from a longer text. Each comes with the writing tells found in it. Rewrite each one so the tells are gone.',
    '',
    'Rules:',
    '- Keep the meaning, every fact, number, name, link, code span and markdown marker. Never add facts, numbers or claims that are not in the text.',
    '- Change as little as you can. Rewrite the whole sentence when a tell is structural; do not just swap one word for a synonym.',
    '- Plain everyday words. Vary sentence length. No em dashes or en dashes. No "not X, it\'s Y" frames. No lists of three by habit.',
    '- If a sentence is pure filler (a pleasantry, a sign-off offer, a closing slogan), return an empty string to delete it.',
    '- Match the register and voice of the surrounding text. Do not make it more formal or more excited.',
    guidance ? `- Also follow this house guidance: ${guidance.slice(0, 1500)}` : '',
    '',
    `Register: ${register}. Here is writing in this register that sounds like a person:`,
    examples,
    '',
    'Reply with JSON only, no prose: {"edits":[{"id":1,"text":"..."}]}. Include every id you were given.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

function userPrompt(text: string, units: Unit[], done: Map<string, Change>): string {
  const items = units.map((u) => {
    const ctxBefore = text.slice(Math.max(0, u.start - 200), u.start);
    const ctxAfter = text.slice(u.end, u.end + 200);
    const problems = [...new Map(u.findings.map((f) => [f.ruleId, f])).values()].map((f) => {
      const rule = getRule(f.ruleId);
      return { rule: f.name, found: f.match, fix: rule?.fix ?? f.fix };
    });
    const prior = done.get(`${u.start}:${u.end}`);
    return {
      id: u.id,
      text: text.slice(u.start, u.end),
      problems,
      ...(prior ? { previous_attempt_still_had_tells: prior.after } : {}),
      context_before: ctxBefore.trimStart(),
      context_after: ctxAfter.trimEnd(),
    };
  });
  return JSON.stringify({ sentences: items }, null, 1);
}

export function parseEdits(raw: string): Map<number, string> {
  const out = new Map<number, string>();
  const startAt = raw.indexOf('{');
  const endAt = raw.lastIndexOf('}');
  if (startAt < 0 || endAt <= startAt) throw new ModelError('The model did not return JSON.', true);
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(startAt, endAt + 1));
  } catch {
    throw new ModelError('The model returned malformed JSON.', true);
  }
  const edits = (data as { edits?: unknown }).edits;
  if (!Array.isArray(edits)) throw new ModelError('The model reply had no "edits" array.', true);
  for (const e of edits) {
    if (e && typeof e === 'object' && typeof (e as { id: unknown }).id === 'number' && typeof (e as { text: unknown }).text === 'string') {
      out.set((e as { id: number }).id, (e as { text: string }).text);
    }
  }
  return out;
}
