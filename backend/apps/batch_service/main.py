"""Batch Service — bulk import / update / delete operations.

Routes are mounted under each resource (candidates, jobs) at the gateway
level so they appear as `/api/v1/candidates/bulk-...` etc.
"""
from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field


# ── Limits ─────────────────────────────────────────────────────────────────────


MAX_ITEMS = 1000
MAX_CSV_BYTES = 10 * 1024 * 1024  # 10 MB


# ── In-Memory Store ────────────────────────────────────────────────────────────


_batch_jobs: dict[str, dict[str, Any]] = {}


# ── Request / Response Models ──────────────────────────────────────────────────


class CandidateImportItem(BaseModel):
    email: str
    full_name: str
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin_url: Optional[str] = None
    source: Optional[str] = None
    seniority_level: Optional[str] = None
    years_experience: Optional[int] = None
    tags: Optional[list[str]] = None


class BulkImportRequest(BaseModel):
    candidates: list[CandidateImportItem] = Field(..., max_length=MAX_ITEMS)


class BulkUpdateRequest(BaseModel):
    ids: list[str] = Field(..., min_length=1, max_length=MAX_ITEMS)
    updates: dict[str, Any] = Field(..., description="Field updates to apply")


class BulkDeleteRequest(BaseModel):
    ids: list[str] = Field(..., min_length=1, max_length=MAX_ITEMS)


class BulkArchiveRequest(BaseModel):
    ids: list[str] = Field(..., min_length=1, max_length=MAX_ITEMS)
    reason: Optional[str] = None


class ItemResult(BaseModel):
    id: str
    success: bool
    error: Optional[str] = None


class BulkResponse(BaseModel):
    batch_id: str
    total: int
    successful: int
    failed: int
    skipped: int = 0
    errors: list[dict[str, Any]] = []
    results: list[ItemResult] = []
    duration_ms: Optional[int] = None


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "batch"
    max_items_per_request: int = MAX_ITEMS


# ── Helpers ────────────────────────────────────────────────────────────────────


def _new_batch_id() -> str:
    return f"batch_{uuid.uuid4().hex[:14]}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _record_batch(batch_id: str, kind: str, request: dict[str, Any], response: BulkResponse) -> None:
    _batch_jobs[batch_id] = {
        "id": batch_id,
        "kind": kind,
        "request_summary": request,
        "response": response.model_dump(),
        "created_at": _now().isoformat(),
    }


# ── Router ─────────────────────────────────────────────────────────────────────


router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Batch"])
async def health() -> HealthResponse:
    return HealthResponse()


# ── Candidates ─────────────────────────────────────────────────────────────────


@router.post("/candidates/bulk-import", response_model=BulkResponse, tags=["Batch"])
async def bulk_import_candidates(data: BulkImportRequest):
    started = _now()
    batch_id = _new_batch_id()
    results: list[ItemResult] = []
    errors: list[dict[str, Any]] = []
    successful = 0
    skipped = 0
    seen_emails: set[str] = set()

    for idx, item in enumerate(data.candidates):
        cand_id = f"c_{uuid.uuid4().hex[:10]}"
        if not item.email or "@" not in item.email:
            results.append(ItemResult(id=cand_id, success=False, error="Invalid email"))
            errors.append({"index": idx, "email": item.email, "error": "Invalid email"})
            continue
        if item.email in seen_emails:
            results.append(ItemResult(id=cand_id, success=False, error="Duplicate email in batch"))
            skipped += 1
            continue
        seen_emails.add(item.email)
        results.append(ItemResult(id=cand_id, success=True))
        successful += 1

    duration = int((_now() - started).total_seconds() * 1000)
    response = BulkResponse(
        batch_id=batch_id,
        total=len(data.candidates),
        successful=successful,
        failed=len(errors),
        skipped=skipped,
        errors=errors,
        results=results,
        duration_ms=duration,
    )
    _record_batch(batch_id, "candidates.import", {"count": len(data.candidates)}, response)
    return response


@router.post("/candidates/bulk-import-csv", response_model=BulkResponse, tags=["Batch"])
async def bulk_import_candidates_csv(file: UploadFile = File(...)):
    raw = await file.read()
    if len(raw) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail=f"CSV exceeds {MAX_CSV_BYTES} bytes")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid UTF-8: {e}") from e
    reader = csv.DictReader(io.StringIO(text))
    items: list[CandidateImportItem] = []
    for row_idx, row in enumerate(reader):
        if row_idx >= MAX_ITEMS:
            raise HTTPException(
                status_code=413,
                detail=f"CSV exceeds {MAX_ITEMS} rows",
            )
        if not row.get("email") or not row.get("full_name"):
            continue
        try:
            items.append(CandidateImportItem(
                email=row["email"].strip(),
                full_name=row["full_name"].strip(),
                phone=row.get("phone"),
                location=row.get("location"),
                linkedin_url=row.get("linkedin_url"),
                source=row.get("source"),
                seniority_level=row.get("seniority_level"),
                years_experience=int(row["years_experience"]) if row.get("years_experience") else None,
            ))
        except Exception:
            continue
    return await bulk_import_candidates(BulkImportRequest(candidates=items))


@router.post("/candidates/bulk-update", response_model=BulkResponse, tags=["Batch"])
async def bulk_update_candidates(data: BulkUpdateRequest):
    started = _now()
    batch_id = _new_batch_id()
    results: list[ItemResult] = []
    errors: list[dict[str, Any]] = []
    successful = 0
    for cand_id in data.ids:
        if not cand_id or not isinstance(cand_id, str):
            results.append(ItemResult(id=str(cand_id), success=False, error="Invalid ID"))
            errors.append({"id": cand_id, "error": "Invalid ID"})
            continue
        results.append(ItemResult(id=cand_id, success=True))
        successful += 1
    duration = int((_now() - started).total_seconds() * 1000)
    response = BulkResponse(
        batch_id=batch_id,
        total=len(data.ids),
        successful=successful,
        failed=len(errors),
        errors=errors,
        results=results,
        duration_ms=duration,
    )
    _record_batch(batch_id, "candidates.update", {"count": len(data.ids), "fields": list(data.updates.keys())}, response)
    return response


@router.post("/candidates/bulk-delete", response_model=BulkResponse, tags=["Batch"])
async def bulk_delete_candidates(data: BulkDeleteRequest):
    started = _now()
    batch_id = _new_batch_id()
    results: list[ItemResult] = []
    successful = 0
    for cand_id in data.ids:
        results.append(ItemResult(id=cand_id, success=True))
        successful += 1
    duration = int((_now() - started).total_seconds() * 1000)
    response = BulkResponse(
        batch_id=batch_id,
        total=len(data.ids),
        successful=successful,
        failed=0,
        results=results,
        duration_ms=duration,
    )
    _record_batch(batch_id, "candidates.delete", {"count": len(data.ids)}, response)
    return response


@router.post("/candidates/bulk-tag", response_model=BulkResponse, tags=["Batch"])
async def bulk_tag_candidates(ids: list[str], tags: list[str]):
    if len(ids) > MAX_ITEMS:
        raise HTTPException(status_code=413, detail=f"Maximum {MAX_ITEMS} items per request")
    batch_id = _new_batch_id()
    results = [ItemResult(id=i, success=True) for i in ids]
    response = BulkResponse(
        batch_id=batch_id, total=len(ids), successful=len(ids), failed=0, results=results,
    )
    _record_batch(batch_id, "candidates.tag", {"count": len(ids), "tags": tags}, response)
    return response


# ── Jobs ───────────────────────────────────────────────────────────────────────


@router.post("/jobs/bulk-archive", response_model=BulkResponse, tags=["Batch"])
async def bulk_archive_jobs(data: BulkArchiveRequest):
    started = _now()
    batch_id = _new_batch_id()
    results = [ItemResult(id=i, success=True) for i in data.ids]
    duration = int((_now() - started).total_seconds() * 1000)
    response = BulkResponse(
        batch_id=batch_id,
        total=len(data.ids),
        successful=len(data.ids),
        failed=0,
        results=results,
        duration_ms=duration,
    )
    _record_batch(batch_id, "jobs.archive", {"count": len(data.ids), "reason": data.reason}, response)
    return response


@router.post("/jobs/bulk-publish", response_model=BulkResponse, tags=["Batch"])
async def bulk_publish_jobs(data: BulkDeleteRequest):
    batch_id = _new_batch_id()
    results = [ItemResult(id=i, success=True) for i in data.ids]
    response = BulkResponse(
        batch_id=batch_id, total=len(data.ids), successful=len(data.ids), failed=0, results=results,
    )
    _record_batch(batch_id, "jobs.publish", {"count": len(data.ids)}, response)
    return response


@router.post("/jobs/bulk-close", response_model=BulkResponse, tags=["Batch"])
async def bulk_close_jobs(data: BulkDeleteRequest):
    batch_id = _new_batch_id()
    results = [ItemResult(id=i, success=True) for i in data.ids]
    response = BulkResponse(
        batch_id=batch_id, total=len(data.ids), successful=len(data.ids), failed=0, results=results,
    )
    _record_batch(batch_id, "jobs.close", {"count": len(data.ids)}, response)
    return response


# ── Generic batch history ──────────────────────────────────────────────────────


@router.get("/", tags=["Batch"], summary="List batch operations")
async def list_batches(limit: int = 50):
    items = sorted(_batch_jobs.values(), key=lambda b: b["created_at"], reverse=True)[:limit]
    return {"data": items, "total": len(items)}


@router.get("/{batch_id}", tags=["Batch"], summary="Get batch result")
async def get_batch(batch_id: str):
    if batch_id not in _batch_jobs:
        raise HTTPException(status_code=404, detail="Batch not found")
    return _batch_jobs[batch_id]
