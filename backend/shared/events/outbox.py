"""Transactional outbox pattern for reliable event publishing."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field
from shared.events.schemas import EventEnvelope

class OutboxEntry(SQLModel):
    __tablename__ = "outbox_entries"
    id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()), primary_key=True)
    aggregate_type: str
    aggregate_id: str
    event_type: str
    payload: str
    tenant_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    published: bool = False
    published_at: datetime | None = None
    retry_count: int = 0

async def append_to_outbox(session, event: EventEnvelope, aggregate_type: str, aggregate_id: str):
    entry = OutboxEntry(
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        event_type=event.event_type,
        payload=json.dumps(event.payload),
        tenant_id=event.tenant_id,
    )
    session.add(entry)
    await session.flush()
