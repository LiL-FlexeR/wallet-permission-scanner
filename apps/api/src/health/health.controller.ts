import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { livenessSchema, readinessSchema } from '@wps/contracts';
import type { Liveness, Readiness } from '@wps/contracts';
import type { ApiEnvironment } from '../config/environment.js';
import type { Response } from 'express';
import { BlockchainReadiness } from '../blockchain/blockchain-readiness.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(BlockchainReadiness)
    private readonly blockchain: BlockchainReadiness,
  ) {}

  @Get('live')
  live(): Liveness {
    return livenessSchema.parse({ status: 'ok' });
  }

  @Get('ready')
  ready(@Res({ passthrough: true }) response: Response): Readiness {
    const blockchain = this.blockchain.status;
    const ready = blockchain !== 'unavailable';
    response.status(ready ? 200 : 503);
    return readinessSchema.parse({
      status: ready ? 'ready' : 'not_ready',
      mode: this.config.getOrThrow<ApiEnvironment>('app').SCAN_MODE,
      checks: { configuration: 'ok', blockchain },
    });
  }
}
