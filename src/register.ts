import type { Register } from './types.ts';

export interface RegisterGuess {
  register: Register;
  /** 0 to 1. Low when the text gives few clues; the guess then falls back to professional. */
  confidence: number;
  scores: Record<Register, number>;
}

const count = (re: RegExp, s: string) => (s.match(re) ?? []).length;

/**
 * Guess the register from surface clues. It is a heuristic for picking sensible defaults,
 * not a classifier: pass an explicit register when you know it.
 */
export function guessRegister(text: string): RegisterGuess {
  const t = text.replace(/\r/g, '');
  const words = Math.max(1, (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length);
  const per100 = (n: number) => (n / words) * 100;
  const lower = t.toLowerCase();

  const technical =
    count(/```/g, t) * 4 +
    count(/`[^`\n]+`/g, t) * 1.5 +
    count(/\b(?:function|const|npm|git|api|json|sql|http|config|cli|server|database|deploy|endpoint|null|true|false|install|version|error|query|cache|stack trace|regex|docker|kubernetes)\b/gi, t) * 0.8 +
    count(/^\s{0,3}(?:\$|>)\s/gm, t) * 2 +
    count(/\b\w+\(\)|\w+\.\w+\(|--[a-z][\w-]+/g, t) * 1.5;

  const casual =
    (/^\s*(?:hey|hi|hiya|yo|hello)\b[^\n]{0,30}[,!.\n]/i.test(t) && !/^\s*(?:hi|hello)\s+[A-Z][\w-]+,\s*\n/.test(t) ? 3 : 0) +
    count(/\b(?:lol|haha|omg|btw|tbh|gonna|wanna|kinda|yeah|yep|nope|cool|awesome|guys|mate|dude|catch up|hang out|miss you|how have you been|how are you|what's up|whats up)\b/gi, lower) * 1.5 +
    count(/\b(?:i|i'm|i've|i'd|i'll|me|my)\b/gi, t) * 0.25 +
    count(/\b\w+(?:'|’)(?:s|re|ve|ll|d|t|m)\b/gi, t) * 0.3 +
    count(/\?/g, t) * 0.6 +
    (words < 80 ? 1 : 0);

  const professional =
    (/^\s*(?:dear|hi|hello)\s+[^\n,]{1,40},\s*$/im.test(t) ? 2.5 : 0) +
    (/^\s*(?:best|regards|kind regards|best regards|thanks|many thanks|sincerely|cheers),?\s*$/im.test(t) ? 2.5 : 0) +
    (/^subject:/im.test(t) ? 3 : 0) +
    count(/\b(?:meeting|invoice|quote|contract|client|customer|team|schedule|deadline|proposal|refund|order|account|review|budget|attached|policy|please)\b/gi, t) * 0.6 +
    1; // the default when nothing stands out

  const marketing =
    count(/\b(?:new|now|free|today|introducing|launch(?:ed|ing)?|meet|discover|get|try|join|save|shop|book|sign up|start|download|upgrade|limited|exclusive|offer)\b/gi, t) * 0.5 +
    count(/#\w+/g, t) * 1.5 +
    count(/\p{Extended_Pictographic}/gu, t) * 1 +
    count(/\byour\b/gi, t) * 0.3 +
    count(/!/g, t) * 0.4;

  // Normalise by length so a long post doesn't win on raw counts alone.
  const scale = 100 / Math.max(words, 60);
  const scores: Record<Register, number> = {
    technical: technical * scale * 1.2,
    casual: casual * scale * 1.6,
    professional: professional * scale * 1.4,
    marketing: marketing * scale,
  };
  const ranked = (Object.entries(scores) as [Register, number][]).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  const margin = best[1] - (second?.[1] ?? 0);
  const confidence = Math.max(0, Math.min(1, margin / Math.max(best[1], 1)));
  void per100;
  return { register: confidence < 0.1 ? 'professional' : best[0], confidence: Math.round(confidence * 100) / 100, scores };
}
