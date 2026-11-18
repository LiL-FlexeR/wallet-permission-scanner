import { pathToFileURL } from 'node:url';
import { validateApiEnvironment } from '../config/environment.js';
import { mainnetRegistry } from '../registry/mainnet.registry.js';
import { BoundedRpc } from './bounded-rpc.js';
import { ReaderFailure, RpcFault } from './rpc-errors.js';
import { ViemEthereumReader } from './viem-ethereum.reader.js';
import { RPC_LIMITS, WorkBudget } from './work-budget.js';

/** Separately invoked deployment/read verification; never creates an approval. */
export async function runLiveSmoke(rpc: BoundedRpc, context: WorkBudget) {
  const reader = new ViemEthereumReader(rpc);
  try {
    // Public, synthetic owner; positive allowance or token balance is not required.
    const result = await reader.read({
      owner: `0x${'3'.repeat(40)}`,
      registry: mainnetRegistry,
      context,
    });
    const addresses = [
      ...new Set(
        mainnetRegistry.pairs.flatMap((p) => [
          p.token.address,
          p.spender.address,
        ]),
      ),
    ];
    const client = rpc.client(context, true);
    // Sequential, pinned bytecode checks share the same global permits and total budget.
    for (const address of addresses) {
      const code = await client.getCode({
        address,
        blockNumber: result.snapshot.blockNumber,
      });
      if (!code || code === '0x') throw new ReaderFailure('SERVICE_NOT_READY');
    }
    if (
      result.pairs.some((p) => !p.allowance.ok) ||
      result.tokens.some((t) => !t.balance.ok)
    )
      throw new ReaderFailure('RPC_UNAVAILABLE');
    return {
      status: 'passed',
      source: 'live',
      registryVersion: result.registryVersion,
      blockNumber: result.snapshot.blockNumber.toString(),
      blockHash: result.snapshot.blockHash,
      deploymentAddresses: addresses.length,
      allowanceReads: result.pairs.length,
      tokenReads: result.tokens.length,
      metadataFailures: result.tokens.reduce(
        (n, t) =>
          n +
          Number(!t.name.ok) +
          Number(!t.symbol.ok) +
          Number(!t.decimals.ok),
        0,
      ),
    };
  } finally {
    await reader.onModuleDestroy();
  }
}

async function main() {
  // Do not silently use the example's demo setting for an explicitly requested live check.
  const env = validateApiEnvironment({ ...process.env, SCAN_MODE: 'live' });
  const context = new WorkBudget(RPC_LIMITS.scanMs);
  try {
    console.log(
      JSON.stringify(
        await runLiveSmoke(new BoundedRpc(env.ETHEREUM_RPC_URL!), context),
      ),
    );
  } finally {
    context.dispose();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        status: 'failed',
        code:
          error instanceof ReaderFailure || error instanceof RpcFault
            ? error.code
            : 'LIVE_SMOKE_FAILED',
      }),
    );
    process.exitCode = 1;
  });
}
