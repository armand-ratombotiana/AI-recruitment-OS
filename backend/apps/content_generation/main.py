"""Content Generation service — AI-powered content creation with template management."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from shared.ai.content_generator import ContentGenerator
from shared.auth import require_tenant_id, require_member
from shared.core.database import get_db_dependency
from shared.core.models.content_template import ContentTemplate

logger = logging.getLogger("content_generation")

router = APIRouter()


# ── Request / Response Models ──────────────────────────────────────────────────


class GenerateContentRequest(BaseModel):
    content_type: str = Field(..., description="Type: job_description, email, offer_letter, rejection, linkedin_post")
    data: dict[str, Any] = Field(default_factory=dict, description="Input data for generation")


class GenerateJobDescriptionRequest(BaseModel):
    job_title: str = Field(..., min_length=1)
    requirements: list[str] = Field(default_factory=list)
    company_info: dict[str, Any] = Field(default_factory=dict)


class GenerateEmailRequest(BaseModel):
    template_type: str = Field(..., min_length=1)
    candidate_data: dict[str, Any] = Field(default_factory=dict)
    job_data: dict[str, Any] = Field(default_factory=dict)


class GenerateOfferLetterRequest(BaseModel):
    candidate_data: dict[str, Any] = Field(default_factory=dict)
    job_data: dict[str, Any] = Field(default_factory=dict)
    offer_terms: dict[str, Any] = Field(default_factory=dict)


class GenerateRejectionRequest(BaseModel):
    candidate_data: dict[str, Any] = Field(default_factory=dict)
    job_data: dict[str, Any] = Field(default_factory=dict)
    reason: Optional[str] = Field(default=None)


class GenerateLinkedInPostRequest(BaseModel):
    job_data: dict[str, Any] = Field(default_factory=dict)
    tone: str = Field(default="professional")


class ContentResponse(BaseModel):
    content: str
    content_type: str
    generated_by: str = "ai"
    tenant_id: str
    created_at: str


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1)
    type: str = Field(..., description="job_description, email, offer_letter, rejection, linkedin_post")
    content: str = Field(..., min_length=1)
    variables: dict[str, Any] = Field(default_factory=dict)


class TemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None)
    content: Optional[str] = Field(default=None)
    variables: Optional[dict[str, Any]] = Field(default=None)


class TemplateRead(BaseModel):
    id: str
    tenant_id: str
    name: str
    type: str
    content: str
    variables: dict[str, Any]
    created_at: str
    updated_at: str


class TemplateListResponse(BaseModel):
    data: list[TemplateRead]
    total: int


# ── Helpers ────────────────────────────────────────────────────────────────────


def _template_to_read(t: ContentTemplate) -> TemplateRead:
    return TemplateRead(
        id=t.id,
        tenant_id=t.tenant_id,
        name=t.name,
        type=t.type,
        content=t.content,
        variables=t.variables or {},
        created_at=t.created_at.isoformat() if t.created_at else "",
        updated_at=t.updated_at.isoformat() if t.updated_at else "",
    )


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Content Generation Endpoints ───────────────────────────────────────────────


@router.post(
    "/generate",
    response_model=ContentResponse,
    tags=["Content"],
    summary="Generate content based on type",
)
async def generate_content(
    data: GenerateContentRequest,
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> ContentResponse:
    gen = ContentGenerator(tenant_id=tenant_id)
    content_type = data.content_type
    payload = data.data

    if content_type == "job_description":
        content = await gen.generate_job_description(
            job_title=payload.get("job_title", ""),
            requirements=payload.get("requirements", []),
            company_info=payload.get("company_info", {}),
        )
    elif content_type == "email":
        content = await gen.generate_email(
            template_type=payload.get("template_type", "general"),
            candidate_data=payload.get("candidate_data", {}),
            job_data=payload.get("job_data", {}),
        )
    elif content_type == "offer_letter":
        content = await gen.generate_offer_letter(
            candidate_data=payload.get("candidate_data", {}),
            job_data=payload.get("job_data", {}),
            offer_terms=payload.get("offer_terms", {}),
        )
    elif content_type == "rejection":
        content = await gen.generate_rejection_letter(
            candidate_data=payload.get("candidate_data", {}),
            job_data=payload.get("job_data", {}),
            reason=payload.get("reason"),
        )
    elif content_type == "linkedin_post":
        content = await gen.generate_linkedin_post(
            job_data=payload.get("job_data", {}),
            tone=payload.get("tone", "professional"),
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported content type: {content_type}")

    return ContentResponse(
        content=content,
        content_type=content_type,
        tenant_id=tenant_id,
        created_at=_utcnow_iso(),
    )


@router.post(
    "/generate/job-description",
    response_model=ContentResponse,
    tags=["Content"],
    summary="Generate a job description",
)
async def generate_job_description(
    data: GenerateJobDescriptionRequest,
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> ContentResponse:
    gen = ContentGenerator(tenant_id=tenant_id)
    content = await gen.generate_job_description(
        job_title=data.job_title,
        requirements=data.requirements,
        company_info=data.company_info,
    )
    return ContentResponse(
        content=content,
        content_type="job_description",
        tenant_id=tenant_id,
        created_at=_utcnow_iso(),
    )


@router.post(
    "/generate/email",
    response_model=ContentResponse,
    tags=["Content"],
    summary="Generate an email",
)
async def generate_email(
    data: GenerateEmailRequest,
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> ContentResponse:
    gen = ContentGenerator(tenant_id=tenant_id)
    content = await gen.generate_email(
        template_type=data.template_type,
        candidate_data=data.candidate_data,
        job_data=data.job_data,
    )
    return ContentResponse(
        content=content,
        content_type="email",
        tenant_id=tenant_id,
        created_at=_utcnow_iso(),
    )


@router.post(
    "/generate/offer-letter",
    response_model=ContentResponse,
    tags=["Content"],
    summary="Generate an offer letter",
)
async def generate_offer_letter(
    data: GenerateOfferLetterRequest,
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> ContentResponse:
    gen = ContentGenerator(tenant_id=tenant_id)
    content = await gen.generate_offer_letter(
        candidate_data=data.candidate_data,
        job_data=data.job_data,
        offer_terms=data.offer_terms,
    )
    return ContentResponse(
        content=content,
        content_type="offer_letter",
        tenant_id=tenant_id,
        created_at=_utcnow_iso(),
    )


@router.post(
    "/generate/rejection",
    response_model=ContentResponse,
    tags=["Content"],
    summary="Generate a rejection letter",
)
async def generate_rejection(
    data: GenerateRejectionRequest,
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> ContentResponse:
    gen = ContentGenerator(tenant_id=tenant_id)
    content = await gen.generate_rejection_letter(
        candidate_data=data.candidate_data,
        job_data=data.job_data,
        reason=data.reason,
    )
    return ContentResponse(
        content=content,
        content_type="rejection",
        tenant_id=tenant_id,
        created_at=_utcnow_iso(),
    )


@router.post(
    "/generate/linkedin-post",
    response_model=ContentResponse,
    tags=["Content"],
    summary="Generate a LinkedIn post",
)
async def generate_linkedin_post(
    data: GenerateLinkedInPostRequest,
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> ContentResponse:
    gen = ContentGenerator(tenant_id=tenant_id)
    content = await gen.generate_linkedin_post(
        job_data=data.job_data,
        tone=data.tone,
    )
    return ContentResponse(
        content=content,
        content_type="linkedin_post",
        tenant_id=tenant_id,
        created_at=_utcnow_iso(),
    )


# ── Template CRUD Endpoints ────────────────────────────────────────────────────


@router.get(
    "/templates",
    response_model=TemplateListResponse,
    tags=["Content Templates"],
    summary="List content templates",
)
async def list_templates(
    type_filter: Optional[str] = Query(default=None, alias="type"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
    db: AsyncSession = Depends(get_db_dependency),
) -> TemplateListResponse:
    stmt = (
        select(ContentTemplate)
        .where(ContentTemplate.tenant_id == tenant_id)
        .order_by(ContentTemplate.created_at.desc())
    )
    if type_filter:
        stmt = stmt.where(ContentTemplate.type == type_filter)
    stmt = stmt.offset(offset).limit(limit)

    rows = (await db.execute(stmt)).scalars().all()
    data = [_template_to_read(r) for r in rows]
    return TemplateListResponse(data=data, total=len(data))


@router.post(
    "/templates",
    response_model=TemplateRead,
    status_code=201,
    tags=["Content Templates"],
    summary="Create a content template",
)
async def create_template(
    body: TemplateCreate,
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
    db: AsyncSession = Depends(get_db_dependency),
) -> TemplateRead:
    valid_types = {"job_description", "email", "offer_letter", "rejection", "linkedin_post"}
    if body.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid template type: {body.type}")

    template = ContentTemplate(
        tenant_id=tenant_id,
        name=body.name,
        type=body.type,
        content=body.content,
        variables=body.variables,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return _template_to_read(template)


@router.put(
    "/templates/{template_id}",
    response_model=TemplateRead,
    tags=["Content Templates"],
    summary="Update a content template",
)
async def update_template(
    template_id: str,
    body: TemplateUpdate,
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
    db: AsyncSession = Depends(get_db_dependency),
) -> TemplateRead:
    stmt = select(ContentTemplate).where(
        ContentTemplate.id == template_id,
        ContentTemplate.tenant_id == tenant_id,
    )
    template = (await db.execute(stmt)).scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail=f"Template {template_id} not found")

    if body.name is not None:
        template.name = body.name
    if body.content is not None:
        template.content = body.content
    if body.variables is not None:
        template.variables = body.variables
    template.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.add(template)
    await db.commit()
    await db.refresh(template)
    return _template_to_read(template)


@router.delete(
    "/templates/{template_id}",
    tags=["Content Templates"],
    summary="Delete a content template",
)
async def delete_template(
    template_id: str,
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
    db: AsyncSession = Depends(get_db_dependency),
) -> dict[str, Any]:
    stmt = select(ContentTemplate).where(
        ContentTemplate.id == template_id,
        ContentTemplate.tenant_id == tenant_id,
    )
    template = (await db.execute(stmt)).scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail=f"Template {template_id} not found")

    await db.delete(template)
    await db.commit()
    return {"id": template_id, "deleted": True}
