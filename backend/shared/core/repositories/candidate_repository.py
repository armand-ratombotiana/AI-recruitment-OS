"""Candidate repository with domain-specific queries."""

from __future__ import annotations

from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from shared.core.repositories.base import BaseRepository
from shared.core.models.candidate import Candidate, CandidateProfile, Skill, CandidateSkill


class CandidateRepository(BaseRepository[Candidate]):
    def __init__(self, session: AsyncSession):
        super().__init__(Candidate, session)

    async def get_with_profile(self, candidate_id: str, tenant_id: str) -> Candidate | None:
        stmt = select(Candidate).where(
            Candidate.id == candidate_id,
            Candidate.tenant_id == tenant_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def search_by_skills(self, skill_names: list[str], tenant_id: str) -> list[Candidate]:
        stmt = (
            select(Candidate)
            .join(CandidateSkill, Candidate.id == CandidateSkill.candidate_id)
            .join(Skill, CandidateSkill.skill_id == Skill.id)
            .where(Skill.normalized_name.in_([s.lower() for s in skill_names]))
            .where(Candidate.tenant_id == tenant_id)
            .distinct()
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_status(self, status: str, tenant_id: str) -> list[Candidate]:
        return await self.get_multi(tenant_id=tenant_id, filters={"status": status})
