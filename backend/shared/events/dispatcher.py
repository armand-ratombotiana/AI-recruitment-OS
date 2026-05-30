"""Event dispatcher for AI-ROS."""
from __future__ import annotations
from typing import Any, Callable
from shared.events.schemas import EventEnvelope

class EventDispatcher:
    def __init__(self):
        self._handlers: dict[str, list[Callable]] = {}
        self._event_log: list[EventEnvelope] = []

    def register(self, event_type: str, handler: Callable):
        self._handlers.setdefault(event_type, []).append(handler)

    async def dispatch(self, event: EventEnvelope):
        self._event_log.append(event)
        for handler in self._handlers.get(event.event_type, []):
            try:
                await handler(event)
            except Exception:
                pass

    def get_events(self, event_type: str | None = None, limit: int = 100) -> list[EventEnvelope]:
        events = self._event_log
        if event_type:
            events = [e for e in self._event_log if e.event_type == event_type]
        return events[-limit:]

dispatcher = EventDispatcher()
