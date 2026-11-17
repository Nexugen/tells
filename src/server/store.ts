import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** One UTC day of usage. Keys and IPs are stored only as hashes. */
interface Day {
  spendUsd: number;
  reservedUsd: number;
  rewrites: Record<string, number>;
  keysIssued: Record<string, number>;
}

interface State {
  version: 1;
  keys: Record<string, { createdAt: string }>;
  days: Record<string, Day>;
}

export const hash = (s: string) => createHash('sha256').update(s).digest('hex');

export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * A small JSON file store. One process owns it, so an in-memory copy plus an atomic write
 * after each change is enough. Old days are dropped after a week.
 */
export class Store {
  private state: State;
  private file: string;
  private timer: NodeJS.Timeout | undefined;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.file = join(dir, 'state.json');
    this.state = existsSync(this.file)
      ? (JSON.parse(readFileSync(this.file, 'utf8')) as State)
      : { version: 1, keys: {}, days: {} };
  }

  private day(d = today()): Day {
    const existing = this.state.days[d];
    if (existing) return existing;
    const fresh: Day = { spendUsd: 0, reservedUsd: 0, rewrites: {}, keysIssued: {} };
    this.state.days[d] = fresh;
    const keep = Object.keys(this.state.days).sort().slice(-7);
    for (const k of Object.keys(this.state.days)) if (!keep.includes(k)) delete this.state.days[k];
    return fresh;
  }

  private save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 200);
  }

  flush() {
    clearTimeout(this.timer);
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  keysIssuedToday(ip: string): number {
    return this.day().keysIssued[hash(ip)] ?? 0;
  }

  issueKey(ip: string): string {
    const key = `tells_${randomBytes(20).toString('hex')}`;
    this.state.keys[hash(key)] = { createdAt: new Date().toISOString() };
    const d = this.day();
    const ipHash = hash(ip);
    d.keysIssued[ipHash] = (d.keysIssued[ipHash] ?? 0) + 1;
    this.save();
    return key;
  }

  hasKey(key: string): boolean {
    return Boolean(this.state.keys[hash(key)]);
  }

  rewritesToday(key: string): number {
    return this.day().rewrites[hash(key)] ?? 0;
  }

  spendToday(): { spendUsd: number; reservedUsd: number } {
    const d = this.day();
    return { spendUsd: d.spendUsd, reservedUsd: d.reservedUsd };
  }

  /** Hold back an estimated cost before a call, so parallel calls cannot overshoot the cap. */
  reserve(usd: number) {
    this.day().reservedUsd += usd;
  }

  /** Swap the reservation for the real cost. `key` is set only when the rewrite succeeded. */
  settle(reservedUsd: number, actualUsd: number, key?: string) {
    const d = this.day();
    d.reservedUsd = Math.max(0, d.reservedUsd - reservedUsd);
    d.spendUsd += actualUsd;
    if (key) d.rewrites[hash(key)] = (d.rewrites[hash(key)] ?? 0) + 1;
    this.save();
  }
}
