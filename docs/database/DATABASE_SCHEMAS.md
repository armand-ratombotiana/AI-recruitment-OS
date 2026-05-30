# Database Architecture — Complete PostgreSQL Schemas

## Schema Strategy

采用 **Schema-per-Tenant** 方案，每个租户拥有独立的 PostgreSQL schema，通过 `search_path` 实现隔离。

```sql
-- Tenant isolation via PostgreSQL schemas
ALTER DATABASE airos SET search_path TO public;

-- Row-level security as defense-in-depth
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON candidates
    USING (tenant_id = current_setting('app.current_tenant'));
```

## Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";          -- pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS "pg_trgm";         -- Trigram similarity
CREATE EXTENSION IF NOT EXISTS "btree_gin";       -- GIN index support
```

## Identity Schema

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'candidate',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    avatar_url TEXT,
    phone VARCHAR(50),
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(tenant_id, role);

CREATE TABLE credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,  -- 'local', 'google', 'github', 'saml'
    provider_user_id VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255) NOT NULL,
    user_agent TEXT,
    ip_address INET,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    scopes TEXT[] DEFAULT '{}',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);
```

## Organization Schema

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    plan VARCHAR(50) NOT NULL DEFAULT 'free',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    name VARCHAR(200) NOT NULL,
    parent_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    organization_id UUID REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    lead_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Candidate Schema

```sql
CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    phone VARCHAR(50),
    location VARCHAR(200),
    linkedin_url TEXT,
    portfolio_url TEXT,
    status VARCHAR(50) DEFAULT 'new',
    source VARCHAR(100),
    tags JSONB DEFAULT '[]',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_candidates_tenant ON candidates(tenant_id);
CREATE INDEX idx_candidates_status ON candidates(tenant_id, status);
CREATE INDEX idx_candidates_email ON candidates(tenant_id, email);
CREATE INDEX idx_candidates_name_trgm ON candidates USING gin(full_name gin_trgm_ops);

CREATE TABLE candidate_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    tenant_id VARCHAR(255) NOT NULL,
    summary TEXT,
    seniority_level VARCHAR(50),
    years_experience INTEGER,
    education JSONB,
    certifications JSONB,
    languages JSONB,
    domains JSONB,
    raw_profile JSONB,
    embedding_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_candidate ON candidate_profiles(candidate_id);

CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100),
    normalized_name VARCHAR(200) NOT NULL,
    UNIQUE(tenant_id, normalized_name)
);

CREATE INDEX idx_skills_name ON skills(tenant_id, normalized_name);

CREATE TABLE candidate_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id),
    tenant_id VARCHAR(255) NOT NULL,
    proficiency VARCHAR(50),
    years_used INTEGER,
    source VARCHAR(100),
    UNIQUE(candidate_id, skill_id)
);

CREATE INDEX idx_candidate_skills_candidate ON candidate_skills(candidate_id);
CREATE INDEX idx_candidate_skills_skill ON candidate_skills(skill_id);
```

## Resume Schema

```sql
CREATE TABLE resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    file_name VARCHAR(500) NOT NULL,
    file_key VARCHAR(1000) NOT NULL,  -- S3 key
    file_size INTEGER,
    mime_type VARCHAR(100),
    status VARCHAR(50) DEFAULT 'uploaded',
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resumes_candidate ON resumes(candidate_id);
CREATE INDEX idx_resumes_tenant ON resumes(tenant_id);

CREATE TABLE parsed_resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    tenant_id VARCHAR(255) NOT NULL,
    raw_text TEXT,
    sections JSONB,  -- {education: [...], experience: [...], skills: [...]}
    structured_data JSONB,
    parsing_confidence FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_parsed_resume ON parsed_resumes(resume_id);

CREATE TABLE resume_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    tenant_id VARCHAR(255) NOT NULL,
    embedding vector(3072),
    model_used VARCHAR(100),
    chunk_text TEXT,
    chunk_index INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resume_embeddings_ivfflat ON resume_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

## Recruitment Schema

```sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    title VARCHAR(300) NOT NULL,
    description TEXT NOT NULL,
    department VARCHAR(200),
    location VARCHAR(200),
    remote_policy VARCHAR(50),
    job_type VARCHAR(50) DEFAULT 'full_time',
    seniority_required VARCHAR(50),
    salary_min INTEGER,
    salary_max INTEGER,
    currency VARCHAR(10) DEFAULT 'USD',
    required_skills JSONB DEFAULT '[]',
    preferred_skills JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'draft',
    hiring_manager_id UUID REFERENCES users(id),
    pipeline_id UUID,
    embedding_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_tenant ON jobs(tenant_id);
CREATE INDEX idx_jobs_status ON jobs(tenant_id, status);
CREATE INDEX idx_jobs_embedding ON jobs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    stages JSONB NOT NULL DEFAULT '[]',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    candidate_id UUID NOT NULL REFERENCES candidates(id),
    job_id UUID NOT NULL REFERENCES jobs(id),
    pipeline_id UUID REFERENCES pipelines(id),
    current_stage VARCHAR(100) DEFAULT 'applied',
    status VARCHAR(50) DEFAULT 'applied',
    match_score FLOAT,
    resume_id UUID REFERENCES resumes(id),
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_applications_tenant ON applications(tenant_id);
CREATE INDEX idx_applications_candidate ON applications(candidate_id);
CREATE INDEX idx_applications_job ON applications(job_id);
CREATE INDEX idx_applications_status ON applications(tenant_id, status);
```

## Interview Schema

```sql
CREATE TABLE interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    application_id UUID NOT NULL REFERENCES applications(id),
    candidate_id UUID NOT NULL REFERENCES candidates(id),
    job_id UUID NOT NULL REFERENCES jobs(id),
    interview_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'scheduled',
    scheduled_at TIMESTAMPTZ,
    duration_minutes INTEGER DEFAULT 60,
    interviewer_id UUID REFERENCES users(id),
    is_ai_interview BOOLEAN DEFAULT FALSE,
    room_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interviews_tenant ON interviews(tenant_id);
CREATE INDEX idx_interviews_application ON interviews(application_id);
CREATE INDEX idx_interviews_scheduled ON interviews(scheduled_at) WHERE status = 'scheduled';

CREATE TABLE interview_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID NOT NULL REFERENCES interviews(id),
    tenant_id VARCHAR(255) NOT NULL,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    transcript JSONB,
    recording_url TEXT,
    ai_agent_id VARCHAR(255),
    agent_model VARCHAR(100),
    total_tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE interview_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID NOT NULL REFERENCES interviews(id),
    session_id UUID REFERENCES interview_sessions(id),
    tenant_id VARCHAR(255) NOT NULL,
    reviewer_id VARCHAR(255),
    is_ai_generated BOOLEAN DEFAULT FALSE,
    overall_score FLOAT CHECK (overall_score >= 0 AND overall_score <= 10),
    technical_score FLOAT CHECK (technical_score >= 0 AND technical_score <= 10),
    communication_score FLOAT CHECK (communication_score >= 0 AND communication_score <= 10),
    cultural_fit_score FLOAT CHECK (cultural_fit_score >= 0 AND cultural_fit_score <= 10),
    strengths JSONB DEFAULT '[]',
    weaknesses JSONB DEFAULT '[]',
    recommendation VARCHAR(50),
    notes TEXT,
    reasoning_trace JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Evaluation Schema

```sql
CREATE TABLE evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    candidate_id UUID NOT NULL REFERENCES candidates(id),
    job_id UUID REFERENCES jobs(id),
    evaluation_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    overall_score FLOAT CHECK (overall_score >= 0 AND overall_score <= 10),
    confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
    ai_model_used VARCHAR(100),
    tokens_consumed INTEGER DEFAULT 0,
    reasoning_trace JSONB,
    explanation TEXT,
    dimensions JSONB,
    benchmark_id UUID,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_evaluations_tenant ON evaluations(tenant_id);
CREATE INDEX idx_evaluations_candidate ON evaluations(candidate_id);
CREATE INDEX idx_evaluations_type ON evaluations(tenant_id, evaluation_type);

CREATE TABLE evaluation_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    weight FLOAT DEFAULT 1.0,
    max_score FLOAT DEFAULT 10.0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Pair Programming Schema

```sql
CREATE TABLE coding_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    interview_id UUID NOT NULL REFERENCES interviews(id),
    candidate_id UUID NOT NULL REFERENCES candidates(id),
    language VARCHAR(20) NOT NULL,
    status VARCHAR(50) DEFAULT 'created',
    problem_id VARCHAR(255),
    problem_title VARCHAR(300),
    problem_description TEXT,
    difficulty VARCHAR(20) DEFAULT 'medium',
    max_duration_seconds INTEGER DEFAULT 1800,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    room_id VARCHAR(255),
    total_code_executions INTEGER DEFAULT 0,
    total_test_cases_passed INTEGER DEFAULT 0,
    total_test_cases_failed INTEGER DEFAULT 0,
    hints_used INTEGER DEFAULT 0,
    max_hints INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coding_sessions_tenant ON coding_sessions(tenant_id);
CREATE INDEX idx_coding_sessions_interview ON coding_sessions(interview_id);

CREATE TABLE code_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES coding_sessions(id),
    tenant_id VARCHAR(255) NOT NULL,
    code_content TEXT NOT NULL,
    cursor_position INTEGER,
    line_number INTEGER,
    version INTEGER DEFAULT 0,
    created_by VARCHAR(50) DEFAULT 'candidate',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_code_snapshots_session ON code_snapshots(session_id);

CREATE TABLE execution_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES coding_sessions(id),
    tenant_id VARCHAR(255) NOT NULL,
    snapshot_id UUID REFERENCES code_snapshots(id),
    language VARCHAR(20) NOT NULL,
    code_content TEXT NOT NULL,
    stdout TEXT,
    stderr TEXT,
    exit_code INTEGER DEFAULT 0,
    execution_time_ms INTEGER DEFAULT 0,
    memory_used_mb FLOAT DEFAULT 0.0,
    test_results JSONB,
    all_tests_passed BOOLEAN DEFAULT FALSE,
    total_tests INTEGER DEFAULT 0,
    passed_tests INTEGER DEFAULT 0,
    failed_tests INTEGER DEFAULT 0,
    timeout_exceeded BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_execution_results_session ON execution_results(session_id);

CREATE TABLE ppe_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES coding_sessions(id),
    tenant_id VARCHAR(255) NOT NULL,
    candidate_id UUID NOT NULL REFERENCES candidates(id),
    correctness_score FLOAT DEFAULT 0,
    efficiency_score FLOAT DEFAULT 0,
    algorithm_quality_score FLOAT DEFAULT 0,
    edge_case_handling_score FLOAT DEFAULT 0,
    big_o_understanding FLOAT DEFAULT 0,
    tradeoff_reasoning FLOAT DEFAULT 0,
    scalability_awareness FLOAT DEFAULT 0,
    data_structures_understanding FLOAT DEFAULT 0,
    readability_score FLOAT DEFAULT 0,
    maintainability_score FLOAT DEFAULT 0,
    modularity_score FLOAT DEFAULT 0,
    naming_conventions_score FLOAT DEFAULT 0,
    decomposition_score FLOAT DEFAULT 0,
    iterative_reasoning_score FLOAT DEFAULT 0,
    debugging_approach_score FLOAT DEFAULT 0,
    optimization_strategy_score FLOAT DEFAULT 0,
    explanation_clarity_score FLOAT DEFAULT 0,
    collaborative_interaction_score FLOAT DEFAULT 0,
    reasoning_transparency_score FLOAT DEFAULT 0,
    overall_score FLOAT DEFAULT 0,
    seniority_estimation VARCHAR(50),
    confidence_level FLOAT DEFAULT 0,
    hiring_recommendation VARCHAR(50),
    strengths JSONB DEFAULT '[]',
    weaknesses JSONB DEFAULT '[]',
    reasoning_trace JSONB,
    benchmark_comparison JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ppe_evaluations_session ON ppe_evaluations(session_id);
CREATE INDEX idx_ppe_evaluations_candidate ON ppe_evaluations(candidate_id);
```

## Workflow Schema

```sql
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    trigger_type VARCHAR(50) DEFAULT 'event',
    trigger_config JSONB,
    steps_config JSONB DEFAULT '[]',
    variables JSONB DEFAULT '{}',
    version INTEGER DEFAULT 1,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflows_tenant ON workflows(tenant_id);

CREATE TABLE workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    tenant_id VARCHAR(255) NOT NULL,
    step_order INTEGER NOT NULL,
    step_type VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    config JSONB,
    conditions JSONB,
    on_success VARCHAR(255),
    on_failure VARCHAR(255),
    retry_count INTEGER DEFAULT 0,
    timeout_seconds INTEGER DEFAULT 300,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id),
    tenant_id VARCHAR(255) NOT NULL,
    trigger_event VARCHAR(255),
    context_data JSONB,
    current_step_id UUID,
    status VARCHAR(50) DEFAULT 'running',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

CREATE INDEX idx_workflow_executions_tenant ON workflow_executions(tenant_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status) WHERE status = 'running';
```

## AI Memory Schema

```sql
CREATE TABLE ai_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    memory_type VARCHAR(50) NOT NULL,  -- 'short_term', 'long_term', 'recruiter', 'candidate'
    entity_id VARCHAR(255),            -- candidate_id, recruiter_id, etc.
    content TEXT NOT NULL,
    embedding vector(3072),
    metadata JSONB DEFAULT '{}',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_memories_tenant ON ai_memories(tenant_id);
CREATE INDEX idx_ai_memories_type ON ai_memories(tenant_id, memory_type);
CREATE INDEX idx_ai_memories_entity ON ai_memories(entity_id);
CREATE INDEX idx_ai_memories_embedding ON ai_memories
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE TABLE knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    source_type VARCHAR(50),  -- 'resume', 'interview', 'policy', 'knowledge_base'
    source_id VARCHAR(255),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    chunk_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    tenant_id VARCHAR(255) NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(3072),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_chunks_document ON knowledge_chunks(document_id);
CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

## Audit Schema

```sql
CREATE TABLE audit_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    actor_type VARCHAR(50) NOT NULL,  -- 'user', 'ai_agent', 'system'
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON audit_entries(tenant_id);
CREATE INDEX idx_audit_actor ON audit_entries(actor_id);
CREATE INDEX idx_audit_resource ON audit_entries(resource_type, resource_id);
CREATE INDEX idx_audit_created ON audit_entries(created_at);

-- Partitioning by month for performance
CREATE TABLE audit_entries_2025_01 PARTITION OF audit_entries
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

## Connection Pooling (PgBouncer)

```ini
[databases]
airos = host=localhost port=5432 dbname=airos

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 5
server_idle_timeout = 600
```
