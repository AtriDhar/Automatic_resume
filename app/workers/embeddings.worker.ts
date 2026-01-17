/// <reference lib="webworker" />

import { pipeline, env } from "@xenova/transformers";

type WorkerRequest =
  | { id: number; type: "init"; model?: string }
  | { id: number; type: "embed"; text: string };

type WorkerResponse =
  | { id: number; type: "ready" }
  | { id: number; type: "embedding"; vector: number[] }
  | { id: number; type: "error"; message: string };

let extractor: any | null = null;

function post(msg: WorkerResponse) {
  (self as any).postMessage(msg);
}

async function ensureInit(model?: string) {
  if (extractor) return;

  // Ensure remote model fetches (caching handled by Service Worker via Cache API)
  env.allowLocalModels = false;

  // Lightweight default embedding model.
  const chosen = model || "Xenova/all-MiniLM-L6-v2";
  extractor = await pipeline("feature-extraction", chosen, {
    quantized: true,
  });
}

(self as any).onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;

  try {
    switch (msg.type) {
      case "init": {
        await ensureInit(msg.model);
        post({ id: msg.id, type: "ready" });
        return;
      }
      case "embed": {
        await ensureInit();

        const out = await extractor(msg.text, {
          pooling: "mean",
          normalize: true,
        });

        // Transformers.js returns a tensor-like; normalize to a flat JS array.
        const data = Array.from(out.data as Float32Array);
        post({ id: msg.id, type: "embedding", vector: data });
        return;
      }
      default: {
        const id = (msg as any)?.id ?? -1;
        post({ id, type: "error", message: "Unknown message" });
        return;
      }
    }
  } catch (e: any) {
    post({ id: msg.id, type: "error", message: e?.message || String(e) });
  }
};
