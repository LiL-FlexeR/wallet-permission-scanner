import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { errorEnvelopeSchema } from '@wps/contracts';
import request from 'supertest';
import { SafeExceptionFilter } from '../src/common/http/errors.js';

@Controller('failure')
class FailingController {
  @Get()
  fail(): never {
    throw new Error('private-provider-credential-and-stack');
  }
}

@Module({ controllers: [FailingController] })
class FailureTestModule {}

test('unexpected HTTP failures redact exception messages and logs', async (t) => {
  const logs: string[] = [];
  const original = console.error;
  console.error = (message: unknown) => {
    logs.push(String(message));
  };
  t.after(() => {
    console.error = original;
  });
  const app = await NestFactory.create(FailureTestModule, { logger: false });
  t.after(() => app.close());
  app.useGlobalFilters(new SafeExceptionFilter());
  await app.init();
  const response = await request(app.getHttpServer())
    .get('/failure')
    .expect(500);
  const payload = errorEnvelopeSchema.parse(response.body);
  assert.deepEqual(payload.error, {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error.',
    retryable: false,
  });
  assert.equal(response.headers['x-request-id'], payload.requestId);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(logs.length, 1);
  assert.ok(
    !JSON.stringify([response.body, logs]).includes(
      'private-provider-credential-and-stack',
    ),
  );
});
