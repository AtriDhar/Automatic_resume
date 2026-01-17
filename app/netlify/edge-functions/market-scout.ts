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
];

export default async (request: Request, _context: EdgeContext) => {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
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
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store");

  return new Response(upstream.body, { status: upstream.status, headers });
};
