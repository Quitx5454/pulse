# Trace

Structures agent execution logs into readable JSON.
Supports plaintext, JSON, OpenTelemetry, LangChain, OpenAI formats.
Includes forge_ready output for direct ERC-8004 submission.

**Endpoint:** `POST https://forge-agent-production.up.railway.app/entrypoints/trace/invoke`
**Price:** 0.01 USDC/call
**Network:** Base Mainnet (eip155:8453)

---

## Why

Your agent ran. Something went wrong.
You have 200 lines of raw logs. Good luck.

Trace parses that chaos into structured JSON —
steps, durations, token costs, USDC spent, errors, retries.
Then produces a forge_ready score for ERC-8004 submission.

---

## Request

```json
{
  "log": "your raw log string here",
  "format": "auto",
  "session_id": "optional-session-id",
  "agent_id": "6482"
}
```

Supported formats: `auto`, `plaintext`, `json`, `opentelemetry`, `langchain`, `openai`

---

## Response

```json
{
  "session_id": "session-001",
  "agent_id": "6482",
  "steps": [
    {
      "index": 1,
      "timestamp": "2026-06-02T10:00:01Z",
      "action": "fetch data from Refine",
      "status": "ok",
      "duration_ms": 1240,
      "tokens_used": 1450,
      "cost_usdc": 0.02,
      "endpoint": "https://...",
      "error": null
    }
  ],
  "summary": {
    "total_steps": 5,
    "total_duration_ms": 2860,
    "total_tokens": 3650,
    "total_cost_usdc": 0.02,
    "errors": [],
    "retries": 1,
    "status": "partial"
  },
  "forge_ready": {
    "can_submit": true,
    "suggested_score": 90,
    "suggested_tag1": "x402_execution",
    "suggested_tag2": "execution_success"
  }
}
```

---

## Trace → Forge pipeline
raw log → Trace (0.01 USDC) → forge_ready output
↓
Forge (0.02 USDC)
↓
ERC-8004 on-chain reputation

Total cost: 0.03 USDC. Zero human involvement.

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
    "log": "your raw log string here",
    "format": "auto"
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
    "steps": [],
    "summary": { "total_steps": 5, "total_cost_usdc": 0.02, "status": "partial" },
    "forge_ready": { "can_submit": true, "suggested_score": 90 }
  },
  "processed_at": "2026-06-02T16:21:11.827Z"
}
```

- `status` — `"ok"` or `"error"`
- `agent_id` — echoed from the request, or `null` in legacy mode
- `session_id` — from the request, or a generated UUID
- `output` — the agent's normal output
- `processed_at` — ISO 8601 timestamp
