import type { LintResult } from './types.ts';

const MARK = { error: 'error', warning: 'warn ', info: 'info ' } as const;

export function formatText(file: string, text: string, result: LintResult, opts: { color?: boolean } = {}): string {
  const c = (code: string, s: string) => (opts.color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const tone = { error: '31', warning: '33', info: '36' } as const;
  const lines: string[] = [];
  for (const f of result.findings) {
    const match = f.match.length > 70 ? f.match.slice(0, 67) + '...' : f.match;
    lines.push(`${file}:${f.line}:${f.column}  ${c(tone[f.severity], MARK[f.severity])}  ${f.message} [${f.ruleId}]`);
    lines.push(`    ${c('2', JSON.stringify(match.replace(/\s+/g, ' ')))}`);
    lines.push(`    ${f.fix}`);
  }
  const summary = `${file}: ${result.words} words, ${result.score} known tells per 100 words (${result.grade}), ${result.counts.error} errors, ${result.counts.warning} warnings, ${result.counts.info} info`;
  lines.push(result.findings.length ? summary : `${file}: clean, ${result.words} words`);
  const h = result.human;
  if (h) {
    const present = h.present.map((p) => `${p.name} (${p.count})`).join(', ');
    lines.push(`  ${c('32', 'human signals')}  ${present || 'none found'}${h.tooShort ? ' (too short to judge)' : ''}`);
    for (const m of h.missing) {
      lines.push(`  ${c('35', 'missing')}  ${m.name}. ${m.message}`);
      lines.push(`    ${m.add}`);
    }
  }
  void text;
  return lines.join('\n');
}

/** GitHub Actions workflow commands, so findings show up inline on the pull request. */
export function formatGithub(file: string, result: LintResult): string {
  const esc = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const kind = { error: 'error', warning: 'warning', info: 'notice' } as const;
  return result.findings
    .map((f) => `::${kind[f.severity]} file=${file},line=${f.line},col=${f.column},title=${esc(`${f.name} [${f.ruleId}]`)}::${esc(`"${f.match.slice(0, 80)}" ${f.fix}`)}`)
    .join('\n');
}
