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
