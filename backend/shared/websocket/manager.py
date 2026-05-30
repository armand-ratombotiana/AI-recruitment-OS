from __future__ import annotations
from typing import Any

class ConnectionManager:
    def __init__(self):
        self.rooms: dict[str, list] = {}
    async def connect(self, websocket, room_id: str):
        await websocket.accept()
        self.rooms.setdefault(room_id, []).append(websocket)
    def disconnect(self, websocket, room_id: str):
        if room_id in self.rooms:
            self.rooms[room_id] = [ws for ws in self.rooms[room_id] if ws != websocket]
    async def broadcast(self, room_id: str, message: dict[str, Any]):
        for ws in self.rooms.get(room_id, []):
            try:
                await ws.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()
