import { isIP } from 'node:net';
import type { Request } from 'express';
import { systemClock } from '../../blockchain/work-budget.js';
import type { Clock } from '../../blockchain/work-budget.js';
import { ApiError } from './errors.js';

export const HTTP_LIMITS = Object.freeze({
  scans: 10,
  coverage: 60,
  windowMs: 60_000,
  idleMs: 120_000,
  ips: 10_000,
});
export type LimitedRoute = 'scans' | 'coverage';
interface Window {
  count: number;
  resetsAt: number;
}
interface Entry {
  seenAt: number;
  scans: Window;
  coverage: Window;
}
function canonicalIp(value: string | undefined): string | null {
  if (!value || value.length > 64 || !isIP(value)) return null;
  if (isIP(value) === 4) return value;
  let normalized: string;
  try {
    normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
  if (!mapped) return normalized;
  const high = Number.parseInt(mapped[1]!, 16),
    low = Number.parseInt(mapped[2]!, 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}
/** Express walks XFF through configured CIDRs. Invalid identity uses the peer bucket. */
export function clientIp(request: Request): string {
  return (
    canonicalIp(request.ip) ??
    canonicalIp(request.socket.remoteAddress) ??
    'unknown-peer'
  );
}
/** Independent fixed windows start on first use; IP entries are ordered by activity. */
export class RouteRateLimiter {
  private readonly entries = new Map<string, Entry>();
  private cancelTimer: (() => void) | undefined;
  constructor(
    private readonly clock: Pick<Clock, 'now' | 'timer'> = systemClock,
  ) {}
  private schedule(): void {
    if (this.cancelTimer || !this.entries.size) return;
    const first = this.entries.values().next().value!;
    this.cancelTimer = this.clock.timer(
      () => {
        this.cancelTimer = undefined;
        this.expire(this.clock.now());
        this.schedule();
      },
      Math.max(0, first.seenAt + HTTP_LIMITS.idleMs - this.clock.now()),
    );
  }
  onModuleDestroy(): void {
    this.cancelTimer?.();
    this.cancelTimer = undefined;
    this.entries.clear();
  }
  get size(): number {
    this.expire(this.clock.now());
    return this.entries.size;
  }
  private expire(now: number) {
    for (const [key, entry] of this.entries) {
      if (now - entry.seenAt < HTTP_LIMITS.idleMs) break;
      this.entries.delete(key);
    }
  }
  consume(ip: string, route: LimitedRoute): void {
    const now = this.clock.now();
    this.expire(now);
    let entry = this.entries.get(ip);
    if (!entry) {
      if (this.entries.size >= HTTP_LIMITS.ips)
        throw new ApiError('SCAN_CAPACITY_EXCEEDED');
      entry = {
        seenAt: now,
        scans: { count: 0, resetsAt: 0 },
        coverage: { count: 0, resetsAt: 0 },
      };
    }
    entry.seenAt = now;
    this.entries.delete(ip);
    this.entries.set(ip, entry);
    this.schedule();
    const window = entry[route];
    if (now >= window.resetsAt) {
      window.count = 0;
      window.resetsAt = now + HTTP_LIMITS.windowMs;
    }
    if (window.count >= HTTP_LIMITS[route])
      throw new ApiError(
        'RATE_LIMITED',
        Math.ceil((window.resetsAt - now) / 1000),
      );
    window.count++;
  }
}
