import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeAddress, errorCodeSchema } from '@wps/contracts';
import {
  completeScanFixture,
  partialScanFixture,
  coverageFixture,
} from '@wps/contracts/fixtures';
import {
  loadCoverage,
  retryTime,
  scanAddress,
  ScannerError,
} from '../src/features/scanner/api-client';

const wallet = completeScanFixture.walletAddress;
const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

test('browser address validation uses shared EIP-55 normalization and rejects invalid input without fetching', async () => {
  assert.equal(
    normalizeAddress('  0x52908400098527886e0f7030069857d2e4169ee7  '),
    '0x52908400098527886E0F7030069857D2E4169EE7',
  );
  for (const address of [
    '',
    'alice.eth',
    `0x${'0'.repeat(40)}`,
    '0x52908400098527886E0F7030069857D2E4169Ee7',
    '0x123',
    ` ${wallet}${' '.repeat(90)}`,
  ]) {
    await assert.rejects(
      scanAddress(address, {
        fetcher: async () => {
          assert.fail('invalid input must not fetch');
        },
      }),
      (e: unknown) => e instanceof ScannerError && e.code === 'INVALID_ADDRESS',
    );
  }
});

test('complete/partial scan payloads and independent coverage are runtime-validated with same-origin no-store requests', async () => {
  for (const fixture of [completeScanFixture, partialScanFixture]) {
    const result = await scanAddress(` ${wallet} `, {
      fetcher: async (url, init) => {
        assert.equal(url, '/api/v1/scans');
        assert.equal(init?.cache, 'no-store');
        assert.equal(init?.credentials, 'omit');
        assert.equal(init?.method, 'POST');
        assert.deepEqual(JSON.parse(String(init.body)), { address: wallet });
        assert.ok(init.signal instanceof AbortSignal);
        return json(fixture);
      },
    });
    assert.deepEqual(result, fixture);
  }
  assert.deepEqual(
    await loadCoverage({
      fetcher: async (url, init) => {
        assert.equal(url, '/api/v1/coverage');
        assert.equal(init?.method, 'GET');
        assert.equal(init?.cache, 'no-store');
        return json(coverageFixture);
      },
    }),
    coverageFixture,
  );
});

test('non-JSON, malformed JSON, schema/policy/signal drift and wrong-wallet responses never become empty success', async () => {
  const unknownSignal = structuredClone(completeScanFixture);
  Object.assign(unknownSignal.permissions[0]!.risk.signals[0]!, {
    code: 'FUTURE_SIGNAL',
  });
  const responses = [
    new Response('<html>gateway trace</html>', { status: 503 }),
    new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    json({}),
    json({ ...completeScanFixture, riskPolicyVersion: 'mvp-2' }),
    json(unknownSignal),
    json({ ...completeScanFixture, walletAddress: `0x${'4'.repeat(40)}` }),
  ];
  for (const response of responses)
    await assert.rejects(
      scanAddress(wallet, { fetcher: async () => response }),
      (e: unknown) =>
        e instanceof ScannerError &&
        e.code === 'INTEGRATION' &&
        !e.message.includes('gateway trace'),
    );
});

test('every documented server error has a safe message and preserves support request ID', async () => {
  for (const code of errorCodeSchema.options) {
    await assert.rejects(
      scanAddress(wallet, {
        fetcher: async () =>
          json(
            {
              requestId: completeScanFixture.requestId,
              error: {
                code,
                message: 'untrusted server detail',
                retryable: true,
              },
            },
            503,
          ),
      }),
      (e: unknown) =>
        e instanceof ScannerError &&
        e.code === code &&
        e.requestId === completeScanFixture.requestId &&
        !e.message.includes('untrusted'),
    );
  }
});

test('429/busy 503 preserve Retry-After even for malformed errors and never retry automatically', async () => {
  for (const status of [429, 503]) {
    let calls = 0;
    await assert.rejects(
      scanAddress(wallet, {
        now: () => 1000,
        fetcher: async () => {
          calls++;
          return json({}, status, { 'Retry-After': '7' });
        },
      }),
      (e: unknown) => e instanceof ScannerError && e.retryAt === 8000,
    );
    assert.equal(calls, 1);
  }
  assert.equal(
    retryTime('Thu, 19 Nov 2026 12:00:00 GMT', 0),
    Date.parse('2026-11-19T12:00:00Z'),
  );
  assert.equal(retryTime('invalid', 0), 0);
  assert.equal(retryTime(null, 0), 0);
  assert.equal(retryTime('172800', 1000), 172801000);
  await assert.rejects(
    scanAddress(wallet, {
      now: () => 1000,
      fetcher: async () => {
        const response = json({}, 429, {
          'Retry-After': '9',
          'X-Request-Id': completeScanFixture.requestId,
        });
        response.json = async () => {
          throw new TypeError('broken body stream');
        };
        return response;
      },
    }),
    (error: unknown) =>
      error instanceof ScannerError &&
      error.retryAt === 10000 &&
      error.requestId === completeScanFixture.requestId,
  );
});

test('browser timeout and caller cancellation abort fetch, including pre-aborted and delayed body cases', async () => {
  const waiting: typeof fetch = async (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('aborted', 'AbortError')),
        { once: true },
      );
    });
  await assert.rejects(
    scanAddress(wallet, { timeoutMs: 5, fetcher: waiting }),
    (e: unknown) => e instanceof ScannerError && e.code === 'TIMEOUT',
  );
  const controller = new AbortController();
  const pending = scanAddress(wallet, {
    signal: controller.signal,
    fetcher: waiting,
  });
  controller.abort();
  await assert.rejects(
    pending,
    (e: unknown) => e instanceof ScannerError && e.code === 'CANCELLED',
  );
  await assert.rejects(
    scanAddress(wallet, {
      signal: controller.signal,
      fetcher: async () => assert.fail('already aborted'),
    }),
    (e: unknown) => e instanceof ScannerError && e.code === 'CANCELLED',
  );
  const bodyAbort = new AbortController();
  await assert.rejects(
    scanAddress(wallet, {
      signal: bodyAbort.signal,
      fetcher: async () => {
        const response = json(completeScanFixture);
        response.json = async () => {
          bodyAbort.abort();
          return completeScanFixture;
        };
        return response;
      },
    }),
    (e: unknown) => e instanceof ScannerError && e.code === 'CANCELLED',
  );
  await assert.rejects(
    scanAddress(wallet, {
      fetcher: async () => {
        throw new Error('sensitive transport details');
      },
    }),
    (e: unknown) =>
      e instanceof ScannerError &&
      e.code === 'NETWORK' &&
      !e.message.includes('sensitive'),
  );
});
