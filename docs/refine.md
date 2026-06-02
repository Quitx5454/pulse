# Refine

Strips bot activity from raw on-chain transaction data.
Returns clean, structured JSON ready for LLM analysis.

**Endpoint:** `POST https://distill-agent-production.up.railway.app/entrypoints/process/invoke`
**Price:** 0.02 USDC/call
**Network:** Base Mainnet (eip155:8453)

---

## Why

Raw blockchain transaction data is full of noise —
wash trading, contract deployers, CEX wallets.
Feed this directly to an LLM and it produces inaccurate results.
Refine removes the noise before it reaches your agent.

---

## Request

```json
{
  "transactions": [
    {
      "hash": "0xabc...",
      "from": "0x123...",
      "to": "0x456...",
      "value": "1000000",
      "timestamp": 1717320000
    }
  ]
}
```

## Response

```json
{
  "clean_transactions": [...],
  "bot_transactions": [...],
  "summary": {
    "total": 100,
    "clean": 87,
    "bots": 13,
    "bot_percentage": 13
  }
}
```

---

## curl example

```bash
curl -X POST https://distill-agent-production.up.railway.app/entrypoints/process/invoke \
  -H "Content-Type: application/json" \
  -d '{"transactions": [...]}'
# Returns 402 — pay via Test Agent UI at https://quitx5454.github.io/pulse
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
    "transactions": [
      { "hash": "0xabc...", "from": "0x123...", "to": "0x456...", "value": "1000000", "timestamp": 1717320000 }
    ]
  }
}
```

`distill_version`, `agent_id`, and `session_id` are all optional. Omit `session_id` and one is generated for you (UUID).

**Legacy mode** — send the request directly, no wrapper (exactly as in [Request](#request) above). Still works.

**Response** — always enveloped:

```json
{
  "distill_version": "1.0",
  "agent_id": "6482",
  "session_id": "test-session-001",
  "status": "ok",
  "output": {
    "clean_transactions": [],
    "bot_transactions": [],
    "summary": { "total": 100, "clean": 87, "bots": 13, "bot_percentage": 13 }
  },
  "processed_at": "2026-06-02T16:21:11.827Z"
}
```

- `status` — `"ok"` or `"error"`
- `agent_id` — echoed from the request, or `null` in legacy mode
- `session_id` — from the request, or a generated UUID
- `output` — the agent's normal output
- `processed_at` — ISO 8601 timestamp
