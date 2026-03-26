================================================================================
   ARS-MME: AGENTIC RESUME SYNTHESIS & MARKET MATCHING ENGINE
   Implementation Guide
================================================================================

Project Architecture:
--------------------
  Browser (WebLLM + Transformers.js)  <---->  Render Backend (Pre-Processing)
          |                                           |
          |--- Vector Embeddings (client)             |--- HTML Scraping
          |--- LLM Inference (client)                 |--- NLP Cleaning
          |--- Semantic Search (client)               |--- Text Chunking
          |                                           |
          +-----------------> Vercel/Netlify (Static Hosting)

================================================================================
                        QUICK START (5 MINUTES)
================================================================================

1. CLONE & INSTALL FRONTEND
---------------------------
   cd x:\git_demo\Automatic_resume\app
   npm install

2. CONFIGURE ENVIRONMENT
------------------------
   Copy .env.example to .env.local:
   
   cp .env.example .env.local
   
   Edit .env.local:
   - GEMINI_API_KEY=your_gemini_api_key_here
   - VITE_BACKEND_URL=http://localhost:8000

3. START BACKEND (Terminal 1)
-----------------------------
   cd x:\git_demo\Automatic_resume\backend
   
   # Create virtual environment
   python -m venv venv
   venv\Scripts\activate          # Windows
   # source venv/bin/activate     # Mac/Linux
   
   # Install dependencies
   pip install -r requirements.txt
   
   # Download NLTK data
   python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab'); nltk.download('stopwords')"
   
   # Start server
   python main.py
   
   Backend runs at: http://localhost:8000
   API docs at:     http://localhost:8000/docs

4. START FRONTEND (Terminal 2)
------------------------------
   cd x:\git_demo\Automatic_resume\app
   npm run dev
   
   Frontend runs at: http://localhost:5173

================================================================================
                        PRODUCTION DEPLOYMENT
================================================================================

STEP 1: DEPLOY BACKEND TO RENDER (FREE TIER)
---------------------------------------------
   
   a) Go to https://render.com and sign up/login
   
   b) Create New > Web Service
   
   c) Connect your GitHub repository
   
   d) Configure:
      - Name:                market-scout-agent
      - Environment:         Docker
      - Docker Context:      backend
      - Dockerfile Path:     backend/Dockerfile
      - Instance Type:       Free
      - Region:              Oregon (or closest to users)
   
   e) Add Environment Variables:
      - FRONTEND_URL = https://your-frontend-domain.vercel.app
   
   f) Deploy
   
   g) Note your backend URL: https://market-scout-agent.onrender.com

STEP 2: DEPLOY FRONTEND TO VERCEL
---------------------------------
   
   a) Go to https://vercel.com and sign up/login
   
   b) Import your GitHub repository
   
   c) Configure:
      - Framework Preset:    Vite
      - Root Directory:      app
      - Build Command:       npm run build
      - Output Directory:    dist
   
   d) Add Environment Variables:
      - GEMINI_API_KEY       = your_gemini_api_key
      - VITE_BACKEND_URL     = https://market-scout-agent.onrender.com
   
   e) Deploy

STEP 3: UPDATE RENDER CORS
--------------------------
   Go back to Render dashboard and update:
   - FRONTEND_URL = https://your-app.vercel.app

================================================================================
                        PROJECT STRUCTURE
================================================================================

Automatic_resume/
├── app/                          # Frontend (Vite + React)
│   ├── index.tsx                 # Main React application
│   ├── index.html                # HTML entry point
│   ├── index.css                 # Styles
│   ├── package.json              # Frontend dependencies
│   ├── vite.config.ts            # Vite configuration
│   ├── .env.example              # Environment template
│   ├── lib/
│   │   ├── resourceAgent.ts      # Compute path selection (local/cloud)
│   │   ├── embeddings.ts         # Embeddings client
│   │   ├── useBackendWakeup.ts   # Backend wake-up hook (NEW)
│   │   └── marketScoutClient.ts  # Market Scout API client (NEW)
│   ├── workers/
│   │   └── embeddings.worker.ts  # Web Worker for embeddings
│   ├── netlify/
│   │   └── edge-functions/       # Netlify Edge Functions (legacy)
│   └── public/
│       └── sw.js                 # Service Worker for caching
│
├── backend/                      # Backend (FastAPI) (NEW)
│   ├── Dockerfile                # Optimized for 512MB RAM
│   ├── requirements.txt          # Python dependencies
│   ├── main.py                   # FastAPI application
│   ├── types.py                  # Pydantic models
│   ├── .env.example              # Backend env template
│   ├── .dockerignore             # Docker build exclusions
│   └── README.md                 # Backend documentation
│
├── render.yaml                   # Render deployment config (NEW)
├── netlify.toml                  # Netlify configuration
├── SRS.md                        # Software Requirements Spec
└── modifications.md              # Change log (NEW)

================================================================================
                        API REFERENCE
================================================================================

BACKEND ENDPOINTS (Render)
--------------------------

GET /health
   Purpose:  Wake-up / Keep-alive ping
   Response: { "status": "healthy", "uptime_seconds": 123.4, ... }

POST /api/scrape
   Purpose:  Scrape job URL, return Vector-Ready chunks
   Body:     { "url": "https://linkedin.com/jobs/...", "force_refresh": false }
   Response: {
     "status": "success",
     "job_chunks": [
       { "id": "abc_0", "text": "...", "token_count": 450, "metadata": {...} }
     ],
     "processing_time_ms": 1200
   }

GET /api/mock-jobs?job_index=0
   Purpose:  Test data (development only)

GET /api/mock-market-scan?keywords=engineer&limit=3
   Purpose:  Simulated market scan (development only)

FRONTEND HOOKS
--------------

useBackendWakeup()
   Returns: { isWarm, isWaking, wakeUp, forceWakeUp, error }
   Usage:
     const { isWaking, wakeUp } = useBackendWakeup();
     useEffect(() => { wakeUp(); }, []);
     if (isWaking) return <Loading />;

useAutoWakeup(enabled)
   Auto-wakes backend on component mount

================================================================================
                        KEY IMPLEMENTATION DETAILS
================================================================================

1. VECTOR-READY PROTOCOL
------------------------
   The backend returns text chunks optimized for embedding:
   - ~500 tokens per chunk (optimal for transformers)
   - Preserves sentence boundaries
   - Includes metadata for reconstruction
   
   Frontend can directly embed:
     const embeddings = await Promise.all(
       response.job_chunks.map(c => embedder.embed(c.text))
     );

2. WAKE-UP PROTOCOL (Render Free Tier)
--------------------------------------
   Render spins down after 15 min inactivity.
   
   Frontend handles this:
   - Pings /health before /api/scrape
   - If response > 2s, shows "Initializing..."
   - Retries 3x with exponential backoff
   - Caches "warm" state for 10 minutes

3. MEMORY CONSTRAINTS (512MB)
-----------------------------
   Backend optimizations:
   - Single Uvicorn worker
   - NLTK only (no spaCy)
   - Max 100 cached items
   - Max 500KB per page
   - Multi-stage Docker build

4. COMPUTE PATH SELECTION
-------------------------
   resourceAgent.ts decides:
   
   IF (WebGPU available AND high-spec device):
     -> Local path: WebLLM + Worker embeddings
   ELSE:
     -> Cloud path: API calls + serverless fallback
   
   Market Scout always uses Render backend.

================================================================================
                        TESTING CHECKLIST
================================================================================

[ ] Backend starts without errors
[ ] GET /health returns 200
[ ] GET /api/mock-jobs returns valid JSON
[ ] POST /api/scrape works with test URL
[ ] Frontend connects to backend
[ ] Wake-up hook shows loading on cold start
[ ] Embeddings work (check browser console)
[ ] Resume generation works end-to-end

================================================================================
                        TROUBLESHOOTING
================================================================================

BACKEND WON'T START
-------------------
   - Check Python version (3.9+ required)
   - Ensure venv is activated
   - Run: pip install -r requirements.txt
   - Check port 8000 is free

CORS ERRORS IN BROWSER
----------------------
   - Check FRONTEND_URL env var on Render
   - Ensure URLs match exactly (with/without trailing slash)
   - Check browser console for specific origin

COLD START TOO SLOW
-------------------
   - First request after 15min idle = ~30s
   - This is expected on Render free tier
   - Consider scheduled keep-alive (paid feature)

EMBEDDINGS NOT WORKING
----------------------
   - Check browser console for WebGPU support
   - Ensure Service Worker is registered
   - Try hard refresh (Ctrl+Shift+R)

OUT OF MEMORY (BACKEND)
-----------------------
   - Reduce CACHE_MAX_SIZE in main.py
   - Lower MAX_CONTENT_LENGTH
   - Check for memory leaks in scraping

================================================================================
                        DEVELOPMENT WORKFLOW
================================================================================

1. LOCAL DEVELOPMENT
--------------------
   Terminal 1: cd backend && python main.py
   Terminal 2: cd app && npm run dev
   
   Backend: http://localhost:8000/docs (Swagger UI)
   Frontend: http://localhost:5173

2. TESTING BACKEND ONLY
-----------------------
   # Test health
   curl http://localhost:8000/health
   
   # Test mock data
   curl http://localhost:8000/api/mock-jobs
   
   # Test scraping (use allowed domain)
   curl -X POST http://localhost:8000/api/scrape \
     -H "Content-Type: application/json" \
     -d '{"url": "https://www.indeed.com/viewjob?jk=test"}'

3. BUILDING FOR PRODUCTION
--------------------------
   cd app
   npm run build
   
   Output in: app/dist/

================================================================================
                        COST ANALYSIS
================================================================================

SERVICE             TIER        MONTHLY COST    LIMITS
-------             ----        ------------    ------
Render Backend      Free        $0              512MB RAM, spins down
Vercel Frontend     Hobby       $0              100GB bandwidth
Gemini API          Free        $0              60 req/min
Total                           $0

UPGRADE PATH (if needed):
- Render Starter: $7/mo (always-on, 512MB)
- Vercel Pro: $20/mo (more bandwidth)
- Gemini Pay-as-go: ~$0.001/request

================================================================================
                        NEXT STEPS
================================================================================

1. [ ] Deploy backend to Render
2. [ ] Deploy frontend to Vercel
3. [ ] Test end-to-end flow
4. [ ] Add more job board domains to allowlist
5. [ ] Implement caching strategy improvements
6. [ ] Add error tracking (Sentry)
7. [ ] Set up CI/CD pipeline

================================================================================
   Questions? See SRS.md for full requirements or modifications.md for changes.
================================================================================
