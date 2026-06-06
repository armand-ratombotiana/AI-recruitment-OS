"""Domain models for AI-ROS."""

from shared.core.models.identity import (
    User, Session, APIKey, Credential,
    UserRole, UserStatus,
    UserCreate, UserRead, UserUpdate,
    TokenPair, LoginRequest, RegisterRequest,
)
from shared.core.models.candidate import (
    Candidate, CandidateProfile, Skill, CandidateSkill, ExperienceEntry,
    SeniorityLevel, CandidateStatus,
    CandidateCreate, CandidateRead, CandidateUpdate, CandidateProfileRead, SkillRead,
)
from shared.core.models.recruitment import (
    Job, Pipeline, Application,
    JobStatus, JobType, ApplicationStatus,
    JobCreate, JobRead, JobUpdate,
    ApplicationCreate, ApplicationRead, MatchResult,
)
from shared.core.models.interview import (
    Interview, InterviewSession, InterviewQuestion, InterviewFeedback,
    InterviewType, InterviewStatus,
    InterviewCreate, InterviewRead,
    InterviewFeedbackCreate, InterviewFeedbackRead,
)
from shared.core.models.evaluation import (
    Evaluation, EvaluationCriteria, Benchmark,
    EvaluationType,
    EvaluationCreate, EvaluationRead,
    PPESessionCreate, PPESessionRead,
    CodeExecutionRequest, PPEEvaluationRead,
)
from shared.core.models.pair_programming import (
    CodingSession, CodeSnapshot, ExecutionResult, PPEEvaluation,
)
from shared.core.models.workflow import (
    Workflow, WorkflowRun,
)
from shared.core.models.notification import Notification
from shared.core.models.notification_preference import (
    NotificationChannel,
    NotificationChannelType,
    NotificationPreference,
)
from shared.core.models.analytics import (
    Metric, Dashboard, Report,
)
from shared.core.models.audit_log import AuditLog
from shared.core.models.compliance import (
    AuditEntry,
    ConsentRecord,
    DataExportRequest,
    DataDeletionRequest,
)
from shared.core.models.search import (
    SearchHistory,
    SearchHistoryRead,
    PopularQueryItem,
    PopularQueriesResponse,
    NoResultsQueryItem,
    NoResultsResponse,
    RecentSearchesResponse,
    SearchAnalyticsResponse,
)
from shared.core.models.webhook import Webhook, WebhookDelivery

__all__ = [
    "User", "Session", "APIKey", "Credential",
    "UserRole", "UserStatus",
    "UserCreate", "UserRead", "UserUpdate",
    "TokenPair", "LoginRequest", "RegisterRequest",
    "Candidate", "CandidateProfile", "Skill", "CandidateSkill", "ExperienceEntry",
    "SeniorityLevel", "CandidateStatus",
    "CandidateCreate", "CandidateRead", "CandidateUpdate", "CandidateProfileRead", "SkillRead",
    "Job", "Pipeline", "Application",
    "JobStatus", "JobType", "ApplicationStatus",
    "JobCreate", "JobRead", "JobUpdate",
    "ApplicationCreate", "ApplicationRead", "MatchResult",
    "Interview", "InterviewSession", "InterviewQuestion", "InterviewFeedback",
    "InterviewType", "InterviewStatus",
    "InterviewCreate", "InterviewRead",
    "InterviewFeedbackCreate", "InterviewFeedbackRead",
    "Evaluation", "EvaluationCriteria", "Benchmark",
    "EvaluationType",
    "EvaluationCreate", "EvaluationRead",
    "PPESessionCreate", "PPESessionRead",
    "CodeExecutionRequest", "PPEEvaluationRead",
    "CodingSession", "CodeSnapshot", "ExecutionResult", "PPEEvaluation",
    "Workflow", "WorkflowRun", "Notification",
    "NotificationChannel", "NotificationChannelType", "NotificationPreference",
    "Metric", "Dashboard", "Report",
    "AuditLog",
    "AuditEntry", "ConsentRecord", "DataExportRequest", "DataDeletionRequest",
    "SearchHistory",
    "SearchHistoryRead", "PopularQueryItem", "PopularQueriesResponse",
    "NoResultsQueryItem", "NoResultsResponse", "RecentSearchesResponse",
    "SearchAnalyticsResponse",
    "Webhook", "WebhookDelivery",
]
