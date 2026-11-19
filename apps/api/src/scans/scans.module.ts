import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { BlockchainModule } from '../blockchain/blockchain.module.js';
import { systemClock } from '../blockchain/work-budget.js';
import type { Clock } from '../blockchain/work-budget.js';
import { ScanRequestPipe } from '../common/http/scan-request.pipe.js';
import { RouteRateLimiter } from '../common/http/rate-limiter.js';
import { ScansController } from './scans.controller.js';
import { SCAN_CLOCK, ScansService } from './scans.service.js';

@Module({})
export class ScansModule {
  static register(clock: Clock = systemClock): DynamicModule {
    return {
      module: ScansModule,
      imports: [BlockchainModule],
      controllers: [ScansController],
      providers: [
        ScansService,
        ScanRequestPipe,
        { provide: SCAN_CLOCK, useValue: clock },
        {
          provide: RouteRateLimiter,
          useFactory: () => new RouteRateLimiter(clock),
        },
      ],
      exports: [ScansService, RouteRateLimiter],
    };
  }
}
