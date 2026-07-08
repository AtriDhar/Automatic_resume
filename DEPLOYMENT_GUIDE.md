# ARS-MME — Deployment Guide

**Agentic Resume Synthesis & Market Matching Engine**

This guide covers everything needed to take the project from a fresh clone to a
fully working production deployment, plus local development, verification, and
troubleshooting.

---

## 1. Architecture Overview

```
                        ┌────────────────────────────────────────────┐
                        │            FRONTEND  (Vercel)              │
                        │            Vite + React SPA                │
                        │                                            │
                        │  Transformers.js worker (on-device         │
                        │  embeddings)  →  ATS Match Report          │
                        │  Service Worker → model-weight caching     │
                        └───────┬──────────────────────┬─────────────┘
                                │                      │
                   /api/generate│         VITE_BACKEND_URL
                   /api/market-scout                   │
                                │                      │
                ┌───────────────▼───────┐   ┌──────────▼──────────────┐
                │  EDGE FUNCTIONS       │   │  BACKEND (Render)       │
                │  (Vercel or Netlify)  │   │  FastAPI, Docker,       │
                │                       │   │  512MB free tier        │
                │  generate  → Gemini / │   │                         │
                │              NVIDIA   │   │  /health   (wake-up)    │
                │  market-scout → CORS  │   │  /api/scrape (chunker)  │
                │              proxy    │   │  /api/mock-* (dev)      │
                └───────────────────────┘   └──────────▲──────────────┘
                                                       │
                                            ┌──────────┴──────────────┐
                                            │  KEEP-ALIVE (optional)  │
                                            │  pings /health ~13 min  │
                                            └─────────────────────────┘
```

Three deployable units:

| Unit | Directory | Platform | Purpose |
|---|---|---|---|
| Frontend + edge functions | `app/` | Vercel (or Netlify) | UI, LLM proxy, CORS proxy |
| Market Scout backend | `backend/` | Render (Docker) | Scraping, NLP cleaning, chunking |
| Keep-alive service (optional) | `keep-alive/` | Render (Docker) | Prevents backend cold starts |

**What runs where (honest accounting):**
- LLM inference is **cloud-side** (Gemini or NVIDIA via `/api/generate`).
  In-browser WebLLM inference is a roadmap item, not a shipped feature.
- Vector embeddings run **on-device** (Transformers.js in a Web Worker) on
  capable machines, with a deterministic hashed-embedding fallback otherwise.
- No user data is persisted anywhere; sessions are ephemeral (zero-retention).

---

## 2. Prerequisites

- **Node.js 20+** (tested on 22) and npm
- **Python 3.9+** (backend targets 3.9 in Docker; 3.12 works locally)
- Accounts: [Vercel](https://vercel.com) (or Netlify), [Render](https://render.com)
- API key: **Gemini** ([Google AI Studio](https://aistudio.google.com/apikey))
  and/or **NVIDIA** ([build.nvidia.com](https://build.nvidia.com))

### ⚠️ Before anything else: key hygiene

A Gemini API key was committed to this repo's git history in the past
(commit `f7327fe`). If you forked/cloned before that was cleaned:

1. **Never reuse that key** — treat it as public.
2. Create a fresh key and set it **only** as a platform environment variable.
3. Keys belong in Vercel/Netlify/Render env settings — never in `.env` files
   that get committed, and never in the client bundle.

---

## 3. Environment Variables Reference

### Frontend build (Vercel/Netlify project settings)

| Variable | Required | Example | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | yes* | `AIza...` | Used server-side by `/api/generate`. *Either this or `NVIDIA_API_KEY`. |
| `NVIDIA_API_KEY` | no | `nvapi-...` | Alternative provider. |
| `LLM_PROVIDER` | no | `gemini` \| `nvidia` | Forces a provider; auto-selects Gemini when both keys exist. |
| `NVIDIA_API_URL` | no | (default set) | Override NVIDIA endpoint. |
| `VITE_BACKEND_URL` | yes | `https://market-scout-agent.onrender.com` | Baked into the client bundle at **build time** — redeploy after changing. |
| `ALLOWED_ORIGINS` | no | `https://myapp.com` | Comma-separated extra origins allowed to call `/api/generate` (custom domains). |
| `EXPOSE_CLIENT_GEMINI_KEY` | never in prod | `false` | Dev-only escape hatch that embeds the key in the bundle. Leave unset/false. |

### Backend (Render service settings)

| Variable | Required | Example | Notes |
|---|---|---|---|
| `FRONTEND_URL` | yes | `https://your-app.vercel.app` | Exact production origin for CORS (no trailing slash). Vercel/Netlify **preview** URLs are already allowed via regex. |
| `PORT` | auto | `8000` | Render injects this; the Dockerfile respects it. |

### Keep-alive (optional Render service)

| Variable | Required | Example |
|---|---|---|
| `TARGET_URL` | yes | `https://market-scout-agent.onrender.com/health` |
| `PING_INTERVAL_SECONDS` | no | `780` (~13 min, under Render's 15-min spin-down) |

---

## 4. Deploy the Backend (Render)

### Option A — Blueprint (recommended)

The repo ships `render.yaml`. In Render: **New → Blueprint**, connect the
GitHub repo, and it provisions the service automatically. Then set
`FRONTEND_URL` in the service's Environment tab (you'll get the real value
after Step 5 — a placeholder is fine for now).

### Option B — Manual

1. Render dashboard → **New → Web Service** → connect the GitHub repo.
2. Configure:
   - **Environment:** Docker
   - **Dockerfile Path:** `backend/Dockerfile`
   - **Docker Context:** `backend`
   - **Instance Type:** Free (512MB) — see [§8 cold starts](#8-cold-starts--the-keep-alive-service)
   - **Health Check Path:** `/health`
3. Environment variables: `FRONTEND_URL` (placeholder OK for now).
4. Deploy. First build takes a few minutes (installs NLTK data in the image).
5. Verify:

```bash
curl https://<your-service>.onrender.com/health
# → {"status":"healthy", ...}

curl "https://<your-service>.onrender.com/api/mock-market-scan?keywords=engineer&limit=2"
# → {"status":"success", "total_results":2, ...}
```

Interactive API docs are at `https://<your-service>.onrender.com/docs`.

---

## 5. Deploy the Frontend (Vercel — primary)

1. Vercel dashboard → **Add New → Project** → import the GitHub repo.
2. Configure:
   - **Framework Preset:** Vite
   - **Root Directory:** `app`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Environment variables (Production + Preview):
   - `GEMINI_API_KEY` = your **fresh** key
   - `VITE_BACKEND_URL` = `https://<your-service>.onrender.com`
   - (optional) `NVIDIA_API_KEY`, `LLM_PROVIDER`
4. Deploy. The `app/api/*.ts` files are picked up automatically as Edge
   Functions (`runtime: 'edge'`).
5. **Close the loop:** go back to Render and set
   `FRONTEND_URL=https://<your-app>.vercel.app`, then redeploy the backend
   (Render restarts on env change automatically).

### Alternative: Netlify

`netlify.toml` is preconfigured (`base = "app"`, publish `dist`, edge
functions mapped to `/api/generate` and `/api/market-scout` from
`app/netlify/edge-functions/`). Set the same environment variables in
**Site settings → Environment variables**. The Netlify edge functions carry
the same origin checks and rate limiting as the Vercel routes.

> Deploy to **one** platform. Running both against the same backend is fine,
> but remember `FRONTEND_URL` on Render only names one production origin —
> add the other via CORS regex coverage (`*.vercel.app` / `*.netlify.app`
> preview domains are already covered).

---

## 6. Post-Deploy Verification Checklist

Run through these in order — each one gates the next:

```bash
BACKEND=https://<your-service>.onrender.com
FRONTEND=https://<your-app>.vercel.app

# 1. Backend is alive
curl -s $BACKEND/health | python -m json.tool

# 2. CORS allows your frontend (must echo your origin back)
curl -s -i -X OPTIONS "$BACKEND/api/scrape" \
  -H "Origin: $FRONTEND" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin

# 3. Scrape endpoint blocks disallowed domains (expect 403)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BACKEND/api/scrape" \
  -H "content-type: application/json" -d '{"url":"https://example.com/x"}'

# 4. Generate API rejects foreign origins (expect 403 — this is the abuse guard)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$FRONTEND/api/generate" \
  -H "Origin: https://evil.example.com" \
  -H "content-type: application/json" -d '{"prompt":"hi"}'
```

**In the browser** at your frontend URL:
- [ ] Expertise Mode: paste a profile → *Initiate Synthesis* → a full
  sectioned resume renders (headline, summary, skills, experience) with your
  name/email/phone in the header, plus an **ATS Match Report** panel.
- [ ] Market Mode: *Scan Live Jobs* → listings appear (live from
  Remotive/Arbeitnow, or clearly labeled `(Sample Data)` / `(AI-Suggested)`
  fallbacks) → selecting a job shows an ATS match score.
- [ ] Cold backend: on first Market Mode entry after >15 min idle, the
  "Initializing Market Agents (backend waking up)..." indicator appears.
- [ ] Download button produces `<YourName>_resume.md`.
- [ ] DevTools → Network: **no request contains your API key**; all LLM
  traffic goes through `/api/generate`.

---

## 7. Local Development

```bash
git clone https://github.com/AtriDhar/Automatic_resume.git
cd Automatic_resume
```

### Backend (Terminal 1)

```bash
cd backend
python -m venv venv
venv\Scripts\activate            # Windows   |   source venv/bin/activate (Mac/Linux)
pip install -r requirements.txt
python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab')"
python main.py                   # → http://localhost:8000  (docs at /docs)
```

### Frontend (Terminal 2)

```bash
cd app
npm install
cp .env.example .env.local
```

Edit `app/.env.local`:

```ini
VITE_BACKEND_URL=http://localhost:8000

# RECOMMENDED: proxy /api/* to your deployed instance so generation works
# locally with NO API key in the client bundle:
DEV_API_PROXY=https://<your-app>.vercel.app

# Only if you skip DEV_API_PROXY (dev-only, embeds key in bundle):
# EXPOSE_CLIENT_GEMINI_KEY=true
# GEMINI_API_KEY=your_dev_key
```

```bash
npm run dev                      # → http://localhost:3000
```

### Pre-push checks

```bash
cd app && npx tsc --noEmit && npm run build          # frontend
cd ../backend && python -c "import main"             # backend imports cleanly
```

---

## 8. Cold Starts & the Keep-Alive Service

Render's free tier spins the backend down after **15 minutes** of inactivity;
the next request takes ~30s. Mitigations, in order of preference:

1. **Pay $7/mo** (Render Starter) — always-on. The right answer for anything
   user-facing; a product cannot have a "please wait, waking the server" state.
2. **Deploy `keep-alive/`** as a second free Render web service:
   - Dockerfile Path: `keep-alive/Dockerfile`, Context: `keep-alive`
   - Env: `TARGET_URL=https://<backend>.onrender.com/health`
   - Note: two free services pinging each other can still both sleep;
     an external cron (e.g. cron-job.org hitting `/health` every 10 min)
     is more reliable.
3. **Do nothing** — the frontend's wake-up hook (`useBackendWakeup`) pings
   `/health` on Market Mode entry and shows a warming indicator, so cold
   starts degrade gracefully rather than failing.

---

## 9. Security Posture (what's already enforced)

| Control | Where |
|---|---|
| LLM proxy origin check + 20 req/min/IP rate limit | `app/api/generate.ts`, Netlify equivalent |
| CORS proxy origin gate + job-board host allowlist | `app/api/market-scout.ts`, Netlify equivalent |
| Backend CORS: exact `FRONTEND_URL` + `*.vercel.app`/`*.netlify.app` regex, no credentials | `backend/main.py` |
| Scrape domain allowlist (7 job boards) + 500KB content cap | `backend/main.py` |
| Non-root Docker user, single worker, bounded TTL cache | `backend/Dockerfile`, `main.py` |
| API keys server-side only; bundle verified key-free at build | `vite.config.ts` |
| Zero-retention: session purge on timeout/close incl. PII fields | `app/index.tsx` |

**Residual risks to own:** in-memory rate limiting is per-edge-isolate (a
determined attacker can rotate IPs/regions — consider Vercel WAF or Upstash
for hard limits); no auth layer exists (anyone with the URL can use your
quota within rate limits); scraping third-party job boards is subject to
their ToS and bot defenses.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Browser CORS error calling backend | `FRONTEND_URL` mismatch (scheme/host/trailing slash) | Set exact origin on Render, redeploy |
| `403 Forbidden: origin not allowed` from `/api/generate` | Calling from a custom domain not in the allowlist | Add it to `ALLOWED_ORIGINS` on Vercel |
| `429 Rate limit exceeded` | >20 generate calls/min from one IP | Wait 60s; raise `RATE_LIMIT_MAX_REQUESTS` if legitimate |
| `Missing model provider key` | No `GEMINI_API_KEY`/`NVIDIA_API_KEY` on the platform | Set env var, redeploy |
| Frontend calls `localhost:8000` in prod | `VITE_BACKEND_URL` unset at build time | Set it, **rebuild** (it's baked in at build) |
| First Market Mode scan hangs ~30s | Render cold start | Expected on free tier — see §8 |
| Local dev: generation fails instantly | No `DEV_API_PROXY` and no dev key | Set `DEV_API_PROXY` in `.env.local` |
| `/api/scrape` → 403 | URL not on the job-board allowlist | Extend `ALLOWED_DOMAINS` in `backend/main.py` |
| Docker build fails on NLTK step | Transient network | Retry the deploy |

---

## 11. Cost Summary

| Service | Tier | Cost | Limits |
|---|---|---|---|
| Vercel (frontend + edge) | Hobby | $0 | 100GB bandwidth |
| Render (backend) | Free | $0 | 512MB, spins down after 15 min |
| Render (backend) | Starter | $7/mo | always-on — recommended for production |
| Gemini API | Free tier | $0 | rate-limited; pay-as-you-go ≈ $0.001/req beyond |

A real production posture is **$7/month** (always-on backend); everything
else can stay on free tiers until traffic demands otherwise.
