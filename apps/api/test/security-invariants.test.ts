import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assessPermission,
  permissionRecordSchema,
  scanSuccessSchema,
  UINT256_MAX,
} from '@wps/contracts';
import { completeScanFixture } from '@wps/contracts/fixtures';
import { formatExact } from '../src/blockchain/quantities.js';

test('mvp-1 boundaries stay exact above 2^53; identity changes context only, never exposure', () => {
  for (const balance of [1n, 100n, 9_007_199_254_740_993n, UINT256_MAX / 10n]) {
    for (const offset of [-1n, 0n, 1n]) {
      const allowance = balance * 10n + offset;
      for (const identity of ['verified', 'unverified'] as const) {
        const risk = assessPermission(allowance, balance, identity);
        assert.equal(risk.level, offset < 0n ? 'low' : 'medium');
        assert.deepEqual(
          risk.signals.map((s) => s.code),
          [
            'ACTIVE_ALLOWANCE',
            ...(offset < 0n ? [] : ['LARGE_RELATIVE_TO_BALANCE']),
            ...(identity === 'verified' ? [] : ['UNVERIFIED_SPENDER']),
          ],
        );
      }
    }
  }
  for (const allowance of [0n, 1n, UINT256_MAX - 1n, UINT256_MAX, null]) {
    for (const balance of [0n, 1n, UINT256_MAX, null]) {
      const verified = assessPermission(allowance, balance, 'verified');
      const unverified = assessPermission(allowance, balance, 'unverified');
      assert.equal(verified.level, unverified.level);
      assert.equal(verified.assessment, unverified.assessment);
      assert.deepEqual(
        unverified.signals.filter((s) => s.code !== 'UNVERIFIED_SPENDER'),
        verified.signals,
      );
      assert.equal(
        verified.signals.some((s) => s.code === 'UNLIMITED_ALLOWANCE'),
        allowance === UINT256_MAX,
      );
    }
  }
});

test('all decimal scales 0..255 round-trip exact raw values and pass the wire schema', () => {
  for (let scale = 0; scale <= 255; scale++) {
    for (const raw of [
      0n,
      1n,
      10n ** 18n,
      9_007_199_254_740_993n,
      UINT256_MAX,
    ]) {
      const formatted = formatExact(raw, scale)!;
      const [whole = '', fraction = ''] = formatted.split('.');
      assert.equal(BigInt(whole + fraction.padEnd(scale, '0')), raw);
      assert.ok(!/[eE,+-]/.test(formatted));
      const record = structuredClone(completeScanFixture.permissions[0]!);
      record.token.decimals = scale;
      record.allowance = { raw: raw.toString(), formatted };
      record.balance = { raw: '1', formatted: formatExact(1n, scale) };
      record.activity = raw === 0n ? 'inactive' : 'active';
      record.risk = assessPermission(raw, 1n, record.spender.identity);
      assert.equal(permissionRecordSchema.safeParse(record).success, true);
    }
  }
});

test('response validation rejects risk drift, forged signal parameters and malformed raw data without throwing', () => {
  const mutations = [
    (v: typeof completeScanFixture) => {
      v.permissions[0]!.risk.level = 'low';
    },
    (v: typeof completeScanFixture) => {
      v.permissions[0]!.risk.signals.pop();
    },
    (v: typeof completeScanFixture) => {
      v.permissions[0]!.risk.signals.splice(1, 1);
    },
    (v: typeof completeScanFixture) => {
      const signal = v.permissions[0]!.risk.signals[1]!;
      if (signal.code === 'LARGE_RELATIVE_TO_BALANCE')
        signal.parameters.balanceRaw = '1';
    },
    (v: typeof completeScanFixture) => {
      v.permissions[0]!.risk.signals.splice(1, 0, {
        code: 'UNLIMITED_ALLOWANCE',
        severity: 'high',
        parameters: { allowanceRaw: v.permissions[0]!.allowance!.raw },
      });
    },
    (v: typeof completeScanFixture) => {
      v.permissions[0]!.allowance!.raw = 'not-an-integer';
    },
    (v: typeof completeScanFixture) => {
      v.permissions[0]!.allowance!.raw = (UINT256_MAX + 1n).toString();
    },
  ];
  for (const mutate of mutations) {
    const fixture = structuredClone(completeScanFixture);
    mutate(fixture);
    assert.equal(scanSuccessSchema.safeParse(fixture).success, false);
  }
  for (const field of ['allowance', 'balance'] as const) {
    const record = structuredClone(completeScanFixture.permissions[0]!);
    record.token.decimals = null;
    record.allowance!.formatted = null;
    record.balance!.formatted = null;
    record[field]!.raw = 'not-an-integer';
    assert.equal(permissionRecordSchema.safeParse(record).success, false);
  }
});
