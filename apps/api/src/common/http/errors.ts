import { randomUUID } from 'node:crypto';
import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { errorEnvelopeSchema } from '@wps/contracts';
import type { ErrorCode, ErrorEnvelope } from '@wps/contracts';
import type { Response } from 'express';

export const errorDefinitions: Record<
  ErrorCode,
  { status: number; message: string; retryable: boolean }
> = {
  INVALID_REQUEST: {
    status: 400,
    message: 'Invalid request.',
    retryable: false,
  },
  INVALID_ADDRESS: {
    status: 400,
    message: 'Provide a valid nonzero Ethereum address.',
    retryable: false,
  },
  NOT_FOUND: { status: 404, message: 'Route not found.', retryable: false },
  METHOD_NOT_ALLOWED: {
    status: 405,
    message: 'Method not allowed.',
    retryable: false,
  },
  PAYLOAD_TOO_LARGE: {
    status: 413,
    message: 'Request body exceeds 1024 bytes.',
    retryable: false,
  },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    message: 'Unsupported media type.',
    retryable: false,
  },
  RATE_LIMITED: {
    status: 429,
    message: 'Request quota exceeded. Try again later.',
    retryable: true,
  },
  SCAN_CAPACITY_EXCEEDED: {
    status: 503,
    message: 'Scan capacity is busy. Try again later.',
    retryable: true,
  },
  CHAIN_MISMATCH: {
    status: 503,
    message: 'The configured provider is not on Ethereum mainnet.',
    retryable: false,
  },
  SNAPSHOT_UNAVAILABLE: {
    status: 503,
    message: 'A recent finalized snapshot is unavailable.',
    retryable: true,
  },
  RPC_UNAVAILABLE: {
    status: 503,
    message: 'Blockchain reads are unavailable. Try again later.',
    retryable: true,
  },
  SERVICE_NOT_READY: {
    status: 503,
    message: 'Service is not ready. Try again later.',
    retryable: true,
  },
  SCAN_TIMEOUT: {
    status: 504,
    message: 'The scan deadline expired without a readable allowance.',
    retryable: true,
  },
  INTERNAL_ERROR: {
    status: 500,
    message: 'Internal server error.',
    retryable: false,
  },
};
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly retryAfter?: number,
  ) {
    super(code);
  }
}
export function errorPayload(
  code: ErrorCode,
  requestId: string,
): ErrorEnvelope {
  const { message, retryable } = errorDefinitions[code];
  return errorEnvelopeSchema.parse({
    requestId,
    error: {
      code,
      message,
      retryable,
      ...(code === 'INVALID_ADDRESS'
        ? {
            details: [
              { field: 'address', issue: 'invalid_format_or_checksum' },
            ],
          }
        : {}),
    },
  });
}
export function sendError(
  response: Response,
  failure: number | ApiError,
): void {
  if (response.destroyed || response.headersSent) return;
  const code =
    failure instanceof ApiError
      ? failure.code
      : ((Object.keys(errorDefinitions) as ErrorCode[]).find(
          (key) => errorDefinitions[key].status === failure,
        ) ?? 'INTERNAL_ERROR');
  const requestId = String(response.getHeader('X-Request-Id') ?? randomUUID());
  response.setHeader('X-Request-Id', requestId);
  response.setHeader('Cache-Control', 'no-store');
  if (code === 'SCAN_CAPACITY_EXCEEDED' || code === 'RATE_LIMITED')
    response.setHeader(
      'Retry-After',
      code === 'SCAN_CAPACITY_EXCEEDED'
        ? 1
        : Math.max(
            1,
            Math.ceil(
              failure instanceof ApiError ? (failure.retryAfter ?? 1) : 1,
            ),
          ),
    );
  response
    .status(errorDefinitions[code].status)
    .json(errorPayload(code, requestId));
}

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const failure =
      exception instanceof ApiError
        ? exception
        : exception instanceof HttpException && exception.getStatus() < 500
          ? exception.getStatus()
          : 500;
    const response = host.switchToHttp().getResponse<Response>();
    if (failure === 500)
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'request_failed',
          requestId: response.getHeader('X-Request-Id'),
        }),
      );
    sendError(response, failure);
  }
}
