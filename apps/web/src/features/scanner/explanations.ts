import type {
  Amount,
  FieldWarning,
  RiskAssessment,
  RiskSignal,
} from '@wps/contracts';

export const signalExplanations: Record<RiskSignal['code'], string> = {
  ALLOWANCE_UNAVAILABLE:
    'Allowance could not be read. Activity and exposure are unknown; this is not an inactive permission.',
  ACTIVE_ALLOWANCE: 'A nonzero spending permission exists at this snapshot.',
  UNLIMITED_ALLOWANCE:
    'Allowance equals the maximum uint256 value. Policy mvp-1 classifies this broad permission as unlimited, not as evidence of malice.',
  LARGE_RELATIVE_TO_BALANCE:
    'Allowance is at least 10 times the positive token balance at this snapshot.',
  ZERO_BALANCE_WITH_ALLOWANCE:
    'The balance is zero, but permission remains active and may apply to future deposits.',
  UNVERIFIED_SPENDER:
    'The registry has no reviewed identity mapping for this spender. Missing identity does not independently raise exposure.',
  BALANCE_UNAVAILABLE:
    'Balance could not be read. Comparison with the balance is unavailable; zero is not assumed.',
};
export const assessmentExplanations: Record<
  RiskAssessment['assessment'],
  string
> = {
  complete:
    'Assessment complete for this permission under mvp-1; this is not a contract safety assessment.',
  limited:
    'Assessment limited: the allowance is known, but the balance comparison is unavailable.',
  unavailable: 'Assessment unavailable: the allowance could not be read.',
};
export const warningExplanations: Record<FieldWarning['code'], string> = {
  CONTRACT_REVERT: 'The contract rejected this read.',
  RPC_TIMEOUT: 'The read timed out.',
  PROVIDER_RATE_LIMITED: 'The provider throttled this read.',
  RPC_UNAVAILABLE: 'The provider could not complete this read.',
  INVALID_RETURN_DATA: 'The contract returned unreadable data.',
  DEADLINE_EXCEEDED: 'The scan time budget ended before this field was read.',
};
export function displayAmount(amount: Amount | null) {
  if (amount === null) return 'Unknown — read unavailable';
  return amount.formatted ?? `${amount.raw} raw units (decimals unavailable)`;
}
