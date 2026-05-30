"""Interview repository with domain-specific queries."""

from __future__ import annotations

from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from shared.core.repositories.base import BaseRepository
from shared.core.models.interview import Interview, InterviewSession, InterviewFeedback


class InterviewRepository(BaseRepository[Interview]):
    def __init__(self, session: AsyncSession):
        super().__init__(Interview, session)

    async def get_scheduled(self, tenant_id: str) -> list[Interview]:
        return await self.get_multi(tenant_id=tenant_id, filters={"status": "scheduled"})

    async def get_by_candidate(self, candidate_id: str, tenant_id: str) -> list[Interview]:
        return await self.get_multi(tenant_id=tenant_id, filters={"candidate_id": candidate_id})
