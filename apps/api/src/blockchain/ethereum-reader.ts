import type { EthereumAddress } from '@wps/contracts';
import type { Registry } from '../registry/registry.js';
import type { FieldErrorCode } from './rpc-errors.js';
import type { WorkBudget } from './work-budget.js';

export const ETHEREUM_READER = Symbol('EthereumReader');
export type ReadResult<T> = Readonly<
  { ok: true; value: T } | { ok: false; code: FieldErrorCode }
>;
export const success = <T>(value: T): ReadResult<T> =>
  Object.freeze({ ok: true, value });
export const failure = (code: FieldErrorCode): ReadResult<never> =>
  Object.freeze({ ok: false, code });
export interface Snapshot {
  readonly blockNumber: bigint;
  readonly blockHash: `0x${string}`;
  readonly blockTimestamp: bigint;
  readonly finality: 'finalized';
}
export interface TokenRead {
  readonly address: EthereumAddress;
  readonly balance: ReadResult<bigint>;
  readonly name: ReadResult<string>;
  readonly symbol: ReadResult<string>;
  readonly decimals: ReadResult<number>;
}
export interface PairRead {
  readonly pairId: string;
  readonly tokenAddress: EthereumAddress;
  readonly spenderAddress: EthereumAddress;
  readonly allowance: ReadResult<bigint>;
}
export interface EthereumRead {
  readonly source: 'live' | 'demo';
  readonly owner: EthereumAddress;
  readonly registryVersion: string;
  readonly snapshot: Snapshot;
  readonly tokens: readonly TokenRead[];
  readonly pairs: readonly PairRead[];
}
export interface ReadInput {
  readonly owner: string;
  readonly registry: Registry;
  /** Create at admission. Reader caps remaining work at 15 seconds. Caller disposes. */
  readonly context: WorkBudget;
}
export interface EthereumReader {
  read(input: ReadInput): Promise<EthereumRead>;
  /** Readiness uses preflight only, with no retries. */
  probe(context: WorkBudget): Promise<void>;
}
