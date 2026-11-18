# Wallet Permission Scanner

**Status: Stage 01 — Project Foundation complete (2026-11-18).** The workspace has runnable Next.js and NestJS shells, validated configuration, shared runtime health/error schemas, a bounded same-origin API proxy, deterministic foundation tests, and local two-service Compose. Scanning, blockchain reads, risk analysis, product UI, and production deployment remain planned.

## Purpose and boundaries

Token allowances can remain active after a user stops using an application. The planned read-only application will inspect supported ERC-20 permissions using a public wallet address on **Ethereum mainnet, chain ID `1`**. No wallet connection is needed.

Coverage is limited to an explicitly maintained set of token/spender pairs. A successful future scan will mean that the configured set was checked, **not that every approval was discovered**. Historical events are candidate evidence; current allowances will be re-read at a stated finalized snapshot. See the [blockchain strategy](docs/architecture/blockchain-integration.md).

Planned features include address/checksum validation, allowance and balance reads, explainable versioned heuristics, partial/unknown results, filtering/sorting, trusted explorer links, and an explicitly labeled synthetic demo. Risk labels describe permission exposure, not maliciousness or contract safety. Amounts will use bigint internally and exact decimal strings over HTTP.

The MVP excludes private keys, seed phrases, signing, transactions, revocation, custody, NFTs, ENS, fiat exposure, authentication, persistent history, and comprehensive approval discovery. PostgreSQL/Prisma, Redis, queues, and indexers are deferred. No blockchain client is installed in Stage 01.

## Toolchain

Direct application dependencies are pinned and transitive dependencies are recorded in `pnpm-lock.yaml`.

| Tool              | Selected version    | Notes                                                                                     |
| ----------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| Node.js           | `24.16.0` LTS       | `.nvmrc`; engines require `>=24.16.0 <25`; same runtime in local images                   |
| pnpm              | `12.21.0`           | Root `packageManager`; strict peer dependency checks                                      |
| Next.js / React   | `16.4.6` / `19.3.1` | App Router; server components; no styling or client interaction yet                       |
| NestJS / config   | `12.5.1` / `12.1.1` | ESM, Express 5, explicit constructor injection                                            |
| TypeScript        | `6.0.3`             | Strict shared settings; NodeNext for API/contracts, Bundler for web                       |
| Zod               | `4.6.7`             | Shared runtime schemas and local environment validation                                   |
| ESLint / Prettier | `9.39.5` / `3.10.1` | ESLint 9 matches Next's plugins; TypeScript 6 matches typescript-eslint's supported range |

Versions were checked against official [Node release support](https://nodejs.org/en/about/previous-releases), [Next installation](https://nextjs.org/docs/app/getting-started/installation), [Nest 12 migration guidance](https://docs.nestjs.com/migration-guide), [TypeScript 6 documentation](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html), [pnpm installation](https://pnpm.io/installation), and published package/peer metadata on 2026-11-18. ESLint 9 is a compatibility choice despite its npm deprecation notice; revisit it when the installed Next plugins support ESLint 10. TypeScript 7 exceeds typescript-eslint's supported range and is not selected.

## Local setup

Prerequisites: Git, Node from `.nvmrc`, pnpm from `packageManager`, and a running Docker Engine/Desktop with Compose v2+ for container checks. Docker is not needed for host tests. No database, funded wallet, RPC credential, or external service is needed for deterministic checks.

From the repository root, using nvm if installed:

```sh
nvm install
nvm use
npm install --global pnpm@12.21.0
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm dev
```

The example explicitly selects `SCAN_MODE=demo` so the API can run without an RPC credential. This configures foundation readiness only; there are no demo scan results or live scans yet. Omitting `SCAN_MODE` selects `live` and requires a syntactically valid RPC URL. Stage 01 never contacts that URL, including during health checks.

Web listens at `http://localhost:3000`; API at `http://localhost:3001`. The API watcher recompiles changed TypeScript through tsx. Restart the workspace after changing shared contracts, because their exports resolve to compiled JavaScript. Exit development with Ctrl+C.

## Commands

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:production
```

`pnpm format` formats application/configuration files and this README. Existing specifications, skill files, and owner-supplied design exports are excluded. `pnpm typecheck` and `pnpm test` first build shared contracts; `pnpm build` follows workspace dependencies. Tests use Node's test runner, Supertest for real Nest HTTP behavior, and isolated local HTTP servers for proxy behavior. They make no provider calls.

After `pnpm build`, the two production servers can also be started separately:

```sh
pnpm --filter @wps/api start
pnpm --filter @wps/web start
```

`pnpm test:production` starts/stops its own processes on ephemeral loopback ports. It checks health, proxying the actual API's unimplemented route (`404`), two runtime targets against the same web build, upstream cancellation on browser disconnect, sanitized invalid startup, and browser artifacts for server-only configuration names. The isolated HTTP servers are test doubles, not application scan handlers.

## Configuration

The API's start/dev scripts use Node's environment-file loading for `apps/api/.env`. Next uses its standard environment-file loading under `apps/web`; `.env.local` follows Next's normal precedence. Process environment overrides example files. Actual `.env*` files are ignored by Git and excluded from container builds.

| Variable                  | Consumer        | Behavior                                                                                                                        |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | API / Next      | API accepts `development`, `test`, `production`; Next sets its normal command-specific mode                                     |
| `PORT`                    | API             | Integer `1..65535`, default `3001`                                                                                              |
| `SCAN_MODE`               | API             | `live` by default; `demo` needs no RPC URL                                                                                      |
| `ETHEREUM_RPC_URL`        | API only        | Required in live mode; HTTP(S), HTTPS in production; no URL userinfo, fragment, or wildcard host; not contacted in Stage 01     |
| `WEB_ORIGIN`              | API             | Exact HTTP(S) origin, default `http://localhost:3000`; no wildcard, path, query, fragment, or userinfo                          |
| `API_PROXY_TARGET`        | Web server only | HTTP(S) origin, default `http://localhost:3001`; Compose sets `http://api:3001`; validated before listening and read at runtime |
| `TRUSTED_PROXY_CIDRS`     | API             | Empty by default; otherwise comma-separated IPv4/IPv6 CIDRs; malformed/empty entries and unrestricted `/0` rejected             |
| `LOG_LEVEL`               | API             | `debug`, `info` (default), `warn`, `error`; minimal structured startup/error events, no raw request or provider logs            |
| `NEXT_TELEMETRY_DISABLED` | Next            | `1` in the example and local images                                                                                             |

No `NEXT_PUBLIC_*` secret, wallet key, or seed phrase is needed. Database configuration is absent. Invalid configuration errors contain field names only. Live RPC validation is syntactic; readiness does not establish provider availability until Stage 02.

The API does not trust forwarded IP headers by default. The web proxy strips cookies, authorization, browser IDs and forwarded identity headers. Future rate limits therefore use the API peer's shared bucket until a verified ingress and identity chain are implemented and tested. CORS only returns the configured exact origin and never enables credentialed wildcard access.

## Health and proxy behavior

```sh
curl -i http://localhost:3001/health/live
curl -i http://localhost:3001/health/ready
curl -i http://localhost:3000/api/v1/coverage
```

Liveness is `200 {"status":"ok"}`. Readiness is `200 {"status":"ready","mode":"demo","checks":{"configuration":"ok","blockchain":"not_required"}}` with the actual configured mode. Both reject bodies and query parameters, generate `X-Request-Id` server-side, and use `Cache-Control: no-store`. Invalid configuration prevents startup. Health probes address the API directly; they are not exposed by the application proxy.

The proxy forwards only `POST /api/v1/scans` and `GET /api/v1/coverage`, unchanged, to the operator target. Both currently return the real API's `404` error envelope. Unknown proxy paths/methods, queries, non-JSON POST bodies, and requests over 1 KiB are rejected. Upstream requests have a 25-second total budget, disconnect cancellation, a 1 MiB response limit, no redirects/retries/caching, and a response-header allowlist for content type, request ID, and retry delay. Transport failures return a sanitized `503 SERVICE_NOT_READY`. Full domain schemas and operational scan controls belong to Stage 03.

Next's startup config validates the runtime target before opening the port; instrumentation also initializes server-only configuration. There is no environment-specific build rewrite. The default target permits builds without environment secrets. Release packaging must preserve startup validation, especially if Stage 06 adopts standalone output.

## Local containers

```sh
cp .env.example .env
pnpm compose:check
pnpm compose:up
docker compose -f infra/compose.yaml ps
curl -i http://localhost:3001/health/ready
curl -i http://localhost:3000/api/v1/coverage
pnpm compose:down
```

The root `.env` is for Compose interpolation; app `.env` files are for host execution. If default host ports are occupied, set `WEB_HOST_PORT`, `API_HOST_PORT`, and the corresponding `WEB_ORIGIN` in the root `.env`; internal service ports and `API_PROXY_TARGET=http://api:3001` stay fixed. Compose defaults to demo and starts only web/API. API readiness gates web startup; both services have bounded health checks. Ports bind to loopback, and the web service uses the internal API hostname. Images run as the non-root `node` user and exclude secrets. The shared Dockerfile is a local build/verification helper; production image optimization, CI, and hosting remain Stage 06.

Use the Docker context/socket for your running daemon. This environment required `DOCKER_HOST=unix:///var/run/docker.sock` because its selected Desktop socket was unavailable; normal setups should use their configured working context. No application source change is needed for that host setting.

## Structure and architecture

```text
apps/web/                    Next App Router shell and server-only API proxy
apps/api/                    Nest configuration, HTTP baseline, health module
packages/contracts/          Zod HTTP schemas and inferred types; no server imports
packages/typescript-config/  Strict base plus separate Node/Next module settings
scripts/production-smoke.mjs Production-artifact verification
infra/compose.yaml           Local web/API services
infra/docker/                Local build helper
docs/architecture/           Contracts, safety requirements, decisions
docs/features/               Roadmap and detailed stage gates
docs/design/                 Owner-supplied Refero references, preserved
.agents/skills/              Project-local Codex skills
```

The backend owns future chain retrieval, bounded work, and pure deterministic risk rules. The browser will validate shared HTTP schemas and never receive RPC credentials. See the [overview](docs/architecture/overview.md), [project structure](docs/architecture/project-structure.md), [API contract](docs/architecture/api-design.md), [security specification](docs/architecture/security.md), and [ADR-001](docs/architecture/decisions/ADR-001-architecture.md).

The root [AGENTS.md](AGENTS.md) and [skills inventory](skills.md) carry project instructions. The owner reference pack under [docs/design](docs/design/DESIGN.md) is reserved for Stage 04. Its Base branding and extraction examples do not change the mainnet network or product scope. No fonts, Tailwind, shadcn, or reconstructed design components have been installed/applied by this stage.

## Roadmap and verification

| Stage                                                                        | Status                         |
| ---------------------------------------------------------------------------- | ------------------------------ |
| [01 — Foundation](docs/features/stages/01-project-foundation.md)             | Complete — verified 2026-11-18 |
| [02 — Blockchain](docs/features/stages/02-blockchain-integration.md)         | Not started                    |
| [03 — API and risk](docs/features/stages/03-backend-and-risk-analysis.md)    | Not started                    |
| [04 — Frontend](docs/features/stages/04-frontend-integration.md)             | Not started                    |
| [05 — Testing and security](docs/features/stages/05-testing-and-security.md) | Not started                    |
| [06 — Release](docs/features/stages/06-deployment-and-release.md)            | Not started                    |

Use the [roadmap](docs/features/ROADMAP.md) for acceptance gates. Foundation verification covers configuration rejection/redaction, health and input limits in both modes with provider calls forbidden, proxy bounds/headers/cancellation, independent shared-package resolution, lint/type checks, production builds, runtime startup/proxy smoke, and local Compose readiness/routing. Later stage tests expand domain and cross-layer coverage; they are not claimed here. There is no live blockchain or public deployment verification in Stage 01.

Verified on 2026-11-18: lint, formatting, strict type checking, 35 deterministic tests (28 API / 7 web), both production builds, production smoke, development startup in an isolated container, and local Compose health/routing. The environment's occupied host port `3000` required Compose host-port overrides `3300/3301`; internal addressing stayed `api:3001`. Verification containers were stopped afterward. See the [Stage 01 verification record](docs/features/stages/01-project-foundation.md#verification-record--2026-11-18). No Git commit was created; changes are ready for review.
