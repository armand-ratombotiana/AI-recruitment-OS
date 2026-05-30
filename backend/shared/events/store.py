"""Event store for AI-ROS."""
from __future__ import annotations
from typing import Any
from shared.events.schemas import EventEnvelope

class EventStore:
    """In-memory event store (replace with database in production)."""

    def __init__(self):
        self._events: list[EventEnvelope] = []

    async def append(self, event: EventEnvelope):
        self._events.append(event)

    async def get_events(self, event_type: str | None = None, limit: int = 100) -> list[EventEnvelope]:
        events = self._events
        if event_type:
            events = [e for e in events if e.event_type == event_type]
        return events[-limit:]

    async def get_events_by_aggregate(self, aggregate_id: str) -> list[EventEnvelope]:
        return [e for e in self._events if e.payload.get("aggregate_id") == aggregate_id]

event_store = EventStore()
