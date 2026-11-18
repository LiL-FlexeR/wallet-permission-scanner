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

- [ ] Define request, coverage, amount, permission, risk-signal union, scan-success, warning, and error schemas in `packages/contracts` with bounded strings/arrays and null invariants.
- [ ] Implement pure risk policy constants and assessment function, then table-driven boundary tests before controller integration.
- [ ] Implement exact amount serialization and permission mapping, including safe explorer URLs, null metadata, field warnings, and stable tuple ordering.
- [ ] Implement scan orchestration: capture immutable registry, admit within limits, preflight, invoke reader, classify, compute counts, and validate outgoing response.
- [ ] Preserve deadline/abort propagation from HTTP lifecycle to reader. Verify all resources are released on success, exceptions, deadline, and disconnect.
- [ ] Implement `POST /api/v1/scans` and `GET /api/v1/coverage` with strict validation and body/query/method handling.
- [ ] Add or complete exception filtering for malformed JSON, invalid input, body/media limits, application capacity, wrong chain, snapshots, provider failure, and unexpected exceptions.
- [ ] Add separate route counters, bounded expiring IP state, trusted-proxy identity configuration, request IDs, no-store headers, and safe logs.
- [ ] Generate OpenAPI, document complete/partial/error examples, and expose development/test documentation endpoints. Validate schema generation against HTTP responses.
- [ ] Run Nest HTTP and domain tests, exercise deterministic live-mode mocks and demo reader, and update API/README commands with real verification results.

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
