

This contains everything you need to run your app locally.

This is just a prototype of the Idea majority of our objectives are defined in the SRS document provided in the root directory

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. (Optional) Set `GEMINI_API_KEY` in `.env.local`.
   - Template: copy [.env.example](.env.example) → `.env.local`.
   - By default, the client bundle does **not** include the key.
   - If you explicitly want the client-side Gemini SDK fallback in local dev, set `EXPOSE_CLIENT_GEMINI_KEY=true`.
3. Run the app (frontend only):
   `npm run dev`

If you want to test the **serverless/edge** path locally (recommended), run Netlify’s local dev server from the repo root:

- `npx netlify dev`

This serves the Vite app and mounts the edge functions at `/api/*`.

## Deploy (Netlify)

This repo includes a `netlify.toml` at the repo root, so Netlify will automatically use:

- Base directory: `app`
- Build command: `npm run build`
- Publish directory: `dist`

Steps:

- Push this repo to GitHub.
- In Netlify: **Add new site → Import an existing project** → pick your repo.
- In **Site configuration → Environment variables**, add:
   - `GEMINI_API_KEY` = your Gemini key
- Deploy.

Notes:
- The deployed app uses **Netlify Edge Functions** for `/api/generate` and `/api/market-scout` (see repo root `netlify.toml`).
- The frontend no longer *requires* exposing `GEMINI_API_KEY` to the client for text generation.
- OCR uploads prefer `/api/generate` (multimodal parts) and only fall back to client-side Gemini when explicitly enabled.

## Major Changes (Implemented From SRS)

- Two-tab layout now matches SRS UI: **Expertise Mode** / **Market Mode**.
- SRS FR-1.2 (Immediate Verification): uploading a document triggers OCR and then immediate verification; failures surface a required action (correct details or override with a disclaimer).
- SRS FR-1.6 (Ephemeral Session): added a session timeout purge and a tab-close purge hook that clears the in-memory profile, jobs, and generated resume.
- SRS FR-2.1 + NFR 5.3 (Market Fallback): Market scanning caches the last successful result in-memory per industry and uses a minimal built-in fallback list if live scanning fails.
- SRS FR-3.1 (Vector Embeddings): replaced the random “match score” with a deterministic client-side embedding + cosine similarity score (prototype-grade, no storage).

## Browser-First Hybrid (New)

- **ResourceAgent (Client Orchestrator):** On load, profiles the device and selects `local` vs `cloud` path.
- **Local Vector Engine:** Uses Transformers.js inside a **Web Worker** (no main-thread blocking).
- **Model Caching:** A Service Worker caches model assets via the **Cache API** (not LocalStorage).
- **Serverless/Edge fallback:**
   - `/api/generate` proxies to Gemini (supports SSE streaming pass-through).
   - `/api/market-scout` reverse-proxies job board HTML (CORS bypass) with an allowlist.

## Notes / Prototype Constraints

- This repo is frontend-only. The SRS describes a full MCP-backed multi-agent backend and zero-retention server-side processing. Here we model those requirements in the UI and client memory (no persistence) as a prototype.
- Environment variable usage:
   - **Netlify deploy:** set `GEMINI_API_KEY` in Netlify’s environment variables (used by edge functions).
   - **Local dev (fallback only):** `app/.env.local` can still provide `GEMINI_API_KEY`, which Vite maps into `process.env.API_KEY` via `vite.config.ts`.
