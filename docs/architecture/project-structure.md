# Project Structure

## Current and proposed structure

The repository contains the README, root [AGENTS.md](../../AGENTS.md), [skills inventory](../../skills.md), documentation, local Codex skills, and the owner's [design reference pack](../design/DESIGN.md). Stage 01 adds the web/API shells, shared contracts and TypeScript configuration, foundation tests, workspace tooling, `scripts/production-smoke.mjs`, and local Compose/build helpers. Stage 02 implements `blockchain/`, `registry/`, shared address validation, reader/transport fixtures, background readiness, and the opt-in live smoke entry point. Stage 03 implements public scan/coverage orchestration, pure risk rules, shared runtime HTTP schemas/fixtures, abuse controls and generated OpenAPI under `docs/api/`. Stage 04 implements the scanner client/interface and deterministic Chromium tests with `playwright.config.ts`. The tree below also specifies future stage outputs: production Dockerfiles and CI are not implemented. Create those incrementally in their owning stages.

```text
apps/
├── web/
│   ├── src/
│   │   ├── app/                       # App Router entry points, including API proxy handler
│   │   ├── features/scanner/          # API client, state, functional interactions, tests
│   │   └── lib/                       # Small app-wide helpers only when reused
│   ├── next.config.ts                # Framework and build configuration
│   ├── package.json
│   └── Dockerfile                    # Production build in Stage 06
└── api/
    ├── src/
    │   ├── main.ts
    │   ├── app.module.ts
    │   ├── config/                    # Validated environment and bounded-work constants
    │   ├── common/http/               # Exception filter, request IDs, schema validation
    │   ├── health/                    # Liveness and readiness
    │   ├── blockchain/
    │   │   ├── blockchain.module.ts
    │   │   ├── ethereum-reader.ts     # Narrow reader interface and injectable token
    │   │   ├── viem-ethereum.reader.ts
    │   │   ├── demo-ethereum.reader.ts
    │   │   ├── erc20.abi.ts           # Read functions only
    │   │   └── rpc-errors.ts
    │   ├── registry/
    │   │   ├── mainnet.registry.ts
    │   │   └── registry.service.ts
    │   ├── risk/
    │   │   ├── assess-permission.ts   # Pure rules with no network dependencies
    │   │   └── risk-policy.ts
    │   └── scans/
    │       ├── scans.controller.ts
    │       ├── scans.service.ts
    │       ├── scans.module.ts
    │       └── permission.mapper.ts
    ├── test/                         # Nest HTTP integration tests
    ├── package.json
    └── Dockerfile
packages/
├── contracts/src/                    # Runtime schemas, HTTP enums, inferred types
└── typescript-config/                # Base plus app-specific TS config extensions
tests/
├── fixtures/                        # Shared deterministic synthetic scan scenarios
└── e2e/                             # Browser integration across public HTTP boundary
infra/
├── compose.yaml                     # Local web + API; no baseline DB service
└── docker/                          # Development build helpers if actually needed
.github/workflows/ci.yml              # Added in Stage 06
.env.example                         # Names and safe examples, no live secrets
.gitignore
.dockerignore
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
eslint.config.mjs
.prettierrc.json
README.md
docs/                                # Planning documents and later operational instructions
```

File names are guides, not a requirement to split every helper into its own file. Keep implementation close to feature modules and split only when responsibility or testability improves. Unit tests may be colocated beside source; shared fixtures must contain no real user identity.

## Frontend application

`apps/web` owns browser behavior, API response validation, request cancellation, and local filtering/sorting. Use App Router conventions appropriate to the installed Next.js version. Keep browser interactions inside client boundaries only where necessary. Do not put an Ethereum RPC client, independent result-classification engine, or backend secret in this application. Shared runtime validation checks the advertised policy against exact raw values; it does not replace server results.

Stage 04 implements these responsibilities under `src/features/scanner/`, with shell/copy in `app/page.tsx` and application-specific CSS in `app/globals.css`. Native semantic controls use the preserved owner CSS variables; fonts fall back to the supplied system stacks. No state library, client cache, localStorage, browser history or analytics stores wallet input. Tests in `apps/web/test/` exercise the client/reducer/selectors/explanations; `tests/e2e/` runs against isolated production demo servers with additional schema-checked fixtures in `tests/fixtures/`. The real demo path crosses both applications. Stage 05 adds isolated fixed-reader API/web processes under `tests/support/` for inactive/partial/error/cancellation and spoofing scenarios, with IPC-only observation and no HTTP test controls. The HTML shell is dynamically rendered for request-scoped CSP nonces in `src/proxy.ts`; source design exports remain unchanged.

Before frontend work, follow the root [agent instructions](../../AGENTS.md) and read the existing design description, JSON tokens, CSS custom properties, and Tailwind theme under `docs/design/`. Keep those supplied exports separate from eventual application styles; do not infer Base network support or copy the reference site's product content.

Use an App Router server route handler at `apps/web/src/app/api/[...path]/route.ts` to forward the scan and coverage paths unchanged to the runtime `API_PROXY_TARGET`. This proxy is operational plumbing, not a second scan backend. Validate server-only runtime configuration at startup using the installed Next.js version's supported initialization mechanism. Do not depend on a build-time rewrite for an environment-specific destination, and never accept a destination from a browser.

Allow only the documented application paths and methods through this handler; development API documentation can be reached directly on the API service. Forward bounded request streams, cancellation, status, request IDs, cache controls, and retry headers; remove hop-by-hop headers and apply the trusted ingress identity rules. Avoid buffering an unbounded body or independently recalculating backend results. Test runtime target changes against the same production image. No visual component hierarchy is prescribed.

## Backend application

`apps/api` owns the REST boundary and all chain reads. Controllers validate schemas and delegate. `scans` orchestrates registry reads, snapshot selection, field results, classification, and serialization. `registry` validates uniqueness and bounds at startup. `blockchain` isolates viem and provider-specific exceptions. `risk` re-exports the ordinary pure `mvp-1` function from contracts, callable in unit tests without NestJS startup.

Operational controls in `config` and `common/http` provide deadlines, concurrency permits, exact origin handling, trusted proxy configuration, and error envelopes. Avoid a framework-agnostic layer for every module; a single typed reader boundary is enough for mocks and demo mode.

## Shared packages

`packages/contracts` is the only shared runtime package. Export request and response schemas, derived TypeScript types, activity/risk/error enums, and common address normalization if it can be packaged without server dependencies. Make one schema definition authoritative for both runtime validation and OpenAPI generation. The pure versioned risk function also lives here so outgoing/browser schemas verify the complete assessment without duplicating the policy; it imports no server or retrieval code. Select a supported Zod/OpenAPI conversion path during implementation and validate the generated schemas; do not maintain three independent DTO definitions.

Do not export raw `bigint` response objects, RPC errors, Prisma types, environment loaders, or NestJS decorators from this package. Verify both applications can consume its build/export configuration using the chosen Node/Next/Nest versions.

`packages/typescript-config` provides strict common compiler settings with separate frontend/backend extensions. Do not force one module resolution strategy onto both runtimes. ESLint and formatting can remain root configuration; a dedicated tooling package is unnecessary.

## Database layer

There is no baseline `prisma/` directory, Prisma dependency, PostgreSQL container, or migration. If a later measured need justifies persistence, add `apps/api/prisma/schema.prisma`, versioned migrations, and a small API database module using PostgreSQL and Prisma. Follow the [data model](data-model.md) decision before adding entities. Do not create repositories for data that is only read from the chain.

## Infrastructure

Root package scripts added in Stage 01 cover development, lint, format checking, type checking, tests, builds, production-artifact smoke verification, and local Compose. The local multi-stage helper is `infra/docker/development.Dockerfile`; it runs built applications as the non-root Node user. Compose runs only web/API with readiness-based ordering and loopback ports. Stage 06 defines production release containers and CI. No Redis, worker process, service mesh, or Kubernetes tree is needed.

The runtime proxy target is checked in Next's phase-aware startup configuration before listening; instrumentation additionally initializes server-only configuration. This accounts for lazy instrumentation loading in the installed Next.js version. Build-time configuration does not capture a target. The proxy enforces a 1 KiB input limit, 1 MiB response limit, 25-second total budget, no redirects or retries, cancellation, and a narrow response-header allowlist. Transport failures use a sanitized `503 SERVICE_NOT_READY`; scan-domain errors now come from the Stage 03 API and pass through unchanged.

See [Stage 01](../features/stages/01-project-foundation.md) for initialization and [Stage 06](../features/stages/06-deployment-and-release.md) for release packaging.
