export const config = {
  runtime: 'edge',
};

const ALLOWED_HOST_SUFFIXES = [
  'indeed.com',
  'linkedin.com',
  'glassdoor.com',
  'stackoverflow.com',
  'remotive.com',
  'arbeitnow.com',
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

// Same-origin gate: this is a reverse proxy for CORS bypass — it must only
// serve our own frontend, not act as an open proxy for arbitrary callers.
const isOriginAllowed = (request: Request) => {
  const raw = request.headers.get('origin') || request.headers.get('referer') || '';
  // GET navigations from our own app may omit Origin; fall back to Referer,
  // and only hard-fail when a foreign origin is explicitly present.
  if (!raw) return true;
  try {
    const originHost = new URL(raw).host;
    const selfHost = new URL(request.url).host;
    return originHost === selfHost || originHost === 'localhost:3000' || originHost === 'localhost:5173';
  } catch {
    return false;
  }
};

export default async function handler(request: Request) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  if (!isOriginAllowed(request)) {
    return json({ error: 'Forbidden: origin not allowed' }, 403);
  }

  const requestUrl = new URL(request.url);
  const urlParam = requestUrl.searchParams.get('url');
  if (!urlParam) {
    return json({ error: 'Missing url parameter' }, 400);
  }

  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    return json({ error: 'Invalid url' }, 400);
  }

  const hostOk = ALLOWED_HOST_SUFFIXES.some(
    (suf) => target.hostname === suf || target.hostname.endsWith(`.${suf}`),
  );
  if (!hostOk) {
    return json({ error: 'Host not allowed' }, 403);
  }

  const upstream = await fetch(target.toString(), {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; ARS-MME Market Scout Proxy)',
      accept: 'text/html,application/xhtml+xml',
    },
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}