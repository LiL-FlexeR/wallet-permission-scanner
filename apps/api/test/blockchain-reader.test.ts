import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
} from 'viem';
import { BoundedRpc } from '../src/blockchain/bounded-rpc.js';
import {
  DemoEthereumReader,
  demoRegistry,
} from '../src/blockchain/demo-ethereum.reader.js';
import { erc20ReadAbi } from '../src/blockchain/erc20.abi.js';
import { MAX_UINT256 } from '../src/blockchain/quantities.js';
import { ReaderFailure } from '../src/blockchain/rpc-errors.js';
import { ViemEthereumReader } from '../src/blockchain/viem-ethereum.reader.js';
import { WorkBudget } from '../src/blockchain/work-budget.js';
import { mainnetRegistry } from '../src/registry/mainnet.registry.js';
import { validateRegistry } from '../src/registry/registry.js';
import {
  block,
  blockHash,
  FakeClock,
  flush,
  hangingFetch,
  owner,
  rpcFetch,
} from './blockchain-fixtures.js';
import type { RpcRequest } from './blockchain-fixtures.js';

const rejectCode = (code: string) => (e: unknown) =>
  e instanceof ReaderFailure &&
  e.code === code &&
  e.message === code &&
  !e.cause;
function call(req: RpcRequest) {
  const tx = req.params[0] as { to: `0x${string}`; data: `0x${string}` };
  return {
    ...decodeFunctionData({ abi: erc20ReadAbi, data: tx.data }),
    address: tx.to,
    block: req.params[1],
  };
}
function contractResult(req: RpcRequest): `0x${string}` {
  const { functionName } = call(req);
  switch (functionName) {
    case 'allowance':
      return encodeFunctionResult({
        abi: erc20ReadAbi,
        functionName,
        result: MAX_UINT256,
      });
    case 'balanceOf':
      return encodeFunctionResult({
        abi: erc20ReadAbi,
        functionName,
        result: 0n,
      });
    case 'name':
      return encodeFunctionResult({
        abi: erc20ReadAbi,
        functionName,
        result: 'Synthetic <Token>\u0000',
      });
    case 'symbol':
      return encodeFunctionResult({
        abi: erc20ReadAbi,
        functionName,
        result: 'TEST',
      });
    case 'decimals':
      return encodeFunctionResult({
        abi: erc20ReadAbi,
        functionName,
        result: call(req).address.toLowerCase().startsWith('0xa0') ? 0 : 255,
      });
  }
}

test('reader verifies mainnet on each invocation and pins all deduplicated reads to one finalized block', async () => {
  const clock = new FakeClock();
  const context = new WorkBudget(15_000, clock);
  const requests: RpcRequest[] = [];
  const rpc = new BoundedRpc(
    'https://rpc.invalid',
    undefined,
    rpcFetch((req) => {
      requests.push(req);
      if (req.method === 'eth_chainId') return '0x1';
      if (req.method === 'eth_getBlockByNumber') {
        assert.deepEqual(req.params, ['finalized', false]);
        return block(clock);
      }
      assert.equal(req.method, 'eth_call');
      return contractResult(req);
    }),
  );
  const reader = new ViemEthereumReader(rpc);
  for (let scan = 0; scan < 2; scan++) {
    const result = await reader.read({
      owner,
      registry: mainnetRegistry,
      context,
    });
    assert.equal(result.source, 'live');
    assert.equal(result.pairs.length, 3);
    assert.equal(result.tokens.length, 2);
    assert.deepEqual(result.snapshot, {
      blockNumber: 24_000_000n,
      blockHash,
      blockTimestamp: BigInt(clock.epoch / 1000) - 720n,
      finality: 'finalized',
    });
    for (const p of result.pairs)
      assert.deepEqual(p.allowance, { ok: true, value: MAX_UINT256 });
    for (const t of result.tokens) {
      assert.deepEqual(t.balance, { ok: true, value: 0n });
      assert.deepEqual(t.name, { ok: true, value: 'Synthetic <Token>' });
    }
    assert.deepEqual(
      result.tokens.map((t) => t.decimals),
      [
        { ok: true, value: 0 },
        { ok: true, value: 255 },
      ],
    );
    assert.ok(
      Object.isFrozen(result) &&
        Object.isFrozen(result.pairs) &&
        Object.isFrozen(result.tokens[0]),
    );
  }
  assert.equal(requests.filter((r) => r.method === 'eth_chainId').length, 2);
  const reads = requests.filter((r) => r.method === 'eth_call').map(call);
  assert.equal(reads.length, 22);
  for (const r of reads) assert.equal(r.block, '0x16e3600');
  for (let scan = 0; scan < 2; scan++) {
    const slice = reads.slice(scan * 11, (scan + 1) * 11);
    assert.deepEqual(
      slice.slice(0, 5).map((r) => r.functionName),
      ['allowance', 'allowance', 'allowance', 'balanceOf', 'balanceOf'],
    );
    assert.equal(
      new Set(
        slice.map(
          (r) => `${r.address}:${r.functionName}:${JSON.stringify(r.args)}`,
        ),
      ).size,
      11,
    );
    for (const r of slice.filter(
      (r) => r.functionName === 'allowance' || r.functionName === 'balanceOf',
    ))
      assert.equal(r.args?.[0], owner);
  }
  assert.equal(rpc.permits.inFlight, 0);
  context.dispose();
});

test('preflight rejects wrong chain, unsupported/stale/future/incomplete finalized data before contract work', async () => {
  const clock = new FakeClock();
  const cases: {
    chain?: unknown;
    snapshot?: unknown;
    error?: boolean;
    code: string;
  }[] = [
    { chain: '0x89', code: 'CHAIN_MISMATCH' },
    { chain: null, code: 'RPC_UNAVAILABLE' },
    { snapshot: null, code: 'SNAPSHOT_UNAVAILABLE' },
    { snapshot: {}, code: 'SNAPSHOT_UNAVAILABLE' },
    { snapshot: { ...block(clock), hash: null }, code: 'SNAPSHOT_UNAVAILABLE' },
    {
      snapshot: { ...block(clock), number: null },
      code: 'SNAPSHOT_UNAVAILABLE',
    },
    {
      snapshot: { ...block(clock), timestamp: null },
      code: 'SNAPSHOT_UNAVAILABLE',
    },
    {
      snapshot: {
        ...block(clock),
        timestamp: `0x${(BigInt(clock.epoch / 1000) - 1801n).toString(16)}`,
      },
      code: 'SNAPSHOT_UNAVAILABLE',
    },
    {
      snapshot: {
        ...block(clock),
        timestamp: `0x${(BigInt(clock.epoch / 1000) + 61n).toString(16)}`,
      },
      code: 'SNAPSHOT_UNAVAILABLE',
    },
    { error: true, code: 'SNAPSHOT_UNAVAILABLE' },
  ];
  for (const fixture of cases) {
    const requests: RpcRequest[] = [];
    const context = new WorkBudget(15_000, clock);
    const rpc = new BoundedRpc(
      'https://rpc.invalid',
      undefined,
      rpcFetch((req) => {
        requests.push(req);
        if (req.method === 'eth_chainId')
          return 'chain' in fixture ? fixture.chain : '0x1';
        if (fixture.error)
          return Response.json({
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32602, message: 'unsupported finalized secret' },
          });
        return fixture.snapshot;
      }),
    );
    await assert.rejects(
      new ViemEthereumReader(rpc).read({
        owner,
        registry: mainnetRegistry,
        context,
      }),
      rejectCode(fixture.code),
    );
    assert.ok(
      requests.every(
        (r) =>
          r.method === 'eth_chainId' || r.method === 'eth_getBlockByNumber',
      ),
    );
    assert.ok(requests.length <= 2);
    context.dispose();
  }
  for (const offset of [-1800n, 60n]) {
    const context = new WorkBudget(6000, clock);
    const reader = new ViemEthereumReader(
      new BoundedRpc(
        'https://rpc.invalid',
        undefined,
        rpcFetch((req) =>
          req.method === 'eth_chainId'
            ? '0x1'
            : {
                ...block(clock),
                timestamp: `0x${(BigInt(clock.epoch / 1000) + offset).toString(16)}`,
              },
        ),
      ),
    );
    await reader.probe(context);
    context.dispose();
  }
});

test('reverts and malformed metadata remain field failures, shared balances are not repeated, and zero stays readable', async () => {
  const clock = new FakeClock();
  const context = new WorkBudget(15_000, clock);
  const requests: RpcRequest[] = [];
  const rpc = new BoundedRpc(
    'https://rpc.invalid/secret',
    undefined,
    rpcFetch((req) => {
      requests.push(req);
      if (req.method === 'eth_chainId') return '0x1';
      if (req.method === 'eth_getBlockByNumber') return block(clock);
      const r = call(req);
      if (r.functionName === 'balanceOf' || r.functionName === 'name')
        return Response.json({
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: 3,
            message: 'execution reverted at https://rpc.invalid/secret',
          },
        });
      if (r.functionName === 'decimals')
        return encodeAbiParameters([{ type: 'uint256' }], [256n]);
      if (r.functionName === 'symbol')
        return r.address.toLowerCase().startsWith('0xa0')
          ? '0x12'
          : encodeFunctionResult({
              abi: erc20ReadAbi,
              functionName: 'symbol',
              result: 'x'.repeat(33),
            });
      return encodeFunctionResult({
        abi: erc20ReadAbi,
        functionName: 'allowance',
        result: 0n,
      });
    }),
  );
  const result = await new ViemEthereumReader(rpc).read({
    owner,
    registry: mainnetRegistry,
    context,
  });
  assert.equal(requests.length, 13);
  for (const t of result.tokens) {
    assert.deepEqual(t.balance, { ok: false, code: 'CONTRACT_REVERT' });
    assert.deepEqual(t.name, { ok: false, code: 'CONTRACT_REVERT' });
    assert.deepEqual(t.symbol, { ok: false, code: 'INVALID_RETURN_DATA' });
    assert.deepEqual(t.decimals, { ok: false, code: 'INVALID_RETURN_DATA' });
  }
  for (const p of result.pairs)
    assert.deepEqual(p.allowance, { ok: true, value: 0n });
  assert.ok(!JSON.stringify(result.tokens).includes('secret'));
  context.dispose();
});

test('partial allowances, absent optional methods and finite near-maximum values are independent', async () => {
  const clock = new FakeClock();
  const context = new WorkBudget(15_000, clock);
  let allowances = 0;
  const rpc = new BoundedRpc(
    'https://rpc.invalid',
    undefined,
    rpcFetch((req) => {
      if (req.method === 'eth_chainId') return '0x1';
      if (req.method === 'eth_getBlockByNumber') return block(clock);
      const r = call(req);
      if (r.functionName === 'allowance')
        return allowances++ === 0
          ? '0x'
          : encodeFunctionResult({
              abi: erc20ReadAbi,
              functionName: 'allowance',
              result: MAX_UINT256 - 1n,
            });
      if (r.functionName === 'decimals') return '0x';
      return contractResult(req);
    }),
  );
  const result = await new ViemEthereumReader(rpc).read({
    owner,
    registry: mainnetRegistry,
    context,
  });
  assert.deepEqual(result.pairs[0]!.allowance, {
    ok: false,
    code: 'INVALID_RETURN_DATA',
  });
  assert.deepEqual(result.pairs[1]!.allowance, {
    ok: true,
    value: MAX_UINT256 - 1n,
  });
  assert.ok(result.tokens.every((t) => !t.decimals.ok && t.balance.ok));
  context.dispose();
});

test('post-preflight total provider failure preserves unknown allowances with bounded retries', async () => {
  const clock = new FakeClock();
  const context = new WorkBudget(15_000, clock);
  let calls = 0;
  const rpc = new BoundedRpc(
    'https://rpc.invalid',
    undefined,
    rpcFetch((req) => {
      calls++;
      if (req.method === 'eth_chainId') return '0x1';
      if (req.method === 'eth_getBlockByNumber') return block(clock);
      return new Response('secret-provider-error', { status: 503 });
    }),
  );
  const reading = new ViemEthereumReader(rpc).read({
    owner,
    registry: mainnetRegistry,
    context,
  });
  await clock.advance(2000);
  const result = await reading;
  assert.equal(calls, 24); // two preflight + exactly two attempts for 11 fields
  assert.ok(
    result.pairs.every(
      (p) => !p.allowance.ok && p.allowance.code === 'RPC_UNAVAILABLE',
    ),
  );
  assert.equal(rpc.permits.inFlight, 0);
  context.dispose();
});

test('disconnect aborts in-flight fields, stops scheduling and retains already completed allowance', async () => {
  const clock = new FakeClock();
  const parent = new AbortController();
  const context = new WorkBudget(15_000, clock, parent.signal);
  let calls = 0;
  let aborts = 0;
  const hang = hangingFetch(() => aborts++);
  const rpc = new BoundedRpc(
    'https://rpc.invalid',
    undefined,
    async (url, init) => {
      const req = JSON.parse(String(init?.body)) as RpcRequest;
      calls++;
      if (req.method === 'eth_call' && calls > 3) return hang(url, init);
      return Response.json({
        jsonrpc: '2.0',
        id: req.id,
        result:
          req.method === 'eth_chainId'
            ? '0x1'
            : req.method === 'eth_getBlockByNumber'
              ? block(clock)
              : contractResult(req),
      });
    },
  );
  const reading = new ViemEthereumReader(rpc).read({
    owner,
    registry: mainnetRegistry,
    context,
  });
  await flush();
  await flush();
  assert.equal(rpc.permits.inFlight, 4);
  parent.abort();
  const result = await reading;
  assert.equal(result.pairs[0]!.allowance.ok, true);
  assert.ok(
    result.pairs
      .slice(1)
      .every(
        (p) => !p.allowance.ok && p.allowance.code === 'DEADLINE_EXCEEDED',
      ),
  );
  assert.ok(
    result.tokens.every(
      (t) => !t.name.ok && t.name.code === 'DEADLINE_EXCEEDED',
    ),
  );
  assert.equal(aborts, 4);
  assert.equal(calls, 7);
  assert.equal(rpc.permits.inFlight, 0);
  context.dispose();
  assert.equal(clock.timerCount, 0);
});

test('15-second total cap includes queued reads and permits; no more than four reads per scan', async () => {
  const clock = new FakeClock();
  const context = new WorkBudget(60_000, clock);
  const identity = {
    identity: 'unverified',
    label: null,
    identitySourceUrl: null,
    identityReviewedAt: null,
  };
  const registry = validateRegistry({
    registryVersion: 'bounded-test',
    chainId: 1,
    limitation: 'Synthetic concurrency test',
    pairs: Array.from({ length: 20 }, (_, i) => ({
      token: {
        ...identity,
        address: `0x${((i % 5) + 1).toString(16).padStart(40, '0')}`,
      },
      spender: {
        ...identity,
        address: `0x${(Math.floor(i / 5) + 100).toString(16).padStart(40, '0')}`,
      },
    })),
  });
  let peak = 0;
  let active = 0;
  let calls = 0;
  const hang = hangingFetch(() => active--);
  const rpc = new BoundedRpc(
    'https://rpc.invalid',
    undefined,
    async (url, init) => {
      const req = JSON.parse(String(init?.body)) as RpcRequest;
      if (req.method !== 'eth_call')
        return Response.json({
          jsonrpc: '2.0',
          id: req.id,
          result: req.method === 'eth_chainId' ? '0x1' : block(clock),
        });
      calls++;
      active++;
      peak = Math.max(active, peak);
      return hang(url, init);
    },
  );
  const reading = new ViemEthereumReader(rpc).read({
    owner,
    registry,
    context,
  });
  await clock.advance(15_000);
  const result = await reading;
  assert.equal(clock.now(), 15_000);
  assert.equal(peak, 4);
  assert.equal(active, 0);
  assert.equal(result.pairs.length, 20);
  assert.equal(result.tokens.length, 5);
  assert.ok(calls <= 20);
  assert.ok(
    result.pairs.some(
      (p) => !p.allowance.ok && p.allowance.code === 'DEADLINE_EXCEEDED',
    ),
  );
  assert.ok(
    result.tokens.every(
      (t) => !t.name.ok && t.name.code === 'DEADLINE_EXCEEDED',
    ),
  );
  assert.equal(rpc.permits.inFlight, 0);
  assert.equal(rpc.permits.pending, 0);
  context.dispose();
  assert.equal(clock.timerCount, 0);
});

test('four scans are admitted without waiting; probes share the 16-call cap; shutdown settles work', async () => {
  const clock = new FakeClock();
  const context = new WorkBudget(15_000, clock);
  const hang = hangingFetch();
  let active = 0;
  let peak = 0;
  const rpc = new BoundedRpc(
    'https://rpc.invalid',
    undefined,
    async (url, init) => {
      const req = JSON.parse(String(init?.body)) as RpcRequest;
      if (req.method !== 'eth_call')
        return Response.json({
          jsonrpc: '2.0',
          id: req.id,
          result: req.method === 'eth_chainId' ? '0x1' : block(clock),
        });
      active++;
      peak = Math.max(peak, active);
      try {
        return await hang(url, init);
      } finally {
        active--;
      }
    },
  );
  const reader = new ViemEthereumReader(rpc);
  const reads = Array.from({ length: 4 }, () =>
    reader.read({ owner, registry: mainnetRegistry, context }),
  );
  await assert.rejects(
    reader.read({ owner, registry: mainnetRegistry, context }),
    rejectCode('SCAN_CAPACITY_EXCEEDED'),
  );
  await flush();
  await flush();
  assert.equal(rpc.permits.inFlight, 16);
  const probe = assert.rejects(reader.probe(context), rejectCode('CANCELLED'));
  await flush();
  assert.equal(rpc.permits.pending, 1);
  await reader.onModuleDestroy();
  await Promise.all(reads);
  await probe;
  assert.equal(peak, 16);
  assert.equal(active, 0);
  assert.equal(rpc.permits.inFlight, 0);
  assert.equal(rpc.permits.pending, 0);
  await assert.rejects(
    reader.read({ owner, registry: mainnetRegistry, context }),
    rejectCode('SERVICE_NOT_READY'),
  );
  context.dispose();
  assert.equal(clock.timerCount, 0);
});

test('preflight timeout and cancellation are typed; invalid owner never reaches RPC', async () => {
  const clock = new FakeClock();
  const context = new WorkBudget(1000, clock);
  const reader = new ViemEthereumReader(
    new BoundedRpc('https://rpc.invalid', undefined, hangingFetch()),
  );
  const rejected = assert.rejects(
    reader.read({ owner, registry: mainnetRegistry, context }),
    rejectCode('SCAN_TIMEOUT'),
  );
  await clock.advance(1000);
  await rejected;
  await assert.rejects(
    reader.read({ owner, registry: mainnetRegistry, context }),
    rejectCode('SCAN_TIMEOUT'),
  );
  context.dispose();
  const cancelled = new WorkBudget(15_000, clock);
  cancelled.controller.abort();
  await assert.rejects(
    reader.read({ owner, registry: mainnetRegistry, context: cancelled }),
    rejectCode('CANCELLED'),
  );
  await assert.rejects(
    reader.read({
      owner: 'wallet.eth',
      registry: mainnetRegistry,
      context: cancelled,
    }),
    /INVALID_ADDRESS/,
  );
  cancelled.dispose();
});

test('synthetic reader covers success, zero, active, metadata failure, partial and total provider failure without RPC', async () => {
  const clock = new FakeClock();
  const context = new WorkBudget(15_000, clock);
  for (const scenario of [
    'success',
    'zero',
    'active',
    'metadata-failure',
    'partial',
  ] as const) {
    const reader = new DemoEthereumReader(scenario);
    const result = await reader.read({
      owner,
      registry: demoRegistry,
      context,
    });
    assert.equal(result.source, 'demo');
    assert.equal(result.registryVersion, 'demo-1');
    assert.equal(result.pairs.length, 3);
    if (scenario === 'zero')
      assert.ok(
        result.pairs.every((p) => p.allowance.ok && p.allowance.value === 0n),
      );
    if (scenario === 'partial')
      assert.equal(result.pairs[1]!.allowance.ok, false);
    if (scenario === 'metadata-failure')
      assert.ok(result.tokens.every((t) => !t.decimals.ok));
    await assert.rejects(
      reader.read({ owner, registry: mainnetRegistry, context }),
      rejectCode('SERVICE_NOT_READY'),
    );
  }
  await assert.rejects(
    new DemoEthereumReader('provider-failure').read({
      owner,
      registry: demoRegistry,
      context,
    }),
    rejectCode('RPC_UNAVAILABLE'),
  );
  context.dispose();
});
