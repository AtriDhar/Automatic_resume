/* Service Worker: Cache API model caching (Browser-First requirement)
   - Uses Cache API (NOT localStorage)
   - Cache-first for model/wasm/weight assets to avoid re-download on repeat visits
*/

const MODEL_CACHE = "ars-mme-models-v1";

const SHOULD_CACHE_HOSTS = [
  "huggingface.co",
  "hf.co",
  "cdn.jsdelivr.net",
  "raw.githubusercontent.com",
  "mlc.ai",
  "storage.googleapis.com",
];

const SHOULD_CACHE_EXTENSIONS = [
  ".bin",
  ".wasm",
  ".onnx",
  ".json",
  ".params",
  ".pt",
  ".safetensors",
  ".model",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function shouldCache(request) {
  try {
    if (request.method !== "GET") return false;
    const url = new URL(request.url);
    if (!SHOULD_CACHE_HOSTS.some((h) => url.hostname.endsWith(h))) return false;
    if (SHOULD_CACHE_EXTENSIONS.some((ext) => url.pathname.endsWith(ext))) return true;
    // Heuristic: cache model asset URLs even if extension-less
    if (url.pathname.includes("/resolve/") || url.pathname.includes("/models/") || url.pathname.includes("/mlc/")) return true;
    return false;
  } catch {
    return false;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(MODEL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const res = await fetch(request);
  // Cache only successful, opaque or basic responses.
  if (res && (res.ok || res.type === "opaque")) {
    try {
      await cache.put(request, res.clone());
    } catch {
      // ignore cache failures (quota, opaque restrictions, etc)
    }
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!shouldCache(request)) return;
  event.respondWith(cacheFirst(request));
});
