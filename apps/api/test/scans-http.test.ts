import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import request from 'supertest';
import { decodeFunctionData, encodeFunctionResult } from 'viem';
import {
  coverageResponseSchema,
  errorEnvelopeSchema,
  scanSuccessSchema,
} from '@wps/contracts';
import { createApp } from '../src/app.js';
import { ETHEREUM_READER } from '../src/blockchain/ethereum-reader.js';
import type {
  EthereumReader,
  ReadInput,
} from '../src/blockchain/ethereum-reader.js';
import { BlockchainReadiness } from '../src/blockchain/blockchain-readiness.js';
import { DemoEthereumReader } from '../src/blockchain/demo-ethereum.reader.js';
import { erc20ReadAbi } from '../src/blockchain/erc20.abi.js';
import { ReaderFailure } from '../src/blockchain/rpc-errors.js';
import { ScansService } from '../src/scans/scans.service.js';
import { RegistryService } from '../src/registry/registry.service.js';
import { validateRegistry } from '../src/registry/registry.js';
import {
  block,
  FakeClock,
  hangingFetch,
  owner,
  rpcFetch,
} from './blockchain-fixtures.js';
import type { RpcRequest } from './blockchain-fixtures.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function demoApp(t: TestContext, clock = new FakeClock(), trusted = '') {
  const app = await createApp(
    { NODE_ENV: 'test', SCAN_MODE: 'demo', TRUSTED_PROXY_CIDRS: trusted },
    clock,
  );
  t.after(() => app.close());
  await app.init();
  return app;
}
function functionName(req: RpcRequest) {
  return decodeFunctionData({
    abi: erc20ReadAbi,
    data: (req.params[0] as { data: `0x${string}` }).data,
  }).functionName;
}
function contractResult(req: RpcRequest, allowance = 1000n) {
  switch (functionName(req)) {
    case 'allowance':
      return encodeFunctionResult({
        abi: erc20ReadAbi,
        functionName: 'allowance',
        result: allowance,
      });
    case 'balanceOf':
      return encodeFunctionResult({
        abi: erc20ReadAbi,
        functionName: 'balanceOf',
        result: 100n,
      });
    case 'name':
      return encodeFunctionResult({
        abi: erc20ReadAbi,
        functionName: 'name',
        result: 'Synthetic <Token>',
      });
    case 'symbol':
      return encodeFunctionResult({
        abi: erc20ReadAbi,
        functionName: 'symbol',
        result: 'TEST',
      });
    case 'decimals':
      return encodeFunctionResult({
        abi: erc20ReadAbi,
        functionName: 'decimals',
        result: 6,
      });
  }
}

test('demo HTTP success is explicit, uncached, schema-valid, request-scoped and read again', async (t) => {
  const app = await demoApp(t);
  const reader = app.get<EthereumReader>(ETHEREUM_READER);
  const read = t.mock.method(reader, 'read');
  const client = request(app.getHttpServer());
  const coverage = await client.get('/api/v1/coverage').expect(200);
  assert.equal(coverageResponseSchema.parse(coverage.body).configuredPairs, 3);
  assert.equal(read.mock.callCount(), 0);
  for (let i = 0; i < 2; i++) {
    const response = await client
      .post('/api/v1/scans')
      .set('X-Request-Id', 'attacker')
      .send({ address: ` ${owner} ` })
      .expect(200);
    const scan = scanSuccessSchema.parse(response.body);
    assert.equal(scan.source, 'demo');
    assert.equal(scan.status, 'complete');
    assert.equal(scan.requestId, response.headers['x-request-id']);
    assert.notEqual(scan.requestId, 'attacker');
    assert.equal(scan.walletAddress, owner);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(scan.summary, { active: 2, inactive: 1, unknown: 0 });
    assert.equal(app.get(ScansService).inFlight, 0);
  }
  assert.equal(read.mock.callCount(), 2);
});

for (const scenario of [
  'success',
  'zero',
  'partial',
  'partial-provider-throttled',
  'metadata-failure',
  'all-provider-throttled',
  'wrong-chain',
  'snapshot-failure',
] as const) {
  test(`live-mode HTTP fixtures: ${scenario}`, async (t) => {
    const clock = new FakeClock();
    let allowances = 0,
      providerCalls = 0;
    t.mock.method(
      globalThis,
      'fetch',
      rpcFetch((req) => {
        providerCalls++;
        if (req.method === 'eth_chainId')
          return scenario === 'wrong-chain' ? '0x89' : '0x1';
        if (req.method === 'eth_getBlockByNumber')
          return scenario === 'snapshot-failure' ? null : block(clock);
        if (
          scenario === 'all-provider-throttled' &&
          functionName(req) === 'allowance'
        )
          return new Response('https://rpc.invalid/credential', {
            status: 429,
            headers: { 'Retry-After': '60' },
          });
        if (
          (scenario === 'partial' ||
            scenario === 'partial-provider-throttled') &&
          functionName(req) === 'allowance' &&
          allowances++ === 0
        )
          return scenario === 'partial'
            ? '0x'
            : new Response('credential', {
                status: 429,
                headers: { 'Retry-After': '60' },
              });
        if (
          scenario === 'metadata-failure' &&
          ['balanceOf', 'decimals'].includes(functionName(req))
        )
          return '0x';
        return contractResult(
          req,
          scenario === 'zero' || scenario === 'metadata-failure' ? 0n : 1000n,
        );
      }),
    );
    const app = await createApp(
      {
        NODE_ENV: 'test',
        SCAN_MODE: 'live',
        ETHEREUM_RPC_URL: 'https://rpc.invalid/credential',
      },
      clock,
    );
    t.after(() => app.close());
    await app.init();
    await app.get(BlockchainReadiness).whenIdle();
    providerCalls = 0;
    const client = request(app.getHttpServer());
    const coverage = await client.get('/api/v1/coverage').expect(200);
    assert.equal(coverageResponseSchema.parse(coverage.body).source, 'live');
    assert.equal(providerCalls, 0);
    const status = [
      'wrong-chain',
      'snapshot-failure',
      'all-provider-throttled',
    ].includes(scenario)
      ? 503
      : 200;
    const response = await client
      .post('/api/v1/scans')
      .send({ address: owner })
      .expect(status);
    if (status === 200) {
      const scan = scanSuccessSchema.parse(response.body);
      assert.equal(scan.source, 'live');
      assert.equal(
        scan.status,
        ['partial', 'partial-provider-throttled', 'metadata-failure'].includes(
          scenario,
        )
          ? 'partial'
          : 'complete',
      );
      assert.equal(
        scan.coverage.checkedPairs,
        scenario.startsWith('partial') ? 2 : 3,
      );
      if (scenario === 'zero' || scenario === 'metadata-failure')
        assert.ok(
          scan.permissions.every(
            (p) =>
              p.activity === 'inactive' &&
              p.risk.level === 'none' &&
              p.risk.assessment === 'complete',
          ),
        );
      if (scenario.startsWith('partial')) {
        assert.equal(scan.permissions[0]!.allowance, null);
        assert.equal(scan.summary.unknown, 1);
      }
      if (scenario === 'partial-provider-throttled')
        assert.equal(scan.warnings[0]!.code, 'PROVIDER_RATE_LIMITED');
      if (scenario === 'metadata-failure')
        assert.ok(
          scan.permissions.every(
            (p) => p.balance === null && p.allowance!.formatted === null,
          ),
        );
    } else {
      const error = errorEnvelopeSchema.parse(response.body);
      assert.equal(
        error.error.code,
        scenario === 'wrong-chain'
          ? 'CHAIN_MISMATCH'
          : scenario === 'snapshot-failure'
            ? 'SNAPSHOT_UNAVAILABLE'
            : 'RPC_UNAVAILABLE',
      );
      assert.equal(error.requestId, response.headers['x-request-id']);
      assert.ok(!JSON.stringify(error).includes('credential'));
      if (scenario !== 'all-provider-throttled') assert.ok(providerCalls <= 2);
    }
    assert.equal(app.get(ScansService).inFlight, 0);
    assert.equal(response.headers['cache-control'], 'no-store');
  });
}

test('HTTP validates bodies, queries, media and methods before reader work; errors never echo input', async (t) => {
  const clock = new FakeClock();
  const app = await demoApp(t, clock);
  const read = t.mock.method(app.get<EthereumReader>(ETHEREUM_READER), 'read');
  const client = request(app.getHttpServer());
  const cases: [string, number, string][] = [
    ['{', 400, 'INVALID_REQUEST'],
    ['null', 400, 'INVALID_REQUEST'],
    ['3', 400, 'INVALID_REQUEST'],
    ['[]', 400, 'INVALID_REQUEST'],
    ['{}', 400, 'INVALID_REQUEST'],
    [
      JSON.stringify({ address: owner, token: 'credential' }),
      400,
      'INVALID_REQUEST',
    ],
    [JSON.stringify({ address: 'credential' }), 400, 'INVALID_ADDRESS'],
    [
      JSON.stringify({ address: `0x${'0'.repeat(40)}` }),
      400,
      'INVALID_ADDRESS',
    ],
    [
      JSON.stringify({ address: '0x5Aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed' }),
      400,
      'INVALID_ADDRESS',
    ],
    [JSON.stringify({ address: ' '.repeat(129) }), 400, 'INVALID_ADDRESS'],
    ['x'.repeat(1025), 413, 'PAYLOAD_TOO_LARGE'],
  ];
  for (const [body, status, code] of cases) {
    await clock.advance(60_000);
    const response = await client
      .post('/api/v1/scans')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(status);
    assert.equal(errorEnvelopeSchema.parse(response.body).error.code, code);
    assert.ok(!JSON.stringify(response.body).includes('credential'));
  }
  await client
    .post('/api/v1/scans')
    .set('Content-Type', 'text/plain')
    .send('{}')
    .expect(415);
  await client
    .post('/api/v1/scans?__proto__[injected]=1')
    .send({ address: owner })
    .expect(400);
  await client
    .post('/API/V1/SCANS/?address=credential')
    .send({ address: owner })
    .expect(400);
  await client.get('/api/v1/scans').expect(405).expect('Allow', 'POST');
  await client.head('/api/v1/scans').expect(405);
  await client.options('/api/v1/scans').expect(405);
  await client
    .post('/api/v1/coverage')
    .send({})
    .expect(405)
    .expect('Allow', 'GET');
  await client.get('/api/v1/coverage?x=1').expect(400);
  await client
    .get('/api/v1/coverage')
    .set('Content-Type', 'application/json')
    .send('{}')
    .expect(400);
  await client.get('/unknown').expect(404);
  assert.equal(read.mock.callCount(), 0);
});

test('malformed attempts consume quota before body parsing; scan and coverage counters stay separate', async (t) => {
  const clock = new FakeClock();
  const app = await demoApp(t, clock);
  const client = request(app.getHttpServer());
  for (let i = 0; i < 10; i++)
    await client
      .post('/api/v1/scans')
      .set('X-Forwarded-For', `203.0.113.${i}`)
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
  const response = await client
    .post('/api/v1/scans')
    .set('Content-Type', 'text/plain')
    .send('x'.repeat(1025))
    .expect(429)
    .expect('Retry-After', '60');
  assert.equal(
    errorEnvelopeSchema.parse(response.body).error.code,
    'RATE_LIMITED',
  );
  for (let i = 0; i < 60; i++) await client.get('/api/v1/coverage').expect(200);
  await client.get('/api/v1/coverage').expect(429);
  await clock.advance(59_001);
  await client
    .post('/api/v1/scans')
    .send({ address: owner })
    .expect(429)
    .expect('Retry-After', '1');
  await clock.advance(999);
  await client.post('/api/v1/scans').send({ address: owner }).expect(200);
});

test('trusted proxy walks from peer to first untrusted IP, normalizes IPv6 and rejects identity spoofing', async (t) => {
  const app = await demoApp(t, new FakeClock(), '127.0.0.1/32,::1/128');
  const client = request(app.getHttpServer());
  for (let i = 0; i < 10; i++)
    await client
      .post('/api/v1/scans')
      .set('X-Forwarded-For', `198.51.100.${i}, 203.0.113.7`)
      .send({ address: 'invalid' })
      .expect(400);
  await client
    .post('/api/v1/scans')
    .set('X-Forwarded-For', '198.51.100.99, 203.0.113.7')
    .send({ address: owner })
    .expect(429);
  await client
    .post('/api/v1/scans')
    .set('X-Forwarded-For', '203.0.113.8')
    .send({ address: owner })
    .expect(200);
  for (let i = 0; i < 10; i++)
    await client
      .post('/api/v1/scans')
      .set('X-Forwarded-For', i % 2 ? '2001:db8::1' : '2001:0db8:0:0:0:0:0:1')
      .send({ address: 'invalid' })
      .expect(400);
  await client
    .post('/api/v1/scans')
    .set('X-Forwarded-For', '2001:db8::1')
    .send({ address: owner })
    .expect(429);
  // Invalid forwarding text shares the conservative actual-peer bucket.
  for (let i = 0; i < 10; i++)
    await client
      .post('/api/v1/scans')
      .set('X-Forwarded-For', `invalid-${i}`)
      .send({ address: 'invalid' })
      .expect(400);
  await client
    .post('/api/v1/scans')
    .set('X-Forwarded-For', 'another-invalid')
    .send({ address: owner })
    .expect(429);
});

test('capacity rejects the fifth scan immediately and releases all slots on completion and exception', async (t) => {
  const app = await demoApp(t);
  const gate = deferred();
  const entered = deferred();
  let calls = 0;
  const reader = app.get<EthereumReader>(ETHEREUM_READER);
  const original = reader.read.bind(reader);
  const read = t.mock.method(reader, 'read', async (input: ReadInput) => {
    if (++calls === 4) entered.resolve();
    await gate.promise;
    return original(input);
  });
  const client = request(app.getHttpServer());
  const pending = Array.from({ length: 4 }, () =>
    client
      .post('/api/v1/scans')
      .send({ address: owner })
      .then((r) => r),
  );
  await entered.promise;
  assert.equal(app.get(ScansService).inFlight, 4);
  const busy = await client
    .post('/api/v1/scans')
    .send({ address: owner })
    .expect(503)
    .expect('Retry-After', '1');
  assert.equal(busy.body.error.code, 'SCAN_CAPACITY_EXCEEDED');
  assert.equal(calls, 4);
  gate.resolve();
  assert.ok((await Promise.all(pending)).every((r) => r.status === 200));
  assert.equal(app.get(ScansService).inFlight, 0);
  read.mock.restore();
  const logs: string[] = [];
  t.mock.method(console, 'error', (s: unknown) => logs.push(String(s)));
  t.mock.method(reader, 'read', async () => {
    throw new Error(`credential ${owner}`);
  });
  const response = await client
    .post('/api/v1/scans')
    .send({ address: owner })
    .expect(500);
  assert.equal(
    errorEnvelopeSchema.parse(response.body).error.code,
    'INTERNAL_ERROR',
  );
  assert.ok(!JSON.stringify([logs, response.body]).includes('credential'));
  assert.ok(!JSON.stringify(logs).includes(owner));
  assert.equal(app.get(ScansService).inFlight, 0);
});

for (const keepOne of [false, true]) {
  test(`HTTP deadline with ${keepOne ? 'one' : 'no'} completed allowance settles live RPC and frees capacity`, async (t) => {
    const clock = new FakeClock();
    const entered = deferred();
    let calls = 0,
      aborted = 0;
    const hang = hangingFetch(() => aborted++);
    t.mock.method(
      globalThis,
      'fetch',
      async (url: string | URL | Request, init?: RequestInit) => {
        const req = JSON.parse(String(init?.body)) as RpcRequest;
        if (req.method === 'eth_call') {
          entered.resolve();
          if (!(keepOne && calls++ === 0)) return hang(url, init);
        }
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
    const app = await createApp(
      {
        NODE_ENV: 'test',
        SCAN_MODE: 'live',
        ETHEREUM_RPC_URL: 'https://rpc.invalid/credential',
      },
      clock,
    );
    t.after(() => app.close());
    await app.init();
    await app.get(BlockchainReadiness).whenIdle();
    const result = request(app.getHttpServer())
      .post('/api/v1/scans')
      .send({ address: owner })
      .then((r) => r);
    await entered.promise;
    await clock.advance(15_000);
    const response = await result;
    assert.equal(response.status, keepOne ? 200 : 504);
    if (keepOne) {
      const scan = scanSuccessSchema.parse(response.body);
      assert.equal(scan.status, 'partial');
      assert.equal(scan.coverage.checkedPairs, 1);
      assert.ok(scan.warnings.some((w) => w.code === 'DEADLINE_EXCEEDED'));
    } else
      assert.equal(
        errorEnvelopeSchema.parse(response.body).error.code,
        'SCAN_TIMEOUT',
      );
    assert.ok(aborted > 0);
    assert.equal(app.get(ScansService).inFlight, 0);
    await app.close();
    assert.equal(clock.timerCount, 0);
  });
}

test('real HTTP disconnect aborts reader and retains capacity until work settles', async (t) => {
  const app = await demoApp(t);
  const entered = deferred(),
    aborted = deferred(),
    settle = deferred();
  t.mock.method(
    app.get<EthereumReader>(ETHEREUM_READER),
    'read',
    async ({ context }: ReadInput) => {
      context.signal.addEventListener('abort', aborted.resolve, { once: true });
      entered.resolve();
      await aborted.promise;
      await settle.promise;
      throw new ReaderFailure('CANCELLED');
    },
  );
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  assert.ok(address && typeof address !== 'string');
  const client = httpRequest(`http://127.0.0.1:${address.port}/api/v1/scans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const closed = new Promise<void>((resolve) => client.once('close', resolve));
  client.on('error', () => {});
  client.end(JSON.stringify({ address: owner }));
  await entered.promise;
  client.destroy();
  await aborted.promise;
  assert.equal(app.get(ScansService).inFlight, 1);
  settle.resolve();
  await closed;
  await app.get(ScansService).onModuleDestroy();
  assert.equal(app.get(ScansService).inFlight, 0);
});

test('demo partial and preflight failures follow the same HTTP contract without fallback', async (t) => {
  const app = await demoApp(t);
  const reader = app.get<EthereumReader>(ETHEREUM_READER);
  const client = request(app.getHttpServer());
  const partial = t.mock.method(reader, 'read', (input: ReadInput) =>
    new DemoEthereumReader('partial').read(input),
  );
  assert.equal(
    scanSuccessSchema.parse(
      (await client.post('/api/v1/scans').send({ address: owner }).expect(200))
        .body,
    ).status,
    'partial',
  );
  partial.mock.restore();
  t.mock.method(reader, 'read', async () => {
    throw new ReaderFailure('SCAN_TIMEOUT');
  });
  assert.equal(
    (await client.post('/api/v1/scans').send({ address: owner }).expect(504))
      .body.error.code,
    'SCAN_TIMEOUT',
  );
  assert.equal(app.get(ScansService).inFlight, 0);
});

test('scan keeps its captured immutable registry when coverage changes during a read', async (t) => {
  const app = await demoApp(t);
  const entered = deferred(),
    gate = deferred();
  const registry = app.get(RegistryService),
    captured = registry.snapshot;
  const reader = app.get<EthereumReader>(ETHEREUM_READER),
    original = reader.read.bind(reader);
  t.mock.method(reader, 'read', async (input: ReadInput) => {
    entered.resolve();
    await gate.promise;
    assert.equal(input.registry, captured);
    return original(input);
  });
  const client = request(app.getHttpServer());
  const pending = client
    .post('/api/v1/scans')
    .send({ address: owner })
    .then((r) => r);
  await entered.promise;
  const updated = validateRegistry({
    ...captured,
    registryVersion: 'demo-2',
    pairs: captured.pairs.map(({ token, spender }) => ({ token, spender })),
  });
  Object.defineProperty(registry, 'snapshot', { value: updated });
  assert.equal(
    (await client.get('/api/v1/coverage').expect(200)).body.registryVersion,
    'demo-2',
  );
  gate.resolve();
  const scan = scanSuccessSchema.parse((await pending).body);
  assert.equal(scan.registryVersion, 'demo-1');
  assert.equal(scan.coverage.configuredPairs, captured.pairs.length);
});

test('shutdown stops admission and aborts admitted HTTP work before releasing its slot', async (t) => {
  const app = await demoApp(t);
  const entered = deferred();
  t.mock.method(
    app.get<EthereumReader>(ETHEREUM_READER),
    'read',
    async ({ context }: ReadInput) => {
      entered.resolve();
      await new Promise<void>((resolve) =>
        context.signal.addEventListener('abort', () => resolve(), {
          once: true,
        }),
      );
      throw new ReaderFailure('CANCELLED');
    },
  );
  const service = app.get(ScansService);
  const pending = request(app.getHttpServer())
    .post('/api/v1/scans')
    .send({ address: owner })
    .then((r) => r);
  await entered.promise;
  await service.onModuleDestroy();
  assert.equal((await pending).status, 504);
  assert.equal(service.inFlight, 0);
  await assert.rejects(
    service.scan(owner, 'unused'),
    (e: unknown) => e instanceof Error && e.message === 'SERVICE_NOT_READY',
  );
});

test('inconsistent source, wallet, registry, tuples and token reads fail closed with a safe 500', async (t) => {
  const clock = new FakeClock();
  const app = await demoApp(t, clock);
  const reader = app.get<EthereumReader>(ETHEREUM_READER);
  const original = reader.read.bind(reader);
  const client = request(app.getHttpServer());
  const logs: string[] = [];
  t.mock.method(console, 'error', (s: unknown) => logs.push(String(s)));
  for (const mutate of [
    (r: Awaited<ReturnType<EthereumReader['read']>>) => ({
      ...r,
      source: 'live' as const,
    }),
    (r: Awaited<ReturnType<EthereumReader['read']>>) => ({
      ...r,
      owner: `0x${'9'.repeat(40)}` as const,
    }),
    (r: Awaited<ReturnType<EthereumReader['read']>>) => ({
      ...r,
      registryVersion: 'wrong-1',
    }),
    (r: Awaited<ReturnType<EthereumReader['read']>>) => ({
      ...r,
      pairs: r.pairs.slice(1),
    }),
    (r: Awaited<ReturnType<EthereumReader['read']>>) => ({
      ...r,
      pairs: [r.pairs[0]!, r.pairs[0]!, r.pairs[2]!],
    }),
    (r: Awaited<ReturnType<EthereumReader['read']>>) => ({
      ...r,
      tokens: r.tokens.slice(1),
    }),
  ]) {
    const mock = t.mock.method(reader, 'read', async (input: ReadInput) =>
      mutate(await original(input)),
    );
    const response = await client
      .post('/api/v1/scans')
      .send({ address: owner })
      .expect(500);
    const body = errorEnvelopeSchema.parse(response.body);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.requestId, response.headers['x-request-id']);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(app.get(ScansService).inFlight, 0);
    mock.mock.restore();
  }
  assert.ok(!JSON.stringify(logs).includes(owner));
  await app.get(ScansService).onModuleDestroy();
  for (const path of ['/api/v1/scans', '/api/v1/coverage']) {
    const response = path.endsWith('scans')
      ? await client.post(path).send({ address: owner }).expect(503)
      : await client.get(path).expect(503);
    assert.equal(
      errorEnvelopeSchema.parse(response.body).error.code,
      'SERVICE_NOT_READY',
    );
  }
});
