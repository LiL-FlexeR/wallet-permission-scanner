# Wallet Permission Scanner

**Status: Stages 01–05 complete; Stage 06 in progress (2026-11-19).** The workspace has a reference-guided scanner interface, bounded scan/coverage APIs, shared runtime contracts, pure `mvp-1` exposure analysis, a reviewed Ethereum mainnet pair registry, explicit synthetic demo mode, generated OpenAPI, deterministic unit/HTTP/browser tests, and local two-service Compose. Stage 06 adds production Docker artifacts, prepared Next standalone startup, hardened CI, fixed demo scenarios, bounded shutdown and an [operator runbook](docs/DEPLOYMENT.md). The owner requested artifacts and instructions only: no public deployment or release tag was created. Optional live RPC verification has not run because no credential was available.

## Purpose and boundaries

Token allowances can remain active after a user stops using an application. The read-only backend inspects supported ERC-20 permissions using a public wallet address on **Ethereum mainnet, chain ID `1`**. No wallet connection is needed.

Coverage is limited to an explicitly maintained set of token/spender pairs. A complete scan means that the configured set was checked, **not that every approval was discovered**. Historical events are candidate evidence; current allowances will be re-read at a stated finalized snapshot. See the [blockchain strategy](docs/architecture/blockchain-integration.md).

Implemented features include address/checksum validation, allowance and balance reads, explainable versioned heuristics, partial/unknown results, fixed-origin explorer URLs, and an explicitly labeled synthetic demo. The frontend displays exact values, field warnings, snapshot/source/coverage information, explanations, conjunctive filters and stable sorting. Risk labels describe permission exposure, not maliciousness or contract safety. Amounts use bigint internally and exact decimal strings over HTTP and in the interface.

The MVP excludes private keys, seed phrases, signing, transactions, revocation, custody, NFTs, ENS, fiat exposure, authentication, persistent history, and comprehensive approval discovery. PostgreSQL/Prisma, Redis, queues, and indexers are deferred. The viem public client is backend-only.

## Toolchain

Direct application dependencies are pinned and transitive dependencies are recorded in `pnpm-lock.yaml`.

| Tool                | Selected version    | Notes                                                                                     |
| ------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| Node.js             | `24.16.0` LTS       | `.nvmrc`; engines require `>=24.16.0 <25`; same runtime in local images                   |
| pnpm                | `12.21.0`           | Root `packageManager`; strict peer dependency checks                                      |
| Next.js / React     | `16.4.6` / `19.3.1` | App Router server shell and local scanner client boundary                                 |
| NestJS / config     | `12.5.1` / `12.1.1` | ESM, Express 5, explicit constructor injection                                            |
| TypeScript          | `6.0.3`             | Strict shared settings; NodeNext for API/contracts, Bundler for web                       |
| Zod                 | `4.6.7`             | Shared runtime schemas and local environment validation                                   |
| viem / noble hashes | `2.58.0` / `2.4.0`  | Backend public client; browser-compatible Keccak for the shared EIP-55 normalizer         |
| ESLint / Prettier   | `9.39.5` / `3.10.1` | ESLint 9 matches Next's plugins; TypeScript 6 matches typescript-eslint's supported range |
| Playwright / axe    | `1.65.1` / `4.14.0` | Test-only Chromium interaction and automated accessibility checks                         |

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

The example explicitly selects `SCAN_MODE=demo` so the API can run without an RPC credential. The scan and coverage endpoints use the deterministic synthetic reader in demo mode and explicitly return `source: demo`; no RPC provider is called. Omitting `SCAN_MODE` selects `live` and requires a valid RPC URL. Live startup launches a bounded background chain/snapshot probe; health HTTP requests themselves never contact RPC.

Web listens at `http://localhost:3000`; API at `http://localhost:3001`. The API watcher recompiles changed TypeScript through tsx. Restart the workspace after changing shared contracts, because their exports resolve to compiled JavaScript. Exit development with Ctrl+C.

Open the web app, enter a nonzero Ethereum public address and choose **Scan address** (or press Enter). With the example demo configuration, `0x3333333333333333333333333333333333333333` produces three synthetic permission records without RPC access. Demo source and synthetic snapshots are explicitly labeled; their explorer navigation is disabled. Editing the input does not relabel existing results. Cancel an in-progress scan before starting another through the UI.

Results initially include active, inactive and unknown permissions. Combine token address, spender address, activity and exposure filters; sort by exposure or either address. Amounts are displayed exactly, including raw units when decimals are unknown; cross-asset amount sorting is not offered. Open each explanation or snapshot disclosure for details. Coverage failures have an independent retry. Scan retries are deliberate and respect `Retry-After`; nothing refreshes scans on focus or retries automatically. Wallet input/results are not placed in URLs, persistent storage or analytics. Live scans share the address with the backend and its configured RPC provider; following live explorer links contacts Etherscan.

## Commands

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:production
pnpm exec playwright install chromium
pnpm test:containers
pnpm test:e2e
pnpm docs:generate
```

`pnpm format` formats application/configuration files and this README. Existing specifications, skill files, and owner-supplied design exports are excluded. `pnpm typecheck` and `pnpm test` first build shared contracts; `pnpm build` follows workspace dependencies. Tests use Node's test runner, Supertest for real Nest HTTP behavior, and isolated local HTTP servers for proxy behavior. They make no provider calls.

`pnpm test:e2e` builds the production applications and starts its own demo API/web servers on loopback ports `3101`/`3100` (both must be free). Playwright `1.65.1` and `@axe-core/playwright` `4.14.0` are pinned test dependencies. Install Chromium once with the command above; on Linux, missing browser system libraries can be installed with Playwright's documented `install --with-deps chromium` option. The real input-to-result test traverses Next → existing proxy → Nest demo API. Stage 05 also starts isolated fixed-reader Nest/Next pairs on ephemeral loopback ports for inactive/partial/unknown/error, spoofing and cancellation paths. Scenario selection and observation are test-process-only, with no HTTP controls. Browser boundary fixtures cover deliberately malformed responses and selected client lifecycle cases. Traces on failure are stored in ignored `test-results/`. Chromium, keyboard, responsive layout and axe checks complement the recorded Stage 05 security review; human assistive-technology testing remains unperformed.

After `pnpm build`, the two production servers can also be started separately:

```sh
pnpm --filter @wps/api start
pnpm --filter @wps/web start
```

`pnpm test:production` starts/stops its own processes on ephemeral loopback ports. It checks health, schema-valid demo scan/coverage responses through the actual API and existing proxy, disabled production docs, two runtime targets against the same web build, upstream cancellation on browser disconnect, sanitized invalid startup, cleanup after an occupied-port live startup, and browser artifacts for server-only configuration names. The isolated HTTP servers are test doubles, not application scan handlers.

## Configuration

The API's start/dev scripts use Node's environment-file loading for `apps/api/.env`. Next dev uses its standard environment-file loading under `apps/web`. The host web production start script loads `.env`, `.env.production`, `.env.local`, then `.env.production.local` with Node before standalone validation, preserving that file precedence and process-environment overrides. Production containers use runtime injection and contain no environment files. Actual `.env*` files are ignored by Git and excluded from container builds.

| Variable                  | Consumer        | Behavior                                                                                                                                          |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | API / Next      | API accepts `development`, `test`, `production`; Next sets its normal command-specific mode                                                       |
| `PORT`                    | API             | Integer `1..65535`, default `3001`                                                                                                                |
| `SCAN_MODE`               | API             | `live` by default; `demo` needs no RPC URL                                                                                                        |
| `ETHEREUM_RPC_URL`        | API only        | Required in live mode; HTTP(S), HTTPS in production; no URL userinfo, fragment, or wildcard host; used by background readiness and internal reads |
| `WEB_ORIGIN`              | API             | Exact HTTP(S) origin, default `http://localhost:3000`; no wildcard, path, query, fragment, or userinfo                                            |
| `API_PROXY_TARGET`        | Web server only | HTTP(S) origin, default `http://localhost:3001`; Compose sets `http://api:3001`; validated before listening and read at runtime                   |
| `TRUSTED_PROXY_CIDRS`     | API             | Empty by default; otherwise comma-separated IPv4/IPv6 CIDRs; malformed/empty entries and unrestricted `/0` rejected                               |
| `LOG_LEVEL`               | API             | `debug`, `info` (default), `warn`, `error`; minimal structured startup/error events, no raw request or provider logs                              |
| `NEXT_TELEMETRY_DISABLED` | Next            | `1` in the example and local images                                                                                                               |

No `NEXT_PUBLIC_*` secret, wallet key, or seed phrase is needed. Database configuration is absent. Invalid configuration errors contain field names only. Live readiness now requires a successful fresh chain/snapshot probe, but does not guarantee each token method succeeds.

The API does not trust forwarded IP headers by default. The web proxy strips cookies, authorization, browser IDs and forwarded identity headers. Rate limits therefore use the API peer's shared bucket until a verified ingress and identity chain are implemented and tested. CORS only returns the configured exact origin and never enables credentialed wildcard access.

## Health and proxy behavior

```sh
curl -i http://localhost:3001/health/live
curl -i http://localhost:3001/health/ready
curl -i http://localhost:3000/api/v1/coverage
```

Liveness is `200 {"status":"ok"}`. Demo readiness is `200 {"status":"ready","mode":"demo","checks":{"configuration":"ok","blockchain":"not_required"}}`. Live readiness uses `blockchain: ok` only after a successful cached probe; absent, failed, or older-than-60-second probes return `503 {"status":"not_ready","mode":"live","checks":{"configuration":"ok","blockchain":"unavailable"}}`. Probes start at initialization and every 30 seconds, with one active probe, a six-second total budget, three-second attempts, no retries, and shared global RPC permits. Health requests only read this state. Both routes reject bodies and query parameters, generate `X-Request-Id` server-side, and use `Cache-Control: no-store`. Invalid configuration or registry prevents startup. Health probes address the API directly; they are not exposed by the application proxy.

The proxy forwards only `POST /api/v1/scans` and `GET /api/v1/coverage`, unchanged, to the operator target. Coverage returns the bounded configured registry; scans return complete/partial results or the documented structured error envelope. Unknown proxy paths/methods, queries, non-JSON POST bodies, and requests over 1 KiB are rejected. Upstream requests have a 25-second total budget, disconnect cancellation, a 1 MiB response limit, no redirects/retries/caching, and a response-header allowlist for content type, request ID, and retry delay. Transport failures return a sanitized `503 SERVICE_NOT_READY`. The API applies shared domain schemas, caller quotas and scan admission controls described below.

Next's startup config validates the runtime target before opening the development port; instrumentation also initializes server-only configuration. There is no environment-specific build rewrite. The default target permits builds without environment secrets. The production standalone wrapper performs the same validation before importing the generated server.

Stage 06 now uses prepared standalone output: `pnpm build` packages the validator, its dependency and static assets, and `pnpm --filter @wps/web start` invokes the validated standalone entry point. Set `PORT` and `HOSTNAME` at runtime when overriding the default web listener. Host smoke/E2E and production images use the same entry point.

## Backend scan API and integration

```sh
curl -i http://localhost:3001/api/v1/coverage
curl -i -X POST http://localhost:3001/api/v1/scans \
  -H 'Content-Type: application/json' \
  --data '{"address":"0x3333333333333333333333333333333333333333"}'
```

The same two application paths work through `http://localhost:3000/api/v1/*`. `POST /api/v1/scans` accepts only `{address}`, with no query and a 1 KiB body limit. It returns every configured pair in stable ID order, exact decimal amounts, a finalized snapshot, registry/policy versions, activity counts, ordered risk signals and field warnings. A failed allowance stays unknown, never zero. All field reads must succeed for `complete`; at least one readable allowance is required for `200 partial`. No readable allowance produces `503 RPC_UNAVAILABLE`, or `504 SCAN_TIMEOUT` at the total deadline. Preflight failures produce errors without fabricated permission records.

The pure `mvp-1` policy is shared by backend calculation and runtime response validation; inconsistent levels/signals/parameters are rejected. It uses bigint: positive allowance starts at low; exact maximum uint256 raises it to high; at least ten times a positive balance or positive allowance with a zero balance raises it to at least medium. Unverified identity is informational. Missing balance limits an active assessment; zero allowance remains none/complete. Labels never certify contract safety or exhaustive wallet coverage. No completed-result cache, persistence or history was added.

Scan and coverage quotas are separate: 10 and 60 attempts/minute/IP, including malformed attempts. Each route's fixed window starts on its first attempt. The process admits four scans without a waiting queue and keeps the reader's 15-second budget. Limiter state is capped at 10,000 IPs and expires after two idle minutes, including without new traffic. Quota rejection returns `429` with integer `Retry-After`; full scan/limiter capacity returns `503 SCAN_CAPACITY_EXCEEDED` with `Retry-After: 1`. Provider throttling becomes field warnings or `503`, never caller `429`. Default identity remains the actual API peer; only explicit trusted proxy CIDRs enable validated forwarded IPs. Invalid forwarded identities fall back to the peer bucket.

All responses use server-generated `X-Request-Id` and `Cache-Control: no-store`. Logs contain no wallet input, bodies, raw IPs or provider exceptions. Cancellation on disconnect reaches the reader; capacity is held until aborted work settles. See the [API contract](docs/architecture/api-design.md) and [risk policy](docs/architecture/data-model.md).

`@wps/contracts` exports the authoritative request/response schemas and inferred types. `@wps/contracts/fixtures` exports synthetic complete, partial and coverage HTTP fixtures without backend/viem imports. `pnpm docs:generate` regenerates [OpenAPI 3.1](docs/api/openapi.json) using the installed Zod 4 native JSON Schema converter. Cross-field refinements and EIP-55 checks remain enforced by runtime schemas; JSON Schema expresses the wire structure and bounds. Tests validate fixtures and actual HTTP responses with both shared schemas and Ajv.

Development/test API processes serve `/api/openapi.json` and `/api/docs` directly on port 3001. The explorer uses bundled Swagger UI assets and disables its remote validator. These endpoints/assets are absent in production and are not forwarded by the web proxy. Swagger UI Express `5.0.1` uses lockfile-pinned Swagger UI `5.35.0`; Ajv `8.20.0` and ajv-formats `3.0.1` are test-only. The optional Scarf install-time analytics script is explicitly disabled.

Production HTML uses a fresh cryptographic CSP nonce for framework scripts/styles and is dynamically rendered with no-store. Same-origin connection/resource restrictions, framing protection, `nosniff`, `no-referrer` and disabled unused device permissions are tested with the real scanner. Preserve nonce/header and caching behavior at the eventual host; TLS/HSTS and platform logging remain release checks. See [security review](docs/architecture/security.md#stage-05-review--2026-11-19).

## Internal blockchain capability

The injectable `EthereumReader` boundary established in Stage 02 supplies the scan service; viem types and provider errors stay behind that boundary. The initial `mainnet-1` registry has three explicit USDC/WETH9 pairs with two Uniswap routers; see the [primary-source review and live verification status](docs/architecture/registry-provenance.md).

Each live read checks `eth_chainId == 1`, captures one finalized block (at most 1,800 seconds old and at most 60 seconds in the future), and pins all contract reads to its numeric height. Allowance/balance work precedes optional metadata. Balances and metadata are deduplicated per token; allowances are read per configured pair. Results use internal bigint values and discriminated field failures. Missing decimals do not default to 18; exact formatting supports decimals 0–255. Nonstandard bytes32 metadata is reported as `INVALID_RETURN_DATA` rather than guessed or silently replaced.

The reader enforces a 15-second shared deadline, three-second attempts, at most one transient retry with 150–250 ms jitter, four active scans with no admission queue, four reads per scan, sixteen global RPC calls including probes, and a 1 MiB response cap. A bounded FIFO coordinates RPC permits among admitted workers; it does not queue scan jobs. Retry delay must fit alongside a full next-attempt budget. Cancellation aborts and settles in-flight work, stops scheduling, and preserves completed fields. No redirects, JSON-RPC batching, Multicall, CCIP offchain lookup, alternate provider, or demo fallback is enabled.

For the initial operator setup, use an **Alchemy Ethereum mainnet HTTPS endpoint** obtained from its [Ethereum quickstart](https://www.alchemy.com/docs/reference/ethereum-api-quickstart). The adapter uses standard JSON-RPC and is not tied to Alchemy: a replacement must support `eth_chainId`, [`eth_getBlockByNumber` with `finalized`](https://www.alchemy.com/docs/chains/ethereum/ethereum-api-endpoints/eth-get-block-by-number), [`eth_call` at recent numeric blocks](https://www.alchemy.com/docs/chains/ethereum/ethereum-api-endpoints/eth-call), and [`eth_getCode`](https://www.alchemy.com/docs/chains/ethereum/ethereum-api-endpoints/eth-get-code) for smoke checks. Credentials stay in `apps/api/.env` or the API environment. No provider is selected automatically and no public endpoint is used as fallback. Recent finalized state is required; ordinary reads do not require an archive node.

After setting `ETHEREUM_RPC_URL`, run the opt-in live check from the repository root:

```sh
pnpm test:blockchain:live
```

This builds the API/contracts, explicitly selects live mode even if `.env` selects demo, checks chain/snapshot and the configured token reads, then checks nonempty bytecode at the same block for all four unique deployment addresses. It uses a synthetic public owner and accepts zero allowances/balances. It prints only safe status/counts/snapshot identity; optional metadata failures are counted. Missing credentials fail with a sanitized code. It never signs, creates permissions, or asserts positive allowances. **Not run against Ethereum during this implementation: no RPC credential was available.** The smoke execution path is covered with deterministic transport fixtures.

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

The root `.env` is for local Compose interpolation; app `.env` files are for host execution. If default host ports are occupied, set `WEB_HOST_PORT`, `API_HOST_PORT`, and the corresponding `WEB_ORIGIN` in the root `.env`; internal service ports and `API_PROXY_TARGET=http://api:3001` stay fixed. Compose defaults to demo and starts only web/API. API readiness gates web startup; both services have bounded health checks. Ports bind to loopback, and the web service uses the internal API hostname. Images run as the non-root `node` user and exclude secrets. The frontend-required `docs/design/variables.css` is included in the build context; other owner exports remain excluded. Stage 05 rebuilt and inspected the local web target after correcting that exception. The shared Dockerfile remains a local build helper; use the separate production Dockerfiles and Compose configuration below for release verification.

## Production artifacts and demo

See [deployment operations](docs/DEPLOYMENT.md) for runtime injection, HTTPS ingress requirements, exact health commands, log retention, provider verification, rotation and rollback. To build and run the local production-equivalent demo:

```sh
cp infra/.env.example infra/.env
docker compose --env-file infra/.env -f infra/compose.production.yaml config --quiet
docker compose --env-file infra/.env -f infra/compose.production.yaml build
docker compose --env-file infra/.env -f infra/compose.production.yaml up --no-build --wait --wait-timeout 120
```

Open `http://localhost:3000`. Production Compose requires explicit `SCAN_MODE` and `WEB_ORIGIN`, keeps API private, uses read-only/non-root containers, and retains one replica. Forwarded identities remain disabled: all visitors share the conservative API-peer quota. Demo address `0x3333333333333333333333333333333333333333` shows active/unlimited and inactive pairs; `0x6666666666666666666666666666666666666666` is all inactive; `0x7777777777777777777777777777777777777777` includes an unknown allowance and a partial result. Every demo result is synthetic, versioned separately from live, and has no explorer navigation.

`pnpm test:containers` needs Docker/Compose, Python 3 and the pinned Chromium installation. It builds both images and checks exported runtime layers, environment errors, two runtime proxy targets, real browser scans, private API/non-root/read-only operation, health/provider outage, no-store/CSP, spoof-resistant shared rate limits, safe errors and SIGTERM. It creates and removes only its isolated test stack. No live RPC secret is needed. CI runs the same checks without publication permissions; remote workflow execution and public HTTPS verification remain outstanding.

Use the Docker context/socket for your running daemon. Stage 06 checks in this environment used `DOCKER_CONTEXT=default` because its selected Desktop daemon was unavailable; normal setups should use their configured working context. No application source change is needed for that host setting.

## Structure and architecture

```text
apps/web/                    Next App Router scanner, API client/state/selectors and server-only proxy
apps/api/                    Nest health/configuration, registry/readers, scan API and pure risk rules
packages/contracts/          Zod HTTP schemas, EIP-55 validation and synthetic fixtures; no server imports
packages/typescript-config/  Strict base plus separate Node/Next module settings
scripts/production-smoke.mjs Production-artifact verification
scripts/container-smoke.mjs  Isolated production image/layer/browser verification
tests/e2e/                   Deterministic Chromium interaction and accessibility checks
tests/fixtures/              Synthetic API and fixed-reader scenarios
tests/support/               Isolated test-only API/web launchers and IPC observation
playwright.config.ts         Isolated production demo servers and browser configuration
infra/compose.yaml           Local web/API services
infra/compose.production.yaml Private API and hardened production containers
infra/docker/                Local build helper
docs/architecture/           Contracts, safety requirements, decisions
docs/features/               Roadmap and detailed stage gates
docs/design/                 Owner-supplied Refero references, preserved
.agents/skills/              Project-local Codex skills
```

The backend owns chain retrieval, bounded orchestration, serialization and pure deterministic risk rules. The browser validates shared HTTP schemas, interprets supported signal codes and never receives RPC credentials. See the [overview](docs/architecture/overview.md), [project structure](docs/architecture/project-structure.md), [API contract](docs/architecture/api-design.md), [security specification](docs/architecture/security.md), and [ADR-001](docs/architecture/decisions/ADR-001-architecture.md).

The root [AGENTS.md](AGENTS.md) and [skills inventory](skills.md) carry project instructions. Stage 04 uses the owner reference pack under [docs/design](docs/design/DESIGN.md), preserving all four exports. The owner resolved extraction conflicts in favor of the blue primary button and the DESIGN.md/variables.css type scale. App-specific CSS imports the variables export, maps secondary text to Graphite for contrast, and adapts the fixed rail to mobile navigation. Reference fonts are not bundled or installed; supplied system fallbacks are used without third-party font requests. Tailwind/shadcn are optional and were not added: native controls meet this surface's needs. Base branding, sample metrics and network support were not copied.

## Roadmap and verification

| Stage                                                                        | Status                                                    |
| ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| [01 — Foundation](docs/features/stages/01-project-foundation.md)             | Complete — verified 2026-11-18                            |
| [02 — Blockchain](docs/features/stages/02-blockchain-integration.md)         | Complete — deterministic verification; live smoke not run |
| [03 — API and risk](docs/features/stages/03-backend-and-risk-analysis.md)    | Complete — verified 2026-11-19                            |
| [04 — Frontend](docs/features/stages/04-frontend-integration.md)             | Complete — verified 2026-11-19                            |
| [05 — Testing and security](docs/features/stages/05-testing-and-security.md) | Complete — verified 2026-11-19                            |
| [06 — Release](docs/features/stages/06-deployment-and-release.md)            | In progress — local artifacts; public release outstanding |

Use the [roadmap](docs/features/ROADMAP.md) for acceptance gates. Historical Stage 01 verification covers configuration rejection/redaction, health and input limits in both modes with provider calls forbidden, proxy bounds/headers/cancellation, independent shared-package resolution, lint/type checks, production builds, runtime startup/proxy smoke, and local Compose readiness/routing. Stage 02 adds reader/transport tests; Stage 03 adds scan, risk, abuse controls and OpenAPI checks; Stage 04 adds frontend and browser coverage. Stage 05 adds the security review and clean-install evidence below.

Stage 01 verified on 2026-11-18: lint, formatting, strict type checking, 35 deterministic tests (28 API / 7 web), both production builds, production smoke, development startup in an isolated container, and local Compose health/routing. The environment's occupied host port `3000` required Compose host-port overrides `3300/3301`; internal addressing stayed `api:3001`. Verification containers were stopped afterward. See the [Stage 01 verification record](docs/features/stages/01-project-foundation.md#verification-record--2026-11-18). No Git commit was created; changes are ready for review.

Stage 02 verified on 2026-11-18: lint, formatting, strict type checking, **68 deterministic tests (61 API / 7 web)**, both production builds and production smoke. Tests include real local HTTP cancellation/response limits and fake-clock retry/deadline/concurrency/readiness checks. Optional live RPC/bytecode verification was not run without credentials. See the [Stage 02 verification record](docs/features/stages/02-blockchain-integration.md#verification-record--2026-11-18).

Stage 03 verified on 2026-11-19: lint, formatting, strict type checking, **112 deterministic tests (105 API / 7 web)**, reproducible OpenAPI generation, both production builds and production smoke through the real scan/coverage proxy. Live-mode adapter responses use deterministic transport fixtures; no live RPC check ran. See the [Stage 03 verification record](docs/features/stages/03-backend-and-risk-analysis.md#verification-record--2026-11-19).

Stage 04 verified on 2026-11-19: lint/format/type checks, **121 deterministic unit/HTTP tests (105 API / 16 web)**, both production builds, production smoke and **13 Chromium browser tests**. Axe found no violations in idle and expanded partial-result states. Layouts were checked at 320, 390 and 1440 px; desktop/mobile screenshots were visually inspected. See the [Stage 04 verification record](docs/features/stages/04-frontend-integration.md#verification-record--2026-11-19). Live RPC, Firefox/WebKit, human screen-reader testing and public deployment were not performed. The subsequent Stage 05 review is recorded below.

Stage 05 verified on 2026-11-19: clean frozen dependency installation, lint/format/types, **126 unit/HTTP tests (110 API / 16 web)**, both production builds, **20 Chromium tests**, production smoke and byte-identical OpenAPI regeneration. Review fixed risk-payload consistency, added production CSP/security headers and restored required CSS to the local container build context. `pnpm audit --json` returned zero known advisories; no dependencies were upgraded. The existing local web image built and passed a network-disabled/non-root/file-exclusion inspection. See the [test inventory and release checks](docs/features/stages/05-testing-and-security.md#test-inventory-and-review-evidence--2026-11-19) and [security evidence/residual limits](docs/architecture/security.md#stage-05-review--2026-11-19). Live RPC, Firefox/WebKit, human screen-reader testing and public deployment remain unperformed.

Stage 06 local implementation and verification are recorded in its [verification record](docs/features/stages/06-deployment-and-release.md#verification-record--2026-11-19). No host/domain, public demo URL, image publication, release commit/tag or tested previous-release rollback exists yet.

The [follow-up review](docs/features/stages/06-deployment-and-release.md#follow-up-review--2026-11-19) fixed startup failure cleanup, protected rollback environment backups from Git/build inclusion, verified smoke resource cleanup on success and failure, and added the missing Stage 05 advisory lookup to CI. Public deployment remains excluded from the authorized work.
