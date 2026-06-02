# Shield

Sanitizes x402 payment metadata before it reaches the facilitator.
Strips PII. Adds HMAC-SHA256 replay guard.

**Endpoint:** `POST https://shield-agent-production.up.railway.app/entrypoints/shield/invoke`
**Price:** 0.005 USDC/call
**Network:** Base Mainnet (eip155:8453)

---

## Why

Every x402 payment leaks data.
Resource URL, description, metadata — all sent plaintext
to the CDP facilitator and the receiving server.

Shield sits between your agent and the payment.

---

## Important: call Shield BEFORE signing
Agent A → Shield (sanitize) → sign → Agent B

If you sign first then sanitize, the EIP-712 signature breaks.

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

```json
{
  "sanitized_request": {
    "url": "https://agent.com/api?company=[REDACTED]&email=[REDACTED]",
    "description": "Research on [REDACTED] acquisition targets",
    "metadata": { "reason": "competitive analysis" }
  },
  "replay_guard": {
    "nonce": "3273f0e2-...",
    "timestamp": "2026-06-02T...",
    "hmac_sha256": "9fa52805..."
  },
  "payment_requirements": { ...unchanged... },
  "shield_version": "1.0"
}
```

---

## What gets redacted

- Email addresses
- API keys and Bearer tokens
- Wallet addresses (0x...)
- IP addresses
- JWT tokens
- Phone numbers
- Company names (configurable list)

`payment_requirements` including `payTo` is never touched.
