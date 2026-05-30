"""Contract tests for event schema validation."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import BaseModel, Field


pytestmark = [pytest.mark.contract, pytest.mark.events]


class CandidateCreatedEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: str = "candidate.created"
    tenant_id: str
    candidate_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    payload: dict = {}


class CandidateUpdatedEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: str = "candidate.updated"
    tenant_id: str
    candidate_id: str
    changes: dict
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EvaluationCompletedEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: str = "evaluation.completed"
    tenant_id: str
    evaluation_id: str
    candidate_id: str
    evaluation_type: str
    overall_score: float
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PPESessionStartedEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: str = "ppe.session.started"
    tenant_id: str
    session_id: str
    candidate_id: str
    language: str
    difficulty: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PPEEvaluationCompletedEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: str = "ppe.evaluation.completed"
    tenant_id: str
    session_id: str
    candidate_id: str
    overall_score: float
    seniority_estimation: str
    hiring_recommendation: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class JobCreatedEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: str = "job.created"
    tenant_id: str
    job_id: str
    title: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ApplicationSubmittedEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: str = "application.submitted"
    tenant_id: str
    application_id: str
    candidate_id: str
    job_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InterviewScheduledEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: str = "interview.scheduled"
    tenant_id: str
    interview_id: str
    candidate_id: str
    interview_type: str
    scheduled_at: datetime
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserRegisteredEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: str = "user.registered"
    tenant_id: str
    user_id: str
    email: str
    role: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# --- Tests ---

class TestCandidateEvents:
    def test_candidate_created_event(self):
        event = CandidateCreatedEvent(
            tenant_id="t1",
            candidate_id="c1",
            payload={"email": "test@test.com", "full_name": "Test"},
        )
        assert event.event_type == "candidate.created"
        assert event.tenant_id == "t1"
        assert event.event_id is not None

    def test_candidate_created_missing_tenant(self):
        with pytest.raises(Exception):
            CandidateCreatedEvent(candidate_id="c1")

    def test_candidate_updated_event(self):
        event = CandidateUpdatedEvent(
            tenant_id="t1",
            candidate_id="c1",
            changes={"full_name": "New Name"},
        )
        assert event.event_type == "candidate.updated"
        assert "full_name" in event.changes


class TestEvaluationEvents:
    def test_evaluation_completed_event(self):
        event = EvaluationCompletedEvent(
            tenant_id="t1",
            evaluation_id="e1",
            candidate_id="c1",
            evaluation_type="resume_screening",
            overall_score=8.5,
        )
        assert event.event_type == "evaluation.completed"
        assert event.overall_score == 8.5

    def test_evaluation_score_range(self):
        event = EvaluationCompletedEvent(
            tenant_id="t1",
            evaluation_id="e1",
            candidate_id="c1",
            evaluation_type="skill_match",
            overall_score=0.0,
        )
        assert 0.0 <= event.overall_score <= 10.0


class TestPPEEvents:
    def test_ppe_session_started_event(self):
        event = PPESessionStartedEvent(
            tenant_id="t1",
            session_id="s1",
            candidate_id="c1",
            language="python",
            difficulty="medium",
        )
        assert event.event_type == "ppe.session.started"
        assert event.language == "python"

    def test_ppe_evaluation_completed_event(self):
        event = PPEEvaluationCompletedEvent(
            tenant_id="t1",
            session_id="s1",
            candidate_id="c1",
            overall_score=8.0,
            seniority_estimation="senior",
            hiring_recommendation="hire",
        )
        assert event.event_type == "ppe.evaluation.completed"
        assert event.seniority_estimation == "senior"


class TestJobEvents:
    def test_job_created_event(self):
        event = JobCreatedEvent(
            tenant_id="t1",
            job_id="j1",
            title="Backend Engineer",
        )
        assert event.event_type == "job.created"
        assert event.title == "Backend Engineer"


class TestApplicationEvents:
    def test_application_submitted_event(self):
        event = ApplicationSubmittedEvent(
            tenant_id="t1",
            application_id="a1",
            candidate_id="c1",
            job_id="j1",
        )
        assert event.event_type == "application.submitted"


class TestInterviewEvents:
    def test_interview_scheduled_event(self):
        scheduled = datetime.now(timezone.utc)
        event = InterviewScheduledEvent(
            tenant_id="t1",
            interview_id="i1",
            candidate_id="c1",
            interview_type="technical",
            scheduled_at=scheduled,
        )
        assert event.event_type == "interview.scheduled"
        assert event.scheduled_at == scheduled


class TestUserEvents:
    def test_user_registered_event(self):
        event = UserRegisteredEvent(
            tenant_id="t1",
            user_id="u1",
            email="user@test.com",
            role="recruiter",
        )
        assert event.event_type == "user.registered"
        assert event.role == "recruiter"


class TestEventSerialization:
    def test_all_events_have_event_type(self):
        events = [
            CandidateCreatedEvent(tenant_id="t1", candidate_id="c1"),
            EvaluationCompletedEvent(tenant_id="t1", evaluation_id="e1", candidate_id="c1", evaluation_type="test", overall_score=5.0),
            JobCreatedEvent(tenant_id="t1", job_id="j1", title="Test"),
        ]
        for event in events:
            data = event.model_dump()
            assert "event_type" in data
            assert "event_id" in data
            assert "timestamp" in data

    def test_event_id_uniqueness(self):
        e1 = CandidateCreatedEvent(tenant_id="t1", candidate_id="c1")
        e2 = CandidateCreatedEvent(tenant_id="t1", candidate_id="c2")
        assert e1.event_id != e2.event_id
