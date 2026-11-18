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
