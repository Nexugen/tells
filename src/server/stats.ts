// Aggregate traffic and usage counts, one JSON file per UTC day. Nothing personal is kept:
// no text, no addresses, no user agents, no full URLs. A visitor is counted once a day through a
// hash of address and user agent with a salt that lives only in memory and changes every UTC day,
// so the same person cannot be linked from one day to the next, or at all once the day is over.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface StatsDay {
  date: string;
  /** Page views by known path. */
  views: Record<string, number>;
  /** Unique visitors that day (daily salted hash, see above). */
  visitors: number;
  /** Visitors by device class. */
  devices: Record<string, number>;
  /** Page views by referring domain, 'direct' or 'internal'. */
  referrers: Record<string, number>;
  /** Page views by utm_source. */
  utm: Record<string, number>;
  /** Page requests from crawlers and scripts, kept apart from views. */
  bots: number;
  /** Product events: check_site, check_api, check_mcp, fix_site, voice_build and so on. */
  events: Record<string, number>;
  /** Failed fix calls by error code. */
  fixFails: Record<string, number>;
  /** MCP tool calls by tool name. */
  mcp: Record<string, number>;
  /** Per UTC hour, 0 to 23. */
  hours: { views: number[]; visitors: number[]; checks: number[]; fixes: number[] };
}

/** Distinct keys per counter per day; any more go under 'other'. */
const MAX_KEYS = 200;
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|undici|headless|lighthouse|pingdom|uptime|monitor|scan/i;
const MOBILE_UA = /mobile|iphone|ipod|android.*mobile|windows phone/i;
const TABLET_UA = /ipad|tablet|android(?!.*mobile)/i;
const MCP_TOOLS = new Set(['check_text', 'fix_text', 'build_voice']);
/** Events the page itself may report through POST /v1/event. */
export const PAGE_EVENTS = new Set(['pwa_install']);

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function emptyDay(date: string): StatsDay {
  const z = () => new Array<number>(24).fill(0);
  return { date, views: {}, visitors: 0, devices: {}, referrers: {}, utm: {}, bots: 0, events: {}, fixFails: {}, mcp: {}, hours: { views: z(), visitors: z(), checks: z(), fixes: z() } };
}

const bump = (rec: Record<string, number>, key: string, n = 1) => {
  if (!(key in rec) && Object.keys(rec).length >= MAX_KEYS) key = 'other';
  rec[key] = (rec[key] ?? 0) + n;
};

export function deviceClass(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (MOBILE_UA.test(ua)) return 'mobile';
  if (TABLET_UA.test(ua)) return 'tablet';
  return 'desktop';
}

export const isBot = (ua: string) => !ua || BOT_UA.test(ua);

/** The referring site as a bare domain, grouped where one site has many hosts. */
export function referrerDomain(referer: string | undefined, ownHost: string): string {
  if (!referer) return 'direct';
  let host: string;
  try {
    host = new URL(referer).hostname.toLowerCase().replace(/^www\.|^m\.|^l\.|^lm\./, '');
  } catch {
    return 'other';
  }
  if (!host) return 'direct';
  if (host === ownHost) return 'internal';
  if (/^google\.[a-z.]+$/.test(host) || host === 'com.google.android.googlequicksearchbox') return 'google';
  if (host === 'x.com' || host === 'twitter.com' || host === 't.co') return 'x.com';
  if (host.endsWith('.linkedin.com') || host === 'com.linkedin.android') return 'linkedin.com';
  if (host.endsWith('.reddit.com') || host === 'old.reddit.com') return 'reddit.com';
  if (/^[a-z0-9.-]{1,80}$/.test(host)) return host;
  return 'other';
}

/** A utm_source value, reduced to a short safe token. */
export function utmSource(query: string): string | undefined {
  const v = new URLSearchParams(query).get('utm_source');
  if (!v) return undefined;
  const t = v.trim().toLowerCase();
  return /^[a-z0-9._-]{1,40}$/.test(t) ? t : 'other';
}

export class Stats {
  private dir: string;
  private day: StatsDay;
  private salt: Buffer;
  private seen = new Set<string>();
  private dirty = false;
  private timer: NodeJS.Timeout;
  private now: () => Date;
  readonly ownHost: string;

  constructor(dir: string, opts: { now?: () => Date; ownHost?: string; flushMs?: number } = {}) {
    this.dir = dir;
    this.now = opts.now ?? (() => new Date());
    this.ownHost = opts.ownHost ?? 'tells.nexugen.app';
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.day = this.load(utcDay(this.now())) ?? emptyDay(utcDay(this.now()));
    this.salt = randomBytes(32);
    this.timer = setInterval(() => this.flush(), opts.flushMs ?? 60_000);
    this.timer.unref();
  }

  private load(date: string): StatsDay | undefined {
    const file = join(this.dir, `${date}.json`);
    if (!existsSync(file)) return undefined;
    try {
      return { ...emptyDay(date), ...(JSON.parse(readFileSync(file, 'utf8')) as StatsDay) };
    } catch {
      return undefined;
    }
  }

  /** Today's record, rolling over (and forgetting the salt and the day's hashes) at UTC midnight. */
  private current(): StatsDay {
    const d = utcDay(this.now());
    if (d !== this.day.date) {
      this.flush();
      this.day = this.load(d) ?? emptyDay(d);
      this.salt = randomBytes(32);
      this.seen.clear();
    }
    return this.day;
  }

  private hour() {
    return this.now().getUTCHours();
  }

  /** The salt in use today. Exposed for tests only; it is never written anywhere. */
  saltForTest(): string {
    this.current();
    return this.salt.toString('hex');
  }

  /** One page view. ip and ua are used for the daily hash only and then dropped. */
  view(p: { path: string; query: string; referer?: string; ip: string; ua: string }) {
    const day = this.current();
    if (isBot(p.ua)) {
      day.bots++;
      this.dirty = true;
      return;
    }
    const h = this.hour();
    bump(day.views, p.path);
    day.hours.views[h]++;
    bump(day.referrers, referrerDomain(p.referer, this.ownHost));
    const utm = utmSource(p.query);
    if (utm) bump(day.utm, utm);
    if (new URLSearchParams(p.query).get('source') === 'app') bump(day.events, 'app_open');
    const id = createHash('sha256').update(this.salt).update(p.ip).update('\n').update(p.ua).digest('base64url').slice(0, 22);
    if (!this.seen.has(id)) {
      if (this.seen.size < 500_000) this.seen.add(id);
      day.visitors++;
      day.hours.visitors[h]++;
      bump(day.devices, deviceClass(p.ua));
    }
    this.dirty = true;
  }

  event(name: string, n = 1) {
    const day = this.current();
    bump(day.events, name, n);
    if (name.startsWith('check_')) day.hours.checks[this.hour()] += n;
    if (name.startsWith('fix_')) day.hours.fixes[this.hour()] += n;
    this.dirty = true;
  }

  fixFailed(code: string) {
    bump(this.current().fixFails, /^[a-z_]{1,40}$/.test(code) ? code : 'other');
    this.dirty = true;
  }

  mcpTool(name: string) {
    bump(this.current().mcp, MCP_TOOLS.has(name) ? name : 'unknown');
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    const file = join(this.dir, `${this.day.date}.json`);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.day), { mode: 0o600 });
    renameSync(tmp, file);
    this.dirty = false;
  }

  close() {
    clearInterval(this.timer);
    this.flush();
  }

  /** The last n UTC days, newest first; today comes from memory. */
  days(n: number): StatsDay[] {
    const today = this.current();
    const out = [structuredClone(today)];
    const t = Date.parse(`${today.date}T00:00:00Z`);
    for (let i = 1; i < n; i++) {
      const d = utcDay(new Date(t - i * 86_400_000));
      out.push(this.load(d) ?? emptyDay(d));
    }
    return out;
  }
}

/** Several days added together. Visitors are a sum of daily counts: people are not followed across days. */
export function sumDays(days: StatsDay[]): Omit<StatsDay, 'date' | 'hours'> & { from: string; to: string } {
  const add = (a: Record<string, number>, b: Record<string, number>) => { for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v; };
  const out = { from: days[days.length - 1]?.date ?? '', to: days[0]?.date ?? '', views: {}, visitors: 0, devices: {}, referrers: {}, utm: {}, bots: 0, events: {}, fixFails: {}, mcp: {} };
  for (const d of days) {
    out.visitors += d.visitors;
    out.bots += d.bots;
    for (const k of ['views', 'devices', 'referrers', 'utm', 'events', 'fixFails', 'mcp'] as const) add(out[k], d[k]);
  }
  return out;
}

const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const RATE_LIMITED = new Set(['try_limit', 'key_daily_cap', 'slow_down', 'key_limit']);
const BUSY = new Set(['busy', 'global_daily_cap', 'rewrite_off']);

/** The headline numbers for one period, as the dashboard and /stats.json show them. */
export function summary(days: StatsDay[]) {
  const s = sumDays(days);
  const e = (k: string) => s.events[k] ?? 0;
  const fails = Object.entries(s.fixFails);
  return {
    from: s.from,
    to: s.to,
    visitors: s.visitors,
    pageViews: total(s.views),
    pages: s.views,
    referrers: s.referrers,
    utmSources: s.utm,
    devices: s.devices,
    bots: s.bots,
    checks: { site: e('check_site'), api: e('check_api'), mcp: e('check_mcp'), extension: e('check_extension'), total: e('check_site') + e('check_api') + e('check_mcp') + e('check_extension') },
    fixes: {
      ok: { site: e('fix_site'), api: e('fix_api'), mcp: e('fix_mcp'), extension: e('fix_extension') },
      total: e('fix_site') + e('fix_api') + e('fix_mcp') + e('fix_extension'),
      busy: fails.filter(([k]) => BUSY.has(k)).reduce((a, [, v]) => a + v, 0),
      rateLimited: fails.filter(([k]) => RATE_LIMITED.has(k)).reduce((a, [, v]) => a + v, 0),
      otherFailed: fails.filter(([k]) => !BUSY.has(k) && !RATE_LIMITED.has(k)).reduce((a, [, v]) => a + v, 0),
      failuresByCode: s.fixFails,
    },
    voice: { builds: e('voice_build'), rewrites: e('voice_rewrite'), matches: e('voice_match') },
    mcp: { tools: s.mcp, connects: e('mcp_initialize') },
    shareTarget: e('share'),
    pwaInstalls: e('pwa_install'),
    appOpens: e('app_open'),
    keysIssued: e('key_issued'),
  };
}

export function statsJson(stats: Stats) {
  const d = stats.days(30);
  const today = d[0];
  return {
    generatedAt: new Date().toISOString(),
    note: 'Aggregate counts per UTC day. Visitors over several days are a sum of daily counts, since nobody is followed across days. A restart during the day can count a returning visitor again.',
    today: summary([today]),
    yesterday: summary([d[1]]),
    last7: summary(d.slice(0, 7)),
    last30: summary(d),
    todayByHour: today.hours,
  };
}
