import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { livenessSchema, readinessSchema } from '@wps/contracts';
import type { Liveness, Readiness } from '@wps/contracts';
import type { ApiEnvironment } from '../config/environment.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  @Get('live')
  live(): Liveness {
    return livenessSchema.parse({ status: 'ok' });
  }

  @Get('ready')
  ready(): Readiness {
    return readinessSchema.parse({
      status: 'ready',
      mode: this.config.getOrThrow<ApiEnvironment>('app').SCAN_MODE,
      checks: { configuration: 'ok', blockchain: 'not_required' },
    });
  }
}
