import type { Hit } from './types.ts';

export function regexHits(re: RegExp, text: string, group?: number): Hit[] {
  const hits: Hit[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    if (group && m[group] !== undefined) {
      const at = m.index + m[0].indexOf(m[group]);
      hits.push({ start: at, end: at + m[group].length });
    } else {
      hits.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  return hits;
}

/**
 * True when a sentence is someone speaking: it opens with a quote mark, or sits inside a quote
 * that opened earlier in the same paragraph. Fiction and quoted speech are full of fragments, and
 * rhythm rules should not read a character's lines as the writer's habits.
 */
export function inDialogue(text: string, paragraphStart: number, sentenceStart: number): boolean {
  const head = text.slice(sentenceStart, sentenceStart + 3);
  if (/^\s*["“‘']/.test(head)) return true;
  const before = text.slice(paragraphStart, sentenceStart);
  const opens = (before.match(/“/g) ?? []).length;
  const closes = (before.match(/”/g) ?? []).length;
  if (opens > closes) return true;
  return ((before.match(/"/g) ?? []).length % 2) === 1;
}
