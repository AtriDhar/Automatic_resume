type EdgeContext = {
  env?: {
    get(key: string): string | undefined;
  };
};

const ALLOWED_HOST_SUFFIXES = [
  "indeed.com",
  "linkedin.com",
  "glassdoor.com",
  "stackoverflow.com",
  "remotive.com",
  "arbeitnow.com",
];

// Same-origin gate: this is a reverse proxy for CORS bypass — it must only
// serve our own frontend, not act as an open proxy for arbitrary callers.
const isOriginAllowed = (request: Request) => {
  const raw = request.headers.get("origin") || request.headers.get("referer") || "";
  if (!raw) return true; // same-origin GETs may omit both; only block explicit foreign origins
  try {
    const originHost = new URL(raw).host;
    const selfHost = new URL(request.url).host;
    return originHost === selfHost || originHost === "localhost:3000" || originHost === "localhost:5173";
  } catch {
    return false;
  }
};

export default async (request: Request, _context: EdgeContext) => {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!isOriginAllowed(request)) {
    return new Response(JSON.stringify({ error: "Forbidden: origin not allowed" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const urlParam = new URL(request.url).searchParams.get("url");
  if (!urlParam) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid url" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const hostOk = ALLOWED_HOST_SUFFIXES.some((suf) => target.hostname === suf || target.hostname.endsWith(`.${suf}`));
  if (!hostOk) {
    return new Response(JSON.stringify({ error: "Host not allowed" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const upstream = await fetch(target.toString(), {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; ARS-MME Market Scout Proxy)",
      "accept": "text/html,application/xhtml+xml",
    },
  });

  const headers = new Headers();
  // Preserve upstream content type (Remotive/Arbeitnow return JSON, not HTML).
  headers.set("content-type", upstream.headers.get("content-type") || "text/plain; charset=utf-8");
  headers.set("cache-control", "no-store");

  return new Response(upstream.body, { status: upstream.status, headers });
};
