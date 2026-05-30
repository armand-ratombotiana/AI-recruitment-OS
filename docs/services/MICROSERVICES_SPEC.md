# Microservices Architecture — Complete Service Specifications

## 1. API Gateway Service

### Responsibilities
- Route all external HTTP/WS traffic to internal services
- TLS termination and certificate management
- Rate limiting (per-tenant, per-user, per-endpoint)
- Request authentication and token validation
- Request/response transformation
- API versioning enforcement
- CORS handling
- WebSocket upgrade proxying
- Request logging and correlation ID injection
- Circuit breaking for downstream services

### API Endpoints (External)
| Method | Path | Description | Rate Limit |
|--------|------|-------------|------------|
| * | `/api/v1/*` | All API routes | 100/min |
| * | `/ws/*` | WebSocket connections | 10 concurrent |
| GET | `/health` | Health check | unlimited |

### Database Ownership
- None — stateless gateway

### Scaling Strategy
- HPA: min 3, max 20 replicas
- CPU target: 70%
- Custom metric: active_connections > 1000 triggers scale

### Caching Strategy
- JWT validation: Redis cache, TTL 60s
- Rate limit counters: Redis sliding window

### Security Architecture
- mTLS to downstream services
- JWT validation with JWKS rotation
- WAF integration at edge
- IP allowlisting for admin endpoints

---

## 2. Auth Service

### Responsibilities
- User registration and login
- JWT access/refresh token issuance
- MFA enrollment and verification (TOTP, SMS, Email)
- SSO integration (SAML 2.0, OIDC)
- Password reset flows
- API key management
- Session management
- Token revocation

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login with credentials |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Revoke tokens |
| POST | `/auth/mfa/enable` | Enable MFA |
| POST | `/auth/mfa/verify` | Verify MFA code |
| POST | `/auth/password/reset-request` | Request password reset |
| POST | `/auth/password/reset` | Reset password |
| GET | `/auth/api-keys` | List API keys |
| POST | `/auth/api-keys` | Create API key |
| DELETE | `/auth/api-keys/{id}` | Revoke API key |

### Database Ownership
- `users`, `credentials`, `sessions`, `mfa_configs`, `api_keys`

### Scaling Strategy
- HPA: min 2, max 10 replicas
- Redis for session store and rate limiting
- Stateless — horizontal scaling

### Security Architecture
- Bcrypt password hashing (cost factor 12)
- Short-lived access tokens (30 min)
- Refresh token rotation on use
- MFA TOTP with QR code generation
- Account lockout after 5 failed attempts

---

## 3. Tenant Service

### Responsibilities
- Tenant CRUD operations
- Tenant provisioning (database schema, storage, AI memory)
- Plan management and upgrades
- Tenant settings and configuration
- Branding customization
- Feature flag management per tenant
- Tenant isolation verification

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/tenants` | Create tenant |
| GET | `/tenants/{id}` | Get tenant details |
| PUT | `/tenants/{id}` | Update tenant |
| GET | `/tenants/{id}/settings` | Get tenant settings |
| PUT | `/tenants/{id}/settings` | Update settings |
| GET | `/tenants/{id}/branding` | Get branding config |
| PUT | `/tenants/{id}/branding` | Update branding |
| POST | `/tenants/{id}/provision` | Provision new tenant |
| GET | `/tenants/{id}/usage` | Get usage metrics |

### Database Ownership
- `tenants`, `tenant_settings`, `branding_configs`, `feature_flags`

### Scaling Strategy
- HPA: min 2, max 8 replicas
- Heavy caching of tenant config (Redis, TTL 5 min)
- Event-driven invalidation on config changes

---

## 4. Candidate Service

### Responsibilities
- Candidate CRUD operations
- Candidate profile management
- Skill graph construction
- Experience timeline management
- Candidate enrichment via AI
- Candidate deduplication
- Candidate search and filtering

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/candidates` | Create candidate |
| GET | `/candidates` | List candidates (paginated) |
| GET | `/candidates/{id}` | Get candidate detail |
| PUT | `/candidates/{id}` | Update candidate |
| DELETE | `/candidates/{id}` | Soft delete candidate |
| GET | `/candidates/{id}/profile` | Get enriched profile |
| POST | `/candidates/{id}/enrich` | Trigger AI enrichment |
| GET | `/candidates/{id}/skills` | Get skill graph |
| POST | `/candidates/{id}/skills` | Add skills |
| GET | `/candidates/{id}/timeline` | Get experience timeline |

### Database Ownership
- `candidates`, `candidate_profiles`, `skills`, `candidate_skills`, `experience_entries`

### Scaling Strategy
- HPA: min 3, max 15 replicas
- Read replicas for queries
- Background enrichment via Celery workers

---

## 5. Resume Service

### Responsibilities
- Resume file upload and storage
- Multi-format parsing (PDF, DOCX, images)
- OCR for scanned resumes
- Structured data extraction
- Embedding generation for semantic search
- Resume version management
- Candidate enrichment from resume data

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/resumes/upload` | Upload resume file |
| GET | `/resumes/{id}` | Get resume metadata |
| GET | `/resumes/{id}/parsed` | Get parsed resume data |
| GET | `/resumes/{id}/raw` | Download original file |
| POST | `/resumes/{id}/reparse` | Trigger re-parsing |
| DELETE | `/resumes/{id}` | Delete resume |

### Database Ownership
- `resumes`, `parsed_resumes`, `resume_versions`, `resume_embeddings`

### Scaling Strategy
- HPA: min 2, max 10 replicas
- File processing via Celery workers (separate queue)
- S3 for file storage
- Background embedding generation

### File Processing Pipeline
1. Upload → S3 storage
2. Format detection (PDF/DOCX/image)
3. Text extraction (PyMuPDF/python-docx/Tesseract)
4. Section identification (education, experience, skills)
5. Structured data extraction via AI
6. Embedding generation
7. Candidate profile enrichment

---

## 6. Job Service

### Responsibilities
- Job CRUD operations
- Job description management
- Required/preferred skills management
- Job embedding generation
- Job-candidate matching
- Job status lifecycle management

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/jobs` | Create job |
| GET | `/jobs` | List jobs |
| GET | `/jobs/{id}` | Get job detail |
| PUT | `/jobs/{id}` | Update job |
| DELETE | `/jobs/{id}` | Archive job |
| GET | `/jobs/{id}/candidates` | Get matched candidates |
| POST | `/jobs/{id}/match` | Trigger matching |
| GET | `/jobs/{id}/analytics` | Job-specific analytics |

### Database Ownership
- `jobs`, `job_skills`, `job_embeddings`

---

## 7. AI Orchestrator Service

### Responsibilities
- Manage LangGraph orchestration graphs
- Route tasks to appropriate AI agents
- Coordinate multi-agent workflows
- Track agent state and progress
- Handle agent failures and retries
- Manage agent lifecycle (spawn, monitor, terminate)
- Aggregate multi-agent results
- Enforce AI governance policies

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/ai/orchestrate` | Submit orchestration task |
| GET | `/ai/tasks/{id}` | Get task status |
| POST | `/ai/tasks/{id}/cancel` | Cancel task |
| GET | `/ai/agents` | List active agents |
| GET | `/ai/agents/{id}` | Get agent state |
| GET | `/ai/graphs` | List available graphs |
| POST | `/ai/graphs/{type}/execute` | Execute specific graph |

### Database Ownership
- `agent_states`, `agent_tasks`, `orchestration_plans`

### Scaling Strategy
- HPA: min 2, max 20 replicas
- Task queue separation by priority
- Agent state persisted to Redis (short-term) and PostgreSQL (long-term)

---

## 8. AI Evaluation Service

### Responsibilities
- Execute AI-powered candidate evaluations
- Multi-dimensional scoring
- Benchmark comparison
- Explainability generation
- Evaluation result aggregation
- Historical evaluation analysis
- Bias detection and mitigation

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/evaluations` | Start evaluation |
| GET | `/evaluations/{id}` | Get evaluation result |
| GET | `/evaluations/{id}/explain` | Get explanation |
| GET | `/candidates/{id}/evaluations` | All evaluations for candidate |
| POST | `/evaluations/compare` | Compare candidates |
| GET | `/evaluations/benchmarks` | Get benchmarks |

### Database Ownership
- `evaluations`, `evaluation_criteria`, `benchmarks`, `evaluation_dimensions`

---

## 9. PPE Interview Service

### Responsibilities
- Initialize PPE sessions with problem selection
- Manage real-time code collaboration
- Execute candidate code in sandbox
- Provide AI-powered hints and follow-ups
- Generate comprehensive PPE evaluations
- Adaptive difficulty management
- Session recording and playback

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/ppe/sessions` | Create PPE session |
| GET | `/ppe/sessions/{id}` | Get session status |
| POST | `/ppe/sessions/{id}/start` | Start session |
| POST | `/ppe/sessions/{id}/code` | Submit code |
| POST | `/ppe/sessions/{id}/execute` | Execute code |
| POST | `/ppe/sessions/{id}/hint` | Request hint |
| POST | `/ppe/sessions/{id}/message` | Send message to agent |
| POST | `/ppe/sessions/{id}/complete` | Complete session |
| GET | `/ppe/sessions/{id}/evaluation` | Get evaluation |
| GET | `/ppe/problems` | List available problems |
| GET | `/ppe/problems/{id}` | Get problem details |

### Database Ownership
- `coding_sessions`, `code_snapshots`, `execution_results`, `collaboration_events`, `ppe_evaluations`

### Scaling Strategy
- HPA: min 3, max 20 replicas
- WebSocket connections for real-time
- Docker sandbox pool for code execution
- Per-language container images

### Special: Code Execution Sandbox
- Isolated Docker containers per execution
- Network disabled, read-only filesystem
- CPU/memory/time limits
- Language-specific runners
- Test case injection and execution

---

## 10. Workflow Engine Service

### Responsibilities
- No-code workflow builder backend
- Event-driven workflow triggers
- Step execution and state management
- Approval chain management
- Conditional branching
- Delay and scheduling
- Webhook integrations
- Workflow versioning

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/workflows` | Create workflow |
| GET | `/workflows` | List workflows |
| GET | `/workflows/{id}` | Get workflow detail |
| PUT | `/workflows/{id}` | Update workflow |
| POST | `/workflows/{id}/activate` | Activate workflow |
| POST | `/workflows/{id}/trigger` | Manual trigger |
| GET | `/workflows/{id}/executions` | List executions |
| GET | `/workflows/executions/{id}` | Get execution detail |
| POST | `/workflows/executions/{id}/approve` | Approve step |
| POST | `/workflows/executions/{id}/pause` | Pause execution |

### Database Ownership
- `workflows`, `workflow_steps`, `workflow_executions`, `approval_chains`

---

## 11. Analytics Service

### Responsibilities
- Real-time metrics collection
- Dashboard data aggregation
- Custom report generation
- Workforce analytics
- Recruiter productivity metrics
- Time-to-hire analytics
- Pipeline conversion rates
- AI performance metrics

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/dashboard` | Dashboard summary |
| GET | `/analytics/metrics` | Query metrics |
| GET | `/analytics/metrics/{name}` | Specific metric |
| POST | `/analytics/reports` | Generate report |
| GET | `/analytics/reports/{id}` | Get report |
| GET | `/analytics/pipeline` | Pipeline analytics |
| GET | `/analytics/recruiters` | Recruiter productivity |
| GET | `/analytics/candidates` | Candidate analytics |
| GET | `/analytics/ai-performance` | AI agent performance |

### Database Ownership
- `metrics`, `dashboards`, `reports`, `report_schedules`

### Scaling Strategy
- Materialized views for common aggregations
- TimescaleDB extension for time-series data
- Background aggregation via Celery beat
- Read replicas for dashboard queries

---

## 12. Notification Service

### Responsibilities
- Multi-channel notifications (email, push, in-app, SMS)
- Template management
- Notification preferences per user
- Batch notifications
- Delivery tracking
- Webhook delivery

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/notifications` | Send notification |
| GET | `/notifications` | List notifications |
| PUT | `/notifications/{id}/read` | Mark as read |
| PUT | `/notifications/read-all` | Mark all read |
| GET | `/notifications/preferences` | Get preferences |
| PUT | `/notifications/preferences` | Update preferences |

### Database Ownership
- `notifications`, `notification_templates`, `notification_preferences`, `delivery_logs`
