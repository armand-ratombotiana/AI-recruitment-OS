"""Internal event emission for the billing service.

Events are dispatched through the shared event dispatcher when it is
available; otherwise they are buffered in a per-process list so that
tests can assert on them.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("billing.events")


# Buffered events (for tests / when the global dispatcher is unavailable).
_BUFFERED: list[dict[str, Any]] = []


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def emit(event_type: str, tenant_id: str, payload: dict[str, Any]) -> None:
    """Dispatch a billing event.

    Tries the shared dispatcher first; falls back to a local in-memory buffer
    so the service is always importable (e.g. during test collection).
    """
    record = {
        "event_id": f"evt_bill_{len(_BUFFERED) + 1}",
        "event_type": event_type,
        "tenant_id": tenant_id,
        "payload": payload,
        "timestamp": _utcnow().isoformat(),
    }
    _BUFFERED.append(record)
    try:
        from shared.events.dispatcher import dispatcher
        from shared.events.schemas import EventEnvelope, build_event
        env = build_event(event_type=event_type, tenant_id=tenant_id, payload=payload)
        # build_event is sync; the dispatcher is async but exposes a sync
        # fallback by appending to its internal log. We schedule the async
        # dispatch if a running loop is available, otherwise we just record.
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(dispatcher.dispatch(env))
            else:
                dispatcher._event_log.append(env)  # type: ignore[attr-defined]
        except RuntimeError:
            dispatcher._event_log.append(env)  # type: ignore[attr-defined]
    except Exception as exc:
        logger.debug("Could not dispatch via shared dispatcher: %s", exc)


def get_buffered() -> list[dict[str, Any]]:
    return list(_BUFFERED)


def get_buffered_by_type(event_type: str) -> list[dict[str, Any]]:
    return [e for e in _BUFFERED if e["event_type"] == event_type]


def clear_buffered() -> None:
    _BUFFERED.clear()
