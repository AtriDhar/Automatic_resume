type EdgeContext = {
  env: {
    get(key: string): string | undefined;
  };
};

type GenerateRequest = {
  prompt?: string;
  parts?: Array<{
    text?: string;
    inlineData?: { mimeType: string; data: string };
  }>;
  model?: string;
  responseMimeType?: "application/json" | "text/plain";
  stream?: boolean;
};

export default async (request: Request, context: EdgeContext) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const key = context.env.get("GEMINI_API_KEY");
  if (!key) {
    return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const prompt = String(body.prompt || "");
  const model = body.model || "gemini-2.5-flash";
  const responseMimeType = body.responseMimeType || "text/plain";
  const wantStream = !!body.stream || request.headers.get("accept")?.includes("text/event-stream");

  const base = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`;

  const parts = Array.isArray(body.parts) && body.parts.length
    ? body.parts
    : [{ text: prompt }];

  if (wantStream) {
    const url = `${base}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
      }),
    });

    // Pass-through SSE stream.
    const headers = new Headers(upstream.headers);
    headers.set("content-type", "text/event-stream");
    headers.set("cache-control", "no-cache");

    return new Response(upstream.body, { status: upstream.status, headers });
  }

  const url = `${base}:generateContent?key=${encodeURIComponent(key)}`;
  const upstream = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType },
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(JSON.stringify({ error: "Upstream error", detail: text }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  const data = await upstream.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";

  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
};
