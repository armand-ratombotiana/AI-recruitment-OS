"""Event dispatcher for AI-ROS."""
from __future__ import annotations
from typing import Any, Callable, Coroutine
from shared.events.schemas import EventEnvelope

class EventDispatcher:
    """Event dispatcher with handler registration and dispatch."""

    def __init__(self):
        self._handlers: dict[str, list[Callable]] = {}
        self._event_log: list[EventEnvelope] = []

    def register(self, event_type: str, handler: Callable):
        if event_type not in self._handlers:
            self._handlers[event_type] = []
        self._handlers[event_type].append(handler)

    async def dispatch(self, event: EventEnvelope):
        self._event_log.append(event)
        handlers = self._handlers.get(event.event_type, [])
        for handler in handlers:
            try:
                await handler(event)
            except Exception:
                pass

    def get_events(self, event_type: str | None = None) -> list[EventEnvelope]:
        if event_type:
            return [e for e in self._event_log if e.event_type == event_type]
        return self._event_log

dispatcher = EventDispatcher()
