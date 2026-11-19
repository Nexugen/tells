import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { lint } from '../lint.ts';
import { rewrite } from '../rewrite.ts';
import { rulesAsJson } from '../serialize.ts';
import { readFileSync } from 'node:fs';
import { anthropic, claudeCli, ANTHROPIC_PRICES, DEFAULT_ANTHROPIC_MODEL, ModelError, type Model } from '../model.ts';
import { landingPage, SITE } from './page.ts';
import { USE_CASES, useCasePage, sitemapXml, robotsTxt } from './use-cases.ts';
import { BADGE_SVG } from './badge.ts';
import { REGISTERS, type Register, type Severity } from '../types.ts';
import { Store } from './store.ts';
import { buildVoice, checkVoice, styleMatch, type VoiceProfile } from '../voice.ts';

/** Largest voice profile accepted inline, in characters of JSON. */
const VOICE_MAX_CHARS = 40_000;
/** Largest set of samples accepted by POST /v1/voice, in characters. */
const SAMPLES_MAX_CHARS = 60_000;

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  /** Rewrites per key per UTC day. */
  keyDailyRewrites: number;
  /** Hard cap on model spend per UTC day for the whole server, in US dollars. */
  dailySpendUsd: number;
  rewriteMaxChars: number;
  lintMaxChars: number;
  keysPerIpPerDay: number;
  lintPerIpPerMinute: number;
  /** Read the client IP from X-Real-IP / X-Forwarded-For. Only behind a proxy you run. */
  trustProxy: boolean;
  rewriteOff: boolean;
  model: string;
  /** 'anthropic' (API key) or 'cli' (the claude CLI and its login). */
  backend: 'anthropic' | 'cli';
  cliConfigDir?: string;
  /** Model calls per UTC day for the whole server. */
  dailyCalls: number;
  /** Rewrites per address per day without a key, for the try-it box. */
  anonRewritesPerIp: number;
  /** Optional JSON file shaped like {"claude":{"pct":N}}; rewrite pauses at or above usageMaxPct. */
  usageFile?: string;
  usageMaxPct: number;
}

export function configFromEnv(env = process.env): ServerConfig {
  const num = (k: string, d: number) => (env[k] !== undefined && env[k] !== '' ? Number(env[k]) : d);
  return {
    port: num('TELLS_PORT', 3891),
    host: env.TELLS_HOST ?? '127.0.0.1',
    dataDir: env.TELLS_DATA_DIR ?? env.STATE_DIRECTORY ?? '.tells-api-data',
    keyDailyRewrites: num('TELLS_KEY_DAILY_REWRITES', 25),
    dailySpendUsd: num('TELLS_DAILY_SPEND_USD', 2),
    rewriteMaxChars: num('TELLS_REWRITE_MAX_CHARS', 8000),
    lintMaxChars: num('TELLS_LINT_MAX_CHARS', 200_000),
    keysPerIpPerDay: num('TELLS_KEYS_PER_IP_PER_DAY', 3),
    lintPerIpPerMinute: num('TELLS_LINT_PER_IP_PER_MINUTE', 120),
    trustProxy: env.TELLS_TRUST_PROXY === '1',
    rewriteOff: env.TELLS_REWRITE_OFF === '1',
    backend: env.TELLS_MODEL_BACKEND === 'cli' ? 'cli' : 'anthropic',
    model: env.TELLS_MODEL ?? (env.TELLS_MODEL_BACKEND === 'cli' ? 'haiku' : DEFAULT_ANTHROPIC_MODEL),
    cliConfigDir: env.TELLS_CLI_CONFIG_DIR || undefined,
    dailyCalls: num('TELLS_DAILY_CALLS', 300),
    anonRewritesPerIp: num('TELLS_ANON_REWRITES_PER_IP', 3),
    usageFile: env.TELLS_USAGE_FILE || undefined,
    usageMaxPct: num('TELLS_USAGE_MAX_PCT', 85),
  };
}

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Worst-case cost of one rewrite, used to reserve budget before calling the model. */
export function estimateCostUsd(chars: number, model: string): number {
  const alias: Record<string, string> = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' };
  const price = ANTHROPIC_PRICES[alias[model] ?? model] ?? ANTHROPIC_PRICES['claude-opus-5-5'];
  const inputTokens = 2500 + chars / 2; // system prompt and examples, plus generous context
  const outputTokens = Math.min(8000, 600 + chars) + 2000; // the edits, plus thinking
  return (inputTokens * price.input + outputTokens * price.output) / 1e6;
}

export function createApp(cfg: ServerConfig, deps: { model?: Model; store?: Store } = {}): Server {
  const store = deps.store ?? new Store(cfg.dataDir);
  const model = deps.model ?? (cfg.backend === 'cli' ? claudeCli({ model: cfg.model, configDir: cfg.cliConfigDir }) : anthropic({ model: cfg.model }));
  const pageOpts = { rewriteOn: !cfg.rewriteOff, anonTries: cfg.anonRewritesPerIp, keyDaily: cfg.keyDailyRewrites };
  const page = landingPage(pageOpts);
  /** Server-rendered HTML pages by path: the home page and one page per kind of writing. */
  const pages = new Map<string, string>([['/', page], ...USE_CASES.map((u): [string, string] => [u.path, useCasePage(u, pageOpts)])]);
  const textFiles = new Map<string, { type: string; body: string }>([
    ['/sitemap.xml', { type: 'application/xml; charset=utf-8', body: sitemapXml(SITE) }],
    ['/robots.txt', { type: 'text/plain; charset=utf-8', body: robotsTxt(SITE) }],
  ]);

  /** True when the shared model account is busy enough that rewrites should wait. */
  const accountBusy = () => {
    if (!cfg.usageFile) return false;
    try {
      const pct = Number((JSON.parse(readFileSync(cfg.usageFile, 'utf8')) as { claude?: { pct?: unknown } }).claude?.pct);
      return !Number.isFinite(pct) || pct >= cfg.usageMaxPct;
    } catch {
      return true; // cannot tell, so do not risk it
    }
  };
  const lintHits = new Map<string, { at: number; n: number }>();

  const clientIp = (req: IncomingMessage) => {
    if (cfg.trustProxy) {
      const real = req.headers['x-real-ip'];
      if (typeof real === 'string' && real) return real;
      const fwd = req.headers['x-forwarded-for'];
      if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
    }
    return req.socket.remoteAddress ?? 'unknown';
  };

  const limitLint = (ip: string) => {
    const now = Date.now();
    const cur = lintHits.get(ip);
    if (!cur || now - cur.at > 60_000) lintHits.set(ip, { at: now, n: 1 });
    else if (++cur.n > cfg.lintPerIpPerMinute) throw new HttpError(429, 'slow_down', 'Too many requests from this address. Try again in a minute, or run tells locally with npx @nexugen/tells.');
    if (lintHits.size > 50_000) lintHits.clear();
  };

  const body = async (req: IncomingMessage, max: number): Promise<Record<string, unknown>> => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > max * 4 + 4096) throw new HttpError(413, 'too_large', 'Request body is too large.');
      chunks.push(chunk as Buffer);
    }
    try {
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not an object');
      return data as Record<string, unknown>;
    } catch {
      throw new HttpError(400, 'bad_json', 'Send a JSON object, for example {"text": "..."}.');
    }
  };

  const textFrom = (data: Record<string, unknown>, max: number) => {
    if (typeof data.text !== 'string' || !data.text.trim()) throw new HttpError(400, 'missing_text', 'Send the text to check as "text".');
    if (data.text.length > max) throw new HttpError(413, 'too_long', `Text is limited to ${max} characters here.`);
    return data.text;
  };

  const registerFrom = (data: Record<string, unknown>): Register | 'auto' | undefined => {
    if (data.register === undefined) return undefined;
    if (data.register === 'auto') return 'auto';
    if (!REGISTERS.includes(data.register as Register)) throw new HttpError(400, 'bad_register', `register must be auto or one of ${REGISTERS.join(', ')}.`);
    return data.register as Register;
  };

  const voiceFrom = (data: Record<string, unknown>): VoiceProfile | undefined => {
    if (data.voice === undefined || data.voice === null) return undefined;
    if (JSON.stringify(data.voice).length > VOICE_MAX_CHARS) throw new HttpError(413, 'voice_too_large', `A voice profile is limited to ${VOICE_MAX_CHARS} characters here.`);
    try {
      checkVoice(data.voice);
    } catch (err) {
      throw new HttpError(400, 'bad_voice', (err as Error).message);
    }
    return data.voice;
  };

  const keyFrom = (req: IncomingMessage) => {
    const auth = req.headers.authorization ?? '';
    const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!key) throw new HttpError(401, 'missing_key', 'Rewrite needs a free key. POST /v1/keys to get one, then send it as "Authorization: Bearer <key>".');
    if (!store.hasKey(key)) throw new HttpError(401, 'bad_key', 'That key is not valid.');
    return key;
  };

  const routes: Record<string, (req: IncomingMessage) => Promise<unknown>> = {
    'GET /v1': async () => ({
      name: 'tells',
      about: 'Finds the habits that make text read as AI-written and the human patterns it lacks. Lint is free with no key. Rewrite gives a few free tries a day, more with a free key.',
      source: 'https://github.com/Nexugen/tells',
      endpoints: ['GET /', ...USE_CASES.map((u) => `GET ${u.path}`), 'GET /sitemap.xml', 'GET /robots.txt', 'GET /badge.svg', 'POST /v1/lint', 'POST /v1/voice', 'POST /v1/voice/match', 'POST /v1/keys', 'POST /v1/rewrite', 'GET /v1/usage', 'GET /v1/rules', 'GET /health'],
      voice: 'POST /v1/voice with {"samples": [...]} returns a voice profile; nothing is stored. Pass it back as "voice" to /v1/rewrite or /v1/voice/match.',
    }),
    'GET /health': async () => ({ ok: true, rewrite: !cfg.rewriteOff }),
    'GET /v1/rules': async () => rulesAsJson(),
    'POST /v1/lint': async (req) => {
      limitLint(clientIp(req));
      const data = await body(req, cfg.lintMaxChars);
      const text = textFrom(data, cfg.lintMaxChars);
      const disable = Array.isArray(data.disable) ? data.disable.filter((x): x is string => typeof x === 'string') : undefined;
      return lint(text, { register: registerFrom(data), disable, plain: data.plain === true });
    },
    // Builds a profile from the samples in the request and returns it. The samples are not stored or logged.
    'POST /v1/voice': async (req) => {
      limitLint(clientIp(req));
      const data = await body(req, SAMPLES_MAX_CHARS);
      const samples = Array.isArray(data.samples) ? data.samples.filter((x): x is string => typeof x === 'string') : [];
      if (!samples.length) throw new HttpError(400, 'missing_samples', 'Send samples of one person\'s writing as "samples", an array of strings.');
      if (samples.length > 200) throw new HttpError(413, 'too_many', 'Up to 200 samples.');
      if (samples.reduce((a, s) => a + s.length, 0) > SAMPLES_MAX_CHARS) throw new HttpError(413, 'too_long', `Samples are limited to ${SAMPLES_MAX_CHARS} characters in all here.`);
      try {
        return buildVoice(samples, { name: typeof data.name === 'string' ? data.name.slice(0, 80) : undefined });
      } catch (err) {
        throw new HttpError(400, 'not_enough', (err as Error).message);
      }
    },
    'POST /v1/voice/match': async (req) => {
      limitLint(clientIp(req));
      const data = await body(req, cfg.lintMaxChars + VOICE_MAX_CHARS);
      const voice = voiceFrom(data);
      if (!voice) throw new HttpError(400, 'missing_voice', 'Send the profile from POST /v1/voice as "voice".');
      return styleMatch(textFrom(data, cfg.lintMaxChars), voice, { polish: data.polish === true });
    },
    'POST /v1/keys': async (req) => {
      const ip = clientIp(req);
      if (store.keysIssuedToday(ip) >= cfg.keysPerIpPerDay) throw new HttpError(429, 'key_limit', 'This address already has its free keys for today.');
      const key = store.issueKey(ip);
      return { key, dailyRewrites: cfg.keyDailyRewrites, note: 'Keep this key. It is shown once and stored only as a hash.' };
    },
    'GET /v1/usage': async (req) => {
      const key = keyFrom(req);
      const used = store.rewritesToday(key);
      return { rewritesToday: used, dailyRewrites: cfg.keyDailyRewrites, remaining: Math.max(0, cfg.keyDailyRewrites - used) };
    },
    'POST /v1/rewrite': async (req) => {
      if (cfg.rewriteOff) throw new HttpError(503, 'rewrite_off', 'Free rewrites are switched off right now. Lint still works.');
      const ip = clientIp(req);
      const key = req.headers.authorization ? keyFrom(req) : undefined;
      if (key && store.rewritesToday(key) >= cfg.keyDailyRewrites) throw new HttpError(429, 'key_daily_cap', `This key has used its ${cfg.keyDailyRewrites} free rewrites for today (UTC).`);
      if (!key && store.anonRewritesToday(ip) >= cfg.anonRewritesPerIp) throw new HttpError(429, 'try_limit', `You've used today's free tries. A free key gives you ${cfg.keyDailyRewrites} rewrites a day.`);
      const data = await body(req, cfg.rewriteMaxChars + VOICE_MAX_CHARS);
      const text = textFrom(data, cfg.rewriteMaxChars);
      const register = registerFrom(data);
      const minSeverity = ['error', 'warning', 'info'].includes(String(data.minSeverity)) ? (data.minSeverity as Severity) : undefined;
      const voice = voiceFrom(data);
      const polish = data.polish === true;

      const before = lint(text, { register });
      if (!voice && before.findings.length === 0 && before.human.missing.length === 0) return { text, changes: [], suggestions: [], before, after: before, model: null, costUsd: 0 };

      if (accountBusy()) throw new HttpError(503, 'busy', 'Rewrite is busy, try later. Lint still works.');
      if (store.callsToday() + (voice ? 4 : 2) > cfg.dailyCalls) throw new HttpError(503, 'global_daily_cap', 'Free rewrites are used up for today (UTC). Lint still works.');
      // A voice rewrite sends the profile and rewrites the whole draft: up to two whole-draft calls and two span calls.
      const estimate = voice ? estimateCostUsd(text.length + 6000, cfg.model) * 4 : estimateCostUsd(text.length, cfg.model) * 2;
      const { spendUsd, reservedUsd } = store.spendToday();
      if (spendUsd + reservedUsd + estimate > cfg.dailySpendUsd) throw new HttpError(503, 'global_daily_cap', 'Free rewrites are used up for today (UTC). Lint still works.');
      store.reserve(estimate);
      let settled = false;
      try {
        const res = await rewrite(text, { register, minSeverity, model, voice, polish });
        store.settle(estimate, res.costUsd || estimate, { key, ip: key ? undefined : ip, calls: res.calls });
        settled = true;
        return { text: res.text, changes: res.changes, suggestions: res.suggestions, rejected: res.rejected.length, before: res.before, after: res.after, model: res.model, costUsd: Math.round(res.costUsd * 1e6) / 1e6, ...(res.voice ? { voice: res.voice, kept: res.rejected.length && res.text === text ? 'unchanged: the rewrite did not keep every fact' : undefined } : {}) };
      } catch (err) {
        if (err instanceof ModelError) {
          process.stderr.write(`tells-api: model error: ${err.message.slice(0, 200)}\n`);
          throw new HttpError(502, 'model_error', 'The rewrite model failed. Try again shortly.');
        }
        throw err;
      } finally {
        if (!settled) store.settle(estimate, 0, { calls: 1 });
      }
    },
  };

  const send = (res: ServerResponse, status: number, payload: unknown) => {
    const json = status === 204 ? '' : JSON.stringify(payload);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(json);
  };

  return createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (req.method === 'OPTIONS') return send(res, 204, null);
    const isGet = req.method === 'GET' || req.method === 'HEAD';
    if (isGet && path.length > 1 && path.endsWith('/') && pages.has(path.replace(/\/+$/, ''))) {
      res.writeHead(301, { location: path.replace(/\/+$/, '') });
      return void res.end();
    }
    const file = isGet ? textFiles.get(path) : undefined;
    if (file) {
      res.writeHead(200, { 'content-type': file.type, 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' });
      return void res.end(req.method === 'HEAD' ? undefined : file.body);
    }
    const html = isGet ? pages.get(path) : undefined;
    if (html !== undefined) {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=300',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      });
      return void res.end(req.method === 'HEAD' ? undefined : html);
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && path === '/badge.svg') {
      res.writeHead(200, {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=86400',
        'access-control-allow-origin': '*',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      });
      return void res.end(req.method === 'HEAD' ? undefined : BADGE_SVG);
    }
    const route = routes[`${req.method} ${path}`];
    try {
      if (!route) throw new HttpError(404, 'not_found', 'No such endpoint. GET / lists them.');
      send(res, 200, await route(req));
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: { code: err.code, message: err.message } });
      process.stderr.write(`tells-api: ${(err as Error).stack ?? err}\n`);
      send(res, 500, { error: { code: 'internal', message: 'Something went wrong on our side.' } });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cfg = configFromEnv();
  const store = new Store(cfg.dataDir);
  const server = createApp(cfg, { store });
  server.listen(cfg.port, cfg.host, () => {
    process.stdout.write(`tells-api listening on http://${cfg.host}:${cfg.port} (rewrite ${cfg.rewriteOff ? 'off' : `on, ${cfg.backend}:${cfg.model}, ${cfg.dailyCalls} calls a day`})\n`);
  });
  const stop = () => {
    store.flush();
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
