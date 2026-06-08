# MCP Gateway

One unified [Model Context Protocol](https://modelcontextprotocol.io) server that exposes all three Distill agents as native tools. Point any MCP client — Claude Desktop, Daydreams, or your own — at one endpoint and get every Distill agent as a callable tool.

**Endpoint:** `POST https://mcp-gateway-production-e02e.up.railway.app/mcp`
**Health:** `GET https://mcp-gateway-production-e02e.up.railway.app/` (free)
**Transports:** stdio (local / Claude Desktop) · Streamable HTTP + SSE (remote)
**Network:** Base Mainnet (eip155:8453) · USDC
**Source:** [Quitx5454/mcp-gateway](https://github.com/Quitx5454/mcp-gateway)

---

## What it does

The gateway is a thin, stateless adapter: each Distill agent becomes one MCP tool. When a tool is
called, the gateway forwards the request to the agent's x402 endpoint and returns the result. It
does **not** re-implement any agent logic — it's pure routing + payment glue, so the tool catalog
always matches the live agents.

The same single `McpServer` is served over two transports, so it works both as a local Claude
Desktop server (stdio) and as a remote HTTP service.

---

## The 3 tools

| Tool | Agent | Method | Price | What it does |
|------|-------|--------|-------|-------------|
| `refine` | Refine | POST | 0.02 USDC | Clean raw transaction data, filter bots, return structured output |
| `trace` | Trace | POST | 0.01 USDC | Normalize a raw execution log into structured steps + a `forge_ready` block |
| `shield` | Shield | POST | 0.005 USDC | Strip PII from an x402 request + issue an HMAC-SHA256 replay guard |

Each tool ships a strict, typed input schema mirroring the agent's documented input, so MCP clients
(and the models driving them) know exactly how to call it.

---

## Connect from Claude Desktop (stdio)

Clone the repo, then add the gateway to your Claude Desktop config
(`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "distill": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/mcp-gateway/src/index.ts", "--stdio"],
      "env": { "PRIVATE_KEY": "0x..." }
    }
  }
}
```

- `--stdio` selects the stdio transport (you can also set `MCP_TRANSPORT=stdio`).
- `PRIVATE_KEY` is **optional** — see [Payment model](#payment-model). Without it, paid tools
  return the payment challenge for your client to settle.

Restart Claude Desktop; the three Distill tools appear under the `distill` server.

---

## Connect remotely (HTTP / SSE)

The hosted gateway speaks the MCP **Streamable HTTP** transport (which supports SSE streaming) at
`POST /mcp`, statelessly:

```bash
# initialize
curl -X POST https://mcp-gateway-production-e02e.up.railway.app/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",
       "params":{"protocolVersion":"2025-06-18","capabilities":{},
                 "clientInfo":{"name":"my-client","version":"0"}}}'

# list tools
curl -X POST https://mcp-gateway-production-e02e.up.railway.app/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Any MCP-compatible client library (e.g. the official SDK's `StreamableHTTPClientTransport`, or
Daydreams' [`@x402/mcp`](https://www.npmjs.com/package/@x402/mcp)) can connect to that URL directly.
`GET /` returns a free health check.

---

## Payment model

All three tools are x402-protected. The gateway can pay automatically when configured with a
wallet (`PRIVATE_KEY`), using the EVM exact-scheme client (viem + `@x402/evm`).

**A 402 is never swallowed.** If a payment can't be settled — no wallet configured, insufficient
funds, or facilitator rejection — the gateway surfaces the x402 challenge as an MCP **tool error**
whose structured content carries the decoded `payment_required` payload. A paying client framework
(such as Daydreams `@x402/mcp`) can intercept that error and complete the payment itself.

> The public hosted gateway runs in **passthrough mode** (no wallet): its `/mcp` endpoint is
> unauthenticated, so it never spends funds on anyone's behalf — it hands the challenge back to the
> caller. Run your own instance with a `PRIVATE_KEY` if you want it to pay for you.

---

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `PRIVATE_KEY` | for auto-pay | Gateway wallet that settles x402 challenges. Absent → passthrough (challenge returned to client). |
| `SEEDER_PRIVATE_KEY` | seed script only | Wallet used by `scripts/seed-bazaar.ts`. |
| `RPC_URL` | no | Base RPC (default `https://mainnet.base.org`). |
| `PORT` | no | HTTP port (default 3000). |
| `AGENT_TIMEOUT_MS` | no | Per-agent request timeout (default 60000). |
| `MCP_TRANSPORT` | no | Set to `stdio` to force the stdio transport. |
| `REFINE_URL` / `TRACE_URL` / `SHIELD_URL` | no | Override agent base URLs (default: production). `FORGE_URL` is still accepted as a fallback for `TRACE_URL`. |

---

## Seeding x402 Bazaar

`scripts/seed-bazaar.ts` calls each of the three invoke endpoints once with realistic data, paying
with a seeder wallet. A settled payment through the CDP facilitator is what triggers indexing into
the x402 Bazaar catalog. It prints the on-chain settlement tx hash for each agent.

```bash
SEEDER_PRIVATE_KEY=0x... bun run seed
```

> Costs real USDC on Base Mainnet (~0.035 USDC total). Run once.

---

## Pricing

| tool | cost |
|------|------|
| `refine` | 0.02 USDC |
| `trace` | 0.01 USDC |
| `shield` | 0.005 USDC |

The tool prices are exactly the underlying agents' prices — the gateway adds no markup.

---

## Source

GitHub: [Quitx5454/mcp-gateway](https://github.com/Quitx5454/mcp-gateway) ·
part of the [Distill](./README.html) suite.
