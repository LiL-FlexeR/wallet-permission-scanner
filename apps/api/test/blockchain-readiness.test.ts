import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BlockchainReadiness } from '../src/blockchain/blockchain-readiness.js';
import { BoundedRpc } from '../src/blockchain/bounded-rpc.js';
import { ViemEthereumReader } from '../src/blockchain/viem-ethereum.reader.js';
import { RpcPermits } from '../src/blockchain/work-budget.js';
import {
  FakeClock,
  block,
  flush,
  hangingFetch,
  rpcFetch,
} from './blockchain-fixtures.js';

test('background probes run immediately and every 30 seconds, with no overlapping work or health-triggered RPC', async () => {
  const clock = new FakeClock();
  let calls = 0;
  const reader = new ViemEthereumReader(
    new BoundedRpc(
      'https://rpc.invalid',
      undefined,
      rpcFetch((req) => {
        calls++;
        return req.method === 'eth_chainId' ? '0x1' : block(clock);
      }),
    ),
  );
  const readiness = new BlockchainReadiness('live', reader, clock);
  assert.equal(readiness.status, 'unavailable');
  readiness.onModuleInit();
  const one = readiness.refresh();
  const two = readiness.refresh();
  assert.equal(one, two);
  await one;
  assert.equal(calls, 2);
  assert.equal(readiness.status, 'ok');
  await clock.advance(29_999);
  assert.equal(calls, 2);
  await clock.advance(1);
  await readiness.whenIdle();
  assert.equal(calls, 4);
  await readiness.onModuleDestroy();
  assert.equal(readiness.status, 'unavailable');
  assert.equal(clock.timerCount, 0);
});

test('cached success expires after 60 seconds and a failed probe invalidates it immediately', async () => {
  const clock = new FakeClock();
  let fail = false;
  const reader = new ViemEthereumReader(
    new BoundedRpc(
      'https://rpc.invalid',
      undefined,
      rpcFetch((req) => {
        if (fail) return new Response('', { status: 503 });
        return req.method === 'eth_chainId' ? '0x1' : block(clock);
      }),
    ),
  );
  const readiness = new BlockchainReadiness('live', reader, clock);
  await readiness.refresh();
  assert.equal(readiness.status, 'ok');
  await clock.advance(60_000);
  assert.equal(readiness.status, 'ok');
  await clock.advance(1);
  assert.equal(readiness.status, 'unavailable');
  await readiness.refresh();
  assert.equal(readiness.status, 'ok');
  fail = true;
  await readiness.refresh();
  assert.equal(readiness.status, 'unavailable');
  await readiness.onModuleDestroy();
  assert.equal(clock.timerCount, 0);
});

test('probe has no retries, max one active, a six-second budget and aborts on shutdown', async () => {
  const clock = new FakeClock();
  let calls = 0;
  const hang = hangingFetch();
  const rpc = new BoundedRpc(
    'https://rpc.invalid',
    undefined,
    async (url, init) => {
      calls++;
      return hang(url, init);
    },
  );
  const readiness = new BlockchainReadiness(
    'live',
    new ViemEthereumReader(rpc),
    clock,
  );
  const one = readiness.refresh();
  assert.equal(one, readiness.refresh());
  await clock.advance(6000);
  await one;
  assert.equal(calls, 1);
  assert.equal(readiness.status, 'unavailable');
  const two = readiness.refresh();
  await flush();
  await readiness.onModuleDestroy();
  await two;
  assert.equal(calls, 2);
  assert.equal(rpc.permits.inFlight, 0);
  assert.equal(clock.timerCount, 0);
});

test('demo readiness starts and stays ready without creating probes or timers', async () => {
  const clock = new FakeClock();
  const reader = new ViemEthereumReader(
    new BoundedRpc('https://rpc.invalid', undefined, async () => {
      throw new Error('must not fetch');
    }),
  );
  const readiness = new BlockchainReadiness('demo', reader, clock);
  readiness.onModuleInit();
  await readiness.refresh();
  await clock.advance(90_000);
  assert.equal(readiness.status, 'not_required');
  assert.equal(clock.timerCount, 0);
  await readiness.onModuleDestroy();
});

test('six-second probe budget includes waiting for globally shared RPC permits', async () => {
  const clock = new FakeClock();
  const permits = new RpcPermits();
  const parent = new AbortController();
  const held = await Promise.all(
    Array.from({ length: 16 }, () => permits.acquire(parent.signal)),
  );
  let calls = 0;
  const reader = new ViemEthereumReader(
    new BoundedRpc('https://rpc.invalid', permits, async () => {
      calls++;
      throw new Error('must not fetch');
    }),
  );
  const readiness = new BlockchainReadiness('live', reader, clock);
  const probe = readiness.refresh();
  await clock.advance(5999);
  assert.equal(permits.pending, 1);
  await clock.advance(1);
  await probe;
  assert.equal(readiness.status, 'unavailable');
  assert.equal(calls, 0);
  assert.equal(permits.pending, 0);
  for (const release of held) release();
  assert.equal(permits.inFlight, 0);
  await readiness.onModuleDestroy();
  assert.equal(clock.timerCount, 0);
});
