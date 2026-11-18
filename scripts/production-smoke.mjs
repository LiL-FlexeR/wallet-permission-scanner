import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = new Set();
const servers = new Set();

async function listen(server) {
  servers.add(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function freePort() {
  const server = createServer();
  const url = new URL(await listen(server));
  await new Promise((resolve) => server.close(resolve));
  servers.delete(server);
  return url.port;
}

function start(args, cwd, environment) {
  const child = spawn(process.execPath, args, {
    cwd: `${root}${cwd}`,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  let output = '';
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      output += String(chunk);
    });
  return { child, output: () => output };
}

async function stop(process) {
  if (process.child.exitCode !== null) return;
  const closed = once(process.child, 'close');
  process.child.kill('SIGTERM');
  await Promise.race([
    closed,
    delay(10_000, undefined, { ref: false }).then(() => {
      process.child.kill('SIGKILL');
    }),
  ]);
  await closed;
  children.delete(process.child);
}

async function waitReady(process, url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (process.child.exitCode !== null)
      throw new Error(`Server exited: ${process.output()}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await response.arrayBuffer();
      if (response.ok) return;
    } catch {
      /* Server is still starting. */
    }
    await delay(100);
  }
  throw new Error('Server did not become ready within 30 seconds.');
}

async function startWeb(target) {
  const port = await freePort();
  const process = start(
    [
      'node_modules/next/dist/bin/next',
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      port,
    ],
    'apps/web',
    {
      NODE_ENV: 'production',
      API_PROXY_TARGET: target,
    },
  );
  const origin = `http://127.0.0.1:${port}`;
  await waitReady(process, origin);
  return { process, origin };
}

try {
  const apiPort = await freePort();
  const api = start(['dist/main.js'], 'apps/api', {
    NODE_ENV: 'production',
    PORT: apiPort,
    SCAN_MODE: 'demo',
    ETHEREUM_RPC_URL: '',
    TRUSTED_PROXY_CIDRS: '',
    WEB_ORIGIN: 'http://localhost:3000',
    LOG_LEVEL: 'error',
  });
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  await waitReady(api, `${apiOrigin}/health/ready`);
  const readiness = await (await fetch(`${apiOrigin}/health/ready`)).json();
  assert.deepEqual(readiness, {
    status: 'ready',
    mode: 'demo',
    checks: { configuration: 'ok', blockchain: 'not_required' },
  });
  const realWeb = await startWeb(apiOrigin);
  const missing = await fetch(`${realWeb.origin}/api/v1/coverage`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  await stop(realWeb.process);
  await stop(api);

  // The same production artifact must pick a new operator target after restart.
  for (const marker of ['first-runtime-target', 'second-runtime-target']) {
    let cancelAccepted;
    const accepted = new Promise((resolve) => {
      cancelAccepted = resolve;
    });
    let cancelClosed;
    const closed = new Promise((resolve) => {
      cancelClosed = resolve;
    });
    const upstream = createServer((req, res) => {
      if (req.url === '/api/v1/scans') {
        res.on('close', cancelClosed);
        cancelAccepted();
        return;
      }
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'X-Request-Id': randomUUID(),
        'Retry-After': '2',
      });
      res.end(JSON.stringify({ isolatedTestServer: marker }));
    });
    const target = await listen(upstream);
    const web = await startWeb(target);
    const response = await fetch(`${web.origin}/api/v1/coverage`);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '2');
    assert.deepEqual(await response.json(), { isolatedTestServer: marker });
    assert.equal((await fetch(`${web.origin}/api/health/ready`)).status, 404);

    const client = httpRequest(`${web.origin}/api/v1/scans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    client.on('error', () => {
      /* Expected when the simulated browser disconnects. */
    });
    client.end('{}');
    await Promise.race([
      accepted,
      delay(5000).then(() => {
        throw new Error('Proxy never reached the isolated upstream.');
      }),
    ]);
    client.destroy();
    await Promise.race([
      closed,
      delay(5000).then(() => {
        throw new Error(
          'Production proxy did not cancel upstream after browser disconnect.',
        );
      }),
    ]);
    await stop(web.process);
  }

  const secret = 'foundation-redaction-sentinel';
  const invalidApi = start(['dist/main.js'], 'apps/api', {
    NODE_ENV: 'production',
    SCAN_MODE: 'live',
    ETHEREUM_RPC_URL: `invalid://${secret}`,
    PORT: '3001',
  });
  await Promise.race([
    once(invalidApi.child, 'close'),
    delay(10_000, undefined, { ref: false }).then(() => {
      throw new Error('Invalid API configuration did not fail startup.');
    }),
  ]);
  assert.equal(invalidApi.child.exitCode, 1);
  assert.match(
    invalidApi.output(),
    /Invalid API configuration: ETHEREUM_RPC_URL/,
  );
  assert.ok(!invalidApi.output().includes(secret));

  const invalidWeb = start(
    ['node_modules/next/dist/bin/next', 'start', '--port', await freePort()],
    'apps/web',
    {
      NODE_ENV: 'production',
      API_PROXY_TARGET: `http://user:${secret}@localhost`,
    },
  );
  await Promise.race([
    once(invalidWeb.child, 'close'),
    delay(10_000, undefined, { ref: false }).then(() => {
      throw new Error('Invalid web configuration did not fail startup.');
    }),
  ]);
  assert.notEqual(invalidWeb.child.exitCode, 0);
  assert.match(
    invalidWeb.output(),
    /Invalid web configuration: API_PROXY_TARGET/,
  );
  assert.ok(!invalidWeb.output().includes(secret));

  for (const entry of await readdir(`${root}apps/web/.next/static`, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (entry.isFile() && /\.(js|json|html)$/.test(entry.name)) {
      const text = await readFile(`${entry.parentPath}/${entry.name}`, 'utf8');
      for (const forbidden of ['ETHEREUM_RPC_URL', 'API_PROXY_TARGET', secret])
        assert.ok(
          !text.includes(forbidden),
          `Server-only value leaked into browser artifact: ${forbidden}`,
        );
    }
  }
  console.log(
    'Production smoke passed: health, real API 404 routing, runtime target changes, cancellation, startup redaction, browser artifact inspection.',
  );
} finally {
  for (const child of children)
    if (child.exitCode === null) child.kill('SIGKILL');
  for (const server of servers) {
    server.closeAllConnections();
    server.close();
  }
}
