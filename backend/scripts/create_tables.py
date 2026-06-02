"""Create all database tables for AI-ROS."""
import sys
sys.path.insert(0, "/app")

from sqlmodel import SQLModel

# Import all models to register them with SQLModel.metadata
from shared.core.models.identity import User, Session, APIKey, Credential
from shared.core.models.candidate import Candidate, CandidateProfile, CandidateStatus, SeniorityLevel, Skill, CandidateSkill
from shared.core.models.recruitment import Job, JobStatus, JobType, Application, ApplicationStatus

from shared.core.database import engine
import asyncio


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    print("All tables created successfully!")


if __name__ == "__main__":
    asyncio.run(create_tables())
