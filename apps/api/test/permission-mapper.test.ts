import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverageResponseSchema } from '@wps/contracts';
import {
  DemoEthereumReader,
  demoRegistry,
} from '../src/blockchain/demo-ethereum.reader.js';
import { failure, success } from '../src/blockchain/ethereum-reader.js';
import { WorkBudget } from '../src/blockchain/work-budget.js';
import { mapCoverage, mapPermissions } from '../src/scans/permission.mapper.js';
import { owner } from './blockchain-fixtures.js';

test('mapping preserves every pair, exact decimals 0/255 and stable order without RPC on coverage', async () => {
  const context = new WorkBudget(15_000);
  try {
    const read = await new DemoEthereumReader().read({
      owner,
      registry: demoRegistry,
      context,
    });
    const mapped = mapPermissions(demoRegistry, {
      ...read,
      pairs: [...read.pairs].reverse(),
    });
    assert.deepEqual(
      mapped.permissions.map((p) => p.id),
      demoRegistry.pairs.map((p) => p.id),
    );
    assert.deepEqual(mapped.summary, { active: 2, inactive: 1, unknown: 0 });
    assert.equal(
      mapped.permissions[0]!.allowance!.formatted,
      read.pairs[0]!.allowance.ok
        ? read.pairs[0]!.allowance.value.toString()
        : 'failure',
    );
    assert.equal(
      mapped.permissions[2]!.allowance!.formatted,
      `0.${'0'.repeat(246)}2`,
    );
    assert.equal(
      coverageResponseSchema.parse(mapCoverage(demoRegistry, 'demo')).source,
      'demo',
    );
  } finally {
    context.dispose();
  }
});

test('shared token failures repeat per pair, with zero none/complete and maximum high/limited', async () => {
  const context = new WorkBudget(15_000);
  try {
    const read = await new DemoEthereumReader().read({
      owner,
      registry: demoRegistry,
      context,
    });
    const result = mapPermissions(demoRegistry, {
      ...read,
      tokens: read.tokens.map((t) => ({
        ...t,
        balance: failure('RPC_TIMEOUT'),
        decimals: failure('CONTRACT_REVERT'),
      })),
    });
    assert.equal(result.status, 'partial');
    assert.equal(result.warnings.length, 6);
    assert.deepEqual(
      result.warnings.slice(0, 2).map((w) => w.field),
      ['balance', 'decimals'],
    );
    assert.equal(result.permissions[0]!.risk.level, 'high');
    assert.equal(result.permissions[0]!.risk.assessment, 'limited');
    assert.deepEqual(result.permissions[1]!.risk, {
      level: 'none',
      assessment: 'complete',
      signals: [],
    });
    assert.ok(
      result.permissions.every(
        (p) => p.allowance?.formatted === null && p.balance === null,
      ),
    );
    const partial = mapPermissions(demoRegistry, {
      ...read,
      pairs: read.pairs.map((p, i) => ({
        ...p,
        allowance: i === 0 ? success(0n) : failure('PROVIDER_RATE_LIMITED'),
      })),
    });
    assert.deepEqual(partial.summary, { active: 0, inactive: 1, unknown: 2 });
    assert.equal(partial.permissions[1]!.allowance, null);
    assert.equal(partial.permissions[1]!.risk.level, 'unknown');
    assert.throws(
      () => mapPermissions(demoRegistry, { ...read, pairs: [] }),
      /INCONSISTENT_READER_RESULT/,
    );
  } finally {
    context.dispose();
  }
});
