# Project Structure

## Current and proposed structure

The planning repository contains the README, root [AGENTS.md](../../AGENTS.md), [skills inventory](../../skills.md), documentation, local Codex skills, and the owner's [design reference pack](../design/DESIGN.md). Application paths below are proposed implementation outputs. Create them incrementally in their owning stage; do not pre-create empty infrastructure or source scaffolding during documentation work.

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

`apps/web` owns browser behavior, API response validation, request cancellation, and local filtering/sorting. Use App Router conventions appropriate to the installed Next.js version. Keep browser interactions inside client boundaries only where necessary. Do not put an Ethereum RPC client, risk engine, or backend secret in this application.

Before frontend work, follow the root [agent instructions](../../AGENTS.md) and read the existing design description, JSON tokens, CSS custom properties, and Tailwind theme under `docs/design/`. Keep those supplied exports separate from eventual application styles; do not infer Base network support or copy the reference site's product content.

Use an App Router server route handler at `apps/web/src/app/api/[...path]/route.ts` to forward the scan and coverage paths unchanged to the runtime `API_PROXY_TARGET`. This proxy is operational plumbing, not a second scan backend. Validate server-only runtime configuration at startup using the installed Next.js version's supported initialization mechanism. Do not depend on a build-time rewrite for an environment-specific destination, and never accept a destination from a browser.

Allow only the documented application paths and methods through this handler; development API documentation can be reached directly on the API service. Forward bounded request streams, cancellation, status, request IDs, cache controls, and retry headers; remove hop-by-hop headers and apply the trusted ingress identity rules. Avoid buffering an unbounded body or independently recalculating backend results. Test runtime target changes against the same production image. No visual component hierarchy is prescribed.

## Backend application

`apps/api` owns the REST boundary and all chain reads. Controllers validate schemas and delegate. `scans` orchestrates registry reads, snapshot selection, field results, classification, and serialization. `registry` validates uniqueness and bounds at startup. `blockchain` isolates viem and provider-specific exceptions. `risk` remains an ordinary pure function callable in unit tests without NestJS startup.

Operational controls in `config` and `common/http` provide deadlines, concurrency permits, exact origin handling, trusted proxy configuration, and error envelopes. Avoid a framework-agnostic layer for every module; a single typed reader boundary is enough for mocks and demo mode.

## Shared packages

`packages/contracts` is the only shared runtime package. Export request and response schemas, derived TypeScript types, activity/risk/error enums, and common address normalization if it can be packaged without server dependencies. Make one schema definition authoritative for both runtime validation and OpenAPI generation. Select a supported Zod/OpenAPI conversion path during implementation and validate the generated schemas; do not maintain three independent DTO definitions.

Do not export raw `bigint` response objects, RPC errors, Prisma types, environment loaders, or NestJS decorators from this package. Verify both applications can consume its build/export configuration using the chosen Node/Next/Nest versions.

`packages/typescript-config` provides strict common compiler settings with separate frontend/backend extensions. Do not force one module resolution strategy onto both runtimes. ESLint and formatting can remain root configuration; a dedicated tooling package is unnecessary.

## Database layer

There is no baseline `prisma/` directory, Prisma dependency, PostgreSQL container, or migration. If a later measured need justifies persistence, add `apps/api/prisma/schema.prisma`, versioned migrations, and a small API database module using PostgreSQL and Prisma. Follow the [data model](data-model.md) decision before adding entities. Do not create repositories for data that is only read from the chain.

## Infrastructure

Root package scripts added in Stage 01 must cover actual development, lint, format checking, type checking, tests, and builds. Document only scripts that exist and have been verified. Compose should run the two applications; Stage 06 defines production containers and CI. No Redis, worker process, service mesh, or Kubernetes tree is needed.

See [Stage 01](../features/stages/01-project-foundation.md) for initialization and [Stage 06](../features/stages/06-deployment-and-release.md) for release packaging.
