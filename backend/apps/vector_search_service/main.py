"""Vector Search Service — Semantic search, embedding generation, and index management."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field


# ── Request Models ──────────────────────────────────────────────────────────────

class CandidateSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Natural language search query")
    top_k: int = Field(default=10, ge=1, le=100, description="Max results to return")
    filters: dict = Field(default_factory=dict, description="Metadata filters (seniority, skills, etc.)")
    min_score: float = Field(default=0.0, ge=0.0, le=1.0, description="Minimum similarity score")

    model_config = {"json_schema_extra": {"examples": [
        {"query": "senior python engineer with kubernetes experience", "top_k": 5}
    ]}}


class JobSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Natural language search query")
    top_k: int = Field(default=10, ge=1, le=100, description="Max results to return")
    filters: dict = Field(default_factory=dict, description="Metadata filters (department, location, etc.)")
    min_score: float = Field(default=0.0, ge=0.0, le=1.0, description="Minimum similarity score")


class EmbeddingRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to generate embedding for")
    model: str = Field(default="text-embedding-3-large", description="Embedding model name")


class BatchEmbeddingRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=100, description="List of texts to embed")
    model: str = Field(default="text-embedding-3-large", description="Embedding model name")


class IndexCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Index name")
    dimension: int = Field(default=3072, ge=1, le=4096, description="Vector dimension")
    metric: str = Field(default="cosine", description="cosine | euclidean | dot_product")
    description: str = Field(default="", description="Index description")


class SimilaritySearchRequest(BaseModel):
    vector: list[float] = Field(..., description="Query vector")
    top_k: int = Field(default=10, ge=1, le=100, description="Max results")
    index_name: str = Field(default="candidates", description="Index to search against")
    filters: dict = Field(default_factory=dict, description="Metadata filters")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "vector-search"


class CandidateSearchResult(BaseModel):
    candidate_id: str
    name: str
    score: float = Field(..., description="Semantic similarity score (0-1)")
    skills_match: list[str]
    seniority: str | None = None


class CandidateSearchResponse(BaseModel):
    query: str
    results: list[CandidateSearchResult]
    total: int
    query_time_ms: float


class JobSearchResult(BaseModel):
    job_id: str
    title: str
    score: float
    department: str | None = None


class JobSearchResponse(BaseModel):
    query: str
    results: list[JobSearchResult]
    total: int
    query_time_ms: float


class EmbeddingGenerateResponse(BaseModel):
    embedding_id: str
    dimension: int
    model: str


class EmbeddingGetResponse(BaseModel):
    id: str
    text: str
    dimension: int
    model: str


class BatchEmbeddingResponse(BaseModel):
    batch_id: str
    count: int
    model: str
    status: str = "processing"


class EmbeddingDeleteResponse(BaseModel):
    id: str
    deleted: bool = True


class IndexInfo(BaseModel):
    name: str
    dimension: int
    metric: str
    vector_count: int
    description: str
    created_at: str


class IndexListResponse(BaseModel):
    data: list[IndexInfo]
    total: int


class IndexCreateResponse(BaseModel):
    name: str
    dimension: int
    metric: str
    created: bool = True


class IndexDeleteResponse(BaseModel):
    name: str
    deleted: bool = True


class IndexStatsResponse(BaseModel):
    name: str
    vector_count: int
    dimension: int
    metric: str
    index_size_bytes: int
    last_updated: str


class SimilaritySearchResult(BaseModel):
    id: str
    score: float
    metadata: dict = Field(default_factory=dict)


class SimilaritySearchResponse(BaseModel):
    results: list[SimilaritySearchResult]
    total: int
    index_name: str


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Search"], summary="Search service health check")
async def health():
    return HealthResponse()


# ── Semantic Search ────────────────────────────────────────────────────────────

@router.post("/candidates", response_model=CandidateSearchResponse, tags=["Search"], summary="Semantic candidate search",
             description="Find candidates using natural language queries against vector embeddings.")
async def search_candidates(data: CandidateSearchRequest):
    return CandidateSearchResponse(
        query=data.query,
        results=[
            CandidateSearchResult(candidate_id="c2", name="Sarah Chen", score=0.92,
                                  skills_match=["Python", "PostgreSQL"], seniority="staff"),
            CandidateSearchResult(candidate_id="c1", name="John Smith", score=0.87,
                                  skills_match=["Python", "Kubernetes"], seniority="senior"),
            CandidateSearchResult(candidate_id="c4", name="Emily Davis", score=0.83,
                                  skills_match=["Python", "Django"], seniority="senior"),
        ],
        total=3, query_time_ms=12.5,
    )


@router.post("/jobs", response_model=JobSearchResponse, tags=["Search"], summary="Semantic job search",
             description="Find jobs using natural language queries against vector embeddings.")
async def search_jobs(data: JobSearchRequest):
    return JobSearchResponse(
        query=data.query,
        results=[
            JobSearchResult(job_id="j1", title="Senior Backend Engineer", score=0.95, department="Engineering"),
            JobSearchResult(job_id="j3", title="ML Engineer", score=0.72, department="AI Platform"),
        ],
        total=2, query_time_ms=8.3,
    )


@router.post("/similarity", response_model=SimilaritySearchResponse, tags=["Search"],
             summary="Raw vector similarity search",
             description="Search against a vector index using a raw query vector.")
async def similarity_search(data: SimilaritySearchRequest):
    return SimilaritySearchResponse(
        results=[
            SimilaritySearchResult(id="v1", score=0.95, metadata={"type": "candidate", "name": "Sarah Chen"}),
            SimilaritySearchResult(id="v2", score=0.88, metadata={"type": "candidate", "name": "John Smith"}),
        ],
        total=2, index_name=data.index_name,
    )


# ── Embedding Generation ──────────────────────────────────────────────────────

@router.post("/embeddings", response_model=EmbeddingGenerateResponse, tags=["Search"], summary="Generate embedding",
             description="Generate a vector embedding for the provided text.")
async def generate_embedding(data: EmbeddingRequest):
    return EmbeddingGenerateResponse(embedding_id="emb_new", dimension=3072, model=data.model)


@router.post("/embeddings/batch", response_model=BatchEmbeddingResponse, tags=["Search"],
             summary="Generate batch embeddings",
             description="Generate vector embeddings for multiple texts in a single request.")
async def generate_batch_embeddings(data: BatchEmbeddingRequest):
    return BatchEmbeddingResponse(batch_id="batch_new", count=len(data.texts), model=data.model)


@router.get("/embeddings/{embedding_id}", response_model=EmbeddingGetResponse, tags=["Search"],
            summary="Get embedding by ID")
async def get_embedding(embedding_id: str):
    return EmbeddingGetResponse(
        id=embedding_id, text="Sample embedded text",
        dimension=3072, model="text-embedding-3-large",
    )


@router.delete("/embeddings/{embedding_id}", response_model=EmbeddingDeleteResponse, tags=["Search"],
               summary="Delete embedding")
async def delete_embedding(embedding_id: str):
    return EmbeddingDeleteResponse(id=embedding_id)


# ── Index Management ───────────────────────────────────────────────────────────

@router.get("/indexes", response_model=IndexListResponse, tags=["Search"], summary="List vector indexes")
async def list_indexes():
    return IndexListResponse(data=[
        IndexInfo(name="candidates", dimension=3072, metric="cosine",
                  vector_count=15240, description="Candidate profile embeddings", created_at="2024-01-01"),
        IndexInfo(name="jobs", dimension=3072, metric="cosine",
                  vector_count=856, description="Job description embeddings", created_at="2024-01-01"),
        IndexInfo(name="resumes", dimension=3072, metric="cosine",
                  vector_count=12800, description="Resume content embeddings", created_at="2024-06-15"),
    ], total=3)


@router.post("/indexes", response_model=IndexCreateResponse, tags=["Search"], summary="Create vector index")
async def create_index(data: IndexCreateRequest):
    return IndexCreateResponse(name=data.name, dimension=data.dimension, metric=data.metric)


@router.get("/indexes/{index_name}", response_model=IndexStatsResponse, tags=["Search"],
            summary="Get index stats")
async def get_index_stats(index_name: str):
    return IndexStatsResponse(
        name=index_name, vector_count=15240, dimension=3072, metric="cosine",
        index_size_bytes=187340800, last_updated="2025-01-20T10:00:00Z",
    )


@router.delete("/indexes/{index_name}", response_model=IndexDeleteResponse, tags=["Search"],
               summary="Delete vector index")
async def delete_index(index_name: str):
    return IndexDeleteResponse(name=index_name)
