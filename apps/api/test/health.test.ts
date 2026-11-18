import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import {
  errorEnvelopeSchema,
  livenessSchema,
  readinessSchema,
} from '@wps/contracts';
import { createApp } from '../src/app.js';

for (const mode of ['live', 'demo']) {
  test(`health HTTP contract in ${mode} without provider calls`, async (t) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error('Health must not call a provider.');
    };
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
      checks: { configuration: 'ok', blockchain: 'not_required' },
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
    await client.get('/api/v1/coverage').expect(404);
    await client.post('/api/v1/scans').send({ address: 'unused' }).expect(404);
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
  });
}

test('invalid startup fails before a health server can be created', async () => {
  await assert.rejects(
    createApp({ SCAN_MODE: 'live', ETHEREUM_RPC_URL: 'secret-invalid-value' }),
    /Invalid API configuration: ETHEREUM_RPC_URL\./,
  );
});
