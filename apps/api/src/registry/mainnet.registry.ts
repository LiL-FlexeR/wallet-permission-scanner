import { validateRegistry } from './registry.js';

const deployments =
  'https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments';
function reviewed(address: string, label: string, identitySourceUrl: string) {
  return {
    address,
    label,
    identity: 'verified',
    identitySourceUrl,
    identityReviewedAt: '2026-11-18',
  };
}
const usdc = reviewed(
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'USDC',
  'https://developers.circle.com/stablecoins/usdc-contract-addresses',
);
const weth = reviewed(
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  'WETH9',
  deployments,
);
const router = reviewed(
  '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  'Uniswap v3 SwapRouter',
  deployments,
);
const router02 = reviewed(
  '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  'Uniswap SwapRouter02',
  deployments,
);

export const mainnetRegistry = validateRegistry({
  registryVersion: 'mainnet-1',
  chainId: 1,
  limitation:
    'Only configured token/spender pairs are checked; other permissions may exist.',
  // Explicit pairs, deliberately not a Cartesian product. Identity is not a safety claim.
  pairs: [
    { token: usdc, spender: router },
    { token: usdc, spender: router02 },
    { token: weth, spender: router02 },
  ],
});
