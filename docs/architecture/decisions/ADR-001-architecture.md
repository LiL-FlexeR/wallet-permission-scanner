# ADR-001 — Bounded Read-Only Monorepo Architecture

Status: Accepted. Stages 01–02 foundation and internal blockchain integration are implemented. Optional live provider/deployment checks have not run without credentials. Public scan/risk behavior, product UI, and release decisions remain pending their implementation stages.

## Context

Wallet Permission Scanner should demonstrate full-stack TypeScript, Ethereum reads, API design, security reasoning, testing, and production preparation while remaining maintainable by one developer. The requested stack includes Next.js, NestJS, viem, and optional PostgreSQL/Prisma. There is no native RPC operation that enumerates every ERC-20 approval for a wallet. A complete discovery service would materially increase provider, indexing, and correctness work.

The application must never handle keys, request signing, move funds, or make definitive contract-safety claims. Visual design will be supplied separately and should not determine the backend contract.

## Decision

1. Use a pnpm monorepo containing Next.js App Router and NestJS applications, plus shared HTTP schemas/types and TypeScript configuration.
2. Put all Ethereum access behind one narrow injectable viem reader in the API. Use a public client, fixed read ABI, explicit provider, and mainnet chain verification.
3. Inspect only reviewed, explicitly configured token/spender pairs. Cap the registry at 20 pairs and 5 tokens. Publish coverage limitations and its version.
4. Execute synchronous scans within a 15-second budget; enforce per-attempt timeout, bounded retries, request and concurrency limits. Return field-level partial results when any allowance was readable.
5. Select one recent finalized block per scan, read all values at its numeric height, and return its identity. Do not silently use latest or an alternate data source on failure.
6. Separate pure `mvp-1` exposure rules from retrieval. Use raw integer arithmetic and structured signals, with explicit unknown and limited assessments.
7. Use no baseline database, result cache, worker queue, or authentication. Adopt PostgreSQL with Prisma only after a concrete persistence requirement and privacy policy exist.
8. Proxy REST requests through the web origin to one API replica. Use Docker/Compose for local services and production images, with GitHub Actions for release verification.
9. Use explicit deterministic demo mode with the same API shape and synthetic-data labeling; never substitute it for failed live scans.
10. Leave frontend visual decisions open until owner-supplied Refero references are available. Functional API work can progress independently.

## Alternatives considered

| Alternative | Why not selected now |
| --- | --- |
| Next.js-only backend | Simpler deployment, but omits the explicitly requested NestJS backend and its architectural demonstration |
| Browser-to-RPC reads | Exposes provider access, duplicates budgets and classification, and makes controlled API failure handling harder |
| Historical event indexer | More discovery complexity than the bounded MVP needs; historical state still requires verification |
| Hosted approval indexing API | Adds cost, secrets, coverage guarantees, and external dependencies before they are necessary |
| Unbounded user-selected token/spender lists | Enables expensive arbitrary work and undermines predictable coverage and latency |
| Latest block per read | Fresher individual reads but inconsistent balance/allowance comparison across a scan |
| Database and persistent history immediately | No current user requirement; adds retention and migration responsibilities |
| Async jobs, Redis, BullMQ | Unnecessary for a small bounded registry and synchronous request deadline |
| Reputation-based scoring | No verified reputation dataset; would invite misleading claims |
| Multiple providers and state proofs | Greater verification scope and cost than this portfolio MVP can support |

## Consequences

The project has a reviewable progression from workspace to reads, API, frontend, validation, and release. Mocks and demo mode isolate external service availability. Shared schemas support type safety without coupling risk to UI. The backend can be understood and tested without building a generic domain framework.

Coverage is deliberately limited. A complete result is complete only for the registry. Finalized state is older than head state. RPC availability and honesty remain dependencies. Optional metadata can cause a partial result without invalidating a raw allowance. A bounded synchronous scan may omit fields when its deadline expires.

The two-application stack has more operational work than a Next.js-only prototype, but it directly serves the requested learning and portfolio goals. No performance metrics are assumed. Any future claims must come from measured deployed evidence.

## Trade-offs and revision triggers

- Registry expansion approaching quota/deadline limits: measure call cost before adding batching or reducing supported scope.
- Genuine comprehensive discovery requirement: evaluate indexers and document coverage guarantees; do not rebrand configured scans as complete discovery.
- Measured duplicate scan load: specify cache freshness and bounded memory before adding persistent storage.
- User-requested history: define privacy, authorization, retention, and deletion before adopting PostgreSQL/Prisma.
- Multiple API replicas: replace or supplement process-local quotas with an aggregate design.
- Revocation: treat signing and transaction execution as a new product/security decision, outside this read-only architecture.
- Changes in installed framework versions: follow version-matched documentation and revise implementation details without changing product guarantees silently.

Related specifications: [overview](../overview.md), [blockchain strategy](../blockchain-integration.md), [API contract](../api-design.md), [data and risk model](../data-model.md), [security](../security.md), and [roadmap](../../features/ROADMAP.md).
