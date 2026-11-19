import type { RiskAssessment, RiskSignal } from '@wps/contracts';
import { riskPolicy } from './risk-policy.js';

/** Pure mvp-1 policy. Null means an unreadable value, never a zero sentinel. */
export function assessPermission(
  allowance: bigint | null,
  balance: bigint | null,
  identity: 'verified' | 'unverified',
): RiskAssessment {
  if (allowance === null)
    return {
      level: 'unknown',
      assessment: 'unavailable',
      signals: [
        { code: 'ALLOWANCE_UNAVAILABLE', severity: 'info', parameters: {} },
      ],
    };
  if (allowance === 0n)
    return { level: 'none', assessment: 'complete', signals: [] };
  let level: RiskAssessment['level'] = 'low';
  const parameters = { allowanceRaw: allowance.toString() };
  const signals: RiskSignal[] = [
    { code: 'ACTIVE_ALLOWANCE', severity: 'low', parameters },
  ];
  if (allowance === riskPolicy.maximumAllowance) {
    level = 'high';
    signals.push({ code: 'UNLIMITED_ALLOWANCE', severity: 'high', parameters });
  }
  if (
    balance !== null &&
    balance > 0n &&
    allowance >= riskPolicy.largeAllowanceMultiplier * balance
  ) {
    if (level !== 'high') level = 'medium';
    signals.push({
      code: 'LARGE_RELATIVE_TO_BALANCE',
      severity: 'medium',
      parameters: {
        ...parameters,
        balanceRaw: balance.toString(),
        multiplier: 10,
      },
    });
  }
  if (balance === 0n) {
    if (level !== 'high') level = 'medium';
    signals.push({
      code: 'ZERO_BALANCE_WITH_ALLOWANCE',
      severity: 'medium',
      parameters: { ...parameters, balanceRaw: '0' },
    });
  }
  if (identity === 'unverified')
    signals.push({
      code: 'UNVERIFIED_SPENDER',
      severity: 'info',
      parameters: {},
    });
  if (balance === null)
    signals.push({
      code: 'BALANCE_UNAVAILABLE',
      severity: 'info',
      parameters: {},
    });
  return {
    level,
    assessment: balance === null ? 'limited' : 'complete',
    signals,
  };
}
