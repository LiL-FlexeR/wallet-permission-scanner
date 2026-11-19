# Stage 03 — Backend API and Risk Analysis

## Objective

Expose a type-safe bounded scan API that reports current configured permissions, explicit failures, and deterministic explainable exposure classifications. Produce the stable integration contract required by the frontend.

## Prerequisites

- [Stage 02](02-blockchain-integration.md) is complete: reader, registry, snapshot, typed errors, readiness, cancellation, and deterministic fixtures are verified.
- Read the [API contract](../../architecture/api-design.md), [data and risk model](../../architecture/data-model.md), [security specification](../../architecture/security.md), and [module responsibilities](../../architecture/overview.md).
- Confirm shared runtime schemas can be consumed by NestJS and the frontend without backend-only dependencies. Decide on a supported schema-to-OpenAPI conversion compatible with installed Zod/tooling versions.

## Scope

Implement scan and coverage endpoints, strict input validation, result normalization, pure `mvp-1` rules, structured errors, rate/capacity limits, privacy controls, and generated API documentation. Evaluate caching and retain the baseline decision: no completed-result cache or persistence unless a new documented requirement is approved within project scope.

## Technical Requirements

- `POST /api/v1/scans` accepts only `{address}` with no queries; `GET /api/v1/coverage` publishes the bounded registry without RPC work.
- Use the shared schemas as the authoritative request/response definitions. Infer TypeScript types and generate OpenAPI from the same source; avoid parallel manual DTO definitions.
- Serialize raw quantities/block numbers as strings; return all configured pairs in stable ID order. One failed field never discards another pair's success.
- `checkedPairs + failedPairs == configuredPairs == permissions.length`; activity counts agree with successful/unreadable allowances. A readable zero is inactive; failure is unknown.
- Return `200 complete` only if all fields succeeded; return `200 partial` when at least one allowance succeeded and any field failed. All allowances unreadable produce `503`, or `504` on total deadline. Wrong chain/preflight failures return no fabricated records.
- Apply `mvp-1` exactly: positive baseline low; exact uint256 max high; allowance at least ten times positive balance medium; positive allowance with zero balance medium; identity unknown informational; missing balance limits an active assessment. Zero allowance is none; unreadable allowance is unknown.
- Risk functions do no I/O and use raw bigint input. Verified identity never reduces exposure. Return structured ordered signals with exact parameters, not a numeric score.
- Enforce 10 scan requests/minute/IP, 60 coverage requests/minute/IP, four admitted scans/process, no queue, bounded limiter state, and the reader budgets. Limit before expensive work and protect malformed attempts too.
- Accept forwarded IPs only through configured trusted proxy CIDRs; otherwise use the actual peer IP. Do not conflate provider throttling with caller rate limits.
- Use server request IDs, safe error text, `Retry-After`, and `Cache-Control: no-store` as specified. No request-body/address/secret logs by default.

## Implementation Tasks

- [x] Define request, coverage, amount, permission, risk-signal union, scan-success, warning, and error schemas in `packages/contracts` with bounded strings/arrays and null invariants.
- [x] Implement pure risk policy constants and assessment function, then table-driven boundary tests before controller integration.
- [x] Implement exact amount serialization and permission mapping, including safe explorer URLs, null metadata, field warnings, and stable tuple ordering.
- [x] Implement scan orchestration: capture immutable registry, admit within limits, preflight, invoke reader, classify, compute counts, and validate outgoing response.
- [x] Preserve deadline/abort propagation from HTTP lifecycle to reader. Verify all resources are released on success, exceptions, deadline, and disconnect.
- [x] Implement `POST /api/v1/scans` and `GET /api/v1/coverage` with strict validation and body/query/method handling.
- [x] Add or complete exception filtering for malformed JSON, invalid input, body/media limits, application capacity, wrong chain, snapshots, provider failure, and unexpected exceptions.
- [x] Add separate route counters, bounded expiring IP state, trusted-proxy identity configuration, request IDs, no-store headers, and safe logs.
- [x] Generate OpenAPI, document complete/partial/error examples, and expose development/test documentation endpoints. Validate schema generation against HTTP responses.
- [x] Run Nest HTTP and domain tests, exercise deterministic live-mode mocks and demo reader, and update API/README commands with real verification results.

Implement schemas and risk tests before mapping; implement mapping before orchestration; apply abuse controls before exposing the scan route for browser integration.

## Expected Files and Modules

- `packages/contracts/src/` schemas, inferred types, constants/enums, and contract tests.
- `apps/api/src/risk/assess-permission.ts`, `risk-policy.ts`, and colocated tests.
- `apps/api/src/scans/` controller/service/module/mapper and tests.
- Registry coverage accessor; `common/http/` validation, error envelope, request IDs, rate limits, and trusted-proxy handling.
- API documentation generation/bootstrap and `apps/api/test/` HTTP tests.
- Updates to [API documentation](../../architecture/api-design.md), [risk policy](../../architecture/data-model.md), and README only if implementation details require clarification; do not silently change rules.

## API Contracts

The [API design](../../architecture/api-design.md) is authoritative, including full example JSON. Implement:

| Route | Request | Result |
| --- | --- | --- |
| `POST /api/v1/scans` | `{address: string}`; no query | Scan envelope with source, versions, snapshot, coverage, summary, all permissions, warnings |
| `GET /api/v1/coverage` | No query/body | Chain/source/versions/limitation and explicit supported pairs |
| Development docs | `GET /api/openapi.json`, `GET /api/docs` | Generated contract and API explorer, disabled by default in production |

Error cases include `400`, `404`, `405`, `413`, `415`, `429`, `503`, `504`, and `500` with the exact codes in the contract. `429` means caller quota; provider throttling becomes warnings or `503`. Keep health status bodies distinct as documented. Do not introduce a stored scan resource or return `202` for synchronous work.

## Data Models

Use [PermissionRecord, RiskAssessment, and FieldWarning](../../architecture/data-model.md) exactly. The transport has no bigint values, inferred approval dates, transaction hashes, fiat amounts, or reputation claims. Capture registry and policy versions in every scan so later consumers can interpret results correctly. No persistent entities are required.

## Edge Cases

- Zero allowance with missing balance: overall partial, risk none/complete, balance warning.
- Maximum allowance with missing balance: high/limited; missing metadata alone does not limit raw-unit scoring.
- Finite values immediately below max; threshold equality versus one unit below; balance zero versus unreadable.
- All allowances zero versus all allowances unreadable; empty live registry rejected rather than a clean empty scan.
- One token balance failure repeated across pair records; counts based on allowances, not warning count.
- Deadline after some reads versus deadline before any allowance; canceled requests cannot retain capacity.
- Coverage loaded before a registry update; embedded response version remains authoritative.
- Malformed JSON, scalar JSON, long addresses, query injection, unknown keys, oversized body, and non-JSON media type.
- Spoofed forwarded IP, limiter cardinality exhaustion, local caller rate limit versus provider rate limit.

## Security Considerations

No caller-controlled RPC/token/spender inputs. Never emit raw provider exceptions, credential URLs, rejected payloads, or stack traces. Fixed-origin explorer links use validated addresses. Return no safety certification. Keep runtime classification independent of human text and verify that unverified spender metadata cannot invent a label or lower exposure. Bounded synchronous work must remain bounded on every exception path.

## Testing Requirements

- Table-driven risk fixtures from the data model, including exact signal order, severity, parameters, and policy version.
- Schema and serialization tests for uint256 limits, null invariants, metadata limits, and stable IDs/order.
- Nest HTTP tests for success, inactive-only, partial, preflight failure, total provider failure, total deadline, and sanitized unexpected errors.
- Fake-clock rate-window, capacity, limiter-state expiry, retry-after, and trusted/untrusted proxy tests.
- Contract tests validate OpenAPI and representative actual responses against shared schemas. Do not rely on compile-time types alone.

## Acceptance Criteria

1. Both application endpoints return the exact shared contract and no unbounded lists.
2. All risk boundary fixtures pass with pure functions and no network calls.
3. Partial results preserve known data and expose unknown fields; no failure can become a zero allowance.
4. Rate/capacity limits and deadlines operate before uncontrolled provider work; permits and limiter memory stay bounded.
5. API examples, runtime schemas, generated OpenAPI, and HTTP tests agree.
6. A frontend engineer can integrate using schemas, sample fixtures, errors, and metadata without knowledge of viem internals or a visual design.

## Recommended Codex Skills

- `nestjs-best-practices`, if available: controllers, validation, dependency injection, error filters, guards, and HTTP tests.
- No database skill is needed for the baseline. Only after a separately justified persistence requirement consider `prisma-orm-setup` and `supabase-postgres-best-practices`; use version-specific installed Prisma instructions rather than legacy recipes from `prisma-client-api`.

These recommendations use the owner's catalog, not a verified installation inventory. Inspect availability and selected instructions first; never install automatically. Do not add database work just to use a skill.

## Definition of Done

All implementation tasks and acceptance criteria pass, public contracts are documented and generated, deterministic fixtures are usable by web tests, and security/coverage language matches actual behavior. Update [roadmap progress](../ROADMAP.md). Stage 04 can begin when the shared API package and error behavior are stable and runnable without a live RPC provider.

## Out of Scope

Frontend rendering or visual design, historical discovery, authentication, arbitrary token scanning, fiat pricing, reputation, completed-result caching, persistent history, queues, and transactions.


## Verification record — 2026-11-19

Stage 03 is implemented and verified. Stages 04–06 remain unstarted. Applied the installed `nestjs-best-practices` skill for feature modules, constructor injection, schema pipes, safe exception filtering and HTTP tests; project shared schemas and bounded in-memory controls take precedence over generic database/authentication/cache examples.

- `packages/contracts` supplies strict request, amount, snapshot, identity, permission, ordered signal, warning, coverage, scan-success and error schemas with inferred types. Runtime refinements enforce exact formatting, EIP-55 output, tuple IDs/order, counts, null/warning correspondence and complete/partial status. Synthetic complete/partial/coverage HTTP fixtures are exported through `@wps/contracts/fixtures` without backend imports.
- Pure `mvp-1` rules use raw bigint and the specified signal order. Boundary fixtures cover maximum versus finite near-maximum, ten-times equality/one-unit-below, values beyond safe integers, zero/unreadable balance, zero/unreadable allowance and verified/unverified identity. Metadata failures preserve raw-unit scoring.
- Scan orchestration captures one immutable registry, retains all configured pairs, validates outgoing payloads and uses the existing bounded live/demo readers. No result cache, persistence, transactions, automatic demo fallback or additional services were added.
- HTTP controls precede parsing/chain work: 10 scan and 60 coverage attempts/minute/IP; distinct fixed windows start on each route's first use. State is capped at 10,000 IPs, expires after two idle minutes via a single cleanup timer, and is cleared on shutdown. CIDR-based Express trust walks forwarded chains from the peer; malformed identities fall back to the peer. IPv6 representations and mapped IPv4 are normalized. Four admitted scans have no waiting queue; cancellation/deadline/exception/shutdown paths release resources after reader settlement.
- Generated [OpenAPI 3.1](../../api/openapi.json) uses installed Zod `4.6.7` native `z.toJSONSchema`, targeting JSON Schema 2020-12; request conversion selects input semantics for address normalization. No manual DTO/schema conversion package was introduced. Runtime cross-field refinements remain authoritative where JSON Schema cannot encode them. Ajv validates generated schemas against representative fixtures and actual HTTP complete/partial/error/coverage responses, and tests reject a stale checked-in artifact. `pnpm docs:generate` reproduces the artifact.
- Development/test `/api/openapi.json` and `/api/docs` use local Swagger UI assets, with remote validation disabled. Production omits all docs routes/assets. Swagger UI Express `5.0.1` / lockfile UI `5.35.0` and test-only Ajv `8.20.0`, ajv-formats `3.0.1` are recorded in the lockfile. Optional Scarf install-time analytics are disabled.
- Passed `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm docs:generate`, `pnpm test` (**112 tests: 105 API / 7 web**), `pnpm build`, and `pnpm test:production`. HTTP tests include real loopback disconnects, deterministic live-mode RPC mocks, provider throttling versus caller limits, preflight failure, all allowances unreadable, total deadline with/without a known allowance, malformed/oversized/media/query/method input, safe errors/logs, capacity exhaustion, registry changes during a scan and shutdown.
- Production smoke starts built API/Next processes and validates demo scan/coverage through the existing proxy, request IDs/no-store, production docs disabled, runtime target changes, disconnect propagation, startup redaction and browser artifacts. This verifies existing frontend proxy plumbing only; no Stage 04 UI work was done.

The restricted execution sandbox cannot open loopback listeners and prevented Next's child TypeScript configuration probe. HTTP tests, production builds and smoke passed with the approved unrestricted command execution. No live RPC credential was supplied; optional `pnpm test:blockchain:live` was not run. Docker/Compose was not rerun for Stage 03 because no container configuration changed; Stage 01's container verification remains historical evidence, not a new Stage 03 result. No deployed URL or public release is claimed.
