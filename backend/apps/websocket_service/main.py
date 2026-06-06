"""WebSocket Service — Real-time collaboration via WebSocket connections."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from shared.core.security import decode_token
from shared.realtime.broadcaster import broadcaster


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


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "websocket"
    active_connections: int


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
