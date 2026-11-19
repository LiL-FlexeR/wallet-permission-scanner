# Stage 06 — Deployment and Release

## Objective

Package and verify a publicly demonstrable read-only MVP with reproducible builds, hardened CI, explicit live/demo operation, and actionable deployment documentation. Publish only claims backed by the completed implementation and verification.

## Prerequisites

- [Stage 05](05-testing-and-security.md) is complete and its required checks pass.
- All reference-dependent frontend implementation is accepted; a non-visual client alone is not a releasable demonstration.
- Read the [deployment model](../../architecture/overview.md), [security specification](../../architecture/security.md), [API budgets](../../architecture/api-design.md), and actual README commands.
- Select one simple container-capable host with HTTPS, private service connectivity where available, secret injection, and suitable request timeouts. Hosting provider, domain, and budget are owner/operator choices to record at implementation time; no provider is assumed here.
- For a live deployment, obtain a production RPC credential and confirm recent finalized-block reads. A separately labeled demo deployment requires no RPC credential.

## Scope

Production web/API Docker builds, production configuration, CI, deployment/rollback instructions, deterministic demo packaging, release documentation, and final smoke verification. Start with one API replica and no database. Deployment must not require queues, Redis, Kubernetes, or an authentication provider.

## Technical Requirements

- Build supported pinned versions from the committed lockfile with multi-stage Docker builds. Run as an unprivileged user, minimize runtime dependencies, exclude local secrets/test data not needed at runtime, and handle termination correctly.
- Do not bake RPC credentials or environment files into layers, build args, or browser assets. Keep web proxy configuration server-only and verify the chosen runtime startup mechanism works with the production artifact.
- Set HTTPS ingress and fixed-origin `/api/*` forwarding. Keep the API private where supported. Configure exact `WEB_ORIGIN`, trusted proxy CIDRs, and spoof-resistant client IP handling for the actual platform.
- Preserve timing hierarchy: scan budget 15 seconds, browser 20 seconds, ingress/proxy at least 25 seconds. Probe timeouts and termination grace must permit orderly shutdown; stop scan admission before draining/aborting within a documented bounded shutdown window.
- Use `/health/live` for process liveness and `/health/ready` for traffic readiness. Provider outage can make readiness fail without crashing the process. External probe traffic must not cause new provider reads.
- Keep in-memory limits on one API replica. Do not enable autoscaling that multiplies quotas without a revised aggregate-limit design.
- Package deterministic demo fixtures in an explicit `SCAN_MODE=demo` deployment/configuration, with `source: demo`, synthetic snapshot disclosure, and no live RPC calls. No fallback from live failure. Permit documented synthetic addresses/scenarios chosen at startup or from a fixed address mapping; no arbitrary scenario-control endpoint.
- GitHub Actions must run format/lint/type checks, deterministic unit/integration/E2E tests, application builds, and Docker build checks. Required CI has no live RPC secret dependency.
- Use least-privilege workflow permissions, full action commit SHAs, explicit tool versions, bounded job timeouts/concurrency, and safe handling of forked pull requests. Do not run untrusted PR code with deployment secrets. See [GitHub's secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use).
- Any image publication or live deployment workflow is explicit and separate from untrusted PR checks. Document real rollback steps using a known previous image/configuration; do not claim tested rollback without evidence.

## Implementation Tasks

- [ ] Select and record deployment host/runtime versions, domain/origin, proxy topology, timeout settings, and the single-replica constraint.
- [x] Add production web/API Dockerfiles, `.dockerignore`, pinned base-image policy, reproducible package builds, unprivileged users, and health probes.
- [x] Validate runtime environment injection and web-to-API routing in production-built containers; verify no secret appears in layers, bundles, or logs. Local checks use synthetic sentinels, not real credentials.
- [x] Package a deterministic synthetic demo exercising active, unlimited, inactive, and partial/unknown cases through the same contract. Keep demo and live registry versions distinct and source labels unavoidable in result interpretation.
- [x] Add hardened GitHub Actions checks using verified repository scripts; publish only safe test/build artifacts with appropriate retention. No artifacts are uploaded; hosted execution remains outstanding.
- [x] Document deployment, environment setup, provider capability verification, health checks, log retention, troubleshooting, secret rotation, and rollback in `docs/DEPLOYMENT.md`.
- [x] Deploy to the selected authorized environment if access is available. Otherwise deliver verified production artifacts and exact operator steps, explicitly marking public deployment as outstanding. The owner selected artifacts/instructions only.
- [x] Run production smoke checks for valid/invalid input, inactive/partial demo paths, rate-limit behavior, trusted proxy routing, no-store, error redaction, health, and graceful shutdown. Verified locally with empty proxy trust and a shared peer bucket.
- [ ] Verify HTTPS/security headers and metadata/explorer handling in the deployed runtime; confirm no wallet connection/signature/transaction path exists.
- [x] Update README status, real setup/deploy commands, actual demo URL if available, coverage, screenshots only from the implemented supplied design, known limitations, and measured evidence only where it exists. No public URL or new screenshot is claimed.
- [ ] Check all docs/links/stage progress against shipped behavior, record release commit/image identifiers, and tag a release only after the documented gates are met.

Build/test/document before any external publication. Do not represent missing host access or deployment credentials as a successful public release.

## Expected Files and Modules

- `apps/web/Dockerfile`, `apps/api/Dockerfile`, root `.dockerignore`, and production configuration adaptations.
- Existing `infra/compose.yaml` updates or a small production override only if useful for the selected host.
- `.github/workflows/ci.yml` and a separate publication workflow only if publishing is adopted.
- Packaged demo reader/fixtures using the established blockchain boundary.
- `docs/DEPLOYMENT.md`, created during implementation after the platform and commands are real; this is a justified operational document, not a planning placeholder.
- Updated README, security evidence, roadmap checkboxes, environment examples, and release notes in the repository's chosen format.

## API Contracts

No new business APIs or production scenario-mutation endpoint. Preserve [scan/coverage contracts](../../architecture/api-design.md), internal health probes, safe error envelopes, and cache controls. Disable interactive API docs by default in production; a reviewed static OpenAPI artifact may be published. A demo response must remain distinguishable even when it has the same field shape as live results.

## Data Models

No new database schema. Production baseline state is ephemeral; registry/policy/demo fixtures are versioned with the release. Record deployment image/commit identifiers in release documentation rather than storing every scan. If persistence was adopted by a separately justified decision, this stage additionally needs explicit migration/backup/rollback instructions; do not create them for a database that does not exist.

## Edge Cases

- Next.js build embeds a development proxy target or reads missing runtime configuration.
- API is healthy at process level but provider is wrong-chain/stale/unavailable; readiness stays false without restart loops.
- Proxy terminates a request before the API budget, drops retry headers, caches results, or trusts spoofed client IPs.
- Production host scales the API beyond one replica or changes source network identity.
- Container termination during a scan or retry; unfinished work must abort without hanging shutdown.
- Demo data accidentally labeled live, demo explorer addresses interpreted as real deployments, or live failures replaced by fixtures.
- Fork PR obtains secrets, action dependency moves, logs expose configuration, or build artifacts include environment files.
- Rollback restores an image but leaves incompatible runtime environment or registry explanations.

## Security Considerations

Apply the [security specification](../../architecture/security.md) to the actual host. Inspect image layers and served bundles, constrain proxy trust, enforce HTTPS and browser headers, document platform log retention, and keep deployment permissions separate from CI testing. Avoid any key/fund setup in release instructions. Do not publish an unverified performance or security claim.

## Testing Requirements

- Run the exact Stage 05 suite in CI with deterministic fixtures and no live RPC credentials.
- Build and start both production images; verify health, runtime proxy target, termination, and environment errors.
- Smoke-test deployed or locally production-equivalent containers through the real proxy, including source labels, no-store, retry headers, and failure states.
- An optional live smoke check validates read-only provider capability and configured deployment addresses; record whether it ran.
- Exercise rollback in an available nonproduction environment or clearly mark the procedure as documented but untested.

## Acceptance Criteria

1. A clean checkout builds production images and passes required CI with pinned tool versions and no secret-dependent tests.
2. Production-built containers honor runtime configuration, safe users, health checks, cancellation, and documented timeouts.
3. Deterministic demo runs without RPC access and clearly describes its data as synthetic; live mode never falls back to it.
4. An operator can deploy, diagnose provider/configuration failures, rotate the RPC credential, and restore the previous release using the runbook.
5. README and roadmap accurately distinguish implemented, verified, deployed, and still-outstanding work.
6. A public demonstration is actually accessible and smoke-tested before calling the public-release objective complete. Missing hosting access leaves this criterion outstanding.

## Recommended Codex Skills

- `docker-build-strategies`, if available: reproducible multi-stage images, runtime users, secret exclusion, and cache behavior.
- `docker-compose-patterns`, if available: local production-equivalent verification and explicit service networking.
- `github-actions-hardening`, if available: workflow permissions, pinned dependencies, fork trust boundaries, and secret handling.
- `playwright-cli`, if available: final functional smoke checks through the deployment.

Check availability and read chosen skills; do not install automatically. Use version-matched Docker, Next.js, NestJS, and GitHub Actions documentation. AWS skills in the catalog are optional only if the selected host is AWS and their scope is needed; this plan does not select AWS or require an AWS deployment. Database skills remain deferred in the baseline.

## Definition of Done

All tasks and acceptance criteria are verified, evidence and residual limitations are recorded, a labeled public demonstration is reachable, and documentation/roadmap reflect reality. Update [roadmap progress](../ROADMAP.md) and change README status from Planning only when implementation has actually progressed. Do not mark a public release complete solely because Dockerfiles or deployment instructions exist.

## Out of Scope

Enterprise platform setup, distributed scaling, multi-region failover, managed queues, Kubernetes, authentication, new chains, broad approval indexing, persistent history without a new requirement, and any transaction/revocation capability.

## Verification record — 2026-11-19

**In progress; local artifacts delivered, no public release.** The owner explicitly limited this implementation to production artifacts and instructions. Host/provider, domain/origin and budget selection remain owner/operator work; no publication, release commit/tag or public URL was created. [Deployment operations](../../DEPLOYMENT.md) documents the implemented Docker topology, actual commands, immutable base policy, conservative proxy identity and remaining public gates.

### Implementation

- Production web/API Dockerfiles build the committed lockfile with Node `24.16.0` / pnpm `12.21.0` and the verified base digest. API uses an isolated production-only pnpm deployment; web uses prepared Next standalone output. Runtime contains neither the application test suite nor development source/tooling. Both images run as UID/GID 1000 with image health probes. Production Compose adds an init, read-only root, `/tmp` tmpfs, capability restrictions, loopback-only web publication, private API, one replica and bounded size-rotated logs.
- Standalone startup validates the runtime target before importing the generated server. Packaging copies static assets and the external validator dependency; host production smoke, Chromium E2E and containers use this same startup. The same web image was exercised against two different runtime upstreams, without a build rewrite.
- Demo retains distinct `demo-1`/`source: demo`. Fixed addresses select complete active/unlimited/inactive, all-inactive and partial/unknown cases. Arbitrary valid addresses retain the complete synthetic example. There is no scenario HTTP endpoint, live fallback or credential requirement. The existing reference-guided UI keeps synthetic coverage/snapshot disclosure and disables demo explorer navigation; design exports were preserved.
- API signal handling stops admission/probes, aborts admitted work and waits for settlement before closing sockets, with an eight-second failure watchdog and ten-second container grace. Next uses its own graceful cleanup and a thirty-second grace; installed Next `16.4.6` intentionally exits 143 after SIGTERM cleanup. API successful cleanup exits 0.
- GitHub Actions application/container jobs use read-only permissions, full verified action SHAs, nonpersistent checkout credentials, explicit versions, bounded timeouts/concurrency and no secrets/artifact publication. Fork PRs use ordinary unprivileged `pull_request`; no privileged follow-up executes their code. The source hardening review found no actionable issues. Remote GitHub execution is not claimed.

### Checks completed

On the pinned Node/pnpm toolchain, lint, formatting, strict types, **128 unit/HTTP tests (112 API / 16 web)**, production builds and production smoke passed. Production smoke includes two runtime targets, cancellation, sanitized startup failures, disabled docs, browser artifact inspection, actual process SIGTERM during an active synthetic read and the eight-second watchdog with an intentionally uncooperative test-only reader. All **20 Chromium E2E tests** passed through prepared standalone startup; OpenAPI regeneration remained byte-identical.

`pnpm test:containers` built and started both images with Docker `29.9.3` / Compose `5.1.4` on `linux/amd64`. It verified schema-valid real-proxy scans for the three fixed scenarios, actual Chromium interaction for all three, no demo explorer navigation, private API, non-root/read-only runtime, health, network-isolated live-provider outage without process failure, fresh CSP/nonces and no-store, malformed input, redacted errors/logs, spoofed identity headers exhausting one peer quota, preserved `Retry-After`, invalid API/web runtime configuration, a second web runtime destination, and SIGTERM exit behavior. A synthetic credential was placed in ignored root/API/web environment files before the build; all **9 API / 7 web runtime layers**, image configuration/history and browser assets passed sentinel inspection. Initial checks removed temporary files and containers, but follow-up review found leaked empty networks and corrected the teardown; see below. Built images remain local. These checks demonstrate tested exclusions, not an assurance about undiscovered leaks or all future operator configurations.

### Local artifact identifiers

Working tree based on commit `9dbdb30d7c431b7f80ee329558dceb8f548451ae`, with uncommitted Stage 06 changes. This base commit is **not** a release identifier for the changed code. No release commit was manufactured. Record a clean release commit and matching configuration only after review and release gates pass.

| Local tag | Verified image ID |
| --- | --- |
| `wallet-permission-scanner-api:stage06-local` | `sha256:80dc3f188050897c5ccd0813429486eb9f5eadb5d14bbc9d666373296e2c4a30` |
| `wallet-permission-scanner-web:stage06-local` | `sha256:e1d73dd8987f4aa5acf083e41f1a2c2d08be0b503056fe6e8069a9c681ef1f69` |

These are local Docker image identifiers from the final follow-up verification run, not published registry references. Rebuilding can change identifiers; no bit-for-bit reproducibility claim is made.

### Outstanding acceptance

Public host/domain/budget, HTTPS/certificate/HSTS and real ingress preservation, platform log retention, hosted CI execution, live provider verification, image publication/release commit/tag, a previous-release rollback rehearsal and an accessible public demo remain outstanding. The rollback/rotation procedures are documented; they were not tested against two released deployments. Limits remain process-local, and all users share the API-peer quota until a separately reviewed host-specific identity chain exists. No live RPC check, external security certification or public release is claimed. Stage 06's overall checkbox and Definition of Done remain incomplete.

## Follow-up review — 2026-11-19

The owner requested specification/AGENTS.md review and fixes, with public deployment explicitly excluded. Review found and corrected four issues:

| Priority | Finding and correction | Verification |
| --- | --- | --- |
| P1 | Rollback instructions used `infra/previous.env`, a non-ignored filename that could contain the RPC secret. The runbook now uses `infra/.env.previous`; Git and Docker context ignore `*.env` as well as `.env.*`. The layer audit also rejects named application environment files. | `git check-ignore` protects both backup names and application `*.env`; tracked `.env.example` templates stay available. Container builds use synthetic sentinels in both filename forms. |
| P2 | A failed live API listen left the background readiness timer alive after `startup_failed`. Main now uses the bounded shared teardown on startup failure, preserving exit code 1; concurrent stop callers share one cleanup promise. | A real child process with a deliberately occupied port and a network-disabled provider stub exits 1 within five seconds, without the URL sentinel in logs. Existing active-work SIGTERM/watchdog checks pass. |
| P2 | Smoke cleanup called Compose down while the alternate web container was still attached to its network, ignored cleanup errors and reported success before teardown. Extra containers now stop first; cleanup is checked and reported as part of test success. | Normal container smoke and an intentionally failing run after network attachment verify no retained containers/networks. Four previously leaked networks were confirmed empty and removed individually. No global prune or volume deletion was used. |
| P2 | Required CI omitted Stage 05's reviewed dependency advisory lookup. The application job now runs `pnpm audit --json` without automatic fixes. | Local advisory lookup returned zero advisories for 576 dependency entries. Hosted CI execution remains outstanding. |

The deterministic unit/HTTP suite (128 tests), 20 Chromium E2E checks, lint/format/types, production builds/smoke and byte-identical OpenAPI generation were repeated. Required container checks include startup environment validation, runtime routing, demo cases, health/outage, no-store/security headers, spoof resistance, layer/bundle/log sentinel inspection and SIGTERM, plus verified cleanup. No risk rule, wire schema, owner design export or lockfile was changed. Public HTTPS, live RPC, hosted CI and a previous-release rollback rehearsal remain outstanding; no release tag or public deployment was created.
