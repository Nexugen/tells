export type Severity = 'error' | 'warning' | 'info';

export type Register = 'casual' | 'professional' | 'technical' | 'marketing';

export const REGISTERS: readonly Register[] = ['casual', 'professional', 'technical', 'marketing'];

export type Category = 'punctuation' | 'structure' | 'vocabulary' | 'tone' | 'format' | 'rhythm';

/** A span of text a rule matched. Offsets are UTF-16 indexes into the original text. */
export interface Hit {
  start: number;
  end: number;
  /** Optional extra detail for the message, such as the word that matched. */
  detail?: string;
}

/** What a heuristic rule gets to look at. Masked text has code, URLs and quotes blanked out with spaces, so offsets still line up. */
export interface RuleContext {
  text: string;
  masked: string;
  sentences: Sentence[];
  paragraphs: Paragraph[];
  register: Register;
}

export interface Sentence {
  start: number;
  end: number;
  text: string;
  words: number;
}

export interface Paragraph {
  start: number;
  end: number;
  text: string;
  words: number;
  /** True when the paragraph is a markdown heading line. */
  heading: boolean;
}

export interface RuleExample {
  before: string;
  after: string;
}

export type Detector =
  | { kind: 'pattern'; pattern: RegExp; group?: number }
  | { kind: 'heuristic'; summary: string; run: (ctx: RuleContext) => Hit[] };

export interface Rule {
  id: string;
  name: string;
  category: Category;
  severity: Severity;
  /** Overrides by register. 'off' turns the rule off for that register. */
  registers?: Partial<Record<Register, Severity | 'off'>>;
  description: string;
  why: string;
  /** What to do instead. Shown in lint output and given to the rewrite model. */
  fix: string;
  example: RuleExample;
  detect: Detector;
}

export interface Finding {
  ruleId: string;
  name: string;
  severity: Severity;
  category: Category;
  start: number;
  end: number;
  line: number;
  column: number;
  /** The exact matched text. */
  match: string;
  message: string;
  fix: string;
}

export interface LintResult {
  findings: Finding[];
  words: number;
  score: number;
  grade: Grade;
  counts: Record<Severity, number>;
  /** Human signals present in the text, and the ones its register usually has but this text lacks. */
  human: import('./human.ts').HumanReport;
  /** The register the text was checked against. */
  register: Register;
  /** Present when the register was 'auto'. */
  registerGuess?: import('./register.ts').RegisterGuess;
}

export type Grade = 'clean' | 'light' | 'noticeable' | 'heavy';

export interface LintOptions {
  /** 'auto' guesses it from the text (see guessRegister). Default 'professional'. */
  register?: Register | 'auto';
  /** Rule ids to skip. */
  disable?: string[];
  /** Per-rule severity overrides. */
  severity?: Record<string, Severity | 'off'>;
  /** Extra rules to run alongside the built-in set. */
  extraRules?: Rule[];
  /** Treat input as plain text instead of markdown (code fences and headings are not special). */
  plain?: boolean;
}
