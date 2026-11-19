import { RISK_POLICY_VERSION, warningFields } from '@wps/contracts';
import type {
  CoverageResponse,
  FieldWarning,
  PermissionRecord,
  SpenderInfo,
} from '@wps/contracts';
import type {
  EthereumRead,
  ReadResult,
} from '../blockchain/ethereum-reader.js';
import { formatExact, uint256 } from '../blockchain/quantities.js';
import type { Registry, RegistryEntity } from '../registry/registry.js';
import { assessPermission } from '../risk/assess-permission.js';

export function mapSpender(entity: RegistryEntity): SpenderInfo {
  return {
    ...entity,
    explorerUrl: `https://etherscan.io/address/${entity.address}`,
  } as SpenderInfo;
}
export function mapCoverage(
  registry: Registry,
  source: 'live' | 'demo',
): CoverageResponse {
  return {
    chainId: 1,
    source,
    registryVersion: registry.registryVersion,
    riskPolicyVersion: RISK_POLICY_VERSION,
    strategy: 'configured-pairs',
    limitation: registry.limitation,
    configuredPairs: registry.pairs.length,
    pairs: registry.pairs.map((p) => ({
      id: p.id,
      tokenAddress: p.token.address,
      spender: mapSpender(p.spender),
    })),
  };
}
const value = <T>(field: ReadResult<T>): T | null =>
  field.ok ? field.value : null;
const amount = (field: ReadResult<bigint>, decimals: number | null) =>
  field.ok
    ? {
        raw: uint256(field.value).toString(),
        formatted: formatExact(field.value, decimals),
      }
    : null;

/** Registry is captured once at admission. Never fill gaps in a reader's tuple set. */
export function mapPermissions(registry: Registry, read: EthereumRead) {
  const pairs = new Map(read.pairs.map((p) => [p.pairId, p]));
  const tokens = new Map(read.tokens.map((t) => [t.address.toLowerCase(), t]));
  if (
    read.registryVersion !== registry.registryVersion ||
    pairs.size !== registry.pairs.length ||
    pairs.size !== read.pairs.length ||
    tokens.size !== read.tokens.length ||
    tokens.size !== new Set(registry.pairs.map((p) => p.token.address)).size
  )
    throw new Error('INCONSISTENT_READER_RESULT');
  const warnings: FieldWarning[] = [];
  const permissions: PermissionRecord[] = registry.pairs.map((pair) => {
    const result = pairs.get(pair.id);
    const token = tokens.get(pair.token.address.toLowerCase());
    if (
      !result ||
      !token ||
      result.tokenAddress !== pair.token.address ||
      result.spenderAddress !== pair.spender.address
    )
      throw new Error('INCONSISTENT_READER_RESULT');
    const fields = {
      allowance: result.allowance,
      balance: token.balance,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
    };
    for (const field of warningFields)
      if (!fields[field].ok)
        warnings.push({ pairId: pair.id, field, code: fields[field].code });
    const decimals = value(token.decimals);
    const allowance = value(result.allowance);
    return {
      id: pair.id,
      token: {
        address: pair.token.address,
        name: value(token.name),
        symbol: value(token.symbol),
        decimals,
        explorerUrl: `https://etherscan.io/token/${pair.token.address}`,
      },
      spender: mapSpender(pair.spender),
      allowance: amount(result.allowance, decimals),
      balance: amount(token.balance, decimals),
      activity:
        allowance === null
          ? 'unknown'
          : allowance === 0n
            ? 'inactive'
            : 'active',
      risk: assessPermission(
        allowance,
        value(token.balance),
        pair.spender.identity,
      ),
    };
  });
  const active = permissions.filter((p) => p.activity === 'active').length;
  const inactive = permissions.filter((p) => p.activity === 'inactive').length;
  const unknown = permissions.length - active - inactive;
  return {
    permissions,
    warnings,
    status: warnings.length ? ('partial' as const) : ('complete' as const),
    coverage: {
      strategy: 'configured-pairs' as const,
      limitation: registry.limitation,
      configuredPairs: permissions.length,
      checkedPairs: active + inactive,
      failedPairs: unknown,
    },
    summary: { active, inactive, unknown },
  };
}
