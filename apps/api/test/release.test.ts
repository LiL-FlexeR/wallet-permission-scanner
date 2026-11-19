import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { scanSuccessSchema } from '@wps/contracts';
import { createApp } from '../src/app.js';
import { demoAddresses } from '../src/blockchain/demo-ethereum.reader.js';
import { BlockchainReadiness } from '../src/blockchain/blockchain-readiness.js';
import { ScansService } from '../src/scans/scans.service.js';
import { ETHEREUM_READER } from '../src/blockchain/ethereum-reader.js';
import type {
  EthereumReader,
  ReadInput,
} from '../src/blockchain/ethereum-reader.js';
import { ReaderFailure } from '../src/blockchain/rpc-errors.js';

test('release demo fixed addresses exercise active/unlimited, inactive and unknown through HTTP without RPC', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Demo attempted network access');
  });
  const app = await createApp({ NODE_ENV: 'production', SCAN_MODE: 'demo' });
  t.after(() => app.close());
  await app.init();
  const client = request(app.getHttpServer());
  for (const [scenario, address] of Object.entries(demoAddresses)) {
    const response = await client
      .post('/api/v1/scans')
      .send({ address })
      .expect(200);
    const scan = scanSuccessSchema.parse(response.body);
    assert.equal(scan.source, 'demo');
    assert.equal(scan.registryVersion, 'demo-1');
    if (scenario === 'zero')
      assert.deepEqual(scan.summary, { active: 0, inactive: 3, unknown: 0 });
    else {
      assert.equal(scan.permissions[0]!.risk.level, 'high');
      assert.equal(scan.summary.active, 2);
      assert.equal(scan.summary.unknown, scenario === 'partial' ? 1 : 0);
    }
    assert.equal(scan.status, scenario === 'partial' ? 'partial' : 'complete');
  }
});

test('release shutdown invalidates readiness and rejects new scans while aborted work settles', async (t) => {
  const app = await createApp({ NODE_ENV: 'production', SCAN_MODE: 'demo' });
  t.after(() => app.close());
  await app.init();
  let entered!: () => void;
  let settle!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const finish = new Promise<void>((resolve) => {
    settle = resolve;
  });
  let aborted = false;
  t.mock.method(
    app.get<EthereumReader>(ETHEREUM_READER),
    'read',
    async ({ context }: ReadInput) => {
      context.signal.addEventListener(
        'abort',
        () => {
          aborted = true;
        },
        { once: true },
      );
      entered();
      await finish;
      throw new ReaderFailure('CANCELLED');
    },
  );
  const service = app.get(ScansService);
  const pending = service
    .scan(demoAddresses.success, 'unused')
    .catch((error: unknown) => error);
  await started;
  const stopping = service.onModuleDestroy();
  await app.get(BlockchainReadiness).onModuleDestroy();
  assert.equal(aborted, true);
  assert.equal(service.inFlight, 1);
  await request(app.getHttpServer()).get('/health/ready').expect(503);
  await request(app.getHttpServer()).get('/health/live').expect(200);
  await assert.rejects(
    service.scan(demoAddresses.success, 'unused'),
    /SERVICE_NOT_READY/,
  );
  settle();
  await Promise.all([pending, stopping]);
  assert.equal(service.inFlight, 0);
});
