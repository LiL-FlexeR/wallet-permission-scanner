import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../apps/api/dist/app.js';
import { ETHEREUM_READER } from '../../apps/api/dist/blockchain/ethereum-reader.js';
import { ScansService } from '../../apps/api/dist/scans/scans.service.js';
import { fixtureReader } from '../fixtures/reader.mjs';

// This executable is outside both application builds. Scenario is immutable for
// the process lifetime, selected by the test parent, never by an HTTP request.
const api = await createApp({
  NODE_ENV: 'production',
  SCAN_MODE: 'demo',
  LOG_LEVEL: 'error',
  TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128',
});
const service = api.get(ScansService);
api.get(ETHEREUM_READER).read = fixtureReader(process.argv[2], (type) => {
  process.send?.({ type, inFlight: service.inFlight });
});
await api.listen(0, '127.0.0.1');
const target = `http://127.0.0.1:${api.getHttpServer().address().port}`;
process.env.NODE_ENV = 'production';
process.env.API_PROXY_TARGET = target;
process.env.NEXT_TELEMETRY_DISABLED = '1';
const webDirectory = fileURLToPath(new URL('../../apps/web/', import.meta.url));
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const web = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  {
    cwd: webDirectory,
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit'],
  },
);
let closing = false;
async function close(code = 0) {
  if (closing) return;
  closing = true;
  web.kill('SIGTERM');
  await api.close();
  if (web.exitCode === null) await once(web, 'close');
  process.exit(code);
}
process.once('SIGTERM', () => void close());
process.once('disconnect', () => void close());

try {
  let ready = false;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (web.exitCode !== null) throw new Error('Next fixture server exited');
    try {
      const response = await fetch(origin, {
        signal: AbortSignal.timeout(1000),
      });
      await response.arrayBuffer();
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Still starting. */
    }
    await delay(50);
  }
  if (!ready) throw new Error('Next fixture server did not become ready');
  process.send?.({ type: 'ready', origin, target });
} catch (error) {
  console.error(error);
  await close(1);
}

process.on('message', (message) => {
  if (message === 'state')
    process.send?.({ type: 'state', inFlight: service.inFlight });
});
