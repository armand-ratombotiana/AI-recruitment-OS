"""WebSocket Service — Real-time collaboration via WebSocket connections."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from shared.core.security import decode_token, require_tenant, require_user
from shared.realtime.broadcaster import broadcaster
from shared.collaboration.manager import collaboration_manager, CollaborationRoom


# ── In-Memory Store ─────────────────────────────────────────────────────────────

_connections: dict[str, dict[str, Any]] = {}
_broadcast_log: list[dict[str, Any]] = []


# ── Connection Manager ──────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        _connections[client_id] = {
            "client_id": client_id,
            "connected_at": datetime.now(timezone.utc).isoformat(),
            "status": "connected",
        }

    def disconnect(self, client_id: str):
        self.active_connections.pop(client_id, None)
        if client_id in _connections:
            _connections[client_id]["status"] = "disconnected"
            _connections[client_id]["disconnected_at"] = datetime.now(timezone.utc).isoformat()

    async def send_personal(self, client_id: str, message: dict[str, Any]):
        ws = self.active_connections.get(client_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                pass

    async def broadcast(self, message: dict[str, Any]):
        for client_id, ws in self.active_connections.items():
            try:
                await ws.send_json(message)
            except Exception:
                pass


manager = ConnectionManager()


# ── Channel → event-type mapping for the dashboard ────────────────────────────

DASHBOARD_CHANNELS: dict[str, tuple[str, ...]] = {
    "candidates": (
        "candidate.created",
        "candidate.updated",
        "candidate.enriched",
        "candidate.ranked",
    ),
    "jobs": (
        "job.created",
        "job.updated",
        "job.opened",
    ),
    "interviews": (
        "interview.scheduled",
        "interview.started",
        "interview.completed",
    ),
    "applications": (
        "application.submitted",
        "application.stage_changed",
    ),
    "evaluations": (
        "evaluation.started",
        "evaluation.completed",
        "evaluation.explained",
    ),
    "ppe": (
        "ppe.session_created",
        "ppe.code_executed",
        "ppe.evaluated",
    ),
    "notifications": (
        "notification.created",
        "notification.sent",
        "notification.delivered",
    ),
    "workflows": (
        "workflow.triggered",
        "workflow.step_completed",
        "workflow.approved",
    ),
    "ai": (
        "ai.agent_spawned",
        "ai.task_completed",
    ),
}


# ── Request Models ──────────────────────────────────────────────────────────────

class BroadcastRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Message to broadcast")
    sender: str = Field(default="system", description="Sender identifier")
    msg_type: str = Field(default="broadcast", description="Message type")


class DashboardBroadcastRequest(BaseModel):
    event: str = Field(..., min_length=1, description="Event name, e.g. candidate.created")
    data: dict[str, Any] = Field(default_factory=dict, description="Event payload")
    tenant_id: str | None = Field(
        default=None, description="Optional tenant id; omit to broadcast globally"
    )


# ── Collaboration Models ──────────────────────────────────────────────────────────

class CreateRoomRequest(BaseModel):
    room_id: str = Field(..., min_length=1, max_length=64, description="Unique room identifier")
    name: str | None = Field(default=None, description="Optional room name")


class JoinRoomRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="User identifier")
    user_info: dict[str, Any] = Field(default_factory=dict, description="User metadata (name, color, etc.)")


class CursorMoveRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="User identifier")
    cursor: dict[str, Any] = Field(..., description="Cursor position data (x, y, offset, etc.)")


class SelectionChangeRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="User identifier")
    selection: dict[str, Any] = Field(..., description="Text selection data (start, end, etc.)")


class ContentChangeRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="User identifier")
    operation: dict[str, Any] = Field(..., description="Operational transform / CRDT operation")
    version: int = Field(..., ge=0, description="Expected content version")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "websocket"
    active_connections: int


class RoomResponse(BaseModel):
    room_id: str
    tenant_id: str
    name: str | None = None
    created_at: str
    user_count: int


class JoinRoomResponse(BaseModel):
    room_id: str
    user_id: str
    token: str
    room_state: dict[str, Any]


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["WebSocket"])
async def health():
    return HealthResponse(active_connections=len(manager.active_connections))


@router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """Generic WebSocket endpoint for real-time communication."""
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "message")
            if msg_type == "heartbeat":
                await manager.send_personal(client_id, {"type": "heartbeat", "timestamp": datetime.now(timezone.utc).isoformat()})
            elif msg_type == "message":
                _broadcast_log.append({
                    "sender": client_id, "content": data.get("content", ""),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                await manager.broadcast({"type": "message", "sender": client_id, "content": data.get("content", "")})
            else:
                await manager.send_personal(client_id, {"type": "ack", "received": msg_type})
    except WebSocketDisconnect:
        manager.disconnect(client_id)


@router.websocket("/dashboard")
async def dashboard_endpoint(
    websocket: WebSocket,
    token: str | None = Query(default=None),
):
    """Real-time dashboard WebSocket with JWT auth.

    Authentication: the JWT access token is passed as a query parameter
    (``?token=<jwt>``) since browsers cannot set custom headers on the
    WebSocket handshake.  Connections without a valid access token are
    closed with code ``1008`` (policy violation).

    Accepted inbound messages::

        {"action": "subscribe",   "channel": "candidates"}
        {"action": "unsubscribe", "channel": "candidates"}
        {"action": "ping"}

    Outbound events use the wire format::

        {"event": "candidate.created", "data": {...}}
    """
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing JWT token")
        return
    payload = decode_token(token)
    if not payload or payload.get("type") != "access" or not payload.get("sub"):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid JWT token")
        return

    user_id: str = payload["sub"]
    tenant_id: str = payload.get("tenant_id") or "default"

    connection_id = await broadcaster.connect(user_id, websocket, tenant_id=tenant_id)

    try:
        await websocket.send_json(
            {
                "type": "connected",
                "user_id": user_id,
                "tenant_id": tenant_id,
                "connection_id": connection_id,
            }
        )
        while True:
            try:
                raw = await websocket.receive_json()
            except Exception:
                # Treat malformed payloads as a no-op so the connection survives
                # buggy clients.
                continue
            action = raw.get("action")
            channel = raw.get("channel")
            if action == "ping":
                await websocket.send_json({"type": "pong", "ts": datetime.now(timezone.utc).isoformat()})
            elif action == "subscribe" and isinstance(channel, str):
                event_types = DASHBOARD_CHANNELS.get(channel, (channel,))
                accepted = await broadcaster.subscribe_many(connection_id, event_types)
                await websocket.send_json(
                    {
                        "type": "subscribed",
                        "channel": channel,
                        "events": list(accepted),
                    }
                )
            elif action == "unsubscribe" and isinstance(channel, str):
                event_types = DASHBOARD_CHANNELS.get(channel, (channel,))
                for et in event_types:
                    await broadcaster.unsubscribe(connection_id, et)
                await websocket.send_json({"type": "unsubscribed", "channel": channel})
            else:
                await websocket.send_json(
                    {"type": "error", "message": f"Unknown action: {action!r}"}
                )
    except WebSocketDisconnect:
        pass
    finally:
        await broadcaster.disconnect(user_id, websocket)


@router.post("/broadcast", tags=["WebSocket"], summary="Broadcast message to all connections")
async def broadcast_message(data: BroadcastRequest):
    now = datetime.now(timezone.utc).isoformat()
    msg = {"type": data.msg_type, "sender": data.sender, "content": data.message, "timestamp": now}
    _broadcast_log.append(msg)
    await manager.broadcast(msg)
    return {"broadcast": True, "recipients": len(manager.active_connections), "timestamp": now}


@router.post(
    "/dashboard/broadcast",
    tags=["WebSocket"],
    summary="Broadcast a dashboard event to the real-time subscribers",
)
async def dashboard_broadcast(data: DashboardBroadcastRequest) -> dict[str, Any]:
    """Push a dashboard-shaped event to all matching subscribers.

    This is the HTTP equivalent of the WebSocket ``{"event": ..., "data": ...}``
    payload and is useful for triggering events from webhooks / background
    workers that don't hold a WebSocket connection.
    """
    recipients = await broadcaster.broadcast(data.event, data.data, tenant_id=data.tenant_id)
    return {
        "broadcast": True,
        "event": data.event,
        "recipients": recipients,
        "tenant_id": data.tenant_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post(
    "/dashboard/send/{user_id}",
    tags=["WebSocket"],
    summary="Send a dashboard event to a specific user",
)
async def dashboard_send(user_id: str, data: DashboardBroadcastRequest) -> dict[str, Any]:
    """Push a dashboard-shaped event to every active connection of ``user_id``."""
    tenant_id = data.tenant_id or "default"
    recipients = await broadcaster.send_to_user(user_id, data.event, data.data, tenant_id=tenant_id)
    return {
        "sent": True,
        "event": data.event,
        "user_id": user_id,
        "recipients": recipients,
        "tenant_id": tenant_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/connections", tags=["WebSocket"], summary="List active connections")
async def list_connections():
    items = list(_connections.values())
    return {"data": items, "total": len(items), "active": len(manager.active_connections)}


@router.get("/broadcast-log", tags=["WebSocket"], summary="Get broadcast log")
async def get_broadcast_log():
    return {"data": _broadcast_log[-50:], "total": len(_broadcast_log)}


# ── Collaboration REST Endpoints ────────────────────────────────────────────────

@router.post(
    "/realtime/rooms",
    response_model=RoomResponse,
    tags=["Collaboration"],
    summary="Create a new collaboration room",
)
async def create_collaboration_room(
    data: CreateRoomRequest,
    tenant_id: str = Depends(require_tenant),
) -> RoomResponse:
    """Create a new real-time collaboration room for co-editing."""
    room = await collaboration_manager.create_room(data.room_id, tenant_id)
    state = await room.get_state()
    return RoomResponse(
        room_id=room.room_id,
        tenant_id=room.tenant_id,
        name=data.name,
        created_at=state["created_at"],
        user_count=0,
    )


@router.get(
    "/realtime/rooms/{room_id}",
    tags=["Collaboration"],
    summary="Get collaboration room state",
)
async def get_collaboration_room(
    room_id: str,
    tenant_id: str = Depends(require_tenant),
) -> dict[str, Any]:
    """Get the current state of a collaboration room including all users, cursors, and selections."""
    state = await collaboration_manager.get_room_state(room_id, tenant_id)
    if not state:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Room {room_id} not found")
    return state


@router.post(
    "/realtime/rooms/{room_id}/join",
    response_model=JoinRoomResponse,
    tags=["Collaboration"],
    summary="Join a collaboration room",
)
async def join_collaboration_room(
    room_id: str,
    data: JoinRoomRequest,
    tenant_id: str = Depends(require_tenant),
) -> JoinRoomResponse:
    """Join a collaboration room and get a WebSocket token for real-time updates."""
    user_state = await collaboration_manager.join_room(room_id, data.user_id, data.user_info, tenant_id)
    state = await collaboration_manager.get_room_state(room_id, tenant_id)

    token_payload = {
        "sub": data.user_id,
        "room_id": room_id,
        "tenant_id": tenant_id,
        "type": "collaboration",
    }
    from shared.core.security import create_access_token
    token = create_access_token(token_payload)

    return JoinRoomResponse(
        room_id=room_id,
        user_id=data.user_id,
        token=token,
        room_state=state or {},
    )


@router.post(
    "/realtime/rooms/{room_id}/leave",
    tags=["Collaboration"],
    summary="Leave a collaboration room",
)
async def leave_collaboration_room(
    room_id: str,
    user_id: str,
    tenant_id: str = Depends(require_tenant),
) -> dict[str, Any]:
    """Leave a collaboration room."""
    await collaboration_manager.leave_room(room_id, user_id, tenant_id)
    return {"left": True, "room_id": room_id, "user_id": user_id}


# ── Collaboration WebSocket Endpoint ────────────────────────────────────────────

@router.websocket("/realtime/rooms/{room_id}/ws")
async def collaboration_websocket(
    websocket: WebSocket,
    room_id: str,
    token: str | None = Query(default=None),
):
    """WebSocket endpoint for real-time collaboration in a room.

    Authentication: JWT token passed as query parameter.
    The token must be a collaboration token (type="collaboration") with matching room_id.

    Accepted inbound messages:
        {"type": "cursor_move", "cursor": {...}}
        {"type": "selection_change", "selection": {...}}
        {"type": "content_change", "operation": {...}, "version": 1}

    Outbound events:
        {"event": "user_join", "data": {...}}
        {"event": "user_leave", "data": {...}}
        {"event": "cursor_move", "data": {...}}
        {"event": "selection_change", "data": {...}}
        {"event": "content_change", "data": {...}}
        {"event": "room_state", "data": {...}}
    """
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing JWT token")
        return

    payload = decode_token(token)
    if not payload or payload.get("type") != "collaboration" or not payload.get("sub"):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid collaboration token")
        return

    if payload.get("room_id") != room_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Token room mismatch")
        return

    user_id: str = payload["sub"]
    tenant_id: str = payload.get("tenant_id") or "default"

    room = await collaboration_manager.get_room(room_id, tenant_id)
    if not room:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Room not found")
        return

    await websocket.accept()

    try:
        user_state = await room.add_user(user_id, payload.get("user_info", {}))

        join_event = {
            "event": "user_join",
            "data": {
                "user_id": user_id,
                "user_info": user_state.user_info,
                "joined_at": user_state.joined_at.isoformat(),
            },
        }
        await _broadcast_to_room(room, join_event, exclude_user=user_id)

        await websocket.send_json({
            "event": "room_state",
            "data": await room.get_state(),
        })

        while True:
            try:
                raw = await websocket.receive_json()
            except Exception:
                continue

            msg_type = raw.get("type")
            if msg_type == "cursor_move":
                cursor = raw.get("cursor", {})
                await room.update_cursor(user_id, cursor)
                await _broadcast_to_room(room, {
                    "event": "cursor_move",
                    "data": {"user_id": user_id, "cursor": cursor},
                }, exclude_user=user_id)

            elif msg_type == "selection_change":
                selection = raw.get("selection", {})
                await room.update_selection(user_id, selection)
                await _broadcast_to_room(room, {
                    "event": "selection_change",
                    "data": {"user_id": user_id, "selection": selection},
                }, exclude_user=user_id)

            elif msg_type == "content_change":
                operation = raw.get("operation", {})
                version = raw.get("version", 0)
                current_version = room.content_version
                if version != current_version:
                    await websocket.send_json({
                        "event": "version_conflict",
                        "data": {"expected": version, "current": current_version},
                    })
                    continue
                await room.increment_version()
                await _broadcast_to_room(room, {
                    "event": "content_change",
                    "data": {"user_id": user_id, "operation": operation, "version": room.content_version},
                }, exclude_user=user_id)

            elif msg_type == "ping":
                await websocket.send_json({"event": "pong", "data": {"ts": datetime.now(timezone.utc).isoformat()}})

    except WebSocketDisconnect:
        pass
    finally:
        await room.remove_user(user_id)
        leave_event = {
            "event": "user_leave",
            "data": {"user_id": user_id},
        }
        await _broadcast_to_room(room, leave_event)
        if room.is_empty():
            await collaboration_manager.delete_room(room_id, tenant_id)


async def _broadcast_to_room(room: CollaborationRoom, message: dict[str, Any], exclude_user: str | None = None) -> None:
    """Broadcast a message to all WebSocket connections in a room."""
    for uid, state in room.users.items():
        if uid == exclude_user:
            continue
        if hasattr(state, "websocket") and state.websocket:
            try:
                await state.websocket.send_json(message)
            except Exception:
                pass
