import { randomUUID } from 'node:crypto';
import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { ErrorEnvelope } from '@wps/contracts';
import type { Response } from 'express';

const errors: Record<number, ErrorEnvelope['error']> = {
  400: {
    code: 'INVALID_REQUEST',
    message: 'Invalid request.',
    retryable: false,
  },
  404: { code: 'NOT_FOUND', message: 'Route not found.', retryable: false },
  405: {
    code: 'METHOD_NOT_ALLOWED',
    message: 'Method not allowed.',
    retryable: false,
  },
  413: {
    code: 'PAYLOAD_TOO_LARGE',
    message: 'Request body exceeds 1024 bytes.',
    retryable: false,
  },
  415: {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'Unsupported media type.',
    retryable: false,
  },
  500: {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error.',
    retryable: false,
  },
};

export function sendError(response: Response, status: number): void {
  const requestId = String(response.getHeader('X-Request-Id') ?? randomUUID());
  response.setHeader('X-Request-Id', requestId);
  response.setHeader('Cache-Control', 'no-store');
  response
    .status(status)
    .json({ requestId, error: errors[status] ?? errors[500] });
}

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const response = host.switchToHttp().getResponse<Response>();
    if (status >= 500) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'request_failed',
          requestId: response.getHeader('X-Request-Id'),
        }),
      );
    }
    sendError(response, status);
  }
}
