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
- [ ] Add production web/API Dockerfiles, `.dockerignore`, pinned base-image policy, reproducible package builds, unprivileged users, and health probes.
- [ ] Validate runtime environment injection and web-to-API routing in production-built containers; verify no secret appears in layers, bundles, or logs.
- [ ] Package a deterministic synthetic demo exercising active, unlimited, inactive, and partial/unknown cases through the same contract. Keep demo and live registry versions distinct and source labels unavoidable in result interpretation.
- [ ] Add hardened GitHub Actions checks using verified repository scripts; publish only safe test/build artifacts with appropriate retention.
- [ ] Document deployment, environment setup, provider capability verification, health checks, log retention, troubleshooting, secret rotation, and rollback in `docs/DEPLOYMENT.md`.
- [ ] Deploy to the selected authorized environment if access is available. Otherwise deliver verified production artifacts and exact operator steps, explicitly marking public deployment as outstanding.
- [ ] Run production smoke checks for valid/invalid input, inactive/partial demo paths, rate-limit behavior, trusted proxy routing, no-store, error redaction, health, and graceful shutdown.
- [ ] Verify HTTPS/security headers and metadata/explorer handling in the deployed runtime; confirm no wallet connection/signature/transaction path exists.
- [ ] Update README status, real setup/deploy commands, actual demo URL if available, coverage, screenshots only from the implemented supplied design, known limitations, and measured evidence only where it exists.
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
