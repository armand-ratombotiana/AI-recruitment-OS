from __future__ import annotations
from typing import Callable
from shared.events.schemas import EventEnvelope

class EventDispatcher:
    def __init__(self):
        self._handlers: dict[str, list[Callable]] = {}
    def register(self, event_type: str, handler: Callable):
        self._handlers.setdefault(event_type, []).append(handler)
    async def dispatch(self, event: EventEnvelope):
        for handler in self._handlers.get(event.event_type, []):
            try:
                await handler(event)
            except Exception:
                pass

class _EventStore:
    def __init__(self):
        self._events: list[EventEnvelope] = []

    def append(self, event: EventEnvelope) -> None:
        self._events.append(event)

    def get_all(self) -> list[EventEnvelope]:
        return list(self._events)

    def clear(self) -> None:
        self._events.clear()

event_store = _EventStore()
