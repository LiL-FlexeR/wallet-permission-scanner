import type { ScanMode } from './blockchain.module.js';
import type { EthereumReader } from './ethereum-reader.js';
import { RPC_LIMITS, systemClock, WorkBudget } from './work-budget.js';
import type { Clock } from './work-budget.js';

export class BlockchainReadiness {
  private lastSuccess: number | null = null;
  private current: Promise<void> | null = null;
  private budget: WorkBudget | null = null;
  private cancelTimer?: () => void;
  private stopped = false;
  constructor(
    private readonly mode: ScanMode,
    private readonly reader: EthereumReader,
    private readonly clock: Clock = systemClock,
  ) {}

  get status(): 'not_required' | 'ok' | 'unavailable' {
    if (this.stopped) return 'unavailable';
    if (this.mode === 'demo') return 'not_required';
    return this.lastSuccess !== null &&
      this.clock.now() - this.lastSuccess <= RPC_LIMITS.probeFreshMs
      ? 'ok'
      : 'unavailable';
  }
  onModuleInit(): void {
    if (this.mode === 'demo') return;
    const tick = () => {
      if (this.stopped) return;
      void this.refresh();
      this.cancelTimer = this.clock.timer(tick, RPC_LIMITS.probeIntervalMs);
    };
    tick();
  }
  /** Lifecycle/testing entry; HTTP health handlers only read status. */
  refresh(): Promise<void> {
    if (this.current) return this.current;
    if (this.stopped || this.mode === 'demo') return Promise.resolve();
    const budget = new WorkBudget(RPC_LIMITS.probeMs, this.clock);
    this.budget = budget;
    this.current = (async () => {
      try {
        await this.reader.probe(budget);
        budget.check();
        if (!this.stopped) this.lastSuccess = this.clock.now();
      } catch {
        this.lastSuccess = null;
      } finally {
        budget.dispose();
        this.budget = null;
        this.current = null;
      }
    })();
    return this.current;
  }
  whenIdle(): Promise<void> {
    return this.current ?? Promise.resolve();
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.cancelTimer?.();
    this.budget?.controller.abort();
    await this.current;
  }
}
