import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateApiEnvironment } from './config/environment.js';
import { HealthModule } from './health/health.module.js';

@Module({})
export class AppModule {
  static register(environment: NodeJS.ProcessEnv): DynamicModule {
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
      ],
    };
  }
}
