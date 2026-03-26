"""
Market Scout Agent - Type Definitions
=====================================
Shared types for the Vector-Ready Protocol
"""

from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field


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
    without further processing. Each chunk is optimized for embedding models.
    """
    status: Literal["success", "partial", "error"] = Field(
        ..., description="Response status"
    )
    job_chunks: List[JobChunk] = Field(
        default_factory=list, description="Cleaned text chunks ready for embedding"
    )
    source_url: Optional[str] = Field(None, description="Original URL scraped")
    processing_time_ms: int = Field(..., description="Server processing time")
    cached: bool = Field(False, description="Whether result was served from cache")
    errors: List[str] = Field(
        default_factory=list, description="Non-fatal errors encountered"
    )


class HealthResponse(BaseModel):
    """Health check response for keep-alive protocol"""
    status: Literal["healthy", "degraded", "unhealthy"]
    timestamp: str
    uptime_seconds: float
    last_request_ago_seconds: Optional[float]
    request_count: int
    memory_mb: Optional[float]


class ScrapeRequest(BaseModel):
    """Request body for scrape endpoint"""
    url: str = Field(..., description="Job posting URL to scrape")
    force_refresh: bool = Field(False, description="Bypass cache")


class MarketScanResult(BaseModel):
    """Single job result from market scan"""
    job_id: str
    title: str
    company: str
    url: str
    chunks: List[JobChunk]


class MarketScanResponse(BaseModel):
    """Response from market scan endpoint"""
    status: Literal["success", "partial", "error"]
    query: str
    results: List[MarketScanResult]
    total_results: int
    processing_time_ms: int
    errors: List[str] = Field(default_factory=list)
