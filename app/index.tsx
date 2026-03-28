import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import { initResourceAgent, type ResourceConfig } from "./lib/resourceAgent";
import { createEmbeddingsWorkerClient, type EmbeddingsClient } from "./lib/embeddings";

// --- Icons (Inline SVGs) ---
const Icons = {
  Cpu: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>,
  ShieldCheck: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>,
  Globe: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>,
  FileText: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>,
  Code: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  Play: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>,
  Terminal: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>,
  Database: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  Activity: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  Upload: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>,
  Download: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>,
  Alert: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
};

// --- Types ---
type WorkflowMode = 'expertise' | 'market';
type AgentStatus = 'idle' | 'working' | 'success' | 'error';
interface Job {
  id: number;
  title: string;
  company: string;
  requirements: string;
}

type VerificationState =
  | { status: 'idle' | 'working' }
  | { status: 'verified'; confidence: number; summaryHash: string }
  | { status: 'failed'; reason: string; summaryHash: string }
  | { status: 'overridden'; reason: string; disclaimer: string; summaryHash: string };

const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_DISCLAIMER = "Disclaimer: Automatic credential verification was inconclusive. Any certification claims should be treated as candidate-provided.";
const MISSING_API_HINT = "Set LLM_PROVIDER=nvidia and NVIDIA_API_KEY (or GEMINI_API_KEY) on the server, then redeploy.";

const normalizeTokens = (text: string) =>
  (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const simpleHash = (text: string) => {
  // Non-cryptographic hash (UI / demo only). Avoids storing the raw string.
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const embedText = (text: string, dims = 256) => {
  // Deterministic hashed bag-of-words embedding (client-only prototype).
  const vec = new Float32Array(dims);
  const tokens = normalizeTokens(text);
  for (const t of tokens) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = (h >>> 0) % dims;
    vec[idx] += 1;
  }
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] = vec[i] / norm;
  return vec;
};

const cosineSim = (a: Float32Array, b: Float32Array) => {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
};

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch {
    // ignore (PWA caching is best-effort)
  }
};

type GenerateApiResponse = { text: string } | { error: string; detail?: string };

const asErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
};

const isReadableExtract = (text: string) => {
  const t = (text || '').trim();
  if (!t) return false;
  const chars = t.length;
  if (chars < 80) return false;
  const printable = (t.match(/[A-Za-z0-9\s,.;:()\-/'"&]/g) || []).length;
  return printable / chars >= 0.75;
};

const decodeBase64Utf8 = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
};

const decodeBase64Bytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const extractPdfTextWithPdfJs = async (base64Data: string) => {
  try {
    const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = decodeBase64Bytes(base64Data);
    const loadingTask = pdfjsLib.getDocument({ data, useWorker: false });
    const pdf = await loadingTask.promise;

    const chunks: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const line = (textContent.items || [])
        .map((it: any) => (typeof it?.str === 'string' ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) chunks.push(line);
    }

    return chunks.join('\n').replace(/\s+\n/g, '\n').trim();
  } catch {
    return '';
  }
};

const bestEffortLocalExtract = async (mimeType: string, fileName: string, base64Data: string) => {
  const lowerMime = (mimeType || '').toLowerCase();
  const lowerName = (fileName || '').toLowerCase();

  if (lowerMime.startsWith('text/') || lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
    const text = decodeBase64Utf8(base64Data).trim();
    return text;
  }

  if (lowerMime.includes('pdf') || lowerName.endsWith('.pdf')) {
    // Robust parser for text PDFs via pdfjs. Image-only scans may still require server OCR.
    const parsed = await extractPdfTextWithPdfJs(base64Data);
    if (isReadableExtract(parsed)) return parsed;
    return '';
  }

  return '';
};

const getResumeOutputIssue = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return 'empty-output';

  const lower = trimmed.toLowerCase();
  if (lower === "here's a tailored resume summary" || lower === 'here is a tailored resume summary') {
    return 'placeholder-output';
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount < 30) return `too-short(${wordCount}-words)`;

  return '';
};

const inferTrendsFromProfile = (profile: string) => {
  const lower = (profile || '').toLowerCase();
  const buckets: Array<{ keywords: string[]; trends: string }> = [
    { keywords: ['data', 'sql', 'analytics', 'python'], trends: 'Data Analytics, SQL, BI' },
    { keywords: ['cloud', 'aws', 'gcp', 'azure'], trends: 'Cloud Engineering, DevOps, IaC' },
    { keywords: ['frontend', 'react', 'ui', 'typescript'], trends: 'Frontend Engineering, React, TypeScript' },
    { keywords: ['backend', 'api', 'node', 'java'], trends: 'Backend Services, APIs, Distributed Systems' },
    { keywords: ['ml', 'ai', 'model', 'pytorch'], trends: 'Machine Learning, Model Deployment, MLOps' },
  ];

  for (const bucket of buckets) {
    const hits = bucket.keywords.filter((k) => lower.includes(k)).length;
    if (hits >= 2) return bucket.trends;
  }

  return 'Tech / Software, Product Delivery, Cross-functional Collaboration';
};

const callGenerateApi = async (payload: {
  prompt?: string;
  parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
  model?: string;
  responseMimeType?: 'application/json' | 'text/plain';
  stream?: boolean;
}) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (payload.stream) headers.accept = 'text/event-stream';

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (payload.stream) {
    if (!res.ok) {
      const traceId = res.headers.get('x-trace-id') || '';
      let detail = '';
      let upstreamStatus = '';
      const resClone = res.clone();
      try {
        const parsed = await res.json() as { detail?: string; upstreamStatus?: number; error?: string; traceId?: string };
        detail = parsed.detail || parsed.error || '';
        if (typeof parsed.upstreamStatus === 'number') upstreamStatus = String(parsed.upstreamStatus);
        if (!traceId && parsed.traceId) detail = `${detail} | traceId=${parsed.traceId}`;
      } catch {
        try {
          detail = await resClone.text();
        } catch {
          detail = '';
        }
      }
      throw new Error(
        `stream-http-error status=${res.status}` +
          (upstreamStatus ? ` upstreamStatus=${upstreamStatus}` : '') +
          (traceId ? ` traceId=${traceId}` : '') +
          (detail ? ` detail=${detail}` : ''),
      );
    }
    // Streaming path is handled separately in flows that need incremental tokens.
    return res;
  }

  const json = (await res.json()) as GenerateApiResponse & { upstreamStatus?: number; traceId?: string; detail?: string };
  if (!('text' in json)) {
    throw new Error(
      (json.error || 'Generate API error') +
      (json.upstreamStatus ? ` upstreamStatus=${json.upstreamStatus}` : '') +
      (json.traceId ? ` traceId=${json.traceId}` : '') +
      (json.detail ? ` detail=${json.detail}` : ''),
    );
  }
  return json.text;
};

const fetchMarketHtmlViaProxy = async (targetUrl: string) => {
  const res = await fetch(`/api/market-scout?url=${encodeURIComponent(targetUrl)}`, {
    method: 'GET',
    headers: { 'accept': '*/*' },
  });
  if (!res.ok) throw new Error(`market-scout proxy error (${res.status})`);
  return await res.text();
};

const fetchRemotiveJobs = async (industry: string): Promise<Job[]> => {
  const target = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(industry)}`;
  const raw = await fetchMarketHtmlViaProxy(target);
  const data = JSON.parse(raw) as {
    jobs?: Array<{ title?: string; company_name?: string; tags?: string[]; candidate_required_location?: string }>;
  };
  const rows = Array.isArray(data?.jobs) ? data.jobs : [];
  return rows.slice(0, 3).map((j, i) => ({
    id: i + 1,
    title: (j.title || `Role ${i + 1}`).trim(),
    company: (j.company_name || '(Remotive)').trim(),
    requirements: [
      Array.isArray(j.tags) ? j.tags.slice(0, 4).join(', ') : '',
      j.candidate_required_location || '',
    ].filter(Boolean).join(' | ') || 'See listing details',
  }));
};

const fetchArbeitnowJobs = async (industry: string): Promise<Job[]> => {
  const target = `https://www.arbeitnow.com/api/job-board-api?search=${encodeURIComponent(industry)}`;
  const raw = await fetchMarketHtmlViaProxy(target);
  const data = JSON.parse(raw) as {
    data?: Array<{ title?: string; company_name?: string; tags?: string[]; location?: string }>;
  };
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows.slice(0, 3).map((j, i) => ({
    id: i + 1,
    title: (j.title || `Role ${i + 1}`).trim(),
    company: (j.company_name || '(Arbeitnow)').trim(),
    requirements: [
      Array.isArray(j.tags) ? j.tags.slice(0, 4).join(', ') : '',
      j.location || '',
    ].filter(Boolean).join(' | ') || 'See listing details',
  }));
};

const fetchBackendMarketScan = async (industry: string): Promise<Job[]> => {
  const backendBase = ((import.meta as any)?.env?.VITE_BACKEND_URL || '').trim();
  if (!backendBase) return [];

  const url = `${backendBase.replace(/\/$/, '')}/api/mock-market-scan?keywords=${encodeURIComponent(industry)}&limit=3`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`backend market scan error (${res.status})`);

  const json = await res.json() as {
    results?: Array<{ title?: string; company?: string; chunks?: Array<{ text?: string }> }>;
  };

  const rows = Array.isArray(json?.results) ? json.results : [];
  return rows.slice(0, 3).map((r, i) => ({
    id: i + 1,
    title: r.title || `Role ${i + 1}`,
    company: r.company || '(Backend)',
    requirements: r.chunks?.[0]?.text || 'See listing details',
  }));
};

const parseIndeedJobs = (html: string): Job[] => {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const anchors = Array.from(doc.querySelectorAll('a')).filter(a => (a.getAttribute('href') || '').includes('/viewjob'));
    const uniq = new Map<string, Job>();
    let id = 1;
    for (const a of anchors.slice(0, 25)) {
      const title = (a.textContent || '').trim().replace(/\s+/g, ' ');
      if (!title || title.length < 4) continue;
      const key = title.toLowerCase();
      if (uniq.has(key)) continue;
      uniq.set(key, {
        id: id++,
        title,
        company: '(Parsed via Market Proxy)',
        requirements: 'See listing (parsed HTML proxy)'
      });
      if (uniq.size >= 3) break;
    }
    return Array.from(uniq.values());
  } catch {
    return [];
  }
};

// --- Live Application Logic ---

const App = () => {
  const [workflow, setWorkflow] = useState<WorkflowMode>('expertise');

  const [resourceConfig, setResourceConfig] = useState<ResourceConfig | null>(null);
  const embeddingsClientRef = useRef<EmbeddingsClient | null>(null);
  
  // State
  const [userInput, setUserInput] = useState("Senior Frontend Engineer. 5 years exp. React, Node.js. Certified AWS Developer.");
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resumeOutput, setResumeOutput] = useState("");
  const [generationError, setGenerationError] = useState("");

  // Minimal user metadata (SRS FR-4.1)
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPhone, setUserPhone] = useState("");

  const [verification, setVerification] = useState<VerificationState>({ status: 'idle' });
  const [manualCorrection, setManualCorrection] = useState("");
  const [overrideDisclaimer, setOverrideDisclaimer] = useState(DEFAULT_DISCLAIMER);
  
  // Market Flow State
  const [marketIndustry, setMarketIndustry] = useState("Tech / Software");
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [missingSkills, setMissingSkills] = useState<string[]>([]);
  const [gapResponse, setGapResponse] = useState("");

  const marketCacheRef = useRef<Record<string, { jobs: Job[]; cachedAtIso: string }>>({});
  const sessionTimeoutRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);
  
  const [agentStatus, setAgentStatus] = useState<Record<string, AgentStatus>>({
    ingestion: "idle",
    verifier: "idle",
    scout: "idle",
    analyst: "idle",
    synthesizer: "idle"
  });

  const logRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    // Browser-first bootstrap: SW (Cache API) + ResourceAgent selection
    registerServiceWorker();
    (async () => {
      try {
        const cfg = await initResourceAgent();
        setResourceConfig(cfg);
        addLog(`SYS: ResourceAgent > path=${cfg.path} (${cfg.reason}), score=${cfg.capability.score.toFixed(0)}.`);

        if (cfg.path === 'local') {
          // Start embeddings worker early (keeps UI responsive)
          const client = createEmbeddingsWorkerClient(
            new URL('./workers/embeddings.worker.ts', import.meta.url)
          );
          embeddingsClientRef.current = client;
          addLog('SYS: Vector Engine > Web Worker initialized (Transformers.js).');
        }
      } catch (e) {
        addLog(`WARN: ResourceAgent init failed; falling back to cloud. (${e})`);
        setResourceConfig({
          path: 'cloud',
          reason: 'init-error',
          embeddings: { mode: 'api' },
          inference: { mode: 'api', apiUrl: '/api/generate' },
          marketScout: { mode: 'proxy', apiUrl: '/api/market-scout' },
          capability: { webgpuAvailable: false, deviceHighSpec: false, score: 0, network: {} },
        });
      }
    })();

    return () => {
      embeddingsClientRef.current?.dispose();
      embeddingsClientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
  };

  const purgeSession = (reason: string) => {
    setUserInput("");
    setResumeOutput("");
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}] SYS: Session purged (${reason}).`]);
    setSelectedJob(null);
    setAvailableJobs([]);
    setMissingSkills([]);
    setGapResponse("");
    setAgentStatus({ ingestion: "idle", verifier: "idle", scout: "idle", analyst: "idle", synthesizer: "idle" });
    setVerification({ status: 'idle' });
    setManualCorrection("");
    // Clear the file input handle (prevents accidental re-read)
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetSessionTimeout = () => {
    if (sessionTimeoutRef.current) window.clearTimeout(sessionTimeoutRef.current);
    sessionTimeoutRef.current = window.setTimeout(() => {
      // Do not purge while a workflow is running; defer timeout instead.
      if (isProcessingRef.current) {
        addLog('SYS: Session timeout deferred while processing.');
        resetSessionTimeout();
        return;
      }
      purgeSession('timeout');
    }, SESSION_TIMEOUT_MS);
  };

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    // Ephemeral session behavior (SRS FR-1.6)
    const onBeforeUnload = () => {
      try {
        purgeSession('tab-close');
      } catch {
        // ignore
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    const onActivity = () => resetSessionTimeout();
    window.addEventListener('click', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('touchstart', onActivity);
    window.addEventListener('scroll', onActivity, { passive: true });

    resetSessionTimeout();

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('click', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('touchstart', onActivity);
      window.removeEventListener('scroll', onActivity);
      if (sessionTimeoutRef.current) window.clearTimeout(sessionTimeoutRef.current);
    };
  }, []);

  const getAI = () => {
      // Legacy path: keep Gemini client-side only for local dev / prototype.
      // Production path uses /api/generate (serverless/edge) to avoid exposing API keys.
      if (!process.env.API_KEY) return null;
      return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  const llmText = async (prompt: string, responseMimeType?: 'application/json' | 'text/plain') => {
    // Prefer serverless proxy when available. If it fails (e.g., local dev without Netlify), fall back to client-side Gemini.
    try {
      const text = await callGenerateApi({ prompt, responseMimeType });
      if (typeof text === 'string') return text;
      throw new Error('Unexpected generate API response');
    } catch {
      const ai = getAI();
      if (!ai) throw new Error(`No API available (missing API key and /api/generate unreachable). ${MISSING_API_HINT}`);
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: responseMimeType ? { responseMimeType } : undefined,
      });
      return response.text;
    }
  };

  const llmStreamText = async (systemInstruction: string, message: string, onChunk: (t: string) => void) => {
    // Traceback-first mode: strict server stream, no client-model fallback.
    const res = (await callGenerateApi({
      prompt: `${systemInstruction}\n\n${message}`,
      stream: true,
    })) as Response;

    if (!res.body) throw new Error('stream-body-missing');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventsSeen = 0;
    let eventsParsed = 0;
    let chunksEmitted = 0;
    let parseErrorCount = 0;
    let lastParseError = '';
    let lastEventPreview = '';

    const consumeEvent = (evtRaw: string) => {
      const evt = evtRaw.trim();
      if (!evt) return;

      eventsSeen += 1;
      lastEventPreview = evt.slice(0, 240);

      // Prefer SSE data-line payloads, but also support raw JSON payloads.
      const dataLine = evt.split('\n').find((l) => l.startsWith('data: '));
      const payload = (dataLine ? dataLine.slice('data: '.length) : evt).trim();
      if (!payload || payload === '[DONE]') return;

      try {
        const parsed = JSON.parse(payload);
        eventsParsed += 1;

        if (parsed?.error) {
          throw new Error(`upstream-payload-error: ${JSON.stringify(parsed.error)}`);
        }

        const t =
          parsed?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p?.text ?? '')
            .join('') ?? '';

        if (t) {
          chunksEmitted += 1;
          onChunk(t);
        }
      } catch (e) {
        parseErrorCount += 1;
        lastParseError = asErrorMessage(e);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const evt of events) consumeEvent(evt);
    }

    // Flush any final payload even if the upstream omitted trailing SSE delimiter.
    if (buffer.trim()) consumeEvent(buffer);

    if (chunksEmitted === 0) {
      const diag = {
        error: 'empty-stream-output',
        eventsSeen,
        eventsParsed,
        chunksEmitted,
        parseErrorCount,
        lastParseError,
        lastEventPreview,
      };
      throw new Error(JSON.stringify(diag));
    }
  };

  const embedSmart = async (text: string) => {
    // Local-first: use worker embeddings if initialized; else fall back to deterministic prototype embed.
    const client = embeddingsClientRef.current;
    if (resourceConfig?.path === 'local' && client) {
      try {
        const timeoutMs = 12000;
        const timed = await Promise.race([
          client.embed(text),
          new Promise<Float32Array>((_, reject) =>
            window.setTimeout(() => reject(new Error(`embedding-timeout-${timeoutMs}ms`)), timeoutMs),
          ),
        ]);
        return timed;
      } catch (e) {
        addLog(`WARN: Vector Engine fallback > ${asErrorMessage(e)}`);
        return embedText(text);
      }
    }
    return embedText(text);
  };

  const verifyCredentialsNow = async (profileText: string) => {
    const summaryHash = simpleHash(profileText);
    setVerification({ status: 'working' });
    setAgentStatus(prev => ({ ...prev, verifier: 'working' }));
    addLog('AGNT: Verifier > Validating credentials (immediate)...');

    try {
      const text = await llmText(
        `You are a credential verifier.
Given ONLY the following candidate profile text, determine whether certification claims are plausibly verifiable.

Return STRICT JSON with keys:
- status: "verified" | "failed"
- confidence: number from 0 to 1
- reason: short string

Profile text:\n${profileText}`,
        'application/json'
      );

      const parsed = JSON.parse(text) as { status: 'verified' | 'failed'; confidence: number; reason: string };
      if (parsed.status === 'verified') {
        setVerification({ status: 'verified', confidence: parsed.confidence ?? 1, summaryHash });
        setAgentStatus(prev => ({ ...prev, verifier: 'success' }));
        addLog(`AGNT: Verifier > Verified (confidence ${(parsed.confidence ?? 1).toFixed(2)}).`);
      } else {
        setVerification({ status: 'failed', reason: parsed.reason || 'Verification failed', summaryHash });
        setAgentStatus(prev => ({ ...prev, verifier: 'error' }));
        addLog(`AGNT: Verifier > FAILED: ${parsed.reason || 'Verification failed'}`);
      }
    } catch (e) {
      setVerification({ status: 'failed', reason: `Verifier unavailable: ${asErrorMessage(e)}`, summaryHash });
      setAgentStatus(prev => ({ ...prev, verifier: 'error' }));
      addLog(`ERR: Verifier failed > ${asErrorMessage(e)}`);
    }
  };

  // --- Actions ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      resetSessionTimeout();

      setAgentStatus(prev => ({...prev, ingestion: 'working'}));
      addLog(`AGNT: Ingestion > Reading ${file.name}...`);
      setIsProcessing(true);

      const reader = new FileReader();
      reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          try {
              let nextText: string;
              let serverOcrError = '';

              try {
                nextText = await callGenerateApi({
                  parts: [
                    { inlineData: { mimeType: file.type, data: base64Data } },
                    { text: "OCR and Summarize: Extract the candidate's core skills, years of experience, and certifications from this document. Return a plain text summary." }
                  ],
                  responseMimeType: 'text/plain'
                }) as unknown as string;
              } catch (e) {
                serverOcrError = asErrorMessage(e);
                addLog(`WARN: Ingestion > Server OCR failed, trying fallback. ${serverOcrError}`);

                const localExtracted = await bestEffortLocalExtract(file.type, file.name, base64Data);
                if (localExtracted && localExtracted.length >= 40) {
                  nextText = localExtracted;
                  addLog('AGNT: Ingestion > Local extraction fallback used.');
                } else {
                // Final fallback: client-side Gemini if explicitly enabled (dev only).
                const ai = getAI();
                  if (!ai) {
                    throw new Error(
                      `OCR unavailable: /api/generate failed (${serverOcrError || 'unknown'}) and local PDF extraction could not recover readable text. ` +
                      `Use a text-based PDF or restore server OCR by configuring the server env. ${MISSING_API_HINT}`,
                    );
                  }
                  const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: {
                      parts: [
                        { inlineData: { mimeType: file.type, data: base64Data } },
                        { text: "OCR and Summarize: Extract the candidate's core skills, years of experience, and certifications from this document. Return a plain text summary." }
                      ]
                    }
                  });
                  nextText = response.text;
                }
              }

                setUserInput(nextText);
              addLog("AGNT: Ingestion > OCR Complete. Profile updated.");
              setAgentStatus(prev => ({...prev, ingestion: 'success'}));

                // SRS FR-1.2: verify immediately upon upload
                await verifyCredentialsNow(nextText);
          } catch (error) {
              addLog(`ERR: Ingestion failed > ${error}`);
              setAgentStatus(prev => ({...prev, ingestion: 'error'}));
          } finally {
              setIsProcessing(false);
          }
      };
      reader.readAsDataURL(file);
  };

  const streamResumeWithQualityRetry = async (
    systemInstruction: string,
    baseMessage: string,
    maxAttempts = 3,
  ) => {
    let lastIssue = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let fullText = '';
      setResumeOutput('');

      const retryRules =
        attempt === 1
          ? ''
          : `

RETRY ${attempt}/${maxAttempts}:
Previous output was invalid (${lastIssue}).
Output requirements:
- 90 to 140 words.
- Plain text only.
- No preface like "Here is your summary".
- Include at least 3 concrete role-relevant achievements.
- End with a clear closing value proposition sentence.`;

      await llmStreamText(
        systemInstruction,
        `${baseMessage}${retryRules}`,
        (t) => {
          fullText += t;
          setResumeOutput(fullText);
        },
      );

      const issue = getResumeOutputIssue(fullText);
      if (!issue) return fullText;

      lastIssue = issue;
      addLog(`SYS: Synthesizer quality retry ${attempt}/${maxAttempts} triggered by ${issue}.`);
    }

    // Escalation: strict non-stream generation often returns more complete text when stream chunks are too short.
    const strictPrompt = `${systemInstruction}

${baseMessage}

STRICT OUTPUT RULES:
- Return only a polished resume summary paragraph.
- 110 to 150 words.
- Include role fit, 3 concrete achievements/strengths, and domain keywords.
- No bullets, no heading, no preface.
- End with one concise impact sentence.`;
    const fallbackText = await llmText(strictPrompt, 'text/plain');
    const fallbackIssue = getResumeOutputIssue(fallbackText);
    if (!fallbackIssue) {
      setResumeOutput(fallbackText);
      addLog('SYS: Synthesizer fallback succeeded via strict non-stream generation.');
      return fallbackText;
    }

    throw new Error(`Invalid synthesis output after ${maxAttempts} attempts: ${fallbackIssue || lastIssue || 'unknown-issue'}`);
  };

  const runExpertiseFlow = async () => {
    resetSessionTimeout();
    setIsProcessing(true);
    setLogs([]);
    setResumeOutput("");
    setGenerationError("");
    setAgentStatus({ ingestion: agentStatus.ingestion === 'success' ? 'success' : 'idle', verifier: "working", scout: "idle", analyst: "idle", synthesizer: "idle" });
    
    try {
      // 1. Verifier gate (SRS FR-1.2)
      const mustVerify = verification.status === 'idle' || verification.status === 'working';
      if (mustVerify) {
        await verifyCredentialsNow(userInput);
      }

      // Block unless verified or overridden
      if (verification.status === 'failed') {
        addLog('SYS: Resume synthesis halted until you correct or override verification.');
        setGenerationError('Verification failed. Please correct details or override with disclaimer before synthesis.');
        setAgentStatus(prev => ({ ...prev, verifier: 'error' }));
        return;
      }

      addLog('AGNT: Verifier > Gate passed.');
      setAgentStatus(prev => ({ ...prev, verifier: "success", scout: "working" }));

      // 2. Market Scout
      addLog("AGNT: Scout > Identifying global trends...");
      let trends = '';
      try {
        const trendsRaw = await llmText(
          `For this profile: "${userInput}", return EXACTLY a JSON array of 3 short skill phrases only. Example: ["Skill A", "Skill B", "Skill C"].`,
          'application/json',
        );
        try {
          const arr = JSON.parse(trendsRaw);
          const list = Array.isArray(arr) ? arr.slice(0, 3).map((x) => String(x || '').trim()).filter(Boolean) : [];
          trends = list.join(', ');
        } catch {
          trends = trendsRaw;
        }
      } catch (scoutErr) {
        trends = inferTrendsFromProfile(userInput);
        addLog(`WARN: Scout > Trends generation fallback used. ${asErrorMessage(scoutErr)} ${MISSING_API_HINT}`);
      }
      addLog(`AGNT: Scout > Trends: ${trends}`);
      setAgentStatus(prev => ({ ...prev, scout: "success", analyst: "working" }));

      // 3. Vector Analyst
      addLog("AGNT: Analyst > Computing Vector Embeddings...");
      const userVec = await embedSmart(userInput);
      const trendVec = await embedSmart(trends);
      const score = (cosineSim(userVec as any, trendVec as any) * 100).toFixed(1);
      addLog(`AGNT: Analyst > Match Score: ${score}%`);
      setAgentStatus(prev => ({ ...prev, analyst: "success", synthesizer: "working" }));

      // 4. Synthesizer
      addLog("AGNT: Synthesizer > Stream generating...");
      const fullText = await streamResumeWithQualityRetry(
        "Write a high-impact resume summary (max 150 words) incorporating the user profile and these market trends. Output plain text only with no preface like 'Here is the summary'.",
        `Profile: ${userInput}\nTrends: ${trends}`,
        3,
      );

      const outputIssue = getResumeOutputIssue(fullText);
      if (outputIssue) {
        throw new Error(`Invalid synthesis output: ${outputIssue}`);
      }

      // If verification was overridden, prepend disclaimer
      if (verification.status === 'overridden') {
        setResumeOutput(`${verification.disclaimer}\n\n${fullText}`);
      } else {
        setResumeOutput(fullText);
      }
      setGenerationError("");
      setAgentStatus(prev => ({ ...prev, synthesizer: "success" }));

    } catch (e) {
      addLog(`ERR: ${asErrorMessage(e)}`);
      setResumeOutput("");
      setGenerationError(`Synthesis failed: ${asErrorMessage(e)}`);
      setAgentStatus(prev => ({ ...prev, synthesizer: "error" }));
    } finally {
      setIsProcessing(false);
    }
  };

  const scanMarket = async () => {
    resetSessionTimeout();
    setIsProcessing(true);
    setAvailableJobs([]);
    setSelectedJob(null);
    setResumeOutput("");
    setGenerationError("");
    setAgentStatus({ ingestion: "idle", verifier: "idle", scout: "working", analyst: "idle", synthesizer: "idle" });

    addLog(`AGNT: Scout > Scanning live market for "${marketIndustry}"...`);
    
    try {
        // Prefer public live job APIs first to reduce fallback usage.
        try {
          const remotiveJobs = await fetchRemotiveJobs(marketIndustry);
          if (remotiveJobs.length) {
            setAvailableJobs(remotiveJobs);
            marketCacheRef.current[marketIndustry] = { jobs: remotiveJobs, cachedAtIso: new Date().toISOString() };
            addLog(`AGNT: Scout > Loaded ${remotiveJobs.length} live jobs via Remotive API.`);
            setAgentStatus(prev => ({ ...prev, scout: "success" }));
            return;
          }
        } catch {
          // ignore and continue
        }

        try {
          const arbeitnowJobs = await fetchArbeitnowJobs(marketIndustry);
          if (arbeitnowJobs.length) {
            setAvailableJobs(arbeitnowJobs);
            marketCacheRef.current[marketIndustry] = { jobs: arbeitnowJobs, cachedAtIso: new Date().toISOString() };
            addLog(`AGNT: Scout > Loaded ${arbeitnowJobs.length} live jobs via Arbeitnow API.`);
            setAgentStatus(prev => ({ ...prev, scout: "success" }));
            return;
          }
        } catch {
          // ignore and continue
        }

        // HTML job-board parsing fallback.
        try {
          const q = encodeURIComponent(marketIndustry);
          const html = await fetchMarketHtmlViaProxy(`https://www.indeed.com/jobs?q=${q}`);
          const parsedJobs = parseIndeedJobs(html);
          if (parsedJobs.length) {
            setAvailableJobs(parsedJobs);
            marketCacheRef.current[marketIndustry] = { jobs: parsedJobs, cachedAtIso: new Date().toISOString() };
            addLog(`AGNT: Scout > Parsed ${parsedJobs.length} jobs via Market Proxy.`);
            setAgentStatus(prev => ({ ...prev, scout: "success" }));
            return;
          }
        } catch {
          // ignore and fall back
        }

        // Backend-assisted fallback before LLM fallback.
        try {
          const backendJobs = await fetchBackendMarketScan(marketIndustry);
          if (backendJobs.length) {
            setAvailableJobs(backendJobs);
            marketCacheRef.current[marketIndustry] = { jobs: backendJobs, cachedAtIso: new Date().toISOString() };
            addLog(`AGNT: Scout > Loaded ${backendJobs.length} jobs via backend fallback.`);
            setAgentStatus(prev => ({ ...prev, scout: "success" }));
            return;
          }
        } catch {
          // ignore and continue
        }

        const text = await llmText(
          `Find 3 currently active or realistic high-demand job listings for the industry: "${marketIndustry}".
Return strictly a JSON array with objects containing: "id" (number), "title", "company", "requirements" (short string).`,
          'application/json'
        );

        const jobs = JSON.parse(text);
        setAvailableJobs(jobs);
        marketCacheRef.current[marketIndustry] = { jobs, cachedAtIso: new Date().toISOString() };
        addLog(`AGNT: Scout > Found ${jobs.length} open positions.`);
        setAgentStatus(prev => ({ ...prev, scout: "success" }));
    } catch (e) {
        const cached = marketCacheRef.current[marketIndustry];
        if (cached?.jobs?.length) {
          setAvailableJobs(cached.jobs);
          addLog(`WARN: Scout failed; using cached top jobs (cachedAt=${cached.cachedAtIso}).`);
          setAgentStatus(prev => ({ ...prev, scout: "success" }));
        } else {
          // Minimal built-in fallback dataset (SRS NFR 5.3)
          const fallback: Job[] = [
            { id: 1, title: "Software Engineer", company: "(Fallback)" , requirements: "React/TypeScript, APIs, testing, CI/CD" },
            { id: 2, title: "Data Analyst", company: "(Fallback)" , requirements: "SQL, dashboards, Python, statistics" },
            { id: 3, title: "Cloud Engineer", company: "(Fallback)" , requirements: "AWS/GCP, IaC, networking, observability" },
          ];
          setAvailableJobs(fallback);
          addLog(`WARN: Scout failed; using built-in fallback jobs.`);
          setAgentStatus(prev => ({ ...prev, scout: "success" }));
        }
    } finally {
        setIsProcessing(false);
    }
  };

  const analyzeGap = async (job: Job) => {
    setSelectedJob(job);
    setGenerationError("");
    setAgentStatus(prev => ({ ...prev, analyst: "working" }));
    addLog(`AGNT: Analyst > Gap Analysis for ${job.title}...`);

    try {
        const text = await llmText(
          `Compare User Profile: "${userInput}" 
vs Job Requirements: "${job.requirements}".
Identify up to 3 missing key skills or qualifications.
Return a JSON array of strings (the missing skills). If none, return empty array.`,
          'application/json'
        );
        const gaps = JSON.parse(text);
        setMissingSkills(gaps);
        if (gaps.length > 0) {
             addLog(`AGNT: Analyst > Detected ${gaps.length} skill gaps.`);
        } else {
             addLog("AGNT: Analyst > Perfect Match! No gaps.");
        }
        setAgentStatus(prev => ({ ...prev, analyst: "success" }));
    } catch (e) {
        addLog(`ERR: Analysis failed > ${e}`);
    }
  };

  const synthesizeMarketResume = async () => {
      if (!selectedJob) return;

      if (missingSkills.length > 0 && !gapResponse.trim()) {
        const msg = 'Please provide gap-fill details before generating this resume.';
        addLog(`SYS: ${msg}`);
        setGenerationError(msg);
        setAgentStatus(prev => ({ ...prev, synthesizer: "error" }));
        return;
      }

      setIsProcessing(true);
      setResumeOutput("");
      setGenerationError("");
      setAgentStatus(prev => ({ ...prev, synthesizer: "working" }));
      addLog("AGNT: Synthesizer > Bridging gaps and generating tailored resume...");

      try {
          const fullText = await streamResumeWithQualityRetry(
              "You are an expert Resume Strategist. Create a tailored resume summary that positions the candidate for the specific job, incorporating their new gap-fill explanation seamlessly. Output only the final summary text with no heading or preface.",
          `Target Job: ${selectedJob.title} at ${selectedJob.company}
    Requirements: ${selectedJob.requirements}
    Candidate Profile: ${userInput}
    Gap Explanation (Dynamic Interview): ${gapResponse}

    Generate the resume summary now.`,
          3,
          );

          const outputIssue = getResumeOutputIssue(fullText);
          if (outputIssue) {
            throw new Error(`Invalid synthesis output: ${outputIssue}`);
          }

          setGenerationError("");
          setAgentStatus(prev => ({ ...prev, synthesizer: "success" }));
      } catch (e) {
          addLog(`ERR: Synthesis failed > ${asErrorMessage(e)}`);
          setResumeOutput("");
          setGenerationError(`Synthesis failed: ${asErrorMessage(e)}`);
          setAgentStatus(prev => ({ ...prev, synthesizer: "error" }));
      } finally {
          setIsProcessing(false);
      }
  };

  const downloadResume = () => {
      const blob = new Blob([resumeOutput], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'generated_resume.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      addLog("SYS: File downloaded successfully.");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-cyan-900 selection:text-cyan-50 flex flex-col font-sans">
      
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center text-slate-900 font-bold shadow-[0_0_15px_rgba(6,182,212,0.5)]">
              AI
            </div>
            <h1 className="font-bold text-xl tracking-tight">ARS-MME <span className="text-slate-500 font-normal text-sm ml-2 hidden sm:inline">| Agentic Resume Engine</span></h1>
          </div>
          <div className="flex bg-slate-800 rounded-lg p-1">
            <button onClick={() => setWorkflow('expertise')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${workflow === 'expertise' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Expertise Mode</button>
            <button onClick={() => setWorkflow('market')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${workflow === 'market' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Market Mode</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT COLUMN: Controls */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-2xl">

                {/* User Metadata (SRS FR-4.1) */}
                <div className="mb-6">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">User Metadata (Ephemeral)</div>
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="Name"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white"
                    />
                    <input
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      placeholder="Email"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white"
                    />
                    <input
                      value={userPhone}
                      onChange={(e) => setUserPhone(e.target.value)}
                      placeholder="Phone"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white"
                    />
                    <div className="text-[10px] text-slate-500 font-mono">
                      Stored: name/email/phone + verification hash only (session memory).
                    </div>
                  </div>
                </div>

                {workflow === 'expertise' ? (
                  <>
                     <div className="flex items-center gap-2 mb-4 text-cyan-400">
                      <Icons.FileText />
                      <h2 className="font-semibold text-lg">Input Profile</h2>
                    </div>
                    {/* Ingestion Agent: Upload */}
                    <div 
                      className="border-2 border-dashed border-slate-700 rounded-lg p-4 mb-4 text-center cursor-pointer hover:border-cyan-500 hover:bg-slate-800/50 transition-colors group"
                      onClick={() => fileInputRef.current?.click()}
                    >
                        <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.jpg,.png,.txt" onChange={handleFileUpload} />
                        <div className="text-slate-500 group-hover:text-cyan-400 flex flex-col items-center gap-2">
                           <Icons.Upload />
                           <span className="text-xs font-mono">DRAG RESUME OR CLICK TO UPLOAD</span>
                        </div>
                    </div>

                    <textarea 
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      className="w-full h-40 bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors resize-none font-mono"
                      placeholder="Paste resume content or upload file..."
                    />

                    {/* Verification Failure UI (SRS FR-1.2) */}
                    {verification.status === 'failed' && (
                      <div className="mt-4 p-3 bg-red-950/30 border border-red-900/50 rounded-lg animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex items-center gap-2 text-red-400 text-xs font-bold mb-2">
                          <Icons.Alert /> VERIFICATION FAILED
                        </div>
                        <div className="text-xs text-slate-300 mb-2">Reason: <span className="text-white font-mono">{verification.reason}</span></div>
                        <textarea
                          value={manualCorrection}
                          onChange={(e) => setManualCorrection(e.target.value)}
                          placeholder="Option A: Correct certification details here (issuer, ID, dates, links)..."
                          className="w-full h-20 bg-slate-950 border border-red-900/50 rounded p-2 text-xs text-white focus:border-red-500"
                        />
                        <textarea
                          value={overrideDisclaimer}
                          onChange={(e) => setOverrideDisclaimer(e.target.value)}
                          placeholder="Option B: Provide a disclaimer for override..."
                          className="w-full h-16 mt-2 bg-slate-950 border border-red-900/50 rounded p-2 text-xs text-white focus:border-red-500"
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => {
                              const corrected = manualCorrection.trim();
                              if (!corrected) {
                                addLog('SYS: Add corrections first (or override).');
                                return;
                              }
                              const updated = `${userInput}\n\nCorrections/Proofs: ${corrected}`;
                              setUserInput(updated);
                              void verifyCredentialsNow(updated);
                            }}
                            className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded"
                          >
                            Re-Verify With Corrections
                          </button>
                          <button
                            onClick={() => {
                              if (verification.status !== 'failed') return;
                              setVerification({ status: 'overridden', reason: verification.reason, disclaimer: overrideDisclaimer, summaryHash: verification.summaryHash });
                              setAgentStatus(prev => ({ ...prev, verifier: 'success' }));
                              addLog('SYS: Verification overridden; disclaimer will be included.');
                            }}
                            className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded"
                          >
                            Override With Disclaimer
                          </button>
                        </div>
                      </div>
                    )}
                    
                    <button 
                      onClick={runExpertiseFlow}
                      disabled={isProcessing}
                      className={`w-full mt-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${
                        isProcessing 
                          ? 'bg-slate-700 text-slate-400 cursor-wait' 
                          : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-900/20'
                      }`}
                    >
                      {isProcessing ? <><span className="animate-spin">⟳</span> Processing...</> : <><Icons.Play /> Initiate Synthesis</>}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-4 text-purple-400">
                      <Icons.Globe />
                      <h2 className="font-semibold text-lg">Market Scanner</h2>
                    </div>
                    
                    <div className="mb-4">
                        <label className="text-xs text-slate-400 block mb-1">Target Industry</label>
                        <input 
                            type="text" 
                            value={marketIndustry}
                            onChange={(e) => setMarketIndustry(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white"
                        />
                    </div>

                    <button 
                      onClick={scanMarket}
                      disabled={isProcessing}
                      className="w-full py-2 mb-6 rounded-lg font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-lg flex justify-center items-center gap-2"
                    >
                       <Icons.Globe /> Scan Live Jobs
                    </button>

                    {/* Job List */}
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                        {availableJobs.map(job => (
                            <div 
                                key={job.id} 
                                onClick={() => analyzeGap(job)}
                                className={`p-3 rounded border text-left cursor-pointer transition-all ${selectedJob?.id === job.id ? 'border-purple-500 bg-purple-900/20' : 'border-slate-800 hover:border-slate-600'}`}
                            >
                                <div className="font-bold text-sm text-slate-200">{job.title}</div>
                                <div className="text-xs text-slate-400">{job.company}</div>
                            </div>
                        ))}
                    </div>

                    {/* Gap Analysis / Dynamic Interview */}
                    {selectedJob && missingSkills.length > 0 && (
                        <div className="mt-4 p-3 bg-red-950/30 border border-red-900/50 rounded-lg animate-in fade-in slide-in-from-bottom-2">
                             <div className="flex items-center gap-2 text-red-400 text-xs font-bold mb-2">
                                <Icons.Alert /> GAP DETECTED
                             </div>
                             <p className="text-xs text-slate-300 mb-2">Missing: <span className="text-white font-mono">{missingSkills.join(", ")}</span></p>
                             <textarea 
                                value={gapResponse}
                                onChange={(e) => setGapResponse(e.target.value)}
                                placeholder={`Describe your experience with ${missingSkills[0]} to bridge the gap...`}
                                className="w-full h-20 bg-slate-950 border border-red-900/50 rounded p-2 text-xs text-white focus:border-red-500"
                             />
                             <button onClick={synthesizeMarketResume} className="w-full mt-2 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded">
                                Fill Gap & Generate
                             </button>
                        </div>
                    )}
                     {selectedJob && missingSkills.length === 0 && (
                        <button onClick={synthesizeMarketResume} className="w-full mt-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded">
                           Perfect Match! Generate
                        </button>
                    )}
                  </>
                )}
              </div>

              {/* Agent Status */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                 <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Agent Swarm Status</h3>
                 <div className="space-y-4">
                    <AgentRow name="Ingestion (OCR)" icon={<Icons.Upload />} status={agentStatus.ingestion} />
                    <AgentRow name="Verifier" icon={<Icons.ShieldCheck />} status={agentStatus.verifier} />
                    <AgentRow name="Market Scout" icon={<Icons.Globe />} status={agentStatus.scout} />
                    <AgentRow name="Gap Analyst" icon={<Icons.Cpu />} status={agentStatus.analyst} />
                    <AgentRow name="Synthesizer" icon={<Icons.Code />} status={agentStatus.synthesizer} />
                 </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Output */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              
              {/* Terminal */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs h-48 overflow-hidden flex flex-col shadow-inner">
                <div className="flex items-center gap-2 text-slate-500 border-b border-slate-800 pb-2 mb-2">
                  <Icons.Terminal />
                  <span>SYSTEM_LOGS // MODE_{workflow.toUpperCase()}</span>
                </div>
                <div ref={logRef} className="flex-1 overflow-y-auto space-y-1 text-slate-300">
                  {logs.length === 0 && <span className="text-slate-600 italic">Ready...</span>}
                  {logs.map((log, i) => (
                    <div key={i} className="break-all border-l-2 border-transparent hover:border-cyan-800 pl-2">
                      <span className={log.includes("ERR") ? "text-red-400" : log.includes("AGNT") ? "text-cyan-400" : "text-emerald-400"}>
                        {log}
                      </span>
                    </div>
                  ))}
                  {isProcessing && <div className="text-cyan-500 terminal-cursor">_</div>}
                </div>
              </div>

              {/* Resume Output */}
              <div className="flex-1 bg-white rounded-xl border border-slate-200 p-8 text-slate-800 shadow-2xl relative min-h-[500px] flex flex-col">
                <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r rounded-t-xl ${workflow === 'market' ? 'from-purple-500 to-pink-600' : 'from-cyan-500 to-blue-600'}`}></div>
                
                <div className="flex justify-between items-start mb-4">
                    <h2 className="text-lg font-bold text-slate-700">Generated Resume Document</h2>
                    {resumeOutput && (
                        <button onClick={downloadResume} className="flex items-center gap-1 text-xs font-bold text-cyan-600 hover:text-cyan-800 border border-cyan-200 px-3 py-1 rounded hover:bg-cyan-50 transition-colors">
                            <Icons.Download /> DOWNLOAD .MD
                        </button>
                    )}
                </div>

                {generationError && (
                  <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {generationError}
                  </div>
                )}

                {!resumeOutput ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4 opacity-50">
                    <Icons.FileText />
                    <p>Generated content will appear here...</p>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none flex-1">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{resumeOutput}</pre>
                  </div>
                )}
              </div>

            </div>
          </div>
      </main>
    </div>
  );
};

// Helper Component for Agent Status
const AgentRow = ({ name, icon, status }: { name: string, icon: React.ReactNode, status: string }) => {
    let statusColor = "bg-slate-800";
    let statusText = "WAITING";
    let pulse = false;

    if (status === "working") {
        statusColor = "bg-yellow-500/20 text-yellow-500 border-yellow-500/50";
        statusText = "PROCESSING";
        pulse = true;
    } else if (status === "success") {
        statusColor = "bg-emerald-500/20 text-emerald-500 border-emerald-500/50";
        statusText = "COMPLETE";
    } else if (status === "error") {
        statusColor = "bg-red-500/20 text-red-500 border-red-500/50";
        statusText = "FAILED";
    }

    return (
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800/50">
            <div className="flex items-center gap-3 text-slate-300">
                {icon}
                <span className="font-medium text-sm">{name}</span>
            </div>
            <div className={`px-2 py-1 rounded text-[10px] font-bold border ${statusColor} ${pulse ? 'animate-pulse' : ''}`}>
                {statusText}
            </div>
        </div>
    );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
