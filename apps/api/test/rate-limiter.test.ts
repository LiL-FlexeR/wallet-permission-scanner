import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../src/common/http/errors.js';
import {
  HTTP_LIMITS,
  RouteRateLimiter,
} from '../src/common/http/rate-limiter.js';
import { FakeClock } from './blockchain-fixtures.js';

test('separate fixed route windows count attempts and compute exact Retry-After at boundaries', async () => {
  const clock = new FakeClock();
  const limiter = new RouteRateLimiter(clock);
  try {
    for (let i = 0; i < 10; i++) limiter.consume('client', 'scans');
    for (let i = 0; i < 60; i++) limiter.consume('client', 'coverage');
    const limited = (seconds: number) => (e: unknown) =>
      e instanceof ApiError &&
      e.code === 'RATE_LIMITED' &&
      e.retryAfter === seconds;
    assert.throws(() => limiter.consume('client', 'scans'), limited(60));
    await clock.advance(59_001);
    assert.throws(() => limiter.consume('client', 'coverage'), limited(1));
    await clock.advance(999);
    limiter.consume('client', 'scans');
    limiter.consume('client', 'coverage');
    assert.equal(limiter.size, 1);
  } finally {
    limiter.onModuleDestroy();
  }
  assert.equal(clock.timerCount, 0);
});

test('limiter holds at most 10000 IPs, expires idle state without traffic, retains active entries', async () => {
  const clock = new FakeClock();
  const limiter = new RouteRateLimiter(clock);
  try {
    for (let i = 0; i < HTTP_LIMITS.ips; i++)
      limiter.consume(String(i), 'coverage');
    assert.equal(limiter.size, HTTP_LIMITS.ips);
    assert.throws(
      () => limiter.consume('overflow', 'scans'),
      (e: unknown) =>
        e instanceof ApiError && e.code === 'SCAN_CAPACITY_EXCEEDED',
    );
    await clock.advance(119_999);
    limiter.consume('0', 'coverage');
    await clock.advance(1);
    assert.equal(limiter.size, 1);
    limiter.consume('overflow', 'scans');
    await clock.advance(120_000);
    assert.equal(limiter.size, 0);
    assert.equal(clock.timerCount, 0);
  } finally {
    limiter.onModuleDestroy();
  }
});

test('each route starts its window on that route’s first attempt', async () => {
  const clock = new FakeClock();
  const limiter = new RouteRateLimiter(clock);
  try {
    limiter.consume('client', 'coverage');
    await clock.advance(30_000);
    for (let i = 0; i < 10; i++) limiter.consume('client', 'scans');
    await clock.advance(30_000);
    limiter.consume('client', 'coverage');
    assert.throws(
      () => limiter.consume('client', 'scans'),
      (e: unknown) =>
        e instanceof ApiError &&
        e.code === 'RATE_LIMITED' &&
        e.retryAfter === 30,
    );
    await clock.advance(30_000);
    limiter.consume('client', 'scans');
  } finally {
    limiter.onModuleDestroy();
  }
});
