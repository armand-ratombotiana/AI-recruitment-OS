"""Referral Service — Candidate referral program with rewards and statistics."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db_dependency
from shared.core.models.referral import (
    Referral,
    ReferralCreate,
    ReferralListResponse,
    ReferralProgram,
    ReferralProgramRead,
    ReferralProgramUpdate,
    ReferralRead,
    ReferralStats,
    ReferralStatus,
    ReferralUpdate,
    RewardStatus,
)
from shared.core.security import require_tenant
from shared.auth.dependencies import require_member

logger = logging.getLogger(__name__)

router = APIRouter()


def _referral_to_read(r: Referral) -> ReferralRead:
    return ReferralRead(
        id=r.id,
        tenant_id=r.tenant_id,
        referrer_user_id=r.referrer_user_id,
        candidate_id=r.candidate_id,
        job_id=r.job_id,
        status=r.status,
        reward_amount=r.reward_amount,
        reward_currency=r.reward_currency,
        reward_status=r.reward_status,
        notes=r.notes,
        created_at=r.created_at,
        resolved_at=r.resolved_at,
    )


@router.get(
    "/stats",
    response_model=ReferralStats,
    tags=["Referrals"],
    summary="Get referral statistics",
)
async def get_referral_stats(
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    _member: dict = Depends(require_member),
) -> ReferralStats:
    base = select(Referral).where(Referral.tenant_id == tenant_id)

    total_result = await db.execute(
        select(func.count()).select_from(Referral).where(Referral.tenant_id == tenant_id)
    )
    total = total_result.scalar_one()

    pending_result = await db.execute(
        select(func.count()).select_from(Referral).where(
            Referral.tenant_id == tenant_id, Referral.status == ReferralStatus.PENDING
        )
    )
    pending = pending_result.scalar_one()

    under_review_result = await db.execute(
        select(func.count()).select_from(Referral).where(
            Referral.tenant_id == tenant_id, Referral.status == ReferralStatus.UNDER_REVIEW
        )
    )
    under_review = under_review_result.scalar_one()

    hired_result = await db.execute(
        select(func.count()).select_from(Referral).where(
            Referral.tenant_id == tenant_id, Referral.status == ReferralStatus.HIRED
        )
    )
    hired = hired_result.scalar_one()

    rejected_result = await db.execute(
        select(func.count()).select_from(Referral).where(
            Referral.tenant_id == tenant_id, Referral.status == ReferralStatus.REJECTED
        )
    )
    rejected = rejected_result.scalar_one()

    paid_result = await db.execute(
        select(func.coalesce(func.sum(Referral.reward_amount), 0.0)).where(
            Referral.tenant_id == tenant_id, Referral.reward_status == RewardStatus.PAID
        )
    )
    total_paid = paid_result.scalar_one()

    pending_reward_result = await db.execute(
        select(func.coalesce(func.sum(Referral.reward_amount), 0.0)).where(
            Referral.tenant_id == tenant_id, Referral.reward_status == RewardStatus.PENDING
        )
    )
    total_pending_rewards = pending_reward_result.scalar_one()

    conversion = round(hired / total, 4) if total > 0 else 0.0

    return ReferralStats(
        total_referrals=total,
        pending_referrals=pending,
        under_review_referrals=under_review,
        hired_referrals=hired,
        rejected_referrals=rejected,
        total_rewards_paid=float(total_paid),
        total_rewards_pending=float(total_pending_rewards),
        conversion_rate=conversion,
    )


@router.get(
    "/program",
    response_model=ReferralProgramRead,
    tags=["Referrals"],
    summary="Get active referral program",
)
async def get_program(
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    _member: dict = Depends(require_member),
) -> ReferralProgramRead:
    result = await db.execute(
        select(ReferralProgram).where(ReferralProgram.tenant_id == tenant_id)
    )
    program = result.scalar_one_or_none()
    if not program:
        program = ReferralProgram(tenant_id=tenant_id)
        db.add(program)
        await db.flush()
        await db.refresh(program)
    return ReferralProgramRead.model_validate(program)


@router.put(
    "/program",
    response_model=ReferralProgramRead,
    tags=["Referrals"],
    summary="Update referral program config",
)
async def update_program(
    payload: ReferralProgramUpdate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    _member: dict = Depends(require_member),
) -> ReferralProgramRead:
    result = await db.execute(
        select(ReferralProgram).where(ReferralProgram.tenant_id == tenant_id)
    )
    program = result.scalar_one_or_none()
    if not program:
        program = ReferralProgram(tenant_id=tenant_id)
        db.add(program)
        await db.flush()

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(program, field, value)

    db.add(program)
    await db.flush()
    await db.refresh(program)
    return ReferralProgramRead.model_validate(program)


@router.get(
    "/",
    response_model=ReferralListResponse,
    tags=["Referrals"],
    summary="List referrals",
)
async def list_referrals(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    _member: dict = Depends(require_member),
) -> ReferralListResponse:
    query = select(Referral).where(Referral.tenant_id == tenant_id)
    count_query = select(func.count()).select_from(Referral).where(Referral.tenant_id == tenant_id)

    if status_filter:
        query = query.where(Referral.status == status_filter)
        count_query = count_query.where(Referral.status == status_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(Referral.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    referrals = result.scalars().all()

    return ReferralListResponse(
        data=[_referral_to_read(r) for r in referrals],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/",
    response_model=ReferralRead,
    status_code=status.HTTP_201_CREATED,
    tags=["Referrals"],
    summary="Create referral",
)
async def create_referral(
    payload: ReferralCreate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    _member: dict = Depends(require_member),
) -> ReferralRead:
    existing = await db.execute(
        select(Referral).where(
            Referral.tenant_id == tenant_id,
            Referral.referrer_user_id == payload.referrer_user_id,
            Referral.candidate_id == payload.candidate_id,
            Referral.job_id == payload.job_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A referral for this candidate and job by this referrer already exists",
        )

    program_result = await db.execute(
        select(ReferralProgram).where(ReferralProgram.tenant_id == tenant_id)
    )
    program = program_result.scalar_one_or_none()

    reward_amount = program.reward_amount if program else 0.0
    reward_currency = program.reward_currency if program else "USD"

    referral = Referral(
        tenant_id=tenant_id,
        referrer_user_id=payload.referrer_user_id,
        candidate_id=payload.candidate_id,
        job_id=payload.job_id,
        notes=payload.notes,
        reward_amount=reward_amount,
        reward_currency=reward_currency,
    )
    db.add(referral)
    await db.flush()
    await db.refresh(referral)
    return _referral_to_read(referral)


@router.get(
    "/{referral_id}",
    response_model=ReferralRead,
    tags=["Referrals"],
    summary="Get referral details",
)
async def get_referral(
    referral_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    _member: dict = Depends(require_member),
) -> ReferralRead:
    result = await db.execute(
        select(Referral).where(
            Referral.id == referral_id, Referral.tenant_id == tenant_id
        )
    )
    referral = result.scalar_one_or_none()
    if not referral:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Referral not found")
    return _referral_to_read(referral)


@router.put(
    "/{referral_id}",
    response_model=ReferralRead,
    tags=["Referrals"],
    summary="Update referral status",
)
async def update_referral(
    referral_id: str,
    payload: ReferralUpdate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    _member: dict = Depends(require_member),
) -> ReferralRead:
    result = await db.execute(
        select(Referral).where(
            Referral.id == referral_id, Referral.tenant_id == tenant_id
        )
    )
    referral = result.scalar_one_or_none()
    if not referral:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Referral not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(referral, field, value)

    if payload.status in (ReferralStatus.HIRED, ReferralStatus.REJECTED):
        referral.resolved_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.add(referral)
    await db.flush()
    await db.refresh(referral)
    return _referral_to_read(referral)


@router.delete(
    "/{referral_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Referrals"],
    summary="Delete referral",
)
async def delete_referral(
    referral_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    _member: dict = Depends(require_member),
):
    result = await db.execute(
        select(Referral).where(
            Referral.id == referral_id, Referral.tenant_id == tenant_id
        )
    )
    referral = result.scalar_one_or_none()
    if not referral:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Referral not found")

    await db.delete(referral)
    await db.flush()
