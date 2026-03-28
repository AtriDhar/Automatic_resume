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

type Provider = 'gemini' | 'nvidia';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const makeTraceId = () => `gen-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const flattenTextParts = (body: GenerateRequest) => {
  if (typeof body.prompt === 'string' && body.prompt.trim()) return body.prompt.trim();
  const parts = Array.isArray(body.parts) ? body.parts : [];
  const text = parts
    .map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
  return text;
};

const geminiLikeChunk = (text: string) =>
  JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] });

const streamNvidiaAsGeminiLikeSse = (upstream: Response) => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      if (!upstream.body) {
        controller.close();
        return;
      }

      const reader = upstream.body.getReader();
      let buffer = '';

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const raw of lines) {
            const line = raw.trim();
            if (!line || !line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;

            try {
              const parsed = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
                error?: unknown;
              };

              if (parsed?.error) {
                const errorLine = `data: ${JSON.stringify({ error: parsed.error })}\n\n`;
                controller.enqueue(encoder.encode(errorLine));
                continue;
              }

              const text =
                parsed?.choices?.[0]?.delta?.content ??
                parsed?.choices?.[0]?.message?.content ??
                '';

              if (text) {
                const out = `data: ${geminiLikeChunk(text)}\n\n`;
                controller.enqueue(encoder.encode(out));
              }
            } catch {
              // Skip malformed lines and continue streaming.
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });
};

const chooseProvider = () => {
  const forced = String(process.env.LLM_PROVIDER || '').trim().toLowerCase();
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasNvidia = !!process.env.NVIDIA_API_KEY;

  if (forced === 'nvidia' && hasNvidia) return 'nvidia' as Provider;
  if (forced === 'gemini' && hasGemini) return 'gemini' as Provider;
  if (hasGemini) return 'gemini' as Provider;
  if (hasNvidia) return 'nvidia' as Provider;
  return null;
};

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const provider = chooseProvider();
  if (!provider) {
    return json({ error: 'Missing model provider key (set GEMINI_API_KEY or NVIDIA_API_KEY)' }, 500);
  }

  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const prompt = String(body.prompt || '');
  const model = body.model || (provider === 'nvidia' ? 'google/gemma-3n-e4b-it' : 'gemini-2.5-flash');
  const traceId = makeTraceId();
  const responseMimeType = body.responseMimeType || 'text/plain';
  const wantStream =
    !!body.stream || request.headers.get('accept')?.includes('text/event-stream');

  if (provider === 'nvidia') {
    const nvidiaKey = process.env.NVIDIA_API_KEY;
    if (!nvidiaKey) {
      return json({ error: 'Missing NVIDIA_API_KEY' }, 500);
    }

    const userText = flattenTextParts(body) || prompt;
    if (!userText) {
      return json({ error: 'NVIDIA provider requires text prompt/parts' }, 400);
    }

    const nvidiaUrl = process.env.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
    const upstream = await fetch(nvidiaUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${nvidiaKey}`,
        'content-type': 'application/json',
        accept: wantStream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: userText }],
        max_tokens: 512,
        temperature: 0.2,
        top_p: 0.7,
        frequency_penalty: 0,
        presence_penalty: 0,
        stream: !!wantStream,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return json({ error: 'NVIDIA upstream error', detail, upstreamStatus: upstream.status, model, traceId }, upstream.status);
    }

    if (wantStream) {
      const stream = streamNvidiaAsGeminiLikeSse(upstream);
      return new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'x-trace-id': traceId,
        },
      });
    }

    const data = await upstream.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data?.choices?.[0]?.message?.content || '';
    return json({ text });
  }

  const key = process.env.GEMINI_API_KEY as string;

  const base = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`;
  const parts = Array.isArray(body.parts) && body.parts.length ? body.parts : [{ text: prompt }];

  if (wantStream) {
    const url = `${base}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return json(
        {
          error: 'Upstream stream error',
          upstreamStatus: upstream.status,
          detail,
          model,
          traceId,
        },
        upstream.status,
      );
    }

    const headers = new Headers(upstream.headers);
    headers.set('content-type', 'text/event-stream');
    headers.set('cache-control', 'no-cache');
    headers.set('x-trace-id', traceId);

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
    return json({ error: 'Upstream error', detail, upstreamStatus: upstream.status, model, traceId }, upstream.status);
  }

  const data = await upstream.json();
  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p?.text ?? '')
      .join('') ?? '';

  return json({ text });
}