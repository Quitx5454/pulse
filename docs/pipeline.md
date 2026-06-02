# Pipeline

Chains any combination of the Distill agents in a single call.
The first multi-agent orchestration middleware for the x402/ERC-8004 ecosystem.

**Invoke:** `POST https://pipeline-agent-production-7736.up.railway.app/entrypoints/pipeline/invoke`
**Status:** `GET https://pipeline-agent-production-7736.up.railway.app/entrypoints/pipeline/status/:task_id`
**Price:** 0.03 USDC/invoke · status endpoint free
**Network:** Base Mainnet (eip155:8453)
**ERC-8004:** agentId `54366`

---

## What it does

You name the agents and the order; Pipeline runs them in sequence, automatically routing each
step's output into the next step's input. It pays the downstream agents internally over x402, so
you make **one** payment and get back a chained result.

Execution is **asynchronous**. The paid invoke call returns a `task_id` immediately and the pipeline
runs in the background — you poll the free status endpoint for progress and results. No combination
is hardcoded: everything is driven by a static agent registry, so any order of
`refine` · `forge` · `shield` · `trace` works.

```
your payload → [ Pipeline ] → Trace → Forge → on-chain proof
                    │
                    └── task_id  →  GET /status/:task_id  (free)
```

---

## Routing

Between steps, Pipeline merges each output into a shared `accumulated` object and builds the next
agent's payload from it:

1. Pick the keys that match the next agent's expected input fields.
2. If none match, pass the entire `accumulated` object through.
3. Always preserve `session_id`.

On top of that, a few cross-name mappings are built in:

- **Trace → Forge:** `forge_ready.suggested_score → score`, `forge_ready.suggested_tag1 → task`
  (falls back to `suggested_tag2`, then a generic label), `summary.total_cost_usdc → usdc_paid`,
  and `session_id → tx_hash` when no real `tx_hash` is present. If `forge_ready.can_submit` is
  `false`, the pipeline **halts as `partial`** before calling Forge.
- **Shield → next:** `sanitized_request → request` when the next agent accepts a `request` field.
- **Refine:** `clean_data` is merged into `accumulated` and available by name.

---

## Distill Standard Envelope

Pipeline speaks the same standard envelope as every Distill agent, and uses it when calling the
downstream agents. Your invoke request uses Pipeline's own shape (`pipeline` + `payload`), and the
`session_id` you supply (or one that's generated) is threaded through every step so you can
correlate the whole chain.

Each downstream agent is called in **envelope mode**:

```json
{
  "distill_version": "1.0",
  "agent_id": "54366",
  "session_id": "test-session-001",
  "payload": { "...": "the routed input for that agent" }
}
```

and replies with the standard enveloped response (`distill_version`, `agent_id`, `session_id`,
`status`, `output`, `processed_at`), which Pipeline unwraps before merging. See the
[suite overview](./README.html) for the full envelope contract.

---

## POST /entrypoints/pipeline/invoke

Paid ($0.03 USDC, x402). The `pipeline` array is validated **before** the paywall, so malformed
requests are rejected with `400` without being charged.

**Request**

```json
{
  "pipeline": ["trace", "forge"],
  "payload": {
    "log": "[2026-06-02 10:00:01] fetch_data completed in 340ms. Tokens: 1200. USDC: 0.02. Status: OK"
  },
  "session_id": "optional-uuid"
}
```

- `pipeline` — ordered agent ids; non-empty; every id must be one of `refine`, `forge`, `shield`, `trace`.
- `payload` — the initial input for the **first** agent.
- `session_id` — optional; generated and preserved across steps if omitted.

**Response — immediate**

```json
{
  "task_id": "f1c2a3b4-5678-90ab-cdef-1234567890ab",
  "status": "queued",
  "session_id": "f1c2a3b4-5678-90ab-cdef-1234567890ab"
}
```

---

## GET /entrypoints/pipeline/status/:task_id

Free. Returns live status — poll it after invoke. `status` is one of
`queued | running | completed | partial | failed`. Tasks live for **10 minutes**.

**Completed**

```json
{
  "task_id": "f1c2…",
  "session_id": "f1c2…",
  "status": "completed",
  "pipeline": ["trace", "forge"],
  "steps": [
    { "agent": "trace", "status": "completed", "output": { "summary": { "total_steps": 4 }, "forge_ready": { "can_submit": true, "suggested_score": 92 } }, "duration_ms": 1240 },
    { "agent": "forge", "status": "completed", "output": { "feedback_hash": "0x0494…606d", "ready_to_sign": true }, "duration_ms": 870 }
  ],
  "final_output": { "feedback_hash": "0x0494…606d", "ipfs_uri": "ipfs://QmdiRn…", "contract_payload": "0x3c03…", "ready_to_sign": true },
  "accumulated": { "summary": { "...": "..." }, "forge_ready": { "...": "..." }, "feedback_hash": "0x0494…606d" },
  "started_at": "2026-06-03T10:00:00.000Z",
  "completed_at": "2026-06-03T10:00:02.110Z"
}
```

---

## Example pipelines

### trace → forge

Turn a raw execution log into an on-chain reputation proof in one call.

```bash
curl -X POST https://pipeline-agent-production-7736.up.railway.app/entrypoints/pipeline/invoke \
  -H 'Content-Type: application/json' \
  -d '{ "pipeline": ["trace","forge"],
        "payload": { "log": "[2026-06-02 10:00:01] fetch_data completed in 340ms. Tokens: 1200. USDC: 0.02. Status: OK" } }'
# → { "task_id": "f1c2…", "status": "queued", "session_id": "f1c2…" }

curl https://pipeline-agent-production-7736.up.railway.app/entrypoints/pipeline/status/f1c2…
# → status "completed", final_output = Forge's { feedback_hash, ipfs_uri, contract_payload, ready_to_sign }
```

Trace's `forge_ready.suggested_score → score` and `suggested_tag1 → task`, `summary.total_cost_usdc
→ usdc_paid`, `session_id → tx_hash` — all wired automatically. Total cost: **0.03 USDC**.

### shield → refine

Sanitize a request (strip PII, add a replay guard), then clean the data it points to.

```bash
curl -X POST https://pipeline-agent-production-7736.up.railway.app/entrypoints/pipeline/invoke \
  -H 'Content-Type: application/json' \
  -d '{ "pipeline": ["shield","refine"],
        "payload": {
          "request": { "url": "https://api.example.com/txns", "description": "raw txns", "metadata": { "email": "a@b.com" } },
          "payment_requirements": { "scheme": "exact", "network": "eip155:8453", "maxAmountRequired": "20000", "asset": "0x8335…2913", "payTo": "0x104b…388A" }
        } }'
```

Shield's `sanitized_request` is routed into Refine's `request`; Refine's `clean_data` ends up in
`accumulated` and `final_output`.

---

## Error cases

**`partial`** — a step after the first failed; earlier outputs are preserved. `failed_at` names the
agent and `error` carries the reason.

```json
{
  "status": "partial",
  "failed_at": "forge",
  "error": "HTTP 402 from agent",
  "steps": [
    { "agent": "trace", "status": "completed", "output": { "...": "..." }, "duration_ms": 1240 },
    { "agent": "forge", "status": "failed", "output": null, "duration_ms": 410, "error": "HTTP 402 from agent" }
  ],
  "final_output": { "...": "trace output (last successful step)" }
}
```

**`failed`** — the first step failed, so there's no usable output (`final_output: null`,
`failed_at` set to the first agent).

**`can_submit` gate** — when chaining `trace → forge`, if Trace reports `forge_ready.can_submit:
false`, Pipeline refuses to forge an unsubmittable result and halts as **`partial`** with
`failed_at: "forge"` and an explanatory `error` — no Forge call (and no Forge charge) is made.

Other failure sources, all surfaced the same way: unknown agent id (`400` at invoke, before
queuing), a downstream non-200 / x402 rejection, or a downstream envelope with `status: "error"`.

---

## Pricing

| call | cost |
|------|------|
| `POST /entrypoints/pipeline/invoke` | **0.03 USDC** |
| `GET /entrypoints/pipeline/status/:task_id` | **free** |

You pay Pipeline once; it pays each downstream agent internally out of its own wallet.

---

## Source

GitHub: [Quitx5454/pipeline-agent](https://github.com/Quitx5454/pipeline-agent) ·
part of the [Distill](./README.html) suite.
