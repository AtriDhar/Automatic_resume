# ARS-MME Deployment Guide

## Step-by-Step Procedure for Full Production Deployment

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Local Development Setup & Verification](#2-local-development-setup--verification)
3. [Deploy Backend to Render (Free Tier)](#3-deploy-backend-to-render-free-tier)
4. [Deploy Frontend to Vercel](#4-deploy-frontend-to-vercel)
5. [Alternative: Deploy Frontend to Netlify](#5-alternative-deploy-frontend-to-netlify)
6. [Post-Deployment Configuration (CORS Linking)](#6-post-deployment-configuration-cors-linking)
7. [End-to-End Testing & Verification](#7-end-to-end-testing--verification)
8. [Monitoring & Maintenance](#8-monitoring--maintenance)
9. [Troubleshooting](#9-troubleshooting)
10. [Upgrade Path](#10-upgrade-path)

---

## 1. Prerequisites

### Accounts Required

| Service       | URL                          | Tier     | Purpose                             |
| ------------- | ---------------------------- | -------- | ----------------------------------- |
| GitHub        | https://github.com           | Free     | Source code hosting & CI/CD trigger |
| Render        | https://render.com           | Free     | Backend (Market Scout Agent)        |
| Vercel        | https://vercel.com           | Hobby    | Frontend hosting (SPA)              |
| Google AI     | https://aistudio.google.com  | Free     | Gemini API key                      |

> **Alternative:** You can use **Netlify** instead of Vercel for the frontend (see [Section 5](#5-alternative-deploy-frontend-to-netlify)).

### Software Required (for local development)

| Tool          | Version   | Install                                    |
| ------------- | --------- | ------------------------------------------ |
| Node.js       | >= 18.x   | https://nodejs.org                         |
| npm           | >= 9.x    | Bundled with Node.js                       |
| Python        | >= 3.9    | https://python.org                         |
| pip           | Latest    | Bundled with Python                        |
| Git           | Latest    | https://git-scm.com                        |
| Docker        | Latest    | https://docker.com (optional, for testing) |

### API Keys to Obtain

1. **Gemini API Key** — Go to https://aistudio.google.com/apikey → Create API key → Copy it.

---

## 2. Local Development Setup & Verification

Before deploying to production, ensure the project works locally.

### Step 2.1: Clone the Repository

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
```

### Step 2.2: Set Up the Backend

```bash
cd backend

# Create a Python virtual environment
python -m venv venv

# Activate the virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Download NLTK data
python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab'); nltk.download('stopwords')"
```

### Step 2.3: Configure Backend Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and set:
#   FRONTEND_URL=http://localhost:5173
#   PORT=8000
```

### Step 2.4: Start the Backend Server

```bash
python main.py
```

**Verify it works:**
- Open http://localhost:8000/docs → Swagger UI should load
- Open http://localhost:8000/health → Should return `{"status": "healthy", ...}`
- Test mock endpoint: http://localhost:8000/api/mock-jobs → Should return JSON

### Step 2.5: Set Up the Frontend

Open a **new terminal**:

```bash
cd app

# Install Node.js dependencies
npm install
```

### Step 2.6: Configure Frontend Environment

```bash
# Copy the example env file
cp .env.example .env.local

# Edit .env.local and set:
#   GEMINI_API_KEY=<your_gemini_api_key>
#   VITE_BACKEND_URL=http://localhost:8000
#   EXPOSE_CLIENT_GEMINI_KEY=false
```

### Step 2.7: Start the Frontend Dev Server

```bash
npm run dev
```

**Verify it works:**
- Open http://localhost:3000 (or the port Vite reports)
- Check that the app loads with no console errors
- Test the Market Mode to ensure backend communication

### Step 2.8: Test Build for Production

```bash
npm run build
```

Ensure the build completes with no errors. Output goes to `app/dist/`.

---

## 3. Deploy Backend to Render (Free Tier)

### Step 3.1: Push Code to GitHub

Ensure your full project (including `backend/` and `render.yaml`) is pushed to GitHub:

```bash
git add .
git commit -m "Prepare for deployment"
git push origin main
```

### Step 3.2: Create a Render Account

1. Go to https://render.com
2. Sign up with your **GitHub account** (this links your repos automatically)

### Step 3.3: Create a New Web Service

1. From the Render Dashboard, click **"New +"** → **"Web Service"**
2. Select **"Build and deploy from a Git repository"** → click **Next**
3. Find and connect your GitHub repository

### Step 3.4: Configure the Web Service

Fill in the following settings:

| Setting               | Value                                |
| --------------------- | ------------------------------------ |
| **Name**              | `market-scout-agent`                 |
| **Region**            | Oregon (US West) or closest to users |
| **Branch**            | `main`                               |
| **Root Directory**    | _(leave blank)_                      |
| **Environment**       | `Docker`                             |
| **Dockerfile Path**   | `backend/Dockerfile`                 |
| **Docker Context**    | `backend`                            |
| **Instance Type**     | **Free** ($0/month)                  |

### Step 3.5: Add Environment Variables

In the **Environment Variables** section, add:

| Key              | Value                                           |
| ---------------- | ----------------------------------------------- |
| `FRONTEND_URL`   | `https://your-frontend.vercel.app` (placeholder — update in Step 6) |
| `PORT`           | `8000`                                          |

> **Note:** You'll update `FRONTEND_URL` with the actual Vercel URL after frontend deployment.

### Step 3.6: Deploy

1. Click **"Create Web Service"**
2. Render will build the Docker image and deploy — this takes **3–5 minutes**
3. Watch the **Logs** tab for progress

### Step 3.7: Verify Backend Deployment

Once deployed, Render gives you a URL like:
```
https://market-scout-agent.onrender.com
```

**Verify:**
```bash
# Health check
curl https://market-scout-agent.onrender.com/health

# Mock data
curl https://market-scout-agent.onrender.com/api/mock-jobs

# Swagger docs (open in browser)
# https://market-scout-agent.onrender.com/docs
```

> **Important:** The first request may take **30–60 seconds** because Render Free Tier spins down after 15 minutes of inactivity. This is expected behavior. Subsequent requests will be fast.

### Step 3.8: Note Your Backend URL

Save your backend URL — you'll need it for the frontend deployment:
```
https://market-scout-agent.onrender.com
```

---

## 4. Deploy Frontend to Vercel

### Step 4.1: Create a Vercel Account

1. Go to https://vercel.com
2. Sign up with your **GitHub account**

### Step 4.2: Import Your Repository

1. From the Vercel Dashboard, click **"Add New..."** → **"Project"**
2. Select **"Import Git Repository"**
3. Find and select your repository
4. Click **"Import"**

### Step 4.3: Configure Build Settings

| Setting               | Value           |
| --------------------- | --------------- |
| **Framework Preset**  | `Vite`          |
| **Root Directory**    | `app`           |
| **Build Command**     | `npm run build` |
| **Output Directory**  | `dist`          |
| **Install Command**   | `npm install`   |

### Step 4.4: Add Environment Variables

In the **Environment Variables** section, add:

| Key                        | Value                                              | Environment       |
| -------------------------- | -------------------------------------------------- | ------------------ |
| `GEMINI_API_KEY`           | `<your-gemini-api-key>`                            | Production, Preview |
| `VITE_BACKEND_URL`         | `https://market-scout-agent.onrender.com`          | Production, Preview |
| `EXPOSE_CLIENT_GEMINI_KEY` | `false`                                            | Production          |

> **Security Note:** `GEMINI_API_KEY` is used by Netlify Edge Functions or server-side proxying. With `EXPOSE_CLIENT_GEMINI_KEY=false`, the key will NOT be bundled into the client JavaScript.

### Step 4.5: Deploy

1. Click **"Deploy"**
2. Vercel builds and deploys — takes **1–2 minutes**
3. Watch the build logs for errors

### Step 4.6: Verify Frontend Deployment

Vercel gives you a URL like:
```
https://your-project.vercel.app
```

**Verify:**
- Open the URL in a browser
- Check browser DevTools console for errors
- Ensure the app loads correctly

### Step 4.7: Note Your Frontend URL

Save your frontend URL — you'll need it for CORS configuration:
```
https://your-project.vercel.app
```

---

## 5. Alternative: Deploy Frontend to Netlify

If you prefer Netlify over Vercel (Netlify has built-in Edge Functions support as configured in `netlify.toml`):

### Step 5.1: Create a Netlify Account

1. Go to https://netlify.com
2. Sign up with your **GitHub account**

### Step 5.2: Import Your Repository

1. Click **"Add new site"** → **"Import an existing project"**
2. Select GitHub and connect your repository

### Step 5.3: Configure Build Settings

The `netlify.toml` at the project root auto-configures most settings:

| Setting               | Value           |
| --------------------- | --------------- |
| **Base directory**    | `app`           |
| **Build command**     | `npm run build` |
| **Publish directory** | `app/dist`      |

### Step 5.4: Add Environment Variables

Go to **Site settings** → **Environment variables** and add:

| Key                        | Value                                              |
| -------------------------- | -------------------------------------------------- |
| `GEMINI_API_KEY`           | `<your-gemini-api-key>`                            |
| `VITE_BACKEND_URL`         | `https://market-scout-agent.onrender.com`          |
| `EXPOSE_CLIENT_GEMINI_KEY` | `false`                                            |

### Step 5.5: Deploy

1. Click **"Deploy site"**
2. Netlify builds and deploys — takes **1–3 minutes**
3. Note your Netlify URL (e.g., `https://your-site.netlify.app`)

### Step 5.6: Netlify Edge Functions

The `netlify.toml` automatically maps two Edge Functions:
- `/api/generate` → Gemini API proxy (streaming)
- `/api/market-scout` → Market data proxy (legacy/fallback)

These functions are located in `app/netlify/edge-functions/` and deploy automatically.

---

## 6. Post-Deployment Configuration (CORS Linking)

This is a **critical step** — the backend and frontend must know each other's URLs for CORS to work.

### Step 6.1: Update FRONTEND_URL on Render

1. Go to https://dashboard.render.com
2. Click on your **market-scout-agent** service
3. Go to the **Environment** tab
4. Update the `FRONTEND_URL` variable:
   ```
   FRONTEND_URL=https://your-project.vercel.app
   ```
   > If you have multiple frontend URLs (e.g., preview deployments), use comma-separated values:
   > ```
   > FRONTEND_URL=https://your-project.vercel.app,https://your-site.netlify.app
   > ```
5. Click **"Save Changes"**
6. Render will **automatically redeploy** with the updated CORS settings

### Step 6.2: Verify CORS

Open your frontend in a browser and test a Market Mode request. In the browser DevTools:
- **Network tab:** Check that requests to `market-scout-agent.onrender.com` return `200`
- **Console tab:** Ensure no CORS errors appear

If you see CORS errors, double-check:
- The `FRONTEND_URL` on Render matches your frontend URL **exactly** (including `https://`, no trailing slash)
- The frontend `VITE_BACKEND_URL` points to the correct Render URL

---

## 7. End-to-End Testing & Verification

### Checklist

| # | Test                                                     | Expected Result                                                        |
|---|----------------------------------------------------------|------------------------------------------------------------------------|
| 1 | Open frontend URL in browser                             | App loads, no console errors                                           |
| 2 | Check backend health: `GET /health`                      | Returns `{"status": "healthy", ...}`                                   |
| 3 | Test mock jobs: `GET /api/mock-jobs`                     | Returns valid JSON array                                               |
| 4 | Test scraping: `POST /api/scrape` with a job URL         | Returns `VectorReadyResponse` with `job_chunks`                        |
| 5 | Frontend → Backend communication                        | Market Mode successfully calls backend, no CORS errors                 |
| 6 | Backend cold-start handling                              | Frontend shows "Initializing..." spinner on first wake-up              |
| 7 | Embeddings in browser                                    | Browser DevTools console shows embedding generation (Path A devices)   |
| 8 | Resume generation flow                                   | Full resume generated successfully (either local WebLLM or Gemini API) |
| 9 | Service Worker caching                                   | Model weights cached in browser (Network tab shows `sw.js` serving)    |
| 10 | Session data cleanup                                    | Closing the tab clears ephemeral data (no persistent PII storage)      |

### Quick Test Commands

```bash
# 1. Health check (may be slow on first hit due to cold start)
curl https://market-scout-agent.onrender.com/health

# 2. Mock job data
curl https://market-scout-agent.onrender.com/api/mock-jobs?job_index=0

# 3. Scraping test
curl -X POST https://market-scout-agent.onrender.com/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.indeed.com/viewjob?jk=test", "force_refresh": false}'

# 4. Market scan mock
curl "https://market-scout-agent.onrender.com/api/mock-market-scan?keywords=engineer&limit=3"
```

---

## 8. Monitoring & Maintenance

### Render Dashboard

- **Logs:** View real-time logs at Dashboard → Service → Logs
- **Metrics:** Monitor CPU, Memory, and Request count
- **Health Checks:** Render pings `/health` automatically (configured in `render.yaml`)

### Vercel Dashboard

- **Deployments:** View build logs and deployment history
- **Analytics:** Monitor page views and Web Vitals (Vercel Pro)
- **Functions:** Monitor Edge Function invocations (if using Netlify-style functions)

### Cold Start Awareness

The Render Free Tier **spins down after 15 minutes of inactivity**:
- First request after idle takes **30–60 seconds**
- The frontend's `useBackendWakeup` hook handles this gracefully
- The hook pings `/health`, shows a loading spinner, and retries with exponential backoff

### Optional: Keep-Alive Cron (Reduces Cold Starts)

If cold starts are unacceptable, use an external cron service to ping the backend every 14 minutes:

1. Use https://cron-job.org (free) or https://uptimerobot.com (free)
2. Create a monitor that hits:
   ```
   GET https://market-scout-agent.onrender.com/health
   ```
3. Set interval to **14 minutes**
4. This keeps the service warm (but Render may bill for always-on usage on paid plans)

> **Note:** Render's free tier allows 750 hours/month. a keep-alive cron will consume ~720 hours/month, which fits within the limit for a single service.

---

## 9. Troubleshooting

### Build Failures on Render

| Symptom                        | Solution                                                              |
| ------------------------------ | --------------------------------------------------------------------- |
| Docker build OOM               | Ensure multi-stage build in Dockerfile is used (already configured)   |
| Python package install fails   | Check `requirements.txt` for version conflicts                        |
| NLTK download timeout          | Retry the build — NLTK downloads can be slow                         |

### Build Failures on Vercel

| Symptom                        | Solution                                                              |
| ------------------------------ | --------------------------------------------------------------------- |
| `npm run build` fails          | Check `app/package.json` dependencies, run `npm install` locally first |
| TypeScript errors              | Run `npx tsc --noEmit` locally to find and fix type errors            |
| Missing env vars               | Ensure `GEMINI_API_KEY` and `VITE_BACKEND_URL` are set in Vercel      |
| Root directory wrong           | Verify Root Directory is set to `app` in Vercel project settings      |

### Runtime Errors

| Symptom                                 | Solution                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| CORS error in browser                   | Update `FRONTEND_URL` on Render to match exactly (scheme + domain, no trailing `/`) |
| Backend returns 503                     | Service is spinning up — wait 30–60s, the wake-up hook handles this                 |
| "Missing GEMINI_API_KEY" error          | Set `GEMINI_API_KEY` in Vercel/Netlify env vars                                     |
| Embeddings not loading                  | Check WebGPU support: `navigator.gpu !== undefined` in console                      |
| Scraping returns empty results          | Target URL domain may not be in `ALLOWED_DOMAINS` list in `main.py`                 |
| Backend OOM (memory killed)             | Reduce `CACHE_MAX_SIZE` or `MAX_CONTENT_LENGTH` in `main.py`                        |

---

## 10. Upgrade Path

### When to Upgrade

| Signal                           | Action                                          |
| -------------------------------- | ----------------------------------------------- |
| Cold starts are too slow         | Upgrade Render to Starter ($7/mo) for always-on |
| Bandwidth limits hit on Vercel   | Upgrade Vercel to Pro ($20/mo)                  |
| Gemini rate limits hit           | Switch to Pay-as-you-go (~$0.001/request)       |
| Need >512MB RAM on backend       | Upgrade Render to Standard ($25/mo, 2GB RAM)    |

### Cost Summary

| Service          | Free Tier   | Paid Tier           |
| ---------------- | ----------- | ------------------- |
| Render Backend   | $0/mo       | $7/mo (Starter)     |
| Vercel Frontend  | $0/mo       | $20/mo (Pro)        |
| Gemini API       | $0/mo       | ~$0.001/req         |
| **Total (Free)** | **$0/mo**   |                     |
| **Total (Paid)** |             | **~$27/mo**         |

---

## Deployment Architecture Diagram

```
                        ┌──────────────────────────────┐
                        │         GitHub Repo           │
                        │  (Push triggers both deploys) │
                        └──────────┬───────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
             ┌──────▼──────┐            ┌─────────▼────────┐
             │   Vercel     │            │     Render        │
             │  (Frontend)  │            │    (Backend)       │
             │              │            │                    │
             │  Vite+React  │  HTTPS →   │  FastAPI+Docker   │
             │  WebLLM      │ ←──────    │  Scraping+NLP     │
             │  Transformers│            │  /health           │
             │              │            │  /api/scrape       │
             └──────────────┘            └────────────────────┘
                    │
          ┌─────────┴──────────┐
          │  Browser Runtime   │
          │  - WebGPU/WebLLM   │
          │  - Web Workers     │
          │  - Service Worker  │
          │  - Vector Store    │
          └────────────────────┘
```

---

## Quick Reference: Full Deployment Sequence

```
1.  Get Gemini API key from Google AI Studio
2.  Push code to GitHub
3.  Create Render Web Service (Docker, backend/, Free)
4.  Set FRONTEND_URL env var on Render (placeholder)
5.  Deploy backend → note URL
6.  Create Vercel Project (Vite, app/)
7.  Set GEMINI_API_KEY + VITE_BACKEND_URL env vars
8.  Deploy frontend → note URL
9.  Update FRONTEND_URL on Render with actual Vercel URL
10. Render auto-redeploys with correct CORS
11. Test end-to-end flow
12. Done ✓
```
