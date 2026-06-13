"""Offer Service — CRUD, lifecycle, e-signatures, and templates."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db_dependency
from shared.core.models.offer import Offer, OfferStatus, OfferTemplate
from shared.auth.dependencies import require_tenant_id, require_member

logger = logging.getLogger(__name__)

router = APIRouter()


class OfferCreateRequest(BaseModel):
    candidate_id: str
    job_id: str
    salary: float | None = None
    equity: float | None = None
    start_date: str | None = None
    expiration_date: str | None = None
    terms: dict[str, Any] = Field(default_factory=dict)


class OfferUpdateRequest(BaseModel):
    salary: float | None = None
    equity: float | None = None
    start_date: str | None = None
    expiration_date: str | None = None
    terms: dict[str, Any] | None = None


class OfferResponse(BaseModel):
    id: str
    tenant_id: str
    candidate_id: str
    job_id: str
    status: str
    salary: float | None = None
    equity: float | None = None
    start_date: str | None = None
    expiration_date: str | None = None
    terms: dict[str, Any] = {}
    created_at: datetime
    sent_at: datetime | None = None
    accepted_at: datetime | None = None
    signature_data: str | None = None
    signed_at: datetime | None = None

    model_config = {"from_attributes": True}


class OfferListResponse(BaseModel):
    data: list[OfferResponse]
    total: int
    page: int
    page_size: int


class SignRequest(BaseModel):
    signature_data: str = Field(..., description="Base64 encoded signature or signer identifier")


class TemplateCreateRequest(BaseModel):
    name: str
    content: str = ""
    variables: dict[str, Any] = Field(default_factory=dict)


class TemplateResponse(BaseModel):
    id: str
    tenant_id: str
    name: str
    content: str
    variables: dict[str, Any] = {}
    created_at: datetime

    model_config = {"from_attributes": True}


class TemplateListResponse(BaseModel):
    data: list[TemplateResponse]
    total: int


def _parse_terms(terms_str: str) -> dict[str, Any]:
    try:
        return json.loads(terms_str) if terms_str else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def _parse_variables(vars_str: str) -> dict[str, Any]:
    try:
        return json.loads(vars_str) if vars_str else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def _offer_to_response(offer: Offer) -> OfferResponse:
    return OfferResponse(
        id=offer.id,
        tenant_id=offer.tenant_id,
        candidate_id=offer.candidate_id,
        job_id=offer.job_id,
        status=offer.status,
        salary=offer.salary,
        equity=offer.equity,
        start_date=offer.start_date,
        expiration_date=offer.expiration_date,
        terms=_parse_terms(offer.terms),
        created_at=offer.created_at,
        sent_at=offer.sent_at,
        accepted_at=offer.accepted_at,
        signature_data=offer.signature_data,
        signed_at=offer.signed_at,
    )


def _template_to_response(tpl: OfferTemplate) -> TemplateResponse:
    return TemplateResponse(
        id=tpl.id,
        tenant_id=tpl.tenant_id,
        name=tpl.name,
        content=tpl.content,
        variables=_parse_variables(tpl.variables),
        created_at=tpl.created_at,
    )


@router.get("", response_model=OfferListResponse, tags=["Offers"])
async def list_offers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
):
    query = select(Offer).where(Offer.tenant_id == tenant_id)
    count_query = select(func.count()).select_from(Offer).where(Offer.tenant_id == tenant_id)

    if status_filter:
        query = query.where(Offer.status == status_filter)
        count_query = count_query.where(Offer.status == status_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(Offer.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    offers = result.scalars().all()

    return OfferListResponse(
        data=[_offer_to_response(o) for o in offers],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=OfferResponse, status_code=status.HTTP_201_CREATED, tags=["Offers"])
async def create_offer(
    data: OfferCreateRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _user: dict = Depends(require_member),
):
    offer = Offer(
        tenant_id=tenant_id,
        candidate_id=data.candidate_id,
        job_id=data.job_id,
        salary=data.salary,
        equity=data.equity,
        start_date=data.start_date,
        expiration_date=data.expiration_date,
        terms=json.dumps(data.terms),
    )
    db.add(offer)
    await db.flush()
    await db.refresh(offer)
    return _offer_to_response(offer)


@router.get("/templates", response_model=TemplateListResponse, tags=["Offers"])
async def list_templates(
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
):
    result = await db.execute(
        select(OfferTemplate).where(OfferTemplate.tenant_id == tenant_id).order_by(OfferTemplate.created_at.desc())
    )
    templates = result.scalars().all()
    total_result = await db.execute(
        select(func.count()).select_from(OfferTemplate).where(OfferTemplate.tenant_id == tenant_id)
    )
    total = total_result.scalar_one()
    return TemplateListResponse(
        data=[_template_to_response(t) for t in templates],
        total=total,
    )


@router.post("/templates", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED, tags=["Offers"])
async def create_template(
    data: TemplateCreateRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _user: dict = Depends(require_member),
):
    tpl = OfferTemplate(
        tenant_id=tenant_id,
        name=data.name,
        content=data.content,
        variables=json.dumps(data.variables),
    )
    db.add(tpl)
    await db.flush()
    await db.refresh(tpl)
    return _template_to_response(tpl)


@router.get("/{offer_id}", response_model=OfferResponse, tags=["Offers"])
async def get_offer(
    offer_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
):
    result = await db.execute(
        select(Offer).where(Offer.id == offer_id, Offer.tenant_id == tenant_id)
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    return _offer_to_response(offer)


@router.put("/{offer_id}", response_model=OfferResponse, tags=["Offers"])
async def update_offer(
    offer_id: str,
    data: OfferUpdateRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _user: dict = Depends(require_member),
):
    result = await db.execute(
        select(Offer).where(Offer.id == offer_id, Offer.tenant_id == tenant_id)
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    if offer.status != OfferStatus.DRAFT.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only draft offers can be updated")

    update_data = data.model_dump(exclude_unset=True)
    if "terms" in update_data and update_data["terms"] is not None:
        offer.terms = json.dumps(update_data.pop("terms"))
    else:
        update_data.pop("terms", None)

    for field, value in update_data.items():
        setattr(offer, field, value)

    db.add(offer)
    await db.flush()
    await db.refresh(offer)
    return _offer_to_response(offer)


@router.post("/{offer_id}/send", response_model=OfferResponse, tags=["Offers"])
async def send_offer(
    offer_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _user: dict = Depends(require_member),
):
    result = await db.execute(
        select(Offer).where(Offer.id == offer_id, Offer.tenant_id == tenant_id)
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    if offer.status != OfferStatus.DRAFT.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only draft offers can be sent")

    offer.status = OfferStatus.SENT.value
    offer.sent_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(offer)
    await db.flush()
    await db.refresh(offer)
    return _offer_to_response(offer)


@router.post("/{offer_id}/accept", response_model=OfferResponse, tags=["Offers"])
async def accept_offer(
    offer_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
):
    result = await db.execute(
        select(Offer).where(Offer.id == offer_id, Offer.tenant_id == tenant_id)
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    if offer.status != OfferStatus.SENT.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only sent offers can be accepted")

    offer.status = OfferStatus.ACCEPTED.value
    offer.accepted_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(offer)
    await db.flush()
    await db.refresh(offer)
    return _offer_to_response(offer)


@router.post("/{offer_id}/decline", response_model=OfferResponse, tags=["Offers"])
async def decline_offer(
    offer_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
):
    result = await db.execute(
        select(Offer).where(Offer.id == offer_id, Offer.tenant_id == tenant_id)
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    if offer.status != OfferStatus.SENT.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only sent offers can be declined")

    offer.status = OfferStatus.DECLINED.value
    db.add(offer)
    await db.flush()
    await db.refresh(offer)
    return _offer_to_response(offer)


@router.post("/{offer_id}/sign", response_model=OfferResponse, tags=["Offers"])
async def sign_offer(
    offer_id: str,
    data: SignRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
):
    result = await db.execute(
        select(Offer).where(Offer.id == offer_id, Offer.tenant_id == tenant_id)
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    if offer.status not in (OfferStatus.SENT.value, OfferStatus.ACCEPTED.value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Offer must be sent or accepted to sign")

    offer.signature_data = data.signature_data
    offer.signed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(offer)
    await db.flush()
    await db.refresh(offer)
    return _offer_to_response(offer)
