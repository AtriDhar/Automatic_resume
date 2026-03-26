"""
Market Scout Agent - Pre-Processing Factory
============================================
Lightweight Python microservice for Render Free Tier (512MB RAM / 0.1 CPU)

Purpose:
- Handle long-running scraping (LinkedIn/Indeed) with CORS bypass
- NLP cleaning and chunking (NO vector embeddings - done client-side)
- Return "Vector-Ready" JSON for immediate client-side Transformers.js processing

Architecture:
- This service acts as a "Pre-Processing Factory"
- Heavy ML workloads (embeddings, inference) are handled by the browser (WebLLM/Transformers.js)
"""

import os
import re
import time
import hashlib
import asyncio
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

import httpx
import nltk
from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.corpus import stopwords
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from cachetools import TTLCache
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# --- Configuration ---
MAX_CHUNK_TOKENS = 500  # Token limit per chunk for optimal embedding
MIN_CHUNK_TOKENS = 50   # Minimum tokens to form a valid chunk
CACHE_TTL_SECONDS = 3600  # 1 hour cache
CACHE_MAX_SIZE = 100  # Max cached items (memory-conscious)
REQUEST_TIMEOUT = 25  # Seconds (stay under Render's limits)
MAX_CONTENT_LENGTH = 500_000  # 500KB max per page

# Allowed job board domains for scraping
ALLOWED_DOMAINS = [
    "indeed.com",
    "linkedin.com",
    "glassdoor.com",
    "stackoverflow.com",
    "careers.google.com",
    "jobs.lever.co",
    "boards.greenhouse.io",
]

# Initialize caches
job_cache: TTLCache = TTLCache(maxsize=CACHE_MAX_SIZE, ttl=CACHE_TTL_SECONDS)
health_cache: Dict[str, Any] = {"last_request": None, "request_count": 0}

# --- Pydantic Models ---

class JobChunk(BaseModel):
    """Single chunk of cleaned job text, ready for client-side vectorization"""
    id: str = Field(..., description="Unique chunk identifier (job_id + chunk_index)")
    text: str = Field(..., description="Cleaned text chunk (~500 tokens)")
    token_count: int = Field(..., description="Approximate token count")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Source metadata")


class VectorReadyResponse(BaseModel):
    """
    Vector-Ready Protocol Response
    This schema allows the Frontend to immediately map chunks into Transformers.js
    """
    status: str = Field(..., description="'success' | 'partial' | 'error'")
    job_chunks: List[JobChunk] = Field(default_factory=list, description="Cleaned text chunks")
    source_url: Optional[str] = Field(None, description="Original URL scraped")
    processing_time_ms: int = Field(..., description="Server processing time")
    cached: bool = Field(False, description="Whether result was served from cache")
    errors: List[str] = Field(default_factory=list, description="Non-fatal errors encountered")


class HealthResponse(BaseModel):
    """Health check response for keep-alive protocol"""
    status: str
    timestamp: str
    uptime_seconds: float
    last_request_ago_seconds: Optional[float]
    request_count: int
    memory_mb: Optional[float]


class ScrapeRequest(BaseModel):
    """Request body for scrape endpoint"""
    url: str = Field(..., description="Job posting URL to scrape")
    force_refresh: bool = Field(False, description="Bypass cache")


# --- NLP Utilities ---

def estimate_tokens(text: str) -> int:
    """Estimate token count (rough: words * 1.3 for subword tokenization)"""
    words = len(text.split())
    return int(words * 1.3)


def clean_html(html: str) -> str:
    """
    Extract and clean text from HTML
    Strips boilerplate, scripts, styles, navigation elements
    """
    soup = BeautifulSoup(html, "lxml")
    
    # Remove unwanted elements
    for element in soup.find_all([
        "script", "style", "nav", "header", "footer", 
        "aside", "form", "button", "iframe", "noscript"
    ]):
        element.decompose()
    
    # Remove hidden elements
    for element in soup.find_all(attrs={"hidden": True}):
        element.decompose()
    for element in soup.find_all(style=re.compile(r"display:\s*none")):
        element.decompose()
    
    # Extract text
    text = soup.get_text(separator=" ", strip=True)
    
    # Clean whitespace
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    
    return text.strip()


def extract_job_sections(text: str) -> Dict[str, str]:
    """
    Attempt to extract common job posting sections
    Returns dict with keys: title, company, description, requirements, benefits
    """
    sections = {
        "title": "",
        "company": "",
        "description": "",
        "requirements": "",
        "benefits": "",
        "full_text": text,
    }
    
    # Common section headers (case-insensitive patterns)
    patterns = {
        "requirements": r"(?:requirements?|qualifications?|what you.?ll need|must have|skills? required)",
        "benefits": r"(?:benefits?|perks?|what we offer|compensation)",
        "description": r"(?:description|about (?:the )?(?:role|job|position)|overview|summary)",
    }
    
    text_lower = text.lower()
    
    for section, pattern in patterns.items():
        match = re.search(pattern, text_lower)
        if match:
            # Extract ~500 chars after the section header
            start = match.end()
            end = min(start + 1500, len(text))
            sections[section] = text[start:end].strip()
    
    return sections


def chunk_text(text: str, max_tokens: int = MAX_CHUNK_TOKENS, min_tokens: int = MIN_CHUNK_TOKENS) -> List[str]:
    """
    Split text into chunks optimized for embedding models
    Uses sentence boundaries to avoid cutting mid-sentence
    """
    if not text:
        return []
    
    try:
        sentences = sent_tokenize(text)
    except Exception:
        # Fallback: split on periods
        sentences = [s.strip() + "." for s in text.split(".") if s.strip()]
    
    chunks = []
    current_chunk = []
    current_tokens = 0
    
    for sentence in sentences:
        sentence_tokens = estimate_tokens(sentence)
        
        # If single sentence exceeds max, split by words
        if sentence_tokens > max_tokens:
            words = sentence.split()
            for i in range(0, len(words), max_tokens):
                word_chunk = " ".join(words[i:i + max_tokens])
                if estimate_tokens(word_chunk) >= min_tokens:
                    chunks.append(word_chunk)
            continue
        
        # Check if adding sentence would exceed limit
        if current_tokens + sentence_tokens > max_tokens:
            if current_tokens >= min_tokens:
                chunks.append(" ".join(current_chunk))
            current_chunk = [sentence]
            current_tokens = sentence_tokens
        else:
            current_chunk.append(sentence)
            current_tokens += sentence_tokens
    
    # Add remaining chunk
    if current_chunk and current_tokens >= min_tokens:
        chunks.append(" ".join(current_chunk))
    
    return chunks


def create_job_chunks(job_id: str, text: str, url: str) -> List[JobChunk]:
    """
    Create Vector-Ready chunks from job text
    """
    sections = extract_job_sections(text)
    chunks = []
    chunk_index = 0
    
    # Process each section
    for section_name, section_text in sections.items():
        if section_name == "full_text":
            continue
        if not section_text:
            continue
            
        section_chunks = chunk_text(section_text)
        for chunk_text_item in section_chunks:
            chunks.append(JobChunk(
                id=f"{job_id}_chunk_{chunk_index}",
                text=chunk_text_item,
                token_count=estimate_tokens(chunk_text_item),
                metadata={
                    "url": url,
                    "section": section_name,
                    "job_id": job_id,
                }
            ))
            chunk_index += 1
    
    # If no sections extracted, chunk the full text
    if not chunks:
        full_chunks = chunk_text(sections["full_text"])
        for chunk_text_item in full_chunks:
            chunks.append(JobChunk(
                id=f"{job_id}_chunk_{chunk_index}",
                text=chunk_text_item,
                token_count=estimate_tokens(chunk_text_item),
                metadata={
                    "url": url,
                    "section": "full",
                    "job_id": job_id,
                }
            ))
            chunk_index += 1
    
    return chunks


def generate_job_id(url: str) -> str:
    """Generate deterministic job ID from URL"""
    return hashlib.md5(url.encode()).hexdigest()[:12]


def is_allowed_domain(url: str) -> bool:
    """Check if URL is from an allowed job board"""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
        return any(
            hostname == domain or hostname.endswith(f".{domain}")
            for domain in ALLOWED_DOMAINS
        )
    except Exception:
        return False


# --- Startup/Shutdown ---

startup_time = time.time()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    # Startup
    print("🚀 Market Scout Agent starting...")
    print(f"   - Max chunk tokens: {MAX_CHUNK_TOKENS}")
    print(f"   - Cache TTL: {CACHE_TTL_SECONDS}s")
    print(f"   - Allowed domains: {len(ALLOWED_DOMAINS)}")
    
    # Ensure NLTK data is available
    try:
        nltk.data.find('tokenizers/punkt')
    except LookupError:
        print("   - Downloading NLTK punkt tokenizer...")
        nltk.download('punkt', quiet=True)
        nltk.download('punkt_tab', quiet=True)
    
    yield
    
    # Shutdown
    print("👋 Market Scout Agent shutting down...")


# --- FastAPI App ---

app = FastAPI(
    title="Market Scout Agent",
    description="Pre-Processing Factory for ARS-MME - Returns Vector-Ready job data",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration (allow frontend origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://*.vercel.app",
        "https://*.netlify.app",
        os.getenv("FRONTEND_URL", "*"),
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=86400,  # Cache preflight for 24h
)


# --- Endpoints ---

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Wake-Up / Keep-Alive Endpoint
    
    Used by frontend's "Ping-Before-Request" pattern to:
    1. Wake up the Render instance (prevents 15-min spin-down)
    2. Check service availability before heavy requests
    """
    global health_cache
    
    now = datetime.utcnow()
    health_cache["request_count"] += 1
    last_request = health_cache.get("last_request")
    health_cache["last_request"] = now
    
    # Get memory usage (best effort)
    memory_mb = None
    try:
        import resource
        usage = resource.getrusage(resource.RUSAGE_SELF)
        memory_mb = usage.ru_maxrss / 1024  # Convert KB to MB
    except Exception:
        pass
    
    return HealthResponse(
        status="healthy",
        timestamp=now.isoformat() + "Z",
        uptime_seconds=time.time() - startup_time,
        last_request_ago_seconds=(now - last_request).total_seconds() if last_request else None,
        request_count=health_cache["request_count"],
        memory_mb=memory_mb,
    )


@app.get("/", response_model=Dict[str, str])
async def root():
    """Root endpoint with API info"""
    return {
        "service": "Market Scout Agent",
        "version": "1.0.0",
        "status": "operational",
        "docs": "/docs",
        "health": "/health",
    }


@app.post("/api/scrape", response_model=VectorReadyResponse)
async def scrape_and_clean(request: ScrapeRequest):
    """
    Scrape-and-Clean Endpoint
    
    Fetches job posting HTML, cleans it, and returns Vector-Ready chunks.
    
    **Vector-Ready Protocol:**
    Returns chunked text optimized for immediate client-side Transformers.js embedding.
    Each chunk is ~500 tokens with metadata for reconstruction.
    """
    start_time = time.time()
    errors: List[str] = []
    
    url = request.url.strip()
    job_id = generate_job_id(url)
    cache_key = f"job:{job_id}"
    
    # Check cache
    if not request.force_refresh and cache_key in job_cache:
        cached_result = job_cache[cache_key]
        cached_result["cached"] = True
        cached_result["processing_time_ms"] = int((time.time() - start_time) * 1000)
        return VectorReadyResponse(**cached_result)
    
    # Validate URL domain
    if not is_allowed_domain(url):
        raise HTTPException(
            status_code=403,
            detail=f"Domain not allowed. Allowed domains: {', '.join(ALLOWED_DOMAINS)}"
        )
    
    # Fetch HTML
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.get(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                },
                follow_redirects=True,
            )
            response.raise_for_status()
            
            # Check content length
            content = response.text
            if len(content) > MAX_CONTENT_LENGTH:
                content = content[:MAX_CONTENT_LENGTH]
                errors.append(f"Content truncated to {MAX_CONTENT_LENGTH} bytes")
                
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Request timed out")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fetch error: {str(e)}")
    
    # Clean HTML and extract text
    try:
        clean_text = clean_html(content)
        if not clean_text or len(clean_text) < 100:
            raise HTTPException(
                status_code=422,
                detail="Could not extract meaningful content from page"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"HTML parsing error: {str(e)}")
    
    # Create Vector-Ready chunks
    try:
        chunks = create_job_chunks(job_id, clean_text, url)
        if not chunks:
            errors.append("No chunks generated - text may be too short")
    except Exception as e:
        errors.append(f"Chunking error: {str(e)}")
        chunks = []
    
    processing_time_ms = int((time.time() - start_time) * 1000)
    
    result = {
        "status": "success" if chunks else "partial",
        "job_chunks": [c.model_dump() for c in chunks],
        "source_url": url,
        "processing_time_ms": processing_time_ms,
        "cached": False,
        "errors": errors,
    }
    
    # Cache result
    if chunks:
        job_cache[cache_key] = result
    
    return VectorReadyResponse(**result)


@app.get("/api/scrape", response_model=VectorReadyResponse)
async def scrape_and_clean_get(
    url: str = Query(..., description="Job posting URL to scrape"),
    force_refresh: bool = Query(False, description="Bypass cache"),
):
    """GET version of scrape endpoint for simpler integration"""
    return await scrape_and_clean(ScrapeRequest(url=url, force_refresh=force_refresh))


# --- Mock/Demo Endpoint ---

MOCK_JOBS = [
    {
        "title": "Senior Software Engineer",
        "company": "TechCorp Inc.",
        "description": "We are looking for a Senior Software Engineer to join our platform team. You will be responsible for designing and building scalable backend services using Python and Go. Our tech stack includes Kubernetes, PostgreSQL, and Redis.",
        "requirements": "5+ years of experience in software development. Strong proficiency in Python or Go. Experience with distributed systems and microservices architecture. Familiarity with cloud platforms (AWS/GCP/Azure). Excellent problem-solving skills and attention to detail.",
        "benefits": "Competitive salary and equity package. Remote-first culture with flexible hours. Health, dental, and vision insurance. 401k matching. Professional development budget.",
    },
    {
        "title": "Full Stack Developer",
        "company": "StartupXYZ",
        "description": "Join our fast-growing startup as a Full Stack Developer. You'll work on our customer-facing web application and internal tools. We value ownership, creativity, and continuous learning.",
        "requirements": "3+ years of experience with React and Node.js. Experience with TypeScript and modern JavaScript. Familiarity with SQL and NoSQL databases. Understanding of CI/CD pipelines and DevOps practices.",
        "benefits": "Equity in a high-growth startup. Unlimited PTO policy. Learning and development stipend. Team offsites and social events.",
    },
    {
        "title": "Machine Learning Engineer",
        "company": "AI Solutions Ltd.",
        "description": "We're seeking a Machine Learning Engineer to develop and deploy ML models for our recommendation engine. You'll work closely with data scientists and backend engineers to bring models to production.",
        "requirements": "MS/PhD in Computer Science or related field. Strong experience with PyTorch or TensorFlow. Production ML experience with model serving and monitoring. Proficiency in Python and familiarity with MLOps tools.",
        "benefits": "Competitive compensation with performance bonuses. State-of-the-art computing resources. Conference attendance budget. Hybrid work model.",
    },
]


@app.get("/api/mock-jobs", response_model=VectorReadyResponse)
async def get_mock_jobs(job_index: int = Query(0, ge=0, lt=len(MOCK_JOBS))):
    """
    Mock Jobs Endpoint (for testing without actual scraping)
    
    Returns pre-defined job postings in Vector-Ready format.
    Useful for frontend development and testing.
    """
    start_time = time.time()
    
    mock_job = MOCK_JOBS[job_index]
    job_id = f"mock_{job_index}"
    
    # Create chunks from mock data
    chunks = []
    chunk_index = 0
    
    for section_name in ["description", "requirements", "benefits"]:
        section_text = mock_job.get(section_name, "")
        if section_text:
            section_chunks = chunk_text(section_text)
            for chunk_text_item in section_chunks:
                chunks.append(JobChunk(
                    id=f"{job_id}_chunk_{chunk_index}",
                    text=chunk_text_item,
                    token_count=estimate_tokens(chunk_text_item),
                    metadata={
                        "url": f"https://example.com/jobs/{job_index}",
                        "section": section_name,
                        "job_id": job_id,
                        "title": mock_job["title"],
                        "company": mock_job["company"],
                    }
                ))
                chunk_index += 1
    
    processing_time_ms = int((time.time() - start_time) * 1000)
    
    return VectorReadyResponse(
        status="success",
        job_chunks=chunks,
        source_url=f"https://example.com/jobs/{job_index}",
        processing_time_ms=processing_time_ms,
        cached=False,
        errors=[],
    )


@app.get("/api/mock-market-scan", response_model=Dict[str, Any])
async def mock_market_scan(
    keywords: str = Query("software engineer", description="Search keywords"),
    limit: int = Query(3, ge=1, le=10, description="Number of results"),
):
    """
    Mock Market Scan Endpoint
    
    Simulates a market scan returning multiple job listings.
    Returns metadata + Vector-Ready chunks for each job.
    """
    start_time = time.time()
    
    results = []
    for i, job in enumerate(MOCK_JOBS[:limit]):
        job_id = f"mock_{i}"
        chunks = []
        chunk_index = 0
        
        for section_name in ["description", "requirements"]:
            section_text = job.get(section_name, "")
            if section_text:
                section_chunks = chunk_text(section_text)
                for chunk_text_item in section_chunks:
                    chunks.append({
                        "id": f"{job_id}_chunk_{chunk_index}",
                        "text": chunk_text_item,
                        "token_count": estimate_tokens(chunk_text_item),
                        "metadata": {
                            "url": f"https://example.com/jobs/{i}",
                            "section": section_name,
                            "job_id": job_id,
                        }
                    })
                    chunk_index += 1
        
        results.append({
            "job_id": job_id,
            "title": job["title"],
            "company": job["company"],
            "url": f"https://example.com/jobs/{i}",
            "chunks": chunks,
        })
    
    processing_time_ms = int((time.time() - start_time) * 1000)
    
    return {
        "status": "success",
        "query": keywords,
        "results": results,
        "total_results": len(results),
        "processing_time_ms": processing_time_ms,
    }


# --- Development Server ---

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=True,
        workers=1,
    )
