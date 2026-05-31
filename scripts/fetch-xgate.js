#!/usr/bin/env node
// Fetches xgate.run agent + service data server-side (no CORS).
// Writes public/data/xgate.json as compact JSON array.
// Row format: [id, chainId, name, desc, reputationScore, rankScore]

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'data', 'xgate.json');

const LIMIT     = 50;   // API max is 50
const TIMEOUT   = 20000;
const MAX_PAGES = 20;   // safety cap: 20 × 50 = 1000 max rows per source

async function get(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function decodeTokenUri(uri) {
  const prefix = 'data:application/json;base64,';
  if (!uri?.startsWith(prefix)) return {};
  try { return JSON.parse(Buffer.from(uri.slice(prefix.length), 'base64').toString('utf8')); }
  catch { return {}; }
}

function chainIdFromNetworks(networks) {
  if (!Array.isArray(networks)) return 0;
  for (const n of networks) {
    const m = String(n).match(/eip155:(\d+)/);
    if (m) return Number(m[1]);
  }
  return 0;
}

// Normalise an /agents result row
function agentRow(a) {
  const meta = decodeTokenUri(a.tokenUri);
  const id   = String(a.agentId ?? a.id ?? '');
  return [
    id,
    Number(a.chainId ?? 100),
    String(meta.name ?? a.name ?? `Agent #${id}`),
    String((meta.description ?? a.description ?? '').trim()),
    Number(a.reputationScore ?? 0),
    Number(a.rankScore ?? 0),
  ];
}

// Normalise a /services result row
function serviceRow(s) {
  const url  = String(s.id ?? s.resource ?? '');
  const desc = String(s.manifest?.accepts?.[0]?.description ?? s.snippet ?? '').trim();
  let name;
  try { name = new URL(url).hostname.replace(/^www\./, ''); } catch { name = url.slice(0, 40); }
  return [
    url,
    chainIdFromNetworks(s.networks),
    name,
    desc,
    Number(s.health?.score ?? s.score ?? 0),
    0,
  ];
}

async function fetchAll(baseUrl, toRow) {
  const rows = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${baseUrl}?limit=${LIMIT}&offset=${offset}`;
    let data;
    try { data = await get(url); } catch (e) { console.warn(`  offset=${offset}: ${e.message}`); break; }

    const items = data.results ?? data.data ?? data.agents ?? data.services ?? [];
    if (!Array.isArray(items) || items.length === 0) break;

    rows.push(...items.map(toRow));
    process.stdout.write(`\r  ${rows.length} rows…`);

    if (items.length < LIMIT) break;   // last partial page → done
    offset += LIMIT;
  }
  console.log('');
  return rows;
}

async function main() {
  const seen = new Map();

  const sources = [
    ['agents',   'https://api.xgate.run/agents',   agentRow],
    ['services', 'https://api.xgate.run/services', serviceRow],
  ];

  for (const [label, url, toRow] of sources) {
    console.log(`Fetching ${label} …`);
    try {
      const rows = await fetchAll(url, toRow);
      let added = 0;
      for (const row of rows) {
        if (!row[0]) continue;
        if (!seen.has(row[0])) added++;
        seen.set(row[0], row);
      }
      console.log(`  → ${added} new, ${seen.size} unique total`);
    } catch (e) {
      console.warn(`  failed: ${e.message}`);
    }
  }

  if (seen.size === 0) {
    console.error('No data fetched — keeping existing file unchanged.');
    process.exit(1);
  }

  const rows = [...seen.values()];
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(rows));
  console.log(`Wrote ${rows.length} rows → ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
