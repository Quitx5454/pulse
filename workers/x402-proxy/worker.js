const ALLOWED_ORIGIN = '*';

export default {
  async fetch(request, env) {
    // OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, PAYMENT-SIGNATURE, X-Payment, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // Target URL query param'dan al
    const url = new URL(request.url);
    const target = url.searchParams.get('target');

    if (!target) {
      return new Response(JSON.stringify({ error: 'target parameter required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Güvenlik: sadece https endpoint'lerine izin ver
    if (!target.startsWith('https://')) {
      return new Response(JSON.stringify({ error: 'only https targets allowed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // İsteği klonla, target'a yönlendir
    const proxyRequest = new Request(target, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });

    // Upstream'e gönder
    const response = await fetch(proxyRequest);

    // Response header'larını klonla, CORS ekle
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    responseHeaders.set('Access-Control-Expose-Headers',
      'PAYMENT-REQUIRED, PAYMENT-RESPONSE, WWW-Authenticate, payment-required, payment-response');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  }
};
