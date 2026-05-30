from __future__ import annotations
import uuid
from datetime import datetime, timezone
from pydantic import BaseModel, Field

class EventEnvelope(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    tenant_id: str
    payload: dict = {}

def build_event(event_type: str, tenant_id: str, payload: dict) -> EventEnvelope:
    return EventEnvelope(event_type=event_type, tenant_id=tenant_id, payload=payload)
