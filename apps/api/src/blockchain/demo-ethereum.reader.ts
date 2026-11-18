import { normalizeAddress } from '@wps/contracts';
import { validateRegistry } from '../registry/registry.js';
import { failure, success } from './ethereum-reader.js';
import type {
  EthereumReader,
  EthereumRead,
  ReadInput,
} from './ethereum-reader.js';
import { MAX_UINT256 } from './quantities.js';
import { ReaderFailure } from './rpc-errors.js';

const synthetic = (address: string) => ({
  address,
  identity: 'unverified',
  label: null,
  identitySourceUrl: null,
  identityReviewedAt: null,
});
const tokenA = synthetic(`0x${'1'.repeat(40)}`);
const tokenB = synthetic(`0x${'4'.repeat(40)}`);
const spenderA = synthetic(`0x${'2'.repeat(40)}`);
const spenderB = synthetic(`0x${'5'.repeat(40)}`);
export const demoRegistry = validateRegistry({
  registryVersion: 'demo-1',
  chainId: 1,
  limitation:
    'Synthetic fixtures only; these addresses do not represent reviewed deployments.',
  pairs: [
    { token: tokenA, spender: spenderA },
    { token: tokenA, spender: spenderB },
    { token: tokenB, spender: spenderB },
  ],
});
export type DemoScenario =
  | 'success'
  | 'zero'
  | 'active'
  | 'metadata-failure'
  | 'partial'
  | 'provider-failure';

/** Internal Stage 02 fixtures, not a live fallback or a public demo scan endpoint. */
export class DemoEthereumReader implements EthereumReader {
  constructor(private readonly scenario: DemoScenario = 'success') {}
  async probe(): Promise<void> {
    /* Demo readiness needs no RPC. */
  }
  async read({
    owner: input,
    registry,
    context,
  }: ReadInput): Promise<EthereumRead> {
    const owner = normalizeAddress(input);
    if (context.signal.aborted || context.remaining() <= 0)
      throw new ReaderFailure(
        context.remaining() <= 0 ? 'SCAN_TIMEOUT' : 'CANCELLED',
      );
    if (registry !== demoRegistry) throw new ReaderFailure('SERVICE_NOT_READY');
    if (this.scenario === 'provider-failure')
      throw new ReaderFailure('RPC_UNAVAILABLE');
    const tokens = [...new Set(registry.pairs.map((p) => p.token.address))].map(
      (address, index) =>
        Object.freeze({
          address,
          balance: success(index === 0 ? 0n : 10_000_000n),
          name: success(`Synthetic Token ${index + 1}`),
          symbol: success(`DEMO${index + 1}`),
          decimals:
            this.scenario === 'metadata-failure'
              ? failure('CONTRACT_REVERT')
              : success(index === 0 ? 0 : 255),
        }),
    );
    const pairs = registry.pairs.map((p, index) =>
      Object.freeze({
        pairId: p.id,
        tokenAddress: p.token.address,
        spenderAddress: p.spender.address,
        allowance:
          this.scenario === 'partial' && index === 1
            ? failure('RPC_UNAVAILABLE')
            : success(
                this.scenario === 'zero'
                  ? 0n
                  : index === 0
                    ? MAX_UINT256
                    : index === 1
                      ? 0n
                      : 200_000_000n,
              ),
      }),
    );
    return Object.freeze({
      source: 'demo',
      owner,
      registryVersion: registry.registryVersion,
      snapshot: Object.freeze({
        blockNumber: 24_000_000n,
        blockHash: `0x${'a'.repeat(64)}` as const,
        blockTimestamp: 1_795_003_200n,
        finality: 'finalized',
      }),
      tokens: Object.freeze(tokens),
      pairs: Object.freeze(pairs),
    });
  }
}
