# API Endpoints Reference

Base URL: `http://localhost:8000`

All endpoints require `Authorization: Bearer <token>` unless noted. Requests are scoped to a tenant via `X-Tenant-ID` header.

---

## Auth — `/api/v1/auth` (10 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login (returns JWT) |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Logout (revoke session) |
| GET | `/auth/me` | Get current user profile |
| POST | `/auth/mfa/enable` | Enable MFA (TOTP secret + QR) |
| POST | `/auth/mfa/verify` | Verify MFA code |
| GET | `/auth/health` | Auth service health check |
| POST | `/auth/sso/{provider}` | SSO login (Google, LinkedIn, Microsoft, Apple) |

---

## Tenants — `/api/v1/tenants` (11 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tenants/` | List tenants |
| POST | `/tenants/` | Create tenant |
| GET | `/tenants/{id}` | Get tenant details |
| PUT | `/tenants/{id}` | Update tenant |
| DELETE | `/tenants/{id}` | Delete tenant |
| GET | `/tenants/{id}/settings` | Get tenant settings |
| PUT | `/tenants/{id}/settings` | Update tenant settings |
| GET | `/tenants/{id}/branding` | Get tenant branding |
| PUT | `/tenants/{id}/branding` | Update tenant branding |
| GET | `/tenants/{id}/usage` | Get tenant usage stats |
| GET | `/tenants/{id}/usage/history` | Get tenant usage history |
| GET | `/tenants/health` | Tenant service health check |

---

## Users — `/api/v1/users` (6 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/` | List all users |
| POST | `/users/` | Create user |
| GET | `/users/{id}` | Get user by ID |
| PUT | `/users/{id}` | Update user |
| DELETE | `/users/{id}` | Delete user |
| GET | `/users/{id}/activity` | Get user activity log |
| GET | `/users/health` | User service health check |

---

## Candidates — `/api/v1/candidates` (8 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/candidates/` | List candidates (paginated, filterable) |
| POST | `/candidates/` | Create candidate |
| GET | `/candidates/{id}` | Get candidate details |
| PUT | `/candidates/{id}` | Update candidate |
| DELETE | `/candidates/{id}` | Delete candidate |
| POST | `/candidates/{id}/enrich` | AI enrichment (skills, seniority, summary) |
| POST | `/candidates/{id}/match` | Match candidate to jobs |
| GET | `/candidates/health` | Candidate service health check |

---

## Resumes — `/api/v1/resumes` (6 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/resumes/` | Upload resume |
| GET | `/resumes/` | List all resumes |
| GET | `/resumes/{id}` | Get resume metadata |
| GET | `/resumes/{id}/parsed` | Get AI-parsed resume data |
| POST | `/resumes/{id}/reparse` | Re-parse resume |
| GET | `/resumes/health` | Resume service health check |

---

## Jobs — `/api/v1/jobs` (7 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/jobs/` | List jobs (paginated, filterable) |
| POST | `/jobs/` | Create job posting |
| GET | `/jobs/{id}` | Get job details |
| PUT | `/jobs/{id}` | Update job posting |
| DELETE | `/jobs/{id}` | Delete job posting |
| GET | `/jobs/{id}/candidates` | Get matched candidates for job |
| GET | `/jobs/health` | Job service health check |

---

## Interviews — `/api/v1/interviews` (9 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/interviews/` | List interviews |
| POST | `/interviews/` | Schedule interview |
| GET | `/interviews/{id}` | Get interview details |
| POST | `/interviews/{id}/start` | Start interview |
| POST | `/interviews/{id}/complete` | Complete interview |
| POST | `/interviews/{id}/feedback` | Submit feedback |
| GET | `/interviews/{id}/transcript` | Get interview transcript |
| GET | `/interviews/{id}/analytics` | Get interview analytics |
| GET | `/interviews/health` | Interview service health check |

---

## PPE (Pair Programming Evaluation) — `/api/v1/ppe` (10 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ppe/problems` | List coding problems |
| GET | `/ppe/problems/{id}` | Get problem details |
| POST | `/ppe/sessions` | Create PPE session |
| GET | `/ppe/sessions/{id}` | Get session details |
| POST | `/ppe/sessions/{id}/execute` | Submit and execute code |
| POST | `/ppe/sessions/{id}/hint` | Request hint |
| WS | `/ppe/ws/{session_id}` | PPE real-time collaboration |
| GET | `/ppe/health` | PPE service health check |

---

## AI Orchestrator — `/api/v1/ai` (6 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ai/agents` | List AI agents |
| POST | `/ai/orchestrate` | Orchestrate task (route to agent) |
| POST | `/ai/tasks` | Submit task to agent |
| GET | `/ai/tasks/{id}` | Get task status/result |
| GET | `/ai/health` | AI orchestrator health check |

---

## Analytics — `/api/v1/analytics` (8 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/dashboard` | Dashboard metrics |
| GET | `/analytics/pipeline` | Pipeline analytics |
| GET | `/analytics/ai-performance` | AI agent performance metrics |
| GET | `/analytics/recruiter-productivity` | Recruiter productivity stats |
| GET | `/analytics/time-to-hire` | Time-to-hire breakdown |
| POST | `/analytics/reports` | Generate report |
| GET | `/analytics/reports/{id}` | Get generated report |
| GET | `/analytics/health` | Analytics service health check |

---

## Workflows — `/api/v1/workflows` (10 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/workflows/` | List workflows |
| POST | `/workflows/` | Create workflow |
| GET | `/workflows/{id}` | Get workflow details |
| PUT | `/workflows/{id}` | Update workflow |
| DELETE | `/workflows/{id}` | Delete workflow |
| POST | `/workflows/{id}/trigger` | Trigger workflow execution |
| POST | `/workflows/{id}/activate` | Activate workflow |
| POST | `/workflows/{id}/deactivate` | Deactivate workflow |
| GET | `/workflows/{id}/executions` | List workflow executions |
| GET | `/workflows/health` | Workflow engine health check |

---

## Notifications — `/api/v1/notifications` (9 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications/` | List notifications |
| POST | `/notifications/` | Create notification |
| GET | `/notifications/{id}` | Get notification |
| PUT | `/notifications/{id}` | Update notification |
| DELETE | `/notifications/{id}` | Delete notification |
| POST | `/notifications/{id}/read` | Mark notification as read |
| POST | `/notifications/read-all` | Mark all as read |
| GET | `/notifications/preferences` | Get notification preferences |
| PUT | `/notifications/preferences` | Update notification preferences |
| GET | `/notifications/health` | Notification service health check |

---

## Compliance — `/api/v1/compliance` (10 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/compliance/status` | Get compliance status (GDPR/SOC2/ISO27001) |
| GET | `/compliance/policies` | List compliance policies |
| POST | `/compliance/consent` | Record candidate consent |
| GET | `/compliance/consent` | List consent records |
| GET | `/compliance/audit` | Get audit trail |
| POST | `/compliance/audit` | Create audit log entry |
| GET | `/compliance/retention` | Get data retention policies |
| POST | `/compliance/export` | Request data export (GDPR) |
| POST | `/compliance/deletion` | Request data deletion |
| POST | `/compliance/check` | Run compliance check |
| GET | `/compliance/report` | Generate compliance report |
| GET | `/compliance/health` | Compliance service health check |

---

## Billing — `/api/v1/billing` (8 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/plans` | List available plans |
| GET | `/billing/subscription` | Get current subscription |
| POST | `/billing/subscribe` | Subscribe to a plan |
| GET | `/billing/invoices` | List invoices |
| GET | `/billing/invoices/{id}` | Get invoice details |
| GET | `/billing/usage` | Get usage stats |
| POST | `/billing/payment-methods` | Add payment method |
| GET | `/billing/payment-methods` | List payment methods |
| DELETE | `/billing/payment-methods/{id}` | Delete payment method |
| GET | `/billing/health` | Billing service health check |

---

## Search — `/api/v1/search` (5 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/search/candidates` | Semantic search candidates |
| POST | `/search/jobs` | Semantic search jobs |
| POST | `/search/embeddings` | Generate embedding |
| GET | `/search/embeddings/{id}` | Get embedding |
| POST | `/search/similarity` | Find similar items |
| GET | `/search/health` | Vector search health check |

---

## WebSocket — `/api/v1/ws` (4 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| WS | `/ws/ws/{client_id}` | Real-time collaboration WebSocket |
| POST | `/ws/broadcast` | Broadcast message to all connections |
| GET | `/ws/connections` | List active connections |
| GET | `/ws/broadcast-log` | Get broadcast log |
| GET | `/ws/health` | WebSocket service health check |

---

## SSO — `/api/v1/sso` (1 endpoint)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sso/health` | SSO service health check |

---

## Fraud Detection — `/api/v1/fraud` (1 endpoint)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/fraud/health` | Fraud detection health check |

---

## Scheduling — `/api/v1/scheduling` (1 endpoint)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/scheduling/health` | Scheduling service health check |

---

## Resume Analysis — `/api/v1/resume-analysis` (1 endpoint)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/resume-analysis/health` | Resume analysis health check |

---

## Compliance Automation — `/api/v1/compliance-automation` (1 endpoint)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/compliance-automation/health` | Compliance automation health check |

---

## AI Evaluation — `/api/v1/ai-evaluation` (1 endpoint)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ai-evaluation/health` | AI evaluation health check |

---

## Talent Intelligence — `/api/v1/talent-intelligence` (1 endpoint)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/talent-intelligence/health` | Talent intelligence health check |

---

## Workflow Automation — `/api/v1/workflow-automation` (1 endpoint)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/workflow-automation/health` | Workflow automation health check |

---

## Innovation — `/api/v1/innovations` (1 endpoint)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/innovations/health` | Innovation service health check |

---

## Health (Root)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Overall system health check |

---

## Summary

| Service | Endpoints |
|---------|-----------|
| Auth | 9 |
| Tenants | 11 |
| Users | 7 |
| Candidates | 8 |
| Resumes | 6 |
| Jobs | 7 |
| Interviews | 9 |
| PPE | 8 |
| AI Orchestrator | 5 |
| Analytics | 8 |
| Workflows | 10 |
| Notifications | 10 |
| Compliance | 12 |
| Billing | 10 |
| Search | 6 |
| WebSocket | 5 |
| SSO | 1 |
| Fraud Detection | 1 |
| Scheduling | 1 |
| Resume Analysis | 1 |
| Compliance Automation | 1 |
| AI Evaluation | 1 |
| Talent Intelligence | 1 |
| Workflow Automation | 1 |
| Innovation | 1 |
| Health (Root) | 1 |
| **Total** | **152** |
