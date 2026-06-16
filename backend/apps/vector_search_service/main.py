"""Vector Search Service — Semantic search and embeddings."""
from __future__ import annotations

import uuid
import math
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from shared.vector_store.store import get_vector_store
from shared.matching.engine import _get_embedding


embeddings: dict[str, dict[str, Any]] = {}


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


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "vector-search"


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
    query_vector = _get_embedding(data.query)
    store = get_vector_store()
    filters = data.filters or {}
    filters["doc_type"] = "candidate"
    results = store.search(query_vector, top_k=data.top_k, filters=filters)
    return {"query": data.query, "results": results, "total": len(results)}


@router.post("/jobs", tags=["Search"], summary="Search jobs")
async def search_jobs(data: JobSearchRequest):
    query_vector = _get_embedding(data.query)
    store = get_vector_store()
    results = store.search(query_vector, top_k=data.top_k, filters={"doc_type": "job"})
    return {"query": data.query, "results": results, "total": len(results)}


@router.post("/embeddings", tags=["Search"], summary="Create embedding")
async def generate_embedding(data: EmbeddingRequest):
    emb_id = f"emb_{uuid.uuid4().hex[:12]}"
    vector = _get_embedding(data.text)
    dim = len(vector)
    embeddings[emb_id] = {"id": emb_id, "text": data.text[:100], "dimension": dim, "model": data.model, "vector": vector}
    return {"embedding_id": emb_id, "dimension": dim, "model": data.model}


@router.get("/embeddings/{embedding_id}", tags=["Search"], summary="Get embedding")
async def get_embedding_by_id(embedding_id: str):
    if embedding_id not in embeddings:
        return {"error": "not found"}, 404
    emb = embeddings[embedding_id]
    return {"id": emb["id"], "dimension": emb["dimension"], "model": emb["model"]}


@router.post("/similarity", tags=["Search"], summary="Find similar items")
async def similarity_search(data: SimilarityRequest):
    store = get_vector_store()
    filters = {"doc_type": data.index_type.rstrip("s")} if data.index_type else None
    results = store.search(data.vector, top_k=data.top_k, filters=filters)
    return {"results": results, "total": len(results)}


@router.post("/index", tags=["Search"], summary="Index a document")
async def index_document(data: dict):
    doc_id = data["id"]
    text = data["text"]
    metadata = data.get("metadata", {})

    vector = _get_embedding(text)

    store = get_vector_store()
    store.add(doc_id, vector, metadata)

    return {"id": doc_id, "indexed": True}


@router.get("/stats", tags=["Search"], summary="Vector store statistics")
async def get_stats():
    store = get_vector_store()
    return {
        "total_documents": store.count(),
        "dimensions": store.dimensions
    }
