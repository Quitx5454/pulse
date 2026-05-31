#!/usr/bin/env node
// Checks health of service URLs in xgate.json.
// Checks the ORIGIN of each URL (not the deep API path) to avoid
// false-offline from endpoints that reject HEAD with 405.
// Writes public/data/health.json: { "<full-url>": "online"|"offline"|"unknown" }

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const XGATE = join(__dirname, '..', 'public', 'data', 'xgate.json');
const OUT   = join(__dirname, '..', 'public', 'data', 'health.json');

const TIMEOUT     = 8000;
const CONCURRENCY = 10;

async function headRequest(url) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' });
    clearTimeout(timer);
    return res.status;
  } catch {
    clearTimeout(timer);
    return null; // network error or timeout
  }
}

async function checkUrl(serviceUrl) {
  let origin;
  try { origin = new URL(serviceUrl).origin; } catch { return 'unknown'; }

  // Check origin with HEAD first (lightweight)
  const status = await headRequest(origin);

  if (status === null) return 'unknown';             // timeout / unreachable
  if (status >= 200 && status < 400) return 'online'; // 2xx / 3xx
  if (status === 405) {
    // HEAD not supported — fall back to GET on origin
    try {
      const res = await fetch(origin, {
        signal: AbortSignal.timeout(TIMEOUT),
        redirect: 'follow',
      });
      if (res.status >= 200 && res.status < 400) return 'online';
      return res.status >= 500 ? 'offline' : 'online'; // 4xx from GET = server up
    } catch {
      return 'unknown';
    }
  }
  if (status >= 500) return 'offline';
  // 4xx (401, 403, 404 …) from HEAD on origin — server is reachable
  return 'online';
}

async function main() {
  const data = JSON.parse(readFileSync(XGATE, 'utf8'));
  const urls = [...new Set(
    data.map(row => row[0]).filter(id => typeof id === 'string' && id.startsWith('http'))
  )];

  console.log(`Checking ${urls.length} service origins…`);
  const health = {};

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch   = urls.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(checkUrl));
    batch.forEach((url, j) => { health[url] = results[j]; });
    process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, urls.length)}/${urls.length}…`);
  }
  console.log('');

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(health));
  const counts = Object.values(health).reduce((acc, v) => { acc[v] = (acc[v]||0)+1; return acc; }, {});
  console.log(`Wrote health.json — online:${counts.online||0} offline:${counts.offline||0} unknown:${counts.unknown||0}`);
}

main().catch(e => { console.error(e); process.exit(1); });
