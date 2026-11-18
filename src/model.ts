/** The only thing `rewrite` needs from a model: take a system prompt and a user prompt, return text. */
export interface Model {
  /** Shown in output and logs, for example "anthropic:claude-haiku-5-5". */
  name: string;
  complete(req: ModelRequest): Promise<ModelResponse>;
}

export interface ModelRequest {
  system: string;
  prompt: string;
  maxTokens: number;
}

export interface ModelResponse {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
  /** Estimated cost of this call in US dollars, when the adapter knows the price. */
  costUsd?: number;
}

export class ModelError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = 'ModelError';
    this.retryable = retryable;
  }
}

/** Dollars per million tokens, input and output, for cost estimates and spend caps. */
export const ANTHROPIC_PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-5-5';

export interface AnthropicOptions {
  /** Defaults to the ANTHROPIC_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to TELLS_MODEL, then claude-haiku-5-5 (cheap and fast, which is all a span rewrite needs). */
  model?: string;
  /** Reasoning effort. Low is plenty for rewriting a few sentences. */
  effort?: 'low' | 'medium' | 'high';
  baseURL?: string;
  timeoutMs?: number;
}

/**
 * The default model adapter. It uses the official Anthropic SDK, which is an optional peer
 * dependency: `npm install @anthropic-ai/sdk` to use it. Linting never loads it.
 */
export function anthropic(options: AnthropicOptions = {}): Model {
  const model = options.model ?? process.env.TELLS_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  let clientPromise: Promise<AnthropicClient> | undefined;

  const getClient = () => {
    clientPromise ??= (async () => {
      const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new ModelError('ANTHROPIC_API_KEY is not set. Set it, or pass a different model to rewrite().');
      let mod: { default: new (o: Record<string, unknown>) => AnthropicClient };
      try {
        mod = (await import('@anthropic-ai/sdk')) as unknown as typeof mod;
      } catch {
        throw new ModelError('The rewrite step needs the Anthropic SDK: npm install @anthropic-ai/sdk');
      }
      return new mod.default({ apiKey, baseURL: options.baseURL, timeout: options.timeoutMs ?? 60_000, maxRetries: 2 });
    })();
    return clientPromise;
  };

  return {
    name: `anthropic:${model}`,
    async complete(req) {
      const client = await getClient();
      let res: AnthropicMessage;
      try {
        res = await client.messages.create({
          model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: [{ role: 'user', content: req.prompt }],
          output_config: { effort: options.effort ?? 'low' },
        });
      } catch (err) {
        const status = (err as { status?: number }).status;
        const retryable = status === 429 || (status !== undefined && status >= 500);
        throw new ModelError(`Anthropic request failed${status ? ` (${status})` : ''}: ${(err as Error).message}`, retryable);
      }
      if (res.stop_reason === 'refusal') throw new ModelError('The model declined to rewrite this text.');
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
      const usage = { inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0 };
      const price = ANTHROPIC_PRICES[model];
      const costUsd = price ? (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1e6 : undefined;
      return { text, usage, costUsd };
    },
  };
}

// Just the parts of the SDK surface used here, so the package builds without the SDK installed.
interface AnthropicClient {
  messages: { create(body: Record<string, unknown>): Promise<AnthropicMessage> };
}
interface AnthropicMessage {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
  usage?: { input_tokens: number; output_tokens: number };
}

/** Wrap any function as a model, for tests or other providers. */
export function fromFunction(name: string, fn: (req: ModelRequest) => Promise<string | ModelResponse>): Model {
  return {
    name,
    async complete(req) {
      const out = await fn(req);
      return typeof out === 'string' ? { text: out } : out;
    },
  };
}

export interface ClaudeCliOptions {
  /** Model alias or id passed to --model. Default "haiku". */
  model?: string;
  /** Path to the claude binary. Default "claude" on PATH. */
  bin?: string;
  /** Account folder for the CLI's login (CLAUDE_CONFIG_DIR). */
  configDir?: string;
  timeoutMs?: number;
}

/**
 * Claude Code's print mode as a plain completion: no tools, no settings, no MCP servers,
 * nothing saved, JSON out. It uses whatever login the CLI has in `configDir`. The child gets
 * a minimal environment, so an API key in this process is never picked up by mistake.
 */
export function claudeCli(options: ClaudeCliOptions = {}): Model {
  const model = options.model ?? 'haiku';
  return {
    name: `claude-cli:${model}`,
    async complete(req) {
      const { spawn } = await import('node:child_process');
      const { mkdtempSync, rmSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const cwd = mkdtempSync(join(tmpdir(), 'tells-cli-'));
      const env: Record<string, string> = { PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin', HOME: process.env.HOME ?? cwd, LANG: 'C.UTF-8' };
      if (options.configDir) env.CLAUDE_CONFIG_DIR = options.configDir;
      const args = [
        '-p', '--output-format', 'json', '--model', model,
        '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands', '--setting-sources', '',
        '--system-prompt', req.system,
      ];
      try {
        const stdout = await new Promise<string>((resolve, reject) => {
          const child = spawn(options.bin ?? 'claude', args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
          let out = '';
          let err = '';
          const timer = setTimeout(() => {
            child.kill('SIGTERM');
            reject(new ModelError('The rewrite model timed out.', true));
          }, options.timeoutMs ?? 120_000);
          child.stdout.on('data', (d) => (out += d));
          child.stderr.on('data', (d) => (err += d));
          child.on('error', (e) => {
            clearTimeout(timer);
            reject(new ModelError(`Could not start the claude CLI: ${e.message}`));
          });
          child.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) resolve(out);
            else {
              // The CLI prints its JSON result even on failure. Report only the message, never the raw output.
              let why = err.trim().slice(0, 300);
              try {
                const j = JSON.parse(out) as { result?: unknown };
                if (typeof j.result === 'string') why = j.result.slice(0, 300);
              } catch {
                // not JSON
              }
              reject(new ModelError(`claude CLI exited with ${code}${why ? `: ${why}` : ''}`, true));
            }
          });
          child.stdin.end(req.prompt);
        });
        let j: { result?: string; is_error?: boolean; total_cost_usd?: number; usage?: { input_tokens?: number; output_tokens?: number } };
        try {
          j = JSON.parse(stdout);
        } catch {
          throw new ModelError('The claude CLI did not return JSON.', true);
        }
        if (j.is_error || typeof j.result !== 'string') throw new ModelError(`The claude CLI reported an error: ${String(j.result ?? '').slice(0, 300)}`, true);
        return {
          text: j.result,
          costUsd: j.total_cost_usd,
          usage: { inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 },
        };
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
  };
}
