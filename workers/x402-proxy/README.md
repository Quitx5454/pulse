# x402-proxy — Cloudflare Worker CORS proxy

A tiny Cloudflare Worker that lets the Pulse "Test Agent" feature call **any**
x402 agent endpoint from the browser, even ones that don't send CORS headers.

It forwards the request to a `target` URL and adds the CORS headers a browser
needs — including `Access-Control-Expose-Headers: PAYMENT-REQUIRED, …` so the
x402 v2 payment challenge is readable, and the matching `Allow-Headers` so the
`PAYMENT-SIGNATURE` retry passes the preflight.

## How it works

```
Browser ──▶ https://x402-proxy.<subdomain>.workers.dev/?target=<ENDPOINT_URL> ──▶ agent endpoint
        ◀── response + CORS headers ◀──────────────────────────────────────────
```

- `OPTIONS` preflight → `200` with the CORS allow headers.
- Other methods → require a `target` query param (must be `https://`),
  proxy the request through, and re-emit the upstream response with CORS added.

## Deploy

```bash
cd workers/x402-proxy
npm install          # 1. install wrangler
npx wrangler login   # 2. authenticate with your Cloudflare account (opens browser)
npm run deploy       # 3. deploy (runs `wrangler deploy`)
```

`wrangler deploy` prints the live URL, e.g.:

```
https://x402-proxy.YOUR_SUBDOMAIN.workers.dev
```

4. Copy that URL into `index.html` — set the `PROXY_URL` constant in the
   `<script type="module">` x402 payment client:

```js
const PROXY_URL = 'https://x402-proxy.YOUR_SUBDOMAIN.workers.dev';
```

Then commit & push `index.html`. Once `PROXY_URL` is set, the Test Agent modal
routes every request through the proxy, so any x402 endpoint becomes testable
from the browser. Leaving `PROXY_URL` empty keeps requests direct (works for
our own agents, which already send CORS).

## Local dev

```bash
npm run dev   # wrangler dev — runs the worker locally
```

## Security note

`ALLOWED_ORIGIN` is `*` and the only restriction is that `target` must be
`https://`. This is an **open proxy** for GET/POST. Fine for a public demo
(it forwards payment-gated x402 calls), but if you want to lock it down, add an
allowlist of target hosts or restrict `Access-Control-Allow-Origin` to your
GitHub Pages origin in `worker.js`.
