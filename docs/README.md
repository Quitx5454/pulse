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
| [Refine](./refine.md) | Strips bot activity from raw on-chain transaction data | 0.02 USDC |
| [Forge](./forge.md) | Compiles ERC-8004 reputation proofs | 0.02 USDC |
| [Shield](./shield.md) | Sanitizes x402 payment metadata, strips PII | 0.005 USDC |
| [Trace](./trace.md) | Structures agent execution logs into readable JSON | 0.01 USDC |

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

## Stack

Built on Daydreams / Lucid Agents infrastructure.
Listed on xgate.run.
