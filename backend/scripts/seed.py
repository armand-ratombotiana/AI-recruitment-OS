"""Database seeder for AI-ROS — creates sample data for development."""

from __future__ import annotations

import asyncio
import json
import sys
from uuid import uuid4
from datetime import datetime, timezone

sys.path.insert(0, ".")

from shared.core.config import get_settings
from shared.core.database import get_engine, async_session_factory
from shared.core.security import hash_password
from shared.core.models.identity import User, UserRole, UserStatus
from shared.core.models.candidate import (
    Candidate, CandidateProfile, Skill, CandidateSkill, ExperienceEntry,
    CandidateStatus, SeniorityLevel,
)
from shared.core.models.recruitment import Job, JobStatus, JobType, Pipeline, Application
from shared.core.models.evaluation import (
    Evaluation, EvaluationCriteria, Benchmark, CodingSession, PPEEvaluation,
)
from shared.core.models.interview import Interview, InterviewStatus

from sqlmodel import SQLModel

settings = get_settings()

DEFAULT_TENANT_ID = "tenant-default-001"

SEED_SKILLS = [
    {"name": "Python", "category": "language", "normalized_name": "python"},
    {"name": "TypeScript", "category": "language", "normalized_name": "typescript"},
    {"name": "JavaScript", "category": "language", "normalized_name": "javascript"},
    {"name": "Go", "category": "language", "normalized_name": "go"},
    {"name": "Rust", "category": "language", "normalized_name": "rust"},
    {"name": "PostgreSQL", "category": "database", "normalized_name": "postgresql"},
    {"name": "Redis", "category": "database", "normalized_name": "redis"},
    {"name": "MongoDB", "category": "database", "normalized_name": "mongodb"},
    {"name": "FastAPI", "category": "framework", "normalized_name": "fastapi"},
    {"name": "React", "category": "framework", "normalized_name": "react"},
    {"name": "Docker", "category": "devops", "normalized_name": "docker"},
    {"name": "Kubernetes", "category": "devops", "normalized_name": "kubernetes"},
    {"name": "AWS", "category": "cloud", "normalized_name": "aws"},
    {"name": "GCP", "category": "cloud", "normalized_name": "gcp"},
    {"name": "Machine Learning", "category": "domain", "normalized_name": "machine_learning"},
]

SEED_CANDIDATES = [
    {"email": "alice.johnson@example.com", "full_name": "Alice Johnson", "location": "San Francisco, CA", "source": "linkedin"},
    {"email": "bob.smith@example.com", "full_name": "Bob Smith", "location": "New York, NY", "source": "referral"},
    {"email": "carlos.garcia@example.com", "full_name": "Carlos Garcia", "location": "Austin, TX", "source": "indeed"},
    {"email": "diana.chen@example.com", "full_name": "Diana Chen", "location": "Seattle, WA", "source": "linkedin"},
    {"email": "evan.williams@example.com", "full_name": "Evan Williams", "location": "Chicago, IL", "source": "direct"},
    {"email": "fiona.murphy@example.com", "full_name": "Fiona Murphy", "location": "Boston, MA", "source": "linkedin"},
    {"email": "george.patel@example.com", "full_name": "George Patel", "location": "Denver, CO", "source": "referral"},
    {"email": "hannah.kim@example.com", "full_name": "Hannah Kim", "location": "Portland, OR", "source": "indeed"},
    {"email": "ivan.ivanov@example.com", "full_name": "Ivan Ivanov", "location": "Miami, FL", "source": "linkedin"},
    {"email": "julia.rodriguez@example.com", "full_name": "Julia Rodriguez", "location": "Los Angeles, CA", "source": "direct"},
]

SEED_JOBS = [
    {
        "title": "Senior Backend Engineer",
        "description": "Design and build scalable APIs using Python and FastAPI. Work on distributed systems and microservices architecture.",
        "department": "Engineering",
        "location": "San Francisco, CA",
        "remote_policy": "hybrid",
        "job_type": JobType.FULL_TIME,
        "seniority_required": "senior",
        "required_skills": json.dumps(["Python", "FastAPI", "PostgreSQL"]),
        "preferred_skills": json.dumps(["Redis", "Docker", "Kubernetes"]),
    },
    {
        "title": "Frontend Developer",
        "description": "Build modern web applications with React and TypeScript. Focus on performance and accessibility.",
        "department": "Engineering",
        "location": "New York, NY",
        "remote_policy": "remote",
        "job_type": JobType.FULL_TIME,
        "seniority_required": "mid",
        "required_skills": json.dumps(["React", "TypeScript", "JavaScript"]),
        "preferred_skills": json.dumps(["FastAPI", "Docker"]),
    },
    {
        "title": "DevOps Engineer",
        "description": "Manage cloud infrastructure, CI/CD pipelines, and container orchestration.",
        "department": "Infrastructure",
        "location": "Seattle, WA",
        "remote_policy": "remote",
        "job_type": JobType.FULL_TIME,
        "seniority_required": "senior",
        "required_skills": json.dumps(["Docker", "Kubernetes", "AWS"]),
        "preferred_skills": json.dumps(["Go", "Rust", "GCP"]),
    },
    {
        "title": "Data Engineer",
        "description": "Design and maintain data pipelines and analytics infrastructure.",
        "department": "Data",
        "location": "Austin, TX",
        "remote_policy": "hybrid",
        "job_type": JobType.FULL_TIME,
        "seniority_required": "mid",
        "required_skills": json.dumps(["Python", "PostgreSQL", "Machine Learning"]),
        "preferred_skills": json.dumps(["Redis", "MongoDB"]),
    },
    {
        "title": "Junior Software Engineer",
        "description": "Entry-level position to build skills in full-stack development with mentorship.",
        "department": "Engineering",
        "location": "Chicago, IL",
        "remote_policy": "on_site",
        "job_type": JobType.FULL_TIME,
        "seniority_required": "junior",
        "required_skills": json.dumps(["Python", "JavaScript"]),
        "preferred_skills": json.dumps(["React", "FastAPI"]),
    },
]

SEED_PROFILES = {
    0: {"summary": "Experienced backend engineer with 8 years in Python ecosystem", "seniority_level": "senior", "years_experience": 8, "domains": json.dumps(["backend", "distributed_systems"])},
    1: {"summary": "Full-stack developer with strong frontend skills", "seniority_level": "mid", "years_experience": 4, "domains": json.dumps(["frontend", "fullstack"])},
    2: {"summary": "Cloud infrastructure specialist with 10 years of experience", "seniority_level": "senior", "years_experience": 10, "domains": json.dumps(["devops", "cloud"])},
    3: {"summary": "Data engineer passionate about ML pipelines", "seniority_level": "mid", "years_experience": 5, "domains": json.dumps(["data", "ml"])},
    4: {"summary": "Recent CS graduate eager to learn", "seniority_level": "junior", "years_experience": 1, "domains": json.dumps(["fullstack"])},
    5: {"summary": "Senior frontend architect with React expertise", "seniority_level": "senior", "years_experience": 9, "domains": json.dumps(["frontend", "architecture"])},
    6: {"summary": "Backend engineer focused on microservices", "seniority_level": "mid", "years_experience": 6, "domains": json.dumps(["backend", "microservices"])},
    7: {"summary": "DevOps engineer with security focus", "seniority_level": "mid", "years_experience": 5, "domains": json.dumps(["devops", "security"])},
    8: {"summary": "Machine learning engineer with research background", "seniority_level": "senior", "years_experience": 7, "domains": json.dumps(["ml", "data_science"])},
    9: {"summary": "Junior developer from bootcamp with strong fundamentals", "seniority_level": "junior", "years_experience": 2, "domains": json.dumps(["fullstack"])},
}


async def seed_database():
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    async with async_session_factory() as session:
        admin_user = User(
            id=str(uuid4()),
            tenant_id=DEFAULT_TENANT_ID,
            email="admin@airos.dev",
            full_name="System Admin",
            hashed_password=hash_password("Admin123!"),
            role=UserRole.SUPER_ADMIN,
            status=UserStatus.ACTIVE,
        )
        session.add(admin_user)
        print(f"[+] Created admin user: {admin_user.email}")

        skill_ids = []
        for skill_data in SEED_SKILLS:
            skill = Skill(
                id=str(uuid4()),
                tenant_id=DEFAULT_TENANT_ID,
                **skill_data,
            )
            session.add(skill)
            skill_ids.append(skill.id)
        print(f"[+] Created {len(SEED_SKILLS)} skills")

        candidate_ids = []
        for cand_data in SEED_CANDIDATES:
            candidate = Candidate(
                id=str(uuid4()),
                tenant_id=DEFAULT_TENANT_ID,
                status=CandidateStatus.NEW,
                **cand_data,
            )
            session.add(candidate)
            candidate_ids.append(candidate.id)

            if candidate_ids.index(candidate.id) in SEED_PROFILES:
                profile_data = SEED_PROFILES[candidate_ids.index(candidate.id)]
                profile = CandidateProfile(
                    id=str(uuid4()),
                    candidate_id=candidate.id,
                    tenant_id=DEFAULT_TENANT_ID,
                    **profile_data,
                )
                session.add(profile)

                num_skills = (candidate_ids.index(candidate.id) % 4) + 2
                for i in range(num_skills):
                    cs = CandidateSkill(
                        id=str(uuid4()),
                        candidate_id=candidate.id,
                        skill_id=skill_ids[i],
                        tenant_id=DEFAULT_TENANT_ID,
                        proficiency="expert" if i == 0 else "intermediate",
                        years_used=(5 - i) * 2,
                        source="resume",
                    )
                    session.add(cs)
        print(f"[+] Created {len(SEED_CANDIDATES)} candidates with profiles and skills")

        job_ids = []
        for job_data in SEED_JOBS:
            job = Job(
                id=str(uuid4()),
                tenant_id=DEFAULT_TENANT_ID,
                status=JobStatus.OPEN,
                **job_data,
            )
            session.add(job)
            job_ids.append(job.id)
        print(f"[+] Created {len(SEED_JOBS)} jobs")

        pipeline = Pipeline(
            id=str(uuid4()),
            tenant_id=DEFAULT_TENANT_ID,
            name="Default Hiring Pipeline",
            stages=json.dumps(["applied", "screening", "interview", "evaluation", "offer"]),
            is_default=True,
        )
        session.add(pipeline)
        print("[+] Created default pipeline")

        for i in range(3):
            eval_ = Evaluation(
                id=str(uuid4()),
                tenant_id=DEFAULT_TENANT_ID,
                candidate_id=candidate_ids[i % len(candidate_ids)],
                job_id=job_ids[i % len(job_ids)],
                evaluation_type="resume_screening",
                status="completed",
                overall_score=7.0 + (i * 0.5),
                confidence_score=0.85,
                ai_model_used="gpt-4o",
                tokens_consumed=1500 + (i * 200),
            )
            session.add(eval_)
        print("[+] Created sample evaluations")

        for i in range(2):
            interview = Interview(
                id=str(uuid4()),
                tenant_id=DEFAULT_TENANT_ID,
                application_id=str(uuid4()),
                candidate_id=candidate_ids[i],
                job_id=job_ids[0],
                interview_type="technical",
                status=InterviewStatus.SCHEDULED,
                is_ai_interview=True,
            )
            session.add(interview)

            coding_session = CodingSession(
                id=str(uuid4()),
                tenant_id=DEFAULT_TENANT_ID,
                interview_id=interview.id,
                candidate_id=candidate_ids[i],
                language="python",
                status="created",
                problem_title="Two Sum",
                difficulty="medium",
            )
            session.add(coding_session)
        print("[+] Created sample interviews and coding sessions")

        await session.commit()
        print("\n[OK] Database seeded successfully!")


if __name__ == "__main__":
    asyncio.run(seed_database())
