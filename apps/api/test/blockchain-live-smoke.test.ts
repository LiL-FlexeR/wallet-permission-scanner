import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeFunctionResult, decodeFunctionData } from 'viem';
import { BoundedRpc } from '../src/blockchain/bounded-rpc.js';
import { erc20ReadAbi } from '../src/blockchain/erc20.abi.js';
import { runLiveSmoke } from '../src/blockchain/live-smoke.js';
import { WorkBudget } from '../src/blockchain/work-budget.js';
import { FakeClock, block, rpcFetch } from './blockchain-fixtures.js';

test('opt-in smoke checks all four deployment addresses at the scan snapshot and accepts zero allowances', async () => {
  for (const hasCode of [true, false]) {
    const clock = new FakeClock();
    const context = new WorkBudget(15_000, clock);
    const deployments: string[] = [];
    const rpc = new BoundedRpc(
      'https://rpc.invalid',
      undefined,
      rpcFetch((req) => {
        if (req.method === 'eth_chainId') return '0x1';
        if (req.method === 'eth_getBlockByNumber') return block(clock);
        if (req.method === 'eth_getCode') {
          deployments.push(String(req.params[0]));
          assert.equal(req.params[1], '0x16e3600');
          return hasCode ? '0x6000' : '0x';
        }
        const fn = decodeFunctionData({
          abi: erc20ReadAbi,
          data: (req.params[0] as { data: `0x${string}` }).data,
        }).functionName;
        if (fn === 'allowance' || fn === 'balanceOf')
          return encodeFunctionResult({
            abi: erc20ReadAbi,
            functionName: fn,
            result: 0n,
          });
        if (fn === 'decimals')
          return encodeFunctionResult({
            abi: erc20ReadAbi,
            functionName: fn,
            result: 18,
          });
        return encodeFunctionResult({
          abi: erc20ReadAbi,
          functionName: fn,
          result: 'Synthetic Fixture',
        });
      }),
    );
    if (hasCode) {
      const result = await runLiveSmoke(rpc, context);
      assert.equal(result.status, 'passed');
      assert.equal(result.deploymentAddresses, 4);
      assert.equal(new Set(deployments).size, 4);
      assert.equal(result.allowanceReads, 3);
      assert.equal(result.metadataFailures, 0);
    } else
      await assert.rejects(runLiveSmoke(rpc, context), /SERVICE_NOT_READY/);
    assert.equal(rpc.permits.inFlight, 0);
    context.dispose();
  }
});
