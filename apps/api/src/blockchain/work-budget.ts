import { RpcFault } from './rpc-errors.js';

export const RPC_LIMITS = Object.freeze({
  scanMs: 15_000,
  attemptMs: 3_000,
  scanReads: 4,
  scans: 4,
  globalCalls: 16,
  responseBytes: 1_048_576,
  probeMs: 6_000,
  probeIntervalMs: 30_000,
  probeFreshMs: 60_000,
});
export interface Clock {
  now(): number;
  unixMs(): number;
  random(): number;
  timer(callback: () => void, ms: number): () => void;
}
export const systemClock: Clock = {
  now: () => performance.now(),
  unixMs: () => Date.now(),
  random: () => Math.random(),
  timer(callback, ms) {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
};

/** Shared monotonic admission deadline. A child can shorten, never extend, it. */
export class WorkBudget {
  readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  readonly deadlineAt: number;
  private readonly cleanups: (() => void)[] = [];
  constructor(
    ms: number,
    readonly clock: Clock = systemClock,
    parent?: WorkBudget | AbortSignal,
  ) {
    if (!Number.isFinite(ms) || ms <= 0) throw new Error('INVALID_BUDGET');
    this.deadlineAt = Math.min(
      clock.now() + ms,
      parent instanceof WorkBudget ? parent.deadlineAt : Infinity,
    );
    const signal = parent instanceof WorkBudget ? parent.signal : parent;
    if (signal) {
      const abort = () => this.controller.abort(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      this.cleanups.push(() => signal.removeEventListener('abort', abort));
      if (signal.aborted) abort();
    }
    this.cleanups.push(
      clock.timer(
        () => this.controller.abort(new RpcFault('DEADLINE_EXCEEDED')),
        this.remaining(),
      ),
    );
  }
  remaining(): number {
    return Math.max(0, this.deadlineAt - this.clock.now());
  }
  check(): void {
    if (this.remaining() <= 0 && !this.signal.aborted)
      this.controller.abort(new RpcFault('DEADLINE_EXCEEDED'));
    if (this.signal.aborted) throw new RpcFault('DEADLINE_EXCEEDED');
  }
  child(ms: number): WorkBudget {
    return new WorkBudget(ms, this.clock, this);
  }
  dispose(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }
  async sleep(ms: number): Promise<void> {
    this.check();
    if (ms >= this.remaining()) throw new RpcFault('DEADLINE_EXCEEDED');
    await new Promise<void>((resolve, reject) => {
      const cancelTimer = this.clock.timer(done, ms);
      const signal = this.signal;
      function cleanup() {
        cancelTimer();
        signal.removeEventListener('abort', abort);
      }
      function done() {
        cleanup();
        resolve();
      }
      function abort() {
        cleanup();
        reject(new RpcFault('DEADLINE_EXCEEDED'));
      }
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    this.check();
  }
}

/** FIFO RPC permit coordination only; no queue of scans or background jobs. */
export class RpcPermits {
  private active = 0;
  private readonly waiting: {
    signal: AbortSignal;
    grant: () => void;
    abort: () => void;
  }[] = [];
  get inFlight(): number {
    return this.active;
  }
  get pending(): number {
    return this.waiting.length;
  }
  async acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) throw new RpcFault('DEADLINE_EXCEEDED');
    if (this.active < RPC_LIMITS.globalCalls) this.active++;
    else {
      if (this.waiting.length >= RPC_LIMITS.globalCalls)
        throw new RpcFault('RPC_UNAVAILABLE');
      await new Promise<void>((resolve, reject) => {
        const entry = {
          signal,
          grant: () => {
            signal.removeEventListener('abort', entry.abort);
            resolve();
          },
          abort: () => {
            const index = this.waiting.indexOf(entry);
            if (index >= 0) this.waiting.splice(index, 1);
            signal.removeEventListener('abort', entry.abort);
            reject(new RpcFault('DEADLINE_EXCEEDED'));
          },
        };
        this.waiting.push(entry);
        signal.addEventListener('abort', entry.abort, { once: true });
      });
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) next.grant();
      else this.active--;
    };
  }
}
