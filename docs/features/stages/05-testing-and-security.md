# Stage 05 — Testing and Security

## Objective

Verify the implemented scanner across domain logic, blockchain failures, HTTP boundaries, frontend behavior, and security controls. Close material correctness and safety gaps before release without expanding product scope.

## Prerequisites

- [Stage 04](04-frontend-integration.md) is complete, including reference-dependent user-facing functionality and a stable API integration. If design references are still missing, earlier API/domain checks may continue but this sequential stage cannot be marked fully complete.
- Stages 01–04 already include their local unit/integration tests; this stage extends cross-layer coverage and reviews security rather than creating all tests from scratch.
- Read [API design](../../architecture/api-design.md), [risk policy](../../architecture/data-model.md), [blockchain guarantees](../../architecture/blockchain-integration.md), and [security specification](../../architecture/security.md).
- Deterministic transport/reader fixtures and runnable web/API services are available without RPC credentials.

## Scope

Unit, integration, HTTP contract, and E2E verification; exact arithmetic; input validation; provider and cancellation failures; abuse limits; privacy; security review; and remediation within the MVP. Use controlled concurrency tests, not claims of production benchmark performance.

## Technical Requirements

- All required CI tests must run without network services, paid credentials, private keys, funded accounts, or state-changing transactions.
- Mock the blockchain reader for API behavior and mock the transport separately to verify the real adapter's request/block/retry behavior. A controller mock alone cannot validate contract reads.
- Keep a single versioned set of synthetic domain/API fixtures shared where appropriate. Clearly label fixtures, avoid real user data, and validate them against runtime schemas.
- Exercise all signal boundary cases and exact uint256 handling. Tests must fail if raw quantities are rounded, unknown becomes zero, or maximum-allowance detection changes without a policy update.
- Verify rate-window behavior with a fake clock and capacity with bounded controlled requests. Test request cancellation, provider timeouts, and permit release after all completion paths.
- Test the actual web-to-API proxy in at least one browser integration path. Pure intercepted browser responses alone do not verify proxy routing or backend contracts.
- Use semantic accessible interactions in E2E tests; avoid coupling to incidental visual markup or reference-specific styling.
- Define pass/fail assertions around documented behavior, not invented coverage percentages or latency achievements.

## Implementation Tasks

- [ ] Inventory existing tests against the matrix below and add only missing meaningful coverage.
- [ ] Complete table-driven risk, normalization, formatting, registry, and schema invariants; include exact threshold boundaries and signal ordering.
- [ ] Test real adapter behavior against controlled RPC responses: chain/snapshot validation, same-block reads, read deduplication, errors, response limits, retries, and abort.
- [ ] Complete Nest HTTP contract cases including all error statuses, no-store/request IDs, complete/partial counts, and no caller-controlled work expansion.
- [ ] Verify trusted-proxy extraction and spoof resistance in both direct and proxied test paths. Confirm limiter entry caps and idle expiry.
- [ ] Add deterministic browser paths through the runnable API for valid/invalid input, inactive-only, partial, unknown amounts, filtering/sorting, errors, rate limiting, and cancellation.
- [ ] Inspect production frontend output and container/build configuration for secrets, server-only dependencies, and accidental result caching.
- [ ] Review metadata rendering/external links, privacy, source/coverage/freshness explanations, and all heuristic claims.
- [ ] Review dependencies and selected versions for known relevant vulnerabilities using available supported tools; triage material findings rather than automatically applying breaking upgrades.
- [ ] Fix findings, rerun affected checks, and record actual security review evidence and known limits in the existing security document. Do not assert an audit certification.
- [ ] Verify the documented test commands from a clean dependency install and record the exact required release checks for Stage 06.

## Expected Files and Modules

- Colocated backend and frontend unit tests; `apps/api/test/` integration/HTTP tests.
- `tests/fixtures/` versioned synthetic scenarios and `tests/e2e/` cross-layer browser tests.
- Browser test configuration and actual root/package scripts, selected for the installed toolchain.
- Updates to existing security/API documentation when a reviewed behavior requires clarification.
- Targeted implementation fixes necessary for tests; no new product subsystem or test-only production bypass endpoint.

## API Contracts

No new business endpoints. Verify the exact [contract](../../architecture/api-design.md), including `200 partial` versus `503`/`504`, all error codes, health exceptions to the common envelope, `Retry-After`, request IDs, and body/query/media restrictions. API documentation routes remain development/test-only by default.

## Data Models

Use canonical schemas and fixture builders. Do not replace uint256 values with convenient small numbers in every test. Include max values, balance zero/unreadable, unknown identity, missing decimals, partial field warnings, and source/version variants. Synthetic scenarios must remain separate from production registry provenance.

## Edge Cases

| Area | Minimum cases and assertions |
| --- | --- |
| Addresses | Lower/uppercase accepted, valid mixed-case accepted, wrong mixed-case/zero/ENS/internal whitespace rejected; contract owner allowed |
| Risk | Zero, one, `10*balance-1`, equality, zero balance, max and near-max, balance missing; no reputation adjustment |
| Precision | Values above `2^53-1`, uint256 max, decimals 0/6/18/255, null formatted values; no float sorting |
| RPC | Wrong chain, missing/stale/future finalized block, unsupported tag, revert, decode error, oversize, throttling, timeout, partial/total failure |
| Work bounds | Duplicate token reads deduplicated, pair/token caps, scan and RPC concurrency, retries/deadlines, cancellation, limiter cardinality |
| HTTP | Malformed JSON, extra fields/query, scalar/array body, wrong media type, oversize body, safe 500, no-store, stable request IDs |
| Browser | Coverage failure/version change, stale response, unmount abort, no active records, filter-empty, partial with unknowns, malformed API response, retry delay |
| Security | Metadata markup/control text, arbitrary destination rejection, forwarded-IP spoofing, no secret in bundle/log/error, safe explorer origin |

## Security Considerations

Perform read-only verification. Do not use real wallets to create approval examples. Never send signatures/transactions or paste credentials into fixture data. Treat dependency scanner output as input to review, not a safety certificate. Verify no application path can select a provider, bypass limits, or relabel demo data as live.

Record residual risks: bounded coverage, trusted provider, finalized-state lag, heuristic classification, process-local limits, and metadata/proxy deployment assumptions. Security review must not imply these boundaries have disappeared.

## Testing Requirements

- Unit and adapter tests run with deterministic clocks/transports and no arbitrary real sleeps.
- HTTP tests start the real Nest application with injected reader fixtures and actual validation/limit/error middleware.
- E2E tests start the real web/API pair, using a deterministic reader configured at startup; no public test scenario-selection endpoint.
- Failure scenarios may use isolated test instances with different fixtures; production/demo mode must not expose mutable test controls.
- Run required lint/format/type checks and both builds once remediation is complete. Repeat broader checks only when changes or unresolved concerns justify them.
- Optional live smoke tests stay separate and are explicitly recorded as run or skipped.

## Acceptance Criteria

1. All required tests run reproducibly without external Ethereum access and pass with no unexplained failures.
2. Documented arithmetic, unknown-state, partial-result, schema, and budget invariants have meaningful assertions.
3. End-to-end tests verify proxy-to-backend integration and the main user path using supplied-design implementation.
4. Input abuse, spoofed headers, provider failures, and cancellation do not leak secrets, fabricate success, or leave unbounded work.
5. Material findings are fixed or explicitly documented with a justified scope decision; no unresolved correctness issue invalidates advertised MVP behavior.
6. Security review evidence states what was checked, what remains trusted, and which optional checks were skipped.

## Recommended Codex Skills

- `playwright-cli`, if available: functional browser checks, keyboard interactions, and evidence collection. This skill is not proof that a Playwright test runner or browser binaries are installed; use the project's verified test setup.
- `nestjs-best-practices`, if available: integration tests, exception behavior, and security review of the API.
- `web-design-guidelines`, if available and references are supplied: accessibility/functionality audit of the implemented interface; no new visual direction.
- `modern-web-guidance`, when needed for browser behavior or compatibility issues actually observed.
- `impeccable`, installed at the owner's subsequent request: optional accessibility/responsiveness and interface-quality audit of the existing reference-based implementation; no independent redesign or backend security certification.

Check availability and read selected instructions; do not install automatically. Catalog commands are reference material. Use version-matched tooling; Prisma/Redis/AWS skills are unnecessary for baseline testing.

## Definition of Done

The test matrix and acceptance criteria pass, targeted fixes are reviewed, actual evidence is recorded, and the remaining limitations are accurate. Update [roadmap progress](../ROADMAP.md). Stage 06 can start when reproducible local checks cover the shipped behavior and no material undocumented correctness/security issue remains.

## Out of Scope

Third-party contract audits, penetration-testing unrelated services, production load benchmarks, new discovery/reputation features, persistent history, distributed infrastructure, and transaction/revocation testing.
