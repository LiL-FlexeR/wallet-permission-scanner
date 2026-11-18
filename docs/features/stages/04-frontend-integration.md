# Stage 04 — Frontend Integration

## Objective

Integrate the Next.js frontend with the scan API so users can submit a public address, interpret supported permissions, and filter/sort results without losing precision or concealing incomplete data. This specification defines functionality and data flow only.

## Prerequisites

- [Stage 03](03-backend-and-risk-analysis.md) is complete, including shared schemas, deterministic response fixtures, documented errors, and rate limits.
- Read the [API contract](../../architecture/api-design.md), [risk rules](../../architecture/data-model.md), [frontend responsibilities](../../architecture/project-structure.md), and [security requirements](../../architecture/security.md).
- Read the root [agent instructions](../../../AGENTS.md) and the owner's supplied Refero pack: [DESIGN.md](../../design/DESIGN.md), [tokens.json](../../design/tokens.json), [variables.css](../../design/variables.css), and [theme.css](../../design/theme.css). All four files are now present and form the visual reference context. Read additional surface-specific materials when supplied.
- Treat the pack as extracted reference material for the scanner, not a requirement to reproduce Base's product, branding, sample metrics, or chain support. Reconcile consequential conflicts in extracted roles/measurements before applying them; no visual direction is invented by this stage document.
- If references are unavailable, proceed only with agreed non-visual work: API client, schemas, state management, data transformations, and their tests. Report the missing visual dependency, keep visual acceptance outstanding, and do not invent a design or mark the whole stage complete.

## Scope

Address validation, deliberate scan initiation, typed API communication, request lifecycle, result interpretation, filtering/sorting, safe explorer navigation, coverage/freshness/risk explanations, and functional loading/empty/error behavior. Tailwind CSS, shadcn/ui, and Lucide are available implementation choices within the requested stack once the visual references are supplied; this document does not prescribe their composition.

## Technical Requirements

### Required functionality

- Accept a public address using the same normalization/checksum rule as the backend. Reject invalid input locally and still handle authoritative server validation.
- Load `/api/v1/coverage` and its limitations. A failed coverage request must have an explicit retry/error path; scan responses themselves contain authoritative coverage.
- Submit only `{address}` to `/api/v1/scans`. Do not connect an injected wallet or invoke any signature API.
- Associate results with the normalized address actually scanned, not text the user may subsequently edit.
- Make current allowance, balance, token/spender identity, activity, risk level, assessment limits, structured explanations, coverage, snapshot, and live/demo source available to the user.
- Explain that identity verification is not a safety endorsement and that unknown readings are not inactive permissions.
- Expose filtering by token address, spender address, activity, and risk level; combine selected filters conjunctively. Default to all returned records so failures and inactive permissions remain inspectable.
- Support stable sorting by risk level, token address, and spender address. Risk descending order is high, medium, low, none, unknown, with ID as a tie-breaker; unknown means unavailable, not safer.
- If amount sorting is offered, restrict it to a single selected token and compare raw strings as bigint. Do not compare token quantities across different assets. Null values remain last in either direction.
- Construct or validate fixed-origin explorer links from backend addresses; demo addresses must be identified as synthetic and may have navigation suppressed.

### API communication and types

Use relative same-origin `/api/v1/*` requests through the existing proxy. Import shared runtime schemas and inferred types; validate actual response bodies, not just TypeScript casts. Use `cache: no-store`, JSON bodies, a 20-second browser timeout, and `AbortController`. Do not automatically retry scans, switch to fixtures, or refresh on window focus.

Preserve `requestId` for error support without exposing raw traces. Handle non-JSON or malformed responses as integration failures. A `200 partial` is a usable incomplete result; a `503`/`504` is not an empty result. Read `Retry-After` on `429` or busy `503` and prevent immediate repeat submission until the indicated time. Permit later deliberate retry.

Use the scan's own registry/policy version when interpreting records. If coverage versions differ, refresh coverage without mutating already displayed scan data. Do not apply current registry metadata to an older response or recalculate backend risk in the browser. An unknown signal/schema version must trigger an explicit compatibility issue, not a guessed safety explanation.

### State management

Keep state local to the scanner feature with React state/reducer and derived selectors. A global state library, persistent store, or data-fetching framework is not required. Separate:

- Editable input and client validation result.
- Pending request identity, normalized submitted address, cancellation, and timeout.
- Last accepted scan response and independent coverage result.
- Recoverable error, retry availability time, and request ID.
- Filter/sort settings and derived records.

Use an explicit idle/loading/success/error lifecycle; success contains complete or partial data. Abort a previous submission when a new one begins, clear data that could be mistaken for the new wallet's result, and use a monotonically increasing request token to ignore stale completions even if cancellation is delayed. Abort on unmount. Do not store addresses/results in URLs, localStorage, analytics, or browser history by default.

### Functional states and interactions

Specify behavior, with visual expression deferred to supplied references:

- Idle: no result or implied clean scan before submission.
- Invalid input: explain validation failure and make no scan call.
- Loading: expose in-progress status and avoid duplicate submissions.
- Complete with zero active permissions: explain the configured coverage and snapshot; inactive records remain available.
- Partial: expose warnings and unknown records; do not describe the wallet as having no permissions when some reads failed.
- No matching filter results: distinguish this from a scan with no active permissions.
- Request failure: safe explanation, relevant retry behavior, and request ID; no fabricated records.
- Demo: explicitly identify synthetic data and avoid live-observation claims.

Support keyboard submission, accessible names, discoverable validation errors, and programmatically available progress/error changes. Exact markup and presentation follow later references and accessibility review; this specification does not define a component arrangement.

## Implementation Tasks

- [ ] Confirm the API/shared schema and deterministic fixtures from Stage 03; read all four supplied docs/design files and identify any unresolved decisions affecting the requested surface before visual work.
- [ ] Implement a small API client with schema validation, no-store behavior, timeout/abort, error parsing, and retry-delay handling.
- [ ] Implement address input normalization tests, request state/reducer, stale-response protection, and independent coverage loading.
- [ ] Implement pure record filters and stable sort selectors with bigint comparisons only where token units match.
- [ ] Implement code-to-explanation mappings for every `mvp-1` signal and assessment state; test consistency with backend fixtures.
- [ ] Test non-visual integration against deterministic API responses. If references are absent, stop dependent visual work here and report the outstanding requirement.
- [ ] Once references are supplied, implement the user-facing functionality using them as the visual source of truth; do not derive a new design from this document.
- [ ] Integrate coverage/snapshot/source information, allowance and balance values, field warnings, unknown states, filters/sorting, and safe explorer links.
- [ ] Add functional interaction and browser tests for success, inactive-only, partial, failure, filtering, invalid input, cancellation, and rate-limit retry.
- [ ] Verify browser bundles/configuration contain no RPC credentials or backend-only modules, and update real usage instructions.

Data client and state work can run without visual references; user-facing implementation and visual acceptance cannot.

## Expected Files and Modules

- `apps/web/src/features/scanner/api-client.ts`, request state/reducer or hook, selectors, signal explanations, and their tests.
- App Router integration in `apps/web/src/app/` only after supplied design references are available.
- Shared contract imports rather than copied response interfaces.
- Functional tests using synthetic shared fixtures; later browser tests in `tests/e2e/`.
- Preserve the existing `docs/design/` exports. Application-specific token mappings/imports belong in the frontend when implementation is authorized; this stage specification does not create another visual design document or a competing token source.

## API Contracts

Consume the [scan and coverage endpoints](../../architecture/api-design.md). No new backend endpoint is needed. Distinguish complete/partial success and all documented error codes. Browser requests contain no chain choice, token list, wallet signature, or RPC credential. A schema mismatch is an integration error, even if the HTTP request returned `200`.

## Data Models

Use shared `ScanResponse`, `PermissionRecord`, `RiskAssessment`, `FieldWarning`, `CoverageResponse`, and `ApiError` types derived from runtime schemas. Browser-derived state may include filter values, sort direction, request token, and retry timestamp. Keep amounts as string-backed values or bigint for comparison; do not convert raw values to floating-point numbers. Do not add browser-side risk scores or persistent wallet entities.

## Edge Cases

- Input changes while a scan runs; rapid submissions; old response arrives after new response; navigation during a request.
- Browser timeout before proxy notices cancellation; non-JSON gateway error; response incompatible with shared schema.
- Partial scan with all readable allowances zero and at least one unknown pair; no overall clean-state claim.
- Missing decimals, token name/symbol absent, unreadable balance, unverified identity, unknown signal code.
- Large integer values, repeated token symbols across addresses, and stable ordering with equal risk.
- Empty filter result versus inactive-only scan; null amounts in either sort direction.
- Rate-limit countdown, busy API, offline state, and explicitly selected demo mode.
- Coverage version changes between fetch and scan response.

## Security Considerations

Render chain metadata as text; validate explorer origins; use opener isolation/referrer protection for external navigation. Do not include wallet input in telemetry or URL navigation. No injected-provider access, signature prompt, transaction link, or revocation control. Keep privacy, heuristic limitations, finalized-block age, and bounded coverage understandable. Follow [security requirements](../../architecture/security.md) without inventing visual warning patterns.

## Testing Requirements

- Unit tests for request state transitions, stale-response rejection, filters/sorts, bigint values, and all signal explanations.
- API-client tests for valid complete/partial payloads, malformed JSON/schema, errors, timeout, abort, and retry headers.
- Functional tests for keyboard submission and accessible status/error behavior once user-facing implementation exists.
- Deterministic browser tests for the main input-to-result path and invalid/partial/rate-limited cases; no external RPC dependency.
- Production build verification for shared package compatibility and absence of secrets.

## Acceptance Criteria

1. Invalid input makes no scan call; valid input uses the exact API contract and displays data for the submitted wallet only.
2. All required states, field failures, source/coverage disclosures, and risk explanations remain available without independent frontend scoring.
3. Filtering/sorting preserves original data, stable IDs, precision, and unknown-state meaning.
4. Old or canceled requests cannot overwrite newer results; deliberate retries respect rate limits.
5. User-facing implementation follows supplied Refero references; if they are absent, non-visual work is verified and the stage remains explicitly incomplete.
6. No visual decisions are introduced by the planning specification and no secrets/signing enter browser code.

## Recommended Codex Skills

Catalog candidates for later implementation, subject to actual availability:

- `vercel-react-best-practices`: client boundaries, request behavior, render/data-flow efficiency, version-compatible patterns.
- `vercel-composition-patterns`: reusable interaction APIs only where complexity warrants them.
- `modern-web-guidance`: browser APIs, compatibility, and cancellation behavior.
- `shadcn`: component use after references are supplied and when compatible with the installed version.
- `web-design-guidelines`: accessibility and functional review against the eventual implementation.
- `frontend-design`: optional reference-guided implementation only after the visual materials exist; it must not invent an alternative direction or operate during this documentation task.
- `impeccable`: added by the owner's later installation request; optional critique, audit, and refinement of the implemented interface against supplied references, without introducing a new visual direction.

Check installation and read selected instructions before use; do not install automatically. The catalog's specialized Next.js Cache Components skills are not a reason to cache wallet results. Follow installed version documentation. The [project skills inventory](../../../skills.md) records the subsequently installed skills, including Impeccable and its reference-dependent usage boundaries.

## Definition of Done

All tasks and acceptance criteria, including reference-dependent implementation, are complete and tested. Record the supplied design references in implementation handoff notes without generating a design specification here. Update [roadmap progress](../ROADMAP.md). If visual references are missing, report completed non-visual work and the dependency; do not check off the stage or claim an end-to-end demonstrable interface.

## Out of Scope

Defining layouts, colors, typography, component arrangements, styling rules, design tokens, wireframes, or a design system in this specification. Also excluded: wallet connection, signing/revocation, authentication, persistent history, pricing, comprehensive discovery, and new backend risk rules.
