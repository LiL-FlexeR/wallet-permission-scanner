import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApp } from './app.js';
import type { ApiEnvironment } from './config/environment.js';
import { installShutdown } from './shutdown.js';

let app: NestExpressApplication | undefined;
let stop: ReturnType<typeof installShutdown> | undefined;
try {
  app = await createApp();
  const config = app.get(ConfigService).getOrThrow<ApiEnvironment>('app');
  await app.listen(config.PORT, '0.0.0.0');
  // Before listen completes, normal signal termination safely ends startup.
  stop = installShutdown(app);
  if (['debug', 'info'].includes(config.LOG_LEVEL)) {
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'api_started',
        port: config.PORT,
      }),
    );
  }
} catch (error) {
  const message =
    error instanceof Error &&
    error.message.startsWith('Invalid API configuration:')
      ? error.message
      : 'API startup failed.';
  console.error(
    JSON.stringify({ level: 'error', event: 'startup_failed', message }),
  );
  process.exitCode = 1;
  // Failed listen/init may already have started readiness timers and transports.
  if (app) await (stop ?? installShutdown(app))(1);
}
