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
    UNDER_REVIEW = "under_review"
    HIRED = "hired"
    REJECTED = "rejected"


class RewardStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"


class RewardType(str, Enum):
    CASH = "cash"
    BONUS = "bonus"
    GIFT = "gift"
    EQUITY = "equity"


class Referral(SQLModel, table=True):
    __tablename__ = "referrals"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    referrer_user_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    job_id: str = SQLField(index=True)
    status: ReferralStatus = SQLField(default=ReferralStatus.PENDING)
    reward_amount: float = SQLField(default=0.0)
    reward_currency: str = SQLField(default="USD")
    reward_status: RewardStatus = SQLField(default=RewardStatus.PENDING)
    notes: str | None = SQLField(default=None)
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    resolved_at: datetime | None = SQLField(default=None)


class ReferralProgram(SQLModel, table=True):
    __tablename__ = "referral_programs"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True, unique=True)
    name: str = SQLField(default="Employee Referral Program")
    description: str | None = SQLField(default=None)
    reward_amount: float = SQLField(default=0.0)
    reward_currency: str = SQLField(default="USD")
    conditions: dict[str, Any] = SQLField(default_factory=dict, sa_column=Column(JSON))
    active: bool = SQLField(default=True)
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


# ── API Schemas ──


class ReferralCreate(BaseModel):
    referrer_user_id: str = Field(..., description="ID of the referrer (employee)")
    candidate_id: str = Field(..., description="ID of the referred candidate")
    job_id: str = Field(..., description="ID of the job the candidate is referred for")
    notes: str | None = Field(None, description="Optional notes about the referral")


class ReferralRead(BaseModel):
    id: str
    tenant_id: str
    referrer_user_id: str
    candidate_id: str
    job_id: str
    status: ReferralStatus
    reward_amount: float
    reward_currency: str
    reward_status: RewardStatus
    notes: str | None
    created_at: datetime
    resolved_at: datetime | None

    model_config = {"from_attributes": True}


class ReferralUpdate(BaseModel):
    status: ReferralStatus | None = None
    reward_status: RewardStatus | None = None
    reward_amount: float | None = Field(None, ge=0)
    reward_currency: str | None = None
    notes: str | None = None


class ReferralListResponse(BaseModel):
    data: list[ReferralRead]
    total: int
    page: int
    page_size: int


class ReferralProgramRead(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: str | None
    reward_amount: float
    reward_currency: str
    conditions: dict[str, Any]
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ReferralProgramCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    reward_amount: float = Field(0.0, ge=0)
    reward_currency: str = "USD"
    conditions: dict[str, Any] | None = None
    active: bool = True


class ReferralProgramUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    reward_amount: float | None = Field(None, ge=0)
    reward_currency: str | None = None
    conditions: dict[str, Any] | None = None
    active: bool | None = None


class ReferralStats(BaseModel):
    total_referrals: int
    pending_referrals: int
    under_review_referrals: int
    hired_referrals: int
    rejected_referrals: int
    total_rewards_paid: float
    total_rewards_pending: float
    conversion_rate: float
