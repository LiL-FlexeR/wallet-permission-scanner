import assert from 'node:assert/strict';
import { test } from 'node:test';
import { riskAssessmentSchema, UINT256_MAX } from '@wps/contracts';
import type { RiskAssessment, RiskSignal } from '@wps/contracts';
import { assessPermission } from '../src/risk/assess-permission.js';
import { riskPolicy } from '../src/risk/risk-policy.js';

type Code = RiskSignal['code'];
const fixtures: [
  bigint | null,
  bigint | null,
  'verified' | 'unverified',
  RiskAssessment['level'],
  RiskAssessment['assessment'],
  Code[],
][] = [
  [
    null,
    100n,
    'unverified',
    'unknown',
    'unavailable',
    ['ALLOWANCE_UNAVAILABLE'],
  ],
  [0n, null, 'unverified', 'none', 'complete', []],
  [1n, 100n, 'verified', 'low', 'complete', ['ACTIVE_ALLOWANCE']],
  [
    1n,
    100n,
    'unverified',
    'low',
    'complete',
    ['ACTIVE_ALLOWANCE', 'UNVERIFIED_SPENDER'],
  ],
  [999n, 100n, 'verified', 'low', 'complete', ['ACTIVE_ALLOWANCE']],
  [
    1000n,
    100n,
    'verified',
    'medium',
    'complete',
    ['ACTIVE_ALLOWANCE', 'LARGE_RELATIVE_TO_BALANCE'],
  ],
  [
    1n,
    0n,
    'verified',
    'medium',
    'complete',
    ['ACTIVE_ALLOWANCE', 'ZERO_BALANCE_WITH_ALLOWANCE'],
  ],
  [
    UINT256_MAX,
    100n,
    'unverified',
    'high',
    'complete',
    [
      'ACTIVE_ALLOWANCE',
      'UNLIMITED_ALLOWANCE',
      'LARGE_RELATIVE_TO_BALANCE',
      'UNVERIFIED_SPENDER',
    ],
  ],
  [
    UINT256_MAX,
    null,
    'unverified',
    'high',
    'limited',
    [
      'ACTIVE_ALLOWANCE',
      'UNLIMITED_ALLOWANCE',
      'UNVERIFIED_SPENDER',
      'BALANCE_UNAVAILABLE',
    ],
  ],
  [
    1n,
    null,
    'verified',
    'low',
    'limited',
    ['ACTIVE_ALLOWANCE', 'BALANCE_UNAVAILABLE'],
  ],
  [
    UINT256_MAX - 1n,
    UINT256_MAX,
    'verified',
    'low',
    'complete',
    ['ACTIVE_ALLOWANCE'],
  ],
  [
    UINT256_MAX,
    UINT256_MAX,
    'verified',
    'high',
    'complete',
    ['ACTIVE_ALLOWANCE', 'UNLIMITED_ALLOWANCE'],
  ],
  [
    90_071_992_547_409_930n,
    9_007_199_254_740_993n,
    'verified',
    'medium',
    'complete',
    ['ACTIVE_ALLOWANCE', 'LARGE_RELATIVE_TO_BALANCE'],
  ],
];
for (const [
  allowance,
  balance,
  identity,
  level,
  assessment,
  codes,
] of fixtures) {
  test(`mvp-1 ${allowance}/${balance}/${identity}`, () => {
    const result = assessPermission(allowance, balance, identity);
    assert.equal(riskPolicy.version, 'mvp-1');
    assert.equal(result.level, level);
    assert.equal(result.assessment, assessment);
    assert.deepEqual(
      result.signals.map((s) => s.code),
      codes,
    );
    assert.deepEqual(riskAssessmentSchema.parse(result), result);
    for (const signal of result.signals) {
      assert.equal(
        signal.severity,
        (
          {
            ACTIVE_ALLOWANCE: 'low',
            UNLIMITED_ALLOWANCE: 'high',
            LARGE_RELATIVE_TO_BALANCE: 'medium',
            ZERO_BALANCE_WITH_ALLOWANCE: 'medium',
          } as Record<string, string>
        )[signal.code] ?? 'info',
      );
      if ('allowanceRaw' in signal.parameters)
        assert.equal(signal.parameters.allowanceRaw, allowance?.toString());
      if ('balanceRaw' in signal.parameters)
        assert.equal(signal.parameters.balanceRaw, balance?.toString());
      if ('multiplier' in signal.parameters)
        assert.equal(signal.parameters.multiplier, 10);
      if (!('allowanceRaw' in signal.parameters))
        assert.deepEqual(signal.parameters, {});
    }
  });
}
