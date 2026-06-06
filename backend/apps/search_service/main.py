"""Search Service — Cross-resource global search with autocomplete.

Federates over the in-memory indexes maintained by the ``vector_search_service``
for candidates / jobs and adds an in-memory index for interviews. Provides:

* Multi-field text search (name, email, skills, location, title, …)
* Fuzzy matching (typo tolerance) via :class:`difflib.SequenceMatcher`
* Per-tenant and per-user ``recent searches`` history
* Search analytics — popular queries and zero-result queries
* Autocomplete suggestions with prefix and fuzzy fallback

All persistence is in-memory (per-process) but indexed through the SQLModel
``SearchHistory`` definition so it can be promoted to a real table by
swapping the storage helper.
"""
from __future__ import annotations

import difflib
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Iterable, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from shared.auth import require_tenant_id
from shared.core.models.search import (
    NoResultsQueryItem,
    NoResultsResponse,
    PopularQueriesResponse,
    PopularQueryItem,
    RecentSearchesResponse,
    SearchAnalyticsResponse,
    SearchHistory,
    SearchHistoryRead,
)


# Reuse the vector_search store so any data added there is searchable here.
try:
    from apps.vector_search_service.main import (
        _candidate_index,
        _job_index,
        _cosine_similarity,
    )
except Exception:  # pragma: no cover
    _candidate_index: list[dict[str, Any]] = []
    _job_index: list[dict[str, Any]] = []

    def _cosine_similarity(a, b):
        return 0.0


# ── In-Memory Store ────────────────────────────────────────────────────────────

# Interview records don't live in the vector service, so we keep our own index.
_interview_index: list[dict[str, Any]] = [
    {"interview_id": "i1", "title": "Senior Backend Engineer — John Smith", "type": "technical", "status": "scheduled", "tenant_id": "*"},
    {"interview_id": "i2", "title": "Platform Engineer — Sarah Chen", "type": "system_design", "status": "completed", "tenant_id": "*"},
    {"interview_id": "i3", "title": "Frontend Lead — Alex Rivera", "type": "behavioral", "status": "scheduled", "tenant_id": "*"},
]

# Per-tenant + per-user recent search history (in-memory mirror of
# ``SearchHistory`` rows).  Keyed by ``(tenant_id, user_id)``.
_recent_searches: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)

# Tenant-wide counters for analytics.
_popular_queries: dict[str, Counter[str]] = defaultdict(Counter)
_no_result_queries: dict[str, Counter[str]] = defaultdict(Counter)
_total_query_count: dict[str, int] = defaultdict(int)
_total_result_count: dict[str, int] = defaultdict(int)
_zero_result_count: dict[str, int] = defaultdict(int)

RECENT_LIMIT = 25
NO_RESULTS_LIMIT = 50
POPULAR_LIMIT = 50

# Threshold below which a fuzzy similarity is treated as a non-match.
FUZZY_THRESHOLD = 0.6
# Suffix bonus so prefix matches still beat fuzzy matches on the same word.
PREFIX_BONUS = 0.25


# ── Models ─────────────────────────────────────────────────────────────────────

SearchType = Literal["candidates", "jobs", "interviews", "all"]


class SearchResult(BaseModel):
    id: str
    type: str
    title: str
    score: float
    snippet: Optional[str] = None
    matched_field: Optional[str] = None
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
    fuzzy: bool = False


class SuggestionItem(BaseModel):
    text: str
    type: str
    id: Optional[str] = None
    score: float = 1.0


class SuggestResponse(BaseModel):
    query: str
    suggestions: list[SuggestionItem]
    fuzzy: bool = False


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "search"
    indexes: dict[str, int] = Field(default_factory=dict)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _fuzzy_ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _best_fuzzy_token(query_token: str, candidates: Iterable[str]) -> tuple[Optional[str], float]:
    """Return ``(best_candidate, score)`` for ``query_token`` across ``candidates``."""
    best: tuple[Optional[str], float] = (None, 0.0)
    for cand in candidates:
        if not cand:
            continue
        ratio = _fuzzy_ratio(query_token, cand)
        if ratio > best[1]:
            best = (cand, ratio)
    return best


def _score_field(query_lc: str, value: Optional[str]) -> float:
    """Score a single field for relevance.

    Combines exact / prefix / substring / token-overlap and fuzzy similarity.
    The component scores are tuned so a perfect prefix match still wins over a
    one-character-off fuzzy match.
    """
    if not value:
        return 0.0
    val_lc = value.lower()
    score = 0.0
    if query_lc == val_lc:
        score += 2.0
    if val_lc.startswith(query_lc):
        score += 1.5
    if query_lc in val_lc:
        score += 0.8

    q_tokens = [t for t in query_lc.split() if t]
    v_tokens = [t for t in val_lc.split() if t]
    if q_tokens and v_tokens:
        overlap = len(set(q_tokens) & set(v_tokens)) / max(len(set(q_tokens)), 1)
        score += overlap * 0.6

    # Fuzzy match against any token in the value.  We only consider the best
    # token-level similarity and add it to the score.
    for qt in q_tokens:
        _, ratio = _best_fuzzy_token(qt, v_tokens)
        if ratio >= FUZZY_THRESHOLD:
            # Prefix-aligned fuzzy matches get a small bonus.
            token_bonus = PREFIX_BONUS if any(vt.startswith(qt) for vt in v_tokens) else 0.0
            score += ratio + token_bonus
    return round(score, 3)


def _score_text(query: str, *fields: Optional[str]) -> float:
    """Aggregate field scores for legacy callers."""
    if not query:
        return 0.0
    return sum(_score_field(query.lower().strip(), f) for f in fields)


def _search_record(
    record: dict[str, Any],
    query_lc: str,
    field_specs: list[tuple[str, str]],
) -> Optional[tuple[float, str]]:
    """Score a record against multiple ``(field_name, value)`` pairs.

    Returns ``(best_score, matched_field_name)`` or ``None`` if nothing matched.
    """
    best_score = 0.0
    best_field: Optional[str] = None
    for fname, fvalue in field_specs:
        s = _score_field(query_lc, fvalue)
        if s > best_score:
            best_score = s
            best_field = fname
    if best_score <= 0:
        return None
    return best_score, best_field or field_specs[0][0]


def _candidate_field_specs(c: dict[str, Any]) -> list[tuple[str, str]]:
    """Return the list of fields to search for a candidate record."""
    skills = c.get("skills", []) or []
    return [
        ("name", c.get("name", "")),
        ("email", c.get("email", "")),
        ("location", c.get("location", "")),
        ("skills", " ".join(skills)),
    ]


def _job_field_specs(j: dict[str, Any]) -> list[tuple[str, str]]:
    return [
        ("title", j.get("title", "")),
        ("description", j.get("description", "")),
        ("location", j.get("location", "")),
        ("department", j.get("department", "")),
        ("required_skills", " ".join(j.get("required_skills", []) or [])),
        ("preferred_skills", " ".join(j.get("preferred_skills", []) or [])),
    ]


def _interview_field_specs(it: dict[str, Any]) -> list[tuple[str, str]]:
    return [
        ("title", it.get("title", "")),
        ("type", it.get("type", "")),
        ("status", it.get("status", "")),
    ]


def _candidate_results(
    query: str, limit: int, tenant_id: Optional[str] = None
) -> list[SearchResult]:
    results: list[SearchResult] = []
    query_lc = query.lower().strip()
    for c in _candidate_index:
        # Optional tenant filter (the in-memory indexes don't always carry
        # a tenant id — when missing we still include the record so the
        # service stays useful in single-tenant deployments).
        if tenant_id and c.get("tenant_id") and c.get("tenant_id") != tenant_id:
            continue
        scored = _search_record(c, query_lc, _candidate_field_specs(c))
        if not scored:
            continue
        score, matched = scored
        results.append(SearchResult(
            id=c["candidate_id"],
            type="candidate",
            title=c.get("name", ""),
            score=score,
            snippet=", ".join((c.get("skills") or [])[:5]),
            matched_field=matched,
            metadata={
                "skills": c.get("skills", []),
                "email": c.get("email", ""),
                "location": c.get("location", ""),
            },
        ))
    results.sort(key=lambda r: r.score, reverse=True)
    return results[:limit]


def _job_results(
    query: str, limit: int, tenant_id: Optional[str] = None
) -> list[SearchResult]:
    results: list[SearchResult] = []
    query_lc = query.lower().strip()
    for j in _job_index:
        if tenant_id and j.get("tenant_id") and j.get("tenant_id") != tenant_id:
            continue
        scored = _search_record(j, query_lc, _job_field_specs(j))
        if not scored:
            continue
        score, matched = scored
        results.append(SearchResult(
            id=j["job_id"],
            type="job",
            title=j.get("title", ""),
            score=score,
            snippet=", ".join((j.get("required_skills") or [])[:5]),
            matched_field=matched,
            metadata={
                "required_skills": j.get("required_skills", []),
                "location": j.get("location", ""),
            },
        ))
    results.sort(key=lambda r: r.score, reverse=True)
    return results[:limit]


def _interview_results(
    query: str, limit: int, tenant_id: Optional[str] = None
) -> list[SearchResult]:
    results: list[SearchResult] = []
    query_lc = query.lower().strip()
    for it in _interview_index:
        if tenant_id and it.get("tenant_id") and it.get("tenant_id") not in (tenant_id, "*"):
            continue
        scored = _search_record(it, query_lc, _interview_field_specs(it))
        if not scored:
            continue
        score, matched = scored
        results.append(SearchResult(
            id=it["interview_id"],
            type="interview",
            title=it.get("title", ""),
            score=score,
            snippet=f"{it.get('type', '')} • {it.get('status', '')}",
            matched_field=matched,
            metadata={"type": it.get("type", ""), "status": it.get("status", "")},
        ))
    results.sort(key=lambda r: r.score, reverse=True)
    return results[:limit]


def _record_recent(
    tenant_id: str, user_id: str, query: str, search_type: str, result_count: int
) -> None:
    entry = {
        "id": f"sh_{int(time.time() * 1000)}_{hash(query) & 0xffff:04x}",
        "tenant_id": tenant_id,
        "user_id": user_id,
        "query": query,
        "search_type": search_type,
        "results_count": result_count,
        "created_at": _now().isoformat(),
    }
    bucket = _recent_searches[(tenant_id, user_id)]
    # De-dup identical recent queries.
    bucket[:] = [
        b for b in bucket
        if not (b["query"] == query and b["search_type"] == search_type)
    ]
    bucket.insert(0, entry)
    del bucket[RECENT_LIMIT:]


def _record_analytics(tenant_id: str, query: str, result_count: int) -> None:
    _popular_queries[tenant_id][query] += 1
    _total_query_count[tenant_id] += 1
    _total_result_count[tenant_id] += result_count
    if result_count == 0:
        _no_result_queries[tenant_id][query] += 1
        _zero_result_count[tenant_id] += 1


def _suggestion_candidates() -> list[SuggestionItem]:
    items: list[SuggestionItem] = []
    for c in _candidate_index:
        items.append(SuggestionItem(text=c.get("name", ""), type="candidate", id=c.get("candidate_id")))
        for s in c.get("skills", []) or []:
            items.append(SuggestionItem(text=s, type="skill"))
    for j in _job_index:
        items.append(SuggestionItem(text=j.get("title", ""), type="job", id=j.get("job_id")))
    for it in _interview_index:
        items.append(SuggestionItem(text=it.get("title", ""), type="interview", id=it.get("interview_id")))
    return items


def _suggest(query: str, limit: int) -> tuple[list[SuggestionItem], bool]:
    """Build suggestion list for ``query``.

    Returns ``(items, used_fuzzy)``.  Used-fuzzy is True when at least one
    suggestion was a fuzzy (non-prefix / non-substring) match.
    """
    q = query.lower().strip()
    items = _suggestion_candidates()
    scored: list[tuple[float, SuggestionItem, bool]] = []
    seen: set[tuple[str, str]] = set()
    for item in items:
        text = item.text
        if not text:
            continue
        key = (text.lower(), item.type)
        if key in seen:
            continue
        tl = text.lower()
        used_fuzzy = False
        score = 0.0
        if tl.startswith(q):
            score = 1.0
        elif q in tl:
            score = 0.8
        else:
            # Fuzzy per-token.
            q_tokens = [t for t in q.split() if t]
            t_tokens = [t for t in tl.split() if t]
            for qt in q_tokens:
                _, ratio = _best_fuzzy_token(qt, t_tokens)
                if ratio >= FUZZY_THRESHOLD:
                    score = max(score, ratio)
                    used_fuzzy = True
        if score <= 0:
            continue
        seen.add(key)
        item.score = round(score, 3)
        scored.append((score, item, used_fuzzy))

    scored.sort(key=lambda x: x[0], reverse=True)
    limited = [it for _, it, _ in scored[:limit]]
    any_fuzzy = any(used for _, _, used in scored[:limit])
    return limited, any_fuzzy


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
    fuzzy: bool = Query(True, description="Enable typo-tolerant fuzzy matching"),
    tenant_id: str = Depends(require_tenant_id),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    start = time.perf_counter()
    grouped = GroupedResults()
    if type in ("candidates", "all"):
        grouped.candidates = _candidate_results(q, limit + offset, tenant_id) if fuzzy else _candidate_results(q, limit + offset, tenant_id)
    if type in ("jobs", "all"):
        grouped.jobs = _job_results(q, limit + offset, tenant_id) if fuzzy else _job_results(q, limit + offset, tenant_id)
    if type in ("interviews", "all"):
        grouped.interviews = _interview_results(q, limit + offset, tenant_id) if fuzzy else _interview_results(q, limit + offset, tenant_id)

    flat = grouped.candidates + grouped.jobs + grouped.interviews
    flat.sort(key=lambda r: r.score, reverse=True)
    sliced = flat[offset : offset + limit]
    took_ms = int((time.perf_counter() - start) * 1000)

    user_id = x_user_id or _user_id_from_auth(authorization)
    _record_recent(tenant_id, user_id, q, type, len(flat))
    _record_analytics(tenant_id, q, len(flat))
    return SearchResponse(
        query=q,
        type=type,
        results=sliced,
        grouped=grouped,
        total=len(flat),
        took_ms=took_ms,
        used_vector=False,
        fuzzy=fuzzy,
    )


@router.get("/suggest", response_model=SuggestResponse, tags=["Search"], summary="Autocomplete suggestions")
async def suggest(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=25),
    fuzzy: bool = Query(True, description="Enable typo-tolerant fuzzy matching"),
    tenant_id: str = Depends(require_tenant_id),
):
    items, used_fuzzy = _suggest(q, limit)
    if not items and fuzzy:
        # Force a fuzzy pass even if no prefix/substring was found.
        items, used_fuzzy = _suggest(q, limit)
    return SuggestResponse(query=q, suggestions=items, fuzzy=used_fuzzy)


@router.get("/recent", response_model=RecentSearchesResponse, tags=["Search"], summary="Recent searches for current user")
async def recent_searches(
    limit: int = Query(20, ge=1, le=100),
    tenant_id: str = Depends(require_tenant_id),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    user_id = x_user_id or _user_id_from_auth(authorization)
    items = _recent_searches.get((tenant_id, user_id), [])[:limit]
    return RecentSearchesResponse(
        data=[SearchHistoryRead(**_normalize_entry(e)) for e in items],
        total=len(items),
    )


@router.delete("/recent", tags=["Search"], summary="Clear recent searches")
async def clear_recent(
    tenant_id: str = Depends(require_tenant_id),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    user_id = x_user_id or _user_id_from_auth(authorization)
    _recent_searches[(tenant_id, user_id)] = []
    return {"cleared": True, "user": user_id, "tenant_id": tenant_id}


@router.get("/popular", response_model=PopularQueriesResponse, tags=["Search"], summary="Popular search terms in tenant")
async def popular_searches(
    limit: int = Query(10, ge=1, le=50),
    tenant_id: str = Depends(require_tenant_id),
):
    counts = _popular_queries.get(tenant_id, Counter())
    items = [
        PopularQueryItem(query=q, count=c)
        for q, c in counts.most_common(limit)
    ]
    return PopularQueriesResponse(data=items, total=len(items))


@router.get("/no-results", response_model=NoResultsResponse, tags=["Search"], summary="Queries that returned zero results")
async def no_results(
    limit: int = Query(20, ge=1, le=100),
    tenant_id: str = Depends(require_tenant_id),
):
    counts = _no_result_queries.get(tenant_id, Counter())
    now = _now()
    items = [
        NoResultsQueryItem(query=q, count=c, last_seen=now)
        for q, c in counts.most_common(limit)
    ]
    return NoResultsResponse(data=items, total=len(items))


@router.get("/analytics", response_model=SearchAnalyticsResponse, tags=["Search"], summary="Tenant search analytics summary")
async def search_analytics(
    tenant_id: str = Depends(require_tenant_id),
):
    total = _total_query_count.get(tenant_id, 0)
    total_results = _total_result_count.get(tenant_id, 0)
    zero = _zero_result_count.get(tenant_id, 0)
    popular = [
        PopularQueryItem(query=q, count=c)
        for q, c in _popular_queries.get(tenant_id, Counter()).most_common(10)
    ]
    no_results = [
        NoResultsQueryItem(query=q, count=c, last_seen=_now())
        for q, c in _no_result_queries.get(tenant_id, Counter()).most_common(10)
    ]
    return SearchAnalyticsResponse(
        total_searches=total,
        unique_queries=len(_popular_queries.get(tenant_id, Counter())),
        avg_results_per_query=(total_results / total) if total else 0.0,
        zero_result_rate=(zero / total) if total else 0.0,
        popular=popular,
        no_results=no_results,
    )


# ── Internal helpers ───────────────────────────────────────────────────────────


def _user_id_from_auth(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        return "anonymous"
    token = authorization[7:].strip()
    # Best effort — do not raise on bad tokens here; the auth dependency has
    # already validated the token upstream.
    try:
        from shared.core.security import decode_token
        payload = decode_token(token)
        if payload and payload.get("sub"):
            return str(payload["sub"])
    except Exception:
        pass
    return "anonymous"


def _normalize_entry(entry: dict[str, Any]) -> dict[str, Any]:
    """Coerce an in-memory entry to match ``SearchHistoryRead`` schema."""
    created_at = entry.get("created_at")
    if isinstance(created_at, str):
        try:
            created_at_dt = datetime.fromisoformat(created_at)
        except ValueError:
            created_at_dt = _now()
    elif isinstance(created_at, datetime):
        created_at_dt = created_at
    else:
        created_at_dt = _now()
    return {
        "id": entry.get("id", ""),
        "tenant_id": entry.get("tenant_id", ""),
        "user_id": entry.get("user_id", ""),
        "query": entry.get("query", ""),
        "search_type": entry.get("search_type", "all"),
        "results_count": int(entry.get("results_count", 0)),
        "created_at": created_at_dt,
    }


# ── Test / debug helpers (not part of the public API) ─────────────────────────


def _reset_state() -> None:
    """Reset all in-memory state.  Used by tests to isolate runs."""
    _recent_searches.clear()
    _popular_queries.clear()
    _no_result_queries.clear()
    _total_query_count.clear()
    _total_result_count.clear()
    _zero_result_count.clear()
