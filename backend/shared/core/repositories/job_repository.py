"""Job repository with domain-specific queries."""

from __future__ import annotations

from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from shared.core.repositories.base import BaseRepository
from shared.core.models.recruitment import Job, Application


class JobRepository(BaseRepository[Job]):
    def __init__(self, session: AsyncSession):
        super().__init__(Job, session)

    async def get_open_jobs(self, tenant_id: str) -> list[Job]:
        return await self.get_multi(tenant_id=tenant_id, filters={"status": "open"})

    async def get_with_applicants(self, job_id: str, tenant_id: str) -> dict[str, Any]:
        job = await self.get(job_id, tenant_id)
        if not job:
            return {}
        stmt = select(Application).where(
            Application.job_id == job_id,
            Application.tenant_id == tenant_id,
        )
        result = await self.session.execute(stmt)
        applications = list(result.scalars().all())
        return {"job": job, "applicants": len(applications), "applications": applications}
