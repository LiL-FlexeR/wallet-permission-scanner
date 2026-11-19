import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  amountSchema,
  scanRequestSchema,
  scanSuccessSchema,
  coverageResponseSchema,
  UINT256_MAX,
} from '@wps/contracts';
import {
  completeScanFixture,
  partialScanFixture,
  coverageFixture,
} from '@wps/contracts/fixtures';

test('shared schemas accept typed integration fixtures and normalize bounded request input', () => {
  for (const fixture of [completeScanFixture, partialScanFixture])
    assert.deepEqual(scanSuccessSchema.parse(fixture), fixture);
  assert.deepEqual(
    coverageResponseSchema.parse(coverageFixture),
    coverageFixture,
  );
  assert.equal(
    scanRequestSchema.parse({
      address: ` ${completeScanFixture.walletAddress} `,
    }).address,
    completeScanFixture.walletAddress,
  );
  for (const input of [
    null,
    2,
    [],
    {},
    { address: 'x' },
    { address: `0x${'0'.repeat(40)}` },
    { address: completeScanFixture.walletAddress, rpc: 'https://evil.invalid' },
    { address: ' '.repeat(129) },
  ])
    assert.equal(scanRequestSchema.safeParse(input).success, false);
});

test('amount transport rejects noncanonical or overflowing uint256 and float notation', () => {
  assert.ok(
    amountSchema.safeParse({ raw: UINT256_MAX.toString(), formatted: null })
      .success,
  );
  for (const raw of [(UINT256_MAX + 1n).toString(), '-1', '01', '1e10', 2, ''])
    assert.equal(
      amountSchema.safeParse({ raw, formatted: null }).success,
      false,
    );
  for (const formatted of ['01', '1.0', '1e-18', '-1', '1,000'])
    assert.equal(
      amountSchema.safeParse({ raw: '1', formatted }).success,
      false,
    );
});

test('response schema enforces warnings, exact amounts, identity, counts, activity and stable order', () => {
  const mutations: ((v: typeof completeScanFixture) => void)[] = [
    (v) => {
      v.coverage.checkedPairs = 0;
    },
    (v) => {
      v.summary.unknown = 1;
    },
    (v) => {
      v.permissions[0]!.balance = null;
    },
    (v) => {
      v.permissions[0]!.allowance = null;
    },
    (v) => {
      v.permissions[0]!.token.decimals = null;
    },
    (v) => {
      v.permissions[0]!.token.name = 'x'.repeat(121);
    },
    (v) => {
      v.permissions[0]!.token.symbol = 'bad\u202e';
    },
    (v) => {
      v.permissions[0]!.activity = 'inactive';
    },
    (v) => {
      v.permissions[0]!.spender.label = 'Invented identity';
    },
    (v) => {
      v.permissions[0]!.token.explorerUrl = 'https://evil.invalid';
    },
    (v) => {
      v.permissions[0]!.allowance!.formatted = '201';
    },
    (v) => {
      v.permissions[0]!.risk.signals.reverse();
    },
    (v) => {
      v.permissions.push(v.permissions[0]!);
    },
    (v) => {
      v.warnings.push({
        pairId: v.permissions[0]!.id,
        field: 'name',
        code: 'CONTRACT_REVERT',
      });
    },
  ];
  for (const mutate of mutations) {
    const fixture = structuredClone(completeScanFixture);
    mutate(fixture);
    assert.equal(scanSuccessSchema.safeParse(fixture).success, false);
  }
});
