"""Vector Search Service — Semantic search and embeddings."""
from __future__ import annotations

import uuid
import math
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field


# ── In-Memory Store ─────────────────────────────────────────────────────────────

_embeddings: dict[str, dict[str, Any]] = {}
_candidate_index: list[dict[str, Any]] = [
    {"candidate_id": "c1", "name": "John Smith", "skills": ["Python", "PostgreSQL", "Kubernetes"], "vector": [0.1, 0.8, 0.3]},
    {"candidate_id": "c2", "name": "Sarah Chen", "skills": ["Python", "Distributed Systems", "Go"], "vector": [0.2, 0.9, 0.1]},
    {"candidate_id": "c3", "name": "Alex Rivera", "skills": ["Java", "Spring Boot", "AWS"], "vector": [0.5, 0.3, 0.7]},
]

_job_index: list[dict[str, Any]] = [
    {"job_id": "j1", "title": "Senior Backend Engineer", "required_skills": ["Python", "PostgreSQL"], "vector": [0.15, 0.85, 0.25]},
    {"job_id": "j2", "title": "Platform Engineer", "required_skills": ["Kubernetes", "Go", "AWS"], "vector": [0.3, 0.7, 0.5]},
]


# ── Request Models ──────────────────────────────────────────────────────────────

class CandidateSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search query")
    top_k: int = Field(default=10, ge=1, le=100, description="Number of results")
    filters: dict[str, Any] | None = Field(None, description="Filter criteria")


class JobSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search query")
    top_k: int = Field(default=10, ge=1, le=100, description="Number of results")


class EmbeddingRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to embed")
    model: str = Field(default="text-embedding-3-large", description="Embedding model")


class SimilarityRequest(BaseModel):
    vector: list[float] = Field(..., min_length=1, description="Query vector")
    top_k: int = Field(default=5, ge=1, le=100, description="Number of results")
    index_type: str = Field(default="candidates", description="candidates | jobs")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "vector-search"


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


@router.get("/health", response_model=HealthResponse, tags=["Search"])
async def health():
    return HealthResponse()


@router.post("/candidates", tags=["Search"], summary="Search candidates")
async def search_candidates(data: CandidateSearchRequest):
    query_lower = data.query.lower()
    results = []
    for c in _candidate_index:
        score = sum(1.0 for s in c["skills"] if query_lower in s.lower()) / max(len(c["skills"]), 1)
        if score > 0 or query_lower in c["name"].lower():
            results.append({
                "candidate_id": c["candidate_id"],
                "name": c["name"],
                "score": round(score, 2),
                "skills_match": [s for s in c["skills"] if query_lower in s.lower()],
            })
    results.sort(key=lambda x: x["score"], reverse=True)
    return {"query": data.query, "results": results[:data.top_k], "total": len(results)}


@router.post("/jobs", tags=["Search"], summary="Search jobs")
async def search_jobs(data: JobSearchRequest):
    query_lower = data.query.lower()
    results = []
    for j in _job_index:
        score = sum(1.0 for s in j["required_skills"] if query_lower in s.lower()) / max(len(j["required_skills"]), 1)
        if score > 0 or query_lower in j["title"].lower():
            results.append({
                "job_id": j["job_id"],
                "title": j["title"],
                "score": round(score, 2),
            })
    results.sort(key=lambda x: x["score"], reverse=True)
    return {"query": data.query, "results": results[:data.top_k], "total": len(results)}


@router.post("/embeddings", tags=["Search"], summary="Create embedding")
async def generate_embedding(data: EmbeddingRequest):
    emb_id = f"emb_{uuid.uuid4().hex[:12]}"
    dim = 3072 if "large" in data.model else 1536
    vector = [0.1] * dim
    _embeddings[emb_id] = {"id": emb_id, "text": data.text[:100], "dimension": dim, "model": data.model, "vector": vector}
    return {"embedding_id": emb_id, "dimension": dim, "model": data.model}


@router.get("/embeddings/{embedding_id}", tags=["Search"], summary="Get embedding")
async def get_embedding(embedding_id: str):
    if embedding_id not in _embeddings:
        return {"error": "not found"}, 404
    emb = _embeddings[embedding_id]
    return {"id": emb["id"], "dimension": emb["dimension"], "model": emb["model"]}


@router.post("/similarity", tags=["Search"], summary="Find similar items")
async def similarity_search(data: SimilarityRequest):
    index = _candidate_index if data.index_type == "candidates" else _job_index
    results = []
    for item in index:
        sim = _cosine_similarity(data.vector, item["vector"])
        results.append({"id": item.get("candidate_id") or item.get("job_id"), "score": round(sim, 4)})
    results.sort(key=lambda x: x["score"], reverse=True)
    return {"results": results[:data.top_k], "total": len(results)}
