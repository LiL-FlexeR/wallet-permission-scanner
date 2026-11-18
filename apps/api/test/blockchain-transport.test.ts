import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoundedRpc } from '../src/blockchain/bounded-rpc.js';
import { RpcFault } from '../src/blockchain/rpc-errors.js';
import {
  RPC_LIMITS,
  RpcPermits,
  WorkBudget,
} from '../src/blockchain/work-budget.js';
import {
  FakeClock,
  flush,
  hangingFetch,
  rpcFetch,
} from './blockchain-fixtures.js';

function fault(code: string) {
  return (e: unknown) =>
    e instanceof RpcFault && e.code === code && e.message === code && !e.cause;
}

test('transport has one retry layer, bounded jitter, no redirects/batching or leaked permits', async () => {
  for (const random of [0, 0.5, 0.999999]) {
    const clock = new FakeClock();
    clock.randomValue = random;
    const context = new WorkBudget(15_000, clock);
    const calls: number[] = [];
    const rpc = new BoundedRpc(
      'https://rpc.invalid/secret',
      undefined,
      rpcFetch((_req, init) => {
        calls.push(clock.now());
        assert.equal(init.redirect, 'error');
        assert.equal(init.cache, 'no-store');
        if (calls.length === 1) return new Response('', { status: 503 });
        return '0x1';
      }),
    );
    const result = rpc.client(context, true).getChainId();
    await clock.advance(251);
    assert.equal(await result, 1);
    assert.equal(calls.length, 2);
    assert.ok(calls[1]! >= 150 && calls[1]! <= 250);
    assert.equal(rpc.permits.inFlight, 0);
    context.dispose();
    assert.equal(clock.timerCount, 0);
  }
});

test('attempt timeouts abort and settle before permit release; retries stop at two attempts', async () => {
  const clock = new FakeClock();
  const context = new WorkBudget(15_000, clock);
  let aborts = 0;
  const rpc = new BoundedRpc(
    'https://rpc.invalid/secret',
    undefined,
    hangingFetch(() => aborts++),
  );
  const rejected = assert.rejects(
    rpc.request('eth_chainId', [], context, true),
    fault('RPC_TIMEOUT'),
  );
  await clock.advance(7000);
  await rejected;
  assert.equal(aborts, 2);
  assert.equal(rpc.permits.inFlight, 0);
  context.dispose();
  assert.equal(clock.timerCount, 0);
});

test('provider throttling honors in-budget Retry-After and rejects excessive delay without sleeping', async () => {
  for (const header of ['2', 'Wed, 18 Nov 2026 12:00:02 GMT', '90']) {
    const clock = new FakeClock();
    const context = new WorkBudget(15_000, clock);
    const calls: number[] = [];
    const rpc = new BoundedRpc(
      'https://rpc.invalid',
      undefined,
      rpcFetch(() => {
        calls.push(clock.now());
        return new Response('secret', {
          status: 429,
          headers: { 'Retry-After': header },
        });
      }),
    );
    const rejected = assert.rejects(
      rpc.request('eth_chainId', [], context, true),
      fault('PROVIDER_RATE_LIMITED'),
    );
    await clock.advance(header === '90' ? 0 : 2000);
    await rejected;
    assert.deepEqual(calls, header === '90' ? [0] : [0, 2000]);
    context.dispose();
  }
  for (const status of [200, 503, 501]) {
    const clock = new FakeClock();
    const context = new WorkBudget(15_000, clock);
    let calls = 0;
    const rpc = new BoundedRpc(
      'https://rpc.invalid',
      undefined,
      rpcFetch((req) => {
        calls++;
        return Response.json(
          {
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32005, message: 'secret' },
          },
          { status, headers: status === 501 ? {} : { 'Retry-After': '90' } },
        );
      }),
    );
    await assert.rejects(
      rpc.request('eth_chainId', [], context, true),
      fault(status === 200 ? 'PROVIDER_RATE_LIMITED' : 'RPC_UNAVAILABLE'),
    );
    assert.equal(calls, 1);
    assert.equal(clock.now(), 0);
    context.dispose();
  }
});

test('cancellation during retry and total deadline abort in-flight work without new requests', async () => {
  for (const duringRetry of [true, false]) {
    const clock = new FakeClock();
    const parent = new AbortController();
    const context = new WorkBudget(1000, clock, parent.signal);
    let calls = 0;
    let aborts = 0;
    const rpc = new BoundedRpc(
      'https://rpc.invalid',
      undefined,
      duringRetry
        ? rpcFetch(() => {
            calls++;
            return new Response('', { status: 503 });
          })
        : hangingFetch(() => aborts++),
    );
    // A short context cannot afford a transient retry.
    if (duringRetry) {
      context.dispose();
      const longer = new WorkBudget(15_000, clock, parent.signal);
      const rejected = assert.rejects(
        rpc.request('eth_chainId', [], longer, true),
        fault('DEADLINE_EXCEEDED'),
      );
      await clock.advance(100);
      parent.abort();
      await rejected;
      assert.equal(calls, 1);
      longer.dispose();
    } else {
      const rejected = assert.rejects(
        rpc.request('eth_chainId', [], context, true),
        fault('DEADLINE_EXCEEDED'),
      );
      await clock.advance(1000);
      await rejected;
      assert.equal(aborts, 1);
      context.dispose();
    }
    assert.equal(rpc.permits.inFlight, 0);
    assert.equal(clock.timerCount, 0);
  }
});

test('1 MiB cap covers content-length and streamed decoded bodies; malformed envelopes never retry', async () => {
  const responses = [
    () =>
      new Response('x', {
        headers: { 'Content-Length': String(RPC_LIMITS.responseBytes + 1) },
      }),
    () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(RPC_LIMITS.responseBytes));
            c.enqueue(new Uint8Array(1));
            c.close();
          },
        }),
      ),
    () => Response.json({ jsonrpc: '2.0', id: -1, result: '0x1' }),
    () => new Response('{not-json'),
    () => Response.json([{ jsonrpc: '2.0', id: 1, result: '0x1' }]),
    () => new Response(new Uint8Array([0xff])),
  ];
  for (const response of responses) {
    const clock = new FakeClock();
    const context = new WorkBudget(15_000, clock);
    let calls = 0;
    const rpc = new BoundedRpc('https://rpc.invalid', undefined, async () => {
      calls++;
      return response();
    });
    await assert.rejects(
      rpc.request('eth_chainId', [], context, true),
      fault('INVALID_RETURN_DATA'),
    );
    assert.equal(calls, 1);
    assert.equal(rpc.permits.inFlight, 0);
    context.dispose();
  }
});

test('RPC permits are FIFO, capped process-wide and remove cancelled waiters', async () => {
  const permits = new RpcPermits();
  const signal = new AbortController();
  const held = await Promise.all(
    Array.from({ length: 16 }, () => permits.acquire(signal.signal)),
  );
  assert.equal(permits.inFlight, 16);
  const cancelled = new AbortController();
  const rejected = assert.rejects(
    permits.acquire(cancelled.signal),
    fault('DEADLINE_EXCEEDED'),
  );
  const order: number[] = [];
  const one = permits.acquire(signal.signal).then((release) => {
    order.push(1);
    return release;
  });
  const two = permits.acquire(signal.signal).then((release) => {
    order.push(2);
    return release;
  });
  cancelled.abort();
  await rejected;
  assert.equal(permits.pending, 2);
  held[0]!();
  await flush();
  held[1]!();
  await flush();
  assert.deepEqual(order, [1, 2]);
  (await one)();
  (await two)();
  for (const release of held) release();
  assert.equal(permits.inFlight, 0);
  assert.equal(permits.pending, 0);
  const full = await Promise.all(
    Array.from({ length: 16 }, () => permits.acquire(signal.signal)),
  );
  const queued = new AbortController();
  const waiters = Array.from({ length: 16 }, () =>
    assert.rejects(permits.acquire(queued.signal), fault('DEADLINE_EXCEEDED')),
  );
  await assert.rejects(
    permits.acquire(signal.signal),
    fault('RPC_UNAVAILABLE'),
  );
  assert.equal(permits.pending, 16);
  queued.abort();
  await Promise.all(waiters);
  for (const release of full) release();
  assert.equal(permits.inFlight, 0);
  assert.equal(permits.pending, 0);
});

test('read-only RPC allowlist rejects unknown operations before network', async () => {
  const clock = new FakeClock();
  const context = new WorkBudget(15_000, clock);
  const rpc = new BoundedRpc('https://rpc.invalid', undefined, async () => {
    throw new Error('must not fetch');
  });
  await assert.rejects(
    rpc.request('eth_sendTransaction', [], context, true),
    fault('RPC_UNAVAILABLE'),
  );
  context.dispose();
});
