

This contains everything you need to run your app locally.

This is just a prototype of the Idea majority of our objectives are defined in the SRS document provided in the root directory

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
   - Template: copy [.env.example](.env.example) → `.env.local`, then replace the value.
3. Run the app:
   `npm run dev`

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
- The frontend uses `GEMINI_API_KEY` at build time via `vite.config.ts` and exposes it to the client bundle (prototype behavior).

## Major Changes (Implemented From SRS)

- Two-tab layout now matches SRS UI: **Expertise Mode** / **Market Mode**.
- SRS FR-1.2 (Immediate Verification): uploading a document triggers OCR and then immediate verification; failures surface a required action (correct details or override with a disclaimer).
- SRS FR-1.6 (Ephemeral Session): added a session timeout purge and a tab-close purge hook that clears the in-memory profile, jobs, and generated resume.
- SRS FR-2.1 + NFR 5.3 (Market Fallback): Market scanning caches the last successful result in-memory per industry and uses a minimal built-in fallback list if live scanning fails.
- SRS FR-3.1 (Vector Embeddings): replaced the random “match score” with a deterministic client-side embedding + cosine similarity score (prototype-grade, no storage).

## Notes / Prototype Constraints

- This repo is frontend-only. The SRS describes a full MCP-backed multi-agent backend and zero-retention server-side processing. Here we model those requirements in the UI and client memory (no persistence) as a prototype.
- Environment variable usage:
  - Put `GEMINI_API_KEY=...` in `app/.env.local`.
  - Vite maps it into `process.env.API_KEY` via `vite.config.ts`.
