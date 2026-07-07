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
    // Honest capability report: in-browser inference (WebLLM) is NOT
    // implemented in this build — generation always goes through the
    // serverless proxy. "local" path therefore means: local *embeddings*
    // (Transformers.js worker) + cloud inference.
    mode: "api";
    apiUrl: string;
  };
  marketScout: {
    mode: "proxy" | "backend";
    apiUrl: string;
  };
  capability: CapabilityScore;
};

export type ResourceAgentOptions = {
  localMinScore?: number;
};

const DEFAULT_LOCAL_MIN_SCORE = 70;

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

export async function initResourceAgent(opts: ResourceAgentOptions = {}): Promise<ResourceConfig> {
  const localMinScore = opts.localMinScore ?? DEFAULT_LOCAL_MIN_SCORE;

  const capability = await profileCapability();

  // "local" = run embeddings in a Transformers.js Web Worker on-device.
  // The actual worker init happens in the app; if it fails or times out at
  // runtime, embedSmart() falls back to the deterministic hashed embedding,
  // so this decision only needs capability signals (instant + honest).
  const preferLocal = capability.webgpuAvailable && capability.deviceHighSpec && capability.score >= localMinScore;

  if (preferLocal) {
    return {
      path: "local",
      reason: "webgpu+highspec: on-device embeddings, cloud inference",
      embeddings: { mode: "worker", workerUrl: "/workers/embeddings.worker.js" },
      inference: { mode: "api", apiUrl: "/api/generate" },
      marketScout: { mode: "backend", apiUrl: `${BACKEND_URL}/api/scrape` },
      capability,
    };
  }

  return {
    path: "cloud",
    reason: "low-capability: cloud embeddings + cloud inference",
    embeddings: { mode: "api" },
    inference: { mode: "api", apiUrl: "/api/generate" },
    marketScout: { mode: "backend", apiUrl: `${BACKEND_URL}/api/scrape` },
    capability,
  };
}
