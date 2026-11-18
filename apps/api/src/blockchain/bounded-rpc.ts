import { createPublicClient, custom } from 'viem';
import { mainnet } from 'viem/chains';
import { RpcFault } from './rpc-errors.js';
import { RPC_LIMITS, RpcPermits } from './work-budget.js';
import type { WorkBudget } from './work-budget.js';

export type RpcMethod =
  'eth_chainId' | 'eth_getBlockByNumber' | 'eth_call' | 'eth_getCode';
export type Fetch = typeof globalThis.fetch;
const methods = new Set<string>([
  'eth_chainId',
  'eth_getBlockByNumber',
  'eth_call',
  'eth_getCode',
]);
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const quantity = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v) &&
  v.length <= 66;
const data = (v: unknown): v is string =>
  typeof v === 'string' && /^0x(?:[0-9a-f]{2})*$/i.test(v);

function retryDelay(header: string | null, now: number): number | undefined {
  if (!header) return undefined;
  if (/^\d+$/.test(header))
    return Math.min(Number(header) * 1000, Number.MAX_SAFE_INTEGER);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

/** Owns the ONLY retry layer and the process-wide RPC permits. */
export class BoundedRpc {
  private id = 0;
  constructor(
    private readonly url: string,
    readonly permits = new RpcPermits(),
    private readonly fetch: Fetch = (...args) => globalThis.fetch(...args),
  ) {}

  client(context: WorkBudget, retry: boolean) {
    return createPublicClient({
      chain: mainnet,
      cacheTime: 0,
      batch: { multicall: false },
      ccipRead: false,
      transport: custom(
        {
          request: ({ method, params }) =>
            this.request(method, params, context, retry),
        },
        { retryCount: 0 },
      ),
    });
  }

  async request(
    method: string,
    params: unknown,
    context: WorkBudget,
    retry: boolean,
  ): Promise<unknown> {
    if (!methods.has(method)) throw new RpcFault('RPC_UNAVAILABLE');
    for (let attempt = 0; ; attempt++) {
      context.check();
      try {
        return await this.attempt(method as RpcMethod, params, context);
      } catch (error) {
        const fault =
          error instanceof RpcFault ? error : new RpcFault('RPC_UNAVAILABLE');
        context.check();
        if (!retry || attempt >= 1 || !fault.transient) throw fault;
        const jitter = 150 + Math.floor(context.clock.random() * 101);
        const delay = Math.max(jitter, fault.retryAfterMs ?? 0);
        // Leave a full per-attempt budget; never sleep through the total deadline.
        if (delay + RPC_LIMITS.attemptMs >= context.remaining()) throw fault;
        await context.sleep(delay);
      }
    }
  }

  private async attempt(
    method: RpcMethod,
    params: unknown,
    context: WorkBudget,
  ): Promise<unknown> {
    const release = await this.permits.acquire(context.signal);
    const attempt = context.child(RPC_LIMITS.attemptMs);
    try {
      context.check();
      const id = ++this.id;
      const response = await this.fetch(this.url, {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        signal: attempt.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params: params ?? [],
        }),
      });
      const providerDelay = retryDelay(
        response.headers.get('retry-after'),
        context.clock.unixMs(),
      );
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429)
          throw new RpcFault('PROVIDER_RATE_LIMITED', true, providerDelay);
        throw new RpcFault(
          'RPC_UNAVAILABLE',
          [500, 502, 503, 504].includes(response.status),
          providerDelay,
        );
      }
      const length = response.headers.get('content-length');
      if (
        length &&
        /^\d+$/.test(length) &&
        Number(length) > RPC_LIMITS.responseBytes
      ) {
        await response.body?.cancel();
        throw new RpcFault('INVALID_RETURN_DATA');
      }
      if (!response.body) throw new RpcFault('INVALID_RETURN_DATA');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > RPC_LIMITS.responseBytes) {
            await reader.cancel();
            throw new RpcFault('INVALID_RETURN_DATA');
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      context.check();
      attempt.check();
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        );
      } catch {
        throw new RpcFault('INVALID_RETURN_DATA');
      }
      if (
        !record(payload) ||
        payload.jsonrpc !== '2.0' ||
        payload.id !== id ||
        'result' in payload === 'error' in payload
      )
        throw new RpcFault('INVALID_RETURN_DATA');
      if ('error' in payload) {
        const error = payload.error;
        if (!record(error) || !Number.isInteger(error.code))
          throw new RpcFault('INVALID_RETURN_DATA');
        // Inspect only to classify; no provider text/data/URL is retained in any error.
        if (
          error.code === 3 ||
          (error.code === -32000 &&
            typeof error.message === 'string' &&
            /^execution reverted\b/i.test(error.message))
        )
          throw new RpcFault('CONTRACT_REVERT');
        if (error.code === 429 || error.code === -32005)
          throw new RpcFault('PROVIDER_RATE_LIMITED', true, providerDelay);
        if (
          method === 'eth_getBlockByNumber' &&
          (error.code === -32601 || error.code === -32602)
        )
          throw new RpcFault('INVALID_RETURN_DATA');
        throw new RpcFault(
          'RPC_UNAVAILABLE',
          error.code === -32603 || error.code === -32002,
          providerDelay,
        );
      }
      const value = payload.result;
      if (method === 'eth_chainId' && !quantity(value))
        throw new RpcFault('INVALID_RETURN_DATA');
      if (
        method === 'eth_getBlockByNumber' &&
        (!record(value) ||
          !quantity(value.number) ||
          !quantity(value.timestamp) ||
          typeof value.hash !== 'string' ||
          !/^0x[0-9a-f]{64}$/i.test(value.hash))
      )
        throw new RpcFault('INVALID_RETURN_DATA');
      if ((method === 'eth_call' || method === 'eth_getCode') && !data(value))
        throw new RpcFault('INVALID_RETURN_DATA');
      attempt.check();
      return value;
    } catch (error) {
      if (context.signal.aborted || context.remaining() <= 0)
        throw new RpcFault('DEADLINE_EXCEEDED');
      if (attempt.signal.aborted) throw new RpcFault('RPC_TIMEOUT', true);
      if (error instanceof RpcFault) throw error;
      throw new RpcFault('RPC_UNAVAILABLE', true);
    } finally {
      // Abort before releasing; no detached Promise.race or in-flight fetch survives.
      attempt.controller.abort();
      attempt.dispose();
      release();
    }
  }
}
