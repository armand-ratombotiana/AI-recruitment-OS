"""Search domain — SearchHistory model and related schemas."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field
from sqlmodel import SQLModel, Field as SQLField


# ── Tables ─────────────────────────────────────────────────────────────────────


class SearchHistory(SQLModel, table=True):
    """Persistent record of a single search executed by a user.

    Used to power per-user ``recent searches`` and tenant-wide analytics
    (popular queries, zero-result queries, etc.).
    """

    __tablename__ = "search_history"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    user_id: str = SQLField(index=True)
    query: str = SQLField(index=True)
    search_type: str = SQLField(default="all", index=True)
    results_count: int = SQLField(default=0)
    created_at: datetime = SQLField(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        index=True,
    )


# ── API Schemas ────────────────────────────────────────────────────────────────


class SearchHistoryRead(BaseModel):
    id: str
    tenant_id: str
    user_id: str
    query: str
    search_type: str
    results_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class PopularQueryItem(BaseModel):
    query: str
    count: int


class PopularQueriesResponse(BaseModel):
    data: list[PopularQueryItem]
    total: int


class NoResultsQueryItem(BaseModel):
    query: str
    count: int
    last_seen: datetime


class NoResultsResponse(BaseModel):
    data: list[NoResultsQueryItem]
    total: int


class RecentSearchesResponse(BaseModel):
    data: list[SearchHistoryRead]
    total: int


class SearchAnalyticsResponse(BaseModel):
    total_searches: int
    unique_queries: int
    avg_results_per_query: float
    zero_result_rate: float
    popular: list[PopularQueryItem]
    no_results: list[NoResultsQueryItem]
