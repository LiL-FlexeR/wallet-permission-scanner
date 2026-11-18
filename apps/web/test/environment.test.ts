import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateWebEnvironment } from '../src/server/environment';

test('proxy target accepts only operator HTTP(S) origins', () => {
  assert.equal(
    validateWebEnvironment({}).API_PROXY_TARGET,
    'http://localhost:3001',
  );
  assert.equal(
    validateWebEnvironment({ API_PROXY_TARGET: 'http://api:3001/' })
      .API_PROXY_TARGET,
    'http://api:3001',
  );
  for (const value of [
    '',
    '*',
    'ftp://api',
    'http://api/path',
    'http://api?target=1',
    'http://api/#fragment',
    'http://user:secret@api',
    'http://*.example.com',
  ]) {
    assert.throws(() => validateWebEnvironment({ API_PROXY_TARGET: value }), {
      message: 'Invalid web configuration: API_PROXY_TARGET.',
    });
  }
});
