// The tells MCP server: JSON-RPC handling and the three tools, shared by the remote server
// (POST /mcp on the tells API, Streamable HTTP, stateless) and `tells mcp` (stdio).
import { lint } from './lint.ts';
import { plainRule } from './plain.ts';
import { REGISTERS, type LintResult, type Register } from './types.ts';

export const MCP_VERSION = '0.5.0';
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export const MCP_INSTRUCTIONS = 'tells finds the habits that make writing read as AI-written (stock openers, "not X, it\'s Y", chatbot sign-offs, words chatbots overuse) and the human signals a text lacks. Call check_text on a draft before showing it to the user, then fix what it reports yourself or call fix_text. A marked phrase is not proof that AI wrote the text; never use tells to accuse a person. Report the verdict as given: zero warnings does not mean the text sounds human, so check the human-pattern score too (under 17 reads machine-like).';

const registerProp = { type: 'string', enum: ['auto', ...REGISTERS], description: 'Kind of writing. auto (default) guesses from the text.' };

export const MCP_TOOLS = [
  {
    name: 'check_text',
    title: 'Check text for AI tells',
    description: 'Check a piece of writing for the phrases that make it read as AI-written. Returns each flagged phrase with its position, why it stands out and what to write instead, plus a short verdict. Runs without a model, so it is fast and free.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'The text to check.' }, register: registerProp }, required: ['text'], additionalProperties: false },
    annotations: { title: 'Check text for AI tells', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'fix_text',
    title: 'Fix the flagged sentences',
    description: 'Rewrite only the sentences check_text flags, keeping every fact and adding none. Where a detail is needed and missing, the result has a [placeholder] for the user to fill in. Pass a voice profile from build_voice to rewrite the draft in that person\'s style. Uses a model, with a small free daily allowance.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'The draft to fix.' }, register: registerProp, voice: { type: 'object', description: 'Optional voice profile returned by build_voice.' }, polish: { type: 'boolean', description: 'With voice: standard capitals and apostrophes.' } }, required: ['text'], additionalProperties: false },
    annotations: { title: 'Fix the flagged sentences', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'build_voice',
    title: 'Learn a writing style',
    description: 'Learn one person\'s writing style from samples they wrote themselves (at least 5 samples and about 600 words; 10 or more and 1,500 words work better). Returns a voice profile to pass to fix_text. Nothing is stored.',
    inputSchema: { type: 'object', properties: { samples: { type: 'array', items: { type: 'string' }, description: 'Separate pieces of the person\'s own writing.' }, name: { type: 'string', description: 'Optional label for the profile.' } }, required: ['samples'], additionalProperties: false },
    annotations: { title: 'Learn a writing style', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

/** What the tools need from the host: the remote server applies its rate limits here. */
export interface McpBackend {
  check(text: string, register: Register | 'auto' | undefined): Promise<LintResult> | LintResult;
  fix(args: { text: string; register?: Register | 'auto'; voice?: unknown; polish?: boolean }): Promise<Record<string, unknown>>;
  buildVoice(samples: string[], name?: string): Promise<Record<string, unknown>> | Record<string, unknown>;
}

export class ToolError extends Error {}

/** A check result in the shape assistants find easiest to use. */
export function checkReport(text: string, r: LintResult) {
  const findings = r.findings.map((f) => {
    const p = plainRule(f.ruleId);
    return { phrase: f.match, start: f.start, end: f.end, line: f.line, habit: p.name, rule: f.ruleId, severity: f.severity, why: p.why, suggestion: f.fix };
  });
  const strong = findings.filter((f) => f.severity !== 'info');
  const kinds = new Set(strong.map((f) => f.rule)).size;
  const verdict = kinds ? `${kinds} ${kinds === 1 ? 'habit gives' : 'habits give'} this away.` : r.human.pattern?.low && !r.human.tooShort ? `Reads as AI-written overall: the rhythm and word choice are machine-like (human-pattern score ${r.human.pattern.score} of 100), though no single phrase is a clear giveaway. Do not tell the user this sounds human.` : findings.length ? 'Mostly reads like a person; only small hints.' : 'Nothing reads as AI-written.';
  return {
    verdict,
    words: r.words,
    register: r.register,
    humanPatternScore: r.human.pattern ? r.human.pattern.score : null,
    findings,
    humanSignalsPresent: r.human.present.map((p) => p.name),
    humanSignalsMissing: r.human.missing.map((m) => ({ name: m.name, add: m.add })),
    note: 'A flagged phrase is not proof that AI wrote the text.',
  };
}

function summary(rep: ReturnType<typeof checkReport>): string {
  const lines = [rep.verdict];
  for (const f of rep.findings) lines.push(`- ${f.severity === 'info' ? '(hint) ' : ''}"${f.phrase.replace(/\s+/g, ' ').slice(0, 80)}": ${f.habit}. ${f.why} Try: ${f.suggestion}`);
  if (rep.humanSignalsMissing.length) lines.push(`Missing human signals: ${rep.humanSignalsMissing.map((m) => `${m.name} (${m.add})`).join('; ')}`);
  return lines.join('\n');
}

const str = (v: unknown, name: string) => {
  if (typeof v !== 'string' || !v.trim()) throw new ToolError(`"${name}" must be a non-empty string.`);
  return v;
};
const reg = (v: unknown): Register | 'auto' | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  if (v === 'auto' || REGISTERS.includes(v as Register)) return v as Register | 'auto';
  throw new ToolError(`"register" must be auto or one of ${REGISTERS.join(', ')}.`);
};

export async function callTool(name: string, args: Record<string, unknown>, backend: McpBackend) {
  if (name === 'check_text') {
    const text = str(args.text, 'text');
    const rep = checkReport(text, await backend.check(text, reg(args.register)));
    return { content: [{ type: 'text', text: summary(rep) }], structuredContent: rep };
  }
  if (name === 'fix_text') {
    const text = str(args.text, 'text');
    const r = await backend.fix({ text, register: reg(args.register), voice: args.voice ?? undefined, polish: args.polish === true });
    const changes = (r.changes as { before: string; after: string }[] | undefined) ?? [];
    const out = {
      text: r.text,
      changed: changes.map((c) => ({ before: c.before, after: c.after })),
      placeholders: ((r.suggestions as { placeholder: string }[] | undefined) ?? []).map((s) => s.placeholder),
      ...(r.voice ? { styleMatch: { before: (r.voice as { before: { score: number } }).before.score, after: (r.voice as { after: { score: number } }).after.score } } : {}),
      ...(r.kept ? { note: String(r.kept) } : {}),
    };
    const head = changes.length ? `Changed ${changes.length} ${changes.length === 1 ? 'sentence' : 'sentences'}.` : r.voice ? 'Rewritten in the voice.' : 'Nothing needed changing.';
    return { content: [{ type: 'text', text: `${head}${out.placeholders.length ? ` Fill in: ${out.placeholders.join(', ')}.` : ''}\n\n${r.text}` }], structuredContent: out };
  }
  if (name === 'build_voice') {
    const samples = Array.isArray(args.samples) ? args.samples.filter((x): x is string => typeof x === 'string') : [];
    if (!samples.length) throw new ToolError('"samples" must be an array of strings.');
    const v = await backend.buildVoice(samples, typeof args.name === 'string' ? args.name.slice(0, 80) : undefined);
    const lines = Array.isArray(v.summary) ? (v.summary as string[]) : [];
    return { content: [{ type: 'text', text: `Learned a voice from ${v.samples} samples and ${v.words} words. Pass the profile in structuredContent.voice to fix_text as "voice".\n${lines.map((l) => `- ${l}`).join('\n')}\n\n${JSON.stringify(v)}` }], structuredContent: { voice: v } };
  }
  return null;
}

interface RpcMessage { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

const rpcError = (id: RpcMessage['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** Handle one JSON-RPC message. Returns the response, or null for a notification. */
export async function handleMcpMessage(msg: RpcMessage, backend: McpBackend): Promise<object | null> {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return msg && typeof msg === 'object' && 'id' in msg && !('method' in msg) ? null : rpcError(msg?.id, -32600, 'Invalid request.');
  }
  const isNote = msg.id === undefined || msg.id === null;
  const id = msg.id;
  try {
    switch (msg.method) {
      case 'initialize': {
        const asked = String(msg.params?.protocolVersion ?? '');
        return { jsonrpc: '2.0', id, result: {
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'tells', title: 'tells', version: MCP_VERSION, websiteUrl: 'https://tells.nexugen.app' },
          instructions: MCP_INSTRUCTIONS,
        } };
      }
      case 'ping': return isNote ? null : { jsonrpc: '2.0', id, result: {} };
      case 'tools/list': return { jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } };
      case 'tools/call': {
        const name = String(msg.params?.name ?? '');
        const args = (msg.params?.arguments && typeof msg.params.arguments === 'object' ? msg.params.arguments : {}) as Record<string, unknown>;
        try {
          const res = await callTool(name, args, backend);
          if (!res) return rpcError(id, -32602, `Unknown tool: ${name}`);
          return { jsonrpc: '2.0', id, result: res };
        } catch (err) {
          // Tool failures go back as a result the model can read, not as a protocol error.
          return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: (err as Error).message }], isError: true } };
        }
      }
      case 'resources/list': return { jsonrpc: '2.0', id, result: { resources: [] } };
      case 'prompts/list': return { jsonrpc: '2.0', id, result: { prompts: [] } };
      default:
        if (isNote) return null;
        return rpcError(id, -32601, `Method not found: ${msg.method}`);
    }
  } catch (err) {
    return isNote ? null : rpcError(id, -32603, (err as Error).message);
  }
}

/** Local backend: checks and voice on this machine. Fix is supplied by the caller. */
export function localBackend(fix: McpBackend['fix'], buildVoice: McpBackend['buildVoice']): McpBackend {
  return { check: (text, register) => lint(text, { register }), fix, buildVoice };
}
