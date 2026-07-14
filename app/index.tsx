import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import { initResourceAgent, type ResourceConfig } from "./lib/resourceAgent";
import { createEmbeddingsWorkerClient, type EmbeddingsClient } from "./lib/embeddings";
import { useBackendWakeup } from "./lib/useBackendWakeup";
import {
  RESUME_JSON_INSTRUCTIONS,
  parseResumeDocument,
  renderResumeMarkdown,
  buildAtsReport,
  type ResumeDocument,
  type AtsReport,
} from "./lib/resumeDocument";

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
  // NOTE: /api/mock-market-scan returns SAMPLE data — label it honestly so
  // users never mistake it for live listings.
  return rows.slice(0, 3).map((r, i) => ({
    id: i + 1,
    title: r.title || `Role ${i + 1}`,
    company: `${r.company || 'Unknown'} (Sample Data)`,
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
  const [resumeDoc, setResumeDoc] = useState<ResumeDocument | null>(null);
  const [generationError, setGenerationError] = useState("");
  const [atsReport, setAtsReport] = useState<AtsReport | null>(null);
  // One-line mono detail per pipeline stage — what the stage PRODUCED
  // (DESIGN.md: rail shows output, not just binary status).
  const [agentDetail, setAgentDetail] = useState<Record<string, string>>({});

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

  // "Ping-Before-Request" wake-up for the Render free-tier backend.
  const backendWakeup = useBackendWakeup();
  
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
    // Zero-retention (FR-1.6): PII metadata must not outlive the session either.
    setUserName("");
    setUserEmail("");
    setUserPhone("");
    setAtsReport(null);
    setResumeDoc(null);
    setAgentDetail({});
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
    // Wake the backend as soon as the user enters Market Mode so the cold
    // start (up to ~30s on Render free tier) overlaps with them typing.
    if (workflow === 'market') {
      void backendWakeup.wakeUp().then((ok) => {
        if (ok && backendWakeup.wasColdStart) {
          addLog('SYS: Backend cold start completed; Market Agents ready.');
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow]);

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

  const verifyCredentialsNow = async (profileText: string): Promise<VerificationState> => {
    // Returns the resulting state so callers can gate on it immediately.
    // (Reading the `verification` state var right after this call would see a
    // stale closure value — React state updates are async.)
    const summaryHash = simpleHash(profileText);
    setVerification({ status: 'working' });
    setAgentStatus(prev => ({ ...prev, verifier: 'working' }));
    addLog('AGNT: Verifier > Validating credentials (immediate)...');

    let result: VerificationState;
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
        result = { status: 'verified', confidence: parsed.confidence ?? 1, summaryHash };
        addLog(`AGNT: Verifier > Verified (confidence ${(parsed.confidence ?? 1).toFixed(2)}).`);
      } else {
        result = { status: 'failed', reason: parsed.reason || 'Verification failed', summaryHash };
        addLog(`AGNT: Verifier > FAILED: ${parsed.reason || 'Verification failed'}`);
      }
    } catch (e) {
      result = { status: 'failed', reason: `Verifier unavailable: ${asErrorMessage(e)}`, summaryHash };
      addLog(`ERR: Verifier failed > ${asErrorMessage(e)}`);
    }

    setVerification(result);
    setAgentStatus(prev => ({ ...prev, verifier: result.status === 'verified' ? 'success' : 'error' }));
    setStageDetail('verifier', result.status === 'verified'
      ? `verified · confidence ${(result as { confidence: number }).confidence.toFixed(2)}`
      : (result as { reason: string }).reason.slice(0, 48));
    return result;
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
              setStageDetail('ingestion', `${file.name} · ${nextText.split(/\s+/).length} words`);
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

  /**
   * Structured resume generation (FR-1.4/FR-2.4).
   * Asks for strict JSON, validates the shape, retries with the specific
   * defect fed back to the model, then renders Markdown with the user's
   * contact metadata injected (FR-4.1 data finally used in the output).
   */
  const generateStructuredResume = async (
    taskDescription: string,
    context: string,
    maxAttempts = 3,
  ): Promise<ResumeDocument> => {
    let lastIssue = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      setResumeOutput('');
      const retryNote = attempt === 1
        ? ''
        : `\n\nRETRY ${attempt}/${maxAttempts}: previous output was rejected (${lastIssue}). Fix that issue and return the full JSON again.`;

      const raw = await llmText(
        `${taskDescription}\n\n${context}\n\n${RESUME_JSON_INSTRUCTIONS}${retryNote}`,
        'application/json',
      );

      const result = parseResumeDocument(raw);
      if (typeof result !== 'string') return result;

      lastIssue = result;
      addLog(`SYS: Synthesizer quality retry ${attempt}/${maxAttempts} triggered by ${result}.`);
    }

    throw new Error(`Invalid resume document after ${maxAttempts} attempts: ${lastIssue}`);
  };

  const renderAndSetResume = (doc: ResumeDocument) => {
    const disclaimer = verification.status === 'overridden' ? verification.disclaimer : undefined;
    const md = renderResumeMarkdown(doc, { name: userName, email: userEmail, phone: userPhone }, disclaimer);
    setResumeOutput(md);      // markdown for download
    setResumeDoc(doc);        // structured doc for the paper rendering
    return md;
  };

  const setStageDetail = (stage: string, detail: string) =>
    setAgentDetail(prev => ({ ...prev, [stage]: detail }));

  const runExpertiseFlow = async () => {
    resetSessionTimeout();
    setIsProcessing(true);
    setLogs([]);
    setResumeOutput("");
    setResumeDoc(null);
    setGenerationError("");
    setAtsReport(null);
    setAgentDetail(prev => ({ ingestion: prev.ingestion || '' }));
    setAgentStatus({ ingestion: agentStatus.ingestion === 'success' ? 'success' : 'idle', verifier: "working", scout: "idle", analyst: "idle", synthesizer: "idle" });
    
    try {
      // 1. Verifier gate (SRS FR-1.2)
      // Use the fresh result (not the `verification` state var, which is a
      // stale closure snapshot after an await).
      let gateState: VerificationState = verification;
      const mustVerify = gateState.status === 'idle' || gateState.status === 'working';
      if (mustVerify) {
        gateState = await verifyCredentialsNow(userInput);
      }

      // Block unless verified or overridden
      if (gateState.status === 'failed') {
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
      setStageDetail('scout', trends.slice(0, 48));
      setAgentStatus(prev => ({ ...prev, scout: "success", analyst: "working" }));

      // 3. Vector Analyst — semantic similarity + keyword-level ATS report
      addLog("AGNT: Analyst > Computing Vector Embeddings...");
      const userVec = await embedSmart(userInput);
      const trendVec = await embedSmart(trends);
      const similarity = cosineSim(userVec as any, trendVec as any);
      const report = buildAtsReport(userInput, trends, similarity);
      setAtsReport(report);
      addLog(`AGNT: Analyst > ATS match ${report.matchScore}%. Missing keywords: ${report.missingKeywords.slice(0, 5).join(', ') || 'none'}.`);
      setStageDetail('analyst', `ATS match ${report.matchScore}% · ${report.missingKeywords.length} gaps`);
      setAgentStatus(prev => ({ ...prev, analyst: "success", synthesizer: "working" }));

      // 4. Synthesizer — full structured resume document (FR-1.4)
      addLog("AGNT: Synthesizer > Generating structured resume document...");
      const doc = await generateStructuredResume(
        "You are an expert resume writer. Create a complete, ATS-optimized resume document tailored to the market trends below, based ONLY on the candidate profile.",
        `Candidate Profile:\n${userInput}\n\nTarget Market Trends: ${trends}`,
      );
      renderAndSetResume(doc);
      setStageDetail('synthesizer', `${doc.experience.length} roles · ${doc.skills.length} skills`);
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
    setResumeDoc(null);
    setGenerationError("");
    setAtsReport(null);
    setAgentDetail({});
    setAgentStatus({ ingestion: "idle", verifier: "idle", scout: "working", analyst: "idle", synthesizer: "idle" });

    addLog(`AGNT: Scout > Scanning live market for "${marketIndustry}"...`);
    
    try {
        // Prefer public live job APIs first to reduce fallback usage.
        try {
          const remotiveJobs = await fetchRemotiveJobs(marketIndustry);
          if (remotiveJobs.length) {
            setAvailableJobs(remotiveJobs);
            marketCacheRef.current[marketIndustry] = { jobs: remotiveJobs, cachedAtIso: new Date().toISOString() };
            setStageDetail('scout', `${remotiveJobs.length} live jobs · Remotive`);
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
            setStageDetail('scout', `${arbeitnowJobs.length} live jobs · Arbeitnow`);
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
          // Ping-Before-Request: ensure the Render instance is awake before
          // the real call so we fail fast instead of hanging on a cold start.
          await backendWakeup.wakeUp();
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

        // These are LLM-imagined listings, not scraped data — label them so
        // users never mistake them for live openings.
        const jobs = (JSON.parse(text) as Job[]).map((j) => ({
          ...j,
          company: `${j.company} (AI-Suggested)`,
        }));
        setAvailableJobs(jobs);
        marketCacheRef.current[marketIndustry] = { jobs, cachedAtIso: new Date().toISOString() };
        addLog(`AGNT: Scout > Generated ${jobs.length} representative roles (AI-suggested, not live listings).`);
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
        // Semantic + keyword ATS report against THIS job (FR-3.1/FR-3.2:
        // the embeddings now drive a visible match report, not just a log line).
        const jobText = `${job.title} ${job.requirements}`;
        const userVec = await embedSmart(userInput);
        const jobVec = await embedSmart(jobText);
        const report = buildAtsReport(userInput, jobText, cosineSim(userVec as any, jobVec as any));
        setAtsReport(report);
        setStageDetail('analyst', `ATS match ${report.matchScore}% · ${job.title.slice(0, 28)}`);
        addLog(`AGNT: Analyst > ATS match ${report.matchScore}% for "${job.title}".`);
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
          const doc = await generateStructuredResume(
              "You are an expert Resume Strategist. Create a complete, ATS-optimized resume document that positions the candidate for the specific job below, weaving their gap-fill explanation in naturally.",
          `Target Job: ${selectedJob.title} at ${selectedJob.company}
Requirements: ${selectedJob.requirements}
Candidate Profile: ${userInput}
Gap Explanation (Dynamic Interview): ${gapResponse || 'None needed'}`,
          );
          renderAndSetResume(doc);
          setStageDetail('synthesizer', `${doc.experience.length} roles · ${doc.skills.length} skills`);

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
      const safeName = userName.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
      a.download = safeName ? `${safeName}_resume.md` : 'generated_resume.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      addLog("SYS: File downloaded successfully.");
  };

  return (
    <div className="min-h-screen bg-base text-ink flex flex-col font-sans">

      {/* Header */}
      <header className="border-b border-surface-3 bg-surface-1/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5" aria-label="ARS-MME home">
            <div className="w-7 h-7 bg-accent rounded flex items-center justify-center text-accent-ink font-mono font-bold text-xs">
              AI
            </div>
            <h1 className="font-bold text-lg tracking-tight">ARS-MME <span className="text-ink-faint font-normal text-sm ml-2 hidden sm:inline">Agent Console</span></h1>
          </a>
          <div className="flex bg-surface-2 rounded-lg p-1">
            <button onClick={() => setWorkflow('expertise')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors duration-200 ${workflow === 'expertise' ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:text-ink'}`}>Expertise</button>
            <button onClick={() => setWorkflow('market')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors duration-200 ${workflow === 'market' ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:text-ink'}`}>Market</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT COLUMN: Controls */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-surface-1 rounded-xl border border-surface-3 p-6">

                {/* User Metadata (SRS FR-4.1) */}
                <div className="mb-6">
                  <div className="text-[11px] font-mono text-ink-faint uppercase tracking-widest mb-3">Contact — Ephemeral</div>
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="Name"
                      className="w-full bg-base border border-surface-3 rounded-lg p-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none transition-colors duration-200"
                    />
                    <input
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      placeholder="Email"
                      className="w-full bg-base border border-surface-3 rounded-lg p-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none transition-colors duration-200"
                    />
                    <input
                      value={userPhone}
                      onChange={(e) => setUserPhone(e.target.value)}
                      placeholder="Phone"
                      className="w-full bg-base border border-surface-3 rounded-lg p-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none transition-colors duration-200"
                    />
                    <div className="text-[10px] text-ink-faint font-mono">
                      session memory only · purged on close
                    </div>
                  </div>
                </div>

                {workflow === 'expertise' ? (
                  <>
                     <div className="flex items-center gap-2 mb-4 text-ink">
                      <Icons.FileText />
                      <h2 className="font-semibold text-lg">Input Profile</h2>
                    </div>
                    {/* Ingestion Agent: Upload */}
                    <div
                      className="border-2 border-dashed border-surface-3 rounded-lg p-4 mb-4 text-center cursor-pointer hover:border-accent hover:bg-surface-2/50 transition-colors duration-200 group"
                      onClick={() => fileInputRef.current?.click()}
                    >
                        <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.jpg,.png,.txt" onChange={handleFileUpload} />
                        <div className="text-ink-faint group-hover:text-accent flex flex-col items-center gap-2 transition-colors duration-200">
                           <Icons.Upload />
                           <span className="text-xs font-mono">DRAG RESUME OR CLICK TO UPLOAD</span>
                        </div>
                    </div>

                    <textarea
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      className="w-full h-40 bg-base border border-surface-3 rounded-lg p-3 text-sm text-ink-muted focus:border-accent focus:outline-none transition-colors duration-200 resize-none"
                      placeholder="Paste resume content or upload file..."
                    />

                    {/* Verification Failure UI (SRS FR-1.2) */}
                    {verification.status === 'failed' && (
                      <div className="mt-4 p-3 bg-err/5 border border-err/30 rounded-lg">
                        <div className="flex items-center gap-2 text-err text-xs font-bold mb-2">
                          <Icons.Alert /> VERIFICATION FAILED
                        </div>
                        <div className="text-xs text-ink-muted mb-2">Reason: <span className="text-ink font-mono">{verification.reason}</span></div>
                        <textarea
                          value={manualCorrection}
                          onChange={(e) => setManualCorrection(e.target.value)}
                          placeholder="Option A: Correct certification details here (issuer, ID, dates, links)..."
                          className="w-full h-20 bg-base border border-err/30 rounded p-2 text-xs text-ink focus:border-err focus:outline-none"
                        />
                        <textarea
                          value={overrideDisclaimer}
                          onChange={(e) => setOverrideDisclaimer(e.target.value)}
                          placeholder="Option B: Provide a disclaimer for override..."
                          className="w-full h-16 mt-2 bg-base border border-err/30 rounded p-2 text-xs text-ink focus:border-err focus:outline-none"
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
                            className="flex-1 py-1.5 bg-surface-2 hover:bg-surface-3 text-ink text-xs font-semibold rounded transition-colors duration-200"
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
                            className="flex-1 py-1.5 bg-err/80 hover:bg-err text-base text-xs font-semibold rounded transition-colors duration-200"
                          >
                            Override With Disclaimer
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={runExpertiseFlow}
                      disabled={isProcessing}
                      className={`w-full mt-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors duration-200 ${
                        isProcessing
                          ? 'bg-surface-2 text-ink-faint cursor-wait'
                          : 'bg-accent hover:brightness-110 text-accent-ink'
                      }`}
                    >
                      {isProcessing ? <><span className="animate-spin">⟳</span> Processing...</> : <><Icons.Play /> Initiate Synthesis</>}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-4 text-ink">
                      <Icons.Globe />
                      <h2 className="font-semibold text-lg">Market Scanner</h2>
                    </div>

                    <div className="mb-4">
                        <label className="text-xs text-ink-muted block mb-1">Target Industry</label>
                        <input
                            type="text"
                            value={marketIndustry}
                            onChange={(e) => setMarketIndustry(e.target.value)}
                            className="w-full bg-base border border-surface-3 rounded-lg p-2 text-sm text-ink focus:border-accent focus:outline-none transition-colors duration-200"
                        />
                    </div>

                    {backendWakeup.isWaking && (
                      <div className="mb-3 flex items-center gap-2 text-xs text-accent font-mono">
                        <span className="animate-spin">⟳</span> Initializing Market Agents (backend waking up)...
                      </div>
                    )}

                    <button
                      onClick={scanMarket}
                      disabled={isProcessing}
                      className="w-full py-2.5 mb-6 rounded-lg font-semibold bg-accent hover:brightness-110 text-accent-ink flex justify-center items-center gap-2 disabled:opacity-60 transition-colors duration-200"
                    >
                       <Icons.Globe /> Scan Live Jobs
                    </button>

                    {/* Job List */}
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                        {availableJobs.map(job => (
                            <div
                                key={job.id}
                                onClick={() => analyzeGap(job)}
                                className={`p-3 rounded-lg border text-left cursor-pointer transition-colors duration-200 ${selectedJob?.id === job.id ? 'border-accent bg-accent/5' : 'border-surface-3 hover:border-ink-faint'}`}
                            >
                                <div className="font-semibold text-sm text-ink">{job.title}</div>
                                <div className="text-xs text-ink-muted">{job.company}</div>
                            </div>
                        ))}
                    </div>

                    {/* Gap Analysis / Dynamic Interview */}
                    {selectedJob && missingSkills.length > 0 && (
                        <div className="mt-4 p-3 bg-warn/5 border border-warn/30 rounded-lg">
                             <div className="flex items-center gap-2 text-warn text-xs font-bold mb-2">
                                <Icons.Alert /> GAP DETECTED
                             </div>
                             <p className="text-xs text-ink-muted mb-2">Missing: <span className="text-ink font-mono">{missingSkills.join(", ")}</span></p>
                             <textarea
                                value={gapResponse}
                                onChange={(e) => setGapResponse(e.target.value)}
                                placeholder={`Describe your experience with ${missingSkills[0]} to bridge the gap...`}
                                className="w-full h-20 bg-base border border-warn/30 rounded p-2 text-xs text-ink focus:border-warn focus:outline-none"
                             />
                             <button onClick={synthesizeMarketResume} className="w-full mt-2 py-2 bg-accent hover:brightness-110 text-accent-ink text-xs font-semibold rounded transition-colors duration-200">
                                Fill Gap & Generate
                             </button>
                        </div>
                    )}
                     {selectedJob && missingSkills.length === 0 && (
                        <button onClick={synthesizeMarketResume} className="w-full mt-4 py-2.5 bg-ok/90 hover:bg-ok text-base font-semibold rounded-lg transition-colors duration-200">
                           Perfect Match — Generate
                        </button>
                    )}
                  </>
                )}
              </div>

              {/* Agent Pipeline Rail (DESIGN.md signature pattern #1) */}
              <div className="bg-surface-1 rounded-xl border border-surface-3 p-6">
                 <h3 className="text-[11px] font-mono text-ink-faint uppercase tracking-widest mb-5">Agent Pipeline</h3>
                 <div>
                    <PipelineStage name="Ingestion" status={agentStatus.ingestion} detail={agentDetail.ingestion} />
                    <PipelineStage name="Verifier" status={agentStatus.verifier} detail={agentDetail.verifier} />
                    <PipelineStage name="Market Scout" status={agentStatus.scout} detail={agentDetail.scout} />
                    <PipelineStage name="Analyst" status={agentStatus.analyst} detail={agentDetail.analyst} />
                    <PipelineStage name="Synthesizer" status={agentStatus.synthesizer} detail={agentDetail.synthesizer} isLast />
                 </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Output */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              
              {/* Terminal */}
              <div className="bg-surface-1 rounded-xl border border-surface-3 p-4 font-mono text-xs h-48 overflow-hidden flex flex-col">
                <div className="flex items-center gap-2 text-ink-faint border-b border-surface-3 pb-2 mb-2 uppercase tracking-widest text-[10px]">
                  <Icons.Terminal />
                  <span>Telemetry · {workflow} mode</span>
                </div>
                <div ref={logRef} className="flex-1 overflow-y-auto space-y-1">
                  {logs.length === 0 && <span className="text-ink-faint italic">Ready...</span>}
                  {logs.map((log, i) => (
                    <div key={i} className="break-all pl-2">
                      <span className={log.includes("ERR") ? "text-err" : log.includes("AGNT") ? "text-accent" : "text-ink-muted"}>
                        {log}
                      </span>
                    </div>
                  ))}
                  {isProcessing && <div className="text-accent terminal-cursor">_</div>}
                </div>
              </div>

              {/* ATS Match Report (FR-3.1/FR-3.2 made visible) */}
              {atsReport && (
                <div className="bg-surface-1 rounded-xl border border-surface-3 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[11px] font-mono text-ink-faint uppercase tracking-widest">ATS Match Report</h3>
                    <span className={`text-lg font-mono font-bold tabular-nums ${atsReport.matchScore >= 70 ? 'text-ok' : atsReport.matchScore >= 40 ? 'text-warn' : 'text-err'}`}>
                      {atsReport.matchScore}%
                    </span>
                  </div>
                  <div className="w-full h-1 bg-surface-3 rounded-full mb-4 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${atsReport.matchScore >= 70 ? 'bg-ok' : atsReport.matchScore >= 40 ? 'bg-warn' : 'bg-err'}`}
                      style={{ width: `${atsReport.matchScore}%` }}
                    />
                  </div>
                  {atsReport.matchedKeywords.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[10px] font-mono text-ink-faint uppercase tracking-widest mb-1.5">Matched</div>
                      <div className="flex flex-wrap gap-1">
                        {atsReport.matchedKeywords.map((kw) => (
                          <span key={kw} className="px-2 py-0.5 rounded bg-ok/10 text-ok border border-ok/25 text-[11px] font-mono">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {atsReport.missingKeywords.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono text-ink-faint uppercase tracking-widest mb-1.5">Missing — add evidence for these</div>
                      <div className="flex flex-wrap gap-1">
                        {atsReport.missingKeywords.map((kw) => (
                          <span key={kw} className="px-2 py-0.5 rounded bg-err/10 text-err border border-err/25 text-[11px] font-mono">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Document area — the paper is the one lit surface (DESIGN.md pattern #2) */}
              <div className="flex-1 bg-surface-2 rounded-xl border border-surface-3 p-6 relative min-h-[500px] flex flex-col gap-4">

                <div className="flex justify-between items-center">
                    <h2 className="text-[11px] font-mono text-ink-faint uppercase tracking-widest">Generated Document</h2>
                    {resumeOutput && (
                        <button onClick={downloadResume} className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-accent border border-surface-3 hover:border-accent px-3 py-1.5 rounded-lg transition-colors duration-200">
                            <Icons.Download /> Download .md
                        </button>
                    )}
                </div>

                {generationError && (
                  <div className="rounded-lg border border-err/30 bg-err/5 px-3 py-2 text-sm text-err">
                    {generationError}
                  </div>
                )}

                {!resumeDoc ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-ink-faint gap-3">
                    <Icons.FileText />
                    <p className="text-sm">The synthesized resume will appear here as a document.</p>
                  </div>
                ) : (
                  <div className="paper-sheet rounded px-10 py-9 sm:px-12 sm:py-10 font-doc">
                    {verification.status === 'overridden' && (
                      <p className="text-[11px] italic mb-4 pb-3 border-b" style={{ color: '#57606B', borderColor: '#E2E0DA' }}>
                        {verification.disclaimer}
                      </p>
                    )}
                    <h3 className="text-[26px] font-bold leading-tight" style={{ letterSpacing: '-0.01em' }}>{userName.trim() || 'Your Name'}</h3>
                    <div className="text-sm font-semibold" style={{ color: '#57606B' }}>{resumeDoc.headline}</div>
                    {(userEmail.trim() || userPhone.trim()) && (
                      <div className="font-sans text-[11.5px] mt-1" style={{ color: '#57606B' }}>
                        {[userEmail.trim(), userPhone.trim()].filter(Boolean).join('  |  ')}
                      </div>
                    )}
                    <div className="border-b-2 mt-3.5 mb-4" style={{ borderColor: '#1C2128' }} />

                    <h4 className="font-sans text-[11px] font-bold uppercase tracking-widest mb-1.5">Professional Summary</h4>
                    <p className="text-[13.5px] leading-relaxed">{resumeDoc.summary}</p>

                    <h4 className="font-sans text-[11px] font-bold uppercase tracking-widest mt-5 mb-1.5">Skills</h4>
                    <p className="font-sans text-xs leading-relaxed">{resumeDoc.skills.join(' · ')}</p>

                    <h4 className="font-sans text-[11px] font-bold uppercase tracking-widest mt-5 mb-1.5">Experience</h4>
                    {resumeDoc.experience.map((exp, i) => (
                      <div key={i} className={i > 0 ? 'mt-3' : ''}>
                        <p className="text-[13.5px] font-semibold">
                          {exp.role}
                          {(exp.organization || exp.period) && (
                            <span className="font-normal" style={{ color: '#57606B' }}>
                              {' — '}{[exp.organization, exp.period].filter(Boolean).join(', ')}
                            </span>
                          )}
                        </p>
                        <ul className="list-disc pl-5 mt-1">
                          {exp.achievements.map((a, j) => (
                            <li key={j} className="text-[13.5px] leading-relaxed">{a}</li>
                          ))}
                        </ul>
                      </div>
                    ))}

                    {resumeDoc.education.length > 0 && (
                      <>
                        <h4 className="font-sans text-[11px] font-bold uppercase tracking-widest mt-5 mb-1.5">Education</h4>
                        <ul className="list-disc pl-5">
                          {resumeDoc.education.map((e, i) => <li key={i} className="text-[13.5px] leading-relaxed">{e}</li>)}
                        </ul>
                      </>
                    )}

                    {resumeDoc.certifications.length > 0 && (
                      <>
                        <h4 className="font-sans text-[11px] font-bold uppercase tracking-widest mt-5 mb-1.5">Certifications</h4>
                        <ul className="list-disc pl-5">
                          {resumeDoc.certifications.map((c, i) => <li key={i} className="text-[13.5px] leading-relaxed">{c}</li>)}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
      </main>
    </div>
  );
};

// Pipeline stage row (DESIGN.md: dot + connecting thread + name + one-line
// mono detail of what the stage produced; no pulsing badges).
const PipelineStage = ({ name, status, detail, isLast }: { name: string; status: string; detail?: string; isLast?: boolean }) => {
    const done = status === 'success';
    const active = status === 'working';
    const failed = status === 'error';

    return (
        <div className="relative pl-7 pb-1">
            {!isLast && <div className={`stage-thread ${done ? 'done' : ''}`} />}
            <div
                className={`absolute left-0 top-0.5 w-4 h-4 rounded-full border-2 grid place-items-center transition-colors duration-200 ${
                    done ? 'border-ok bg-ok' :
                    failed ? 'border-err bg-err/20' :
                    active ? 'border-accent bg-surface-1 stage-dot-active' :
                    'border-surface-3 bg-surface-1'
                }`}
            >
                {done && <span className="text-[8px] font-bold" style={{ color: '#05281C' }}>✓</span>}
                {failed && <span className="text-[8px] font-bold text-err">✕</span>}
            </div>
            <div className={`text-sm font-semibold ${status === 'idle' ? 'text-ink-faint' : 'text-ink'}`}>{name}</div>
            <div className={`font-mono text-[11px] mb-3 min-h-[14px] ${active ? 'text-accent' : failed ? 'text-err' : 'text-ink-faint'}`}>
                {active ? (detail || 'working…') : failed ? (detail || 'failed') : done ? (detail || 'complete') : 'waiting'}
            </div>
        </div>
    );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
