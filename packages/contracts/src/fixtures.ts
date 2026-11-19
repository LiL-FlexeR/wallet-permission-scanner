import { coverageResponseSchema, scanSuccessSchema } from './scans.js';

/** Synthetic HTTP integration fixtures; no viem or backend imports. */
export const completeScanFixture = scanSuccessSchema.parse({
  requestId: '6e61365b-d1c1-4fb7-9680-9bfbe99d120e',
  source: 'demo',
  chainId: 1,
  walletAddress: `0x${'3'.repeat(40)}`,
  status: 'complete',
  registryVersion: 'demo-1',
  riskPolicyVersion: 'mvp-1',
  startedAt: '2026-11-18T12:00:00.000Z',
  completedAt: '2026-11-18T12:00:00.050Z',
  snapshot: {
    blockNumber: '24000000',
    blockHash: `0x${'a'.repeat(64)}`,
    blockTimestamp: '2026-11-18T11:48:00.000Z',
    finality: 'finalized',
  },
  coverage: {
    strategy: 'configured-pairs',
    limitation:
      'Only configured token/spender pairs are checked; other permissions may exist.',
    configuredPairs: 1,
    checkedPairs: 1,
    failedPairs: 0,
  },
  summary: { active: 1, inactive: 0, unknown: 0 },
  permissions: [
    {
      id: `1:0x${'1'.repeat(40)}:0x${'2'.repeat(40)}`,
      token: {
        address: `0x${'1'.repeat(40)}`,
        name: 'Synthetic Demo Token',
        symbol: 'DEMO',
        decimals: 6,
        explorerUrl: `https://etherscan.io/token/0x${'1'.repeat(40)}`,
      },
      spender: {
        address: `0x${'2'.repeat(40)}`,
        identity: 'unverified',
        label: null,
        identitySourceUrl: null,
        identityReviewedAt: null,
        explorerUrl: `https://etherscan.io/address/0x${'2'.repeat(40)}`,
      },
      allowance: { raw: '200000000', formatted: '200' },
      balance: { raw: '10000000', formatted: '10' },
      activity: 'active',
      risk: {
        level: 'medium',
        assessment: 'complete',
        signals: [
          {
            code: 'ACTIVE_ALLOWANCE',
            severity: 'low',
            parameters: { allowanceRaw: '200000000' },
          },
          {
            code: 'LARGE_RELATIVE_TO_BALANCE',
            severity: 'medium',
            parameters: {
              allowanceRaw: '200000000',
              balanceRaw: '10000000',
              multiplier: 10,
            },
          },
          { code: 'UNVERIFIED_SPENDER', severity: 'info', parameters: {} },
        ],
      },
    },
  ],
  warnings: [],
});
const partial = structuredClone(completeScanFixture);
partial.status = 'partial';
partial.permissions[0]!.balance = null;
partial.permissions[0]!.risk = {
  level: 'low',
  assessment: 'limited',
  signals: [
    {
      code: 'ACTIVE_ALLOWANCE',
      severity: 'low',
      parameters: { allowanceRaw: '200000000' },
    },
    { code: 'UNVERIFIED_SPENDER', severity: 'info', parameters: {} },
    { code: 'BALANCE_UNAVAILABLE', severity: 'info', parameters: {} },
  ],
};
partial.warnings = [
  { pairId: partial.permissions[0]!.id, field: 'balance', code: 'RPC_TIMEOUT' },
];
export const partialScanFixture = scanSuccessSchema.parse(partial);
export const coverageFixture = coverageResponseSchema.parse({
  chainId: 1,
  source: 'demo',
  registryVersion: 'demo-1',
  riskPolicyVersion: 'mvp-1',
  strategy: 'configured-pairs',
  limitation: completeScanFixture.coverage.limitation,
  configuredPairs: 1,
  pairs: completeScanFixture.permissions.map((p) => ({
    id: p.id,
    tokenAddress: p.token.address,
    spender: p.spender,
  })),
});
