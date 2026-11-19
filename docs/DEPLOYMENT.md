# Deployment and release operations

## Current delivery boundary

Stage 06 supplies local production artifacts and an operator runbook. On 2026-11-19 the owner explicitly selected **artifacts and instructions only**. No hosting account, public domain, budget, deployment credentials, public URL, image publication, Git release commit or release tag has been selected or created. Public HTTPS verification and public-release acceptance remain outstanding. The topology below is a supported operator path, not an assertion of an existing host.

Use one Docker-capable Linux host with an HTTPS ingress on that host, one web container and **exactly one API container**. The ingress connects to `127.0.0.1:3000`; Next forwards only the two supported application routes to `http://api:3001`. The API has no published host port. No database or persistent application volume is required. Do not enable API autoscaling: quotas, admission and RPC permits are process-local.

## Runtime and build policy

- Node `24.16.0`, pnpm `12.21.0`, Next `16.4.6` and Nest `12.5.1` remain pinned; dependencies come from `pnpm-lock.yaml` with frozen installation. Production packaging uses `pnpm deploy --prod` for the API and prepared Next standalone output for web.
- Both production Dockerfiles pin `node:24.16.0-bookworm-slim` to multi-platform index digest `sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203`, verified from Docker Hub on 2026-11-19. Builds were exercised on `linux/amd64`; other platforms are not verified. Review base-image security updates, change both pins together, and rerun all release checks. A digest pin does not promise an indefinitely secure OS image.
- Images contain runtime artifacts and production dependencies, run as UID/GID `1000:1000`, and use direct Node commands. Compose supplies an init process, a read-only root filesystem, a small `/tmp` tmpfs, dropped capabilities and `no-new-privileges`.
- Never supply RPC credentials as a build argument, build environment, source file or browser variable. Build context excludes environment/credential files, repository metadata, tests and unrelated documentation. The owner CSS export required by the web build is preserved and explicitly included.
- `pnpm build` prepares `.next/standalone/apps/web/` with static assets and the same environment validator used by Next configuration. `start-standalone.mjs` validates `API_PROXY_TARGET` **before** importing `server.js`; standalone otherwise bypasses `next.config.ts` startup validation. The validator's Zod dependency is packaged explicitly. Host start scripts, production smoke, E2E and containers use this entry point. The host start script first loads the usual production environment files with Node (process variables win); containers inject runtime environment directly. `next start` is not the release entry point.
- Locked builds are reproducible from source in the operational sense; byte-for-byte image equality is not claimed. Record exact resulting image identifiers with the exact source commit and runtime configuration at release time.

Reference documentation: [Next standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [pnpm 12 deploy](https://pnpm.io/cli/deploy), [Docker build guidance](https://docs.docker.com/build/building/best-practices/), and [Nest lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events).

## Build and run a local production-equivalent demo

Prerequisites: the pinned Node/pnpm toolchain, Docker Engine with BuildKit, Compose v2 or newer, Python 3 for the layer audit, and Chromium for smoke tests. Verified local Docker Engine was `29.9.3`, Compose `5.1.4`; CI uses the GitHub-hosted Ubuntu 24.04 Docker installation and reports its actual build output. Docker is infrastructure, not an application package installed by pnpm.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:containers
cp infra/.env.example infra/.env
docker compose --env-file infra/.env -f infra/compose.production.yaml config --quiet
docker compose --env-file infra/.env -f infra/compose.production.yaml build
docker compose --env-file infra/.env -f infra/compose.production.yaml up --no-build --wait --wait-timeout 120
curl --fail http://localhost:3000/api/v1/coverage
```

Open `http://localhost:3000`. If that port is occupied, edit `WEB_HOST_PORT` and the matching `WEB_ORIGIN` in `infra/.env`. Select a working Docker context first when needed; this workspace uses `docker --context default` / `DOCKER_CONTEXT=default` because its Desktop daemon is not running. Do not print resolved Compose configuration: it can expose injected RPC credentials. Use `config --quiet`.

`pnpm test:containers` creates its own uniquely named Compose project and random loopback web port, explicitly forces demo mode, creates only synthetic credential sentinels (`.env.*` and `*.env`), builds the images, audits every exported runtime layer, exercises the real applications, and tears down its test containers/network. It retains the built images. It requires no RPC credential. Failure cleanup is confined to that project's containers and its own temporary files. Extra containers detach before Compose removes the network; resource absence is asserted, and a cleanup failure fails the check. `--skip-build` is a diagnostic option only; a release check must include the build. `--skip-build --fail-after-alternate` intentionally exits 1 after attaching the second web container, to verify the failure cleanup path; it is not a successful release check.

Stop the manually started demo with:

```sh
docker compose --env-file infra/.env -f infra/compose.production.yaml down
```

## Explicit synthetic scenarios

`SCAN_MODE=demo` selects `demo-1`, not `mainnet-1`, and never constructs the live reader. Result and coverage responses carry `source: demo`. The UI labels coverage, data and snapshots as synthetic, and suppresses demo explorer navigation.

| Public input | Fixed scenario |
| --- | --- |
| `0x3333333333333333333333333333333333333333` | Complete: unlimited active, inactive and finite active allowances |
| `0x6666666666666666666666666666666666666666` | Complete: all three pairs inactive |
| `0x7777777777777777777777777777777777777777` | Partial: two active pairs and one unreadable/unknown allowance |
| Any other valid nonzero address | Same complete synthetic scenario as the first row, bound to the submitted address |

This is a fixed address mapping, not account-specific chain data. It introduces no scenario-control endpoint or live-to-demo fallback. Invalid addresses still fail validation. No funds, wallet connection, signature or transaction are needed.

## Runtime configuration and live operation

Store the actual environment file outside source control with operator-only permissions (`chmod 600 infra/.env` on the host), or inject equivalent values using the host's secret manager. Docker environment values are visible to privileged host/Docker operators; environment injection is not secret encryption. Do not paste values into support logs.

| Setting | Production Compose behavior |
| --- | --- |
| `SCAN_MODE` | Required explicit `demo` or `live`; no production Compose default |
| `WEB_ORIGIN` | Required exact origin; use the chosen public `https://...` origin for publication |
| `ETHEREUM_RPC_URL` | API runtime only; required HTTPS endpoint for live; leave empty in demo |
| `API_PROXY_TARGET` | Web runtime only; fixed internal `http://api:3001` in this topology |
| `TRUSTED_PROXY_CIDRS` | Forced empty in production Compose; forwarding headers do not establish client identity |
| `API_IMAGE`, `WEB_IMAGE` | Local build tags initially; use saved immutable IDs or registry digests for a release |
| `WEB_HOST_PORT` | Loopback ingress target, default `3000`; API port is never published |

Before enabling live mode, obtain a production mainnet RPC credential and verify `eth_chainId`, a recent `finalized` block, `eth_call` at that numeric snapshot and configured contract bytecode. The existing opt-in command is:

```sh
pnpm build
pnpm test:blockchain:live
```

That command uses `apps/api/.env` or process environment; configure the credential there securely for host verification. Container credentials are injected separately from `infra/.env`. The smoke command only reads public state; it does not require a positive allowance. It has **not run** without credentials. See [provider requirements](../README.md#internal-blockchain-capability) and [registry provenance](architecture/registry-provenance.md). Then change `SCAN_MODE=live` in the deployment environment and recreate the API; a missing/invalid credential prevents startup, and a provider failure never selects fixtures.

## HTTPS ingress, privacy and proxy trust

Before public deployment, choose and record the host/provider, domain, budget, certificate/renewal mechanism, ingress version, firewall and timeout settings. Permit only HTTPS/HTTP redirect ingress externally; expose neither API port 3001 nor the loopback web port publicly. Route the entire web origin, including `/api/v1/scans` and `/api/v1/coverage`, to Next. Do not route application paths straight to Nest or expose `/health/*` externally.

For an operator-managed Nginx ingress, the following is the application location configuration to adapt inside the chosen HTTPS virtual host. The domain/certificate virtual host itself is operator-owned and not deployed or validated here:

```nginx
access_log off;
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For "";
    proxy_set_header X-Real-IP "";
    proxy_set_header Forwarded "";
    proxy_set_header Connection "";
    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
    proxy_buffering off;
    proxy_cache off;
}
```

See the official [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html). Verify the actual installed ingress configuration before reload. Preserve application CSP/nonces, `Cache-Control: no-store`, `X-Request-Id`, `Retry-After`, `nosniff`, `no-referrer`, framing and permissions headers. Disable CDN page/API caching and HTML rewriting. Add HSTS at the TLS terminator only after HTTPS and renewal are working; verify the final response and a valid certificate. Never cache nonce-based HTML.

All proxied visitors deliberately share the API peer's **10 scans/minute** and **60 coverage requests/minute** buckets. Forged identity headers cannot split that bucket. This is conservative and may constrain a public demo. Do not enable generic private-range or unrestricted proxy trust to obtain per-browser quotas. A future host-specific original-client identity chain requires an explicit design and spoofing tests before changing this behavior.

Application logs contain startup/sanitized errors, not request bodies, wallet inputs or raw IPs. Compose uses Docker's `local` log driver capped at three 10 MiB files per service. Size rotation is **not a time-based retention guarantee**. With the host selected, disable ingress access logging as above, disable request/body capture and tracing in the platform, and configure or verify a time-based retention/deletion policy of at most seven days (including copies/backups). Disclose any platform constraint before publication. No platform retention setting has been applied yet.

## Health, deadlines and shutdown

Internal probe commands:

```sh
docker compose --env-file infra/.env -f infra/compose.production.yaml exec -T api node -e "fetch('http://localhost:3001/health/live').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
docker compose --env-file infra/.env -f infra/compose.production.yaml exec -T api node -e "fetch('http://localhost:3001/health/ready').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
```

Liveness is process health; readiness is cached blockchain capability. Docker image health checks use readiness (web checks `/`). Platforms with separate probes must use API `/health/live` for restart/liveness and `/health/ready` for traffic admission. HTTP probes never create provider reads. A live provider outage produces readiness `503` while liveness stays `200`; do not restart repeatedly just because provider readiness is false. Compose health alone does not restart unhealthy containers. Startup `depends_on: service_healthy` waits for API readiness before starting web.

Timing hierarchy: API scan **15s**, browser **20s**, Next upstream proxy **25s**, ingress read/send **30s or greater**. API readiness background probes have a **6s** total budget, **3s** attempts, no retry, and a 30s schedule; cached success expires at 60s. Image probe requests have a **2s** deadline and a **3s** Docker timeout.

On API SIGTERM/SIGINT, admission and probes stop synchronously, active scan/probe budgets abort, work settles, then Nest closes HTTP connections including lingering sockets. An **8s** watchdog exits with code 1 if cleanup fails to settle; Compose allows **10s** before SIGKILL. Successful API shutdown exits 0. Web uses Next's signal handling and a **30s** Compose grace period, longer than its 25s upstream budget. Installed Next `16.4.6` intentionally exits **143** after its SIGTERM cleanup; this is distinct from a forced SIGKILL exit 137. For updates, remove traffic first, stop/recreate API, then restart web only after readiness. One replica means maintenance interruption; zero downtime is not promised.

API startup failures after partial initialization (for example an occupied port) use the same bounded teardown and preserve exit code 1. They do not leave readiness timers or provider work keeping an unhealthy process alive. Signal handlers are installed after listening succeeds; a signal before startup completes terminates the process normally at the operating-system level.

## CI and release gates

`.github/workflows/ci.yml` runs application format/lint/types, deterministic unit/HTTP tests, production builds, OpenAPI regeneration/drift, production smoke including SIGTERM/failed-listen cleanup, and all Chromium E2E checks. It also runs the Stage 05 `pnpm audit --json` check; this advisory lookup needs npm registry connectivity, separate from deterministic tests, and does not fix dependencies automatically. A separate unprivileged job builds and exercises both production images, including browser scans and layer inspection. No live RPC secret is needed.

The workflow uses `push`, `pull_request`, and manual dispatch on GitHub-hosted Ubuntu 24.04, `contents: read`, checkout without persisted credentials, full action SHAs verified against official repositories, Node/pnpm pins, 25/30-minute job timeouts and cancellation of superseded runs. It contains no untrusted expression interpolation in shell commands, privileged PR trigger, deployment secret, registry login, cache reuse across trust boundaries or artifact upload. CI uploads no traces, environment files or images; review local failure artifacts before sharing. GitHub-hosted CI itself has not been executed from this working tree. Configure repository checks/branch protection and log retention when adopting the workflow. Publication/deployment workflows are intentionally absent.

GitHub Actions hardening review of the authored workflow:

| Severity | Findings |
| --- | --- |
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| Informational | 0 |

Checked triggers, fork trust boundaries, script injection, permissions, immutable references and secret/output handling against [GitHub secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use). This is a source review, not a claim of a successful remote CI run. Dependabot proposes reviewed action/base-image updates; it does not publish automatically.

Before any release: run the complete commands in [Stage 05](features/stages/05-testing-and-security.md), `pnpm test:containers`, optional live smoke for live publication, deployed HTTPS/header/privacy checks, and a rollback rehearsal. Record the source commit, both image IDs/digests, runtime configuration revision (without secrets), registry/policy versions and actual URL. Tag only after the public acceptance gates pass.

## Update, rollback and credential rotation

Retain both previous images and a protected previous environment/configuration file before updating. For a local image deployment, obtain identifiers without printing configuration:

```sh
docker image inspect wallet-permission-scanner-api:stage06-local --format '{{.Id}}'
docker image inspect wallet-permission-scanner-web:stage06-local --format '{{.Id}}'
git rev-parse HEAD
git status --short
```

Save the previous IDs as `API_IMAGE` and `WEB_IMAGE` in `infra/.env.previous`, together with that release's exact mode/origin/port and the securely stored credential reference/value. This path is Git-ignored; `*.env` files are also ignored to protect older backup names such as `infra/previous.env`. Protect the backup with `chmod 600 infra/.env.previous`, and verify `git check-ignore infra/.env.previous` before adding a secret. Do not prune previous images before the rollback window ends. For a registry deployment, record immutable `repository@sha256:...` references instead. No registry or publication has been configured.

To restore a known previous release after taking ingress traffic out of service:

```sh
docker compose --env-file infra/.env.previous -f infra/compose.production.yaml config --quiet
docker compose --env-file infra/.env.previous -f infra/compose.production.yaml up --no-build --force-recreate --wait --wait-timeout 120
```

Use the Compose file from that same previous source/configuration revision if operational settings changed. Recheck internal readiness, source/registry/policy versions, coverage, a deliberate scan, no-store, retry/security headers and HTTPS before restoring traffic. `--no-build` prevents an accidental rebuild from the new working tree. Images alone do not restore matching environment or explanations. This procedure is documented but **has not been rehearsed against two released versions**; no known previous public release exists.

For RPC rotation: provision a replacement read-only provider credential; verify its mainnet/finalized/pinned-call capability using the opt-in smoke; replace only the protected API runtime secret; recreate API with the same image and mode; check readiness and one deliberate live scan; revoke the old credential after the rollback decision. Never copy the URL into shell command arguments, Git, image build settings, browser configuration or tickets. If the old credential was compromised, revoke it immediately and accept the availability impact. Demo needs no rotation.

## Troubleshooting and outstanding publication work

- Invalid configuration: process exits before serving and reports field names only. Correct the injected variable; do not copy raw secrets into diagnostics.
- API alive but not ready: confirm the selected provider supports chain 1 and recent finalized pinned reads, credential validity/quota and outbound HTTPS. Readiness failure does not certify a crash. There is no public provider or demo fallback.
- Web `503`: inspect API readiness and private service DNS/port, then verify the web runtime target. Do not expose the API publicly as a workaround.
- `429`: honor `Retry-After` and the documented shared peer bucket. Busy `503` means bounded process capacity; do not enable replicas to evade limits.
- Unhealthy container: inspect bounded local logs and internal health. Use `/health/live` to distinguish an application failure from provider unavailability. Redact operator credentials before sharing logs.
- Interrupted scan: retry deliberately after maintenance. No persisted history/job survives container replacement.

Public domain/TLS/HSTS, real ingress preservation, provider credentials/live checks, platform log retention, hosted CI execution, release commit/tag/image publication, a rollback rehearsal and a reachable public demo are outstanding. See the [Stage 06 verification record](features/stages/06-deployment-and-release.md#verification-record--2026-11-19) for local evidence. Stage 06 remains in progress.
