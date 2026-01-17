/**
 * Market Scout Client
 * ===================
 * 
 * Client library for interacting with the Market Scout backend service.
 * Handles the Vector-Ready Protocol and integrates with the wake-up system.
 */

import { getApiUrl } from './useBackendWakeup';

// --- Types (matching backend types.py) ---

export interface JobChunk {
  /** Unique chunk identifier (job_id + chunk_index) */
  id: string;
  /** Cleaned text chunk (~500 tokens) */
  text: string;
  /** Approximate token count */
  token_count: number;
  /** Source metadata */
  metadata: {
    url: string;
    section: string;
    job_id: string;
    title?: string;
    company?: string;
    [key: string]: unknown;
  };
}

export interface VectorReadyResponse {
  /** Response status */
  status: 'success' | 'partial' | 'error';
  /** Cleaned text chunks ready for embedding */
  job_chunks: JobChunk[];
  /** Original URL scraped */
  source_url: string | null;
  /** Server processing time in ms */
  processing_time_ms: number;
  /** Whether result was served from cache */
  cached: boolean;
  /** Non-fatal errors encountered */
  errors: string[];
}

export interface MarketScanResult {
  job_id: string;
  title: string;
  company: string;
  url: string;
  chunks: JobChunk[];
}

export interface MarketScanResponse {
  status: 'success' | 'partial' | 'error';
  query: string;
  results: MarketScanResult[];
  total_results: number;
  processing_time_ms: number;
  errors: string[];
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime_seconds: number;
  last_request_ago_seconds: number | null;
  request_count: number;
  memory_mb: number | null;
}

// --- Client Functions ---

const DEFAULT_TIMEOUT = 30000;  // 30 seconds

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Check backend health
 */
export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetchWithTimeout(getApiUrl('/health'));
  
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Scrape a job posting URL and get Vector-Ready chunks
 */
export async function scrapeJobPosting(
  url: string,
  options: { forceRefresh?: boolean; timeout?: number } = {}
): Promise<VectorReadyResponse> {
  const { forceRefresh = false, timeout = DEFAULT_TIMEOUT } = options;

  const response = await fetchWithTimeout(
    getApiUrl('/api/scrape'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        force_refresh: forceRefresh,
      }),
    },
    timeout
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Scrape failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get mock job data (for testing)
 */
export async function getMockJob(jobIndex: number = 0): Promise<VectorReadyResponse> {
  const response = await fetchWithTimeout(
    getApiUrl(`/api/mock-jobs?job_index=${jobIndex}`)
  );

  if (!response.ok) {
    throw new Error(`Mock job fetch failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Run mock market scan (for testing)
 */
export async function mockMarketScan(
  keywords: string,
  limit: number = 3
): Promise<MarketScanResponse> {
  const params = new URLSearchParams({
    keywords,
    limit: String(limit),
  });

  const response = await fetchWithTimeout(
    getApiUrl(`/api/mock-market-scan?${params}`)
  );

  if (!response.ok) {
    throw new Error(`Market scan failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Extract all chunk texts for embedding
 */
export function extractChunkTexts(response: VectorReadyResponse): string[] {
  return response.job_chunks.map(chunk => chunk.text);
}

/**
 * Get chunk by ID
 */
export function getChunkById(
  response: VectorReadyResponse,
  chunkId: string
): JobChunk | undefined {
  return response.job_chunks.find(chunk => chunk.id === chunkId);
}

/**
 * Group chunks by section
 */
export function groupChunksBySection(
  response: VectorReadyResponse
): Record<string, JobChunk[]> {
  return response.job_chunks.reduce((acc, chunk) => {
    const section = chunk.metadata.section || 'unknown';
    if (!acc[section]) {
      acc[section] = [];
    }
    acc[section].push(chunk);
    return acc;
  }, {} as Record<string, JobChunk[]>);
}

export default {
  checkHealth,
  scrapeJobPosting,
  getMockJob,
  mockMarketScan,
  extractChunkTexts,
  getChunkById,
  groupChunksBySection,
};
