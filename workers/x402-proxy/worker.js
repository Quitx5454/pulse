export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, PAYMENT-SIGNATURE, X-Payment, Authorization',
      'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE, WWW-Authenticate, payment-required, payment-response',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('target');

    if (!target) {
      return new Response(JSON.stringify({ error: 'target parameter required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!target.startsWith('https://')) {
      return new Response(JSON.stringify({ error: 'only https targets allowed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      const proxyRequest = new Request(target, {
        method: request.method,
        headers: (() => {
          const h = new Headers();
          for (const [k, v] of request.headers.entries()) {
            if (!['host', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'x-forwarded-for'].includes(k.toLowerCase())) {
              h.set(k, v);
            }
          }
          return h;
        })(),
        body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
      });

      const response = await fetch(proxyRequest);
      const responseHeaders = new Headers(corsHeaders);
      for (const [k, v] of response.headers.entries()) {
        responseHeaders.set(k, v);
      }
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED, PAYMENT-RESPONSE, WWW-Authenticate, payment-required, payment-response');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
