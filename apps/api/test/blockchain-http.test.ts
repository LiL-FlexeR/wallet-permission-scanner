import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { BoundedRpc } from '../src/blockchain/bounded-rpc.js';
import { WorkBudget } from '../src/blockchain/work-budget.js';
import { FakeClock } from './blockchain-fixtures.js';

test('native fetch aborts real HTTP sockets on timeout, cancellation and streamed response overflow', async (t) => {
  for (const scenario of [
    'timeout',
    'cancel',
    'overflow',
    'redirect',
  ] as const) {
    await t.test(scenario, async () => {
      let accepted!: () => void;
      let closed!: () => void;
      const acceptance = new Promise<void>((resolve) => {
        accepted = resolve;
      });
      const closure = new Promise<void>((resolve) => {
        closed = resolve;
      });
      let requests = 0;
      const server = createServer((_req, res) => {
        requests++;
        res.on('close', closed);
        if (scenario === 'overflow') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          for (let i = 0; i < 17; i++) res.write('x'.repeat(65_536));
        } else if (scenario === 'redirect') {
          res.writeHead(302, { Location: '/redirected' });
          res.end();
        }
        accepted();
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const clock = new FakeClock();
      const context = new WorkBudget(15_000, clock);
      const rpc = new BoundedRpc(`http://127.0.0.1:${address.port}`);
      try {
        const code =
          scenario === 'timeout'
            ? 'RPC_TIMEOUT'
            : scenario === 'cancel'
              ? 'DEADLINE_EXCEEDED'
              : scenario === 'overflow'
                ? 'INVALID_RETURN_DATA'
                : 'RPC_UNAVAILABLE';
        const rejected = assert.rejects(
          rpc.request('eth_chainId', [], context, false),
          (e: unknown) => e instanceof Error && e.message === code,
        );
        await acceptance;
        if (scenario === 'timeout') await clock.advance(3000);
        if (scenario === 'cancel') context.controller.abort();
        await rejected;
        await closure;
        assert.equal(requests, 1);
        assert.equal(rpc.permits.inFlight, 0);
      } finally {
        context.dispose();
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    });
  }
});
