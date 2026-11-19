import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  UINT256_MAX,
  riskSignalSchema,
  type PermissionRecord,
  type RiskSignal,
} from '@wps/contracts';
import {
  completeScanFixture,
  partialScanFixture,
} from '@wps/contracts/fixtures';
import { ScannerError } from '../src/features/scanner/api-client';
import { initialScanState, scanReducer } from '../src/features/scanner/state';
import {
  defaultFilters,
  selectRecords,
} from '../src/features/scanner/selectors';
import {
  assessmentExplanations,
  displayAmount,
  signalExplanations,
  warningExplanations,
} from '../src/features/scanner/explanations';

test('request lifecycle clears old results, keeps submitted identity and ignores stale success/error/cancellation', () => {
  const loading = scanReducer(initialScanState, {
    type: 'start',
    token: 1,
    address: completeScanFixture.walletAddress,
  });
  const success = scanReducer(loading, {
    type: 'success',
    token: 1,
    result: completeScanFixture,
  });
  assert.equal(success.status, 'success');
  const newer = scanReducer(success, {
    type: 'start',
    token: 2,
    address: `0x${'4'.repeat(40)}`,
  });
  assert.equal(newer.result, null);
  for (const action of [
    { type: 'success' as const, token: 1, result: completeScanFixture },
    {
      type: 'error' as const,
      token: 1,
      error: new ScannerError('NETWORK', 'old'),
    },
    { type: 'cancel' as const, token: 1 },
    { type: 'start' as const, token: 1, address: 'old' },
    { type: 'success' as const, token: 2, result: completeScanFixture },
  ])
    assert.equal(scanReducer(newer, action), newer);
  const cancelled = scanReducer(newer, { type: 'cancel', token: 2 });
  assert.equal(cancelled.status, 'idle');
  assert.equal(
    scanReducer(cancelled, {
      type: 'success',
      token: 2,
      result: completeScanFixture,
    }),
    cancelled,
  );
  const error = scanReducer(loading, {
    type: 'error',
    token: 1,
    error: new ScannerError(
      'RATE_LIMITED',
      'wait',
      completeScanFixture.requestId,
      7000,
    ),
  });
  assert.equal(error.retryAt, 7000);
  assert.equal(error.error?.requestId, completeScanFixture.requestId);
  assert.equal(
    scanReducer(loading, {
      type: 'success',
      token: 1,
      result: partialScanFixture,
    }).result?.status,
    'partial',
  );
});

function records(): PermissionRecord[] {
  return (['unknown', 'none', 'low', 'medium', 'high'] as const).map(
    (level, i) => {
      const p = structuredClone(completeScanFixture.permissions[0]!);
      p.id = `pair-${i}`;
      p.risk.level = level;
      p.activity =
        level === 'unknown'
          ? 'unknown'
          : level === 'none'
            ? 'inactive'
            : 'active';
      p.token.address = `0x${String(i + 1).repeat(40)}`;
      p.allowance =
        level === 'unknown'
          ? null
          : { raw: UINT256_MAX.toString(), formatted: UINT256_MAX.toString() };
      return p;
    },
  );
}

test('conjunctive address/activity/risk filters and stable sorting preserve every default record without mutation', () => {
  const input = records();
  const before = structuredClone(input);
  assert.deepEqual(
    selectRecords(input, defaultFilters, {
      key: 'risk',
      direction: 'desc',
    }).map((p) => p.risk.level),
    ['high', 'medium', 'low', 'none', 'unknown'],
  );
  assert.deepEqual(
    selectRecords(input, defaultFilters, { key: 'risk', direction: 'asc' }).map(
      (p) => p.risk.level,
    ),
    ['unknown', 'none', 'low', 'medium', 'high'],
  );
  const filters = {
    ...defaultFilters,
    token: input[3]!.token.address.toUpperCase(),
    spender: input[3]!.spender.address,
    activity: 'active' as const,
    risk: 'medium' as const,
  };
  assert.deepEqual(
    selectRecords(input, filters, { key: 'token', direction: 'asc' }),
    [input[3]],
  );
  assert.equal(
    selectRecords(
      input,
      { ...filters, activity: 'inactive' },
      { key: 'risk', direction: 'desc' },
    ).length,
    0,
  );
  assert.deepEqual(
    selectRecords(input, defaultFilters, {
      key: 'token',
      direction: 'desc',
    }).map((p) => p.id),
    [...input].reverse().map((p) => p.id),
  );
  assert.deepEqual(
    selectRecords(input, defaultFilters, {
      key: 'spender',
      direction: 'desc',
    }).map((p) => p.id),
    input.map((p) => p.id),
  );
  assert.deepEqual(input, before);
});

test('all signal/assessment/warning explanations exist; huge and missing amounts preserve exactness', () => {
  assert.deepEqual(
    Object.keys(signalExplanations).sort(),
    riskSignalSchema.options.map((schema) => schema.shape.code.value).sort(),
  );
  for (const fixture of [completeScanFixture, partialScanFixture])
    for (const record of fixture.permissions) {
      assert.ok(assessmentExplanations[record.risk.assessment]);
      for (const signal of record.risk.signals)
        assert.ok(signalExplanations[signal.code]);
      for (const warning of fixture.warnings)
        assert.ok(warningExplanations[warning.code]);
    }
  assert.equal(Object.keys(assessmentExplanations).length, 3);
  assert.equal(Object.keys(warningExplanations).length, 6);
  const maximum = UINT256_MAX.toString();
  assert.equal(displayAmount({ raw: maximum, formatted: maximum }), maximum);
  assert.equal(
    displayAmount({ raw: maximum, formatted: null }),
    `${maximum} raw units (decimals unavailable)`,
  );
  assert.match(displayAmount(null), /Unknown/);
  const codes: RiskSignal['code'][] = [
    'ALLOWANCE_UNAVAILABLE',
    'UNLIMITED_ALLOWANCE',
    'ZERO_BALANCE_WITH_ALLOWANCE',
    'BALANCE_UNAVAILABLE',
    'UNVERIFIED_SPENDER',
  ];
  for (const code of codes) assert.ok(signalExplanations[code].length > 30);
});
