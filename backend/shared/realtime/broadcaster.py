"""Real-time WebSocket broadcaster for AI-ROS.

Manages WebSocket connections, per-user and per-tenant rooms, and event
subscriptions.  Integrates with the shared :class:`EventDispatcher` so that
domain events (candidate created, job created, interview scheduled, …) are
pushed to the relevant clients in real time, with strict tenant isolation.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable

from fastapi import WebSocket

from shared.events.dispatcher import dispatcher
from shared.events.schemas import EventEnvelope


logger = logging.getLogger("realtime.broadcaster")


DASHBOARD_EVENT_TYPES: tuple[str, ...] = (
    "candidate.created",
    "candidate.updated",
    "job.created",
    "interview.scheduled",
    "pipeline.moved",
    "notification.created",
)

NOTIFICATION_EVENT_TYPES: tuple[str, ...] = (
    "notification.created",
)


def tenant_room(tenant_id: str) -> str:
    return f"tenant:{tenant_id}"


def user_room(tenant_id: str, user_id: str) -> str:
    return f"tenant:{tenant_id}:user:{user_id}"


def event_room(tenant_id: str, event_type: str) -> str:
    return f"tenant:{tenant_id}:event:{event_type}"


@dataclass
class Subscription:
    connection_id: str
    websocket: WebSocket
    tenant_id: str
    user_id: str
    rooms: set[str] = field(default_factory=set)
    subscribed_events: set[str] = field(default_factory=set)
    connected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class Broadcaster:
    """Process-wide WebSocket fan-out hub with tenant isolation.

    Connections are indexed by connection id, user id, tenant id and room id
    so that broadcasting an event is a constant-time lookup per room.  All
    sends happen best-effort: a failed ``send_json`` removes the connection
    so the next broadcast skips it.
    """

    def __init__(self) -> None:
        self._connections: dict[str, Subscription] = {}
        self._by_user: dict[str, set[str]] = defaultdict(set)
        self._by_tenant: dict[str, set[str]] = defaultdict(set)
        self._by_room: dict[str, set[str]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self._dispatcher_registered: set[str] = set()

    # ── Connection lifecycle ──────────────────────────────────────────────

    async def connect(
        self,
        websocket: WebSocket,
        tenant_id: str,
        user_id: str,
        extra_rooms: Iterable[str] | None = None,
    ) -> Subscription:
        await websocket.accept()
        connection_id = str(uuid.uuid4())
        sub = Subscription(
            connection_id=connection_id,
            websocket=websocket,
            tenant_id=tenant_id,
            user_id=user_id,
            rooms={tenant_room(tenant_id), user_room(tenant_id, user_id)},
        )
        for room in extra_rooms or ():
            if room.startswith(f"tenant:{tenant_id}"):
                sub.rooms.add(room)

        async with self._lock:
            self._connections[connection_id] = sub
            self._by_user[user_id].add(connection_id)
            self._by_tenant[tenant_id].add(connection_id)
            for room in sub.rooms:
                self._by_room[room].add(connection_id)
        return sub

    async def disconnect(self, connection_id: str) -> None:
        async with self._lock:
            sub = self._connections.pop(connection_id, None)
            if not sub:
                return
            self._by_user[sub.user_id].discard(connection_id)
            if not self._by_user[sub.user_id]:
                self._by_user.pop(sub.user_id, None)
            self._by_tenant[sub.tenant_id].discard(connection_id)
            if not self._by_tenant[sub.tenant_id]:
                self._by_tenant.pop(sub.tenant_id, None)
            for room in sub.rooms:
                self._by_room[room].discard(connection_id)
                if not self._by_room[room]:
                    self._by_room.pop(room, None)

    # ── Subscription / room management ──────────────────────────────────

    async def subscribe(self, connection_id: str, event_type: str) -> bool:
        if not event_type:
            return False
        async with self._lock:
            sub = self._connections.get(connection_id)
            if not sub:
                return False
            sub.subscribed_events.add(event_type)
            room = event_room(sub.tenant_id, event_type)
            if room not in sub.rooms:
                sub.rooms.add(room)
                self._by_room[room].add(connection_id)
            return True

    async def unsubscribe(self, connection_id: str, event_type: str) -> bool:
        async with self._lock:
            sub = self._connections.get(connection_id)
            if not sub:
                return False
            sub.subscribed_events.discard(event_type)
            room = event_room(sub.tenant_id, event_type)
            other_subs = {
                et for et in sub.subscribed_events if event_room(sub.tenant_id, et) == room
            }
            if not other_subs:
                self._by_room[room].discard(connection_id)
                if not self._by_room[room]:
                    self._by_room.pop(room, None)
                sub.rooms.discard(room)
            return True

    async def join_room(self, connection_id: str, room: str) -> bool:
        async with self._lock:
            sub = self._connections.get(connection_id)
            if not sub or not room.startswith(f"tenant:{sub.tenant_id}"):
                return False
            sub.rooms.add(room)
            self._by_room[room].add(connection_id)
            return True

    async def leave_room(self, connection_id: str, room: str) -> bool:
        async with self._lock:
            sub = self._connections.get(connection_id)
            if not sub:
                return False
            sub.rooms.discard(room)
            self._by_room[room].discard(connection_id)
            if not self._by_room[room]:
                self._by_room.pop(room, None)
            return True

    async def subscribe_many(
        self, connection_id: str, event_types: Iterable[str]
    ) -> list[str]:
        accepted: list[str] = []
        for et in event_types:
            if await self.subscribe(connection_id, et):
                accepted.append(et)
        return accepted

    # ── Dispatcher integration ──────────────────────────────────────────

    def register_with_dispatcher(self, event_types: Iterable[str]) -> None:
        for event_type in event_types:
            if event_type in self._dispatcher_registered:
                continue
            dispatcher.register(event_type, self._make_handler(event_type))
            self._dispatcher_registered.add(event_type)

    def _make_handler(self, event_type: str):
        async def _handler(event: EventEnvelope) -> None:
            if event.event_type != event_type:
                return
            try:
                await self.handle_event(event)
            except Exception as exc:
                logger.exception("Failed to broadcast %s: %s", event_type, exc)

        _handler.__name__ = f"broadcaster_handle_{event_type.replace('.', '_')}"
        return _handler

    async def handle_event(self, event: EventEnvelope) -> None:
        room = event_room(event.tenant_id, event.event_type)
        recipients = self._connections_in_rooms(
            (tenant_room(event.tenant_id), room)
        )
        await self._fan_out(recipients, event)

    # ── Direct broadcast API ────────────────────────────────────────────

    async def broadcast_to_tenant(
        self, tenant_id: str, message: dict[str, Any]
    ) -> int:
        recipients = self._connections_in_rooms((tenant_room(tenant_id),))
        await self._fan_out(recipients, message)
        return len(recipients)

    async def broadcast_to_user(
        self, tenant_id: str, user_id: str, message: dict[str, Any]
    ) -> int:
        recipients = self._connections_in_rooms((user_room(tenant_id, user_id),))
        await self._fan_out(recipients, message)
        return len(recipients)

    async def send_personal(
        self, connection_id: str, message: dict[str, Any]
    ) -> bool:
        sub = self._connections.get(connection_id)
        if not sub:
            return False
        try:
            await sub.websocket.send_json(message)
            return True
        except Exception:
            await self.disconnect(connection_id)
            return False

    # ── Internals ───────────────────────────────────────────────────────

    def _connections_in_rooms(
        self, rooms: Iterable[str]
    ) -> list[Subscription]:
        seen: set[str] = set()
        out: list[Subscription] = []
        for room in rooms:
            for cid in self._by_room.get(room, ()):
                if cid in seen:
                    continue
                seen.add(cid)
                sub = self._connections.get(cid)
                if sub is not None:
                    out.append(sub)
        return out

    async def _fan_out(
        self,
        recipients: list[Subscription],
        event_or_msg: EventEnvelope | dict[str, Any],
    ) -> None:
        if not recipients:
            return
        if isinstance(event_or_msg, EventEnvelope):
            ts = event_or_msg.timestamp
            payload: dict[str, Any] = {
                "type": "event",
                "event_type": event_or_msg.event_type,
                "event_id": event_or_msg.event_id,
                "tenant_id": event_or_msg.tenant_id,
                "payload": event_or_msg.payload,
                "metadata": event_or_msg.metadata,
                "timestamp": ts.isoformat() if isinstance(ts, datetime) else str(ts),
            }
        else:
            payload = event_or_msg

        dead: list[str] = []
        for sub in recipients:
            try:
                await sub.websocket.send_json(payload)
            except Exception:
                dead.append(sub.connection_id)
        for cid in dead:
            await self.disconnect(cid)

    # ── Stats / introspection ───────────────────────────────────────────

    def stats(self) -> dict[str, Any]:
        return {
            "total_connections": len(self._connections),
            "tenants": len(self._by_tenant),
            "users": len(self._by_user),
            "rooms": len(self._by_room),
        }

    def connections_for_tenant(self, tenant_id: str) -> list[dict[str, Any]]:
        return [
            {
                "connection_id": sub.connection_id,
                "user_id": sub.user_id,
                "rooms": sorted(sub.rooms),
                "subscribed_events": sorted(sub.subscribed_events),
                "connected_at": sub.connected_at.isoformat(),
            }
            for sub in self._connections.values()
            if sub.tenant_id == tenant_id
        ]

    async def reset(self) -> None:
        async with self._lock:
            self._connections.clear()
            self._by_user.clear()
            self._by_tenant.clear()
            self._by_room.clear()
            self._dispatcher_registered.clear()


broadcaster = Broadcaster()
