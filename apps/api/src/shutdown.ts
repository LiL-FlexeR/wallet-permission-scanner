import type { NestExpressApplication } from '@nestjs/platform-express';
import { BlockchainReadiness } from './blockchain/blockchain-readiness.js';
import { ScansService } from './scans/scans.service.js';

export const SHUTDOWN_MS = 8_000;

/** Stop admission/probes synchronously, abort work, then close HTTP connections. */
export function installShutdown(
  app: NestExpressApplication,
): (exitCode?: number) => Promise<void> {
  let stopping: Promise<void> | undefined;
  const stop = (exitCode = 0): Promise<void> => {
    if (exitCode !== 0) process.exitCode = exitCode;
    if (stopping) return stopping;
    stopping = close();
    return stopping;
  };
  const onSignal = () => void stop();
  const close = async () => {
    const deadline = setTimeout(() => {
      console.error(
        JSON.stringify({ level: 'error', event: 'shutdown_timeout' }),
      );
      process.exit(1);
    }, SHUTDOWN_MS);
    try {
      await Promise.all([
        app.get(ScansService).onModuleDestroy(),
        app.get(BlockchainReadiness).onModuleDestroy(),
      ]);
      await app.close();
    } catch {
      console.error(
        JSON.stringify({ level: 'error', event: 'shutdown_failed' }),
      );
      process.exit(1);
    } finally {
      clearTimeout(deadline);
      process.off('SIGTERM', onSignal);
      process.off('SIGINT', onSignal);
    }
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
  return stop;
}
