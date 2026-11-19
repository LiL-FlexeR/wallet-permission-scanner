import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateApiEnvironment } from './config/environment.js';
import { HealthModule } from './health/health.module.js';
import { ScansModule } from './scans/scans.module.js';
import { systemClock } from './blockchain/work-budget.js';
import type { Clock } from './blockchain/work-budget.js';

@Module({})
export class AppModule {
  static register(
    environment: NodeJS.ProcessEnv,
    clock: Clock = systemClock,
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          skipProcessEnv: true,
          validate: () => ({ app: validateApiEnvironment(environment) }),
        }),
        HealthModule,
        ScansModule.register(clock),
      ],
    };
  }
}
