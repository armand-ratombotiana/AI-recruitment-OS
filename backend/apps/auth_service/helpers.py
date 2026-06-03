"""Auth helpers — lockout, demo seeding, rate limiting."""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.config import get_settings
from shared.core.database import async_session_factory
from shared.core.models.identity import User, UserRole, UserStatus
from shared.core.models.candidate import Candidate, CandidateStatus
from shared.core.models.recruitment import Job, JobStatus, JobType
from shared.core.models.interview import Interview, InterviewStatus
from shared.core.security import hash_password


logger = logging.getLogger("auth_helpers")
settings = get_settings()


# ── Account Lockout ────────────────────────────────────────────────────────────


def compute_lockout_seconds(failed_attempts: int) -> int:
    """Exponential backoff: 30s, 60s, 120s, 240s, capped at AUTH_LOCKOUT_MAX_SECONDS."""
    if failed_attempts <= 0:
        return 0
    base = settings.AUTH_LOCKOUT_BASE_SECONDS
    cap = settings.AUTH_LOCKOUT_MAX_SECONDS
    delay = base * (2 ** (failed_attempts - 1))
    return min(int(delay), cap)


def _as_aware_utc(dt: datetime) -> datetime:
    """Treat naive datetimes as UTC, return aware datetime in UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def is_account_locked(user: User) -> bool:
    """Check whether a user is currently locked out."""
    if user.locked_until is None:
        return False
    locked_until_aware = _as_aware_utc(user.locked_until)
    return locked_until_aware > datetime.now(timezone.utc)


def lockout_remaining_seconds(user: User) -> int:
    if user.locked_until is None:
        return 0
    locked_until_aware = _as_aware_utc(user.locked_until)
    delta = (locked_until_aware - datetime.now(timezone.utc)).total_seconds()
    return max(0, int(delta))


def should_lock_account(failed_attempts: int) -> bool:
    return failed_attempts >= settings.AUTH_MAX_FAILED_ATTEMPTS


def record_failed_attempt(user: User) -> None:
    """Increment failed attempts and set lock_until if threshold reached."""
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    if should_lock_account(user.failed_login_attempts) and not is_account_locked(user):
        seconds = compute_lockout_seconds(user.failed_login_attempts)
        # Store as naive UTC to match the column type (TIMESTAMP WITHOUT TIME ZONE).
        user.locked_until = (
            datetime.now(timezone.utc) + timedelta(seconds=seconds)
        ).replace(tzinfo=None)


def record_successful_login(user: User) -> None:
    """Reset lockout state on success."""
    user.failed_login_attempts = 0
    user.locked_until = None


# ── Per-key Rate Limiting (auth-specific) ──────────────────────────────────────


class AuthRateLimiter:
    """Per-key rate limiter for auth endpoints, supports separate buckets."""

    def __init__(self):
        self._buckets: dict[str, list[float]] = {}
        self._lock = asyncio.Lock()

    def _now(self) -> float:
        import time
        return time.time()

    async def check(self, key: str, max_per_minute: int) -> tuple[bool, int]:
        """Return (allowed, remaining)."""
        async with self._lock:
            now = self._now()
            window_start = now - 60.0
            hits = [t for t in self._buckets.get(key, []) if t > window_start]
            if len(hits) >= max_per_minute:
                self._buckets[key] = hits
                return False, 0
            hits.append(now)
            self._buckets[key] = hits
            return True, max_per_minute - len(hits)

    def reset(self, key: str | None = None) -> None:
        if key is None:
            self._buckets.clear()
        else:
            self._buckets.pop(key, None)


auth_rate_limiter = AuthRateLimiter()


# ── Normalization helpers ─────────────────────────────────────────────────────


def normalize_email(email: str) -> str:
    return email.strip().lower()


def normalize_name(name: str) -> str:
    return " ".join(name.split())


# ── Demo seed ─────────────────────────────────────────────────────────────────


async def seed_demo_account(db: AsyncSession | None = None) -> dict[str, Any]:
    """Seed the demo user + sample data. Idempotent — safe to call repeatedly.

    If `db` is provided it is used directly; otherwise a new session is opened
    from the global async_session_factory.
    """
    if not settings.DEMO_ENABLED:
        return {"seeded": False, "reason": "demo disabled"}

    results: dict[str, Any] = {
        "seeded_users": 0,
        "seeded_candidates": 0,
        "seeded_jobs": 0,
        "seeded_interviews": 0,
    }

    owns_session = db is None
    session_cm = None
    try:
        if owns_session:
            session_cm = async_session_factory()
            db = await session_cm.__aenter__()

        # Demo user — handle concurrent seeding gracefully with INSERT ... ON
        # CONFLICT semantics via a savepoint and IntegrityError rollback.
        demo_email = normalize_email(settings.DEMO_EMAIL)
        res = await db.execute(select(User).where(User.email == demo_email))
        existing = res.scalar_one_or_none()
        if existing is None:
            demo_user = User(
                id=str(uuid4()),
                tenant_id="default",
                email=demo_email,
                full_name="Demo User",
                hashed_password=hash_password(settings.DEMO_PASSWORD),
                role=UserRole.SUPER_ADMIN,
                status=UserStatus.ACTIVE,
                email_verified=True,
                email_verified_at=datetime.now(timezone.utc).replace(tzinfo=None),
                is_demo=True,
            )
            db.add(demo_user)
            try:
                await db.flush()
                results["seeded_users"] = 1
                results["demo_user_id"] = demo_user.id
            except IntegrityError:
                # Another worker seeded concurrently. Roll back the insert
                # and continue with the existing user.
                await db.rollback()
                res = await db.execute(select(User).where(User.email == demo_email))
                existing = res.scalar_one_or_none()
                if existing is None:
                    raise  # Unexpected; let the outer handler deal with it
                results["demo_user_id"] = existing.id
        else:
            # Always update the password and flags to ensure login works
            existing.hashed_password = hash_password(settings.DEMO_PASSWORD)
            existing.is_demo = True
            existing.status = UserStatus.ACTIVE
            existing.email_verified = True
            if existing.email_verified_at is None:
                existing.email_verified_at = datetime.now(timezone.utc).replace(tzinfo=None)
            existing.failed_login_attempts = 0
            existing.locked_until = None
            results["demo_user_id"] = existing.id

        # Only seed sample data if no candidates exist yet
        res = await db.execute(select(Candidate).limit(1))
        has_candidates = res.scalar_one_or_none() is not None
        candidate_ids: list[str] = []
        if not has_candidates:
            candidates = [
                ("alice.johnson@example.com", "Alice Johnson", "San Francisco, CA"),
                ("bob.smith@example.com", "Bob Smith", "New York, NY"),
                ("carlos.garcia@example.com", "Carlos Garcia", "Austin, TX"),
                ("diana.chen@example.com", "Diana Chen", "Seattle, WA"),
            ]
            for email, name, location in candidates:
                c = Candidate(
                    id=str(uuid4()),
                    tenant_id="default",
                    email=email,
                    full_name=name,
                    location=location,
                    status=CandidateStatus.NEW,
                    source="seed",
                )
                db.add(c)
                candidate_ids.append(c.id)
            results["seeded_candidates"] = len(candidates)
        else:
            res = await db.execute(select(Candidate.id).limit(4))
            candidate_ids = [row[0] for row in res.all()]

        res = await db.execute(select(Job).limit(1))
        has_jobs = res.scalar_one_or_none() is not None
        job_ids: list[str] = []
        if not has_jobs:
            jobs = [
                {
                    "title": "Senior Backend Engineer",
                    "description": "Build scalable APIs with Python and FastAPI.",
                    "department": "Engineering",
                    "location": "San Francisco, CA",
                    "remote_policy": "hybrid",
                    "job_type": JobType.FULL_TIME,
                    "seniority_required": "senior",
                    "required_skills": json.dumps(["Python", "FastAPI", "PostgreSQL"]),
                    "status": JobStatus.OPEN,
                },
                {
                    "title": "Frontend Developer",
                    "description": "Build modern web apps with React and TypeScript.",
                    "department": "Engineering",
                    "location": "Remote",
                    "remote_policy": "remote",
                    "job_type": JobType.FULL_TIME,
                    "seniority_required": "mid",
                    "required_skills": json.dumps(["React", "TypeScript", "JavaScript"]),
                    "status": JobStatus.OPEN,
                },
                {
                    "title": "DevOps Engineer",
                    "description": "Manage cloud infrastructure, CI/CD, and Kubernetes.",
                    "department": "Infrastructure",
                    "location": "Remote",
                    "remote_policy": "remote",
                    "job_type": JobType.FULL_TIME,
                    "seniority_required": "senior",
                    "required_skills": json.dumps(["Docker", "Kubernetes", "AWS"]),
                    "status": JobStatus.OPEN,
                },
            ]
            for j in jobs:
                j_full = {"id": str(uuid4()), "tenant_id": "default", **j}
                job = Job(**j_full)
                db.add(job)
                job_ids.append(job.id)
            results["seeded_jobs"] = len(jobs)
        else:
            res = await db.execute(select(Job.id).limit(3))
            job_ids = [row[0] for row in res.all()]

        res = await db.execute(select(Interview).limit(1))
        has_interviews = res.scalar_one_or_none() is not None
        if not has_interviews and candidate_ids and job_ids:
            for i in range(min(2, len(candidate_ids))):
                iv = Interview(
                    id=str(uuid4()),
                    tenant_id="default",
                    application_id=str(uuid4()),
                    candidate_id=candidate_ids[i],
                    job_id=job_ids[0],
                    interview_type="technical",
                    status=InterviewStatus.SCHEDULED,
                    is_ai_interview=True,
                )
                db.add(iv)
            results["seeded_interviews"] = min(2, len(candidate_ids))

        await db.commit()
        logger.info("Demo seed complete: %s", results)
        return results
    except Exception as exc:
        logger.exception("Demo seed failed: %s", exc)
        if owns_session and db is not None:
            with suppress(Exception):
                await db.rollback()
        return {"seeded": False, "error": str(exc), **results}
    finally:
        if owns_session and session_cm is not None:
            with suppress(Exception):
                await session_cm.__aexit__(None, None, None)
