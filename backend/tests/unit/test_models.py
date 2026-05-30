"""Unit tests for all domain models — create, validate, serialize."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from shared.core.models.identity import (
    User, UserCreate, UserRead, UserUpdate, TokenPair, LoginRequest, RegisterRequest,
    UserRole, UserStatus,
)
from shared.core.models.candidate import (
    Candidate, CandidateCreate, CandidateRead, CandidateUpdate,
    CandidateProfile, Skill, CandidateSkill, ExperienceEntry,
    SeniorityLevel, CandidateStatus,
)
from shared.core.models.recruitment import (
    Job, JobCreate, JobRead, JobUpdate, JobStatus, JobType,
    Pipeline, Application, ApplicationStatus,
)
from shared.core.models.evaluation import (
    Evaluation, EvaluationCreate, EvaluationRead,
    EvaluationCriteria, Benchmark,
    CodingSession, CodeSnapshot, ExecutionResult,
    PPEEvaluation, PPESessionCreate, PPESessionRead, PPEEvaluationRead,
    EvaluationType, CodeExecutionRequest,
)
from shared.core.models.interview import (
    Interview, InterviewCreate, InterviewRead,
    InterviewSession, InterviewQuestion, InterviewFeedback,
    InterviewFeedbackCreate, InterviewFeedbackRead,
    InterviewType, InterviewStatus,
)


pytestmark = [pytest.mark.unit, pytest.mark.models]


# --- Identity Models ---

class TestUserModel:
    def test_user_create(self):
        user = User(
            id=str(uuid4()),
            tenant_id="tenant-1",
            email="test@example.com",
            full_name="Test User",
            hashed_password="hashed123",
        )
        assert user.email == "test@example.com"
        assert user.role == UserRole.CANDIDATE
        assert user.status == UserStatus.ACTIVE

    def test_user_create_schema(self):
        schema = UserCreate(email="test@example.com", full_name="Test", password="password123")
        assert schema.email == "test@example.com"
        assert schema.role == UserRole.CANDIDATE

    def test_user_read_schema(self):
        now = datetime.now(timezone.utc)
        schema = UserRead(
            id="u1", tenant_id="t1", email="test@example.com",
            full_name="Test", role=UserRole.RECRUITER,
            status=UserStatus.ACTIVE, created_at=now,
        )
        assert schema.id == "u1"
        assert schema.role == UserRole.RECRUITER

    def test_user_update_schema(self):
        schema = UserUpdate(full_name="Updated Name")
        assert schema.full_name == "Updated Name"
        assert schema.phone is None

    def test_token_pair(self):
        pair = TokenPair(access_token="at", refresh_token="rt", expires_in=1800)
        assert pair.token_type == "bearer"
        assert pair.expires_in == 1800

    def test_login_request(self):
        req = LoginRequest(email="user@test.com", password="pass123")
        assert req.email == "user@test.com"

    def test_register_request(self):
        req = RegisterRequest(email="user@test.com", full_name="User", password="pass123")
        assert req.role == UserRole.CANDIDATE


# --- Candidate Models ---

class TestCandidateModel:
    def test_candidate_create(self):
        c = Candidate(
            id=str(uuid4()),
            tenant_id="t1",
            email="jane@test.com",
            full_name="Jane Doe",
        )
        assert c.status == CandidateStatus.NEW
        assert c.tags == "[]"

    def test_candidate_create_schema(self):
        schema = CandidateCreate(email="jane@test.com", full_name="Jane Doe")
        assert schema.full_name == "Jane Doe"

    def test_candidate_status_values(self):
        assert CandidateStatus.NEW == "new"
        assert CandidateStatus.HIRED == "hired"

    def test_seniority_level_values(self):
        assert SeniorityLevel.JUNIOR == "junior"
        assert SeniorityLevel.STAFF == "staff"
        assert SeniorityLevel.PRINCIPAL == "principal"

    def test_candidate_profile(self):
        profile = CandidateProfile(
            id=str(uuid4()),
            candidate_id="c1",
            tenant_id="t1",
            seniority_level="senior",
            years_experience=8,
        )
        assert profile.years_experience == 8

    def test_skill(self):
        skill = Skill(
            id=str(uuid4()),
            tenant_id="t1",
            name="Python",
            category="language",
            normalized_name="python",
        )
        assert skill.normalized_name == "python"

    def test_experience_entry(self):
        exp = ExperienceEntry(
            id=str(uuid4()),
            candidate_id="c1",
            tenant_id="t1",
            company="Acme",
            title="Software Engineer",
            is_current=True,
        )
        assert exp.is_current is True


# --- Recruitment Models ---

class TestRecruitmentModels:
    def test_job_create(self):
        job = Job(
            id=str(uuid4()),
            tenant_id="t1",
            title="Backend Engineer",
            description="Build APIs",
        )
        assert job.status == JobStatus.DRAFT
        assert job.job_type == JobType.FULL_TIME

    def test_job_create_schema(self):
        schema = JobCreate(title="Backend Engineer", description="Build APIs")
        assert schema.job_type == JobType.FULL_TIME

    def test_job_status_values(self):
        assert JobStatus.OPEN == "open"
        assert JobStatus.CLOSED == "closed"

    def test_application(self):
        app = Application(
            id=str(uuid4()),
            tenant_id="t1",
            candidate_id="c1",
            job_id="j1",
        )
        assert app.status == ApplicationStatus.APPLIED

    def test_pipeline(self):
        pipeline = Pipeline(
            id=str(uuid4()),
            tenant_id="t1",
            name="Default Pipeline",
        )
        assert pipeline.is_default is False


# --- Evaluation Models ---

class TestEvaluationModels:
    def test_evaluation_create(self):
        ev = Evaluation(
            id=str(uuid4()),
            tenant_id="t1",
            candidate_id="c1",
            evaluation_type="resume_screening",
        )
        assert ev.status == "pending"
        assert ev.tokens_consumed == 0

    def test_evaluation_create_schema(self):
        schema = EvaluationCreate(
            candidate_id="c1",
            evaluation_type=EvaluationType.RESUME_SCREENING,
        )
        assert schema.evaluation_type == EvaluationType.RESUME_SCREENING

    def test_ppe_evaluation(self):
        ppe = PPEEvaluation(
            id=str(uuid4()),
            session_id="s1",
            tenant_id="t1",
            candidate_id="c1",
        )
        assert ppe.correctness_score == 0.0
        assert ppe.overall_score == 0.0

    def test_ppe_session_create_schema(self):
        schema = PPESessionCreate(interview_id="i1", language="python")
        assert schema.difficulty == "medium"
        assert schema.max_duration_seconds == 1800

    def test_code_execution_request(self):
        req = CodeExecutionRequest(code="print('hello')", language="python")
        assert req.code == "print('hello')"

    def test_coding_session(self):
        cs = CodingSession(
            id=str(uuid4()),
            tenant_id="t1",
            interview_id="i1",
            candidate_id="c1",
        )
        assert cs.language == "python"
        assert cs.max_hints == 3


# --- Interview Models ---

class TestInterviewModels:
    def test_interview_create(self):
        interview = Interview(
            id=str(uuid4()),
            tenant_id="t1",
            application_id="a1",
            candidate_id="c1",
            job_id="j1",
            interview_type="technical",
        )
        assert interview.status == InterviewStatus.SCHEDULED

    def test_interview_create_schema(self):
        schema = InterviewCreate(
            application_id="a1",
            interview_type=InterviewType.TECHNICAL,
        )
        assert schema.duration_minutes == 60

    def test_interview_feedback_create(self):
        schema = InterviewFeedbackCreate(
            overall_score=8.5,
            technical_score=9.0,
            recommendation="hire",
        )
        assert schema.overall_score == 8.5
        assert schema.strengths == []

    def test_interview_session(self):
        session = InterviewSession(
            id=str(uuid4()),
            interview_id="i1",
            tenant_id="t1",
        )
        assert session.total_tokens_used == 0

    def test_interview_question(self):
        q = InterviewQuestion(
            id=str(uuid4()),
            session_id="s1",
            tenant_id="t1",
            question_text="Explain your experience",
            question_type="behavioral",
        )
        assert q.order_index == 0
