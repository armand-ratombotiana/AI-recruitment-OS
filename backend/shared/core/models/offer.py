"""Offer management and e-signature domain models."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from sqlmodel import SQLModel, Field as SQLField


class OfferStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    EXPIRED = "expired"


class Offer(SQLModel, table=True):
    __tablename__ = "offers"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    job_id: str = SQLField(index=True)
    status: str = SQLField(default=OfferStatus.DRAFT.value, index=True)
    salary: float | None = SQLField(default=None)
    equity: float | None = SQLField(default=None)
    start_date: str | None = SQLField(default=None)
    expiration_date: str | None = SQLField(default=None)
    terms: str = SQLField(default="{}")
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    sent_at: datetime | None = SQLField(default=None)
    accepted_at: datetime | None = SQLField(default=None)
    signature_data: str | None = SQLField(default=None)
    signed_at: datetime | None = SQLField(default=None)


class OfferTemplate(SQLModel, table=True):
    __tablename__ = "offer_templates"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str = SQLField(index=True)
    content: str = SQLField(default="")
    variables: str = SQLField(default="{}")
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
