# Initial Mainnet Registry Provenance

Registry version: `mainnet-1`. Primary deployment documentation reviewed on **2026-11-18**. Runtime data is in [`mainnet.registry.ts`](../../apps/api/src/registry/mainnet.registry.ts); validation normalizes addresses, rejects inconsistent identity metadata and duplicate tuples, and freezes the snapshot.

| Identity mapping | Ethereum mainnet address | Primary source |
| --- | --- | --- |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | [Circle USDC contract addresses — Ethereum](https://developers.circle.com/stablecoins/usdc-contract-addresses) |
| WETH9 | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` | [Uniswap Ethereum deployments — Wrapped Native Token Addresses](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments#wrapped-native-token-addresses) |
| Uniswap v3 SwapRouter | `0xE592427A0AEce92De3Edee1F18E0157C05861564` | [Uniswap Ethereum deployments — SwapRouter mainnet row](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments) |
| Uniswap SwapRouter02 | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` | [Uniswap Ethereum deployments — SwapRouter02 mainnet row](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments) |

Exactly three pairs are configured:

1. USDC / Uniswap v3 SwapRouter.
2. USDC / Uniswap SwapRouter02.
3. WETH9 / Uniswap SwapRouter02.

No fourth pair is inferred. The older router deployments are deliberately named precisely: Uniswap documents Universal Router as its current preferred entry point. This registry inspects remaining ERC-20 allowances to the listed deployments; it does not recommend a router or assert that users approved it. No current wallet holdings or positive allowances were researched or assumed.

`verified` refers only to the reviewed address-to-name mapping. It is not an audit, endorsement, maliciousness finding, or guarantee about future contract behavior. The WETH9 mapping uses Uniswap's own documented Ethereum integration address. Explorer labels are not used as evidence.

Deployment bytecode must be checked separately with `pnpm test:blockchain:live`, using the configured provider. This command verifies chain ID, a recent finalized snapshot, numeric-block ERC-20 reads and nonempty bytecode for all four unique addresses at that snapshot. Zero allowances and zero balances are valid. It does not verify bytecode hashes, proxy implementations, or state proofs. **The live smoke check was not run during Stage 02 implementation because no RPC credential was available.** Deterministic smoke-adapter tests cover the same execution path and reject an address without bytecode; they are not evidence of live deployment state.

Changing the pair set or any identity mapping/provenance requires a registry version change and another primary-source review. Registry source URLs are documentation only and are never fetched during a scan or readiness probe. See [blockchain integration](blockchain-integration.md) for coverage and trusted-provider limits.
