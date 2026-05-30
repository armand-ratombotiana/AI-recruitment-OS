from __future__ import annotations
from typing import Any

class PPEWebSocketHandler:
    async def handle_code_update(self, session_id: str, data: dict[str, Any]) -> dict[str, Any]:
        return {"type": "code_sync", "code": data.get("code", ""), "version": data.get("version", 0)}
    async def handle_execute(self, session_id: str, data: dict[str, Any]) -> dict[str, Any]:
        return {"type": "execution_result", "exit_code": 0, "stdout": "Hello, World!"}
