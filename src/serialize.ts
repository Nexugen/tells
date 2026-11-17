import { RULES } from './rules.ts';
import type { Rule } from './types.ts';

/** The rules as plain JSON, for other languages and tools. Heuristic rules carry a summary instead of a pattern. */
export function rulesAsJson(rules: Rule[] = RULES) {
  return {
    version: 1,
    rules: rules.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      severity: r.severity,
      registers: r.registers ?? {},
      description: r.description,
      why: r.why,
      fix: r.fix,
      example: r.example,
      detect:
        r.detect.kind === 'pattern'
          ? { kind: 'pattern', pattern: r.detect.pattern.source, flags: r.detect.pattern.flags }
          : { kind: 'heuristic', summary: r.detect.summary },
    })),
  };
}
