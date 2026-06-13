"""Referral domain — Referral and ReferralProgram models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field
from sqlmodel import SQLModel, Field as SQLField, Column
from sqlalchemy import JSON


class ReferralStatus(str, Enum):
    PENDING = "pending"
    HIRED = "hired"
    REJECTED = "rejected"


class RewardType(str, Enum):
    FIXED = "fixed"
    PERCENTAGE = "percentage"


class Referral(SQLModel, table=True):
    __tablename__ = "referrals"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    referrer_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    job_id: str = SQLField(index=True)
    status: ReferralStatus = ReferralStatus.PENDING
    reward_amount: float = SQLField(default=0.0)
    reward_paid: bool = False
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class ReferralProgram(SQLModel, table=True):
    __tablename__ = "referral_programs"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True, unique=True)
    name: str
    reward_amount: float = SQLField(default=0.0)
    reward_type: RewardType = RewardType.FIXED
    conditions: dict[str, Any] = SQLField(default_factory=dict, sa_column=Column(JSON))
    active: bool = True
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


# ── API Schemas ──

class ReferralCreate(BaseModel):
    referrer_id: str = Field(..., description="ID of the referrer (employee)")
    candidate_id: str = Field(..., description="ID of the referred candidate")
    job_id: str = Field(..., description="ID of the job the candidate is referred for")


class ReferralRead(BaseModel):
    id: str
    tenant_id: str
    referrer_id: str
    candidate_id: str
    job_id: str
    status: ReferralStatus
    reward_amount: float
    reward_paid: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReferralUpdate(BaseModel):
    status: ReferralStatus | None = None
    reward_paid: bool | None = None


class ReferralListResponse(BaseModel):
    data: list[ReferralRead]
    total: int
    page: int
    page_size: int


class ReferralProgramRead(BaseModel):
    id: str
    tenant_id: str
    name: str
    reward_amount: float
    reward_type: RewardType
    conditions: dict[str, Any]
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReferralProgramCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    reward_amount: float = Field(..., ge=0)
    reward_type: RewardType = RewardType.FIXED
    conditions: dict[str, Any] = Field(default_factory=dict)
    active: bool = True


class ReferralProgramUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    reward_amount: float | None = Field(None, ge=0)
    reward_type: RewardType | None = None
    conditions: dict[str, Any] | None = None
    active: bool | None = None


class ReferralStats(BaseModel):
    total_referrals: int
    pending_referrals: int
    hired_referrals: int
    rejected_referrals: int
    total_rewards_paid: float
    total_rewards_pending: float
    conversion_rate: float
