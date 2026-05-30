from __future__ import annotations
from typing import Any
from datetime import datetime, timezone


class MemoryStore:
    def __init__(self, redis_client=None, db_session=None):
        self.redis = redis_client
        self.db = db_session

    async def store_short_term(self, key: str, value: Any, ttl: int = 3600) -> None:
        if self.redis:
            import json
            await self.redis.setex(f"stm:{key}", ttl, json.dumps(value))

    async def get_short_term(self, key: str) -> Any | None:
        if self.redis:
            import json
            raw = await self.redis.get(f"stm:{key}")
            return json.loads(raw) if raw else None
        return None

    async def store_long_term(self, entity_id: str, content: str, metadata: dict[str, Any], tenant_id: str) -> str:
        memory_id = f"ltm_{entity_id}"
        return memory_id

    async def recall(self, query: str, tenant_id: str, memory_type: str = "long_term", limit: int = 10) -> list[dict[str, Any]]:
        return []

    async def store_interview_memory(self, interview_id: str, transcript: list[dict], summary: str, tenant_id: str) -> None:
        await self.store_long_term(
            entity_id=f"interview_{interview_id}",
            content=summary,
            metadata={"type": "interview", "interview_id": interview_id},
            tenant_id=tenant_id,
        )

    async def store_candidate_memory(self, candidate_id: str, event_type: str, data: dict[str, Any], tenant_id: str) -> None:
        await self.store_long_term(
            entity_id=f"candidate_{candidate_id}",
            content=f"{event_type}: {data}",
            metadata={"type": "candidate_event", "event_type": event_type},
            tenant_id=tenant_id,
        )

    async def store_recruiter_memory(self, recruiter_id: str, action: str, context: dict[str, Any], tenant_id: str) -> None:
        await self.store_long_term(
            entity_id=f"recruiter_{recruiter_id}",
            content=f"Action: {action}",
            metadata={"type": "recruiter_action", "action": action},
            tenant_id=tenant_id,
        )

    async def get_candidate_context(self, candidate_id: str, tenant_id: str) -> dict[str, Any]:
        memories = await self.recall(f"candidate {candidate_id}", tenant_id, limit=20)
        return {"candidate_id": candidate_id, "memories": memories, "count": len(memories)}
