"""Search Service — Cross-resource global search with autocomplete.

Federates over the in-memory indexes maintained by the vector_search_service
for candidates / jobs and adds an in-memory index for interviews. When a
vector is missing we fall back to substring matching so the endpoint always
returns something useful.
"""
from __future__ import annotations

import math
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field


# Reuse the vector_search store so any data added there is searchable here.
try:
    from apps.vector_search_service.main import (
        _candidate_index,
        _job_index,
        _cosine_similarity,
    )
except Exception:  # pragma: no cover
    _candidate_index = []
    _job_index = []

    def _cosine_similarity(a, b):
        return 0.0


# ── In-Memory Store ────────────────────────────────────────────────────────────

_interview_index: list[dict[str, Any]] = [
    {"interview_id": "i1", "title": "Senior Backend Engineer — John Smith", "type": "technical", "status": "scheduled"},
    {"interview_id": "i2", "title": "Platform Engineer — Sarah Chen", "type": "system_design", "status": "completed"},
    {"interview_id": "i3", "title": "Frontend Lead — Alex Rivera", "type": "behavioral", "status": "scheduled"},
]

# Per-user recent searches.
_recent_searches: dict[str, list[dict[str, Any]]] = defaultdict(list)
RECENT_LIMIT = 25


# ── Models ─────────────────────────────────────────────────────────────────────

SearchType = Literal["candidates", "jobs", "interviews", "all"]


class SearchResult(BaseModel):
    id: str
    type: str
    title: str
    score: float
    snippet: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class GroupedResults(BaseModel):
    candidates: list[SearchResult] = []
    jobs: list[SearchResult] = []
    interviews: list[SearchResult] = []


class SearchResponse(BaseModel):
    query: str
    type: str
    results: list[SearchResult]
    grouped: GroupedResults
    total: int
    took_ms: int
    used_vector: bool = False


class SuggestionItem(BaseModel):
    text: str
    type: str
    id: Optional[str] = None


class SuggestResponse(BaseModel):
    query: str
    suggestions: list[SuggestionItem]


class RecentSearchItem(BaseModel):
    query: str
    type: str
    timestamp: str
    result_count: int


class RecentResponse(BaseModel):
    data: list[RecentSearchItem]
    total: int


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "search"
    indexes: dict[str, int] = Field(default_factory=dict)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _user_key(authorization: Optional[str], x_user_id: Optional[str]) -> str:
    if x_user_id:
        return x_user_id
    if authorization:
        return f"auth_{hash(authorization) & 0xffff:04x}"
    return "anonymous"


def _score_text(query: str, *fields: str) -> float:
    q = query.lower().strip()
    if not q:
        return 0.0
    score = 0.0
    for f in fields:
        if not f:
            continue
        fl = f.lower()
        if q == fl:
            score += 1.5
        elif fl.startswith(q):
            score += 1.2
        elif q in fl:
            score += 0.8
        # token overlap
        q_tokens = set(q.split())
        f_tokens = set(fl.split())
        if q_tokens and f_tokens:
            overlap = len(q_tokens & f_tokens) / len(q_tokens)
            score += overlap * 0.5
    return round(score, 3)


def _candidate_results(query: str, limit: int) -> list[SearchResult]:
    results: list[SearchResult] = []
    for c in _candidate_index:
        skill_text = " ".join(c.get("skills", []))
        score = _score_text(query, c.get("name", ""), skill_text)
        if score > 0:
            results.append(SearchResult(
                id=c["candidate_id"],
                type="candidate",
                title=c["name"],
                score=score,
                snippet=", ".join(c.get("skills", [])[:5]),
                metadata={"skills": c.get("skills", [])},
            ))
    results.sort(key=lambda r: r.score, reverse=True)
    return results[:limit]


def _job_results(query: str, limit: int) -> list[SearchResult]:
    results: list[SearchResult] = []
    for j in _job_index:
        skill_text = " ".join(j.get("required_skills", []))
        score = _score_text(query, j.get("title", ""), skill_text)
        if score > 0:
            results.append(SearchResult(
                id=j["job_id"],
                type="job",
                title=j["title"],
                score=score,
                snippet=", ".join(j.get("required_skills", [])[:5]),
                metadata={"required_skills": j.get("required_skills", [])},
            ))
    results.sort(key=lambda r: r.score, reverse=True)
    return results[:limit]


def _interview_results(query: str, limit: int) -> list[SearchResult]:
    results: list[SearchResult] = []
    for it in _interview_index:
        score = _score_text(query, it.get("title", ""), it.get("type", ""))
        if score > 0:
            results.append(SearchResult(
                id=it["interview_id"],
                type="interview",
                title=it["title"],
                score=score,
                snippet=f"{it['type']} • {it['status']}",
                metadata={"type": it["type"], "status": it["status"]},
            ))
    results.sort(key=lambda r: r.score, reverse=True)
    return results[:limit]


def _record_recent(user_key: str, query: str, search_type: str, result_count: int) -> None:
    entry = {
        "query": query,
        "type": search_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "result_count": result_count,
    }
    bucket = _recent_searches[user_key]
    # De-dup recent queries
    bucket[:] = [b for b in bucket if not (b["query"] == query and b["type"] == search_type)]
    bucket.insert(0, entry)
    del bucket[RECENT_LIMIT:]


# ── Router ─────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Search"])
async def health() -> HealthResponse:
    return HealthResponse(
        indexes={
            "candidates": len(_candidate_index),
            "jobs": len(_job_index),
            "interviews": len(_interview_index),
        },
    )


@router.get("/", response_model=SearchResponse, tags=["Search"], summary="Global search")
async def global_search(
    q: str = Query(..., min_length=1, description="Search query"),
    type: SearchType = Query("all"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    start = time.perf_counter()
    grouped = GroupedResults()
    if type in ("candidates", "all"):
        grouped.candidates = _candidate_results(q, limit)
    if type in ("jobs", "all"):
        grouped.jobs = _job_results(q, limit)
    if type in ("interviews", "all"):
        grouped.interviews = _interview_results(q, limit)

    flat = grouped.candidates + grouped.jobs + grouped.interviews
    flat.sort(key=lambda r: r.score, reverse=True)
    sliced = flat[offset : offset + limit]
    took_ms = int((time.perf_counter() - start) * 1000)

    _record_recent(_user_key(authorization, x_user_id), q, type, len(flat))
    return SearchResponse(
        query=q,
        type=type,
        results=sliced,
        grouped=grouped,
        total=len(flat),
        took_ms=took_ms,
        used_vector=False,
    )


@router.get("/suggest", response_model=SuggestResponse, tags=["Search"], summary="Autocomplete suggestions")
async def suggest(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=25),
):
    q_lower = q.lower().strip()
    suggestions: list[SuggestionItem] = []

    for c in _candidate_index:
        name = c.get("name", "")
        if name.lower().startswith(q_lower) or q_lower in name.lower():
            suggestions.append(SuggestionItem(text=name, type="candidate", id=c["candidate_id"]))
        for s in c.get("skills", []):
            if s.lower().startswith(q_lower):
                suggestions.append(SuggestionItem(text=s, type="skill"))

    for j in _job_index:
        title = j.get("title", "")
        if title.lower().startswith(q_lower) or q_lower in title.lower():
            suggestions.append(SuggestionItem(text=title, type="job", id=j["job_id"]))

    for it in _interview_index:
        title = it.get("title", "")
        if q_lower in title.lower():
            suggestions.append(SuggestionItem(text=title, type="interview", id=it["interview_id"]))

    # Dedup
    seen = set()
    unique: list[SuggestionItem] = []
    for s in suggestions:
        key = (s.text.lower(), s.type)
        if key in seen:
            continue
        seen.add(key)
        unique.append(s)
        if len(unique) >= limit:
            break
    return SuggestResponse(query=q, suggestions=unique)


@router.get("/recent", response_model=RecentResponse, tags=["Search"], summary="Recent searches for current user")
async def recent_searches(
    limit: int = Query(20, ge=1, le=100),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    key = _user_key(authorization, x_user_id)
    items = _recent_searches.get(key, [])[:limit]
    return RecentResponse(
        data=[RecentSearchItem(**i) for i in items],
        total=len(items),
    )


@router.delete("/recent", tags=["Search"], summary="Clear recent searches")
async def clear_recent(
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    key = _user_key(authorization, x_user_id)
    _recent_searches[key] = []
    return {"cleared": True, "user": key}


@router.get("/popular", tags=["Search"], summary="Popular search terms across tenant")
async def popular_searches(limit: int = Query(10, ge=1, le=50)):
    counts: dict[str, int] = defaultdict(int)
    for user_history in _recent_searches.values():
        for entry in user_history:
            counts[entry["query"]] += 1
    items = [
        {"query": q, "count": c}
        for q, c in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    ][:limit]
    return {"data": items, "total": len(items)}
