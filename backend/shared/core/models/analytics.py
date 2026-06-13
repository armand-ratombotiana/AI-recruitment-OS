"""Analytics domain models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field as SQLField


class Metric(SQLModel, table=True):
    __tablename__ = "metrics"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str
    value: float
    dimensions: str = "{}"
    timestamp: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Dashboard(SQLModel, table=True):
    __tablename__ = "dashboards"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str
    description: Optional[str] = None
    widgets: str = "[]"
    layout: str = "{}"
    created_by: str
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Report(SQLModel, table=True):
    __tablename__ = "reports"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str
    type: str
    status: str = "pending"
    result: str = "{}"
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
