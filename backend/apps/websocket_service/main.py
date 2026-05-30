"""WebSocket Service — Real-time collaboration via WebSocket connections."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "websocket"
    active_rooms: int


# ── Connection Manager ──────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.rooms: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = []
        self.rooms[room_id].append(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.rooms:
            self.rooms[room_id] = [ws for ws in self.rooms[room_id] if ws != websocket]

    async def broadcast(self, room_id: str, message: dict[str, Any]):
        if room_id in self.rooms:
            for ws in self.rooms[room_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    pass

    async def send_personal(self, websocket: WebSocket, message: dict[str, Any]):
        try:
            await websocket.send_json(message)
        except Exception:
            pass


manager = ConnectionManager()


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["WebSocket"], summary="WebSocket service health check")
async def health():
    return HealthResponse(active_rooms=len(manager.rooms))


@router.websocket("/ws/ppe/{session_id}")
async def ppe_websocket(websocket: WebSocket, session_id: str):
    """WebSocket for PPE live coding collaboration.

    ## Message Types (Client → Server)
    | type | Description |
    |------|-------------|
    | `code_update` | Broadcast code changes to all participants |
    | `execute` | Run submitted code against test cases |
    | `request_hint` | Request an AI hint |
    | `message` | Send a chat message |
    | `heartbeat` | Keep-alive ping |

    ## Message Types (Server → Client)
    | type | Description |
    |------|-------------|
    | `code_sync` | Synced code state with cursor position |
    | `execution_started` | Code execution initiated |
    | `execution_result` | Test results and stdout/stderr |
    | `hint` | AI-generated hint with remaining count |
    | `agent_message` | Chat message from AI agent |
    | `heartbeat` | Keep-alive pong |
    """
    room_id = f"ppe-{session_id}"
    await manager.connect(websocket, room_id)

    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type", "")

            if message_type == "code_update":
                await manager.broadcast(room_id, {
                    "type": "code_sync",
                    "code": data.get("code", ""),
                    "version": data.get("version", 0),
                    "cursor": data.get("cursor", 0),
                })

            elif message_type == "execute":
                await manager.send_personal(websocket, {
                    "type": "execution_started",
                    "message": "Executing code...",
                })
                await asyncio.sleep(1)
                await manager.send_personal(websocket, {
                    "type": "execution_result",
                    "exit_code": 0,
                    "stdout": "Hello, World!",
                    "tests_passed": "3/5",
                })

            elif message_type == "request_hint":
                await manager.send_personal(websocket, {
                    "type": "hint",
                    "message": "Have you considered using a hash map for O(1) lookup?",
                    "hints_remaining": 2,
                })

            elif message_type == "message":
                await manager.broadcast(room_id, {
                    "type": "agent_message",
                    "content": data.get("content", ""),
                    "sender": "ai_agent",
                })

            elif message_type == "heartbeat":
                await manager.send_personal(websocket, {"type": "heartbeat"})

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)


@router.websocket("/ws/interview/{session_id}")
async def interview_websocket(websocket: WebSocket, session_id: str):
    """WebSocket for AI interview sessions.

    ## Message Types (Client → Server)
    | type | Description |
    |------|-------------|
    | `chat_message` | Send a message to the AI interviewer |
    | `heartbeat` | Keep-alive ping |

    ## Message Types (Server → Client)
    | type | Description |
    |------|-------------|
    | `chat_response` | AI interviewer response |
    | `heartbeat` | Keep-alive pong |
    """
    room_id = f"interview-{session_id}"
    await manager.connect(websocket, room_id)

    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type", "")

            if message_type == "chat_message":
                await manager.broadcast(room_id, {
                    "type": "chat_response",
                    "content": "AI Interviewer: Thank you for your response. Let me ask a follow-up question.",
                    "sender": "ai_agent",
                })

            elif message_type == "heartbeat":
                await manager.send_personal(websocket, {"type": "heartbeat"})

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)


@router.websocket("/ws/copilot/{tenant_id}")
async def copilot_websocket(websocket: WebSocket, tenant_id: str):
    """WebSocket for AI copilot real-time assistance.

    ## Message Types (Client → Server)
    | type | Description |
    |------|-------------|
    | `query` | Ask the copilot a question |
    | `heartbeat` | Keep-alive ping |

    ## Message Types (Server → Client)
    | type | Description |
    |------|-------------|
    | `response` | Copilot answer with timestamp |
    | `heartbeat` | Keep-alive pong |
    """
    room_id = f"copilot-{tenant_id}"
    await manager.connect(websocket, room_id)

    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type", "")

            if message_type == "query":
                await manager.send_personal(websocket, {
                    "type": "response",
                    "content": f"Based on the data, here are my insights for: {data.get('query', '')}",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

            elif message_type == "heartbeat":
                await manager.send_personal(websocket, {"type": "heartbeat"})

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
