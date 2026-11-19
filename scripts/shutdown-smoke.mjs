import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

for (const scenario of ['cooperative', 'stuck']) {
  const child = fork(
    new URL('../tests/support/shutdown-server.mjs', import.meta.url),
    [scenario],
    { silent: true },
  );
  let logs = '';
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (data) => {
      logs += data;
    });
  const events = [];
  child.on('message', (event) => events.push(event.type));
  const message = async (type) => {
    for (;;) {
      const [event] = await once(child, 'message');
      if (event.type === type) return event;
    }
  };
  let client;
  try {
    const { port } = await Promise.race([
      message('ready'),
      delay(10_000, null, { ref: false }).then(() => {
        throw Error('Shutdown fixture did not start');
      }),
    ]);
    const entered = message('entered');
    client = request(`http://127.0.0.1:${port}/api/v1/scans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    client.on('error', () => {});
    client.end(JSON.stringify({ address: `0x${'3'.repeat(40)}` }));
    await entered;
    const closed = once(child, 'close');
    const start = Date.now();
    child.kill('SIGTERM');
    const [code, signal] = await Promise.race([
      closed,
      delay(10_000, null, { ref: false }).then(() => {
        throw Error('Shutdown exceeded container grace period');
      }),
    ]);
    assert.equal(signal, null);
    assert.equal(code, scenario === 'stuck' ? 1 : 0);
    assert.ok(events.includes('aborted'));
    assert.equal(events.includes('settled'), scenario === 'cooperative');
    if (scenario === 'stuck') {
      assert.match(logs, /shutdown_timeout/);
      assert.ok(Date.now() - start >= 7900);
    } else assert.ok(Date.now() - start < 8000);
  } finally {
    client?.destroy();
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}
console.log(
  'Shutdown smoke passed: SIGTERM aborts admitted work and exits cleanly; an uncooperative reader is bounded by the eight-second watchdog.',
);
