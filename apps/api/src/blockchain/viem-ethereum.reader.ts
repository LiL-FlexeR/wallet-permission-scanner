import { normalizeAddress } from '@wps/contracts';
import type { EthereumAddress } from '@wps/contracts';
import type { BoundedRpc } from './bounded-rpc.js';
import { erc20ReadAbi } from './erc20.abi.js';
import { failure, success } from './ethereum-reader.js';
import type {
  EthereumReader,
  EthereumRead,
  ReadInput,
  ReadResult,
  Snapshot,
  TokenRead,
} from './ethereum-reader.js';
import { decimals, metadata, uint256 } from './quantities.js';
import { normalizeRpcError, ReaderFailure } from './rpc-errors.js';
import { RPC_LIMITS } from './work-budget.js';
import type { WorkBudget } from './work-budget.js';

type Client = ReturnType<BoundedRpc['client']>;

export class ViemEthereumReader implements EthereumReader {
  private readonly active = new Map<WorkBudget, Promise<void>>();
  private activeScans = 0;
  private stopped = false;
  constructor(private readonly rpc: BoundedRpc) {}

  private async preflight(
    client: Client,
    context: WorkBudget,
  ): Promise<Snapshot> {
    const cancelled = () => context.signal.aborted || context.remaining() <= 0;
    try {
      context.check();
      if ((await client.getChainId()) !== 1)
        throw new ReaderFailure('CHAIN_MISMATCH');
    } catch (error) {
      if (error instanceof ReaderFailure) throw error;
      throw new ReaderFailure(
        cancelled()
          ? context.remaining() <= 0
            ? 'SCAN_TIMEOUT'
            : 'CANCELLED'
          : 'RPC_UNAVAILABLE',
      );
    }
    try {
      const block = await client.getBlock({
        blockTag: 'finalized',
        includeTransactions: false,
      });
      context.check();
      const now = BigInt(Math.floor(context.clock.unixMs() / 1000));
      if (
        typeof block.number !== 'bigint' ||
        block.number < 0n ||
        typeof block.timestamp !== 'bigint' ||
        typeof block.hash !== 'string' ||
        !/^0x[0-9a-f]{64}$/i.test(block.hash) ||
        now - block.timestamp > 1800n ||
        block.timestamp - now > 60n
      )
        throw new ReaderFailure('SNAPSHOT_UNAVAILABLE');
      return Object.freeze({
        blockNumber: block.number,
        blockHash: block.hash,
        blockTimestamp: block.timestamp,
        finality: 'finalized',
      });
    } catch (error) {
      if (error instanceof ReaderFailure) throw error;
      if (cancelled())
        throw new ReaderFailure(
          context.remaining() <= 0 ? 'SCAN_TIMEOUT' : 'CANCELLED',
        );
      const fault = normalizeRpcError(error);
      throw new ReaderFailure(
        fault.code === 'RPC_UNAVAILABLE' ||
          fault.code === 'RPC_TIMEOUT' ||
          fault.code === 'PROVIDER_RATE_LIMITED'
          ? 'RPC_UNAVAILABLE'
          : 'SNAPSHOT_UNAVAILABLE',
      );
    }
  }

  async probe(parent: WorkBudget): Promise<void> {
    if (this.stopped) throw new ReaderFailure('SERVICE_NOT_READY');
    const context = parent.child(RPC_LIMITS.probeMs);
    const finish = this.track(context);
    try {
      await this.preflight(this.rpc.client(context, false), context);
    } finally {
      context.dispose();
      finish();
    }
  }

  async read({
    owner: input,
    registry,
    context: parent,
  }: ReadInput): Promise<EthereumRead> {
    const owner = normalizeAddress(input);
    if (this.stopped) throw new ReaderFailure('SERVICE_NOT_READY');
    // Probe is independent of scan admission. Stage 03 also guards HTTP admission.
    if (this.activeScans >= RPC_LIMITS.scans)
      throw new ReaderFailure('SCAN_CAPACITY_EXCEEDED');
    const context = parent.child(RPC_LIMITS.scanMs);
    const finish = this.track(context);
    this.activeScans++;
    try {
      if (parent.signal.aborted)
        throw new ReaderFailure(
          parent.remaining() <= 0 ? 'SCAN_TIMEOUT' : 'CANCELLED',
        );
      const client = this.rpc.client(context, true);
      const snapshot = await this.preflight(client, context);
      const tokens: { -readonly [K in keyof TokenRead]: TokenRead[K] }[] = [
        ...new Map(
          registry.pairs.map((p) => [
            p.token.address.toLowerCase(),
            p.token.address,
          ]),
        ).values(),
      ]
        .sort()
        .map((address) => ({
          address,
          balance: failure('DEADLINE_EXCEEDED'),
          name: failure('DEADLINE_EXCEEDED'),
          symbol: failure('DEADLINE_EXCEEDED'),
          decimals: failure('DEADLINE_EXCEEDED'),
        }));
      const pairs = registry.pairs.map((pair) => ({
        pairId: pair.id,
        tokenAddress: pair.token.address,
        spenderAddress: pair.spender.address,
        allowance: failure('DEADLINE_EXCEEDED') as ReadResult<bigint>,
      }));
      const read = async <T>(
        action: () => Promise<unknown>,
        validate: (v: unknown) => T,
      ): Promise<ReadResult<T>> => {
        try {
          context.check();
          return success(validate(await action()));
        } catch (error) {
          return failure(
            context.signal.aborted
              ? 'DEADLINE_EXCEEDED'
              : normalizeRpcError(error).code,
          );
        }
      };
      const amount = (address: EthereumAddress, spender?: EthereumAddress) =>
        read(
          () =>
            spender
              ? client.readContract({
                  address,
                  abi: erc20ReadAbi,
                  functionName: 'allowance',
                  args: [owner, spender],
                  blockNumber: snapshot.blockNumber,
                })
              : client.readContract({
                  address,
                  abi: erc20ReadAbi,
                  functionName: 'balanceOf',
                  args: [owner],
                  blockNumber: snapshot.blockNumber,
                }),
          uint256,
        );
      // Bounded workers, with a barrier before optional metadata. No promise per queued read.
      await this.run(
        [
          ...pairs.map((pair) => async () => {
            pair.allowance = await amount(
              pair.tokenAddress,
              pair.spenderAddress,
            );
          }),
          ...tokens.map((token) => async () => {
            token.balance = await amount(token.address);
          }),
        ],
        context,
      );
      await this.run(
        tokens.flatMap((token) => [
          async () => {
            token.name = await read(
              () =>
                client.readContract({
                  address: token.address,
                  abi: erc20ReadAbi,
                  functionName: 'name',
                  blockNumber: snapshot.blockNumber,
                }),
              (v) => metadata(v, 120),
            );
          },
          async () => {
            token.symbol = await read(
              () =>
                client.readContract({
                  address: token.address,
                  abi: erc20ReadAbi,
                  functionName: 'symbol',
                  blockNumber: snapshot.blockNumber,
                }),
              (v) => metadata(v, 32),
            );
          },
          async () => {
            token.decimals = await read(
              () =>
                client.readContract({
                  address: token.address,
                  abi: erc20ReadAbi,
                  functionName: 'decimals',
                  blockNumber: snapshot.blockNumber,
                }),
              decimals,
            );
          },
        ]),
        context,
      );
      return Object.freeze({
        source: 'live',
        owner,
        registryVersion: registry.registryVersion,
        snapshot,
        tokens: Object.freeze(tokens.map((t) => Object.freeze(t))),
        pairs: Object.freeze(pairs.map((p) => Object.freeze(p))),
      });
    } finally {
      context.dispose();
      finish();
      this.activeScans--;
    }
  }

  private async run(
    tasks: (() => Promise<void>)[],
    context: WorkBudget,
  ): Promise<void> {
    let next = 0;
    await Promise.all(
      Array.from(
        { length: Math.min(RPC_LIMITS.scanReads, tasks.length) },
        async () => {
          while (
            next < tasks.length &&
            !context.signal.aborted &&
            context.remaining() > 0
          ) {
            const task = tasks[next++];
            await task?.();
          }
        },
      ),
    );
  }

  private track(context: WorkBudget): () => void {
    let finish!: () => void;
    this.active.set(
      context,
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    return () => {
      this.active.delete(context);
      finish();
    };
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    for (const context of this.active.keys()) context.controller.abort();
    await Promise.all(this.active.values());
  }
}
