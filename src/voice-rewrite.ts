import { lint } from './lint.ts';
import { newFacts, rewrite, type RewriteOptions, type RewriteResult } from './rewrite.ts';
import { ModelError, anthropic } from './model.ts';
import { checkVoice, styleMatch, voicePrompt, type VoiceProfile } from './voice.ts';
import { guessRegister } from './register.ts';
import type { Register } from './types.ts';

/**
 * Rewrite a whole draft in the voice of a profile (see buildVoice), keeping every fact.
 *
 * One model call rewrites the draft toward the writer's habits. The result is checked against
 * the source: a number, name, link, code span or placeholder that was added or dropped sends
 * it back once with the problem named, and if it still does not hold, the draft is returned
 * unchanged with the reason in `rejected`. Then the text is linted again, and any sentence
 * that still carries a tell goes through the usual span rewrite, told to keep the voice.
 */
export async function voiceRewrite(text: string, options: RewriteOptions & { voice: VoiceProfile }): Promise<RewriteResult> {
  checkVoice(options.voice);
  const voice = options.voice;
  const register: Register = options.register === 'auto' || options.register === undefined ? guessRegister(text).register : options.register;
  const lintOpts = { ...options, register, corroborate: options.corroborate ?? 0 };
  const model = options.model ?? anthropic();
  const before = lint(text, lintOpts);
  const matchBefore = styleMatch(text, voice, { polish: options.polish });
  const usage = { inputTokens: 0, outputTokens: 0 };
  let costUsd = 0;
  let calls = 0;
  const rejected: RewriteResult['rejected'] = [];
  const retries = options.retries ?? 1;
  const system = voiceSystemPrompt(voice, options.polish, options.guidance);

  let draft: string | undefined;
  let problems: string[] = [];
  for (let round = 0; round <= retries; round++) {
    const res = await model.complete({
      system,
      prompt: JSON.stringify({ register, draft: text, ...(problems.length ? { previous_attempt: draft, problems_with_previous_attempt: problems } : {}) }, null, 1),
      maxTokens: Math.min(8000, 1000 + text.length),
    });
    calls++;
    usage.inputTokens += res.usage?.inputTokens ?? 0;
    usage.outputTokens += res.usage?.outputTokens ?? 0;
    costUsd += res.costUsd ?? 0;
    const attempt = parseVoiceText(res.text) + (/\n$/.test(text) ? '\n' : '');
    problems = factProblems(text, attempt);
    draft = attempt;
    if (!problems.length) break;
  }
  let voiced = text;
  if (draft !== undefined && !problems.length) voiced = draft;
  else if (draft !== undefined) rejected.push({ before: text, attempted: draft, reason: problems.join('; ') });

  // Re-lint, and fix the sentences that still carry a tell without leaving the voice.
  let final = voiced;
  let fixedSpans = 0;
  if (voiced !== text) {
    const check = lint(voiced, lintOpts);
    const rank = { error: 0, warning: 1, info: 2 } as const;
    const min = options.minSeverity ?? 'warning';
    if (check.findings.some((f) => rank[f.severity] <= rank[min])) {
      const spans = await rewrite(voiced, {
        ...options,
        voice: undefined,
        register,
        model,
        humanize: false,
        guidance: [spanGuidance(voice, options.polish), options.guidance].filter(Boolean).join(' '),
      });
      calls += spans.calls;
      usage.inputTokens += spans.usage.inputTokens;
      usage.outputTokens += spans.usage.outputTokens;
      costUsd += spans.costUsd;
      rejected.push(...spans.rejected);
      // The span pass checks its own edits against the voiced text; check the result against the source too.
      if (!factProblems(text, spans.text).length) {
        final = spans.text;
        fixedSpans = spans.changes.length;
      }
    }
  }

  const changes = final === text ? [] : [{ start: 0, end: text.length, before: text, after: final, rules: ['voice'] }];
  return {
    text: final,
    changes,
    suggestions: [],
    rejected,
    before,
    after: lint(final, lintOpts),
    model: model.name,
    calls,
    usage,
    costUsd,
    voice: { before: matchBefore, after: styleMatch(final, voice, { polish: options.polish }), fixedSpans, voiced },
  };
}

function voiceSystemPrompt(voice: VoiceProfile, polish?: boolean, guidance?: string): string {
  const { habits, excerpts } = voicePrompt(voice, 6000, polish);
  return [
    'You rewrite a draft so it reads as if one particular person wrote it. You get a description of how they write, a few things they wrote, and the draft.',
    '',
    'Rules:',
    '- Keep every fact, number, name, link, claim, code span and [bracketed placeholder] from the draft, written the same way. Add none: no new numbers, names, dates, places, experiences, opinions or claims. If this person would usually give a detail the draft does not have, do without it.',
    '- Keep the purpose, the order of the points and roughly the length. Keep the paragraph breaks where the draft has them, and its headings, title lines, numbered thread parts and real lists.',
    '- Change the wording, sentence shapes, rhythm, openings and endings toward this person: their sentence lengths, how they start sentences, the small words they lean on, their punctuation, how plain or casual they are. A light touch-up is not enough: rework every sentence that does not already sound like them.',
    `- Targets from their writing: about ${voice.habits.sentenceWords} words per sentence on average, ${Math.round(voice.habits.shortSentences * 100)}% of sentences six words or fewer, about ${voice.habits.punctuation.commas ?? 0} commas per 100 words.`,
    '- The samples show the voice, not the content. Do not copy their sentences, topics or names.',
    polish
      ? '- This is for publishing. The samples may be typed casually, but the rewrite must use standard capitals (start every sentence with one, capitalise I and names), apostrophes and spelling. Keep everything else about the voice: sentence shapes, rhythm, word choice, directness.'
      : '- Follow their casing and contraction habits. Never add spelling mistakes.',
    '- Keep how sure the draft is: "it does" stays "it does", not "it should". Do not add reactions or verdicts of your own ("which is useless", "I think that is a problem") or a tag question ("right?").',
    '- Use their habits only where the draft gives you something to work with. Ask a question only if the draft leaves something open; never stage a question and answer it.',
    '- Do not open with a reply word such as "okay", "yes" or "so" unless the draft is itself a reply to someone.',
    '- Avoid what reads as machine-written: em dashes and en dashes, "not X, it\'s Y" frames, lists of three by habit, a closing moral or summary line, stock openers and sign-offs, hype words.',
    guidance ? `- Also follow this guidance: ${guidance.slice(0, 1500)}` : '',
    '',
    '<how_they_write>',
    habits,
    '</how_they_write>',
    '',
    ...excerpts.map((e) => `<sample>\n${e}\n</sample>`),
    '',
    'Reply with JSON only, no prose: {"text":"the rewritten draft"}.',
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');
}

function spanGuidance(voice: VoiceProfile, polish?: boolean): string {
  const lines = voicePrompt(voice, 1200, polish).habits.split('\n').slice(0, 6).join(' ');
  return `Keep the writer's voice: ${lines}${polish ? ' Use standard capitals, apostrophes and spelling.' : ''}`.slice(0, 1200);
}

export function parseVoiceText(raw: string): string {
  const a = raw.indexOf('{');
  const b = raw.lastIndexOf('}');
  if (a < 0 || b <= a) throw new ModelError('The model did not return JSON.', true);
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(a, b + 1));
  } catch {
    throw new ModelError('The model returned malformed JSON.', true);
  }
  const t = (data as { text?: unknown }).text;
  if (typeof t !== 'string' || !t.trim()) throw new ModelError('The model reply had no "text".', true);
  return t.trim();
}

/** What a whole-draft rewrite added to or dropped from the source. Empty means it holds. */
export function factProblems(source: string, out: string): string[] {
  const problems: string[] = [];
  const added = newFacts(source, out);
  if (added.length) problems.push(`added ${added.join(', ')}, which the draft does not have`);
  const lower = out.toLowerCase();
  const dropped = new Set<string>();
  for (const n of source.match(/\d[\d,.:]*\d|\d/g) ?? []) if (!out.includes(n)) dropped.add(n);
  for (const u of source.match(/\bhttps?:\/\/[^\s)>\]]+|`[^`\n]+`|\[[^\]\n]{2,60}\]/g) ?? []) if (!out.includes(u)) dropped.add(u);
  // Names: capitalised words inside a sentence of the source that the output no longer mentions.
  for (const w of newFacts(out, source)) if (!/^\d/.test(w) && !lower.includes(w.toLowerCase())) dropped.add(w);
  if (dropped.size) problems.push(`dropped ${[...dropped].slice(0, 12).join(', ')}, which the draft has`);
  return problems;
}
