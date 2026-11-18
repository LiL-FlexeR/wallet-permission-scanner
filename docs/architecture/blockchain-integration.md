# Blockchain Integration

## Selected MVP strategy

Use a server-controlled registry of explicit `(chainId, tokenAddress, spenderAddress)` pairs, then read each pair's allowance. Direct RPC is sufficient for this bounded question. It is insufficient for a claim of complete wallet discovery. The API and frontend must always explain that coverage consists only of the published registry.

| Strategy | Benefits | Costs and limits | Decision |
| --- | --- | --- | --- |
| Explicit configured pairs | Small, deterministic work; easy fixtures; current-state reads with a standard provider | Misses every pair outside the registry; registry maintenance needed | MVP |
| Historical `Approval` discovery | Can identify candidate pairs beyond a hand-maintained list | Log range limits, deployment start blocks, pagination, reorgs, provider retention, and nonstandard tokens; costly wallet-wide discovery | Defer |
| External indexer | Potentially broader discovery and normalized history | API keys, price and quota dependence, chain/token scope, freshness and completeness guarantees must be evaluated | Defer until broader discovery is a product requirement |

A future indexer must declare chains, standards, start blocks, pagination, missed-event handling, lag, and exclusions before the product broadens its claims. Even then, re-read current allowances for discovered candidates.

## Allowances and event limitations

The authoritative MVP read is `allowance(owner, spender)` at the chosen block. Positive output means a reported active permission; zero means inactive at that snapshot. A missing/reverted/undecodable read means unknown. Balance is separate and does not determine whether the allowance exists.

`Approval` events describe past approval activity, not a complete current-state ledger. Spending can change the remaining permission; implementations differ in whether additional events accompany those changes. The latest historical value must not replace a current read. The [ERC-20 standard](https://eips.ethereum.org/EIPS/eip-20) defines the relevant methods and event. [OpenZeppelin's implementation documentation](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20) also documents maximum-allowance handling and implementation-specific event behavior.

The MVP does not query historical logs. It does not inspect Permit2's internal permissions, signatures that could later activate approvals, NFTs, temporary approvals, or arbitrary nonstandard spend mechanisms. An ERC-20 approval to another permission system describes only the token-level allowance.

## Registry requirements

Store a typed, source-controlled registry inside `apps/api/src/registry`. Include:

- A stable `registryVersion` changed whenever the pair list or identity metadata changes.
- `chainId: 1`, a coverage limitation statement, and explicit pair entries.
- Token and spender addresses, optional reviewed labels, HTTPS provenance URLs, and review dates.
- Identity state `verified` only when the address-to-label mapping is supported by reviewed primary project deployment documentation. Otherwise use `unverified` with a null label.

Verification refers only to identity mapping. It is not a contract audit, endorsement, or promise about upgradeable contract behavior. Do not import fabricated reputation, safety scores, arbitrary logos, or explorer labels as trusted security data.

Validate at startup: nonempty list, at most 20 unique pairs, at most 5 unique tokens, chain ID `1`, valid nonzero addresses, no duplicate normalized tuple, consistent token/spender metadata, reviewed source URL format, and bounded text lengths. The pair list is explicit; do not generate a token-by-spender Cartesian product.

During Stage 02 choose a small real set with at least three pairs across two tokens and two spenders. Verify deployment addresses from primary sources and contract bytecode with `eth_getCode` during the opt-in live registry smoke check. Never create permissions or transfer funds to populate a demo. Initial zero results are valid; synthetic fixtures demonstrate active cases.

## viem and RPC flow

Use `createPublicClient` with `mainnet`, an explicit environment-provided HTTP endpoint, and a read-only ABI. Do not create a wallet client. The allowed RPC surface is `eth_chainId`, `eth_getBlockByNumber`, `eth_call`, and `eth_getCode` for deployment validation. [Ethereum's JSON-RPC reference](https://ethereum.org/developers/docs/apis/json-rpc/) describes the underlying requests.

For every live scan:

1. Verify the provider reports chain ID `1`, even though the client is configured for mainnet.
2. Fetch `getBlock({ blockTag: 'finalized' })`. Require a number, hash, timestamp, and a block age at most 1,800 seconds; reject impossible future timestamps beyond 60 seconds of clock tolerance.
3. Capture that block number and pass it to every token read. Never replace individual failures with a read at a newer block.
4. Read `allowance(owner, spender)` once per pair and `balanceOf(owner)` once per unique token, prioritizing these before optional metadata. Read `name()`, `symbol()`, and `decimals()` once per unique token within the same budget.
5. Return typed per-field results, including failures, and the captured block identity. A shared token read failure affects all pairs for that token without repeating the read.

The finalized tag intentionally sacrifices head freshness for a stable snapshot. Unsupported finalized reads or unavailable recent state are explicit failures, not a silent switch to latest. No archive node is required for ordinary recent snapshots, but the provider must support `eth_call` at the selected recent block. A dishonest RPC provider or exceptional finality violation remains outside the MVP's verification guarantees.

See viem's [block action](https://viem.sh/docs/actions/public/getBlock) and [readContract action](https://viem.sh/docs/contract/readContract). Use the installed version's supported APIs when implementing.

## Addresses

Share one normalization rule between API and browser:

1. Trim outer whitespace; require exactly `0x` followed by 40 hexadecimal characters.
2. Reject the zero address. Accept both externally owned accounts and contract wallets; do not require transaction history or code absence.
3. Accept uniformly lowercase or uppercase hexadecimal bodies. For mixed-case bodies, compare the input with its EIP-55 checksum and reject mismatches.
4. Normalize the response to EIP-55 form and use lowercase addresses for internal tuple keys.

Do not rely on a library's default checksum behavior without tests. viem's [getAddress](https://viem.sh/docs/utilities/getAddress) normalizes checksum encoding; normalization alone is not proof that the supplied mixed-case input was valid. ENS, chain-prefixed addresses, internal whitespace, URLs, and user-supplied chain identifiers are unsupported.

## Exact amounts and metadata

Use `bigint` for decoded uint256 values and verify the range `0..2^256-1`. Do not use `Number`, `parseFloat`, floating-point ratios, or locale formatting for risk comparisons or quantity sorting. Serialize raw amounts as base-10 strings with no sign or exponent.

Decimals must be an integer `0..255` when successfully decoded. They are display scaling only; compare allowance and balance in the same token's raw units. Missing decimals produce `formatted: null`, not an assumed 18. With decimals available, produce an exact base-10 string without exponent, rounding, or grouping; strip insignificant trailing fractional zeros. Formatting zero returns `"0"`.

Treat metadata as untrusted optional text. Limit decoded name to 120 characters and symbol to 32, sanitize control characters, and never render it as HTML. Oversized or malformed values become field failures; abort oversized upstream responses before decoding with a 1 MiB transport response limit. Missing metadata must not discard a valid raw allowance. The standard's optional metadata and unusual token implementations are reasons to preserve field-level failures.

## Reliability and bounded work

Authoritative limits are in the [API contract](api-design.md): 15-second total deadline, 3-second per-attempt RPC timeout, one transient retry, four reads per scan, four scans per process, and sixteen process-wide in-flight reads. Use a scheduler with a shared deadline and abort-aware transport; a `Promise.race` that leaves work running is insufficient. Reserve capacity for no more than the configured set. There is no queue.

Start without JSON-RPC batching or Multicall. Individual pinned reads simplify error attribution and provider compatibility. If quota measurements later justify batching, preserve per-field failure isolation, fixed block selection, response limits, and the same budget. Do not introduce it as a prerequisite.

Retry only transient transport errors, provider throttling, and eligible server failures, at most once after bounded jitter around 200 ms and only if the deadline permits. Honor a provider retry delay only when it fits the remaining budget; otherwise fail the affected read. Do not retry deterministic contract reverts or invalid decode results. Disable overlapping viem retry layers and hidden defaults that could multiply attempts. Do not sleep through the total deadline.

Use one explicit provider initially. There is no public endpoint fallback, cross-provider merge, or demo fallback. A future secondary provider would need chain and block identity agreement and privacy/quota review. Failures become normalized codes, never raw provider messages or URLs. Release concurrency permits after cancellation settles, including client disconnects.

## Verification boundaries

Adapter tests must control request time and response ordering. Cover chain mismatch, stale/missing finalized block, unsupported tags, contract revert, malformed return data, optional metadata absence, maximum uint256, unusual decimals, retries, and cancellation. Ordinary CI uses mocks. A separately invoked live smoke check may verify configured deployment addresses and read a public address, without asserting an allowance must be positive. See [Stage 02](../features/stages/02-blockchain-integration.md).
