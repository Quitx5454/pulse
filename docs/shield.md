# Shield v2

Hardened x402 payment sanitization middleware.
Strips PII, binds signatures to the resource, locks nonces, enforces spending policy,
and leaves a tamper-evident audit trail — all before the payment settles.

**Endpoint:** `POST https://shield-agent-v2-production.up.railway.app/entrypoints/shield/invoke`
**Price:** 0.005 USDC/call
**Network:** Base Mainnet (eip155:8453)
**Stack:** Bun · Hono · Redis · viem (stateless, zero external inference)

---

## Why

Every x402 payment leaks data. The resource URL, description and metadata travel in
plaintext to the facilitator and the receiving server — emails, API keys and wallet
addresses sit in the payload before a cent moves.

And the payment itself can be attacked: the same authorization replayed twice, or a
signature lifted from one endpoint and pointed at another.

Shield sits between your agent and the payment and closes both gaps.

---

## The five layers

Every request runs through five middleware layers in order. Any layer can reject; the
request only reaches the sanitizer if all the guards pass.

| # | Layer | What it does | Rejects with |
|---|-------|--------------|--------------|
| 1 | **Nonce lock** | Pessimistic Redis lock on the payment nonce. A duplicate nonce in flight is caught instantly. | `429` (duplicate) · `503` (lock backend down, fail-closed) |
| 2 | **Context binding** | Recomputes `keccak256(url \| method \| bodyHash)` and checks it against the signed `resourceHash`, then verifies the EIP-712 signature. Swap the endpoint and it stops here. | `403` (resource mismatch) · `401` (bad signature) |
| 3 | **Policy engine** | Per-call cap (5 USDC) and a rolling 24h cap (50 USDC) tracked in real time, with a circuit breaker. | `403` (cap exceeded) · `429` (breaker tripped) |
| 4 | **PII scanner** | Strips PII from the request in under 5ms, zero external calls. | — |
| 5 | **Handler** | Sanitizes, issues the replay guard, returns the envelope. | `400` (invalid input) |

Wrapping all five: a **tamper-evident audit log** — every request is written as an
HMAC-SHA256 entry chained to the previous one, so any later edit or deletion breaks the
chain and shows.

`payment_requirements`, including `payTo`, is never touched by any layer.

---

## Two headers

Shield separates *paying for Shield* from *the payment Shield protects*. They ride on
different headers so the two never collide.

| header | purpose |
|--------|---------|
| `PAYMENT-SIGNATURE` | The x402 micropayment to **use** Shield (0.005 USDC, settled via the CDP facilitator). Standard x402 — any x402 client library sets this for you. |
| `X-Shield-Authorization` | The **downstream** EIP-712 `PaymentAuthorization` that Shield nonce-locks and context-binds. Base64 of the signed message + signature. |

### Building `X-Shield-Authorization`

Sign this EIP-712 typed payload with the payer key, then base64 the JSON:

```ts
const domain = { name: "Shield_x402_Middleware", version: "2.0", chainId: 8453 };
const types = {
  PaymentAuthorization: [
    { name: "amount",        type: "uint256" },
    { name: "nonce",         type: "uint256" },
    { name: "deadline",      type: "uint256" },
    { name: "payerAddress",  type: "address" },
    { name: "resourceHash",  type: "bytes32" },
  ],
};

// resourceHash binds the authorization to THIS exact call.
const bodyHash     = keccak256(toBytes(rawBody));               // the bytes you POST
const resourceHash = keccak256(toBytes(`${url}|POST|${bodyHash}`));
```

Then:

```
X-Shield-Authorization = base64(JSON.stringify({
  amount, nonce, deadline, payerAddress, resourceHash, signature
}))
```

> **`url` must be the resource exactly as the server sees it** — use the `resource.url`
> returned in the `402` challenge. Behind a TLS-terminating proxy that value is `http://…`,
> so signing `https://…` produces a `resourceHash` mismatch and a `403`. Use a fresh
> `nonce` per call (it's the lock key) and keep `amount` under the 5 USDC per-call cap.

---

## Important: call Shield BEFORE signing the downstream payment

```
Agent A → Shield (sanitize) → sign → Agent B
```

If you sign first and sanitize after, the EIP-712 signature breaks.

---

## Request

```json
{
  "request": {
    "url": "https://agent.com/api?company=Acme&email=user@acme.com",
    "description": "Research on Acme acquisition targets",
    "metadata": { "reason": "competitive analysis" }
  },
  "payment_requirements": {
    "scheme": "exact",
    "network": "eip155:8453",
    "maxAmountRequired": "5000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0x104b5768FE505c400dd98F447665CB5c6fca388A"
  }
}
```

## Response

Always wrapped in the Distill Standard Envelope (see below). The `output`:

```json
{
  "sanitized_request": {
    "url": "https://agent.com/api?company=[REDACTED]&email=[REDACTED]",
    "description": "Research on [REDACTED] acquisition targets",
    "metadata": { "reason": "competitive analysis" }
  },
  "replay_guard": {
    "nonce": "3273f0e2-...",
    "timestamp": "2026-06-06T...",
    "hmac_sha256": "9fa52805..."
  },
  "payment_requirements": { "...": "unchanged" },
  "shield_version": "2.0"
}
```

The `replay_guard` is an HMAC-SHA256 token binding the sanitized request to a fresh nonce,
timestamp and price — so the same payment can't be replayed against a mutated request.

---

## What gets redacted

The scanner is regex-only and ReDoS-safe. It redacts:

- Email addresses
- API keys (`sk-…`) and Bearer tokens
- JWTs
- Wallet addresses (`0x…`)
- IBANs
- US Social Security numbers
- IP addresses
- Phone numbers
- Company names (configurable list)

Only the **query parameters** of a URL are touched — scheme, host and path are preserved.
Metadata is sanitized recursively. `payment_requirements` (including `payTo`) is never touched.

---

## Spending policy

Backed by Redis, tracked in real time:

- **Per-call cap** — 5 USDC. A larger `amount` is rejected with `403` before processing.
- **Rolling 24h cap** — 50 USDC across the payer's window.
- **Circuit breaker** — repeated cap breaches short-circuit the wallet for a cooldown (`429`).

If Redis is unavailable, the policy and nonce layers fail **closed** (`503`) — Shield never
processes a payment it can't guard.

---

## Webhooks

Add an optional `callback_url` to the invoke body and Shield `POST`s the **same response
envelope** to that URL after processing. It's additive — the synchronous response is
unchanged — and validated **before** the paywall, so a malformed URL returns `400` without
a charge.

```json
{
  "request": { "url": "https://agent.com/api?email=user@acme.com" },
  "payment_requirements": { "...": "..." },
  "callback_url": "https://your-agent.com/webhooks/distill"
}
```

Every delivery carries these headers:

| header | value |
|--------|-------|
| `Content-Type` | `application/json` |
| `X-Distill-Event` | `shield.completed` · `shield.failed` |
| `X-Distill-Session-Id` | the `session_id` (Shield is synchronous — no task id) |
| `X-Distill-Timestamp` | ISO-8601 delivery time |
| `X-Distill-Signature` | `HMAC-SHA256(WEBHOOK_HMAC_SECRET, raw_body)`, hex |

Delivery uses a 10 s timeout with up to 3 attempts (exponential backoff, 1 s / 2 s); a
failed delivery never affects the synchronous response. Verify the signature over the
**raw body bytes**:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(signature, "hex"), b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
```

---

## Distill Standard Envelope

Every Distill agent optionally accepts a standard envelope and always replies with one. It's backward compatible — send the wrapper or don't, your existing calls keep working.

**Envelope mode** — wrap your payload:

```json
{
  "distill_version": "1.0",
  "agent_id": "6482",
  "session_id": "test-session-001",
  "payload": {
    "request": {
      "url": "https://agent.com/api?company=Acme&email=user@acme.com",
      "description": "Research on Acme acquisition targets",
      "metadata": { "reason": "competitive analysis" }
    },
    "payment_requirements": {
      "scheme": "exact",
      "network": "eip155:8453",
      "maxAmountRequired": "5000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0x104b5768FE505c400dd98F447665CB5c6fca388A"
    }
  }
}
```

`distill_version`, `agent_id`, and `session_id` are all optional. Omit `session_id` and one is generated for you (UUID). `callback_url`, if used, sits at the top level alongside `payload`.

**Legacy mode** — send the request directly, no wrapper (exactly as in [Request](#request) above). Still works.

**Response** — always enveloped:

```json
{
  "distill_version": "1.0",
  "agent_id": "6482",
  "session_id": "test-session-001",
  "status": "ok",
  "output": {
    "sanitized_request": {
      "url": "https://agent.com/api?company=[REDACTED]&email=[REDACTED]",
      "description": "Research on [REDACTED] acquisition targets",
      "metadata": { "reason": "competitive analysis" }
    },
    "replay_guard": { "nonce": "3273f0e2-...", "timestamp": "2026-06-06T...", "hmac_sha256": "9fa52805..." },
    "payment_requirements": { "...": "unchanged" },
    "shield_version": "2.0"
  },
  "processed_at": "2026-06-06T16:21:11.827Z"
}
```

- `status` — `"ok"` or `"error"`
- `agent_id` — echoed from the request, or `null` in legacy mode
- `session_id` — from the request, or a generated UUID
- `output` — the agent's normal output
- `processed_at` — ISO 8601 timestamp

---

## A note on FHE

We evaluated doing the redaction over encrypted data (fully homomorphic encryption).
The cryptography works, but homomorphic operations can't meet a sub-5ms execution budget
yet — so Shield uses deterministic cryptography that's fast today. The architecture is
ready for FHE when the compute catches up.
