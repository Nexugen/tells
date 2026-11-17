import type { Paragraph, Sentence } from './types.ts';

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

function blank(s: string): string {
  return s.replace(/[^\n]/g, ' ');
}

/**
 * Blank out everything a prose rule should never look at, keeping every offset in place:
 * fenced and inline code, URLs, emails, HTML comments and tags, link targets, and any
 * region the author switched off with `<!-- tells-off -->` / `<!-- tells-on -->` or a
 * line that contains `tells-ignore`.
 */
export function mask(text: string, plain = false): string {
  let out = text;
  const sub = (re: RegExp) => {
    out = out.replace(re, (m) => blank(m));
  };
  sub(/<!--\s*tells-off\s*-->[\s\S]*?(?:<!--\s*tells-on\s*-->|$)/g);
  sub(/^.*tells-ignore.*$/gm);
  if (!plain) {
    sub(/^(```|~~~)[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm);
    sub(/^(?: {4}|\t).*$/gm);
    sub(/`[^`\n]+`/g);
    sub(/<!--[\s\S]*?-->/g);
    sub(/<\/?[a-zA-Z][^>\n]*>/g);
    // Keep the visible link text, hide the target.
    out = out.replace(/\]\(([^)\n]*)\)/g, (m) => '] ' + blank(m.slice(2)));
  }
  sub(/\bhttps?:\/\/[^\s)>\]]+/g);
  sub(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g);
  return out;
}

const LIST_OR_HEADING = /^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?)/;

/** Paragraphs are runs of non-blank lines. Headings and list items count as their own paragraph. */
export function paragraphs(masked: string): Paragraph[] {
  const out: Paragraph[] = [];
  const lines = masked.split('\n');
  let offset = 0;
  let cur: { start: number; end: number } | null = null;
  const flush = () => {
    if (!cur) return;
    const t = masked.slice(cur.start, cur.end);
    if (t.trim()) {
      out.push({
        start: cur.start,
        end: cur.end,
        text: t,
        words: countWords(t),
        heading: /^\s{0,3}#{1,6}\s/.test(t),
      });
    }
    cur = null;
  };
  for (const line of lines) {
    const start = offset;
    const end = offset + line.length;
    offset = end + 1;
    if (!line.trim()) {
      flush();
      continue;
    }
    if (LIST_OR_HEADING.test(line)) {
      flush();
      cur = { start, end };
      if (/^\s{0,3}#{1,6}\s/.test(line)) flush();
      continue;
    }
    if (cur) cur.end = end;
    else cur = { start, end };
  }
  flush();
  return out;
}

const ABBREV = /\b(?:e\.g|i\.e|etc|vs|Mr|Mrs|Ms|Dr|St|Jr|Sr|No|approx|Inc|Ltd|Co|cf|al)\.$/i;

/** Split masked text into sentences. Good enough for prose rules; not a linguistics tool. */
export function sentences(masked: string, paras = paragraphs(masked)): Sentence[] {
  const out: Sentence[] = [];
  for (const p of paras) {
    const body = p.text;
    // Skip the list or heading marker so it is not part of the first sentence.
    const lead = body.match(LIST_OR_HEADING)?.[0].length ?? 0;
    let s = lead;
    const re = /[.!?]+["'”’)\]]*(?=\s+|$)/g;
    re.lastIndex = lead;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      const end = m.index + m[0].length;
      const candidate = body.slice(s, end);
      if (ABBREV.test(candidate.trimEnd()) || /\d\.$/.test(candidate) && /^\s*\d/.test(body.slice(end))) continue;
      push(p.start + s, p.start + end);
      s = end;
    }
    if (body.slice(s).trim()) push(p.start + s, p.start + body.length);
  }
  return out;

  function push(a: number, b: number) {
    const raw = masked.slice(a, b);
    const lead = raw.length - raw.trimStart().length;
    const trail = raw.length - raw.trimEnd().length;
    const start = a + lead;
    const end = b - trail;
    if (end <= start) return;
    const text = masked.slice(start, end);
    const words = countWords(text);
    if (words === 0) return;
    out.push({ start, end, text, words });
  }
}

export function lineIndex(text: string): (offset: number) => { line: number; column: number } {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - starts[lo] + 1 };
  };
}
