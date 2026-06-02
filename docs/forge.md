# Forge

Compiles ERC-8004 on-chain reputation proofs from execution traces.
One API call replaces 5 manual steps.

**Endpoint:** `POST https://forge-agent-production.up.railway.app/entrypoints/forge/invoke`
**Price:** 0.02 USDC/call
**Network:** Base Mainnet (eip155:8453)

---

## Why

Writing ERC-8004 feedback manually requires:
1. Building a strict JSON payload
2. Computing KECCAK-256 hash
3. Uploading to IPFS
4. ABI-encoding the contract call
5. Signing and submitting on-chain

Forge does all of it in one call.
Signing stays with your wallet — Forge never touches your keys.

---

## Request

```json
{
  "agent_id": "6482",
  "chain_id": 8453,
  "task": "blockchain data cleaning",
  "response_latency_ms": 1200,
  "usdc_paid": "20000",
  "tx_hash": "0xabc...",
  "success": true,
  "score": 95
}
```

## Response

```json
{
  "feedback_hash": "0x0494...606d",
  "ipfs_uri": "ipfs://QmdiRn...",
  "contract_payload": "0x3c03...",
  "ready_to_sign": true
}
```

---

## Trace → Forge pipeline

```json
{
  "forge_ready": {
    "can_submit": true,
    "suggested_score": 90,
    "suggested_tag1": "x402_execution",
    "suggested_tag2": "execution_success"
  }
}
```

Feed Trace output directly into Forge.
Total pipeline cost: 0.03 USDC.

---

## Contract

Reputation Registry (Base Mainnet):
`0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`
