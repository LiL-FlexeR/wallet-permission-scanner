# Security Specification

## Security posture

The MVP is a read-only public-address inspection tool. It must never collect a private key or seed phrase, request a signature, connect an injected wallet, submit a transaction, revoke approvals, or custody funds. Its classifications describe permission size under a published heuristic; they are not contract audits or definitive security findings.

The main protected assets are RPC credentials, service availability and quota, result integrity, and the privacy of scan activity. Public blockchain data can still be sensitive when linked to a browser or IP address. Security requirements apply to demo mode too, except that it makes no network reads.

## Threat model and controls

| Threat / boundary | Required control | Evidence |
| --- | --- | --- |
| Arbitrary address, JSON, or query input | Shared strict schemas, byte limit, checksum rule, reject unknown properties | HTTP tests reject malformed and oversized requests before RPC |
| RPC quota exhaustion | Registry-only work, rate limits, no queue, scan/RPC concurrency and deadlines | Fake-clock and concurrent-load tests show bounded admission and permits |
| User-controlled server-side requests | RPC/proxy destinations come only from validated operator environment; no URLs in scan input | Request schema and transport tests show no destination override |
| Wrong or stale blockchain data | Chain ID verification, recent finalized snapshot, fixed block reads, field failure states | Mock wrong-chain/stale-provider/partial cases |
| Malicious or malformed token metadata | Bounded upstream response and text, ABI validation, text-only rendering | Metadata injection, oversize, decode and frontend tests |
| Precision loss | `bigint` math, uint256 range checks, decimal-string serialization | Maximum value and boundary fixtures |
| Credential exposure | Server-only environment, no raw transport logs or error forwarding, built-bundle inspection | Redaction and production artifact checks |
| Misleading safety claims | Versioned explicit heuristics, coverage and freshness disclosures, unknown states | Risk fixtures and final copy/security review |
| IP spoofing behind proxy | Explicit trusted proxy CIDRs, strip/validate forwarded chain, single-replica limits | Direct and proxied header-spoofing tests |
| Dependency or CI compromise | Locked dependencies, reviewed upgrades, least-privilege CI, pinned action SHAs | Release checklist and workflow review |

A compromised RPC provider can lie about reads or chain state. The MVP trusts its configured provider and does not verify state proofs or reach cross-provider consensus. An upgradeable spender can change behavior after metadata review; identity verification cannot establish future safety.

## Input handling

Accept only the address field described in the [API contract](api-design.md). Enforce validation on the server even when browser validation succeeds. Reject zero, invalid mixed-case checksums, wrong length, internal whitespace, names, alternative chain inputs, and unknown fields. Contract wallets are valid public owners; do not exclude them by requiring an EOA.

Do not accept a token, spender, ABI, RPC URL, arbitrary explorer URL, or block range from the caller. Limit route bodies to 1 KiB before parsing and limit address text before normalization. Use schemas for outgoing responses as well, particularly decimal strings, nullable fields, and bounded arrays. Never interpolate rejected input into logs or messages.

## Safe blockchain access

Use only a viem public client and the fixed read ABI. No wallet client, signing provider, writable ABI helpers, transaction endpoint, or backend account belongs in the MVP. Application dependencies and code review should make this restriction easy to verify.

All successful values describe a stated finalized snapshot; a failure is unknown, not zero. No historical event is treated as proof of a current permission. Standard token reads can fail or return misleading values, so even a decoded response is a report from a trusted provider/contract, not a security guarantee. Out-of-scope permission systems are identified in the [blockchain document](blockchain-integration.md).

Keep RPC endpoints explicit and require HTTPS in production. Local nonproduction HTTP must be a deliberate development configuration. Do not follow redirects to unexpected hosts; validate any required provider redirect separately. Set request deadlines, cancellation, response size limits, and one bounded transient retry. Provider exceptions often contain credential-bearing URLs; normalize before logging or serialization.

## Secrets and operational configuration

`ETHEREUM_RPC_URL` is API-only. `API_PROXY_TARGET` is web-server-only and operator-controlled. Never use a browser-exposed environment prefix for these values. Keep actual environment files and credentials out of Git and image layers; commit only safe examples. Validate environment on startup and redact keys, URLs, authorization headers, and request bodies.

Prefer request IDs and aggregate counts over wallet identifiers in logs. Avoid raw IP logging at the application layer; the in-memory limiter may use the trusted IP only for its short lifetime. If proxy/platform access logs retain addresses or IPs, document that explicitly in the deployment runbook and choose a short retention policy, initially no more than seven days unless a platform constraint is disclosed. Do not add analytics that records wallet input by default.

## Abuse prevention and proxy trust

Use the exact budgets and failure behavior in the [API specification](api-design.md). In-memory request limits and concurrency apply to one API replica; they do not provide a distributed quota. Bound the IP limiter's entry count and expire idle entries so forged or numerous clients cannot grow memory indefinitely. Do not trust arbitrary `X-Forwarded-For` headers or enable unrestricted proxy trust.

The browser calls a fixed same-origin proxy. In Compose/private networking, leave proxy trust empty by default: proxied users then share the API peer's conservative limit bucket. In production, enable original-client limits only when a trusted ingress overwrites browser-supplied forwarding headers and the complete web/ingress chain is documented and tested. The web route handler must not treat an arbitrary incoming forwarded header as authenticated client identity. If trustworthy identity cannot be established on the chosen host, retain peer-based limits and disclose the shared-bucket limitation rather than accepting spoofable IPs.

CORS uses the exact configured `WEB_ORIGIN` when cross-origin access is needed and no credentialed wildcard. CORS is not authentication and does not stop command-line abuse. Public abuse protection relies on limits and bounded work.

Avoid background scan jobs, retry storms, and unbounded request coalescing. Browser submissions require deliberate user interaction; client-side retry waits respect `Retry-After` and never loop automatically. Disable hidden upstream retries that could exceed policy.

## Browser and external links

Treat token names, symbols, spender labels, and backend messages as text. Do not render arbitrary HTML, fetch remote images from metadata, or accept URL schemes from contract data. Construct explorer links using the fixed HTTPS Etherscan origin and validated address paths. External navigation should use appropriate opener isolation and avoid sending wallet-page details in the referrer. Provenance URLs come from reviewed registry data and require safe HTTPS validation.

Use a production content security policy and normal browser security headers compatible with the installed Next.js version and later frontend design. Validate the actual deployed policy with the application; do not prescribe a broken static CSP or use broad unsafe exceptions without evidence. Browser history, URLs, persistent storage, crash reports, and third-party analytics must not receive wallet input by default.

## Privacy and retention

No account or proof of address ownership is needed. Submitting an address causes the API and configured RPC provider to process reads concerning that address. Following explorer links contacts another provider. Explain this behavior and the scope of local/server retention in later product text without adding an unnecessary consent flow.

Set scan responses to `no-store`; do not use CDN caching, Next.js result caching, service-worker caching, or localStorage for wallet results. Browser in-memory results are discarded on navigation/reload; replacement results must not be attached to a new wallet while an older request completes. The baseline has no scan history or durable wallet database.

Demo mode is explicit in every response and user-facing explanation. Never fabricate live results, silently substitute fixtures after an RPC failure, or portray synthetic addresses as actual contract deployments.

## Risk interpretation

The [risk policy](data-model.md) is deterministic and versioned. Unlimited allowance is a broad permission, not evidence of malice. Unknown identity is missing context, not a maliciousness label. Verified identity does not lower exposure level. A small or inactive permission does not certify a wallet, contract, or overall approval set as safe. No monetary exposure estimate is returned.

Do not call the API an audit or promise complete approval discovery. Explanations must distinguish inactive, unreadable, active, and uncovered permissions, plus live versus synthetic data. A zero balance does not revoke approval or prevent future exposure after deposits.

## Security review gate

Stage 02 evidence is recorded in the [blockchain verification record](../features/stages/02-blockchain-integration.md#verification-record--2026-11-18): bounded read-only RPC destinations/methods, chain/snapshot checks, bigint validation, metadata bounds, abort/permit cleanup, readiness and safe field codes have deterministic adapter/HTTP tests. This is not the Stage 05 security review. Stage 03 verifies public scan rate limits, strict request/response schemas, exact risk rules, proxy identity, bounded limiter state, HTTP disconnects, safe errors/logs and generated OpenAPI; see its [verification record](../features/stages/03-backend-and-risk-analysis.md#verification-record--2026-11-19). Stage 04 adds tested text-only metadata rendering, fixed-origin isolated explorer navigation, runtime schema compatibility errors, precise values, stale/cancelled request rejection, explicit partial/unknown/demo disclosures, deliberate rate-limited retries and memory-only browser state; see its [verification record](../features/stages/04-frontend-integration.md#verification-record--2026-11-19). Production browser artifacts were checked for server-only configuration names. The Stage 05 review is recorded below. The optional live provider/bytecode check was not run without credentials.

Stage 05 records tested controls and remaining limitations below. At minimum review validation, proxy header handling, RPC destinations, cancellation and permit cleanup, error redaction, metadata rendering, exact arithmetic, secret exposure in frontend builds, schema drift, and all safety/coverage language. No funded account, signature, approval, or transfer is needed for verification.

Stage 06 repeats only deployment-specific checks: HTTPS and headers, private service boundaries, environment injection, log retention, single-replica limits, production demo labeling, container users, and CI permissions. See [testing/security stage](../features/stages/05-testing-and-security.md) and [release stage](../features/stages/06-deployment-and-release.md).


## Stage 05 review — 2026-11-19

This is a source review and deterministic verification of the implemented MVP, not a third-party audit or security certification. The complete test inventory, clean-install evidence and release commands are in [Stage 05](../features/stages/05-testing-and-security.md#test-inventory-and-review-evidence--2026-11-19).

### Findings and remediation

1. **Risk payload consistency.** The shared response schema previously checked shape, activity and some signal ordering/parameters, but could accept an incorrect exposure level or omitted required signal. The unchanged pure `mvp-1` function now lives in `packages/contracts/src/risk.ts`; the backend calls it through its existing module and the wire schema checks the full assessment against the raw allowance, balance and identity. Browser validation rejects drift without replacing the returned result. No RPC/retrieval code moved into contracts and no heuristic threshold/version changed. Boundary tables remain independent expected-value assertions, and malformed raw strings cannot cause an unchecked bigint conversion.
2. **Browser policy absent.** The production page previously relied on text rendering without a CSP. Next `src/proxy.ts` now generates a fresh cryptographic 128-bit nonce per HTML response and overwrites caller-supplied CSP/nonce headers. The root layout uses dynamic rendering so Next can nonce framework scripts and styles. Production scripts have neither `unsafe-inline` nor `unsafe-eval`; connections, fonts and images are same-origin, and objects, base overrides, framing and inline style attributes are blocked. Decorative bar heights moved from inline style attributes to CSS. Global `nosniff`, `no-referrer`, `DENY` and disabled unused device permissions accompany the policy. The implementation follows [Next 16 nonce/dynamic-rendering guidance](https://nextjs.org/docs/app/guides/content-security-policy). Chromium verified hydration, real scan interaction, fresh nonces, no legitimate initial policy violations, blocked parser-inserted script and blocked off-origin fetch. Development-only eval/WebSocket exceptions are not emitted in production.
3. **Local build context missing a required source file.** `.dockerignore` excluded all documentation while the implemented frontend imports `docs/design/variables.css`. It now includes that file alone from the design pack. The existing local web Docker target built successfully; a network-disabled, read-only one-shot container confirmed non-root execution, required CSS availability and exclusion of Git, actual environment files and the other design exports. Production image design remains Stage 06.

### Verified controls

- Shared strict request validation and byte limits reject caller-controlled work expansion before reader invocation. All documented API error codes/statuses, health exceptions, outgoing no-store/UUIDs, complete/partial counts and safe error logs have executable assertions. Corrupt reader source, wallet, registry, tuple or token sets fail closed and free admission capacity.
- Real viem adapter tests pin reads to the finalized snapshot and verify chain/freshness rejection, shared-token deduplication, revert/decode/metadata failures, maximum values, throttling, retry/response limits, scheduling and cancellation. Added envelope/quantity cases cannot trigger hidden deterministic-error retries or preserve raw provider text. Fake clocks drive domain deadlines/rate windows; local socket tests verify actual transport abort behavior.
- The real browser → Next proxy → Nest limiter path was tested with trusted loopback CIDRs. Different forged `X-Forwarded-For`, `Forwarded` and `X-Real-IP` values still exhaust one peer bucket. Direct trusted-header extraction and first-untrusted-hop behavior are tested separately. The default remains empty proxy trust; no original-client trust was added to the browser proxy.
- New isolated browser pairs inject fixed synthetic readers before listening and expose no test-control HTTP route or application setting. Inactive, partial, unknown allowance/decimals, max uint256, safe metadata, exact sorting/filtering and provider-error cases cross the real applications. Cancel and document navigation reach the reader and return in-flight scan capacity to zero. Existing stale-response, coverage change/failure, schema drift and retry-delay checks remain.
- Metadata is React text, with no HTML sink or remote asset loading. Explorer destinations are constructed from validated addresses on fixed HTTPS Etherscan; opener/referrer isolation and disabled demo navigation are verified. Review retained explicit bounded coverage, synthetic/live source, snapshot age, unknown versus inactive and heuristic limitations. No wallet connection, signing, writable ABI use, analytics or durable wallet storage was added.
- Production smoke inspected browser artifacts for server-only configuration/dependencies and the test launcher. A clean production build received a synthetic RPC credential sentinel; browser output contained neither that value nor the server configuration names. Startup/error-log redaction tests include provider URL/wallet sentinels. Only safe `.env.example` files are tracked; the local image excludes environment files. No real credential was used.
- With Node `24.16.0` / pnpm `12.21.0`, clean locked installation, lint, formatting, strict types, **126 unit/HTTP tests**, both production builds, **20 Chromium tests**, production smoke and identical OpenAPI regeneration passed. `pnpm audit --json` returned zero advisories for the locked tree (576 dependency entries reported), with no upgrades needed. Advisory data is time-dependent and does not cover unknown vulnerabilities or all container OS packages. Installed ESLint 9 remains the documented compatibility choice; production packaging/toolchain maintenance is still a release responsibility.

### Residual limits and release dependencies

Coverage remains the configured registry, not a wallet-wide approval inventory. The configured provider and contract responses remain trusted; finalized-state lag, exceptional finality failures, upgradeable spender behavior and heuristic classifications remain material limits. No proof verification, independent provider consensus or contract audit was performed. No live RPC/bytecode smoke ran because credentials were unavailable.

Limits and admission are process-local for one replica. The web proxy intentionally shares a peer bucket until a chosen host supplies a documented and tested ingress identity chain. Platform logs, TLS termination, access-log retention, HSTS and final deployed header preservation require Stage 06 validation. No host, CI workflow, public deployment or release image was created.

Nonce-based HTML is dynamically rendered and not cacheable; preserve this behavior through the eventual CDN/host. No CSP report collector or crash telemetry was added because scan context must not enter new logs/services by default; violations were observed locally in tests. Trusted Types enforcement and cross-origin isolation were not enabled without framework-specific compatibility evidence; text-only rendering, strict script nonces and same-origin CSP source restrictions remain the tested defenses. Development-only tooling exceptions are separate from the production policy. Firefox/WebKit, human assistive-technology testing and external penetration testing remain unperformed. The automated axe and responsive checks are limited evidence, not universal accessibility claims.

## Stage 06 local release review — 2026-11-19

The owner selected production artifacts and instructions only. [Stage 06 evidence](../features/stages/06-deployment-and-release.md#verification-record--2026-11-19) records the checked local image identifiers; [deployment operations](../DEPLOYMENT.md) records runtime injection, trust, logs, health, rotation and rollback. There is no public host/domain or release tag. Historical Stage 05 deployment dependencies above are superseded only where this record explicitly supplies evidence.

- Multi-stage images use the verified Node base digest and frozen dependencies; API runtime excludes development dependencies, and Next runtime uses prepared standalone output. Both run as UID/GID 1000. Production Compose enforces a read-only root, tmpfs, dropped capabilities, no new privileges, private API and one replica. The standalone entry point reuses startup validation before the server listens; its required dependency is explicitly packaged.
- Synthetic credential files were present in the build workspace but excluded from images. All runtime layers, configuration/history and browser artifacts passed sentinel inspection; invalid runtime configuration and application logs did not echo sentinels or scanned demo addresses. No real credential was used. Build-cache stages were not exported for external sharing; no build step receives actual credentials or copies environment files.
- Real production-container browser/HTTP checks preserve nonce/no-store headers, unknown versus inactive results, unavoidable demo labels and suppressed demo explorer links. Empty proxy trust and header stripping withstand forged identities through the real proxy; the resulting shared-peer quota is explicitly documented, not described as per-browser protection.
- API termination stops admission/probes immediately, aborts work and bounds cleanup by eight seconds before the ten-second container grace. Process tests cover both cooperative cancellation and an uncooperative test-only reader; container tests check API success exit 0 and Next's documented-in-source SIGTERM cleanup exit 143. A network-isolated live API keeps liveness while readiness fails, without demo substitution or a probe-triggered restart policy.
- CI source review checked fork triggers, expression injection, permissions, pinned actions, credentials and outputs, with no actionable findings. Required jobs have no RPC/deployment secret dependency and upload no artifacts. Their scripts passed locally; a hosted GitHub run is still outstanding. Review updates through Dependabot; base/image advisory status is not implied by digest pinning.

TLS/HSTS, certificate renewal, real ingress preservation, public metadata/explorer behavior, platform retention and a rollback between released versions remain unverified. Docker logs have bounded size rotation; a seven-day time retention policy requires host configuration and has not been asserted. Live RPC smoke, remote CI and a reachable public demo remain release dependencies. No signing, transaction, wallet connection, persistence or authentication capability was added.

### Follow-up review corrections

The [follow-up Stage 06 review](../features/stages/06-deployment-and-release.md#follow-up-review--2026-11-19) corrected a credential-handling documentation gap: `infra/previous.env` was not Git-ignored. Rollback now uses `infra/.env.previous`; both Git and Docker context exclude `*.env` and `.env.*`, while the safe templates remain tracked. Runtime layer checks cover both filename forms with synthetic credentials. This prevents the documented backup workflow from accidentally staging a provider URL; it is not evidence of an actual credential leak.

API startup errors after initialization now abort/dispose background readiness and close the app under the existing eight-second bound instead of leaving a failed process alive. A real occupied-port regression uses a local provider stub with network access disabled and confirms exit 1 and redaction. Container teardown now removes attached extras before its network, verifies resource absence and fails on cleanup errors. Normal and intentionally failing smoke paths were exercised; previously leaked empty test networks were individually removed. No persistence or public deployment was affected.

CI also includes the Stage 05 `pnpm audit --json` advisory lookup. The local lookup returned zero advisories for 576 dependency entries on 2026-11-19; this is time-dependent advisory data, not a security certification. Required deterministic suites and container checks passed again. No RPC credential, public host, published image or remote CI run was introduced.
