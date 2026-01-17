/**
 * useBackendWakeup Hook
 * =====================
 * 
 * Implements the "Ping-Before-Request" pattern for Render Free Tier backend.
 * 
 * The Render free tier spins down after 15 minutes of inactivity. This hook:
 * 1. Sends a wake-up signal when entering Market Mode
 * 2. Shows loading state if response > 2s (cold start detected)
 * 3. Retries with exponential backoff on failure
 * 4. Caches warm state to avoid unnecessary pings
 * 
 * Usage:
 * ```tsx
 * const { isWarm, isWaking, wakeUp, error } = useBackendWakeup();
 * 
 * // On Market Mode entry
 * useEffect(() => {
 *   wakeUp();
 * }, []);
 * 
 * // Show loading if waking
 * if (isWaking) return <div>Initializing Market Agents...</div>;
 * ```
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// Configuration
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const HEALTH_ENDPOINT = `${BACKEND_URL}/health`;
const COLD_START_THRESHOLD_MS = 2000;  // If response > 2s, consider it a cold start
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const WARM_CACHE_DURATION_MS = 10 * 60 * 1000;  // Consider warm for 10 minutes
const PING_TIMEOUT_MS = 30000;  // 30s timeout for wake-up ping

export interface BackendWakeupState {
  /** Whether the backend is confirmed warm and responsive */
  isWarm: boolean;
  /** Whether we're currently attempting to wake the backend */
  isWaking: boolean;
  /** Whether a cold start was detected (response took > threshold) */
  wasColdStart: boolean;
  /** Last error encountered, if any */
  error: Error | null;
  /** Timestamp of last successful health check */
  lastHealthCheck: number | null;
  /** Response time of last health check in ms */
  lastResponseTime: number | null;
}

export interface BackendWakeupActions {
  /** Trigger a wake-up ping to the backend */
  wakeUp: () => Promise<boolean>;
  /** Force a fresh wake-up, ignoring cache */
  forceWakeUp: () => Promise<boolean>;
  /** Reset the state */
  reset: () => void;
}

export type UseBackendWakeupReturn = BackendWakeupState & BackendWakeupActions;

/**
 * Hook for managing backend wake-up state
 */
export function useBackendWakeup(): UseBackendWakeupReturn {
  const [state, setState] = useState<BackendWakeupState>({
    isWarm: false,
    isWaking: false,
    wasColdStart: false,
    error: null,
    lastHealthCheck: null,
    lastResponseTime: null,
  });

  // Refs for managing async operations
  const abortControllerRef = useRef<AbortController | null>(null);
  const warmUntilRef = useRef<number>(0);

  /**
   * Check if backend is considered warm based on recent health check
   */
  const isRecentlyWarm = useCallback(() => {
    return Date.now() < warmUntilRef.current;
  }, []);

  /**
   * Perform a single health check ping
   */
  const ping = useCallback(async (signal: AbortSignal): Promise<{ ok: boolean; responseTime: number }> => {
    const start = performance.now();
    
    try {
      const response = await fetch(HEALTH_ENDPOINT, {
        method: 'GET',
        signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      const responseTime = performance.now() - start;

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      // Optionally parse response for more info
      const data = await response.json();
      console.log('[BackendWakeup] Health check response:', data);

      return { ok: true, responseTime };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;  // Re-throw abort errors
      }
      throw new Error(`Health check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  /**
   * Wake up the backend with retries
   */
  const performWakeUp = useCallback(async (force: boolean = false): Promise<boolean> => {
    // Skip if recently warm (unless forced)
    if (!force && isRecentlyWarm()) {
      console.log('[BackendWakeup] Backend recently warm, skipping ping');
      return true;
    }

    // Cancel any existing wake-up attempt
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Set up timeout
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, PING_TIMEOUT_MS);

    setState(prev => ({
      ...prev,
      isWaking: true,
      error: null,
    }));

    let lastError: Error | null = null;
    let retryDelay = INITIAL_RETRY_DELAY_MS;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (abortController.signal.aborted) {
        break;
      }

      try {
        console.log(`[BackendWakeup] Ping attempt ${attempt + 1}/${MAX_RETRIES}`);
        const { ok, responseTime } = await ping(abortController.signal);

        if (ok) {
          clearTimeout(timeoutId);
          const wasColdStart = responseTime > COLD_START_THRESHOLD_MS;
          warmUntilRef.current = Date.now() + WARM_CACHE_DURATION_MS;

          setState({
            isWarm: true,
            isWaking: false,
            wasColdStart,
            error: null,
            lastHealthCheck: Date.now(),
            lastResponseTime: responseTime,
          });

          console.log(`[BackendWakeup] Backend warm (${responseTime.toFixed(0)}ms, cold start: ${wasColdStart})`);
          return true;
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new Error('Wake-up timed out');
          break;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[BackendWakeup] Attempt ${attempt + 1} failed:`, lastError.message);
      }

      // Wait before retry (with exponential backoff)
      if (attempt < MAX_RETRIES - 1 && !abortController.signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
      }
    }

    clearTimeout(timeoutId);

    setState(prev => ({
      ...prev,
      isWarm: false,
      isWaking: false,
      error: lastError || new Error('Wake-up failed after all retries'),
    }));

    return false;
  }, [isRecentlyWarm, ping]);

  /**
   * Public wake-up function (respects cache)
   */
  const wakeUp = useCallback(async (): Promise<boolean> => {
    return performWakeUp(false);
  }, [performWakeUp]);

  /**
   * Force wake-up (ignores cache)
   */
  const forceWakeUp = useCallback(async (): Promise<boolean> => {
    return performWakeUp(true);
  }, [performWakeUp]);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    warmUntilRef.current = 0;
    setState({
      isWarm: false,
      isWaking: false,
      wasColdStart: false,
      error: null,
      lastHealthCheck: null,
      lastResponseTime: null,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    ...state,
    wakeUp,
    forceWakeUp,
    reset,
  };
}

/**
 * Utility hook for auto-waking on mount (useful for Market Mode)
 */
export function useAutoWakeup(enabled: boolean = true): UseBackendWakeupReturn {
  const wakeupState = useBackendWakeup();
  const hasWokenRef = useRef(false);

  useEffect(() => {
    if (enabled && !hasWokenRef.current) {
      hasWokenRef.current = true;
      wakeupState.wakeUp();
    }
  }, [enabled, wakeupState]);

  return wakeupState;
}

/**
 * Get the backend base URL
 */
export function getBackendUrl(): string {
  return BACKEND_URL;
}

/**
 * Helper to construct full API URLs
 */
export function getApiUrl(path: string): string {
  return `${BACKEND_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export default useBackendWakeup;
