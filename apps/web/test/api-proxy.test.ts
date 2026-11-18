import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { proxyApiRequest } from '../src/server/api-proxy';

async function upstream(
  t: TestContext,
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<string> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('forward exact paths, bodies, statuses and safe headers; drop identity and credentials', async (t) => {
  const target = await upstream(t, (req, res) => {
    assert.equal(req.url, '/api/v1/scans');
    assert.equal(req.method, 'POST');
    for (const key of [
      'cookie',
      'authorization',
      'forwarded',
      'x-forwarded-for',
      'x-real-ip',
      'x-request-id',
    ])
      assert.equal(req.headers[key], undefined);
    let body = '';
    req.on('data', (chunk) => {
      body += String(chunk);
    });
    req.on('end', () => {
      assert.equal(body, '{"address":"synthetic"}');
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'X-Request-Id': 'upstream-id',
        'Retry-After': '3',
        'Set-Cookie': 'secret=1',
        'X-Private': 'omit',
      });
      res.end('{"isolatedTestServer":true}');
    });
  });
  const response = await proxyApiRequest(
    new Request('http://web/api/v1/scans', {
      method: 'POST',
      body: '{"address":"synthetic"}',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'auth=value',
        Authorization: 'secret',
        Forwarded: 'for=attacker',
        'X-Forwarded-For': '1.2.3.4',
        'X-Real-Ip': '1.2.3.4',
        'X-Request-Id': 'untrusted',
      },
    }),
    target,
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '3');
  assert.equal(response.headers.get('x-request-id'), 'upstream-id');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('x-private'), null);
  assert.deepEqual(await response.json(), { isolatedTestServer: true });
});

test('reject unknown paths, methods, queries, media types and streaming oversized input before forwarding', async (t) => {
  let hits = 0;
  const target = await upstream(t, (_req, res) => {
    hits++;
    res.end();
  });
  for (const [path, init, status] of [
    ['/api/health/live', {}, 404],
    ['/api/v1/coverage', { method: 'POST' }, 405],
    ['/api/v1/coverage?unknown=1', {}, 400],
    ['/api/v1/scans', { method: 'POST', body: '{}' }, 415],
    [
      '/api/v1/scans',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'x'.repeat(1025),
      },
      413,
    ],
  ] as const) {
    const result = await proxyApiRequest(
      new Request(`http://web${path}`, init),
      target,
    );
    assert.equal(result.status, status);
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1025));
      controller.close();
    },
  });
  const request = new Request('http://web/api/v1/scans', {
    method: 'POST',
    body: stream,
    headers: { 'Content-Type': 'application/json' },
    duplex: 'half',
  } as RequestInit);
  assert.equal((await proxyApiRequest(request, target)).status, 413);
  assert.equal(hits, 0);
});

test('do not follow upstream redirects and bound upstream bodies', async (t) => {
  let redirectHits = 0;
  const target = await upstream(t, (req, res) => {
    if (req.url === '/api/v1/coverage') {
      res.writeHead(302, { Location: '/elsewhere' });
      res.end();
    } else if (req.url === '/elsewhere') {
      redirectHits++;
      res.end();
    } else {
      res.end('x'.repeat(1024 * 1024 + 1));
    }
  });
  const redirected = await proxyApiRequest(
    new Request('http://web/api/v1/coverage'),
    target,
  );
  assert.equal(redirected.status, 503);
  assert.equal(redirectHits, 0);
  const tooLarge = await proxyApiRequest(
    new Request('http://web/api/v1/scans', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
    }),
    target,
  );
  assert.equal(tooLarge.status, 503);
});

for (const cancel of ['client', 'deadline'] as const) {
  test(`abort upstream on ${cancel} cancellation`, async (t) => {
    let accepted!: () => void;
    const started = new Promise<void>((resolve) => {
      accepted = resolve;
    });
    let disconnected!: () => void;
    const closed = new Promise<void>((resolve) => {
      disconnected = resolve;
    });
    const target = await upstream(t, (_req, res) => {
      res.on('close', disconnected);
      accepted();
    });
    const controller = new AbortController();
    const pending = proxyApiRequest(
      new Request('http://web/api/v1/coverage', { signal: controller.signal }),
      target,
      cancel === 'deadline' ? 150 : 2000,
    );
    await started;
    if (cancel === 'client') controller.abort();
    assert.equal((await pending).status, 503);
    await Promise.race([
      closed,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('upstream not cancelled')),
          2500,
        ).unref(),
      ),
    ]);
  });
}

test('deadline also bounds a stalled upload', async () => {
  const stream = new ReadableStream<Uint8Array>();
  const req = new Request('http://web/api/v1/scans', {
    method: 'POST',
    body: stream,
    duplex: 'half',
    headers: { 'Content-Type': 'application/json' },
  } as RequestInit);
  assert.equal(
    (await proxyApiRequest(req, 'http://127.0.0.1:1', 30)).status,
    503,
  );
});
