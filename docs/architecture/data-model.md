# Data Model and Risk Policy

## Persistence decision

The initial scanner needs no persistent database. Allowances and balances come from Ethereum; supported coverage is a reviewed source-controlled registry; risk is calculated on demand. Storing every public wallet query would introduce retention, migrations, and privacy obligations without improving the bounded scan's correctness.

Do not add PostgreSQL, Prisma, user accounts, wallet ownership records, token tables, or scan-history endpoints to the baseline. PostgreSQL with Prisma remains the selected stack if a later requirement justifies persistence. This is an explicit deferral, not a replacement with another database.

## Data ownership

| Data | Source | Storage and lifetime |
| --- | --- | --- |
| Supported pairs and identity provenance | Reviewed server registry | Source control; changes require a new registry version |
| Chain ID, block identity, timestamp | RPC preflight | Request memory and returned snapshot |
| Raw allowance and balance | Pinned contract reads | Request memory; decimal strings in response |
| Token name, symbol, decimals | Pinned optional contract reads | Request memory; no assumed decimal fallback |
| Risk assessment | Pure backend policy | Request memory; return policy version |
| Request state and filter settings | Browser | In memory; no persisted wallet history by default |
| Operational logs | API | Request ID, outcome, timings, counts, safe error codes; no raw wallet or RPC URL by default |

## Registry model

`Registry` has `registryVersion: string`, `chainId: 1`, `limitation: string`, and `pairs: SupportedPair[]`. A `SupportedPair` has token and spender addresses and optional reviewed identity metadata. Bounds, verification provenance, and validation are specified in [blockchain integration](blockchain-integration.md).

For spender identity, use `identity: verified | unverified`, `label: string | null`, `identitySourceUrl: string | null`, and `identityReviewedAt: YYYY-MM-DD | null`. Verified requires all three metadata fields; unverified requires nulls. Verification describes an address-to-name mapping only. It is not a reputation signal that reduces risk.

There is no separate database entity for a token or spender. Registry entries that reference the same address must agree on identity metadata.

## Domain and transport models

Internally use a discriminated `ReadResult<T>`: success with a value, or failure with a normalized code. Never use `0n` or an empty string as a failure sentinel. Aggregate reads into one record per configured tuple.

| Model | Fields and invariants |
| --- | --- |
| `Amount` | `raw: string`, `formatted: string \| null`; raw is canonical unsigned decimal uint256, formatted is exact token-unit text only if decimals were read |
| `Snapshot` | `blockNumber: string`, `blockHash: 0x` plus 64 hex characters, `blockTimestamp: ISO-8601 UTC`, `finality: finalized` |
| `TokenInfo` | `address`, nullable `name`, nullable `symbol`, nullable integer `decimals`, fixed-origin `explorerUrl` |
| `SpenderInfo` | `address`, identity metadata above, fixed-origin `explorerUrl` |
| `PermissionRecord` | `id`, `token`, `spender`, nullable `allowance`, nullable `balance`, `activity`, `risk` |
| `RiskAssessment` | `level`, `assessment`, ordered `signals`; scan envelope carries `riskPolicyVersion` |
| `FieldWarning` | `pairId`, `field`, `code`; one entry per failed record field, including repeated shared-token failures |

The stable record ID is `1:<lowercase-token-address>:<lowercase-spender-address>`. It is unique within a scan; a wallet is identified by the enclosing scan. Returned addresses use EIP-55 encoding. No token values are JavaScript numbers in transport or browser computations.

`activity` is `active` for a positive readable allowance, `inactive` for a zero readable allowance, and `unknown` for an unreadable allowance. `allowance: null` requires `activity: unknown` and an allowance warning. `balance: null` requires a balance warning. Missing name, symbol, or decimals requires the corresponding warning. A formatted amount can be null solely because decimals failed even when the raw value is known.

All record and envelope fields, query behavior, counts, example JSON, and error enums are defined in the [API contract](api-design.md). `packages/contracts` supplies health/error/scan/coverage runtime schemas and shared EIP-55 validation. Runtime refinements enforce transport bounds, exact amount scaling, tuple IDs/order, counts, nullable states, warning correspondence, complete/partial status and (from Stage 05) the full assessment against the pure versioned policy; inferred types and synthetic HTTP fixtures are available to the frontend. Stage 02 domain types using `bigint` and discriminated field results remain internal to the backend.

The pure policy implementation is shared at `packages/contracts/src/risk.ts` so backend calculation and response validation use one rule source. The API owns classification during scans; the browser checks consistency and displays the returned assessment without independently changing results. Retrieval remains backend-only.

## Deterministic risk policy: `mvp-1`

This is an application-defined heuristic for permission exposure, not a probability of theft, vulnerability assessment, or monetary loss estimate. Calculate it separately from RPC retrieval using only raw allowance, balance availability, and spender identity state. Token price, historical events, transaction volume, and fabricated reputation are not inputs.

Constants:

- `MAX_UINT256 = 2^256 - 1`.
- `LARGE_ALLOWANCE_MULTIPLIER = 10`.
- Level order for readable active permissions: `low < medium < high`.
- `none` means no active allowance in that record; `unknown` means no allowance assessment was possible. Neither means a wallet or contract is safe.

Apply these rules in order:

1. If allowance is unreadable, return `level: unknown`, `assessment: unavailable`, and only `ALLOWANCE_UNAVAILABLE`.
2. If allowance is zero, return `level: none`, `assessment: complete`, and no signals. Other field failures remain warnings but cannot make that zero allowance active.
3. For a positive allowance, start with `level: low` and `ACTIVE_ALLOWANCE`.
4. If allowance equals `MAX_UINT256`, add `UNLIMITED_ALLOWANCE` and raise level to `high`. Other very large values are finite under this policy; do not introduce an undocumented near-maximum threshold.
5. If balance is readable and positive, and `allowance >= 10 * balance`, add `LARGE_RELATIVE_TO_BALANCE` and raise level to at least `medium`. Equality qualifies. Multiplication uses arbitrary-precision integers and may exceed uint256 as an intermediate comparison value.
6. If balance is readable and zero, add `ZERO_BALANCE_WITH_ALLOWANCE` and raise level to at least `medium`. Do not divide by zero or label this an infinite ratio.
7. If spender identity is unverified, add `UNVERIFIED_SPENDER` as informational context; it does not independently raise the level.
8. If balance is unreadable, add `BALANCE_UNAVAILABLE` and use `assessment: limited`; skip both balance comparison rules. Otherwise assessment is `complete`.

Take the highest triggered exposure level; a verified identity never reduces it. A maximum allowance remains `high` with a limited assessment if balance failed. Metadata failures do not change risk: the raw allowance and balance use the same unit regardless of decimals. Emit signals in the order above; emit no duplicates.

| Signal code | Severity | Parameters | Meaning |
| --- | --- | --- | --- |
| `ALLOWANCE_UNAVAILABLE` | `info` | `{}` | Allowance could not be read; no conclusion |
| `ACTIVE_ALLOWANCE` | `low` | `allowanceRaw: string` | Nonzero spending permission exists at the snapshot |
| `UNLIMITED_ALLOWANCE` | `high` | `allowanceRaw: string` | Maximum uint256 value; classified as unlimited by policy |
| `LARGE_RELATIVE_TO_BALANCE` | `medium` | `allowanceRaw`, `balanceRaw`: strings; `multiplier: 10` | At least ten times the current positive token balance |
| `ZERO_BALANCE_WITH_ALLOWANCE` | `medium` | `allowanceRaw: string`, `balanceRaw: "0"` | Permission can remain relevant to future deposits |
| `UNVERIFIED_SPENDER` | `info` | `{}` | Registry lacks reviewed identity mapping |
| `BALANCE_UNAVAILABLE` | `info` | `{}` | Size relative to balance could not be assessed |

The response supplies codes and parameters; the frontend maps them to explanations consistent with this table. Do not infer risk from signal count. A low level is simply the baseline active-permission case, and high indicates allowance breadth, not proof of malicious intent.

## Required policy fixtures

| Raw allowance | Raw balance | Identity | Expected result |
| --- | --- | --- | --- |
| unavailable | any | any | unknown / unavailable; allowance-unavailable signal only |
| `0` | unavailable | unverified | none / complete; no signals; balance warning still present |
| `1` | `100` | verified | low / complete |
| `999` | `100` | verified | low / complete |
| `1000` | `100` | verified | medium / complete; large-relative signal |
| `1` | `0` | verified | medium / complete; zero-balance signal |
| maximum uint256 | `100` | unverified | high / complete; active, unlimited, large, unverified signals |
| maximum uint256 | unavailable | unverified | high / limited; active, unlimited, unverified, balance-unavailable signals |
| `1` | unavailable | verified | low / limited; active and balance-unavailable signals |

Also test finite near-maximum allowance with a similarly large balance, values beyond JavaScript's safe integer range, and missing decimals. Changing thresholds, semantics, or signal order requires a policy version change and updated fixtures, API documentation, and frontend explanations.

## Freshness, caching, and history

Every live scan reads again. Return scan timestamps and the actual chain snapshot; never describe `completedAt` as the time of on-chain approval. No approval transaction hash or approval timestamp can be inferred from a current allowance read.

Baseline storage is request-local, plus bounded operational limiter state. There is no completed-result cache, no stale-result fallback, no durable scan history, and no browser localStorage containing addresses. Tests/demo fixtures are synthetic, labeled, and versioned.

If quota or latency evidence later justifies caching, first specify a bounded capacity, short TTL, key containing chain/address/registry/policy/mode, explicit cache-hit/freshness metadata, and exclusion of partial/error results. Preserve the original block and read timestamps. Update the API contract before enabling it; `no-store` still applies to shared HTTP caches. A small process-local cache should be considered before adding a database or Redis.

If scan history is later requested, document user purpose, opt-in behavior, retention, deletion, authorization, and wallet-address privacy before adding a schema. A minimum PostgreSQL model could store an ID, normalized wallet, chain, registry/policy versions, snapshot identity, timestamps, and a versioned result document; do not implement speculative normalization or publicly enumerable history endpoints. Persistent history is not required for this project's portfolio value.
