# Stage 01 — Project Foundation

## Objective

Create a reproducible TypeScript workspace with runnable frontend/backend shells, validated configuration, local containers, and health checks. No wallet scanning or visual design is implemented in this stage.

## Prerequisites

- Read the [README](../../../README.md), [architecture decision](../../architecture/decisions/ADR-001-architecture.md), [project structure](../../architecture/project-structure.md), and [API conventions](../../architecture/api-design.md).
- Inspect the repository and applicable instructions before edits. Preserve documentation and unrelated changes.
- Select currently supported stable versions and a compatible Node.js LTS release using official, version-matched documentation. Record actual choices; do not assume a version from this planning date remains current.
- Have Git, the selected Node.js runtime, pnpm, and Docker/Compose available for implementation verification. No running PostgreSQL instance is required.

## Scope

Initialize pnpm workspaces, Next.js App Router, NestJS, strict TypeScript configuration, lint/format tools, environment validation, same-origin API routing, local Compose, and process health checks. The database decision is to defer PostgreSQL/Prisma because scanning has no persistence requirement.

## Technical Requirements

- Use `apps/web`, `apps/api`, `packages/contracts`, and `packages/typescript-config`; create shared packages only with a real consumer or required build contract.
- Pin pnpm through `packageManager` and commit a lockfile. Record Node compatibility in engines and a runtime version file. Verify frontend/backend module resolution independently.
- Enable strict TypeScript checking. Apply consistent ESLint and formatting with app-specific rules; generated artifacts and dependencies are excluded.
- Add real root scripts for development, lint, format checking, type checking, tests, and builds. README commands must correspond to scripts verified in this stage.
- Implement safe environment loading and startup validation. Required live-mode RPC configuration may be validated syntactically now without making a network request. `SCAN_MODE=demo` needs no RPC credential.
- Browser API calls use same-origin `/api/*`; an App Router server handler forwards the documented application paths unchanged to a validated runtime `API_PROXY_TARGET`. Use the [proxy specification](../../architecture/project-structure.md), not an environment-specific build-time rewrite; verify startup configuration and cancellation with the production build too.
- Default API port is `3001`; web local origin is `http://localhost:3000`. Restrict any cross-origin allowlist to `WEB_ORIGIN`. Do not enable unrestricted proxy trust. With default empty trust, web-proxied requests share a peer-IP bucket; production original-IP limits require a verified ingress that overwrites client forwarding headers.
- Compose runs web and API only, with internal API service addressing. Use startup ordering plus health checks rather than assuming service start means readiness. Do not add a database container merely to match the optional stack.
- No wallet connector, signer, indexer, scan handler, designed interface, or fabricated product screen.

## Implementation Tasks

- [x] Inspect files and select compatible stable package versions; record runtime and package manager choices in the README.
- [x] Initialize root workspace manifests and strict shared TypeScript settings; verify each application can resolve shared contracts without server dependencies leaking into web builds.
- [x] Generate minimal Next.js and NestJS shells; remove generator sample functionality unrelated to the project.
- [x] Add lint/format/type-check/build/test scripts and ignore files. Confirm each script exists before documenting invocation.
- [x] Add environment schemas and safe `.env.example` files using the variables in the README. Reject invalid modes, ports, URLs, origins, and proxy networks; never print credentials on failure.
- [x] Add server request IDs, safe baseline exception handling, body-size configuration, and exact-origin handling. Full scan-domain errors belong to Stage 03.
- [x] Implement liveness and configuration readiness. In this stage, blockchain readiness is `not_required`; Stage 02 replaces that live-mode condition.
- [x] Configure the bounded server-side API proxy, preserving safe response headers and cancellation. Before application routes exist, verify forwarding against an isolated test server; Stage 03 then verifies the real scan/coverage routes. Health probes address the API directly.
- [x] Add local development Dockerfiles/helpers as needed and `infra/compose.yaml` with web/API health checks. No services need to be started until implementation verification.
- [x] Run workspace checks, production builds, and a local Compose smoke check. Update README with commands actually used, environment setup, and the intentional database deferral.

Task order matters: choose versions before generators/configuration, establish package exports before shared imports, and validate app startup before container smoke checks.

## Expected Files and Modules

- Root manifests, lockfile, runtime version file, ESLint/Prettier config, `.gitignore`, `.dockerignore`, safe environment examples.
- `apps/web/src/app/`, its server-only API route handler, `apps/web/next.config.ts`, and web manifest/configuration.
- `apps/api/src/main.ts`, `app.module.ts`, `config/`, `common/http/`, `health/`, and API manifest/configuration.
- `packages/contracts/src/` with minimal shared health or common schemas to prove packaging, plus `packages/typescript-config/`.
- `infra/compose.yaml` and any actual development build helpers.
- Updated README prerequisites and verified commands. Do not create Prisma schema/migrations or production release workflow yet.

## API Contracts

- `GET /health/live`: `200 {"status":"ok"}`, with `X-Request-Id`; no provider request.
- `GET /health/ready`: `200 {"status":"ready","mode":"live","checks":{"configuration":"ok","blockchain":"not_required"}}` when configured, using the actual mode value.
- Health routes reject request bodies/unknown queries and expose no secrets. Invalid startup configuration fails startup with a sanitized explanation instead of serving misleading readiness.
- The final [health contract](../../architecture/api-design.md) applies; Stage 02 introduces network readiness. Scan and coverage routes are not functional in this stage and must not return placeholder successes.

## Data Models

Only validated configuration and minimal shared HTTP schemas are required. Use the [environment table](../../../README.md) as the variable contract. There are no persistence entities, schema migrations, or wallet results.

## Edge Cases

- Missing RPC URL in live mode versus allowed omission in demo mode.
- Invalid URL or port, wildcard origin, empty/malformed proxy CIDRs, and production HTTP RPC endpoint.
- API reachable on host but incorrectly addressed as `localhost` from the web container.
- Build succeeds in one application but shared package exports fail in the other.
- A production web artifact ignores the runtime proxy target or accidentally exposes server configuration to the browser.
- Health reports ready before validated config is loaded or after a startup failure.

## Security Considerations

Do not add keys or browser-exposed RPC variables. Commit safe examples only. Bind infrastructure appropriately for local development and do not expose a database. Generate request IDs server-side and sanitize environment errors. Review generator dependencies and avoid unneeded defaults such as telemetry containing request data.

## Testing Requirements

- Unit-test configuration acceptance/rejection, including demo/live differences and redaction.
- HTTP-test health status shapes and absence of provider calls.
- Run lint, format checking, type checking, and both production builds.
- Smoke-test local web/API routing and Compose health transitions. Keep this targeted; do not create tests that merely assert generator files exist.

## Acceptance Criteria

1. A clean checkout can be prepared and run using the new, verified README commands.
2. Both applications consume shared configuration/contracts and build under the pinned toolchain.
3. Valid configuration serves both health endpoints with the documented shapes; invalid configuration fails clearly without exposing secrets.
4. The web server reaches the API through its configured internal target in host and container execution.
5. No database, blockchain scanner, wallet integration, or visual design is introduced.

## Recommended Codex Skills

Candidates from the owner's supplied catalog, to use only if available and appropriate during implementation:

- `nestjs-best-practices`: module boundaries, configuration, validation, and health testing; review its community-maintained instructions before use.
- `docker-compose-patterns`: two-service development networking, health checks, and environment handling.
- `docker-build-strategies`: only for build helpers actually needed to run local containers; production hardening remains Stage 06.

The catalog is not proof of installation. Check availability without installing automatically and read any selected skill's instructions. Use version-matched framework docs. Prisma/PostgreSQL skills are deferred with persistence; frontend design skills are unnecessary here. The catalog's specialized Next.js cache skills are not required for this foundation.

## Definition of Done

All tasks and acceptance criteria pass, the README describes real setup/scripts, lockfile and environment examples are committed without secrets, and review confirms only the intended foundation was added. Update [roadmap progress](../ROADMAP.md) after verification. Stage 02 can start when the API runs, shared packages resolve, and deterministic tests run without network credentials.

## Out of Scope

Scanning, risk policy, persistent storage, migrations, token/spender selection, wallet connection, visual design, production hosting, and CI deployment. Do not provision Redis, queues, Kubernetes, or authentication.


## Verification record — 2026-11-18

Stage 01 is complete. All required source/configuration files and the lockfile are present in the working tree for review. No Git commit or public deployment was created by this implementation task.

- Toolchain: Node `24.16.0` LTS, pnpm `12.21.0`, Next `16.4.6`, React `19.3.1`, Nest `12.5.1`, TypeScript `6.0.3`, Zod `4.6.7`. See the [README](../../../README.md) for exact compatibility choices and setup.
- Dependency installation with `--frozen-lockfile` passed from fresh Docker build layers. Shared contracts build first and resolve independently through NodeNext in the API and Bundler resolution in Next. Only Zod is a shared runtime dependency; Nest/server configuration is not exported.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and `pnpm build` passed. Both applications produced production builds under the pinned toolchain.
- `pnpm test` passed **35 tests**: 28 API configuration/health/error tests and 7 web configuration/proxy tests. Tests cover demo/live startup, missing/invalid configuration and redaction, exact-origin handling, request IDs, strict health input/methods, body limits, sanitized internal errors, proxy allowlisting, safe headers, streaming limits, redirects, deadlines, stalled uploads, and client cancellation. Health HTTP tests forbid provider fetches.
- `pnpm test:production` passed against the production artifacts: actual API health and unimplemented-route `404` forwarding, two different runtime targets using the same web build, disconnect cancellation reaching an isolated upstream, invalid API/web startup redaction, and browser artifact checks for server-only configuration. Next's phase-aware startup configuration validates before listening because instrumentation can load lazily.
- `pnpm dev` served both shells, health, and the same-origin proxy inside a temporary isolated container. Host port `3000` was occupied, so the existing host process was preserved. The temporary dev container was stopped and automatically removed.
- `pnpm compose:check`, `pnpm compose:up`, and `pnpm compose:down` passed with the working system Docker socket and `WEB_HOST_PORT=3300`, `API_HOST_PORT=3301`, `WEB_ORIGIN=http://localhost:3300`. Both services transitioned to healthy; host and web-container checks confirmed `api:3001` routing, health shapes, and genuine `404` responses for the unimplemented application paths. Both container users are non-root (`node`, UID 1000). Test containers/network were stopped/removed without deleting volumes or images.
- Relative Markdown links and `git diff --check` passed. Owner design exports and installed skill files were preserved. Real environment files and build artifacts are ignored; safe examples and the lockfile are included.

No live RPC, wallet, database, scan-domain implementation, risk rules, designed interface, CI, or hosting was required or introduced. Stages 02–06 remain unchecked. Foundation demo mode configures readiness only; synthetic scan functionality belongs to later stages.
