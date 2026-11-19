import { scanSuccessSchema } from '../../packages/contracts/src/index';
import {
  completeScanFixture,
  partialScanFixture,
} from '../../packages/contracts/src/fixtures';

export {
  completeScanFixture,
  partialScanFixture,
  coverageFixture,
} from '../../packages/contracts/src/fixtures';

const inactive = structuredClone(completeScanFixture);
inactive.summary = { active: 0, inactive: 1, unknown: 0 };
inactive.permissions[0]!.allowance = { raw: '0', formatted: '0' };
inactive.permissions[0]!.activity = 'inactive';
inactive.permissions[0]!.risk = {
  level: 'none',
  assessment: 'complete',
  signals: [],
};
export const inactiveScanFixture = scanSuccessSchema.parse(inactive);

const unknown = structuredClone(inactiveScanFixture);
unknown.status = 'partial';
const second = structuredClone(completeScanFixture.permissions[0]!);
second.spender.address = `0x${'4'.repeat(40)}`;
second.spender.explorerUrl = `https://etherscan.io/address/${second.spender.address}`;
second.id = `1:${second.token.address}:${second.spender.address}`;
second.allowance = null;
second.activity = 'unknown';
second.risk = {
  level: 'unknown',
  assessment: 'unavailable',
  signals: [
    { code: 'ALLOWANCE_UNAVAILABLE', severity: 'info', parameters: {} },
  ],
};
unknown.permissions.push(second);
unknown.summary = { active: 0, inactive: 1, unknown: 1 };
unknown.coverage = {
  ...unknown.coverage,
  configuredPairs: 2,
  checkedPairs: 1,
  failedPairs: 1,
};
unknown.warnings = [
  { pairId: second.id, field: 'allowance', code: 'RPC_TIMEOUT' },
];
export const unknownScanFixture = scanSuccessSchema.parse(unknown);

const metadata = structuredClone(partialScanFixture);
const p = metadata.permissions[0]!;
p.token.name = '<img src=x onerror=alert(1)>';
p.token.symbol = null;
p.token.decimals = null;
p.allowance = {
  raw: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
  formatted: null,
};
p.risk = {
  level: 'high',
  assessment: 'limited',
  signals: [
    {
      code: 'ACTIVE_ALLOWANCE',
      severity: 'low',
      parameters: { allowanceRaw: p.allowance.raw },
    },
    {
      code: 'UNLIMITED_ALLOWANCE',
      severity: 'high',
      parameters: { allowanceRaw: p.allowance.raw },
    },
    { code: 'UNVERIFIED_SPENDER', severity: 'info', parameters: {} },
    { code: 'BALANCE_UNAVAILABLE', severity: 'info', parameters: {} },
  ],
};
metadata.warnings.push(
  { pairId: p.id, field: 'symbol', code: 'CONTRACT_REVERT' },
  { pairId: p.id, field: 'decimals', code: 'INVALID_RETURN_DATA' },
);
export const metadataScanFixture = scanSuccessSchema.parse(metadata);
