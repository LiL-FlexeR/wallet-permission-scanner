import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { AppModule } from './app.module.js';
import type { ApiEnvironment } from './config/environment.js';
import { SafeExceptionFilter, sendError } from './common/http/errors.js';

export async function createApp(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(environment),
    {
      bodyParser: false,
      logger: false,
      abortOnError: false,
    },
  );
  const config = app.get(ConfigService).getOrThrow<ApiEnvironment>('app');
  app.disable('x-powered-by');
  app.set(
    'trust proxy',
    config.TRUSTED_PROXY_CIDRS.length ? config.TRUSTED_PROXY_CIDRS : false,
  );
  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      res.setHeader('X-Request-Id', randomUUID());
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Vary', 'Origin');
      // CORS is an exact allowlist, not authentication or original-IP trust.
      if (req.headers.origin === config.WEB_ORIGIN) {
        res.setHeader('Access-Control-Allow-Origin', config.WEB_ORIGIN);
        res.setHeader(
          'Access-Control-Expose-Headers',
          'X-Request-Id, Retry-After',
        );
      }
      next();
    },
  );
  // All media types are bounded, including health requests with non-JSON bodies.
  // Stage 03 adds scan JSON/schema parsing after this byte boundary.
  app.use(express.raw({ type: () => true, limit: 1024, inflate: false }));
  const bodyErrorHandler: ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    next,
  ) => {
    if (!error) return next();
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? error.status
        : 500;
    sendError(
      res,
      status === 413 ? 413 : status === 415 ? 415 : status === 500 ? 500 : 400,
    );
  };
  app.use(bodyErrorHandler);
  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (/^\/health\/(live|ready)\/*$/i.test(req.path)) {
        if (req.method !== 'GET') {
          res.setHeader('Allow', 'GET');
          sendError(res, 405);
          return;
        }
        if (
          Object.keys(req.query).length ||
          (Buffer.isBuffer(req.body) && req.body.length > 0)
        ) {
          sendError(res, 400);
          return;
        }
      }
      next();
    },
  );
  app.useGlobalFilters(new SafeExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
