"""WebSocket endpoints for real-time collaboration."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.core.security import decode_token
from src.services.ppe.session_manager import PPESessionManager

router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections per session."""

    def __init__(self) -> None:
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str) -> None:
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str) -> None:
        if room_id in self.active_connections:
            self.active_connections[room_id].remove(websocket)

    async def broadcast(self, room_id: str, message: dict[str, Any]) -> None:
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                await connection.send_json(message)

    async def send_personal(self, websocket: WebSocket, message: dict[str, Any]) -> None:
        await websocket.send_json(message)


manager = ConnectionManager()


@router.websocket("/ppe/{session_id}")
async def ppe_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for live PPE coding sessions.

    Messages from client:
    - code_update: Candidate updated their code
    - execute: Candidate wants to run their code
    - request_hint: Candidate requests a hint
    - message: Candidate sends a chat message

    Messages to client:
    - code_sync: Synchronize code state
    - execution_result: Code execution results
    - hint: Progressive hint from AI agent
    - agent_message: Message from PPE agent
    - session_complete: Session ended
    """
    # Authenticate via token in query params
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return

    payload = decode_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid token")
        return

    room_id = f"ppe-{session_id}"
    await manager.connect(websocket, room_id)

    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type", "")

            match message_type:
                case "code_update":
                    # Broadcast code update to other participants
                    await manager.broadcast(room_id, {
                        "type": "code_sync",
                        "code": data.get("code", ""),
                        "version": data.get("version", 0),
                        "sender": payload.get("sub"),
                    })

                case "execute":
                    # Execute code and return results
                    await manager.send_personal(websocket, {
                        "type": "execution_started",
                        "message": "Executing code...",
                    })

                case "request_hint":
                    # Request hint from PPE Agent
                    await manager.send_personal(websocket, {
                        "type": "hint",
                        "message": "Processing hint request...",
                    })

                case "message":
                    # Forward message to PPE Agent
                    await manager.broadcast(room_id, {
                        "type": "agent_message",
                        "content": f"Received: {data.get('content', '')}",
                        "sender": "ai_agent",
                    })

                case "heartbeat":
                    await manager.send_personal(websocket, {"type": "heartbeat"})

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
