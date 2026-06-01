#!/usr/bin/env node
// Builds network graph from 8004scan feedback co-usage data.
// Nodes = agents; edges = users who interacted with 2+ agents.
// Also tries xgate.run onchain/flows (logs result even if empty).
// Writes public/data/graph.json

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const XGATE = join(__dirname, '..', 'public', 'data', 'xgate.json');
const OUT   = join(__dirname, '..', 'public', 'data', 'graph.json');

const TIMEOUT        = 12000;
const FEEDBACK_PAGES = 10;   // 1000 feedbacks
const FLOW_AGENTS    = 30;   // how many leaderboard wallets to try for on-chain flows

async function get(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 1. Load xgate.json agent metadata ───────────────────────────────────────
const xgate = JSON.parse(readFileSync(XGATE, 'utf8'));
const agentMeta = new Map();
for (const row of xgate) {
  if (!String(row[0]).startsWith('http'))
    agentMeta.set(String(row[0]), { name: row[2], chainId: row[1], rep: row[4] });
}
console.log(`Loaded ${agentMeta.size} agent metadata entries`);

// ── 2. Fetch 8004scan feedback pages ─────────────────────────────────────────
console.log(`Fetching ${FEEDBACK_PAGES} feedback pages from 8004scan…`);
const allFbs = [];
for (let page = 1; page <= FEEDBACK_PAGES; page++) {
  try {
    const d = await get(`https://8004scan.io/api/v1/public/feedbacks?limit=100&page=${page}`);
    const fbs = d.data || [];
    allFbs.push(...fbs);
    process.stdout.write(`\r  page ${page}/${FEEDBACK_PAGES}: ${allFbs.length} feedbacks`);
    if (fbs.length < 100) break;
  } catch(e) { console.warn(`\n  page ${page} failed: ${e.message}`); }
  await sleep(200);
}
console.log(`\nFetched ${allFbs.length} feedbacks`);

// ── 3. Build nodes and track user→agents mapping ──────────────────────────────
const nodeMap  = new Map(); // agentId → node object
const userAgs  = new Map(); // user_address → Set<agentId>
const OUR_IDS  = new Set(['distill', 'parse']);

for (const fb of allFbs) {
  const agId   = String(fb.agent_id || '');
  const fbName = (fb.agent && fb.agent.name) || '';
  const user   = fb.user_address || '';
  const chain  = fb.chain_id || 0;
  const score  = fb.score || 0;
  if (!agId) continue;

  if (!nodeMap.has(agId)) {
    const meta = agentMeta.get(agId);
    nodeMap.set(agId, {
      id: agId,
      name: meta ? meta.name : (fbName || `Agent #${agId.slice(-6)}`),
      chainId: meta ? meta.chainId : chain,
      rep: meta ? meta.rep : score,
      feedbacks: 0,
    });
  }
  nodeMap.get(agId).feedbacks++;

  if (user) {
    if (!userAgs.has(user)) userAgs.set(user, new Set());
    userAgs.get(user).add(agId);
  }
}

// ── 4. Co-usage edges ─────────────────────────────────────────────────────────
const edgeMap = new Map(); // "a__b" → weight (co-occurrence count)
let multiUsers = 0;
for (const [, ags] of userAgs) {
  if (ags.size < 2) continue;
  multiUsers++;
  const list = [...ags];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i] < list[j] ? list[i] : list[j];
      const b = list[i] < list[j] ? list[j] : list[i];
      const k = `${a}__${b}`;
      edgeMap.set(k, (edgeMap.get(k) || 0) + 1);
    }
  }
}
console.log(`Co-usage: ${multiUsers} multi-agent users → ${edgeMap.size} edges`);

// ── 5. Try xgate.run onchain flows (best-effort) ─────────────────────────────
console.log(`Trying onchain flows for up to ${FLOW_AGENTS} leaderboard agents…`);
let flowHits = 0;
try {
  const lb = await get(`https://api.xgate.run/leaderboard?limit=${FLOW_AGENTS}`);
  const agents = (lb.results || []).slice(0, FLOW_AGENTS);
  for (const ag of agents) {
    const wallet = ag.wallet;
    const agId   = String(ag.agentId);
    if (!wallet) continue;

    // Ensure node exists
    if (!nodeMap.has(agId)) {
      nodeMap.set(agId, {
        id: agId, name: ag.name, chainId: ag.chainId,
        rep: ag.reputationScore || 0, feedbacks: 0,
      });
    }

    try {
      const from = '2025-01-01T00:00:00Z';
      const to   = '2026-06-01T00:00:00Z';
      const url  = `https://api.xgate.run/onchain/flows?chain_id=${ag.chainId}&entity_id=${wallet}&direction=both&from=${from}&to=${to}`;
      const flows = await get(url);
      const flowData = flows.data || [];
      for (const flow of flowData) {
        const cp = flow.counterparty_id || flow.entity_id;
        if (!cp || cp === wallet) continue;
        const cpAg = agents.find(a => a.wallet === cp);
        if (!cpAg) continue;
        const cpId = String(cpAg.agentId);
        const a = agId < cpId ? agId : cpId;
        const b = agId < cpId ? cpId : agId;
        const k = `${a}__${b}`;
        const amt = Math.max(1, Math.floor(Number(flow.value_raw || 0) / 1e6));
        edgeMap.set(k, (edgeMap.get(k) || 0) + amt);
        flowHits++;
      }
    } catch { /* api returned no data or error */ }

    await sleep(500);
  }
} catch(e) { console.warn('  leaderboard fetch failed:', e.message); }
console.log(`  Onchain flow edges found: ${flowHits}`);

// ── 6. Add OUR agents as nodes ───────────────────────────────────────────────
if (!nodeMap.has('distill')) {
  nodeMap.set('distill', { id:'distill', name:'Distill', chainId:8453, rep:100, feedbacks:0 });
}
if (!nodeMap.has('parse')) {
  nodeMap.set('parse', { id:'parse', name:'Parse', chainId:8453, rep:100, feedbacks:0 });
}

// ── 7. Assemble final graph ───────────────────────────────────────────────────
const nodes = [...nodeMap.values()].map(n => ({
  id:        n.id,
  name:      n.name,
  chainId:   n.chainId,
  size:      Math.max(6, Math.min(32, (n.rep / 4) + (n.feedbacks * 3))),
  rep:       n.rep,
  feedbacks: n.feedbacks,
  isOurs:    OUR_IDS.has(n.id),
}));

const nodeIds = new Set(nodes.map(n => n.id));
const edges = [...edgeMap.entries()]
  .map(([k, w]) => { const [from, to] = k.split('__'); return { from, to, weight: w }; })
  .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))
  .sort((a, b) => b.weight - a.weight);

console.log(`\n✓ Graph: ${nodes.length} nodes, ${edges.length} edges`);
console.log(`  (${nodes.filter(n=>n.feedbacks>0).length} active nodes, ${nodes.filter(n=>n.isOurs).length} ours)`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ nodes, edges, generatedAt: new Date().toISOString() }));
console.log(`Wrote → ${OUT}`);
