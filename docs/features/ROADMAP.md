# Implementation Roadmap

Status: **Stages 01–02 complete** (2026-11-18). Foundation and internal blockchain integration are implemented and deterministically verified. Optional live RPC/deployment smoke has not run without credentials. Stages 03–06 have not started. Execute later stages only when requested and review each stage's acceptance criteria before proceeding.

## Overall progress

- [x] Stage 01 — Project Foundation
- [x] Stage 02 — Blockchain Integration
- [ ] Stage 03 — Backend API and Risk Analysis
- [ ] Stage 04 — Frontend Integration
- [ ] Stage 05 — Testing and Security
- [ ] Stage 06 — Deployment and Release

Dependency chain: **01 → 02 → 03 → 04 → 05 → 06**. The owner has supplied the visual reference pack in [docs/design](../design/DESIGN.md). Stage 04 must read the full pack using the root [AGENTS.md](../../AGENTS.md), reconcile relevant extraction conflicts, and obtain any missing surface-specific information before visual acceptance. Early domain/API testing continues within its owning stages; Stage 05 adds cross-layer verification.

## Stage 01 — Project Foundation

- **Progress:** [x] Complete — 2026-11-18. Workspace checks, 35 deterministic tests, production builds/smoke, development startup, and local Compose health/routing passed. Verification details are recorded in the stage specification.
- **Objective:** Establish a runnable, reproducible workspace without implementing scan features.
- **Scope summary:** pnpm monorepo; Next.js and NestJS shells; shared TypeScript/contracts; lint/format; environment validation; same-origin API proxy; local web/API Compose; health checks. Explicitly defer a database.
- **Main deliverables:** Pinned toolchain and lockfile, real package scripts, safe environment examples, application shells, health routes, local container setup, verified README commands.
- **Dependencies:** Existing planning documents, supported runtime/tooling selections, local Docker/Compose. No RPC network access or database required for deterministic foundation checks.
- **Definition of Done:** Both applications build and run with validated configuration; shared packages resolve; health and proxy checks pass; setup instructions describe actual scripts; no secrets or unrelated feature work.
- **Detailed specification:** [01-project-foundation.md](stages/01-project-foundation.md).

## Stage 02 — Blockchain Integration

- **Progress:** [x] Complete — 2026-11-18. Internal reader, address validation, reviewed three-pair registry, bounded transport/scheduling and cached live readiness are implemented. Deterministic checks and production smoke passed; optional live provider/deployment verification was not run because no credential was available. See the stage verification record and [registry provenance](../architecture/registry-provenance.md).
- **Objective:** Read configured mainnet permissions reliably at one recent finalized block.
- **Scope summary:** viem public client, address/checksum validation, chain verification, registry/provenance, ERC-20 metadata/balances/allowances, exact quantities, typed field failures, bounded RPC work, readiness probes.
- **Main deliverables:** Injectable reader, read-only ABI, reviewed initial registry, deterministic transport fixtures, retry/timeout/cancellation controls, live readiness, optional live-smoke instructions.
- **Dependencies:** Stage 01 complete; primary deployment sources; compatible RPC provider for optional live verification.
- **Definition of Done:** Same-block reads and registry bounds are tested; no failed read becomes zero; wrong-chain/stale state fails safely; retries/deadlines/concurrency are bounded; deterministic tests need no network; registry sources are reviewable.
- **Detailed specification:** [02-blockchain-integration.md](stages/02-blockchain-integration.md).

## Stage 03 — Backend API and Risk Analysis

- **Progress:** [ ] Not started.
- **Objective:** Publish the stable scan contract and explainable `mvp-1` classifications.
- **Scope summary:** Scan/coverage endpoints, shared runtime schemas, normalization, current-state interpretation, unlimited/relative-size rules, structured errors, request IDs, rate/capacity limits, no-store, OpenAPI. Baseline caching remains deferred.
- **Main deliverables:** Typed REST endpoints, pure risk function and boundary fixtures, complete/partial/failure handling, safe logs, abuse controls, generated API documentation, frontend-ready fixtures.
- **Dependencies:** Stage 02 reader and error semantics; stable registry, snapshot, and cancellation behavior.
- **Definition of Done:** HTTP responses match schemas/OpenAPI; counts and null states are correct; deterministic policy tests pass; caller and provider throttling remain distinct; work and limiter state are bounded; frontend can integrate without viem knowledge.
- **Detailed specification:** [03-backend-and-risk-analysis.md](stages/03-backend-and-risk-analysis.md).

## Stage 04 — Frontend Integration

- **Progress:** [ ] Not started.
- **Objective:** Let users submit addresses and interpret/filter/sort supported permission results using the API contract.
- **Scope summary:** Validated input, scan requests, request state/cancellation, schema-checked responses, permission data and explanations, coverage/freshness/source information, safe explorer links, filtering/sorting, loading/empty/partial/error handling.
- **Main deliverables:** Typed API client, local state and selectors, complete interaction path, risk explanations, deterministic functional tests, implementation based on supplied Refero references.
- **Dependencies:** Stage 03 complete and stable API fixtures; the supplied [Refero pack](../design/DESIGN.md), its JSON/CSS exports, and any additional information required for the requested surface.
- **Definition of Done:** Functional acceptance and precision tests pass, stale requests cannot overwrite results, all failure/unknown states are handled, and visual implementation follows supplied materials. Without references, complete only non-visual integration, report the dependency, and keep this stage unchecked.
- **Detailed specification:** [04-frontend-integration.md](stages/04-frontend-integration.md).

## Stage 05 — Testing and Security

- **Progress:** [ ] Not started.
- **Objective:** Verify cross-layer correctness and review security before release.
- **Scope summary:** Unit/adapter/HTTP/E2E tests, contract mocks, provider and input failures, bigint precision, cancellation, rate/capacity/proxy handling, metadata security, privacy, secret inspection, dependency review, targeted fixes.
- **Main deliverables:** Reproducible test matrix, deterministic browser paths through real proxy/API, meaningful invariant tests, security review evidence and residual limitations in existing docs.
- **Dependencies:** Stage 04 complete, including its reference-dependent implementation; prior stages' tests and synthetic fixtures available.
- **Definition of Done:** Required tests pass without paid services or funds; security controls have evidence; material findings are resolved or explicitly scoped without invalidating MVP behavior; optional live checks are accurately recorded.
- **Detailed specification:** [05-testing-and-security.md](stages/05-testing-and-security.md).

## Stage 06 — Deployment and Release

- **Progress:** [ ] Not started.
- **Objective:** Deliver a publicly demonstrable application with reproducible deployment and honest release documentation.
- **Scope summary:** Production Docker builds/configuration, hardened CI, deployment/rollback runbook, labeled deterministic demo, environment/log documentation, production smoke checks, README and release updates.
- **Main deliverables:** Safe production images, GitHub Actions, verified runtime routing/health, `docs/DEPLOYMENT.md` written against the selected host, public live or explicit demo deployment, actual release evidence.
- **Dependencies:** Stage 05 complete; hosting selection/access, domain/origin configuration, and RPC credentials only for live mode.
- **Definition of Done:** CI and container checks pass; demo is explicitly synthetic; public deployment is reachable and verified; secrets/proxy/limits are correct; instructions and rollback status reflect reality. Missing hosting access leaves public-release acceptance outstanding.
- **Detailed specification:** [06-deployment-and-release.md](stages/06-deployment-and-release.md).

## Cross-stage execution rules

- Each detailed stage is a reviewable implementation specification with prerequisites, tasks, expected files, tests, acceptance criteria, and completion gate.
- Keep [API contracts](../architecture/api-design.md), [risk/data rules](../architecture/data-model.md), [blockchain coverage](../architecture/blockchain-integration.md), and [security](../architecture/security.md) synchronized with implementation. Review changes before silently changing guarantees.
- Run tests with each stage. Do not wait until Stage 05 to discover basic correctness failures.
- Mark progress only after verification; a missing external dependency is outstanding work, not an assumed approval or completed feature.
- Select stable supported dependency versions when implementation begins and use version-matched documentation.
- Skills below are candidates from the supplied catalog. Check actual availability before use; do not automatically install skills or execute catalog commands.

## Stage-specific skill candidates

| Stage | Relevant candidates | Conditions |
| --- | --- | --- |
| 01 | `nestjs-best-practices`, `docker-compose-patterns`, `docker-build-strategies` | Foundation and local containers only |
| 02 | `nestjs-best-practices` | Reader/module lifecycle; use official viem docs for chain operations |
| 03 | `nestjs-best-practices` | API, validation, limits, testing; no baseline DB work |
| 04 | `vercel-react-best-practices`, `vercel-composition-patterns`, `modern-web-guidance`, `shadcn`, `web-design-guidelines`; optional `frontend-design` and `impeccable` | Visual-related use only after supplied references; no invented direction |
| 05 | `playwright-cli`, `nestjs-best-practices`, `web-design-guidelines`, `modern-web-guidance`; optional `impeccable` | Test and review implemented behavior; no new design |
| 06 | `docker-build-strategies`, `docker-compose-patterns`, `github-actions-hardening`, `playwright-cli` | Production packaging, CI, deployment verification |

If persistence is justified later, consider `prisma-orm-setup`, `supabase-postgres-best-practices`, and version-compatible Prisma guidance. The catalog warns that generic client recipes may be legacy; prefer the installed version's official instructions. Its version-specific notes are reference material to verify at implementation time, not current dependency selections. Redis, BullMQ, MongoDB, semantic cache, and AWS skills are not baseline requirements. Impeccable was installed following the owner's subsequent explicit request; its pinned source and usage boundaries are recorded in the [project skills inventory](../../skills.md).

## MVP boundary and post-MVP work

The MVP includes mainnet only, configured-pair coverage, read-only current-state inspection, deterministic heuristic analysis, typed full-stack integration, meaningful tests, and a labeled public demonstration. It excludes signing, transactions, revocation, private keys, custody, authentication, price feeds, reputation scoring, complete discovery claims, persistent history, and distributed infrastructure.

Only after release consider broader discovery via a provider with documented guarantees, additional chains, measured need for a bounded cache, or opt-in persistent history. These require new scope and architecture decisions rather than additions to the six-stage MVP by default. See [ADR-001](../architecture/decisions/ADR-001-architecture.md) for revision triggers.
