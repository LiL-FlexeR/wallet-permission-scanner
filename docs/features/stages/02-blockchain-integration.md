# Stage 02 — Blockchain Integration

## Objective

Provide a bounded, testable Ethereum mainnet reader that returns current allowance/balance state for reviewed configured pairs at a single finalized block. This stage produces an internal capability; the public scan API and risk classification follow in Stage 03.

## Prerequisites

- [Stage 01](01-project-foundation.md) is complete: API startup, shared package resolution, environment validation, and deterministic tests work.
- Read the [blockchain strategy](../../architecture/blockchain-integration.md), [data model](../../architecture/data-model.md), and [API budgets](../../architecture/api-design.md).
- Choose a mainnet RPC provider supporting finalized blocks and recent numeric-block `eth_call`; a credential is needed only for an opt-in live smoke check.
- Research primary project deployment sources for a small supported-pair registry. No spender identity or reputation is assumed from an address label alone.

## Scope

Implement viem configuration, shared address validation, registry validation, chain/snapshot preflight, ERC-20 reads, exact quantities, per-field failures, upstream deadlines/retries, and live readiness. Prepare a narrow reader boundary and synthetic test reader so no test depends on external Ethereum state.

## Technical Requirements

- Use a viem public client, explicit configured RPC URL, fixed mainnet configuration, and read-only ABI. Never instantiate a signer/wallet client.
- Verify `eth_chainId == 1` for every scan preflight and readiness probe. Client configuration alone is insufficient.
- Fetch one finalized block with number/hash/timestamp. Reject age over 1,800 seconds, timestamp over 60 seconds in the future, missing values, and unsupported finalized tags. Do not fall back to latest.
- Pin all reads to that numeric block. Read balance and metadata once per unique token and allowance once per explicit pair. Core allowance/balance reads take priority over metadata.
- Registry must have no more than 20 unique pairs and 5 tokens, with no zero addresses or tuple duplicates. Select at least three reviewed real pairs across two tokens and two spenders for the initial live set.
- Implement address trimming, strict hex length, zero rejection, mixed-case EIP-55 verification, lowercase/uppercase acceptance, and checksummed output. Contract wallets are allowed; ENS is not.
- Use discriminated successes/failures and `bigint` throughout internal arithmetic. Validate uint256 and metadata ranges. Missing decimals never default to 18.
- Enforce the 15-second scan deadline, three-second attempt timeout, at most one transient retry, four concurrent reads per scan, sixteen RPC calls process-wide, and 1 MiB upstream response cap. No hidden retry multiplication, unbounded promises, JSON-RPC batch, or Multicall prerequisite.
- Cancellation and deadline propagation must stop scheduling and abort/settle in-flight requests. Expose typed errors to orchestration; do not forward provider messages.
- Implement one background readiness probe every 30 seconds, at most one active, six-second total budget, no retries, and stale success after 60 seconds. Probe calls share global RPC permits. Demo readiness requires no RPC.

## Implementation Tasks

- [ ] Define `EthereumReader` input/output types: owner, immutable registry snapshot, shared deadline/cancellation, block identity, and per-token/per-pair field results. Keep HTTP DTOs separate.
- [ ] Implement one shared address normalizer and boundary fixtures before using addresses as keys or RPC arguments.
- [ ] Add typed registry entries, startup validation, consistent provenance, stable versioning, and normalized tuple IDs. Keep pair expansion explicit.
- [ ] Review deployment documentation for the initial live entries; record sources/review dates. Verify contract bytecode in a separately invoked live smoke check.
- [ ] Configure the viem public client and abort-aware bounded HTTP transport for the installed version; test that upstream size and timeout limits work before concurrent reads.
- [ ] Implement chain and finalized-block preflight, including stale and future timestamp rejection.
- [ ] Implement deduplicated token reads and pair allowances with numeric block pinning and fair bounded scheduling. Preserve exact raw results and null-capable metadata.
- [ ] Normalize contract, decode, transport, throttling, timeout, and deadline failures into the agreed field codes. Retry eligible transient failures only once if budget remains.
- [ ] Provide deterministic synthetic reader/transport fixtures for success, zero, active, metadata failure, partial, and total provider failure. Final public demo packaging belongs to Stage 06.
- [ ] Replace Stage 01's live readiness placeholder with the bounded cached probe; ensure health requests themselves never cause RPC traffic.
- [ ] Run deterministic tests and the optional live read smoke check when credentials are available. Document provider requirements and any unsupported token behavior without broadening coverage claims.

Implement validation and the reader interface first, preflight second, and contract fan-out only after cancellation and attempt limits work.

## Expected Files and Modules

- `apps/api/src/blockchain/ethereum-reader.ts`, `viem-ethereum.reader.ts`, `erc20.abi.ts`, `rpc-errors.ts`, and module wiring.
- A small request scheduler/transport helper within `blockchain/` or `config/`; no generic job framework.
- `apps/api/src/registry/mainnet.registry.ts`, registry service/validator, and source provenance.
- Shared address validation in `packages/contracts/src/` if compatible with both runtimes.
- Updated `health/` readiness and tests, synthetic reader/transport fixtures, and optional live-smoke test entry point.
- README provider requirements and verified live-smoke invocation, if one is added.

## API Contracts

No public scan route is introduced. The internal reader returns block metadata and field `ReadResult` objects that Stage 03 can map without provider-specific logic. Field errors use the codes in the [API design](../../architecture/api-design.md).

`GET /health/ready` now reports live blockchain `ok` only with a valid fresh probe and `503`/`unavailable` otherwise. Liveness never depends on Ethereum. In demo mode, blockchain is `not_required`. A healthy probe does not promise every token method succeeds.

## Data Models

- `SupportedPair`: token/spender addresses and optional reviewed identity mapping.
- `Registry`: version, chain ID, limitation, bounded pairs.
- `ReadResult<T>`: success/value or failure/code, not a zero sentinel.
- `Snapshot`: block number as internal bigint, hash, timestamp, finalized status.
- Internal raw amounts: bigint uint256; metadata: nullable bounded strings and optional decimals after normalization.

These are in-memory models only. Final HTTP serialization is specified in the [data model](../../architecture/data-model.md); no database is needed.

## Edge Cases

- Invalid checksum that normalization alone would silently correct; zero owner; uppercase input; contract-wallet owner.
- Provider configured for another network, unsupported finalized tag, stale block, incomplete block object, or recent numeric-block state unavailable.
- One token reverts only on metadata; shared balance fails for multiple pairs; allowance succeeds with a zero balance.
- uint256 maximum, finite near-maximum values, decimals 0 and 255, and amount values beyond safe JavaScript integer range.
- Malformed ABI result, missing metadata methods, oversized response/string, and control characters.
- Provider throttling, retry delay longer than remaining budget, disconnect during retry, deadline while reads are queued, and permit release after abort.
- Registry duplicate with different address casing, inconsistent identity metadata, excessive token/pair count, and invalid source URL.

## Security Considerations

Restrict all RPC destinations to operator configuration. Do not fetch registry source URLs during a scan. Verify identity from primary deployment sources without inventing reputation. The only deployment validation operation is a read of bytecode; no funds or approvals are needed. Sanitize transport errors before any logging. Document the trusted-provider boundary and limited coverage.

## Testing Requirements

- Unit tests for address normalization, registry bounds, deduplication, and exact formatting.
- Mock transport tests asserting chain verification and the same numeric block for every contract request.
- Fake-clock tests for retry count, jitter bounds, total deadline, probe freshness, cancellation, and permit cleanup under concurrency.
- Contract fixtures for reverts, malformed responses, optional metadata absence, and maximum integers.
- Deterministic tests must pass without credentials or network. Optional live smoke checks verify reads/deployment code, not a specific wallet's positive allowance.

## Acceptance Criteria

1. The reader returns one allowance result per configured pair and one shared balance/metadata result per token without exceeding limits.
2. Wrong-chain and invalid/stale finalized state fail before any token scan work.
3. Every successful contract request is pinned to the captured block; failures never become zero values.
4. Maximum raw values and unusual decimals survive normalization without precision loss.
5. Cancellation and provider failure tests show no unbounded work or leaked permits.
6. Initial live registry sources are reviewable, and health endpoints implement the documented readiness semantics.

## Recommended Codex Skills

- `nestjs-best-practices`, if available: injectable reader, module lifecycle, health integration, and isolated tests.
- No Ethereum-specific skill is identified in the supplied catalog. Use official viem and Ethereum documentation matching the installed versions rather than invoking an invented skill.

Recommendations do not imply installation. Check availability and read the chosen skill first; do not install automatically. This stage needs no frontend design, Prisma, Redis, or indexing skill.

## Definition of Done

All tasks, edge-case tests, and acceptance criteria pass; registry provenance and provider requirements are documented; no writable operation exists. Record whether the optional live smoke check ran, rather than claiming it passed without credentials. Update the [roadmap](../ROADMAP.md). Stage 03 can start when the reader interface, error codes, snapshot behavior, and deterministic fixtures are stable.

## Out of Scope

Public scan API, risk labels, historical log discovery, hosted indexers, wallet connection, arbitrary user token lists, multi-chain support, persistent caches, price feeds, and transactions.
