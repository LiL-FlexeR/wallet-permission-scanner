// Synthetic reader fixture set v1. Only test processes import this module.
// Production registry provenance and demo startup have no scenario controls.
import { DemoEthereumReader } from '../../apps/api/dist/blockchain/demo-ethereum.reader.js';
import {
  failure,
  success,
} from '../../apps/api/dist/blockchain/ethereum-reader.js';

export const scenarios = [
  'zero',
  'partial-metadata',
  'provider-failure',
  'cancel',
];

export function fixtureReader(scenario, observe) {
  if (!scenarios.includes(scenario))
    throw new Error('Unknown fixture scenario');
  const reader = new DemoEthereumReader(
    scenario === 'zero'
      ? 'zero'
      : scenario === 'provider-failure'
        ? 'provider-failure'
        : 'partial',
  );
  return async (input) => {
    observe('read');
    if (scenario === 'cancel') {
      await new Promise((resolve) => {
        if (input.context.signal.aborted) resolve();
        else
          input.context.signal.addEventListener('abort', resolve, {
            once: true,
          });
      });
      observe('aborted');
      return reader.read(input);
    }
    const result = await reader.read(input);
    if (scenario !== 'partial-metadata') return result;
    return {
      ...result,
      tokens: result.tokens.map((token) => ({
        ...token,
        name: success('<img src=x onerror=alert(1)>'),
        balance: failure('CONTRACT_REVERT'),
        decimals: failure('INVALID_RETURN_DATA'),
      })),
    };
  };
}
