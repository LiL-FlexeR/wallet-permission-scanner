import { createApp } from '../../apps/api/dist/app.js';
import { installShutdown } from '../../apps/api/dist/shutdown.js';
import { ETHEREUM_READER } from '../../apps/api/dist/blockchain/ethereum-reader.js';
import { ReaderFailure } from '../../apps/api/dist/blockchain/rpc-errors.js';

// Process-local fixture; never packaged or selected by a production HTTP request.
const app = await createApp({
  NODE_ENV: 'production',
  SCAN_MODE: 'demo',
  LOG_LEVEL: 'error',
});
app.get(ETHEREUM_READER).read = async ({ context }) => {
  process.send({ type: 'entered' });
  await new Promise((resolve) =>
    context.signal.addEventListener('abort', resolve, { once: true }),
  );
  process.send({ type: 'aborted' });
  if (process.argv[2] === 'stuck') await new Promise(() => {});
  process.send({ type: 'settled' });
  throw new ReaderFailure('CANCELLED');
};
installShutdown(app);
await app.listen(0, '127.0.0.1');
process.send({ type: 'ready', port: app.getHttpServer().address().port });
// IPC should not keep a successfully stopped application alive.
process.channel.unref();
