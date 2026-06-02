"""WebSocket Service — Real-time collaboration via WebSocket connections."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field


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


# ── Request Models ──────────────────────────────────────────────────────────────

class BroadcastRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Message to broadcast")
    sender: str = Field(default="system", description="Sender identifier")
    msg_type: str = Field(default="broadcast", description="Message type")


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


@router.post("/broadcast", tags=["WebSocket"], summary="Broadcast message to all connections")
async def broadcast_message(data: BroadcastRequest):
    now = datetime.now(timezone.utc).isoformat()
    msg = {"type": data.msg_type, "sender": data.sender, "content": data.message, "timestamp": now}
    _broadcast_log.append(msg)
    await manager.broadcast(msg)
    return {"broadcast": True, "recipients": len(manager.active_connections), "timestamp": now}


@router.get("/connections", tags=["WebSocket"], summary="List active connections")
async def list_connections():
    items = list(_connections.values())
    return {"data": items, "total": len(items), "active": len(manager.active_connections)}


@router.get("/broadcast-log", tags=["WebSocket"], summary="Get broadcast log")
async def get_broadcast_log():
    return {"data": _broadcast_log[-50:], "total": len(_broadcast_log)}
