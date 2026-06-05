/**
 * AI Recruitment OS — Comprehensive API Type Definitions
 * Source: backend OpenAPI spec (144 schemas, 201 endpoints across 25+ services)
 * All types are strict; use `Pick`/`Partial`/`Omit` to derive variants.
 */

export type ISODateString = string;
export type UUID = string;
export type Email = string;

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: string;
  service?: string;
  version?: string;
  [k: string]: unknown;
}

export interface MessageResponse {
  message: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page?: number;
  page_size?: number;
}

export interface ListResponse<T> {
  data: T[];
}

export interface HTTPValidationError {
  detail: Array<{ loc: (string | number)[]; msg: string; type: string }>;
}

export interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export namespace AuthTypes {
  export interface UserProfile {
    id: UUID;
    email: Email;
    full_name: string;
    role: string;
    status: string;
    email_verified: boolean;
    avatar_url: string | null;
    phone: string | null;
    mfa_enabled: boolean;
    tenant_id: UUID;
    created_at: ISODateString;
    last_login_at: ISODateString | null;
    is_demo: boolean;
  }

  export type MeResponse = UserProfile;

  export interface LoginRequest {
    email: Email;
    password: string;
  }

  export interface LoginResponse {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    user: UserProfile | null;
  }

  export interface RegisterRequest {
    email: Email;
    full_name: string;
    password: string;
    role?: string;
    bypass_password_complexity?: boolean;
  }

  export interface RegisterResponse {
    id: UUID;
    email: Email;
    full_name: string;
    role: string;
    created: boolean;
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    user: UserProfile;
    verification_email_sent: boolean;
  }

  export interface RefreshRequest {
    refresh_token: string;
  }

  export interface RefreshResponse {
    access_token: string;
    refresh_token: string | null;
    token_type: string;
    expires_in: number;
  }

  export interface LogoutResponse {
    logged_out: boolean;
  }

  export interface ForgotPasswordRequest {
    email: Email;
  }

  export type ForgotPasswordResponse = MessageResponse;

  export interface ResetPasswordRequest {
    token: string;
    new_password: string;
  }

  export type ResetPasswordResponse = MessageResponse;

  export interface ChangePasswordRequest {
    current_password: string;
    new_password: string;
  }

  export interface ProfileUpdateRequest {
    full_name?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
  }

  export interface DeactivateRequest {
    reason?: string | null;
  }

  export interface VerifyEmailRequest {
    token: string;
  }

  export interface ResendVerificationRequest {
    email: Email;
  }

  export interface MFAEnableRequest {
    user_id: UUID;
  }

  export interface MFAEnableResponse {
    secret: string;
    otpauth_url: string;
    backup_codes: string[];
  }

  export interface MFAVerifyRequest {
    user_id: UUID;
    code: string;
  }

  export interface MFAVerifyResponse {
    verified: boolean;
    message: string | null;
  }

  export interface APIKeyCreateRequest {
    name: string;
    scopes?: string[];
    expires_in_days?: number | null;
  }

  export interface APIKey {
    id: UUID;
    name: string;
    key: string;
    scopes: string[];
    expires_at: ISODateString | null;
    created_at: ISODateString;
  }

  export interface SSOLoginResponse {
    access_token: string;
    refresh_token: string;
    token_type: string;
    provider: string;
    is_new_user: boolean;
  }
}

// ---------------------------------------------------------------------------
// SSO
// ---------------------------------------------------------------------------

export namespace SsoTypes {
  export interface SsoProvider {
    id: string;
    name: string;
    icon: string;
    auth_url: string;
  }

  export interface SsoProviderList {
    providers: SsoProvider[];
  }

  export interface SsoAuthorizeUrlResponse {
    authorization_url: string;
    state: string;
  }

  export interface SsoCallbackRequest {
    provider: string;
    code: string;
    redirect_uri: string;
  }

  export interface SsoUserInfo {
    provider: string;
    external_id: string;
    email: Email;
    full_name: string;
    avatar_url: string | null;
    linked_at: ISODateString;
  }
}

// ---------------------------------------------------------------------------
// Mailing
// ---------------------------------------------------------------------------

export namespace MailingTypes {
  export interface EmailRecord {
    id: UUID;
    to: string | string[];
    subject: string;
    body: string;
    template: string | null;
    sent_at: ISODateString;
    status: string;
  }

  export interface SentEmailsResponse {
    emails: EmailRecord[];
    total: number;
  }

  export interface SendEmailRequest {
    to: string | string[];
    subject: string;
    body: string;
    template?: string | null;
    template_vars?: Record<string, unknown> | null;
  }

  export interface MailingToken {
    token: string;
    email: Email;
    purpose: string;
    expires_at: ISODateString;
    used: boolean;
  }

  export interface MailingTokenList {
    tokens: MailingToken[];
  }

  export interface VerifyTokenRequest {
    token: string;
    purpose: string;
  }

  export interface VerifyTokenResponse {
    valid: boolean;
    email: Email | null;
  }
}

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

export namespace TenantTypes {
  export interface Tenant {
    id: UUID;
    name: string;
    slug: string;
    plan: string;
    status: string;
    created_at: ISODateString;
    settings: Record<string, unknown>;
    branding: Record<string, unknown>;
  }

  export interface TenantCreateRequest {
    name: string;
    slug: string;
    plan?: string;
    settings?: Record<string, unknown>;
  }

  export interface TenantUpdateRequest {
    name?: string;
    slug?: string;
    plan?: string;
    status?: string;
  }

  export interface TenantSettings {
    theme: string;
    locale: string;
    timezone: string;
    features: Record<string, boolean>;
    [k: string]: unknown;
  }

  export interface TenantSettingsUpdateRequest {
    settings: Partial<TenantSettings>;
  }

  export interface TenantBranding {
    logo_url: string | null;
    primary_color: string;
    accent_color: string;
    favicon_url: string | null;
    [k: string]: unknown;
  }

  export interface BrandingUpdateRequest {
    branding: Partial<TenantBranding>;
  }

  export interface TenantUsage {
    candidates: number;
    jobs: number;
    interviews: number;
    storage_mb: number;
    api_calls: number;
    period_start: ISODateString;
    period_end: ISODateString;
  }

  export interface TenantUsageHistory {
    history: Array<{
      period: string;
      candidates: number;
      jobs: number;
      api_calls: number;
    }>;
  }
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export namespace UserTypes {
  export interface User {
    id: UUID;
    email: Email;
    full_name: string;
    role: string;
    status: string;
    tenant_id: UUID;
    created_at: ISODateString;
    last_active_at: ISODateString | null;
    avatar_url: string | null;
  }

  export interface UserCreateRequest {
    email: Email;
    full_name: string;
    role: string;
    password?: string;
    status?: string;
  }

  export interface UserUpdateRequest {
    full_name?: string;
    role?: string;
    status?: string;
    avatar_url?: string | null;
  }

  export interface UserActivity {
    user_id: UUID;
    events: Array<{
      action: string;
      resource: string;
      timestamp: ISODateString;
      meta?: Record<string, unknown>;
    }>;
  }
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export namespace CandidateTypes {
  export interface ContactInfo {
    email: Email;
    phone?: string | null;
    location?: string | null;
    linkedin?: string | null;
    portfolio?: string | null;
  }

  export interface ExperienceEntry {
    company: string;
    title: string;
    start_date: string;
    end_date: string | null;
    description?: string;
  }

  export interface CandidateProfileData {
    contact: ContactInfo;
    summary?: string;
    skills: string[];
    experience: ExperienceEntry[];
    education?: Array<Record<string, unknown>>;
    languages?: string[];
    tags?: string[];
  }

  export interface CandidateSummary {
    id: UUID;
    full_name: string;
    email: Email;
    headline: string | null;
    location: string | null;
    skills: string[];
    status: string;
    created_at: ISODateString;
    updated_at: ISODateString | null;
  }

  export interface CandidateDetail extends CandidateSummary {
    phone: string | null;
    linkedin: string | null;
    portfolio: string | null;
    profile: CandidateProfileData;
    enrichment: Record<string, unknown> | null;
    match_scores: Record<string, number> | null;
    notes: string | null;
    tenant_id: UUID;
  }

  export type CandidateListResponse = PaginatedResponse<CandidateSummary> & {
    items?: CandidateSummary[];
  };

  export interface CandidateCreateRequest {
    full_name: string;
    email: Email;
    headline?: string;
    location?: string;
    skills?: string[];
    profile?: Partial<CandidateProfileData>;
    source?: string;
  }

  export type CandidateCreateResponse = CandidateDetail;

  export interface CandidateUpdateRequest {
    full_name?: string;
    headline?: string;
    location?: string;
    phone?: string;
    linkedin?: string;
    skills?: string[];
    status?: string;
    notes?: string;
    profile?: Partial<CandidateProfileData>;
  }

  export type CandidateUpdateResponse = CandidateDetail;

  export interface CandidateDeleteResponse {
    deleted: boolean;
    id: UUID;
  }

  export interface EnrichmentTaskResponse {
    task_id: UUID;
    status: string;
    candidate_id: UUID;
    started_at: ISODateString;
  }

  export interface JobMatch {
    job_id: UUID;
    title: string;
    company: string;
    score: number;
    matched_skills: string[];
    missing_skills: string[];
    rationale: string;
  }

  export interface MatchCandidateResponse {
    candidate_id: UUID;
    matches: JobMatch[];
    total: number;
    match_score?: number;
    result?: {
      match_score?: number;
      matches?: JobMatch[];
      factors?: Record<string, number>;
      matching_skills?: string[];
      missing_skills?: string[];
      recommendation?: string;
    };
    factors?: Record<string, number>;
    matching_skills?: string[];
    missing_skills?: string[];
    recommendation?: string;
    [k: string]: unknown;
  }
}

// ---------------------------------------------------------------------------
// Resumes
// ---------------------------------------------------------------------------

export namespace ResumeTypes {
  export interface ResumeSummary {
    id: UUID;
    candidate_id: UUID;
    file_name: string;
    mime_type: string;
    size_bytes: number;
    uploaded_at: ISODateString;
    parsed: boolean;
  }

  export interface ResumeDetail extends ResumeSummary {
    url: string;
    parsed_at: ISODateString | null;
    parse_errors: string[];
  }

  export type ResumeListResponse = PaginatedResponse<ResumeSummary>;

  export interface ResumeUploadRequest {
    candidate_id: UUID;
    file_name: string;
    mime_type: string;
    content_base64: string;
  }

  export interface ResumeUploadResponse {
    id: UUID;
    candidate_id: UUID;
    file_name: string;
    size_bytes: number;
    parsed: boolean;
  }

  export interface ParsedResumeResponse {
    resume_id: UUID;
    candidate_id: UUID;
    parsed: {
      contact: CandidateTypes.ContactInfo;
      summary: string;
      skills: string[];
      experience: CandidateTypes.ExperienceEntry[];
      education: Array<Record<string, unknown>>;
      languages: string[];
    };
    parsed_at: ISODateString;
  }

  export interface ResumeReparseResponse {
    resume_id: UUID;
    status: string;
    started_at: ISODateString;
  }
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export namespace JobTypes {
  export interface JobSummary {
    id: UUID;
    title: string;
    company: string;
    location: string;
    employment_type: string;
    status: string;
    applicants_count: number;
    created_at: ISODateString;
    updated_at: ISODateString | null;
    salary_min: number | null;
    salary_max: number | null;
    currency: string | null;
  }

  export interface JobDetail extends JobSummary {
    description: string;
    requirements: string[];
    nice_to_have: string[];
    benefits: string[];
    skills: string[];
    experience_years_min: number | null;
    experience_years_max: number | null;
    remote: boolean;
    tenant_id: UUID;
    posted_by: UUID;
  }

  export type JobListResponse = PaginatedResponse<JobSummary>;

  export interface JobCreateRequest {
    title: string;
    company: string;
    location: string;
    description: string;
    requirements?: string[];
    skills?: string[];
    employment_type?: string;
    experience_years_min?: number | null;
    experience_years_max?: number | null;
    salary_min?: number | null;
    salary_max?: number | null;
    currency?: string;
    remote?: boolean;
  }

  export type JobCreateResponse = JobDetail;

  export interface JobUpdateRequest {
    title?: string;
    location?: string;
    description?: string;
    requirements?: string[];
    skills?: string[];
    status?: string;
    salary_min?: number | null;
    salary_max?: number | null;
    remote?: boolean;
  }

  export type JobUpdateResponse = JobDetail;

  export interface JobDeleteResponse {
    deleted: boolean;
    id: UUID;
  }

  export interface MatchedCandidate {
    candidate_id: UUID;
    full_name: string;
    email: Email;
    score: number;
    matched_skills: string[];
    missing_skills: string[];
    rationale: string;
  }

  export interface MatchedCandidatesResponse {
    job_id: UUID;
    candidates: MatchedCandidate[];
    total: number;
  }
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

export namespace InterviewTypes {
  export interface InterviewSummary {
    id: UUID;
    candidate_id: UUID;
    job_id: UUID;
    scheduled_at: ISODateString;
    duration_minutes: number;
    status: string;
    type: string;
    interviewer: string;
  }

  export interface InterviewDetail extends InterviewSummary {
    notes: string | null;
    feedback: string | null;
    score: number | null;
    started_at: ISODateString | null;
    completed_at: ISODateString | null;
    recording_url: string | null;
    transcript_id: UUID | null;
  }

  export type InterviewListResponse = PaginatedResponse<InterviewSummary>;

  export interface InterviewCreate {
    candidate_id: UUID;
    job_id: UUID;
    scheduled_at: ISODateString;
    duration_minutes: number;
    type: string;
    interviewer: string;
    notes?: string;
  }

  export interface InterviewFeedback {
    score: number;
    strengths: string[];
    weaknesses: string[];
    recommendation: string;
    notes: string;
  }

  export interface InterviewTranscript {
    interview_id: UUID;
    segments: Array<{
      speaker: string;
      text: string;
      timestamp: ISODateString;
      confidence: number;
    }>;
    language: string;
  }

  export interface InterviewAnalytics {
    interview_id: UUID;
    duration_seconds: number;
    talk_ratio: Record<string, number>;
    sentiment_score: number;
    keywords: string[];
    competencies: Array<{ name: string; score: number }>;
  }
}

// ---------------------------------------------------------------------------
// PPE (Programming Practice Environment)
// ---------------------------------------------------------------------------

export namespace PpeTypes {
  export interface PpeProblem {
    id: UUID;
    title: string;
    description: string;
    difficulty: 'easy' | 'medium' | 'hard';
    tags: string[];
    languages: string[];
    acceptance_rate: number | null;
    created_at: ISODateString;
  }

  export interface PpeSession {
    id: UUID;
    candidate_id: UUID;
    problem_id: UUID;
    language: string;
    status: 'pending' | 'active' | 'completed' | 'expired';
    code: string;
    starter_code?: string;
    test_results: Array<{
      test_id: string;
      passed: boolean;
      runtime_ms: number | null;
      output: string | null;
      error: string | null;
    }> | null;
    score: number | null;
    started_at: ISODateString | null;
    submitted_at: ISODateString | null;
    hints_used: number;
    time_limit_minutes?: number | null;
    [k: string]: unknown;
  }

  export interface PPESessionCreate {
    problem_id: UUID;
    candidate_id: UUID;
    language: string;
    time_limit_minutes?: number;
  }

  export interface CodeSubmission {
    code: string;
    language: string;
    run_tests?: boolean;
  }

  export interface CodeExecutionResult {
    session_id: UUID;
    status: string;
    test_results: Array<{
      test_id: string;
      passed: boolean;
      runtime_ms: number | null;
      output: string | null;
      expected: string | null;
      error: string | null;
    }>;
    overall_passed: boolean;
    score: number;
  }

  export interface HintRequest {
    focus_area?: string;
  }

  export interface HintResponse {
    session_id: UUID;
    hint: string;
    content?: string;
    text?: string;
    hints_remaining: number;
    [k: string]: unknown;
  }

  export interface PpeLanguage {
    id: string;
    name: string;
    version: string;
    extensions: string[];
  }

  export interface PpeDifficulty {
    id: string;
    label: string;
    description: string;
  }
}

// ---------------------------------------------------------------------------
// AI Orchestrator
// ---------------------------------------------------------------------------

export namespace AiTypes {
  export interface Agent {
    id: string;
    name: string;
    type: string;
    description: string;
    capabilities: string[];
    enabled: boolean;
  }

  export interface AgentListResponse {
    agents: Agent[];
  }

  export interface AgentCapability {
    agent_type: string;
    inputs: Array<{ name: string; type: string; required: boolean }>;
    outputs: Array<{ name: string; type: string }>;
    examples: Array<Record<string, unknown>>;
  }

  export interface OrchestrateRequest {
    task?: string;
    input?: string | Record<string, unknown>;
    agents?: string[];
    context?: Record<string, unknown>;
    stream?: boolean;
    agent_type?: string;
  }

  export interface OrchestrateResponse {
    task_id: UUID;
    result: Record<string, unknown>;
    agents_used: string[];
    elapsed_ms: number;
    agent_name?: string;
    confidence_score?: number;
    reasoning_chain?: string[] | Array<Record<string, unknown>> | Array<string | Record<string, unknown>>;
    [k: string]: unknown;
  }

  export interface CreateTaskRequest {
    type: string;
    payload: Record<string, unknown>;
    priority?: 'low' | 'normal' | 'high';
  }

  export interface AiTask {
    id: UUID;
    type: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    priority: string;
    payload: Record<string, unknown>;
    result: Record<string, unknown> | null;
    error: string | null;
    created_at: ISODateString;
    started_at: ISODateString | null;
    completed_at: ISODateString | null;
  }
}

// ---------------------------------------------------------------------------
// AI Evaluation
// ---------------------------------------------------------------------------

export namespace AiEvaluationTypes {
  export interface EvaluationCriteria {
    name: string;
    weight: number;
    description: string;
    rubric: string[];
  }

  export interface EvaluationRequest {
    candidate_id: UUID;
    job_id: UUID;
    criteria?: EvaluationCriteria[];
    resume_id?: UUID | null;
    include_explanations?: boolean;
  }

  export interface Evaluation {
    id: UUID;
    candidate_id: UUID;
    job_id: UUID;
    overall_score: number;
    scores: Array<{ criterion: string; score: number; weight: number }>;
    recommendation: 'strong_hire' | 'hire' | 'neutral' | 'no_hire' | 'strong_no_hire';
    rationale: string;
    strengths: string[];
    concerns: string[];
    created_at: ISODateString;
  }

  export interface EvaluationExplanation {
    evaluation_id: UUID;
    factors: Array<{
      factor: string;
      contribution: number;
      evidence: string;
    }>;
  }

  export interface EvaluationFeedbackRequest {
    rating: number;
    accurate: boolean;
    comments?: string;
  }

  export interface EvaluationFeedback {
    evaluation_id: UUID;
    feedback_count: number;
    average_rating: number;
  }

  export interface CompareRequest {
    candidate_ids: UUID[];
    job_id: UUID;
    criteria?: EvaluationCriteria[];
  }

  export interface CompareResponse {
    job_id: UUID;
    rankings: Array<{
      candidate_id: UUID;
      overall_score: number;
      recommendation: string;
    }>;
    pairwise: Array<{
      candidate_a: UUID;
      candidate_b: UUID;
      preferred: UUID;
      confidence: number;
    }>;
  }

  export interface EvaluationBenchmark {
    name: string;
    description: string;
    mean_score: number;
    std_dev: number;
    sample_size: number;
  }
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export namespace AnalyticsTypes {
  export interface DashboardData {
    time_range: string;
    candidates: { total: number; new: number; change_pct: number };
    jobs: { total: number; active: number; change_pct: number };
    interviews: { scheduled: number; completed: number; change_pct: number };
    hires: { total: number; change_pct: number };
    funnels: Array<{ stage: string; count: number }>;
    sources: Array<{ source: string; count: number }>;
    avg_time_to_hire_days?: number;
    [k: string]: unknown;
  }

  export interface PipelineData {
    stages: Array<{
      stage: string;
      count: number;
      candidates: Array<{ id: UUID; full_name: string; days_in_stage: number }>;
    }>;
  }

  export interface AiPerformance {
    total_tasks: number;
    success_rate: number;
    avg_latency_ms: number;
    agents: Array<{
      agent_type: string;
      tasks: number;
      success_rate: number;
      avg_score: number;
    }>;
  }

  export interface RecruiterProductivity {
    recruiters: Array<{
      user_id: UUID;
      full_name: string;
      candidates_reviewed: number;
      interviews_conducted: number;
      hires: number;
      avg_time_to_hire_days: number;
    }>;
  }

  export interface TimeToHire {
    avg_days: number;
    median_days: number;
    by_job: Array<{ job_id: UUID; title: string; days: number }>;
    by_source: Array<{ source: string; days: number }>;
    trend: Array<{ period: string; days: number }>;
  }

  export interface GenerateReportRequest {
    type: 'pipeline' | 'funnel' | 'time_to_hire' | 'sources' | 'custom';
    time_range: string;
    params?: Record<string, unknown>;
    format?: 'json' | 'csv' | 'pdf';
  }

  export interface Report {
    id: UUID;
    type: string;
    status: 'pending' | 'ready' | 'failed';
    url: string | null;
    created_at: ISODateString;
    completed_at: ISODateString | null;
  }
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

export namespace WorkflowTypes {
  export interface Workflow {
    id: UUID;
    name: string;
    description: string;
    trigger: string;
    steps: Array<Record<string, unknown>>;
    active: boolean;
    is_active?: boolean;
    runs?: number;
    execution_count?: number;
    last_run?: ISODateString | null;
    created_at: ISODateString;
    updated_at: ISODateString | null;
  }

  export interface WorkflowCreate {
    name: string;
    description?: string;
    trigger: string;
    steps: Array<Record<string, unknown>>;
    active?: boolean;
  }

  export interface WorkflowUpdate {
    name?: string;
    description?: string;
    trigger?: string;
    steps?: Array<Record<string, unknown>>;
    active?: boolean;
  }

  export interface WorkflowExecution {
    id: UUID;
    workflow_id: UUID;
    status: 'pending' | 'running' | 'completed' | 'failed';
    started_at: ISODateString;
    completed_at: ISODateString | null;
    error: string | null;
    context: Record<string, unknown>;
  }

  export type WorkflowListResponse = PaginatedResponse<Workflow> & {
    items?: Workflow[];
  };
  export type ExecutionListResponse = PaginatedResponse<WorkflowExecution> & {
    items?: WorkflowExecution[];
  };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export namespace NotificationTypes {
  export interface Notification {
    id: UUID;
    user_id: UUID;
    type: string;
    title: string;
    body: string;
    read: boolean;
    link: string | null;
    created_at: ISODateString;
    read_at: ISODateString | null;
    meta?: Record<string, unknown>;
  }

  export type NotificationListResponse = PaginatedResponse<Notification>;

  export interface NotificationCreate {
    user_id: UUID;
    type: string;
    title: string;
    body: string;
    link?: string | null;
    meta?: Record<string, unknown>;
  }

  export interface NotificationUpdate {
    read?: boolean;
  }

  export interface NotificationPreferences {
    email_enabled: boolean;
    push_enabled: boolean;
    in_app_enabled: boolean;
    categories: Record<string, { email: boolean; push: boolean; in_app: boolean }>;
  }

  export type PreferencesUpdate = Partial<NotificationPreferences>;
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export namespace ComplianceTypes {
  export interface ComplianceStatus {
    overall: 'compliant' | 'warning' | 'violation';
    gdpr: { status: string; last_audit: ISODateString | null };
    ccpa: { status: string; last_audit: ISODateString | null };
    hipaa: { status: string; last_audit: ISODateString | null };
    issues: Array<{ severity: string; area: string; description: string }>;
  }

  export interface CompliancePolicy {
    id: UUID;
    name: string;
    jurisdiction: string;
    version: string;
    active: boolean;
    url: string;
  }

  export interface RetentionPolicy {
    candidate_data_days: number;
    interview_data_days: number;
    resume_data_days: number;
    audit_log_days: number;
    auto_purge: boolean;
  }

  export interface AuditEntry {
    id: UUID;
    actor_id: UUID;
    action: string;
    resource: string;
    resource_id: string;
    timestamp: ISODateString;
    ip_address: string | null;
    user_agent: string | null;
    meta: Record<string, unknown>;
  }

  export type AuditEntryIn = Partial<AuditEntry>;
  export type AuditLogResponse = PaginatedResponse<AuditEntry>;

  export interface ConsentRecord {
    id: UUID;
    user_id: UUID;
    purpose: string;
    granted: boolean;
    timestamp: ISODateString;
    expires_at: ISODateString | null;
  }

  export interface ConsentRecordRequest {
    user_id: UUID;
    purpose: string;
    granted: boolean;
    expires_at?: ISODateString | null;
  }

  export type ConsentListResponse = PaginatedResponse<ConsentRecord>;

  export interface DataExportRequest {
    user_id: UUID;
    format?: 'json' | 'csv';
  }

  export interface DataExportJob {
    id: UUID;
    user_id: UUID;
    status: 'pending' | 'processing' | 'ready' | 'failed';
    url: string | null;
    requested_at: ISODateString;
    completed_at: ISODateString | null;
  }

  export interface DataDeletionRequestIn {
    user_id: UUID;
    reason?: string;
  }

  export interface ComplianceCheckRequest {
    scope?: 'full' | 'gdpr' | 'ccpa' | 'hipaa';
  }

  export interface ComplianceCheckResult {
    scope: string;
    passed: number;
    failed: number;
    warnings: number;
    issues: Array<{ check: string; severity: string; detail: string }>;
  }

  export interface ComplianceReport {
    generated_at: ISODateString;
    overall_score: number;
    sections: Array<{
      name: string;
      score: number;
      issues: number;
    }>;
    recommendations: string[];
  }
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export namespace BillingTypes {
  export interface Plan {
    id: string;
    name: string;
    description: string;
    price_monthly: number;
    price_yearly: number;
    currency: string;
    features: string[];
    limits: Record<string, number>;
    popular: boolean;
  }

  export type PlanListResponse = Plan[];

  export interface Subscription {
    id: UUID;
    plan_id: string;
    status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused' | 'incomplete';
    current_period_start: ISODateString;
    current_period_end: ISODateString;
    cancel_at: ISODateString | null;
    trial_end: ISODateString | null;
    default_payment_method_id: string | null;
  }

  export interface BillingCustomer {
    id: UUID;
    email: Email;
    name: string;
    default_payment_method: string | null;
    address: Record<string, string> | null;
    tax_id: string | null;
  }

  export interface CustomerUpdateRequest {
    name?: string;
    email?: Email;
    address?: Record<string, string> | null;
    tax_id?: string | null;
  }

  export interface SetupIntentResponse {
    client_secret: string;
    setup_intent_id: string;
  }

  export interface PaymentMethod {
    id: string;
    type: 'card' | 'bank_account' | 'paypal' | 'sepa';
    brand: string | null;
    last4: string;
    exp_month: number | null;
    exp_year: number | null;
    is_default: boolean;
  }

  export interface AddPaymentMethodBody {
    payment_method_id: string;
  }

  export interface Invoice {
    id: UUID;
    number: string;
    amount_due: number;
    amount_paid: number;
    currency: string;
    status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible' | 'succeeded' | 'pending' | 'overdue' | string;
    issued_at: ISODateString;
    paid_at: ISODateString | null;
    pdf_url: string | null;
    line_items: Array<{ description: string; amount: number; quantity: number }>;
    amount?: number;
    date?: string;
    created_at?: string;
    period_start?: string;
    period_end?: string;
    [k: string]: unknown;
  }

  export type InvoiceListResponse = PaginatedResponse<Invoice> & {
    items?: Invoice[];
  };

  export interface UsageRecord {
    metric: string;
    quantity: number;
    unit: string;
    period_start: ISODateString;
    period_end: ISODateString;
  }

  export interface UsageEvent {
    metric: string;
    quantity: number;
    metadata?: Record<string, unknown>;
  }

  export interface CouponRequest {
    code: string;
  }

  export interface CouponResult {
    valid: boolean;
    code: string;
    discount_pct: number | null;
    discount_amount: number | null;
    message: string;
  }

  export interface PortalResponse {
    url: string;
  }

  export interface TrialRequest {
    plan_id: string;
  }

  export interface SubscriptionUpdateRequest {
    plan_id?: string;
    quantity?: number;
  }

  export interface CancelSubscriptionRequest {
    at_period_end?: boolean;
    reason?: string;
  }

  export interface PauseSubscriptionRequest {
    resume_at?: ISODateString | null;
  }

  export interface CheckoutRequest {
    plan_id: string;
    success_url: string;
    cancel_url: string;
  }

  export interface CheckoutResponse {
    checkout_url: string;
    session_id: string;
  }

  export interface WebhookResponse {
    received: boolean;
    processed: boolean;
  }

  export interface RefundRequest {
    invoice_id: UUID;
    amount?: number;
    reason?: string;
  }

  export interface CreditRequest {
    customer_id: UUID;
    amount: number;
    description: string;
  }

  export interface AdminSubscription extends Subscription {
    customer_id: UUID;
    customer_email: Email;
  }
}

// ---------------------------------------------------------------------------
// Search (vector_search_service)
// ---------------------------------------------------------------------------

export namespace SearchTypes {
  export interface CandidateSearchRequest {
    query: string;
    top_k?: number;
    filters?: Record<string, unknown>;
    min_score?: number;
  }

  export interface JobSearchRequest {
    query: string;
    top_k?: number;
    filters?: Record<string, unknown>;
    min_score?: number;
  }

  export interface SearchHit<T = unknown> {
    id: string;
    score: number;
    payload: T;
  }

  export interface SearchResponse<T = unknown> {
    hits: SearchHit<T>[];
    total: number;
    query: string;
  }

  export interface EmbeddingRequest {
    text: string;
    model?: string;
  }

  export interface Embedding {
    id: UUID;
    vector: number[];
    model: string;
    dimensions: number;
  }

  export interface SimilarityRequest {
    text: string;
    collection: 'candidates' | 'jobs' | 'resumes';
    top_k?: number;
  }
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

export namespace WebSocketTypes {
  export interface WsHealth {
    status: string;
    connections: number;
  }

  export interface BroadcastRequest {
    channel: string;
    message: Record<string, unknown>;
    target_user_ids?: UUID[];
  }

  export interface WsConnection {
    id: UUID;
    user_id: UUID;
    connected_at: ISODateString;
    last_ping_at: ISODateString | null;
  }

  export type WsConnectionList = WsConnection[];

  export interface BroadcastLogEntry {
    id: UUID;
    channel: string;
    message: Record<string, unknown>;
    delivered: number;
    sent_at: ISODateString;
  }

  export type BroadcastLog = BroadcastLogEntry[];
}

// ---------------------------------------------------------------------------
// Resume Analysis
// ---------------------------------------------------------------------------

export namespace ResumeAnalysisTypes {
  export interface AnalyzeRequest {
    resume_id: UUID;
    job_id?: UUID | null;
  }

  export interface ResumeAnalysis {
    resume_id: UUID;
    candidate_id: UUID;
    score: number;
    skills: Array<{ name: string; proficiency: 'beginner' | 'intermediate' | 'advanced' }>;
    experience_years: number;
    education_level: string;
    quality_issues: string[];
    summary: string;
  }

  export interface ExtractRequest {
    resume_id: UUID;
    fields: string[];
  }

  export interface ExtractResponse {
    resume_id: UUID;
    extracted: Record<string, unknown>;
  }

  export interface ResumeCompareRequest {
    resume_ids: UUID[];
    job_id?: UUID | null;
  }

  export interface ResumeCompareResponse {
    rankings: Array<{
      resume_id: UUID;
      score: number;
      rationale: string;
    }>;
  }
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export namespace SchedulingTypes {
  export interface SuggestRequest {
    candidate_id?: UUID;
    interviewer_ids: UUID[];
    duration_minutes: number;
    window_start: ISODateString;
    window_end: ISODateString;
    timezone?: string;
  }

  export interface SuggestedSlot {
    start: ISODateString;
    end: ISODateString;
    interviewer_id: UUID;
    score: number;
    conflicts: string[];
  }

  export interface SuggestResponse {
    slots: SuggestedSlot[];
  }

  export interface OptimizeRequest {
    interviews: Array<{
      candidate_id: UUID;
      duration_minutes: number;
      interviewer_ids: UUID[];
    }>;
    window_start: ISODateString;
    window_end: ISODateString;
  }

  export interface OptimizeResponse {
    schedule: Array<{
      candidate_id: UUID;
      interviewer_id: UUID;
      start: ISODateString;
      end: ISODateString;
    }>;
  }

  export interface Availability {
    interviewer_id: UUID;
    slots: Array<{ start: ISODateString; end: ISODateString }>;
    timezone: string;
  }

  export interface AvailabilitySetRequest {
    interviewer_id: UUID;
    slots: Array<{ start: ISODateString; end: ISODateString }>;
    timezone?: string;
  }
}

// ---------------------------------------------------------------------------
// Fraud Detection
// ---------------------------------------------------------------------------

export namespace FraudTypes {
  export interface FraudAnalyzeRequest {
    candidate_id: UUID;
    signals?: string[];
  }

  export interface FraudAnalysis {
    id: UUID;
    candidate_id: UUID;
    risk_score: number;
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    signals: Array<{
      type: string;
      severity: string;
      description: string;
      evidence: Record<string, unknown>;
    }>;
    recommendation: 'proceed' | 'review' | 'reject';
    created_at: ISODateString;
  }

  export interface FraudPattern {
    id: string;
    name: string;
    description: string;
    severity: string;
    occurrences: number;
  }

  export type FraudPatternList = FraudPattern[];
  export type FraudAnalysisList = PaginatedResponse<FraudAnalysis>;
}

// ---------------------------------------------------------------------------
// Compliance Automation
// ---------------------------------------------------------------------------

export namespace ComplianceAutomationTypes {
  export interface ComplianceStatus {
    status: 'compliant' | 'warning' | 'violation';
    score: number;
    last_audit_at: ISODateString | null;
    frameworks: Array<{ name: string; status: string; issues: number }>;
  }

  export interface AuditRequest {
    scope?: string[];
    deep_scan?: boolean;
  }

  export interface AuditResult {
    audit_id: UUID;
    started_at: ISODateString;
    completed_at: ISODateString | null;
    findings: Array<{
      severity: 'low' | 'medium' | 'high' | 'critical';
      category: string;
      description: string;
      affected_resources: string[];
    }>;
    summary: { total: number; passed: number; failed: number };
  }

  export type AuditListResponse = PaginatedResponse<AuditResult>;

  export interface GdprRequest {
    user_id: UUID;
    type: 'export' | 'delete';
    reason?: string;
  }

  export interface GdprResult {
    job_id: UUID;
    user_id: UUID;
    type: string;
    status: string;
    started_at: ISODateString;
    completed_at: ISODateString | null;
    url: string | null;
  }

  export type RetentionPolicy = ComplianceTypes.RetentionPolicy;
}

// ---------------------------------------------------------------------------
// Talent Intelligence
// ---------------------------------------------------------------------------

export namespace TalentIntelTypes {
  export interface MarketInsights {
    region: string;
    top_skills: Array<{ skill: string; demand: number; growth_pct: number }>;
    talent_supply: number;
    avg_salary: number;
    currency: string;
    trends: Array<{ period: string; value: number }>;
  }

  export interface CompetitorAnalysis {
    company: string;
    open_positions: number;
    avg_time_to_hire_days: number;
    top_skills: string[];
    market_share_pct: number;
  }

  export type CompetitorList = CompetitorAnalysis[];

  export interface SalaryBenchmark {
    role: string;
    region: string;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    currency: string;
  }

  export interface TalentPool {
    total: number;
    by_skill: Array<{ skill: string; count: number }>;
    by_location: Array<{ location: string; count: number }>;
    candidates: CandidateTypes.CandidateSummary[];
  }
}

// ---------------------------------------------------------------------------
// Workflow Automation
// ---------------------------------------------------------------------------

export namespace WorkflowAutomationTypes {
  export interface Template {
    id: UUID;
    name: string;
    description: string;
    category: string;
    steps: number;
    popularity: number;
  }

  export type TemplateList = Template[];

  export interface Trigger {
    id: UUID;
    name: string;
    event: string;
    workflow_id: UUID | null;
    active: boolean;
    created_at: ISODateString;
  }

  export type TriggerList = Trigger[];

  export interface TriggerCreateRequest {
    name: string;
    event: string;
    workflow_id?: UUID | null;
    conditions?: Record<string, unknown>;
  }

  export type ExecutionListResponse = PaginatedResponse<WorkflowTypes.WorkflowExecution>;
}

// ---------------------------------------------------------------------------
// Innovations
// ---------------------------------------------------------------------------

export namespace InnovationsTypes {
  export interface BiasDetectionRequest {
    text: string;
    context?: string;
  }

  export interface BiasDetectionResult {
    bias_detected: boolean;
    bias_score: number;
    flagged_phrases: Array<{ phrase: string; bias_type: string; suggestion: string }>;
    overall_assessment: string;
  }

  export interface PredictSuccessRequest {
    candidate_id: UUID;
    job_id: UUID;
  }

  export interface SuccessPrediction {
    candidate_id: UUID;
    job_id: UUID;
    success_probability: number;
    confidence: number;
    factors: Array<{ factor: string; weight: number; value: number }>;
    recommendation: string;
  }

  export interface SmartScheduleRequest {
    candidate_id: UUID;
    duration_minutes: number;
    preferred_dates?: ISODateString[];
  }

  export interface SmartScheduleResponse {
    recommended_slots: Array<{ start: ISODateString; end: ISODateString; score: number }>;
  }

  export interface SkillsGapRequest {
    candidate_id: UUID;
    target_role: string;
  }

  export interface SkillsGap {
    candidate_id: UUID;
    target_role: string;
    matched_skills: string[];
    missing_skills: Array<{ skill: string; importance: 'low' | 'medium' | 'high' }>;
    learning_path: Array<{ skill: string; resources: string[] }>;
    readiness_score: number;
  }

  export interface DiversityReport {
    total: number;
    by_gender: Record<string, number>;
    by_ethnicity: Record<string, number>;
    by_age_group: Record<string, number>;
    by_location: Record<string, number>;
    generated_at: ISODateString;
  }

  export interface VideoAnalysisRequest {
    interview_id: UUID;
    video_url: string;
  }

  export interface VideoAnalysisResult {
    interview_id: UUID;
    engagement_score: number;
    sentiment_timeline: Array<{ timestamp: number; sentiment: number }>;
    filler_words: Array<{ word: string; count: number }>;
    speaking_pace_wpm: number;
    eye_contact_pct: number;
  }

  export interface ExperiencePredictionRequest {
    candidate_id: UUID;
    target_role: string;
  }

  export interface ExperiencePrediction {
    candidate_id: UUID;
    target_role: string;
    predicted_years: number;
    confidence: number;
    reasoning: string;
  }

  export interface RecruiterAssistRequest {
    query: string;
    context?: Record<string, unknown>;
  }

  export interface RecruiterAssistResponse {
    answer: string;
    sources: Array<{ title: string; url: string; snippet: string }>;
    suggestions: string[];
  }

  export interface CandidateExperienceReport {
    candidate_id: UUID;
    overall_score: number;
    application_to_response_days: number;
    interviews_count: number;
    communication_rating: number;
    feedback: string;
  }
}

// ---------------------------------------------------------------------------
// Activity Feed
// ---------------------------------------------------------------------------

export namespace ActivityTypes {
  export type ActionType =
    | 'create'
    | 'update'
    | 'delete'
    | 'login'
    | 'logout'
    | 'view'
    | 'export'
    | 'message'
    | 'schedule'
    | 'cancel'
    | 'complete'
    | 'invite'
    | 'settings_change'
    | 'generate'
    | 'upload'
    | 'download'
    | 'comment'
    | 'approve'
    | 'reject'
    | 'archive'
    | 'restore'
    | 'assign'
    | 'unassign'
    | 'merge'
    | 'split'
    | 'share'
    | 'tag'
    | 'untag'
    | 'publish'
    | 'unpublish'
    | 'other';

  export type EntityType =
    | 'candidate'
    | 'job'
    | 'interview'
    | 'offer'
    | 'workflow'
    | 'report'
    | 'message'
    | 'email'
    | 'sms'
    | 'pipeline'
    | 'stage'
    | 'user'
    | 'team'
    | 'role'
    | 'permission'
    | 'integration'
    | 'webhook'
    | 'tag'
    | 'note'
    | 'document'
    | 'resume'
    | 'evaluation'
    | 'assessment'
    | 'campaign'
    | 'segment'
    | 'billing'
    | 'subscription'
    | 'invoice'
    | 'session'
    | 'login'
    | 'settings'
    | 'api_key'
    | 'tenant'
    | 'notification'
    | 'announcement'
    | 'ppe_session'
    | 'ai_agent'
    | 'other';

  export interface Actor {
    id: string;
    name: string;
    email?: string;
    avatar_url?: string | null;
    role?: string;
  }

  export interface ActivityTarget {
    type: EntityType;
    id: string;
    label: string;
    url?: string | null;
  }

  export interface ActivityEntry {
    id: string;
    action: ActionType | string;
    action_label?: string;
    description?: string;
    actor: Actor;
    target?: ActivityTarget | null;
    entity_type?: EntityType | string | null;
    entity_id?: string | null;
    entity_label?: string | null;
    entity_url?: string | null;
    metadata?: Record<string, unknown> | null;
    ip_address?: string | null;
    user_agent?: string | null;
    location?: string | null;
    created_at: ISODateString;
  }

  export interface ActivityFilter {
    actor_id?: string;
    action?: ActionType | string;
    entity_type?: EntityType | string;
    target_id?: string;
    target_type?: EntityType | string;
    from?: ISODateString;
    to?: ISODateString;
    search?: string;
    page?: number;
    page_size?: number;
  }

  export interface ActivityFeedResponse {
    data: ActivityEntry[];
    total: number;
    page: number;
    page_size: number;
    has_more: boolean;
  }

  export interface ActivityTypeOption {
    value: ActionType | string;
    label: string;
    description?: string;
    category?: 'auth' | 'create' | 'update' | 'delete' | 'communication' | 'system' | 'other';
    icon?: string;
  }

  export interface ActivityTypesResponse {
    data: ActivityTypeOption[];
  }
}
