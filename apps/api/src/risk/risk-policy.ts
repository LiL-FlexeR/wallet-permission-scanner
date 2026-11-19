import { RISK_POLICY_VERSION, UINT256_MAX } from '@wps/contracts';

export const riskPolicy = Object.freeze({
  version: RISK_POLICY_VERSION,
  maximumAllowance: UINT256_MAX,
  largeAllowanceMultiplier: 10n,
});
