"""Tag Service — tenant-scoped labels and bulk application endpoints.

Exposes the tag catalogue and the bulk apply / remove operations.  Per-entity
listing (and per-entity add / remove) is colocated with the candidate and job
services so the URLs sit next to the resources they tag.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Iterable

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import require_tenant_id
from shared.core.database import get_db_dependency
from shared.core.models.candidate import Candidate
from shared.core.models.recruitment import Job
from shared.core.models.tag import (
    AddEntityTagResponse,
    EntityTagRead,
    PopularTagItem,
    PopularTagsResponse,
    Tag,
    TagApplication,
    TagApplyRequest,
    TagApplyResponse,
    TagCreate,
    TagCreateResponse,
    TagDeleteResponse,
    TagEntityType,
    TagListResponse,
    TagRead,
    TagRemoveRequest,
    TagRemoveResponse,
    TagUpdate,
    TagUpdateResponse,
)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_entity_type(value: str) -> str:
    """Lower-case and validate an entity type string supplied by the caller."""
    v = (value or "").strip().lower()
    if v not in {"candidate", "job"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="entity_type must be 'candidate' or 'job'",
        )
    return v


def _tag_matches_entity(tag_entity_type: TagEntityType | str, entity_type: str) -> bool:
    """Return True if a tag definition allows attaching to ``entity_type``."""
    val = tag_entity_type.value if hasattr(tag_entity_type, "value") else str(tag_entity_type)
    return val == "all" or val == entity_type


def _to_read(tag: Tag, usage_count: int = 0) -> TagRead:
    return TagRead(
        id=tag.id,
        tenant_id=tag.tenant_id,
        name=tag.name,
        display_name=tag.display_name,
        color=tag.color,
        entity_type=tag.entity_type,
        usage_count=usage_count,
        created_at=tag.created_at,
        updated_at=tag.updated_at,
    )


async def _entity_exists(
    db: AsyncSession, *, entity_type: str, entity_id: str, tenant_id: str
) -> bool:
    if entity_type == "candidate":
        result = await db.execute(
            select(Candidate.id).where(
                Candidate.id == entity_id, Candidate.tenant_id == tenant_id
            )
        )
    else:
        result = await db.execute(
            select(Job.id).where(Job.id == entity_id, Job.tenant_id == tenant_id)
        )
    return result.scalar_one_or_none() is not None


# ── Router ────────────────────────────────────────────────────────────────────


router = APIRouter()


@router.get("/health", tags=["Tags"], summary="Tag service health check")
async def health() -> dict[str, str]:
    return {"status": "healthy", "service": "tag"}


@router.get(
    "/popular",
    response_model=PopularTagsResponse,
    tags=["Tags"],
    summary="Popular tags",
    description="Return tags ranked by total application count, scoped to the caller's tenant.",
)
async def popular_tags(
    limit: int = Query(20, ge=1, le=100, description="Maximum tags to return"),
    entity_type: str | None = Query(
        default=None,
        description="Optional filter: 'candidate' or 'job'",
    ),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> PopularTagsResponse:
    """Return the top-N most-used tags for this tenant.

    Joins ``tags`` against ``tag_applications`` and groups by tag id so a
    single round-trip returns both the definition and the usage count.
    """
    if entity_type is not None:
        _normalize_entity_type(entity_type)

    usage_col = func.count(TagApplication.id).label("usage_count")
    stmt = (
        select(Tag, usage_col)
        .outerjoin(TagApplication, TagApplication.tag_id == Tag.id)
        .where(Tag.tenant_id == tenant_id)
        .group_by(Tag.id)
        .order_by(usage_col.desc(), Tag.name.asc())
        .limit(limit)
    )
    if entity_type is not None:
        stmt = stmt.where(
            (Tag.entity_type == TagEntityType.ALL)
            | (Tag.entity_type == TagEntityType(entity_type))
        )

    rows = (await db.execute(stmt)).all()
    items: list[PopularTagItem] = []
    for tag, count in rows:
        if entity_type is not None and not _tag_matches_entity(tag.entity_type, entity_type):
            continue
        items.append(
            PopularTagItem(
                id=tag.id,
                name=tag.name,
                display_name=tag.display_name,
                color=tag.color,
                entity_type=tag.entity_type,
                usage_count=int(count or 0),
            )
        )
    return PopularTagsResponse(data=items, total=len(items))


@router.get(
    "/",
    response_model=TagListResponse,
    tags=["Tags"],
    summary="List tags",
    description="Return a paginated list of tags defined for the caller's tenant.",
)
async def list_tags(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    entity_type: str | None = Query(default=None, description="candidate | job | all"),
    search: str | None = Query(default=None, description="Filter by name substring"),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> TagListResponse:
    usage_col = func.count(TagApplication.id).label("usage_count")
    base = (
        select(Tag, usage_col)
        .outerjoin(TagApplication, TagApplication.tag_id == Tag.id)
        .where(Tag.tenant_id == tenant_id)
        .group_by(Tag.id)
        .order_by(usage_col.desc(), Tag.name.asc())
    )
    count_stmt = select(func.count()).select_from(Tag).where(Tag.tenant_id == tenant_id)

    if entity_type is not None:
        try:
            et = TagEntityType(entity_type)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid entity_type '{entity_type}' (expected candidate|job|all)",
            ) from exc
        base = base.where(Tag.entity_type == et)
        count_stmt = count_stmt.where(Tag.entity_type == et)

    if search:
        like = f"%{search.lower()}%"
        base = base.where(Tag.name.like(like))
        count_stmt = count_stmt.where(Tag.name.like(like))

    total = (await db.execute(count_stmt)).scalar_one()
    offset = (page - 1) * page_size
    rows = (await db.execute(base.offset(offset).limit(page_size))).all()
    return TagListResponse(
        data=[_to_read(tag, int(count or 0)) for tag, count in rows],
        total=int(total or 0),
        page=page,
        page_size=page_size,
    )


@router.post(
    "/",
    response_model=TagCreateResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Tags"],
    summary="Create a tag",
)
async def create_tag(
    data: TagCreate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> TagCreateResponse:
    name = data.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="name is required"
        )
    normalized = name.lower()
    existing = (
        await db.execute(
            select(Tag).where(Tag.tenant_id == tenant_id, Tag.name == normalized)
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tag '{name}' already exists",
        )

    tag = Tag(
        tenant_id=tenant_id,
        name=normalized,
        display_name=name,
        color=data.color,
        entity_type=data.entity_type,
    )
    db.add(tag)
    await db.flush()
    await db.refresh(tag)
    return TagCreateResponse(
        id=tag.id,
        name=tag.name,
        display_name=tag.display_name,
        color=tag.color,
        entity_type=tag.entity_type,
        created=True,
    )


@router.put(
    "/{tag_id}",
    response_model=TagUpdateResponse,
    tags=["Tags"],
    summary="Update a tag",
)
async def update_tag(
    tag_id: str,
    data: TagUpdate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> TagUpdateResponse:
    tag = (
        await db.execute(
            select(Tag).where(Tag.id == tag_id, Tag.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found"
        )

    if data.name is not None:
        new_name = data.name.strip()
        if not new_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="name cannot be empty"
            )
        normalized = new_name.lower()
        if normalized != tag.name:
            clash = (
                await db.execute(
                    select(Tag).where(
                        Tag.tenant_id == tenant_id,
                        Tag.name == normalized,
                        Tag.id != tag.id,
                    )
                )
            ).scalar_one_or_none()
            if clash is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Tag '{new_name}' already exists",
                )
            tag.name = normalized
            tag.display_name = new_name
    if data.color is not None:
        tag.color = data.color
    if data.entity_type is not None:
        tag.entity_type = data.entity_type

    tag.updated_at = _utcnow()
    db.add(tag)
    await db.flush()
    return TagUpdateResponse(id=tag.id, updated=True)


@router.delete(
    "/{tag_id}",
    response_model=TagDeleteResponse,
    tags=["Tags"],
    summary="Delete a tag",
    description="Delete a tag definition and remove all of its applications in one transaction.",
)
async def delete_tag(
    tag_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> TagDeleteResponse:
    tag = (
        await db.execute(
            select(Tag).where(Tag.id == tag_id, Tag.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found"
        )
    # Cascade: remove every application row for this tag.
    apps = (
        await db.execute(
            select(TagApplication).where(
                TagApplication.tag_id == tag_id,
                TagApplication.tenant_id == tenant_id,
            )
        )
    ).scalars().all()
    for app in apps:
        await db.delete(app)
    await db.delete(tag)
    await db.flush()
    return TagDeleteResponse(id=tag_id, deleted=True)


@router.post(
    "/{tag_id}/apply",
    response_model=TagApplyResponse,
    tags=["Tags"],
    summary="Apply a tag to entities",
    description="Attach a tag to one or more candidate or job ids.  Entity ids that "
                "do not exist (or do not belong to the tenant) are silently skipped.",
)
async def apply_tag(
    tag_id: str,
    payload: TagApplyRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> TagApplyResponse:
    entity_type = _normalize_entity_type(payload.entity_type)
    tag = (
        await db.execute(
            select(Tag).where(Tag.id == tag_id, Tag.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found"
        )
    if not _tag_matches_entity(tag.entity_type, entity_type):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Tag '{tag.display_name}' cannot be applied to {entity_type}s "
                f"(declared entity_type='{tag.entity_type.value}')"
            ),
        )

    deduped_ids = list(dict.fromkeys(payload.entity_ids or []))
    if not deduped_ids:
        return TagApplyResponse(
            tag_id=tag.id, entity_type=entity_type, applied=0, skipped=0, application_ids=[]
        )

    existing = (
        await db.execute(
            select(TagApplication).where(
                TagApplication.tag_id == tag.id,
                TagApplication.entity_type == entity_type,
                TagApplication.entity_id.in_(deduped_ids),
                TagApplication.tenant_id == tenant_id,
            )
        )
    ).scalars().all()
    already = {row.entity_id for row in existing}
    skipped = len(already)
    target_ids = [eid for eid in deduped_ids if eid not in already]

    new_app_ids: list[str] = []
    valid_ids: list[str] = []
    for eid in target_ids:
        if await _entity_exists(db, entity_type=entity_type, entity_id=eid, tenant_id=tenant_id):
            valid_ids.append(eid)
        else:
            skipped += 1

    for eid in valid_ids:
        app = TagApplication(
            tenant_id=tenant_id,
            tag_id=tag.id,
            entity_type=entity_type,
            entity_id=eid,
        )
        db.add(app)
        await db.flush()
        await db.refresh(app)
        new_app_ids.append(app.id)

    return TagApplyResponse(
        tag_id=tag.id,
        entity_type=entity_type,
        applied=len(new_app_ids),
        skipped=skipped,
        application_ids=new_app_ids,
    )


@router.post(
    "/{tag_id}/remove",
    response_model=TagRemoveResponse,
    tags=["Tags"],
    summary="Remove a tag from entities",
    description="Detach a tag from one or more candidate or job ids.  Missing "
                "applications are silently skipped (idempotent).",
)
async def remove_tag(
    tag_id: str,
    payload: TagRemoveRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> TagRemoveResponse:
    entity_type = _normalize_entity_type(payload.entity_type)
    tag = (
        await db.execute(
            select(Tag).where(Tag.id == tag_id, Tag.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found"
        )

    deduped_ids = list(dict.fromkeys(payload.entity_ids or []))
    if not deduped_ids:
        return TagRemoveResponse(tag_id=tag.id, entity_type=entity_type, removed=0)

    rows = (
        await db.execute(
            select(TagApplication).where(
                TagApplication.tag_id == tag.id,
                TagApplication.entity_type == entity_type,
                TagApplication.entity_id.in_(deduped_ids),
                TagApplication.tenant_id == tenant_id,
            )
        )
    ).scalars().all()
    removed = 0
    for row in rows:
        await db.delete(row)
        removed += 1
    if removed:
        await db.flush()
    return TagRemoveResponse(tag_id=tag.id, entity_type=entity_type, removed=removed)
