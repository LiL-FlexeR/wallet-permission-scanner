import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import {
  errorEnvelopeSchema,
  livenessSchema,
  readinessSchema,
} from '@wps/contracts';
import { createApp } from '../src/app.js';
import { BlockchainReadiness } from '../src/blockchain/blockchain-readiness.js';
import { block, rpcFetch } from './blockchain-fixtures.js';
import { systemClock } from '../src/blockchain/work-budget.js';

for (const mode of ['live', 'demo']) {
  test(`health HTTP contract in ${mode}; requests only read cached readiness`, async (t) => {
    const originalFetch = globalThis.fetch;
    let providerCalls = 0;
    globalThis.fetch = rpcFetch((req) => {
      providerCalls++;
      if (mode === 'demo') throw new Error('Demo must not call a provider.');
      return req.method === 'eth_chainId' ? '0x1' : block(systemClock);
    });
    t.after(() => {
      globalThis.fetch = originalFetch;
    });
    const app = await createApp({
      NODE_ENV: 'test',
      SCAN_MODE: mode,
      ETHEREUM_RPC_URL: 'https://rpc.example.invalid/secret',
    });
    t.after(() => app.close());
    await app.init();
    await app.get(BlockchainReadiness).whenIdle();
    assert.equal(providerCalls, mode === 'live' ? 2 : 0);
    const client = request(app.getHttpServer());
    const live = await client
      .get('/health/live')
      .set('X-Request-Id', 'client-controlled')
      .expect(200);
    assert.deepEqual(livenessSchema.parse(live.body), { status: 'ok' });
    assert.match(String(live.headers['x-request-id']), /^[0-9a-f-]{36}$/);
    assert.equal(live.headers['cache-control'], 'no-store');
    const ready = await client.get('/health/ready').expect(200);
    assert.deepEqual(readinessSchema.parse(ready.body), {
      status: 'ready',
      mode,
      checks: {
        configuration: 'ok',
        blockchain: mode === 'live' ? 'ok' : 'not_required',
      },
    });
    assert.notEqual(
      live.headers['x-request-id'],
      ready.headers['x-request-id'],
    );
    assert.ok(!JSON.stringify(ready.body).includes('secret'));

    for (const path of ['/health/live', '/health/ready']) {
      const invalid = await client.get(`${path}?unknown=1`).expect(400);
      assert.equal(
        errorEnvelopeSchema.parse(invalid.body).error.code,
        'INVALID_REQUEST',
      );
      for (const body of ['{}', 'null', 'text'])
        await client
          .get(path)
          .set('Content-Type', 'text/plain')
          .send(body)
          .expect(400);
      await client
        .get(path)
        .set('Content-Type', 'text/plain')
        .send('x'.repeat(1025))
        .expect(413);
      await client.post(path).send({}).expect(405).expect('Allow', 'GET');
      await client.head(path).expect(405);
      await client.get(`${path.toUpperCase()}/?unknown=1`).expect(400);
    }
    await client.get('/api/v1/coverage').expect(200);
    await client.post('/api/v1/scans').send({ address: 'unused' }).expect(400);
    const allowed = await client
      .get('/health/live')
      .set('Origin', 'http://localhost:3000')
      .expect(200);
    assert.equal(
      allowed.headers['access-control-allow-origin'],
      'http://localhost:3000',
    );
    const denied = await client
      .get('/health/live')
      .set('Origin', 'https://attacker.example')
      .expect(200);
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
    assert.equal(denied.headers['access-control-allow-credentials'], undefined);
    assert.equal(providerCalls, mode === 'live' ? 2 : 0);
  });
}

test('live readiness is 503 after failed background probe, while liveness remains 200', async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('https://rpc.invalid/credential');
  };
  const app = await createApp({
    SCAN_MODE: 'live',
    ETHEREUM_RPC_URL: 'https://rpc.invalid/credential',
  });
  t.after(async () => {
    await app.close();
    globalThis.fetch = originalFetch;
  });
  await app.init();
  await app.get(BlockchainReadiness).whenIdle();
  const client = request(app.getHttpServer());
  const ready = await client.get('/health/ready').expect(503);
  assert.deepEqual(readinessSchema.parse(ready.body), {
    status: 'not_ready',
    mode: 'live',
    checks: { configuration: 'ok', blockchain: 'unavailable' },
  });
  await client.get('/health/live').expect(200);
  await client.get('/health/ready').expect(503);
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(ready.body).includes('credential'));
});

test('invalid startup fails before a health server can be created', async () => {
  await assert.rejects(
    createApp({ SCAN_MODE: 'live', ETHEREUM_RPC_URL: 'secret-invalid-value' }),
    /Invalid API configuration: ETHEREUM_RPC_URL\./,
  );
});
