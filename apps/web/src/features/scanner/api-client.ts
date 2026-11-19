import {
  coverageResponseSchema,
  errorEnvelopeSchema,
  scanRequestSchema,
  scanSuccessSchema,
  type ErrorCode,
} from '@wps/contracts';
import type { z } from 'zod';

const messages: Record<ErrorCode, string> = {
  INVALID_REQUEST: 'The service rejected the request. Reload and try again.',
  INVALID_ADDRESS:
    'Enter a valid nonzero Ethereum address with a valid checksum.',
  NOT_FOUND: 'The scan service could not be found.',
  METHOD_NOT_ALLOWED: 'The service does not support this request.',
  PAYLOAD_TOO_LARGE: 'The request was too large. Enter one public address.',
  UNSUPPORTED_MEDIA_TYPE: 'The service could not read this request.',
  INTERNAL_ERROR: 'The service could not complete the scan.',
  SERVICE_NOT_READY: 'The service is not ready. Try again later.',
  RATE_LIMITED: 'Too many requests. Wait before trying again.',
  SCAN_CAPACITY_EXCEEDED: 'The service is busy. Wait before trying again.',
  CHAIN_MISMATCH:
    'The service could not verify Ethereum mainnet. Operator action is required.',
  SNAPSHOT_UNAVAILABLE:
    'A recent finalized snapshot is unavailable. Try again later.',
  RPC_UNAVAILABLE: 'Blockchain reads are unavailable. Try again later.',
  SCAN_TIMEOUT:
    'The service could not finish within its time limit. Try again later.',
};

export class ScannerError extends Error {
  constructor(
    public readonly code:
      ErrorCode | 'INTEGRATION' | 'TIMEOUT' | 'NETWORK' | 'CANCELLED',
    message: string,
    public readonly requestId: string | null = null,
    public readonly retryAt = 0,
  ) {
    super(message);
    this.name = 'ScannerError';
  }
}

export function retryTime(value: string | null, now: number): number {
  if (!value) return 0;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) &&
      seconds <= (Number.MAX_SAFE_INTEGER - now) / 1000
      ? now + seconds * 1000
      : Number.MAX_SAFE_INTEGER;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(now, date) : 0;
}

type Options = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
};

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit,
  { signal, fetcher = fetch, timeoutMs = 20_000, now = Date.now }: Options,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let requestId: string | null = null;
  let retryAt = 0;
  try {
    controller.signal.throwIfAborted();
    const response = await fetcher(path, {
      ...init,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    const headerId = response.headers.get('X-Request-Id');
    requestId =
      headerId &&
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(headerId)
        ? headerId
        : null;
    if (response.status === 429 || response.status === 503) {
      retryAt = retryTime(response.headers.get('Retry-After'), now());
    }
    if (
      !response.headers
        .get('Content-Type')
        ?.toLowerCase()
        .includes('application/json')
    ) {
      throw new ScannerError(
        'INTEGRATION',
        'The service returned an unreadable response. Reload or try again later.',
        requestId,
        retryAt,
      );
    }
    const body: unknown = await response.json();
    controller.signal.throwIfAborted();
    if (!response.ok) {
      const parsed = errorEnvelopeSchema.safeParse(body);
      if (parsed.success) {
        throw new ScannerError(
          parsed.data.error.code,
          messages[parsed.data.error.code],
          parsed.data.requestId,
          retryAt,
        );
      }
    } else {
      const parsed = schema.safeParse(body);
      if (parsed.success) return parsed.data;
    }
    throw new ScannerError(
      'INTEGRATION',
      'Compatibility issue: the response does not match the supported schema or risk policy. Reload or contact the operator.',
      requestId,
      retryAt,
    );
  } catch (error) {
    if (timedOut)
      throw new ScannerError(
        'TIMEOUT',
        'The request timed out after 20 seconds. Try again deliberately.',
        requestId,
        retryAt,
      );
    if (signal?.aborted) throw new ScannerError('CANCELLED', 'Scan cancelled.');
    if (error instanceof ScannerError) throw error;
    if (error instanceof SyntaxError)
      throw new ScannerError(
        'INTEGRATION',
        'The service returned malformed JSON. Try again later.',
        requestId,
        retryAt,
      );
    throw new ScannerError(
      'NETWORK',
      'The service could not be reached. Check your connection and try again.',
      requestId,
      retryAt,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function loadCoverage(options: Options = {}) {
  return request(
    '/api/v1/coverage',
    coverageResponseSchema,
    { method: 'GET' },
    options,
  );
}

export async function scanAddress(address: string, options: Options = {}) {
  const input = scanRequestSchema.safeParse({ address });
  if (!input.success)
    throw new ScannerError('INVALID_ADDRESS', messages.INVALID_ADDRESS);
  const result = await request(
    '/api/v1/scans',
    scanSuccessSchema,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.data),
    },
    options,
  );
  if (result.walletAddress !== input.data.address) {
    throw new ScannerError(
      'INTEGRATION',
      'Compatibility issue: the response belongs to a different address.',
      result.requestId,
    );
  }
  return result;
}
