# AI-ROS API Reference

> **AI-Native Recruitment Operating System** — Enterprise API Gateway

---

## Base URL

```
http://localhost:8000
```

## Authentication

All API endpoints (except `/health` and `/`) require a valid JWT in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Obtain tokens via `POST /api/v1/auth/login`. Refresh via `POST /api/v1/auth/refresh`.

## Multi-Tenancy

Requests are scoped to a tenant via the `X-Tenant-ID` header. Omitting it defaults to the authenticated user's primary tenant.

## Rate Limiting

| Plan | Requests/min |
|------|-------------|
| Free | 60 |
| Starter | 300 |
| Pro | 1,000 |
| Enterprise | 5,000 |

---

## Interactive Documentation

| Format | URL |
|--------|-----|
| Swagger UI | [http://localhost:8000/docs](http://localhost:8000/docs) |
| ReDoc | [http://localhost:8000/redoc](http://localhost:8000/redoc) |
| OpenAPI JSON | [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json) |

---

## Endpoints

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health check |

---

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/auth/register` | Register a new user |
| `POST` | `/api/v1/auth/login` | Authenticate and receive JWT tokens |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |
| `POST` | `/api/v1/auth/logout` | Invalidate session |
| `POST` | `/api/v1/auth/mfa/enable` | Enable multi-factor authentication |
| `POST` | `/api/v1/auth/mfa/verify` | Verify MFA TOTP code |

---

### Tenants

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/tenants/` | Create a new tenant organization |
| `GET` | `/api/v1/tenants/{tenant_id}` | Get tenant details |
| `PUT` | `/api/v1/tenants/{tenant_id}` | Update tenant |
| `GET` | `/api/v1/tenants/{tenant_id}/settings` | Get tenant settings |
| `PUT` | `/api/v1/tenants/{tenant_id}/settings` | Update tenant settings |
| `GET` | `/api/v1/tenants/{tenant_id}/branding` | Get tenant branding |
| `PUT` | `/api/v1/tenants/{tenant_id}/branding` | Update tenant branding |

---

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/users/` | List all users |
| `GET` | `/api/v1/users/{user_id}` | Get user by ID |
| `PUT` | `/api/v1/users/{user_id}` | Update user |
| `DELETE` | `/api/v1/users/{user_id}` | Delete user |
| `GET` | `/api/v1/users/{user_id}/activity` | Get user activity log |

---

### Candidates

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/candidates/` | List candidates |
| `GET` | `/api/v1/candidates/{id}` | Get candidate details |
| `POST` | `/api/v1/candidates/` | Create candidate |
| `PUT` | `/api/v1/candidates/{id}` | Update candidate |
| `DELETE` | `/api/v1/candidates/{id}` | Delete candidate |
| `POST` | `/api/v1/candidates/{id}/enrich` | Trigger AI enrichment |
| `GET` | `/api/v1/candidates/{id}/enrichment-status` | Get enrichment task status |
| `POST` | `/api/v1/candidates/{id}/match` | Match candidate to jobs |
| `GET` | `/api/v1/candidates/{id}/skills` | Get candidate skills |

---

### Resumes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/resumes/upload` | Upload a resume file |
| `GET` | `/api/v1/resumes/{resume_id}` | Get resume metadata |
| `GET` | `/api/v1/resumes/{resume_id}/parsed` | Get AI-parsed resume data |
| `POST` | `/api/v1/resumes/{resume_id}/reparse` | Re-trigger AI parsing |

---

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/jobs/` | List jobs |
| `GET` | `/api/v1/jobs/{id}` | Get job details |
| `POST` | `/api/v1/jobs/` | Create job posting |
| `PUT` | `/api/v1/jobs/{id}` | Update job posting |
| `DELETE` | `/api/v1/jobs/{id}` | Delete job posting |
| `GET` | `/api/v1/jobs/{id}/candidates` | Get AI-matched candidates |

---

### Interviews

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/interviews/` | List interviews |
| `GET` | `/api/v1/interviews/{id}` | Get interview details |
| `POST` | `/api/v1/interviews/` | Schedule interview |
| `POST` | `/api/v1/interviews/{id}/start` | Start interview |
| `POST` | `/api/v1/interviews/{id}/complete` | Complete interview |
| `POST` | `/api/v1/interviews/{id}/feedback` | Submit feedback |

---

### PPE (Pair Programming Evaluation)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/ppe/sessions` | Create PPE session |
| `GET` | `/api/v1/ppe/sessions/{id}` | Get session details |
| `POST` | `/api/v1/ppe/sessions/{id}/start` | Start session (assign problem) |
| `POST` | `/api/v1/ppe/sessions/{id}/execute` | Execute candidate code |
| `POST` | `/api/v1/ppe/sessions/{id}/hint` | Request AI hint |
| `POST` | `/api/v1/ppe/sessions/{id}/complete` | Complete session |
| `GET` | `/api/v1/ppe/sessions/{id}/evaluation` | Get evaluation results |
| `GET` | `/api/v1/ppe/sessions/{id}/progress` | Get real-time progress |
| `GET` | `/api/v1/ppe/problems` | List coding problems |
| `GET` | `/api/v1/ppe/problems/{id}` | Get problem details |

---

### AI Orchestrator

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/ai/agents` | List AI agents |
| `GET` | `/api/v1/ai/agents/{id}` | Get agent details |
| `POST` | `/api/v1/ai/orchestrate` | Orchestrate AI task |
| `POST` | `/api/v1/ai/tasks` | Submit AI task |
| `GET` | `/api/v1/ai/tasks/{task_id}` | Get AI task status |

---

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/analytics/dashboard` | Dashboard metrics |
| `GET` | `/api/v1/analytics/metrics` | Query specific metrics |
| `GET` | `/api/v1/analytics/pipeline` | Pipeline stage analytics |
| `GET` | `/api/v1/analytics/ai-performance` | AI model performance |
| `POST` | `/api/v1/analytics/reports` | Generate custom report |

---

### Workflows

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/workflows/` | List workflows |
| `GET` | `/api/v1/workflows/{id}` | Get workflow details |
| `POST` | `/api/v1/workflows/` | Create workflow |
| `POST` | `/api/v1/workflows/{id}/trigger` | Trigger workflow execution |
| `POST` | `/api/v1/workflows/{id}/activate` | Activate workflow |

---

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/notifications/` | List notifications |
| `POST` | `/api/v1/notifications/` | Send notification |
| `PUT` | `/api/v1/notifications/{id}/read` | Mark notification as read |
| `GET` | `/api/v1/notifications/preferences` | Get notification preferences |
| `PUT` | `/api/v1/notifications/preferences` | Update notification preferences |

---

### Compliance

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/compliance/policies` | List compliance policies |
| `POST` | `/api/v1/compliance/policies` | Create compliance policy |
| `POST` | `/api/v1/compliance/consent` | Record candidate consent |
| `GET` | `/api/v1/compliance/audit-log` | Get audit log |
| `POST` | `/api/v1/compliance/data-export` | Export candidate data (GDPR) |
| `GET` | `/api/v1/compliance/status` | Get compliance status |

---

### Billing

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/billing/subscription` | Get current subscription |
| `POST` | `/api/v1/billing/subscription` | Create subscription |
| `GET` | `/api/v1/billing/invoices` | List invoices |
| `GET` | `/api/v1/billing/usage` | Get usage metrics |

---

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/search/candidates` | Semantic candidate search |
| `POST` | `/api/v1/search/jobs` | Semantic job search |
| `POST` | `/api/v1/search/embeddings` | Generate text embedding |
| `GET` | `/api/v1/search/embeddings/{id}` | Get embedding by ID |

---

### WebSocket

| Protocol | Endpoint | Description |
|----------|----------|-------------|
| `WS` | `/api/v1/ws/ws/ppe/{session_id}` | PPE live coding collaboration |
| `WS` | `/api/v1/ws/ws/interview/{session_id}` | AI interview chat |
| `WS` | `/api/v1/ws/ws/copilot/{tenant_id}` | AI copilot real-time assistance |

---

## Error Responses

All errors follow a consistent structure:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Candidate with id 'c999' not found"
  }
}
```

| Status Code | Meaning |
|-------------|---------|
| `400` | Bad Request — invalid input |
| `401` | Unauthorized — missing or invalid token |
| `403` | Forbidden — insufficient permissions |
| `404` | Not Found — resource does not exist |
| `409` | Conflict — resource already exists |
| `422` | Validation Error — request body failed validation |
| `429` | Rate Limited — too many requests |
| `500` | Internal Server Error |

---

## Response Envelope

Successful list endpoints return:

```json
{
  "data": [...],
  "total": 42
}
```

Single-resource endpoints return the resource directly:

```json
{
  "id": "c1",
  "full_name": "John Smith",
  ...
}
```
