# Architecture Modifications Log

## Date: January 4, 2026

## Overview

This document details the architectural changes made to implement a robust hybrid architecture for the ARS-MME (Agentic Resume Synthesis & Market Matching Engine) system. The key constraint was utilizing Render Free Tier (512MB RAM / 0.1 CPU) for the backend while keeping all ML workloads in the browser.

---

## Core Architectural Decision

**Browser-based Edge Computing + Lightweight Backend Pre-Processing Factory**

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Vercel)                         │
│                         Next.js / Vite + React                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  WebLLM (WebGPU)          │  Transformers.js (Web Worker)       ││
│  │  - Resume Generation      │  - Vector Embeddings                ││
│  │  - Gap Analysis           │  - Semantic Search                  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                   │                                 │
│                    ┌──────────────┴──────────────┐                  │
│                    │   useBackendWakeup Hook     │                  │
│                    │   "Ping-Before-Request"     │                  │
│                    └──────────────┬──────────────┘                  │
└────────────────────────────────────┼────────────────────────────────┘
                                     │
                          HTTPS (TLS 1.3)
                                     │
┌────────────────────────────────────┼────────────────────────────────┐
│                      BACKEND (Render Free Tier)                     │
│                         512MB RAM / 0.1 CPU                         │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Market Scout Agent                           ││
│  │  - FastAPI + Uvicorn (single worker)                            ││
│  │  - HTML Scraping (httpx + BeautifulSoup)                        ││
│  │  - NLP Cleaning (NLTK tokenization)                             ││
│  │  - Text Chunking (~500 tokens)                                  ││
│  │  - NO ML/Embeddings (done client-side)                          ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

---

## Files Created

### Backend (`backend/`)

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage optimized build for 512MB RAM constraint |
| `requirements.txt` | Lightweight dependencies (no heavy ML libraries) |
| `main.py` | FastAPI app with health + scrape endpoints |
| `schemas.py` | Pydantic models for Vector-Ready Protocol |
| `.env.example` | Environment variable template |
| `README.md` | Backend service documentation |

### Frontend (`app/lib/`)

| File | Purpose |
|------|---------|
| `useBackendWakeup.ts` | React hook for "Ping-Before-Request" pattern |
| `marketScoutClient.ts` | TypeScript client for Market Scout API |

---

## Files Modified

### `app/lib/resourceAgent.ts`

**Changes:**
1. Added `BACKEND_URL` configuration using `import.meta.env.VITE_BACKEND_URL`
2. Updated `marketScout` mode from `"proxy"` to `"backend"`
3. Changed `apiUrl` from `/api/market-scout` to `${BACKEND_URL}/api/scrape`

**Rationale:** 
- Shifts market scraping from Netlify Edge Functions to dedicated Render backend
- Enables longer-duration scraping operations (Render timeout > Edge Function timeout)
- Centralizes NLP pre-processing on the backend

### `app/.env.example`

**Changes:**
Added new environment variable:
```
VITE_BACKEND_URL=http://localhost:8000
```

---

## Vector-Ready Protocol

The backend returns a strict JSON schema optimized for immediate client-side vectorization:

```json
{
  "status": "success",
  "job_chunks": [
    {
      "id": "abc123_chunk_0",
      "text": "cleaned text chunk (~500 tokens)...",
      "token_count": 450,
      "metadata": {
        "url": "https://linkedin.com/jobs/...",
        "section": "requirements",
        "job_id": "abc123"
      }
    }
  ],
  "source_url": "...",
  "processing_time_ms": 1250,
  "cached": false,
  "errors": []
}
```

**Why 500 tokens?**
- Optimal chunk size for embedding models (sentence-transformers)
- Balances context preservation vs. embedding quality
- Fits within Transformers.js batch processing limits

---

## Wake-Up Protocol

The Render Free Tier spins down after 15 minutes of inactivity. The frontend implements a "Ping-Before-Request" pattern:

```typescript
// In Market Mode component
const { isWarm, isWaking, wakeUp } = useBackendWakeup();

useEffect(() => {
  wakeUp();  // Send wake-up ping on mode entry
}, []);

if (isWaking) {
  return <LoadingState message="Initializing Market Agents..." />;
}
```

**Protocol Details:**
1. Frontend sends `GET /health` before any `/api/scrape` request
2. If response time > 2s, cold start is detected → show loading UI
3. Retry with exponential backoff (max 3 attempts)
4. Cache "warm" state for 10 minutes to avoid repeated pings

---

## Memory Optimization Strategies

### Backend (Render Free Tier)

| Strategy | Implementation |
|----------|----------------|
| Multi-stage Docker build | Reduces final image size by ~60% |
| Single Uvicorn worker | Prevents memory multiplication |
| Bounded TTL cache | Max 100 items, auto-expire after 1 hour |
| Content length limit | Max 500KB per scraped page |
| NLTK only (no spaCy) | ~50MB vs ~500MB+ for spacy models |
| No ML inference | All embeddings done client-side |

### Frontend (Browser)

| Strategy | Implementation |
|----------|----------------|
| Web Worker embeddings | Non-blocking UI during vectorization |
| Lazy model loading | WebLLM loads on-demand |
| Cache API for models | Persists model weights across sessions |
| Chunked processing | Process one chunk at a time |

---

## API Endpoints Summary

### Backend (Render)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Wake-up / Keep-alive |
| `/api/scrape` | POST | Scrape job URL → Vector-Ready JSON |
| `/api/mock-jobs` | GET | Test data (development) |
| `/api/mock-market-scan` | GET | Simulated market scan |

### Frontend (Netlify Edge)

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `/api/generate` | LLM generation proxy | Existing (unchanged) |
| `/api/market-scout` | Legacy proxy | Deprecated (use Render backend) |

---

## Deployment Instructions

### Backend (Render)

1. Create new Web Service on Render
2. Connect GitHub repository
3. Configure:
   - **Environment:** Docker
   - **Docker Context:** `backend`
   - **Instance Type:** Free
4. Set environment variables:
   ```
   FRONTEND_URL=https://your-frontend.vercel.app
   ```

### Frontend (Vercel/Netlify)

1. Add environment variable:
   ```
   VITE_BACKEND_URL=https://your-backend.onrender.com
   ```
2. Deploy as usual

---

## Testing Checklist

- [ ] Backend health check responds within 2s (warm)
- [ ] Backend cold start completes within 30s
- [ ] `/api/scrape` returns valid Vector-Ready JSON
- [ ] Frontend shows loading state during cold start
- [ ] Chunks are correctly embedded by Transformers.js
- [ ] Memory usage stays under 450MB (backend)
- [ ] CORS allows frontend origin

---

## Security Considerations

1. **Domain Allowlist:** Backend only scrapes from approved job boards
2. **Content Limits:** Prevents memory exhaustion from large pages
3. **No PII Storage:** Stateless processing, no user data persisted
4. **CORS Configured:** Only frontend origins allowed
5. **Rate Limiting:** In-memory cache prevents redundant scrapes

---

## Future Improvements

1. **Redis Cache:** Move from in-memory to Redis for cache persistence
2. **Queue System:** Add job queue for concurrent scrape requests
3. **WebSocket Updates:** Real-time progress during long scrapes
4. **Scheduled Keep-Alive:** Cron job to prevent spin-down during business hours
