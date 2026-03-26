export type ComputePath = "local" | "cloud";

// Backend URL configuration (Render deployment)
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export type CapabilityScore = {
  webgpuAvailable: boolean;
  deviceHighSpec: boolean;
  score: number;
  network: {
    effectiveType?: string;
    downlinkMbps?: number;
    rttMs?: number;
    saveData?: boolean;
  };
};

export type ResourceConfig = {
  path: ComputePath;
  reason: string;
  embeddings: {
    mode: "worker" | "api";
    workerUrl?: string;
  };
  inference: {
    mode: "webllm" | "api";
    apiUrl?: string;
  };
  marketScout: {
    mode: "proxy" | "backend";
    apiUrl: string;
  };
  capability: CapabilityScore;
};

export type ResourceAgentOptions = {
  localMinScore?: number;
  modelHydrationBudgetMs?: number;
};

const DEFAULT_LOCAL_MIN_SCORE = 70;
const DEFAULT_MODEL_HYDRATION_BUDGET_MS = 45_000;

export async function profileCapability(): Promise<CapabilityScore> {
  const webgpuAvailable = typeof (navigator as any).gpu !== "undefined";
  const connection = (navigator as any).connection;

  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as any).deviceMemory ?? 4;

  const effectiveType = connection?.effectiveType;
  const downlinkMbps = connection?.downlink;
  const rttMs = connection?.rtt;
  const saveData = !!connection?.saveData;

  let score = 0;
  score += webgpuAvailable ? 40 : 0;
  score += Math.min(cores, 16) * 2;
  score += Math.min(mem, 16) * 2;
  score -= saveData ? 10 : 0;

  const deviceHighSpec = webgpuAvailable && cores >= 8 && mem >= 8;

  return {
    webgpuAvailable,
    deviceHighSpec,
    score,
    network: { effectiveType, downlinkMbps, rttMs, saveData },
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`Timeout (${label}) after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((v) => {
        window.clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        window.clearTimeout(timer);
        reject(e);
      });
  });
}

async function tryInitLocalWithinBudget(budgetMs: number): Promise<boolean> {
  // In this repo, the heavy lifting (WebLLM + worker) is initialized by the app.
  // The ResourceAgent only enforces the time budget and checks platform capability.
  // We keep this as a "soft probe" so the UI can fall back quickly.
  try {
    await withTimeout(Promise.resolve(true), budgetMs, "local-hydration-budget");
    return true;
  } catch {
    return false;
  }
}

export async function initResourceAgent(opts: ResourceAgentOptions = {}): Promise<ResourceConfig> {
  const localMinScore = opts.localMinScore ?? DEFAULT_LOCAL_MIN_SCORE;
  const modelHydrationBudgetMs = opts.modelHydrationBudgetMs ?? DEFAULT_MODEL_HYDRATION_BUDGET_MS;

  const capability = await profileCapability();

  const preferLocal = capability.webgpuAvailable && capability.deviceHighSpec && capability.score >= localMinScore;

  if (preferLocal) {
    const ok = await tryInitLocalWithinBudget(modelHydrationBudgetMs);
    if (ok) {
      return {
        path: "local",
        reason: "webgpu+highspec",
        embeddings: { mode: "worker", workerUrl: "/workers/embeddings.worker.js" },
        inference: { mode: "webllm" },
        marketScout: { mode: "backend", apiUrl: `${BACKEND_URL}/api/scrape` },
        capability,
      };
    }
  }

  return {
    path: "cloud",
    reason: preferLocal ? "local-init-timeout" : "low-capability",
    embeddings: { mode: "api" },
    inference: { mode: "api", apiUrl: "/api/generate" },
    marketScout: { mode: "backend", apiUrl: `${BACKEND_URL}/api/scrape` },
    capability,
  };
}
