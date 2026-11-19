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

Stage 02 evidence is recorded in the [blockchain verification record](../features/stages/02-blockchain-integration.md#verification-record--2026-11-18): bounded read-only RPC destinations/methods, chain/snapshot checks, bigint validation, metadata bounds, abort/permit cleanup, readiness and safe field codes have deterministic adapter/HTTP tests. This is not the Stage 05 security review. Stage 03 verifies public scan rate limits, strict request/response schemas, exact risk rules, proxy identity, bounded limiter state, HTTP disconnects, safe errors/logs and generated OpenAPI; see its [verification record](../features/stages/03-backend-and-risk-analysis.md#verification-record--2026-11-19). Stage 04 adds tested text-only metadata rendering, fixed-origin isolated explorer navigation, runtime schema compatibility errors, precise values, stale/cancelled request rejection, explicit partial/unknown/demo disclosures, deliberate rate-limited retries and memory-only browser state; see its [verification record](../features/stages/04-frontend-integration.md#verification-record--2026-11-19). Production browser artifacts were checked for server-only configuration names. The broader Stage 05 review is still pending. The optional live provider/bytecode check was not run without credentials.

Stage 05 must record tested controls and remaining limitations in this document. At minimum review validation, proxy header handling, RPC destinations, cancellation and permit cleanup, error redaction, metadata rendering, exact arithmetic, secret exposure in frontend builds, schema drift, and all safety/coverage language. No funded account, signature, approval, or transfer is needed for verification.

Stage 06 repeats only deployment-specific checks: HTTPS and headers, private service boundaries, environment injection, log retention, single-replica limits, production demo labeling, container users, and CI permissions. See [testing/security stage](../features/stages/05-testing-and-security.md) and [release stage](../features/stages/06-deployment-and-release.md).
