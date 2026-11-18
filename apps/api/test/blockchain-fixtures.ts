import type { Clock } from '../src/blockchain/work-budget.js';
import type { Fetch } from '../src/blockchain/bounded-rpc.js';

export async function flush(): Promise<void> {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
export class FakeClock implements Clock {
  time = 0;
  epoch = Date.parse('2026-11-18T12:00:00Z');
  randomValue = 0.5;
  private next = 0;
  private readonly timers = new Map<
    number,
    { at: number; callback: () => void }
  >();
  now = () => this.time;
  unixMs = () => this.epoch + this.time;
  random = () => this.randomValue;
  timer = (callback: () => void, ms: number) => {
    const id = ++this.next;
    this.timers.set(id, { at: this.time + ms, callback });
    return () => {
      this.timers.delete(id);
    };
  };
  get timerCount(): number {
    return this.timers.size;
  }
  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    await flush();
    for (;;) {
      const next = [...this.timers.entries()]
        .filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
      await flush();
    }
    this.time = end;
    await flush();
  }
}
export interface RpcRequest {
  id: number;
  method: string;
  params: unknown[];
}
export function rpcFetch(
  handler: (
    request: RpcRequest,
    init: RequestInit,
  ) => unknown | Promise<unknown>,
): Fetch {
  return async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as RpcRequest;
    const value = await handler(request, init ?? {});
    return value instanceof Response
      ? value
      : Response.json({ jsonrpc: '2.0', id: request.id, result: value });
  };
}
export function hangingFetch(onAbort?: () => void): Fetch {
  return (_url, init) =>
    new Promise((_resolve, reject) => {
      const abort = () => {
        onAbort?.();
        reject(new Error('credential-bearing provider error'));
      };
      init?.signal?.addEventListener('abort', abort, { once: true });
      if (init?.signal?.aborted) abort();
    });
}
export const blockHash = `0x${'a'.repeat(64)}` as const;
export const owner = '0x3333333333333333333333333333333333333333';
export function block(clock: Clock) {
  return {
    number: '0x16e3600',
    hash: blockHash,
    timestamp: `0x${(BigInt(Math.floor(clock.unixMs() / 1000)) - 720n).toString(16)}`,
    transactions: [],
  };
}
