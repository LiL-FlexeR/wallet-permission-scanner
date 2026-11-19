# Stage 05 — Testing and Security

**Status: Complete — 2026-11-19.** Deterministic checks and review evidence are recorded below; Stage 06 remains unstarted.

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

- [x] Inventory existing tests against the matrix below and add only missing meaningful coverage.
- [x] Complete table-driven risk, normalization, formatting, registry, and schema invariants; include exact threshold boundaries and signal ordering.
- [x] Test real adapter behavior against controlled RPC responses: chain/snapshot validation, same-block reads, read deduplication, errors, response limits, retries, and abort.
- [x] Complete Nest HTTP contract cases including all error statuses, no-store/request IDs, complete/partial counts, and no caller-controlled work expansion.
- [x] Verify trusted-proxy extraction and spoof resistance in both direct and proxied test paths. Confirm limiter entry caps and idle expiry.
- [x] Add deterministic browser paths through the runnable API for valid/invalid input, inactive-only, partial, unknown amounts, filtering/sorting, errors, rate limiting, and cancellation.
- [x] Inspect production frontend output and container/build configuration for secrets, server-only dependencies, and accidental result caching.
- [x] Review metadata rendering/external links, privacy, source/coverage/freshness explanations, and all heuristic claims.
- [x] Review dependencies and selected versions for known relevant vulnerabilities using available supported tools; triage material findings rather than automatically applying breaking upgrades.
- [x] Fix findings, rerun affected checks, and record actual security review evidence and known limits in the existing security document. Do not assert an audit certification.
- [x] Verify the documented test commands from a clean dependency install and record the exact required release checks for Stage 06.

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


## Test inventory and review evidence — 2026-11-19

Stages 01–04 supplied the baseline. Stage 05 adds five unit/HTTP tests and seven browser tests; it does not replace the existing assertions or change the published policy thresholds. All fixture data is synthetic. The API wire examples remain in `@wps/contracts/fixtures`; the test-only reader scenario set v1 in `tests/fixtures/reader.mjs` derives from the existing `demo-1` reader/registry.

| Matrix area | Executable evidence | Stage 05 additions / reviewed assertions |
| --- | --- | --- |
| Addresses and registry | [address-registry.test.ts](../../../apps/api/test/address-registry.test.ts), [contracts.test.ts](../../../apps/api/test/contracts.test.ts) | Existing official checksum vectors, contract owners, zero/ENS/whitespace rejection, tuple uniqueness, 20-pair/5-token limits, provenance/identity consistency |
| Risk and precision | [risk.test.ts](../../../apps/api/test/risk.test.ts), [security-invariants.test.ts](../../../apps/api/test/security-invariants.test.ts), [permission-mapper.test.ts](../../../apps/api/test/permission-mapper.test.ts) | Threshold ±1 above `2^53`, equality, max/near-max, intermediate multiplication above uint256, identity invariance, all 256 decimal scales, exact round-trip values, malformed wire risk/parameters rejected |
| Real viem adapter and transport | [blockchain-reader.test.ts](../../../apps/api/test/blockchain-reader.test.ts), [blockchain-transport.test.ts](../../../apps/api/test/blockchain-transport.test.ts), [blockchain-http.test.ts](../../../apps/api/test/blockchain-http.test.ts), [blockchain-readiness.test.ts](../../../apps/api/test/blockchain-readiness.test.ts) | Additional corrupt envelopes/quantities and deterministic provider errors; existing fixed snapshot, deduplication, error isolation, retry/deadline, byte limits, real socket abort and permit assertions retained |
| Nest HTTP and outgoing integrity | [scans-http.test.ts](../../../apps/api/test/scans-http.test.ts), [health.test.ts](../../../apps/api/test/health.test.ts), [errors.test.ts](../../../apps/api/test/errors.test.ts), [openapi.test.ts](../../../apps/api/test/openapi.test.ts) | Source/wallet/version/tuple/token mismatches fail closed with safe `500`; stopped services return `SERVICE_NOT_READY`; all documented statuses, no-store, UUID correspondence, partial counts and OpenAPI reproducibility covered |
| Abuse and proxy identity | [rate-limiter.test.ts](../../../apps/api/test/rate-limiter.test.ts), [api-proxy.test.ts](../../../apps/web/test/api-proxy.test.ts), [security.spec.ts](../../../tests/e2e/security.spec.ts) | Real Next → Nest spoofing path with explicitly trusted loopback; changing browser forwarding headers cannot obtain new buckets; direct trusted identity remains distinct. Existing fake-clock route windows, 10,000-entry cap, idle expiry, four-scan/sixteen-RPC capacity and cleanup retained |
| Browser behavior | [scanner-client.test.ts](../../../apps/web/test/scanner-client.test.ts), [scanner-model.test.ts](../../../apps/web/test/scanner-model.test.ts), [scanner.spec.ts](../../../tests/e2e/scanner.spec.ts), [security.spec.ts](../../../tests/e2e/security.spec.ts) | Real reader → Nest → proxy → browser inactive/partial/unknown-decimals/max-value/errors, conjunctive filters, address sorting, deliberate rate-limited submission, cancellation and navigation abort. Existing coverage mismatch/retry, stale response, invalid input, unsupported policy and timeout assertions retained |
| Browser security and accessibility | [scanner.spec.ts](../../../tests/e2e/scanner.spec.ts), [production-smoke.mjs](../../../scripts/production-smoke.mjs) | Fresh nonces, spoofed CSP/nonce headers overwritten, parser-inserted script and off-origin fetch blocked, no legitimate CSP violations on initial scanner load; metadata text-only, fixed isolated links, empty persistent storage, reload discards results, keyboard/axe/responsive checks |
| Secrets, dependencies and local build context | [security review](../../architecture/security.md#stage-05-review--2026-11-19), [production smoke](../../../scripts/production-smoke.mjs), [.dockerignore](../../../.dockerignore) | Bundle inspected after build with a synthetic RPC sentinel; no server imports or test launcher in browser output; npm audit reviewed; required design CSS restored to the existing local build context |

The real-reader browser scenarios start isolated production-mode Nest and `next start` processes on ephemeral loopback ports. A fixed reader is installed before listening. Observation uses parent-process IPC, not HTTP controls; neither application accepts scenario names or mutable test settings. Browser response interception remains only for intentionally invalid integration payloads and selected client lifecycle cases. Adapter tests separately exercise the actual viem reader, so reader fixtures are not evidence about real Ethereum responses.

### Verification record

A clean source copy with no `node_modules`, compiled output, real environment files or credentials was installed in a new temporary directory with Node `24.16.0` and pnpm `12.21.0`. `pnpm install --frozen-lockfile --offline` first reported one missing cached tarball; `pnpm install --frozen-lockfile` downloaded missing dependencies and succeeded without lockfile changes. Network access was needed for setup and advisory lookup, not the test suite.

Passed from that clean dependency install:

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`.
- `pnpm test`: **126 tests (110 API / 16 web)**, no skipped or failed tests.
- `pnpm test:e2e`: both production builds and **20 Chromium tests**, no retries or unexplained failures. Existing axe and 320/390/1440 px checks passed.
- `pnpm test:production`: real demo/proxy routing, runtime target changes, docs disabled in production, cancellation, safe startup errors and browser artifact inspection. The preceding build received a synthetic credential sentinel in `ETHEREUM_RPC_URL`; it did not appear in browser output.
- `pnpm docs:generate`: generated OpenAPI is byte-identical to the checked-in artifact. The wire shape and `mvp-1` version are unchanged; stronger runtime refinements reject inconsistent assessments.
- Existing local container verification: `docker --host unix:///var/run/docker.sock build --file infra/docker/development.Dockerfile --target web --tag wallet-permission-scanner-web:stage05-review .` passed. A `--network none --read-only` one-shot container confirmed non-root execution, required CSS inclusion and exclusion of Git/env/other design exports. The working socket override is environment-specific.
- `pnpm audit --json`: zero advisories returned for the locked tree on 2026-11-19; no package upgrades were required. This is advisory evidence, not an audit certification.

The host sandbox initially denied loopback listeners (`EPERM`); HTTP/browser checks were rerun with local-process permission. Initial new harness/CSP-test errors were corrected and affected tests rerun before the clean full pass. Optional live RPC/bytecode verification was **not run** without credentials. Firefox/WebKit, human screen-reader testing, external penetration testing, public deployment and production benchmarks were not performed.

### Required checks to carry into Stage 06

Use the locked Node/pnpm versions, `pnpm install --frozen-lockfile`, then `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` (includes `pnpm build`), `pnpm test:production`, `pnpm docs:generate` with no OpenAPI diff, and a reviewed `pnpm audit --json`. Install the pinned Playwright Chromium binary when absent. Keep ports 3100/3101 free; isolated scenario pairs also require ephemeral loopback ports. Production release work must additionally validate the selected image/host, TLS/headers, log retention, proxy identity and rollback assumptions described in Stage 06. No Stage 06 implementation, CI workflow, host selection or deployment was started here.
