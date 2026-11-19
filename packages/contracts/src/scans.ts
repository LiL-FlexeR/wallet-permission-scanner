import { z } from 'zod';
import { normalizeAddress } from './address.js';

export const RISK_POLICY_VERSION = 'mvp-1' as const;
export const UINT256_MAX = (1n << 256n) - 1n;
export const MAX_PAIRS = 20;
export const warningFields = [
  'allowance',
  'balance',
  'name',
  'symbol',
  'decimals',
] as const;
export const versionSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]{0,63}$/);
export const canonicalAddressSchema = z
  .string()
  .length(42)
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .refine((v) => {
    try {
      return normalizeAddress(v) === v;
    } catch {
      return false;
    }
  }, 'Expected canonical nonzero EIP-55 address.');
const addressInput = z
  .string()
  .max(128)
  .regex(/^\s*0x[0-9a-fA-F]{40}\s*$/)
  .transform((v, ctx) => {
    try {
      return normalizeAddress(v);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'invalid_format_or_checksum' });
      return z.NEVER;
    }
  });
export const scanRequestSchema = z.strictObject({ address: addressInput });
export const unsignedDecimalSchema = z
  .string()
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/);
export const uint256StringSchema = unsignedDecimalSchema.refine(
  (v) => /^(0|[1-9][0-9]{0,77})$/.test(v) && BigInt(v) <= UINT256_MAX,
);
export const pairIdSchema = z
  .string()
  .length(87)
  .regex(/^1:0x[0-9a-f]{40}:0x[0-9a-f]{40}$/);
const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max * 2)
    .refine(
      (v) =>
        [...v].length <= max &&
        v === v.trim() &&
        !/[\p{Cc}\p{Cf}\uFFFD]/u.test(v),
    );
const httpsUrl = z
  .string()
  .max(2048)
  .url()
  .refine((v) => {
    try {
      const url = new URL(v);
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.hostname.includes('*') &&
        !/[\p{Cc}\p{Cf}]/u.test(v) &&
        v === v.trim()
      );
    } catch {
      return false;
    }
  });
const reviewDate = z.iso.date();
const explorer = (kind: 'token' | 'address') =>
  z
    .string()
    .max(80)
    .regex(new RegExp(`^https://etherscan\\.io/${kind}/0x[0-9a-fA-F]{40}$`));
export const spenderInfoSchema = z
  .discriminatedUnion('identity', [
    z.strictObject({
      address: canonicalAddressSchema,
      identity: z.literal('verified'),
      label: text(120),
      identitySourceUrl: httpsUrl,
      identityReviewedAt: reviewDate,
      explorerUrl: explorer('address'),
    }),
    z.strictObject({
      address: canonicalAddressSchema,
      identity: z.literal('unverified'),
      label: z.null(),
      identitySourceUrl: z.null(),
      identityReviewedAt: z.null(),
      explorerUrl: explorer('address'),
    }),
  ])
  .refine((v) => v.explorerUrl === `https://etherscan.io/address/${v.address}`);
export const tokenInfoSchema = z
  .strictObject({
    address: canonicalAddressSchema,
    name: text(120).nullable(),
    symbol: text(32).nullable(),
    decimals: z.number().int().min(0).max(255).nullable(),
    explorerUrl: explorer('token'),
  })
  .refine((v) => v.explorerUrl === `https://etherscan.io/token/${v.address}`);
export const amountSchema = z.strictObject({
  raw: uint256StringSchema,
  formatted: z
    .string()
    .max(334)
    .regex(/^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/)
    .nullable(),
});
const empty = z.strictObject({});
const activeParameters = z.strictObject({ allowanceRaw: uint256StringSchema });
export const riskSignalSchema = z.discriminatedUnion('code', [
  z.strictObject({
    code: z.literal('ALLOWANCE_UNAVAILABLE'),
    severity: z.literal('info'),
    parameters: empty,
  }),
  z.strictObject({
    code: z.literal('ACTIVE_ALLOWANCE'),
    severity: z.literal('low'),
    parameters: activeParameters,
  }),
  z.strictObject({
    code: z.literal('UNLIMITED_ALLOWANCE'),
    severity: z.literal('high'),
    parameters: activeParameters,
  }),
  z.strictObject({
    code: z.literal('LARGE_RELATIVE_TO_BALANCE'),
    severity: z.literal('medium'),
    parameters: z.strictObject({
      allowanceRaw: uint256StringSchema,
      balanceRaw: uint256StringSchema,
      multiplier: z.literal(10),
    }),
  }),
  z.strictObject({
    code: z.literal('ZERO_BALANCE_WITH_ALLOWANCE'),
    severity: z.literal('medium'),
    parameters: z.strictObject({
      allowanceRaw: uint256StringSchema,
      balanceRaw: z.literal('0'),
    }),
  }),
  z.strictObject({
    code: z.literal('UNVERIFIED_SPENDER'),
    severity: z.literal('info'),
    parameters: empty,
  }),
  z.strictObject({
    code: z.literal('BALANCE_UNAVAILABLE'),
    severity: z.literal('info'),
    parameters: empty,
  }),
]);
export const riskAssessmentSchema = z
  .strictObject({
    level: z.enum(['none', 'low', 'medium', 'high', 'unknown']),
    assessment: z.enum(['complete', 'limited', 'unavailable']),
    signals: z.array(riskSignalSchema).max(5),
  })
  .refine((v) => {
    const order = [
      'ALLOWANCE_UNAVAILABLE',
      'ACTIVE_ALLOWANCE',
      'UNLIMITED_ALLOWANCE',
      'LARGE_RELATIVE_TO_BALANCE',
      'ZERO_BALANCE_WITH_ALLOWANCE',
      'UNVERIFIED_SPENDER',
      'BALANCE_UNAVAILABLE',
    ];
    const indices = v.signals.map((s) => order.indexOf(s.code));
    return indices.every((n, i) => i === 0 || n > indices[i - 1]!);
  }, 'Signals must be unique and ordered by policy.');
function exactAmount(
  amount: z.infer<typeof amountSchema> | null,
  decimals: number | null,
): boolean {
  if (!amount) return true;
  if (decimals === null) return amount.formatted === null;
  if (amount.formatted === null) return false;
  if (
    !/^(0|[1-9][0-9]{0,77})$/.test(amount.raw) ||
    amount.formatted.length > 334 ||
    !/^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/.test(amount.formatted) ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 255
  )
    return false;
  const [whole = '', fraction = ''] = amount.formatted.split('.');
  return (
    fraction.length <= decimals &&
    BigInt(whole + fraction.padEnd(decimals, '0')) === BigInt(amount.raw)
  );
}
export const permissionRecordSchema = z
  .strictObject({
    id: pairIdSchema,
    token: tokenInfoSchema,
    spender: spenderInfoSchema,
    allowance: amountSchema.nullable(),
    balance: amountSchema.nullable(),
    activity: z.enum(['active', 'inactive', 'unknown']),
    risk: riskAssessmentSchema,
  })
  .refine((v) => {
    if (
      v.id !==
        `1:${v.token.address.toLowerCase()}:${v.spender.address.toLowerCase()}` ||
      !exactAmount(v.allowance, v.token.decimals) ||
      !exactAmount(v.balance, v.token.decimals)
    )
      return false;
    if (v.allowance === null)
      return (
        v.activity === 'unknown' &&
        v.risk.level === 'unknown' &&
        v.risk.assessment === 'unavailable' &&
        v.risk.signals.length === 1 &&
        v.risk.signals[0]!.code === 'ALLOWANCE_UNAVAILABLE'
      );
    if (v.allowance.raw === '0')
      return (
        v.activity === 'inactive' &&
        v.risk.level === 'none' &&
        v.risk.assessment === 'complete' &&
        v.risk.signals.length === 0
      );
    return (
      v.activity === 'active' &&
      ['low', 'medium', 'high'].includes(v.risk.level) &&
      v.risk.assessment === (v.balance === null ? 'limited' : 'complete') &&
      v.risk.signals[0]?.code === 'ACTIVE_ALLOWANCE' &&
      v.risk.signals.every(
        (s) =>
          !('allowanceRaw' in s.parameters) ||
          s.parameters.allowanceRaw === v.allowance!.raw,
      )
    );
  }, 'Inconsistent permission identity, amounts, activity or assessment.');
export const fieldWarningSchema = z.strictObject({
  pairId: pairIdSchema,
  field: z.enum(warningFields),
  code: z.enum([
    'CONTRACT_REVERT',
    'RPC_TIMEOUT',
    'PROVIDER_RATE_LIMITED',
    'RPC_UNAVAILABLE',
    'INVALID_RETURN_DATA',
    'DEADLINE_EXCEEDED',
  ]),
});
const count = z.number().int().min(0).max(MAX_PAIRS);
export const snapshotSchema = z.strictObject({
  blockNumber: unsignedDecimalSchema,
  blockHash: z
    .string()
    .length(66)
    .regex(/^0x[0-9a-fA-F]{64}$/),
  blockTimestamp: z.iso.datetime(),
  finality: z.literal('finalized'),
});
const shared = {
  source: z.enum(['live', 'demo']),
  chainId: z.literal(1),
  registryVersion: versionSchema,
  riskPolicyVersion: z.literal(RISK_POLICY_VERSION),
};
const coverageFields = {
  strategy: z.literal('configured-pairs'),
  limitation: text(500),
  configuredPairs: count.min(1),
};
export const coverageResponseSchema = z
  .strictObject({
    ...shared,
    ...coverageFields,
    pairs: z
      .array(
        z.strictObject({
          id: pairIdSchema,
          tokenAddress: canonicalAddressSchema,
          spender: spenderInfoSchema,
        }),
      )
      .min(1)
      .max(MAX_PAIRS),
  })
  .refine(
    (v) =>
      v.configuredPairs === v.pairs.length &&
      new Set(v.pairs.map((p) => p.tokenAddress)).size <= 5 &&
      v.pairs.every(
        (p, i) =>
          p.id ===
            `1:${p.tokenAddress.toLowerCase()}:${p.spender.address.toLowerCase()}` &&
          (i === 0 || p.id > v.pairs[i - 1]!.id),
      ),
  );
export const scanSuccessSchema = z
  .strictObject({
    ...shared,
    requestId: z.uuid(),
    walletAddress: canonicalAddressSchema,
    status: z.enum(['complete', 'partial']),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    snapshot: snapshotSchema,
    coverage: z.strictObject({
      ...coverageFields,
      checkedPairs: count,
      failedPairs: count,
    }),
    summary: z.strictObject({ active: count, inactive: count, unknown: count }),
    permissions: z.array(permissionRecordSchema).min(1).max(MAX_PAIRS),
    warnings: z.array(fieldWarningSchema).max(MAX_PAIRS * warningFields.length),
  })
  .superRefine((v, ctx) => {
    const invalid = () =>
      ctx.addIssue({
        code: 'custom',
        message: 'Inconsistent scan counts, order, status or field warnings.',
      });
    const active = v.permissions.filter((p) => p.activity === 'active').length;
    const inactive = v.permissions.filter(
      (p) => p.activity === 'inactive',
    ).length;
    const unknown = v.permissions.length - active - inactive;
    if (
      Date.parse(v.completedAt) < Date.parse(v.startedAt) ||
      v.coverage.configuredPairs !== v.permissions.length ||
      v.coverage.checkedPairs !== active + inactive ||
      v.coverage.failedPairs !== unknown ||
      v.summary.active !== active ||
      v.summary.inactive !== inactive ||
      v.summary.unknown !== unknown ||
      active + inactive === 0 ||
      new Set(v.permissions.map((p) => p.token.address)).size > 5
    )
      invalid();
    const missing: string[] = [];
    for (const [i, p] of v.permissions.entries()) {
      if (i > 0 && p.id <= v.permissions[i - 1]!.id) invalid();
      for (const field of warningFields) {
        const value =
          field === 'allowance' || field === 'balance'
            ? p[field]
            : p.token[field];
        if (value === null) missing.push(`${p.id}/${field}`);
      }
    }
    if (
      JSON.stringify(missing) !==
        JSON.stringify(v.warnings.map((w) => `${w.pairId}/${w.field}`)) ||
      v.status !== (missing.length ? 'partial' : 'complete')
    )
      invalid();
  });
export type ScanRequest = z.infer<typeof scanRequestSchema>;
export type ScanSuccess = z.infer<typeof scanSuccessSchema>;
export type CoverageResponse = z.infer<typeof coverageResponseSchema>;
export type Amount = z.infer<typeof amountSchema>;
export type SpenderInfo = z.infer<typeof spenderInfoSchema>;
export type PermissionRecord = z.infer<typeof permissionRecordSchema>;
export type RiskSignal = z.infer<typeof riskSignalSchema>;
export type RiskAssessment = z.infer<typeof riskAssessmentSchema>;
export type FieldWarning = z.infer<typeof fieldWarningSchema>;
