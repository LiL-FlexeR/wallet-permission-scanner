# REST API Design

## Contract conventions

Planned base path: `/api/v1`. JSON uses camelCase and UTF-8. Schemas in `packages/contracts` are the implementation source of truth; this document fixes intended behavior. API evolution must update schemas, tests, OpenAPI, these docs, and affected stage specifications together.

- `Content-Type: application/json` for scan requests; maximum body size 1 KiB. Reject unknown body properties and all undocumented query parameters.
- Canonical EIP-55 addresses in responses; input normalization follows [blockchain integration](blockchain-integration.md).
- Token amounts and block numbers are canonical base-10 strings, never JSON numbers. Hashes are 32-byte hex strings. Timestamps are ISO-8601 UTC; provenance review dates use `YYYY-MM-DD`.
- Generate a server request UUID and return `X-Request-Id` on every response. Do not trust client-supplied request IDs. Scan and error bodies contain the same `requestId`; simpler health and coverage bodies use the header only.
- All scan responses, including errors, use `Cache-Control: no-store`; browser requests also bypass caching. No cookies or authentication are required.
- No pagination: the supported set is bounded. No address in the URL, no stored scan ID, no polling/job endpoint, and no history endpoint.

## Endpoint inventory

| Method | Path | Purpose | Query / body | Success |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/scans` | Execute one bounded configured-pair scan | No query; body `{ "address": "0x..." }` | `200` complete or partial scan |
| `GET` | `/api/v1/coverage` | Publish supported pair coverage and versions | No query or body | `200` registry description |
| `GET` | `/health/live` | Confirm API process can respond | No query or body | `200` liveness |
| `GET` | `/health/ready` | Report validated configuration and reader readiness | No query or body | `200` ready or `503` not ready |

Implement explicit method guards so unsupported methods return `405` with `Allow`; unknown routes return `404` using the error envelope. Stage 01 establishes health endpoints; Stage 02 adds blockchain readiness; Stage 03 adds the versioned application endpoints and consistent route errors.

## POST /api/v1/scans

### Request and validation

```json
{
  "address": "0x3333333333333333333333333333333333333333"
}
```

Require one string property `address`; trim outer whitespace, validate 20-byte hexadecimal form and mixed-case checksum, and reject zero. ENS names, arrays, alternate chains, user-selected token/spender lists, block numbers, RPC URLs, and unknown keys are rejected before chain work. Limit the untrimmed address field to 128 characters. Do not require a nonzero token balance or account history.

### Success schema

| Field | Type / behavior |
| --- | --- |
| `requestId` | Server UUID |
| `source` | `live` or `demo`; no automatic substitution |
| `chainId` | Literal `1` |
| `walletAddress` | Normalized input address |
| `status` | `complete` or `partial` according to field-read outcomes |
| `registryVersion` | Registry used for this request |
| `riskPolicyVersion` | Literal `mvp-1` for initial policy |
| `startedAt`, `completedAt` | Request scan timestamps |
| `snapshot` | Block identity defined in [data model](data-model.md); demo values are synthetic |
| `coverage` | `strategy: configured-pairs`, `limitation: string`, `configuredPairs`, `checkedPairs`, `failedPairs`: integers |
| `summary` | `active`, `inactive`, `unknown`: integer record counts |
| `permissions` | One `PermissionRecord` per configured pair, in stable lexicographic ID order |
| `warnings` | `FieldWarning[]`; deterministic order by pair ID, then allowance/balance/name/symbol/decimals |

`checkedPairs` counts successful allowance reads only, including zero. `failedPairs` counts unreadable allowances. Their sum equals `configuredPairs`, which equals `permissions.length`. `summary.active + summary.inactive == checkedPairs`; `summary.unknown == failedPairs`. Metadata failure can make a scan partial even when `failedPairs` is zero.

`complete` requires successful allowance, balance, name, symbol, and decimals reads for all records, with no field warnings. Unknown spender identity is informational, not a failed read. `partial` requires at least one successful allowance and at least one field failure. Schedule all fields subject to the shared budget; unscheduled/cancelled fields receive deadline failure warnings. A complete result with `active: 0` means no active permissions in the configured set. An unknown record must never appear as an inactive permission or a clean result.

`PermissionRecord` has the following required fields (nullable values remain present):

| Field | Schema |
| --- | --- |
| `id` | `1:<lowercase-token>:<lowercase-spender>` |
| `token` | `{ address, name: string\|null, symbol: string\|null, decimals: integer\|null, explorerUrl }` |
| `spender` | `{ address, label: string\|null, identity: verified\|unverified, identitySourceUrl: string\|null, identityReviewedAt: string\|null, explorerUrl }` |
| `allowance`, `balance` | `{ raw: string, formatted: string\|null }` or `null` |
| `activity` | `active`, `inactive`, or `unknown` |
| `risk` | `{ level: none\|low\|medium\|high\|unknown, assessment: complete\|limited\|unavailable, signals: RiskSignal[] }` |

Every `RiskSignal` has `code`, `severity: info|low|medium|high`, and code-specific `parameters`. The exact signal union and algorithm are specified in the [risk policy](data-model.md). No numeric risk score or reputation field exists.

Every `FieldWarning` has `pairId`, `field: allowance|balance|name|symbol|decimals`, and one of these codes:

| Code | Meaning |
| --- | --- |
| `CONTRACT_REVERT` | Contract rejected the read |
| `RPC_TIMEOUT` | Individual read attempts timed out |
| `PROVIDER_RATE_LIMITED` | Provider throttled the read and no in-budget retry succeeded |
| `RPC_UNAVAILABLE` | Other sanitized upstream availability failure |
| `INVALID_RETURN_DATA` | ABI decoding, amount range, or metadata validation failed |
| `DEADLINE_EXCEEDED` | Scan budget ended before the field could be resolved |

Repeat shared token-field warnings for each affected pair so each record's missing fields can be interpreted independently. Do not expose raw exception strings.

### Example response

This is a synthetic one-pair demo fixture illustrating the full schema; it is not a real deployment or a live blockchain observation. The initial live registry will contain at least three reviewed pairs.

```json
{
  "requestId": "6e61365b-d1c1-4fb7-9680-9bfbe99d120e",
  "source": "demo",
  "chainId": 1,
  "walletAddress": "0x3333333333333333333333333333333333333333",
  "status": "complete",
  "registryVersion": "demo-1",
  "riskPolicyVersion": "mvp-1",
  "startedAt": "2026-11-18T12:00:00.000Z",
  "completedAt": "2026-11-18T12:00:00.050Z",
  "snapshot": {
    "blockNumber": "24000000",
    "blockHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "blockTimestamp": "2026-11-18T11:48:00.000Z",
    "finality": "finalized"
  },
  "coverage": {
    "strategy": "configured-pairs",
    "limitation": "Only configured token/spender pairs are checked; other permissions may exist.",
    "configuredPairs": 1,
    "checkedPairs": 1,
    "failedPairs": 0
  },
  "summary": { "active": 1, "inactive": 0, "unknown": 0 },
  "permissions": [
    {
      "id": "1:0x1111111111111111111111111111111111111111:0x2222222222222222222222222222222222222222",
      "token": {
        "address": "0x1111111111111111111111111111111111111111",
        "name": "Synthetic Demo Token",
        "symbol": "DEMO",
        "decimals": 6,
        "explorerUrl": "https://etherscan.io/token/0x1111111111111111111111111111111111111111"
      },
      "spender": {
        "address": "0x2222222222222222222222222222222222222222",
        "label": null,
        "identity": "unverified",
        "identitySourceUrl": null,
        "identityReviewedAt": null,
        "explorerUrl": "https://etherscan.io/address/0x2222222222222222222222222222222222222222"
      },
      "allowance": { "raw": "200000000", "formatted": "200" },
      "balance": { "raw": "10000000", "formatted": "10" },
      "activity": "active",
      "risk": {
        "level": "medium",
        "assessment": "complete",
        "signals": [
          { "code": "ACTIVE_ALLOWANCE", "severity": "low", "parameters": { "allowanceRaw": "200000000" } },
          { "code": "LARGE_RELATIVE_TO_BALANCE", "severity": "medium", "parameters": { "allowanceRaw": "200000000", "balanceRaw": "10000000", "multiplier": 10 } },
          { "code": "UNVERIFIED_SPENDER", "severity": "info", "parameters": {} }
        ]
      }
    }
  ],
  "warnings": []
}
```

Demo explorer links follow the same schema but must be presented as synthetic addresses, with no suggestion of actual token deployments. The browser may suppress their navigation in demo mode. A live response uses `source: live`, the actual registry version, and actual snapshot data.

### Partial and total failure behavior

- One failed allowance plus another readable allowance: `200 partial`; failed record has null allowance, unknown activity and risk, an unavailable assessment, and an allowance warning.
- Balance failure: keep readable allowance; active risk is limited and never assumes zero balance. A zero allowance remains none/complete for risk purposes.
- Metadata failure: retain raw values; if decimals failed, formatted amounts are null. Risk still uses raw units.
- Total deadline with at least one readable allowance: `200 partial`; mark remaining fields `DEADLINE_EXCEEDED`.
- All allowances failed: error envelope with `503 RPC_UNAVAILABLE`, or `504 SCAN_TIMEOUT` if the overall deadline expired. Do not return an empty success.
- Any preflight failure: no permission results. Return the appropriate structured error below.

## GET /api/v1/coverage

Return `chainId: 1`, `source: live|demo`, `registryVersion`, `riskPolicyVersion`, `strategy: configured-pairs`, `limitation`, `configuredPairs`, and `pairs`. Each pair contains `id`, `tokenAddress`, and the same `spender` metadata object used by a permission record. No wallet state or live token metadata is fetched here. Validation rejects query parameters and bodies; registry invalidity prevents readiness and returns `503 SERVICE_NOT_READY`. This endpoint has no RPC dependency and uses `Cache-Control: no-store` initially to simplify mode/version changes.

Illustrative minimal demo response:

```json
{
  "chainId": 1,
  "source": "demo",
  "registryVersion": "demo-1",
  "riskPolicyVersion": "mvp-1",
  "strategy": "configured-pairs",
  "limitation": "Only configured token/spender pairs are checked; other permissions may exist.",
  "configuredPairs": 1,
  "pairs": [
    {
      "id": "1:0x1111111111111111111111111111111111111111:0x2222222222222222222222222222222222222222",
      "tokenAddress": "0x1111111111111111111111111111111111111111",
      "spender": {
        "address": "0x2222222222222222222222222222222222222222",
        "label": null,
        "identity": "unverified",
        "identitySourceUrl": null,
        "identityReviewedAt": null,
        "explorerUrl": "https://etherscan.io/address/0x2222222222222222222222222222222222222222"
      }
    }
  ]
}
```

On a successful scan, its embedded registry version and coverage are authoritative even if the registry changed after the browser loaded coverage. Refresh coverage after a version mismatch; do not reinterpret old results with a new registry.

## Health endpoints

`GET /health/live`: no request body or query; `200 {"status":"ok"}`. No RPC, database, provider URL, or build-secret information is exposed. Expected validation failures use the common `400` envelope; internal errors use `500`.

`GET /health/ready`: no body or query; `200` example:

```json
{ "status": "ready", "mode": "live", "checks": { "configuration": "ok", "blockchain": "ok" } }
```

`503` example:

```json
{ "status": "not_ready", "mode": "live", "checks": { "configuration": "ok", "blockchain": "unavailable" } }
```

Configuration must validate before serving; the registry and reader must initialize. Stage 01 reports blockchain as `not_required` until the reader exists. From Stage 02, live readiness uses a background probe of chain ID and a sufficiently recent finalized block, every 30 seconds, with at most one probe running and a six-second total probe budget. No retries; each attempt is limited to three seconds. Probe traffic uses the global RPC permits. A missing or older-than-60-second successful probe is not ready. Demo reports `blockchain: not_required`. Health requests read cached probe state and do not trigger RPC calls. This Stage 02 behavior is implemented; a failed probe invalidates readiness immediately, and the first live response may be unavailable while initialization is probing. A successful readiness probe does not guarantee every token call will succeed.

Health endpoints are internal deployment probes by default and intentionally use their small status shape for not-ready responses rather than the application error envelope. Route validation still uses the standard envelope. Expose no stack traces or provider details.

## Error envelope and statuses

```json
{
  "requestId": "6e61365b-d1c1-4fb7-9680-9bfbe99d120e",
  "error": {
    "code": "INVALID_ADDRESS",
    "message": "Provide a valid nonzero Ethereum address.",
    "retryable": false,
    "details": [{ "field": "address", "issue": "invalid_format_or_checksum" }]
  }
}
```

`details` is optional and limited to a documented field path and safe issue code; never echo rejected values. All error messages come from server-controlled text.

| HTTP | Error code | Condition | Retryable |
| --- | --- | --- | --- |
| `400` | `INVALID_REQUEST` | Malformed JSON/schema, unknown query/key | false |
| `400` | `INVALID_ADDRESS` | Address format, checksum, zero-address failure | false |
| `404` | `NOT_FOUND` | Unknown route | false |
| `405` | `METHOD_NOT_ALLOWED` | Known route, unsupported method | false |
| `413` | `PAYLOAD_TOO_LARGE` | Body over 1 KiB | false |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | Scan body is not JSON | false |
| `429` | `RATE_LIMITED` | Caller exhausted application request quota | true |
| `503` | `SCAN_CAPACITY_EXCEEDED` | All process scan permits in use; no queue | true |
| `503` | `CHAIN_MISMATCH` | Provider is not mainnet | false |
| `503` | `SNAPSHOT_UNAVAILABLE` | Finalized block missing, stale, unsupported, or invalid | true |
| `503` | `RPC_UNAVAILABLE` | Preflight connectivity failure or all allowances unreadable before total deadline | true |
| `503` | `SERVICE_NOT_READY` | Validated registry/reader unavailable | true |
| `504` | `SCAN_TIMEOUT` | Total scan deadline without a readable allowance | true |
| `500` | `INTERNAL_ERROR` | Unexpected application error | false |

Provider HTTP `429` is not relayed as caller `429`: it becomes a field warning, or `503 RPC_UNAVAILABLE` if nothing can be read. `retryable` means a later attempt might work; it does not authorize automatic browser retry storms. A chain mismatch needs operator action. Partial failures do not change HTTP status from `200`.

## Budgets, limits, and cancellation

These are initial engineering limits, not measured throughput promises. Keep them in validated server configuration with tests. Changing risk thresholds requires a policy version; operational limit changes require docs and deployment review.

| Control | Baseline |
| --- | --- |
| Supported pairs / unique tokens | At most 20 / 5 |
| Scan deadline | 15 seconds from admission, including preflight, retries, and reads |
| Per-attempt RPC timeout | 3 seconds, shortened to remaining deadline |
| RPC retry | At most one for transient failures; bounded jitter around 200 ms |
| In-flight contract reads per scan | 4 |
| In-flight scans per API process | 4; no waiting queue |
| Process-wide in-flight RPC calls | 16, including probes |
| Scan rate | 10 requests per minute per trusted client IP |
| Coverage rate | 60 requests per minute per trusted client IP |
| Limiter state | At most 10,000 IP entries; expire after 2 idle minutes; reject new entries with `503 SCAN_CAPACITY_EXCEEDED` if full |
| Provider response body | Maximum 1 MiB per attempt |
| Browser / proxy timeout | 20 seconds / at least 25 seconds respectively |

Rate limiting occurs before expensive work, including for malformed scan attempts that reach the route. Use separate per-route counters. `429` includes integer `Retry-After` seconds until quota reset; busy `503` includes `Retry-After: 1`. Do not automatically reissue browser scan requests. Time-window and counter behavior must be deterministic and tested with a fake clock.

Use abort-aware upstream transport and bounded scheduling. Stop scheduling on deadline or disconnect, mark unresolved fields, and release permits only after in-flight work is aborted/settled. A browser cancellation may not reach every proxy immediately; the API deadline is the final bound. Graceful shutdown stops admission, aborts remaining work within the shutdown budget, and releases resources.

## API documentation and integration

Stage 03 generates and validates OpenAPI from shared schemas, with the success, partial, validation, provider, and rate-limit examples above. Provide `/api/openapi.json` and `/api/docs` in development/test only by default; their content is documentation, not additional business APIs. Production can publish a reviewed static schema artifact without exposing interactive tooling.

The web application uses same-origin `/api/v1/*`, validates response payloads at runtime, and treats unknown schema versions or malformed responses as integration errors. A frontend layout is not part of this contract. See [Stage 03](../features/stages/03-backend-and-risk-analysis.md) and [Stage 04](../features/stages/04-frontend-integration.md).
