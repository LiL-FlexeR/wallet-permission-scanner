import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateApiEnvironment } from '../src/config/environment.js';

test('demo needs no RPC, live is the default and validates without contacting a provider', () => {
  assert.equal(validateApiEnvironment({ SCAN_MODE: 'demo' }).PORT, 3001);
  assert.equal(
    validateApiEnvironment({
      ETHEREUM_RPC_URL: 'https://rpc.example.invalid/key',
    }).SCAN_MODE,
    'live',
  );
  assert.throws(() => validateApiEnvironment({}), /ETHEREUM_RPC_URL/);
  assert.equal(
    validateApiEnvironment({
      SCAN_MODE: 'demo',
      TRUSTED_PROXY_CIDRS: '127.0.0.1/32, ::1/128',
    }).TRUSTED_PROXY_CIDRS.length,
    2,
  );
});

for (const input of [
  { SCAN_MODE: 'fixture' },
  { PORT: '' },
  { PORT: '0' },
  { PORT: '65536' },
  { PORT: '3.5' },
  { PORT: '3001suffix' },
  { NODE_ENV: 'invalid' },
  { LOG_LEVEL: 'everything' },
  { WEB_ORIGIN: '*' },
  { WEB_ORIGIN: 'https://*.example.com' },
  { WEB_ORIGIN: 'https://example.com/path' },
  { WEB_ORIGIN: 'http://name:password@example.com' },
  { WEB_ORIGIN: 'https://example.com?x=1' },
  { TRUSTED_PROXY_CIDRS: ' ' },
  { TRUSTED_PROXY_CIDRS: '127.0.0.1' },
  { TRUSTED_PROXY_CIDRS: '10.0.0.0/33' },
  { TRUSTED_PROXY_CIDRS: '::1/129' },
  { TRUSTED_PROXY_CIDRS: '10.0.0.0/8,' },
  { TRUSTED_PROXY_CIDRS: '0.0.0.0/0' },
  { ETHEREUM_RPC_URL: 'file:///secret' },
  { ETHEREUM_RPC_URL: 'https://user:secret@rpc.example.com' },
  { NODE_ENV: 'production', ETHEREUM_RPC_URL: 'http://rpc.example.com' },
]) {
  test(`reject invalid configuration ${JSON.stringify(Object.keys(input))}: ${Object.values(input)[0]}`, () => {
    assert.throws(
      () => validateApiEnvironment({ SCAN_MODE: 'demo', ...input }),
      /^Error: Invalid API configuration:/,
    );
  });
}

test('configuration errors expose only field names', () => {
  const secret = 'never-print-this-credential';
  assert.throws(
    () => validateApiEnvironment({ ETHEREUM_RPC_URL: `invalid://${secret}` }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(
        error.message,
        'Invalid API configuration: ETHEREUM_RPC_URL.',
      );
      assert.ok(!error.stack?.includes(secret));
      return true;
    },
  );
});
