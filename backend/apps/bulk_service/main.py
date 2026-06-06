"""Bulk service — durable batch operations for candidates and jobs.

Endpoints:

* ``POST /api/v1/bulk/candidates/delete``            — bulk delete
* ``POST /api/v1/bulk/candidates/update-status``     — bulk update status
* ``POST /api/v1/bulk/candidates/add-tag``           — bulk add tag
* ``POST /api/v1/bulk/jobs/close``                   — bulk close jobs
* ``POST /api/v1/bulk/jobs/reopen``                  — bulk reopen jobs
* ``GET  /api/v1/bulk/operations``                   — list operations for tenant
* ``GET  /api/v1/bulk/operations/{id}``              — get a single operation

All write endpoints return a ``BulkOperationAccepted`` payload with the
generated ``op_id``; the actual work is done synchronously inside the
request (we keep the implementation simple and bounded to ``MAX_ITEMS``)
with progress flushed to the :class:`BulkOperation` row after every batch.
The GET endpoints let the caller poll for the final status.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import require_member, require_tenant_id
from shared.audit import audit
from shared.bulk.operations import (
    BulkOperation,
    bulk_apply_async,
    start_bulk_operation,
)
from shared.core.database import get_db_dependency
from shared.core.models.candidate import Candidate, CandidateStatus
from shared.core.models.recruitment import Job, JobStatus


logger = logging.getLogger("airos.bulk")
router = APIRouter()


# ── Limits ────────────────────────────────────────────────────────────────────

# Hard cap on items per request — keeps a single endpoint call bounded so
# the AsyncSession isn't held forever.
MAX_ITEMS: int = 1000


# ── Request models ────────────────────────────────────────────────────────────


class BulkIdsRequest(BaseModel):
    """Generic ``{ids: [...]}`` payload used by the simpler endpoints."""

    ids: list[str] = Field(..., min_length=1, max_length=MAX_ITEMS)


class BulkUpdateStatusRequest(BaseModel):
    ids: list[str] = Field(..., min_length=1, max_length=MAX_ITEMS)
    status: str = Field(..., description="new | contacted | screening | interviewing | offer | hired | rejected | withdrawn")


class BulkAddTagRequest(BaseModel):
    ids: list[str] = Field(..., min_length=1, max_length=MAX_ITEMS)
    tag: str = Field(..., min_length=1, max_length=64)


# ── Response models ───────────────────────────────────────────────────────────


class BulkOperationAccepted(BaseModel):
    op_id: str
    total: int
    status: str
    operation_type: str
    entity_type: str


class BulkOperationRead(BaseModel):
    id: str
    tenant_id: str
    user_id: str | None
    operation_type: str
    entity_type: str
    total: int
    processed: int
    failed: int
    status: str
    errors: list[dict[str, Any]] = []
    created_at: datetime
    completed_at: datetime | None = None


class BulkOperationListResponse(BaseModel):
    data: list[BulkOperationRead]
    total: int


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "bulk"
    max_items_per_request: int = MAX_ITEMS


# ── Tag helpers ───────────────────────────────────────────────────────────────


def _decode_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if not isinstance(value, list):
        return []
    return [str(t) for t in value if isinstance(t, (str, int, float))]


def _encode_tags(tags: list[str]) -> str:
    return json.dumps(list(dict.fromkeys(tags)))


# ── Per-entity async operations ──────────────────────────────────────────────


async def _delete_candidate(item: dict[str, Any], db: AsyncSession) -> None:
    tenant_id = item["tenant_id"]
    candidate_id = item["candidate_id"]
    result = await db.execute(
        select(Candidate).where(
            Candidate.id == candidate_id, Candidate.tenant_id == tenant_id
        )
    )
    candidate = result.scalar_one_or_none()
    if candidate is None:
        # Treat "not found" as a soft failure — the row was already gone or
        # the id belongs to another tenant.  The error will be recorded by
        # the bulk_apply_async wrapper.
        raise LookupError(f"candidate {candidate_id} not found in tenant")
    await db.delete(candidate)
    await db.flush()


async def _update_candidate_status(item: dict[str, Any], db: AsyncSession) -> None:
    tenant_id = item["tenant_id"]
    candidate_id = item["candidate_id"]
    target_status = item["status"]
    result = await db.execute(
        select(Candidate).where(
            Candidate.id == candidate_id, Candidate.tenant_id == tenant_id
        )
    )
    candidate = result.scalar_one_or_none()
    if candidate is None:
        raise LookupError(f"candidate {candidate_id} not found in tenant")
    candidate.status = CandidateStatus(target_status)
    candidate.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(candidate)
    await db.flush()


async def _add_candidate_tag(item: dict[str, Any], db: AsyncSession) -> None:
    tenant_id = item["tenant_id"]
    candidate_id = item["candidate_id"]
    tag = item["tag"]
    result = await db.execute(
        select(Candidate).where(
            Candidate.id == candidate_id, Candidate.tenant_id == tenant_id
        )
    )
    candidate = result.scalar_one_or_none()
    if candidate is None:
        raise LookupError(f"candidate {candidate_id} not found in tenant")
    current = _decode_tags(candidate.tags)
    if tag not in current:
        current.append(tag)
    candidate.tags = _encode_tags(current)
    candidate.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(candidate)
    await db.flush()


async def _close_job(item: dict[str, Any], db: AsyncSession) -> None:
    await _set_job_status(item, db, JobStatus.CLOSED)


async def _reopen_job(item: dict[str, Any], db: AsyncSession) -> None:
    await _set_job_status(item, db, JobStatus.OPEN)


async def _set_job_status(
    item: dict[str, Any], db: AsyncSession, target: JobStatus
) -> None:
    tenant_id = item["tenant_id"]
    job_id = item["job_id"]
    result = await db.execute(
        select(Job).where(Job.id == job_id, Job.tenant_id == tenant_id)
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise LookupError(f"job {job_id} not found in tenant")
    job.status = target
    job.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(job)
    await db.flush()


# ── Generic run helper ───────────────────────────────────────────────────────


async def _run_bulk(
    db: AsyncSession,
    *,
    user_id: str,
    tenant_id: str,
    operation_type: str,
    entity_type: str,
    items: list[dict[str, Any]],
    per_item: Any,
    metadata: dict[str, Any] | None = None,
    audit_action: str,
    audit_resource_type: str,
) -> BulkOperation:
    """Create the :class:`BulkOperation`, run :func:`bulk_apply_async`, audit.

    Returns the persisted :class:`BulkOperation` row.  Raises 400 if the
    caller supplies an empty ``items`` list (caught at the request level).
    """
    op = await start_bulk_operation(
        db,
        user_id=user_id,
        tenant_id=tenant_id,
        operation_type=operation_type,
        entity_type=entity_type,
        total=len(items),
        metadata=metadata,
    )
    final = await bulk_apply_async(db, op.id, items, per_item)
    assert final is not None  # we just created it

    await audit(
        db,
        tenant_id=tenant_id,
        action=audit_action,
        resource_type=audit_resource_type,
        resource_id=final.id,
        actor_id=user_id,
        details={
            "operation_type": operation_type,
            "total": final.total,
            "processed": final.processed,
            "failed": final.failed,
            "status": final.status,
        },
    )
    return final


# ── Health ────────────────────────────────────────────────────────────────────


@router.get("/health", response_model=HealthResponse, tags=["Bulk Operations"])
async def health() -> HealthResponse:
    return HealthResponse()


# ── Candidates ────────────────────────────────────────────────────────────────


@router.post(
    "/candidates/delete",
    response_model=BulkOperationAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["Bulk Operations"],
    summary="Bulk delete candidates",
    description=(
        "Asynchronously delete a list of candidates.  Returns the bulk "
        "operation id; poll ``GET /api/v1/bulk/operations/{id}`` for the "
        "final status."
    ),
)
async def bulk_delete_candidates(
    payload: BulkIdsRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict = Depends(require_member),
) -> BulkOperationAccepted:
    items = [{"candidate_id": cid, "tenant_id": tenant_id} for cid in payload.ids]
    final = await _run_bulk(
        db,
        user_id=user["id"],
        tenant_id=tenant_id,
        operation_type="candidates.delete",
        entity_type="candidate",
        items=items,
        per_item=_delete_candidate,
        audit_action="bulk.candidates.delete",
        audit_resource_type="candidate",
    )
    return BulkOperationAccepted(
        op_id=final.id,
        total=final.total,
        status=final.status,
        operation_type=final.operation_type,
        entity_type=final.entity_type,
    )


@router.post(
    "/candidates/update-status",
    response_model=BulkOperationAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["Bulk Operations"],
    summary="Bulk update candidate status",
)
async def bulk_update_candidate_status(
    payload: BulkUpdateStatusRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict = Depends(require_member),
) -> BulkOperationAccepted:
    try:
        CandidateStatus(payload.status)
    except ValueError as exc:
        valid = ", ".join(s.value for s in CandidateStatus)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid status '{payload.status}' (valid: {valid})",
        ) from exc

    items = [
        {"candidate_id": cid, "tenant_id": tenant_id, "status": payload.status}
        for cid in payload.ids
    ]
    final = await _run_bulk(
        db,
        user_id=user["id"],
        tenant_id=tenant_id,
        operation_type="candidates.update_status",
        entity_type="candidate",
        items=items,
        per_item=_update_candidate_status,
        metadata={"status": payload.status},
        audit_action="bulk.candidates.update_status",
        audit_resource_type="candidate",
    )
    return BulkOperationAccepted(
        op_id=final.id,
        total=final.total,
        status=final.status,
        operation_type=final.operation_type,
        entity_type=final.entity_type,
    )


@router.post(
    "/candidates/add-tag",
    response_model=BulkOperationAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["Bulk Operations"],
    summary="Bulk add a tag to candidates",
)
async def bulk_add_candidate_tag(
    payload: BulkAddTagRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict = Depends(require_member),
) -> BulkOperationAccepted:
    items = [
        {"candidate_id": cid, "tenant_id": tenant_id, "tag": payload.tag}
        for cid in payload.ids
    ]
    final = await _run_bulk(
        db,
        user_id=user["id"],
        tenant_id=tenant_id,
        operation_type="candidates.add_tag",
        entity_type="candidate",
        items=items,
        per_item=_add_candidate_tag,
        metadata={"tag": payload.tag},
        audit_action="bulk.candidates.add_tag",
        audit_resource_type="candidate",
    )
    return BulkOperationAccepted(
        op_id=final.id,
        total=final.total,
        status=final.status,
        operation_type=final.operation_type,
        entity_type=final.entity_type,
    )


# ── Jobs ──────────────────────────────────────────────────────────────────────


@router.post(
    "/jobs/close",
    response_model=BulkOperationAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["Bulk Operations"],
    summary="Bulk close jobs",
)
async def bulk_close_jobs(
    payload: BulkIdsRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict = Depends(require_member),
) -> BulkOperationAccepted:
    items = [{"job_id": jid, "tenant_id": tenant_id} for jid in payload.ids]
    final = await _run_bulk(
        db,
        user_id=user["id"],
        tenant_id=tenant_id,
        operation_type="jobs.close",
        entity_type="job",
        items=items,
        per_item=_close_job,
        audit_action="bulk.jobs.close",
        audit_resource_type="job",
    )
    return BulkOperationAccepted(
        op_id=final.id,
        total=final.total,
        status=final.status,
        operation_type=final.operation_type,
        entity_type=final.entity_type,
    )


@router.post(
    "/jobs/reopen",
    response_model=BulkOperationAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["Bulk Operations"],
    summary="Bulk reopen jobs",
)
async def bulk_reopen_jobs(
    payload: BulkIdsRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict = Depends(require_member),
) -> BulkOperationAccepted:
    items = [{"job_id": jid, "tenant_id": tenant_id} for jid in payload.ids]
    final = await _run_bulk(
        db,
        user_id=user["id"],
        tenant_id=tenant_id,
        operation_type="jobs.reopen",
        entity_type="job",
        items=items,
        per_item=_reopen_job,
        audit_action="bulk.jobs.reopen",
        audit_resource_type="job",
    )
    return BulkOperationAccepted(
        op_id=final.id,
        total=final.total,
        status=final.status,
        operation_type=final.operation_type,
        entity_type=final.entity_type,
    )


# ── Operations listing / detail ───────────────────────────────────────────────


def _serialize(op: BulkOperation) -> BulkOperationRead:
    return BulkOperationRead(
        id=op.id,
        tenant_id=op.tenant_id,
        user_id=op.user_id,
        operation_type=op.operation_type,
        entity_type=op.entity_type,
        total=op.total,
        processed=op.processed,
        failed=op.failed,
        status=op.status,
        errors=list(op.errors or []),
        created_at=op.created_at,
        completed_at=op.completed_at,
    )


@router.get(
    "/operations",
    response_model=BulkOperationListResponse,
    tags=["Bulk Operations"],
    summary="List bulk operations for the current tenant",
)
async def list_bulk_operations(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _user: dict = Depends(require_member),
) -> BulkOperationListResponse:
    total_result = await db.execute(
        select(BulkOperation).where(BulkOperation.tenant_id == tenant_id)
    )
    # Use a count query for the total; fetching the full list is wasteful at
    # scale but matches the existing patterns in this codebase.
    from sqlalchemy import func

    count_q = select(func.count()).select_from(BulkOperation).where(
        BulkOperation.tenant_id == tenant_id
    )
    total = (await db.execute(count_q)).scalar_one()

    result = await db.execute(
        select(BulkOperation)
        .where(BulkOperation.tenant_id == tenant_id)
        .order_by(BulkOperation.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    ops = result.scalars().all()
    return BulkOperationListResponse(
        data=[_serialize(o) for o in ops],
        total=total,
    )


@router.get(
    "/operations/{op_id}",
    response_model=BulkOperationRead,
    tags=["Bulk Operations"],
    summary="Get a single bulk operation by id",
)
async def get_bulk_operation(
    op_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _user: dict = Depends(require_member),
) -> BulkOperationRead:
    result = await db.execute(
        select(BulkOperation).where(
            BulkOperation.id == op_id, BulkOperation.tenant_id == tenant_id
        )
    )
    op = result.scalar_one_or_none()
    if op is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Bulk operation not found"
        )
    return _serialize(op)
