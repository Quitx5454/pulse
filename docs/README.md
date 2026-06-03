# Distill

Stateless middleware for the x402/ERC-8004 agent economy.

Any agent with a wallet can call Distill services directly — 
no accounts, no subscriptions, no API keys.
Pay per call in USDC on Base.

**Live at:** https://quitx5454.github.io/pulse

---

## Agents

| Agent | What it does | Price |
|-------|-------------|-------|
| [Pipeline](./pipeline.html) | Chains any combination of the agents in one async call | 0.03 USDC |
| [Refine](./refine.html) | Strips bot activity from raw on-chain transaction data | 0.02 USDC |
| [Forge](./forge.html) | Compiles ERC-8004 reputation proofs | 0.02 USDC |
| [Shield](./shield.html) | Sanitizes x402 payment metadata, strips PII | 0.005 USDC |
| [Trace](./trace.html) | Structures agent execution logs into readable JSON | 0.01 USDC |

---

## MCP Gateway

| Layer | What it does | Price |
|-------|-------------|-------|
| [MCP Gateway](./mcp-gateway.html) | Exposes all 5 agents as native MCP tools (stdio + HTTP/SSE) | per-agent (no markup) |

One [Model Context Protocol](https://modelcontextprotocol.io) endpoint that turns every Distill
agent into a callable tool for Claude Desktop, Daydreams, and any MCP-compatible client. Six tools:
`refine`, `forge`, `trace`, `shield`, `pipeline_invoke`, `pipeline_status`.

---

## How it works

All Distill agents use x402 v2 for payment:

1. POST to the endpoint with your payload
2. Server responds 402 with payment requirements
3. Sign with your wallet (MetaMask or programmatic)
4. Retry with payment signature — get your result

Network: Base Mainnet (eip155:8453)
Payment token: USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)

---

## Distill Standard Envelope

Every Distill agent shares one request/response contract — the **Distill Standard Envelope** (`distill_version: "1.0"`). It gives multi-agent pipelines a uniform, session-tagged shape across Refine, Forge, Shield, and Trace.

**Input is optional and backward compatible.** You may wrap your normal payload in an envelope, or send it bare:

```json
{
  "distill_version": "1.0",   // optional
  "agent_id": "6482",          // optional
  "session_id": "test-session-001", // optional — auto-generated (UUID) if omitted
  "payload": { "...": "the agent's normal input" }
}
```

If a `payload` field is present, the agent runs in **envelope mode** (it processes `payload`). If not, it runs in **legacy mode** and accepts the bare input exactly as before.

**Output is always an envelope**, in both modes:

```json
{
  "distill_version": "1.0",
  "agent_id": "6482",                 // or null in legacy mode
  "session_id": "test-session-001",
  "status": "ok",                      // "ok" | "error"
  "output": { "...": "the agent's normal output" },
  "processed_at": "2026-06-02T16:21:11.827Z"
}
```

This means you can thread a `session_id` and `agent_id` through a whole pipeline (e.g. Trace → Forge) and correlate every step. See each agent's page for concrete examples.

---

## Stack

Built on Daydreams / Lucid Agents infrastructure.
Listed on xgate.run.
