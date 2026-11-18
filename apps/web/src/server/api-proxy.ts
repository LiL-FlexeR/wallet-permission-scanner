import { randomUUID } from 'node:crypto';
import { errorEnvelopeSchema } from '@wps/contracts';
import type { ErrorEnvelope } from '@wps/contracts';

const methods: Record<string, string> = {
  '/api/v1/scans': 'POST',
  '/api/v1/coverage': 'GET',
};
const REQUEST_LIMIT = 1024;
const RESPONSE_LIMIT = 1024 * 1024;
const TIMEOUT_MS = 25_000;

class BodyLimitError extends Error {}

async function readBounded(
  stream: ReadableStream<Uint8Array> | null,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();
  signal.throwIfAborted();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new BodyLimitError();
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

function failure(
  status: number,
  code: ErrorEnvelope['error']['code'],
  message: string,
  extra?: HeadersInit,
): Response {
  const requestId = randomUUID();
  const headers = new Headers(extra);
  headers.set('X-Request-Id', requestId);
  headers.set('Cache-Control', 'no-store');
  const payload = errorEnvelopeSchema.parse({
    requestId,
    error: { code, message, retryable: status >= 500 },
  });
  return Response.json(payload, { status, headers });
}

export async function proxyApiRequest(
  request: Request,
  target: string,
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const url = new URL(request.url);
  const allowedMethod = methods[url.pathname];
  if (!allowedMethod) return failure(404, 'NOT_FOUND', 'Route not found.');
  if (request.method !== allowedMethod)
    return failure(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', {
      Allow: allowedMethod,
    });
  if (url.search)
    return failure(
      400,
      'INVALID_REQUEST',
      'Query parameters are not supported.',
    );
  if (
    request.method === 'POST' &&
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
      'application/json'
  ) {
    return failure(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
  }
  const length = request.headers.get('content-length');
  if (
    length !== null &&
    (!/^\d+$/.test(length) || Number(length) > REQUEST_LIMIT)
  ) {
    return failure(
      413,
      'PAYLOAD_TOO_LARGE',
      'Request body exceeds 1024 bytes.',
    );
  }
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let body: Uint8Array;
    try {
      body = await readBounded(request.body, REQUEST_LIMIT, signal);
    } catch (error) {
      if (error instanceof BodyLimitError)
        return failure(
          413,
          'PAYLOAD_TOO_LARGE',
          'Request body exceeds 1024 bytes.',
        );
      throw error;
    }
    if (request.method === 'GET' && body.length)
      return failure(400, 'INVALID_REQUEST', 'Request body is not supported.');
    // Whitelisting excludes cookies, credentials, untrusted forwarding identity,
    // browser request IDs, and all hop-by-hop request headers.
    const headers = new Headers({ Accept: 'application/json' });
    if (request.method === 'POST')
      headers.set('Content-Type', 'application/json');
    const upstream = await fetch(new URL(url.pathname, target), {
      method: request.method,
      headers,
      ...(request.method === 'POST' ? { body: Buffer.from(body) } : {}),
      signal,
      redirect: 'manual',
      cache: 'no-store',
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      throw new Error('Upstream redirect rejected.');
    }
    const bytes = await readBounded(upstream.body, RESPONSE_LIMIT, signal);
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
    for (const name of ['content-type', 'x-request-id', 'retry-after']) {
      const value = upstream.headers.get(name);
      if (value !== null) responseHeaders.set(name, value);
    }
    return new Response(
      [204, 205, 304].includes(upstream.status) ? null : Buffer.from(bytes),
      {
        status: upstream.status,
        headers: responseHeaders,
      },
    );
  } catch {
    return failure(503, 'SERVICE_NOT_READY', 'API service is unavailable.');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
