"""Domain models for AI-ROS."""

from shared.core.models.identity import (
    User, Session, APIKey, Credential,
    UserRole, UserStatus,
    UserCreate, UserRead, UserUpdate,
    TokenPair, LoginRequest, RegisterRequest,
)
from shared.core.models.api_key import ApiKey
from shared.core.models.candidate import (
    Candidate, CandidateProfile, Skill, CandidateSkill, ExperienceEntry,
    SeniorityLevel, CandidateStatus,
    CandidateCreate, CandidateRead, CandidateUpdate, CandidateProfileRead, SkillRead,
)
from shared.core.models.candidate_activity import (
    CandidateActivity,
    CandidateActivityType,
)
from shared.core.models.recruitment import (
    Job, Pipeline, Application,
    JobStatus, JobType, ApplicationStatus,
    JobCreate, JobRead, JobUpdate,
    ApplicationCreate, ApplicationRead, MatchResult,
)
from shared.core.models.application import (
    Application as PipelineApplication,
    ApplicationStage,
    ApplicationCreate as PipelineApplicationCreate,
    ApplicationStageUpdate,
    ApplicationRead as PipelineApplicationRead,
    ApplicationListResponse,
    ApplicationsByStageResponse,
    PipelineSummaryResponse,
    BulkStageMoveRequest,
    BulkStageMoveResponse,
    PIPELINE_STAGES,
    application_to_read,
    parse_meta,
    serialise_meta,
    validate_stage,
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
from shared.core.models.conversation import Conversation, ConversationMessage
from shared.core.models.message import (
    Conversation as CandidateConversation,
    Message,
    ConversationStatus,
    ConversationCreate,
    ConversationRead,
    ConversationDetail,
    MessageCreate,
    MessageRead,
    MarkReadRequest,
)
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
from shared.core.models.integration import (
    IntegrationConfig,
    SUPPORTED_PROVIDERS,
    SLACK,
    TEAMS,
)
from shared.core.models.email_template import EmailTemplate
from shared.core.models.email_sequence import (
    EmailSequence,
    EmailSequenceStep,
    EmailSequenceEnrollment,
)
from shared.core.models.tag import (
    Tag,
    TagApplication,
    TagEntityType,
    TagCreate,
    TagRead,
    TagUpdate,
    TagListResponse,
    TagCreateResponse,
    TagUpdateResponse,
    TagDeleteResponse,
    TagApplyRequest,
    TagApplyResponse,
    TagRemoveRequest,
    TagRemoveResponse,
    PopularTagItem,
    PopularTagsResponse,
    EntityTagRead,
    EntityTagListResponse,
    AddEntityTagRequest,
    AddEntityTagResponse,
)
from shared.core.models.talent_pool import (
    TalentPool,
    TalentPoolMember,
    TalentPoolCreate,
    TalentPoolUpdate,
    TalentPoolRead,
    TalentPoolMemberRead,
    TalentPoolWithMembersRead,
    AddCandidatesRequest,
    AddCandidatesResponse,
    SearchCriteria,
    ExternalCandidate,
    SearchResponse,
    ImportRequest,
    ImportResponse,
    TalentPoolSource,
)
from shared.core.models.offer import (
    Offer,
    OfferStatus,
    OfferTemplate,
)
from shared.core.models.referral import (
    Referral,
    ReferralProgram,
    ReferralStatus,
    RewardType,
    ReferralCreate,
    ReferralRead,
    ReferralUpdate,
    ReferralListResponse,
    ReferralProgramRead,
    ReferralProgramCreate,
    ReferralProgramUpdate,
    ReferralStats,
)
from shared.core.models.assessment import (
    Answer,
    AnswerRead,
    AnswerSubmit,
    Assessment,
    AssessmentCreate,
    AssessmentCreateResponse,
    AssessmentDetail,
    AssessmentListResponse,
    AssessmentRead,
    AssessmentResultsResponse,
    AssessmentStatus,
    Question,
    QuestionRead,
    QuestionType,
    SubmitAnswersRequest,
    SubmitAnswersResponse,
)
from shared.core.models.video import (
    VideoRoom,
    VideoInterview,
    VideoRecording,
    VideoRoomStatus,
    VideoInterviewStatus,
    VideoRoomCreate,
    VideoRoomRead,
    VideoRoomJoinResponse,
    VideoInterviewRead,
    VideoInterviewListResponse,
    RecordingRead,
    StartRecordingRequest,
    StopRecordingResponse,
)

__all__ = [
    "ApiKey",
    "User", "Session", "APIKey", "Credential",
    "UserRole", "UserStatus",
    "UserCreate", "UserRead", "UserUpdate",
    "TokenPair", "LoginRequest", "RegisterRequest",
    "Candidate", "CandidateProfile", "Skill", "CandidateSkill", "ExperienceEntry",
    "SeniorityLevel", "CandidateStatus",
    "CandidateCreate", "CandidateRead", "CandidateUpdate", "CandidateProfileRead", "SkillRead",
    "CandidateActivity", "CandidateActivityType",
    "Referral", "ReferralProgram", "ReferralStatus", "RewardType",
    "ReferralCreate", "ReferralRead", "ReferralUpdate", "ReferralListResponse",
    "ReferralProgramRead", "ReferralProgramCreate", "ReferralProgramUpdate", "ReferralStats",
    "TalentPool", "TalentPoolMember",
    "TalentPoolCreate", "TalentPoolUpdate", "TalentPoolRead",
    "TalentPoolMemberRead", "TalentPoolWithMembersRead",
    "AddCandidatesRequest", "AddCandidatesResponse",
    "SearchCriteria", "ExternalCandidate", "SearchResponse",
    "ImportRequest", "ImportResponse", "TalentPoolSource",
    "Job", "Pipeline", "Application",
    "JobStatus", "JobType", "ApplicationStatus",
    "JobCreate", "JobRead", "JobUpdate",
    "ApplicationCreate", "ApplicationRead", "MatchResult",
    "PipelineApplication", "ApplicationStage",
    "PipelineApplicationCreate", "ApplicationStageUpdate",
    "PipelineApplicationRead", "ApplicationListResponse",
    "ApplicationsByStageResponse", "PipelineSummaryResponse",
    "BulkStageMoveRequest", "BulkStageMoveResponse",
    "PIPELINE_STAGES",
    "application_to_read", "parse_meta", "serialise_meta", "validate_stage",
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
    "Conversation", "ConversationMessage",
    "CandidateConversation", "Message", "ConversationStatus",
    "ConversationCreate", "ConversationRead", "ConversationDetail",
    "MessageCreate", "MessageRead", "MarkReadRequest",
    "NotificationChannel", "NotificationChannelType", "NotificationPreference",
    "Metric", "Dashboard", "Report",
    "AuditLog",
    "AuditEntry", "ConsentRecord", "DataExportRequest", "DataDeletionRequest",
    "SearchHistory",
    "SearchHistoryRead", "PopularQueryItem", "PopularQueriesResponse",
    "NoResultsQueryItem", "NoResultsResponse", "RecentSearchesResponse",
    "SearchAnalyticsResponse",
    "Webhook", "WebhookDelivery",
    "IntegrationConfig", "SUPPORTED_PROVIDERS", "SLACK", "TEAMS",
    "EmailTemplate",
    "EmailSequence", "EmailSequenceStep", "EmailSequenceEnrollment",
    "Tag", "TagApplication", "TagEntityType",
    "TagCreate", "TagRead", "TagUpdate",
    "TagListResponse", "TagCreateResponse", "TagUpdateResponse", "TagDeleteResponse",
    "TagApplyRequest", "TagApplyResponse",
    "TagRemoveRequest", "TagRemoveResponse",
    "PopularTagItem", "PopularTagsResponse",
    "EntityTagRead", "EntityTagListResponse",
    "AddEntityTagRequest", "AddEntityTagResponse",
    "Offer", "OfferStatus", "OfferTemplate",
    "Answer", "AnswerRead", "AnswerSubmit",
    "Assessment", "AssessmentCreate", "AssessmentCreateResponse",
    "AssessmentDetail", "AssessmentListResponse", "AssessmentRead",
    "AssessmentResultsResponse", "AssessmentStatus",
    "Question", "QuestionRead", "QuestionType",
    "SubmitAnswersRequest", "SubmitAnswersResponse",
]
