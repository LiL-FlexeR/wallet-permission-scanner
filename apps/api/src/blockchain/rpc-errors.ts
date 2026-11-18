export type FieldErrorCode =
  | 'CONTRACT_REVERT'
  | 'RPC_TIMEOUT'
  | 'PROVIDER_RATE_LIMITED'
  | 'RPC_UNAVAILABLE'
  | 'INVALID_RETURN_DATA'
  | 'DEADLINE_EXCEEDED';

export class RpcFault extends Error {
  constructor(
    readonly code: FieldErrorCode,
    readonly transient = false,
    readonly retryAfterMs?: number,
  ) {
    super(code);
    this.name = 'RpcFault';
  }
}

export class ReaderFailure extends Error {
  constructor(
    readonly code:
      | 'CHAIN_MISMATCH'
      | 'SNAPSHOT_UNAVAILABLE'
      | 'RPC_UNAVAILABLE'
      | 'SCAN_TIMEOUT'
      | 'CANCELLED'
      | 'SCAN_CAPACITY_EXCEEDED'
      | 'SERVICE_NOT_READY',
  ) {
    super(code);
    this.name = 'ReaderFailure';
  }
}

/** viem wraps transport faults; retain only controlled codes, never provider causes. */
export function normalizeRpcError(error: unknown): RpcFault {
  let current = error;
  for (let depth = 0; depth < 12 && current instanceof Error; depth++) {
    if (current instanceof RpcFault) return current;
    if (current.name === 'ContractFunctionRevertedError')
      return new RpcFault('CONTRACT_REVERT');
    current = current.cause;
  }
  return new RpcFault('INVALID_RETURN_DATA');
}
