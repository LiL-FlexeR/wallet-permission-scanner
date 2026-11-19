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
import { ApiError } from './common/http/errors.js';
import { clientIp, RouteRateLimiter } from './common/http/rate-limiter.js';
import { systemClock } from './blockchain/work-budget.js';
import type { Clock } from './blockchain/work-budget.js';
import { installApiDocs } from './docs/openapi.js';

export async function createApp(
  environment: NodeJS.ProcessEnv = process.env,
  clock: Clock = systemClock,
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(environment, clock),
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
  const limiter = app.get(RouteRateLimiter);
  // Count attempts before parsing bodies, rejecting media types or running RPC.
  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      const scan = /^\/api\/v1\/scans\/*$/i.test(req.path);
      const coverage = /^\/api\/v1\/coverage\/*$/i.test(req.path);
      const health = /^\/health\/(live|ready)\/*$/i.test(req.path);
      try {
        if (scan || coverage)
          limiter.consume(clientIp(req), scan ? 'scans' : 'coverage');
        if (scan || coverage || health) {
          const method = scan ? 'POST' : 'GET';
          if (req.method !== method) {
            res.setHeader('Allow', method);
            sendError(res, 405);
            return;
          }
          if (req.originalUrl.includes('?')) {
            sendError(res, 400);
            return;
          }
          if (
            scan &&
            req.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
              'application/json'
          ) {
            sendError(res, 415);
            return;
          }
        }
        next();
      } catch (error) {
        sendError(res, error instanceof ApiError ? error : 500);
      }
    },
  );
  // All media types are bounded, including coverage/health requests with bodies.
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
      if (/^(\/health\/(live|ready)|\/api\/v1\/coverage)\/*$/i.test(req.path)) {
        if (Buffer.isBuffer(req.body) && req.body.length > 0) {
          sendError(res, 400);
          return;
        }
      }
      next();
    },
  );
  app.useGlobalFilters(new SafeExceptionFilter());
  if (config.NODE_ENV !== 'production') installApiDocs(app);
  app.enableShutdownHooks();
  return app;
}
