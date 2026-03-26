# Market Scout Agent - Backend Service

Lightweight Python microservice for the ARS-MME (Agentic Resume Synthesis & Market Matching Engine).

## Purpose

This service acts as a **Pre-Processing Factory** for job posting data:
- Handles long-running scraping (LinkedIn/Indeed) with CORS bypass
- NLP cleaning and text chunking
- Returns "Vector-Ready" JSON for immediate client-side Transformers.js processing

**Important:** This service does NOT perform vector embeddings or host a Vector DB. All ML workloads are handled by the browser (WebLLM/Transformers.js).

## Tech Stack

- **Framework:** FastAPI + Uvicorn
- **HTML Parsing:** BeautifulSoup + lxml
- **NLP:** NLTK (lightweight tokenization only)
- **HTTP Client:** httpx (async)
- **Caching:** cachetools (in-memory TTL cache)

## Deployment (Render Free Tier)

### Prerequisites
- Render account (free tier is sufficient)
- Docker-based deployment

### Setup

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set the following:
   - **Environment:** Docker
   - **Docker Context Directory:** `backend`
   - **Instance Type:** Free (512MB RAM / 0.1 CPU)

4. Add environment variables:
   ```
   FRONTEND_URL=https://your-frontend.vercel.app
   ```

### Keep-Alive Strategy

The Render free tier spins down after 15 minutes of inactivity. The frontend implements a "Ping-Before-Request" pattern using the `/health` endpoint.

## API Endpoints

### Health Check
```
GET /health
```
Used for:
- Wake-up signals from frontend
- Keep-alive pings
- Service health monitoring

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-04T12:00:00Z",
  "uptime_seconds": 3600.5,
  "request_count": 42,
  "memory_mb": 128.5
}
```

### Scrape & Clean
```
POST /api/scrape
Content-Type: application/json

{
  "url": "https://www.linkedin.com/jobs/view/123456",
  "force_refresh": false
}
```

Response (Vector-Ready Protocol):
```json
{
  "status": "success",
  "job_chunks": [
    {
      "id": "abc123_chunk_0",
      "text": "cleaned text chunk...",
      "token_count": 450,
      "metadata": {
        "url": "...",
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

### Mock Endpoints (for testing)
```
GET /api/mock-jobs?job_index=0
GET /api/mock-market-scan?keywords=software+engineer&limit=3
```

## Local Development

```bash
# Create virtual environment (run from PARENT directory to avoid
# Python built-in module shadowing by backend/schemas.py)
cd ..
python -m venv backend/venv
cd backend
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Download NLTK data
python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab'); nltk.download('stopwords')"

# Run development server
python main.py
```

Server runs at: http://localhost:8000

API docs: http://localhost:8000/docs

## Memory Optimization

The service is optimized for the 512MB RAM constraint:

1. **No heavy ML libraries** - NLTK only (not spaCy or Transformers)
2. **Bounded cache** - TTLCache with max 100 items
3. **Content limits** - Max 500KB per page
4. **Single worker** - Uvicorn runs with 1 worker
5. **Multi-stage Dockerfile** - Smaller final image

## Vector-Ready Protocol

The response schema is designed for immediate client-side processing:

```typescript
interface VectorReadyResponse {
  status: 'success' | 'partial' | 'error';
  job_chunks: Array<{
    id: string;           // Unique chunk ID
    text: string;         // Cleaned text (~500 tokens)
    token_count: number;  // Approximate tokens
    metadata: {
      url: string;
      section: string;
      job_id: string;
    };
  }>;
  processing_time_ms: number;
  cached: boolean;
}
```

The frontend can directly map `job_chunks` into Transformers.js embedding calls:

```typescript
const embeddings = await Promise.all(
  response.job_chunks.map(chunk => 
    embeddingModel.embed(chunk.text)
  )
);
```
