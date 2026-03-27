export const config = {
  runtime: 'edge',
};

type GenerateRequest = {
  prompt?: string;
  parts?: Array<{
    text?: string;
    inlineData?: { mimeType: string; data: string };
  }>;
  model?: string;
  responseMimeType?: 'application/json' | 'text/plain';
  stream?: boolean;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return json({ error: 'Missing GEMINI_API_KEY' }, 500);
  }

  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const prompt = String(body.prompt || '');
  const model = body.model || 'gemini-2.5-flash';
  const responseMimeType = body.responseMimeType || 'text/plain';
  const wantStream =
    !!body.stream || request.headers.get('accept')?.includes('text/event-stream');

  const base = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`;
  const parts = Array.isArray(body.parts) && body.parts.length ? body.parts : [{ text: prompt }];

  if (wantStream) {
    const url = `${base}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
    });

    const headers = new Headers(upstream.headers);
    headers.set('content-type', 'text/event-stream');
    headers.set('cache-control', 'no-cache');

    return new Response(upstream.body, { status: upstream.status, headers });
  }

  const url = `${base}:generateContent?key=${encodeURIComponent(key)}`;
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType },
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    return json({ error: 'Upstream error', detail }, 502);
  }

  const data = await upstream.json();
  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p?.text ?? '')
      .join('') ?? '';

  return json({ text });
}