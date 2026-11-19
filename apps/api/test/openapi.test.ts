import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import request from 'supertest';
import {
  completeScanFixture,
  coverageFixture,
  partialScanFixture,
} from '@wps/contracts/fixtures';
import { scanSuccessSchema, errorEnvelopeSchema } from '@wps/contracts';
import type { ErrorCode } from '@wps/contracts';
import { createApp } from '../src/app.js';
import { ETHEREUM_READER } from '../src/blockchain/ethereum-reader.js';
import type {
  EthereumReader,
  ReadInput,
} from '../src/blockchain/ethereum-reader.js';
import { DemoEthereumReader } from '../src/blockchain/demo-ethereum.reader.js';
import { errorDefinitions, errorPayload } from '../src/common/http/errors.js';
import { generateOpenApi } from '../src/docs/openapi.js';
import { owner } from './blockchain-fixtures.js';

test('generated OpenAPI schemas validate all fixtures, documented examples, and reject broken wire types', () => {
  const document = generateOpenApi();
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats.default(ajv);
  const validators = Object.fromEntries(
    Object.entries(document.components.schemas).map(([name, schema]) => [
      name,
      ajv.compile(schema),
    ]),
  );
  for (const [name, fixture] of [
    ['ScanSuccess', completeScanFixture],
    ['ScanSuccess', partialScanFixture],
    ['Coverage', coverageFixture],
    ['ScanRequest', { address: owner }],
  ] as const)
    assert.ok(
      validators[name]!(fixture),
      JSON.stringify(validators[name]!.errors),
    );
  for (const code of Object.keys(errorDefinitions) as ErrorCode[]) {
    const payload = errorPayload(code, completeScanFixture.requestId);
    assert.ok(validators.Error!(payload));
    assert.deepEqual(errorEnvelopeSchema.parse(payload), payload);
  }
  assert.equal(
    validators.ScanRequest!({ address: owner, token: owner }),
    false,
  );
  assert.equal(
    validators.ScanSuccess!({
      ...completeScanFixture,
      snapshot: { ...completeScanFixture.snapshot, blockNumber: 24000000 },
    }),
    false,
  );
  const bad = structuredClone(completeScanFixture);
  bad.permissions[0]!.allowance!.raw = '1e18';
  assert.equal(validators.ScanSuccess!(bad), false);
  assert.equal(document.openapi, '3.1.0');
  for (const path of Object.values(document.paths))
    for (const operation of Object.values(path)) {
      for (const response of Object.values(operation.responses)) {
        if (!('content' in response)) continue;
        const json = response.content['application/json'] as {
          schema: { $ref: string };
          example?: unknown;
          examples?: Record<string, { value: unknown }>;
        };
        const name = json.schema.$ref.split('/').at(-1)!;
        for (const fixture of [
          ...(json.example ? [json.example] : []),
          ...Object.values(json.examples ?? {}).map((e) => e.value),
        ])
          assert.ok(
            validators[name]!(fixture),
            JSON.stringify(validators[name]!.errors),
          );
      }
    }
});

test('development docs serve a local explorer and actual complete/partial/error responses match generated JSON Schema', async (t) => {
  const app = await createApp({ NODE_ENV: 'test', SCAN_MODE: 'demo' });
  t.after(() => app.close());
  await app.init();
  const client = request(app.getHttpServer());
  const response = await client.get('/api/openapi.json').expect(200);
  assert.deepEqual(response.body, generateOpenApi());
  await client.get('/api/docs').expect(200).expect('Content-Type', /html/);
  await client.get('/api/docs/swagger-ui.css').expect(200);
  const init = await client.get('/api/docs/swagger-ui-init.js').expect(200);
  assert.ok(init.text.includes('"validatorUrl": null')); // Never send schemas to a remote validator.
  await client.post('/api/docs').expect(405);
  const ajv = new Ajv2020({ strict: false });
  addFormats.default(ajv);
  const schema = response.body.components.schemas as Record<string, object>;
  const validate = ajv.compile(schema.ScanSuccess!);
  const complete = await client
    .post('/api/v1/scans')
    .send({ address: owner })
    .expect(200);
  assert.ok(validate(complete.body), JSON.stringify(validate.errors));
  scanSuccessSchema.parse(complete.body);
  t.mock.method(
    app.get<EthereumReader>(ETHEREUM_READER),
    'read',
    (input: ReadInput) => new DemoEthereumReader('partial').read(input),
  );
  const partial = await client
    .post('/api/v1/scans')
    .send({ address: owner })
    .expect(200);
  assert.ok(validate(partial.body), JSON.stringify(validate.errors));
  scanSuccessSchema.parse(partial.body);
  const error = await client
    .post('/api/v1/scans')
    .send({ address: 'invalid' })
    .expect(400);
  assert.ok(ajv.compile(schema.Error!)(error.body));
  assert.ok(
    ajv.compile(schema.Coverage!)(
      (await client.get('/api/v1/coverage').expect(200)).body,
    ),
  );
});

test('production hides the explorer, schema and assets', async (t) => {
  const app = await createApp({ NODE_ENV: 'production', SCAN_MODE: 'demo' });
  t.after(() => app.close());
  await app.init();
  for (const path of [
    '/api/docs',
    '/api/docs/swagger-ui.css',
    '/api/openapi.json',
  ])
    await request(app.getHttpServer()).get(path).expect(404);
});

test('checked-in OpenAPI artifact is exactly reproducible from shared runtime schemas', async () => {
  const artifact = await readFile(
    new URL('../../../../docs/api/openapi.json', import.meta.url),
    'utf8',
  );
  assert.equal(artifact, JSON.stringify(generateOpenApi(), null, 2) + '\n');
});
