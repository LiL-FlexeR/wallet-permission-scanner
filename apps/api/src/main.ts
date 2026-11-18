import { ConfigService } from '@nestjs/config';
import { createApp } from './app.js';
import type { ApiEnvironment } from './config/environment.js';

try {
  const app = await createApp();
  const config = app.get(ConfigService).getOrThrow<ApiEnvironment>('app');
  await app.listen(config.PORT, '0.0.0.0');
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
}
