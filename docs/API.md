# AI-ROS API Reference

Complete API reference for the AI-Native Recruitment Operating System.

**Base URL:** `http://localhost:8000/api/v1`

**Authentication:** Bearer token in `Authorization` header.

```bash
Authorization: Bearer <access_token>
```

**Multi-Tenancy:** All requests are scoped to a tenant via `X-Tenant-ID` header.

---

## Table of Contents

- [Health Check](#health-check)
- [Authentication](#authentication)
- [Tenants](#tenants)
- [Users](#users)
- [Candidates](#candidates)
- [Resumes](#resumes)
- [Jobs](#jobs)
- [Interviews](#interviews)
- [PPE (Pair Programming Evaluation)](#ppe-pair-programming-evaluation)
- [AI Orchestrator](#ai-orchestrator)
- [Analytics](#analytics)
- [Workflows](#workflows)
- [Notifications](#notifications)
- [Compliance](#compliance)
- [Billing](#billing)
- [Search](#search)
- [WebSocket API](#websocket-api)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

---

## Health Check

### Global Health Check

```
GET /health
```

**Response `200`:**

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "service": "unified-api"
}
```

### Service Health Check

```
GET /api/v1/{service}/health
```

**Response `200`:**

```json
{
  "status": "healthy",
  "service": "auth"
}
```

---

## Authentication

### Register

```
POST /api/v1/auth/register
```

**Request Body:**

```json
{
  "email": "user@company.com",
  "full_name": "John Doe",
  "password": "securepassword123"
}
```

**Response `200`:**

```json
{
  "id": "user_new",
  "email": "user@company.com",
  "full_name": "John Doe",
  "role": "candidate",
  "created": true
}
```

### Login

```
POST /api/v1/auth/login
```

**Request Body:**

```json
{
  "email": "user@company.com",
  "password": "securepassword123"
}
```

**Response `200`:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "refresh_token": "refresh_...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

### Refresh Token

```
POST /api/v1/auth/refresh
```

**Response `200`:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "expires_in": 1800
}
```

### Logout

```
POST /api/v1/auth/logout
```

**Response `200`:**

```json
{
  "logged_out": true
}
```

### Enable MFA

```
POST /api/v1/auth/mfa/enable
```

**Response `200`:**

```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qr_code": "data:image/png;base64,...",
  "backup_codes": ["123456", "789012"]
}
```

### Verify MFA

```
POST /api/v1/auth/mfa/verify
```

**Request Body:**

```json
{
  "code": "123456"
}
```

**Response `200`:**

```json
{
  "verified": true
}
```

---

## Tenants

### Create Tenant

```
POST /api/v1/tenants/
```

**Response `200`:**

```json
{
  "id": "tenant_new",
  "name": "New Organization",
  "slug": "new-org",
  "plan": "free",
  "created": true
}
```

### Get Tenant

```
GET /api/v1/tenants/{tenant_id}
```

**Response `200`:**

```json
{
  "id": "tenant_123",
  "name": "Acme Corp",
  "slug": "acme",
  "plan": "enterprise",
  "status": "active"
}
```

### Update Tenant

```
PUT /api/v1/tenants/{tenant_id}
```

**Response `200`:**

```json
{
  "id": "tenant_123",
  "updated": true
}
```

### Get Tenant Settings

```
GET /api/v1/tenants/{tenant_id}/settings
```

**Response `200`:**

```json
{
  "tenant_id": "tenant_123",
  "settings": {
    "notifications": true,
    "ai_enabled": true,
    "max_users": 100
  }
}
```

### Update Tenant Settings

```
PUT /api/v1/tenants/{tenant_id}/settings
```

**Response `200`:**

```json
{
  "tenant_id": "tenant_123",
  "settings_updated": true
}
```

### Get Tenant Branding

```
GET /api/v1/tenants/{tenant_id}/branding
```

**Response `200`:**

```json
{
  "tenant_id": "tenant_123",
  "branding": {
    "primary_color": "#3b82f6",
    "logo_url": "/logo.svg",
    "company_name": "Acme Corp"
  }
}
```

### Update Tenant Branding

```
PUT /api/v1/tenants/{tenant_id}/branding
```

**Response `200`:**

```json
{
  "tenant_id": "tenant_123",
  "branding_updated": true
}
```

---

## Users

### List Users

```
GET /api/v1/users/
```

**Response `200`:**

```json
{
  "data": [
    {
      "id": "u1",
      "email": "admin@acme.com",
      "full_name": "Admin User",
      "role": "tenant_admin",
      "status": "active"
    }
  ],
  "total": 1
}
```

### Get User

```
GET /api/v1/users/{user_id}
```

**Response `200`:**

```json
{
  "id": "u1",
  "email": "user@acme.com",
  "full_name": "User Name",
  "role": "recruiter",
  "status": "active"
}
```

### Update User

```
PUT /api/v1/users/{user_id}
```

**Response `200`:**

```json
{
  "id": "u1",
  "updated": true
}
```

### Delete User

```
DELETE /api/v1/users/{user_id}
```

**Response `200`:**

```json
{
  "id": "u1",
  "deleted": true
}
```

### Get User Activity

```
GET /api/v1/users/{user_id}/activity
```

**Response `200`:**

```json
{
  "user_id": "u1",
  "activity": [
    {
      "action": "login",
      "timestamp": "2025-01-20T10:00:00Z"
    },
    {
      "action": "viewed_candidate",
      "timestamp": "2025-01-20T10:05:00Z"
    }
  ]
}
```

---

## Candidates

### List Candidates

```
GET /api/v1/candidates/
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 20 | Items per page |
| status | string | — | Filter by status |
| seniority | string | — | Filter by seniority level |
| search | string | — | Full-text search |

**Response `200`:**

```json
{
  "data": [
    {
      "id": "c1",
      "email": "john@email.com",
      "full_name": "John Smith",
      "status": "screening",
      "seniority_level": "senior",
      "years_experience": 8,
      "match_score": 0.87
    }
  ],
  "total": 1
}
```

### Get Candidate

```
GET /api/v1/candidates/{candidate_id}
```

**Response `200`:**

```json
{
  "id": "c1",
  "email": "john@email.com",
  "full_name": "John Smith",
  "status": "screening",
  "seniority_level": "senior",
  "years_experience": 8,
  "profile": {
    "summary": "Senior backend engineer with 8 years experience",
    "skills": [
      {"name": "Python", "proficiency": "expert"},
      {"name": "PostgreSQL", "proficiency": "advanced"},
      {"name": "Kubernetes", "proficiency": "advanced"}
    ],
    "domains": ["Backend", "Infrastructure"]
  }
}
```

### Create Candidate

```
POST /api/v1/candidates/
```

**Request Body:**

```json
{
  "email": "john@email.com",
  "full_name": "John Smith",
  "phone": "+1-555-0123",
  "resume_id": "r1"
}
```

**Response `200`:**

```json
{
  "id": "c_new",
  "created": true
}
```

### Update Candidate

```
PUT /api/v1/candidates/{candidate_id}
```

**Response `200`:**

```json
{
  "id": "c1",
  "updated": true
}
```

### Delete Candidate

```
DELETE /api/v1/candidates/{candidate_id}
```

**Response `200`:**

```json
{
  "id": "c1",
  "deleted": true
}
```

### Enrich Candidate (AI)

```
POST /api/v1/candidates/{candidate_id}/enrich
```

Triggers AI-powered profile enrichment including skill extraction, experience validation, and social profile aggregation.

**Response `200`:**

```json
{
  "candidate_id": "c1",
  "task_id": "task_123",
  "status": "processing"
}
```

### Get Candidate Skills

```
GET /api/v1/candidates/{candidate_id}/skills
```

**Response `200`:**

```json
{
  "candidate_id": "c1",
  "skills": [
    {"name": "Python", "proficiency": "expert", "years": 7},
    {"name": "PostgreSQL", "proficiency": "advanced", "years": 6},
    {"name": "Kubernetes", "proficiency": "advanced", "years": 4}
  ]
}
```

---

## Resumes

### Upload Resume

```
POST /api/v1/resumes/upload
```

**Content-Type:** `multipart/form-data`

**Form Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | Yes | Resume file (PDF, DOCX, TXT) |
| candidate_id | string | No | Associate with existing candidate |

**Response `200`:**

```json
{
  "id": "r_new",
  "file_name": "resume.pdf",
  "status": "uploaded",
  "created": true
}
```

### Get Resume

```
GET /api/v1/resumes/{resume_id}
```

**Response `200`:**

```json
{
  "id": "r1",
  "file_name": "resume.pdf",
  "status": "parsed",
  "mime_type": "application/pdf"
}
```

### Get Parsed Resume

```
GET /api/v1/resumes/{resume_id}/parsed
```

**Response `200`:**

```json
{
  "resume_id": "r1",
  "sections": {
    "contact": {
      "email": "john@email.com",
      "phone": "+1-555-0123",
      "linkedin": "linkedin.com/in/johnsmith"
    },
    "summary": "Senior backend engineer with 8 years experience building distributed systems",
    "experience": [
      {
        "title": "Senior Engineer",
        "company": "Tech Corp",
        "start_date": "2020-01",
        "end_date": null,
        "years": 5,
        "highlights": ["Led microservices migration", "Reduced latency by 40%"]
      }
    ],
    "education": [
      {
        "degree": "B.S. Computer Science",
        "institution": "MIT",
        "year": 2017
      }
    ],
    "skills": ["Python", "PostgreSQL", "Kubernetes", "FastAPI"],
    "certifications": ["AWS Solutions Architect"]
  },
  "parsing_confidence": 0.95
}
```

### Reparse Resume

```
POST /api/v1/resumes/{resume_id}/reparse
```

**Response `200`:**

```json
{
  "resume_id": "r1",
  "status": "reparsing"
}
```

---

## Jobs

### List Jobs

```
GET /api/v1/jobs/
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 20 | Items per page |
| status | string | — | Filter by status (open, closed, draft) |
| department | string | — | Filter by department |

**Response `200`:**

```json
{
  "data": [
    {
      "id": "j1",
      "title": "Senior Backend Engineer",
      "department": "Engineering",
      "location": "San Francisco, CA",
      "status": "open",
      "applicants_count": 24
    }
  ],
  "total": 1
}
```

### Get Job

```
GET /api/v1/jobs/{job_id}
```

**Response `200`:**

```json
{
  "id": "j1",
  "title": "Senior Backend Engineer",
  "description": "We are looking for a senior backend engineer...",
  "department": "Engineering",
  "location": "San Francisco, CA",
  "remote_policy": "hybrid",
  "status": "open",
  "required_skills": ["Python", "PostgreSQL", "Kubernetes"],
  "preferred_skills": ["FastAPI", "Docker"],
  "min_experience_years": 5,
  "salary_range": {
    "min": 150000,
    "max": 200000,
    "currency": "USD"
  },
  "applicants_count": 24
}
```

### Create Job

```
POST /api/v1/jobs/
```

**Request Body:**

```json
{
  "title": "Senior Backend Engineer",
  "description": "We are looking for a senior backend engineer...",
  "department": "Engineering",
  "location": "San Francisco, CA",
  "remote_policy": "hybrid",
  "required_skills": ["Python", "PostgreSQL", "Kubernetes"],
  "preferred_skills": ["FastAPI", "Docker"],
  "min_experience_years": 5
}
```

**Response `200`:**

```json
{
  "id": "j_new",
  "created": true
}
```

### Update Job

```
PUT /api/v1/jobs/{job_id}
```

**Response `200`:**

```json
{
  "id": "j1",
  "updated": true
}
```

### Delete Job

```
DELETE /api/v1/jobs/{job_id}
```

**Response `200`:**

```json
{
  "id": "j1",
  "deleted": true
}
```

### Get Matched Candidates

```
GET /api/v1/jobs/{job_id}/candidates
```

Returns candidates matched to the job using AI-powered semantic matching.

**Response `200`:**

```json
{
  "job_id": "j1",
  "matched_candidates": [
    {
      "candidate_id": "c2",
      "name": "Sarah Chen",
      "match_score": 0.92,
      "skill_match": 0.95,
      "experience_match": 0.88,
      "domain_match": 0.90
    },
    {
      "candidate_id": "c3",
      "name": "Mike Johnson",
      "match_score": 0.85,
      "skill_match": 0.82,
      "experience_match": 0.90,
      "domain_match": 0.84
    }
  ]
}
```

---

## Interviews

### List Interviews

```
GET /api/v1/interviews/
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 20 | Items per page |
| status | string | — | Filter by status |
| candidate_id | string | — | Filter by candidate |
| job_id | string | — | Filter by job |

**Response `200`:**

```json
{
  "data": [
    {
      "id": "i1",
      "candidate_id": "c1",
      "job_id": "j1",
      "interview_type": "pair_programming",
      "status": "scheduled",
      "scheduled_at": "2025-01-20T14:00:00Z",
      "is_ai_interview": true,
      "interviewers": ["u2", "u3"]
    }
  ],
  "total": 1
}
```

### Get Interview

```
GET /api/v1/interviews/{interview_id}
```

**Response `200`:**

```json
{
  "id": "i1",
  "candidate_id": "c1",
  "job_id": "j1",
  "interview_type": "pair_programming",
  "status": "scheduled",
  "is_ai_interview": true,
  "scheduled_at": "2025-01-20T14:00:00Z",
  "duration_minutes": 60,
  "location": "https://meet.google.com/abc-defg-hij",
  "notes": "Focus on system design and Python proficiency"
}
```

### Create Interview

```
POST /api/v1/interviews/
```

**Request Body:**

```json
{
  "candidate_id": "c1",
  "job_id": "j1",
  "interview_type": "pair_programming",
  "scheduled_at": "2025-01-20T14:00:00Z",
  "duration_minutes": 60,
  "is_ai_interview": true,
  "interviewer_ids": ["u2"]
}
```

**Response `200`:**

```json
{
  "id": "i_new",
  "created": true
}
```

### Start Interview

```
POST /api/v1/interviews/{interview_id}/start
```

**Response `200`:**

```json
{
  "id": "i1",
  "status": "in_progress",
  "started_at": "2025-01-20T14:00:00Z"
}
```

### Complete Interview

```
POST /api/v1/interviews/{interview_id}/complete
```

**Response `200`:**

```json
{
  "id": "i1",
  "status": "completed",
  "completed_at": "2025-01-20T15:00:00Z"
}
```

### Submit Feedback

```
POST /api/v1/interviews/{interview_id}/feedback
```

**Request Body:**

```json
{
  "rating": 4,
  "technical_score": 8.5,
  "communication_score": 7.0,
  "problem_solving_score": 9.0,
  "recommendation": "hire",
  "strengths": ["Strong CS fundamentals", "Excellent code quality"],
  "weaknesses": ["Could improve system design communication"],
  "notes": "Strong candidate overall, recommended for senior role"
}
```

**Response `200`:**

```json
{
  "id": "i1",
  "feedback_submitted": true
}
```

---

## PPE (Pair Programming Evaluation)

### Create Session

```
POST /api/v1/ppe/sessions
```

**Request Body:**

```json
{
  "candidate_id": "c1",
  "job_id": "j1",
  "language": "python",
  "difficulty": "medium"
}
```

**Response `200`:**

```json
{
  "id": "ppe_new",
  "language": "python",
  "difficulty": "medium",
  "status": "created",
  "room_id": "ppe-session-001"
}
```

### Get Session

```
GET /api/v1/ppe/sessions/{session_id}
```

**Response `200`:**

```json
{
  "id": "ppe_123",
  "language": "python",
  "difficulty": "medium",
  "status": "active",
  "problem_title": "Two Sum",
  "hints_used": 1,
  "max_hints": 3,
  "started_at": "2025-01-20T14:00:00Z",
  "elapsed_seconds": 1800
}
```

### Start Session

```
POST /api/v1/ppe/sessions/{session_id}/start
```

**Response `200`:**

```json
{
  "id": "ppe_123",
  "status": "active",
  "problem": {
    "title": "Two Sum",
    "description": "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice.",
    "difficulty": "easy",
    "examples": [
      {
        "input": "nums = [2,7,11,15], target = 9",
        "output": "[0,1]",
        "explanation": "Because nums[0] + nums[1] == 9, we return [0, 1]"
      }
    ],
    "constraints": [
      "2 <= nums.length <= 10^4",
      "-10^9 <= nums[i] <= 10^9",
      "-10^9 <= target <= 10^9",
      "Only one valid answer exists"
    ]
  },
  "test_cases": 5
}
```

### Execute Code

```
POST /api/v1/ppe/sessions/{session_id}/execute
```

**Request Body:**

```json
{
  "code": "def two_sum(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        complement = target - num\n        if complement in seen:\n            return [seen[complement], i]\n        seen[num] = i\n    return []",
  "language": "python"
}
```

**Response `200`:**

```json
{
  "session_id": "ppe_123",
  "execution": {
    "exit_code": 0,
    "stdout": "",
    "stderr": "",
    "tests_passed": "3/5",
    "all_tests_passed": false,
    "execution_time_ms": 142,
    "test_results": [
      {"test": "test_basic", "passed": true, "time_ms": 12},
      {"test": "test_negative", "passed": true, "time_ms": 8},
      {"test": "test_same_element", "passed": false, "expected": "[0,1]", "actual": "[]", "time_ms": 15},
      {"test": "test_large_array", "passed": true, "time_ms": 95},
      {"test": "test_no_solution", "passed": true, "time_ms": 12}
    ]
  },
  "agent_response": {
    "role": "agent",
    "content": "3/5 tests pass. Your solution handles the basic case well, but consider edge cases where the same element might need to be referenced differently. Think about the constraint 'you may not use the same element twice'."
  }
}
```

### Request Hint

```
POST /api/v1/ppe/sessions/{session_id}/hint
```

**Response `200`:**

```json
{
  "session_id": "ppe_123",
  "hint": "Have you considered using a hash map for O(1) lookup? The key insight is that for each number, you only need to check if its complement (target - num) exists in your data structure.",
  "hints_remaining": 2,
  "hint_level": "moderate"
}
```

### Complete Session

```
POST /api/v1/ppe/sessions/{session_id}/complete
```

**Response `200`:**

```json
{
  "session_id": "ppe_123",
  "status": "completed",
  "completed_at": "2025-01-20T14:45:00Z",
  "duration_seconds": 2700,
  "evaluation": {
    "overall_score": 7.8,
    "code_quality_score": 8.0,
    "problem_solving_score": 7.5,
    "communication_score": 8.0,
    "efficiency_score": 7.0,
    "seniority_estimation": "senior",
    "confidence_level": 0.85,
    "hiring_recommendation": "hire",
    "strengths": [
      "Strong code quality and readability",
      "Solid understanding of hash map data structures",
      "Good time complexity awareness"
    ],
    "weaknesses": [
      "Missed edge case with duplicate values",
      "Could improve space complexity explanation"
    ],
    "reasoning_trace": "Candidate demonstrated strong problem-solving skills by quickly identifying the hash map approach. Code was clean and well-structured. Minor gap in handling edge cases, but overall approach was sound for a senior-level candidate."
  }
}
```

### Get Evaluation

```
GET /api/v1/ppe/sessions/{session_id}/evaluation
```

**Response `200`:**

```json
{
  "session_id": "ppe_123",
  "overall_score": 7.8,
  "seniority_estimation": "senior",
  "confidence_level": 0.85,
  "hiring_recommendation": "hire",
  "code_quality_score": 8.0,
  "problem_solving_score": 7.5,
  "communication_score": 8.0,
  "efficiency_score": 7.0,
  "strengths": ["Strong Code Quality", "Solid CS Fundamentals", "Good Communication"],
  "weaknesses": ["Edge case handling", "Space complexity explanation"],
  "reasoning_trace": "Candidate demonstrated strong problem-solving skills...",
  "code_snapshots": [
    {
      "timestamp": "2025-01-20T14:10:00Z",
      "line_count": 8,
      "test_results": "1/5"
    },
    {
      "timestamp": "2025-01-20T14:30:00Z",
      "line_count": 12,
      "test_results": "3/5"
    }
  ]
}
```

### PPE Health Check

```
GET /api/v1/ppe/health
```

**Response `200`:**

```json
{
  "status": "healthy",
  "service": "ppe",
  "active_sessions": 3,
  "total_sessions_today": 15
}
```

---

## AI Orchestrator

### Orchestrate Task

```
POST /api/v1/ai/orchestrate
```

**Request Body:**

```json
{
  "task_type": "candidate_evaluation",
  "payload": {
    "candidate_id": "c1",
    "job_id": "j1"
  },
  "priority": "high"
}
```

**Response `200`:**

```json
{
  "task_id": "task_new",
  "status": "processing",
  "agents_assigned": ["resume_agent", "skill_agent", "matching_agent"],
  "estimated_completion_seconds": 120
}
```

### List Agents

```
GET /api/v1/ai/agents
```

**Response `200`:**

```json
{
  "data": [
    {
      "id": "a1",
      "type": "resume_parsing",
      "status": "idle",
      "tasks_completed": 156,
      "avg_task_duration_ms": 2500,
      "tokens_consumed": 125000
    },
    {
      "id": "a2",
      "type": "skill_extraction",
      "status": "idle",
      "tasks_completed": 142,
      "avg_task_duration_ms": 1800,
      "tokens_consumed": 98000
    },
    {
      "id": "a3",
      "type": "candidate_matching",
      "status": "processing",
      "tasks_completed": 98,
      "current_task_id": "task_456",
      "tokens_consumed": 67000
    }
  ],
  "total": 3
}
```

### Get Agent

```
GET /api/v1/ai/agents/{agent_id}
```

**Response `200`:**

```json
{
  "id": "a1",
  "type": "resume_parsing",
  "status": "idle",
  "tasks_completed": 156,
  "tokens_consumed": 125000,
  "avg_task_duration_ms": 2500,
  "error_rate": 0.02,
  "model_used": "gpt-4-turbo",
  "last_active_at": "2025-01-20T14:30:00Z"
}
```

### Submit Task

```
POST /api/v1/ai/tasks
```

**Request Body:**

```json
{
  "task_type": "resume_parsing",
  "payload": {
    "resume_id": "r1"
  },
  "priority": "normal"
}
```

**Response `200`:**

```json
{
  "task_id": "task_new",
  "status": "queued",
  "estimated_wait_seconds": 30
}
```

### Get Task

```
GET /api/v1/ai/tasks/{task_id}
```

**Response `200`:**

```json
{
  "task_id": "task_123",
  "status": "completed",
  "task_type": "candidate_evaluation",
  "created_at": "2025-01-20T14:00:00Z",
  "completed_at": "2025-01-20T14:02:00Z",
  "duration_seconds": 120,
  "result": {
    "candidates_processed": 5,
    "evaluations_generated": 3,
    "avg_confidence": 0.87
  },
  "agents_used": ["resume_agent", "skill_agent"],
  "tokens_consumed": 4500
}
```

---

## Analytics

### Get Dashboard

```
GET /api/v1/analytics/dashboard
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| time_range | string | "7d" | Time range (1d, 7d, 30d, 90d) |

**Response `200`:**

```json
{
  "time_range": "7d",
  "metrics": {
    "total_candidates": 1247,
    "open_positions": 23,
    "active_interviews": 18,
    "hires_this_month": 7,
    "avg_time_to_hire_days": 14.7,
    "ai_evaluation_accuracy": 91.5,
    "pipeline_conversion_rate": 0.12,
    "top_sources": [
      {"source": "linkedin", "count": 45},
      {"source": "referral", "count": 32},
      {"source": "direct", "count": 28}
    ]
  }
}
```

### Query Metrics

```
GET /api/v1/analytics/metrics
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| metric_name | string | No | Specific metric name |
| start_date | string | No | Start date (ISO 8601) |
| end_date | string | No | End date (ISO 8601) |

**Response `200`:**

```json
{
  "metric": "hires",
  "data": [
    {"timestamp": "2025-01-20", "value": 42},
    {"timestamp": "2025-01-21", "value": 38},
    {"timestamp": "2025-01-22", "value": 45}
  ]
}
```

### Get Pipeline Analytics

```
GET /api/v1/analytics/pipeline
```

**Response `200`:**

```json
{
  "pipeline": [
    {"stage": "Applied", "count": 145, "conversion_rate": 1.0},
    {"stage": "Screening", "count": 89, "conversion_rate": 0.61},
    {"stage": "Interview", "count": 42, "conversion_rate": 0.47},
    {"stage": "Evaluation", "count": 18, "conversion_rate": 0.43},
    {"stage": "Offer", "count": 7, "conversion_rate": 0.39},
    {"stage": "Hired", "count": 3, "conversion_rate": 0.43}
  ],
  "avg_time_per_stage": {
    "Applied to Screening": 2.1,
    "Screening to Interview": 3.5,
    "Interview to Evaluation": 1.8,
    "Evaluation to Offer": 2.2,
    "Offer to Hired": 4.5
  }
}
```

### Get AI Performance

```
GET /api/v1/analytics/ai-performance
```

**Response `200`:**

```json
{
  "metrics": [
    {
      "name": "Resume Parsing Accuracy",
      "value": 94.2,
      "target": 95,
      "trend": "improving"
    },
    {
      "name": "Skill Extraction F1",
      "value": 89.7,
      "target": 90,
      "trend": "stable"
    },
    {
      "name": "PPE Evaluation Correlation",
      "value": 91.5,
      "target": 90,
      "trend": "improving"
    },
    {
      "name": "Candidate Match Precision",
      "value": 87.3,
      "target": 85,
      "trend": "improving"
    },
    {
      "name": "AI Response Latency (p95)",
      "value": 2.3,
      "target": 3.0,
      "unit": "seconds",
      "trend": "stable"
    }
  ],
  "token_usage": {
    "total_tokens_30d": 12500000,
    "avg_tokens_per_task": 4500,
    "cost_usd_30d": 187.50
  }
}
```

### Generate Report

```
POST /api/v1/analytics/reports
```

**Request Body:**

```json
{
  "report_type": "monthly_hiring",
  "time_range": "30d",
  "format": "pdf",
  "recipients": ["hr@acme.com"]
}
```

**Response `200`:**

```json
{
  "report_id": "report_new",
  "status": "generating",
  "estimated_completion_seconds": 60
}
```

---

## Workflows

### List Workflows

```
GET /api/v1/workflows/
```

**Response `200`:**

```json
{
  "data": [
    {
      "id": "w1",
      "name": "Auto-Screen Applicants",
      "trigger": "application.submitted",
      "status": "active",
      "runs": 156,
      "success_rate": 0.98,
      "steps": 4,
      "last_run_at": "2025-01-20T14:00:00Z"
    }
  ],
  "total": 1
}
```

### Get Workflow

```
GET /api/v1/workflows/{workflow_id}
```

**Response `200`:**

```json
{
  "id": "w1",
  "name": "Auto-Screen Applicants",
  "trigger": "application.submitted",
  "status": "active",
  "steps": [
    {"order": 1, "type": "ai_evaluation", "name": "Screen Resume", "config": {"model": "gpt-4"}},
    {"order": 2, "type": "condition", "name": "Check Score", "config": {"field": "score", "operator": "gte", "value": 7}},
    {"order": 3, "type": "notification", "name": "Notify Recruiter", "config": {"channel": "email"}},
    {"order": 4, "type": "status_change", "name": "Move to Screening", "config": {"status": "screening"}}
  ],
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-20T14:00:00Z"
}
```

### Create Workflow

```
POST /api/v1/workflows/
```

**Request Body:**

```json
{
  "name": "Auto-Screen Applicants",
  "trigger": "application.submitted",
  "steps": [
    {"type": "ai_evaluation", "name": "Screen Resume"},
    {"type": "condition", "name": "Check Score", "config": {"field": "score", "operator": "gte", "value": 7}},
    {"type": "notification", "name": "Notify Recruiter"}
  ]
}
```

**Response `200`:**

```json
{
  "id": "w_new",
  "created": true
}
```

### Trigger Workflow

```
POST /api/v1/workflows/{workflow_id}/trigger
```

**Request Body:**

```json
{
  "context": {
    "candidate_id": "c1",
    "job_id": "j1",
    "application_id": "app1"
  }
}
```

**Response `200`:**

```json
{
  "workflow_id": "w1",
  "execution_id": "exec_new",
  "status": "running",
  "started_at": "2025-01-20T14:00:00Z"
}
```

### Activate Workflow

```
POST /api/v1/workflows/{workflow_id}/activate
```

**Response `200`:**

```json
{
  "workflow_id": "w1",
  "status": "active"
}
```

---

## Notifications

### Send Notification

```
POST /api/v1/notifications/
```

**Request Body:**

```json
{
  "recipient_id": "u2",
  "type": "email",
  "title": "Interview Scheduled",
  "body": "You have been scheduled for an interview with John Smith on Jan 20 at 2:00 PM.",
  "data": {
    "interview_id": "i1",
    "candidate_name": "John Smith"
  }
}
```

**Response `200`:**

```json
{
  "id": "n_new",
  "status": "sent"
}
```

### List Notifications

```
GET /api/v1/notifications/
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| unread_only | boolean | false | Filter to unread only |

**Response `200`:**

```json
{
  "data": [
    {
      "id": "n1",
      "type": "email",
      "title": "Interview Scheduled",
      "body": "You have been scheduled for an interview...",
      "read": false,
      "created_at": "2025-01-20T10:00:00Z"
    }
  ],
  "total": 1,
  "unread_count": 1
}
```

### Mark as Read

```
PUT /api/v1/notifications/{notification_id}/read
```

**Response `200`:**

```json
{
  "id": "n1",
  "read": true
}
```

### Get Preferences

```
GET /api/v1/notifications/preferences
```

**Response `200`:**

```json
{
  "email": true,
  "push": true,
  "in_app": true,
  "sms": false,
  "digest_frequency": "daily"
}
```

### Update Preferences

```
PUT /api/v1/notifications/preferences
```

**Request Body:**

```json
{
  "email": true,
  "push": true,
  "in_app": true,
  "sms": false,
  "digest_frequency": "weekly"
}
```

**Response `200`:**

```json
{
  "updated": true
}
```

---

## Compliance

### List Policies

```
GET /api/v1/compliance/policies
```

**Response `200`:**

```json
{
  "data": [
    {
      "id": "p1",
      "name": "GDPR Data Retention",
      "status": "active",
      "type": "data_retention",
      "retention_days": 730,
      "created_at": "2025-01-01T00:00:00Z"
    },
    {
      "id": "p2",
      "name": "SOC2 Audit Logging",
      "status": "active",
      "type": "audit_logging"
    }
  ],
  "total": 2
}
```

### Create Policy

```
POST /api/v1/compliance/policies
```

**Request Body:**

```json
{
  "name": "GDPR Data Retention",
  "type": "data_retention",
  "retention_days": 730,
  "applies_to": ["candidates", "resumes", "interviews"]
}
```

**Response `200`:**

```json
{
  "id": "p_new",
  "created": true
}
```

### Record Consent

```
POST /api/v1/compliance/consent
```

**Request Body:**

```json
{
  "candidate_id": "c1",
  "consent_type": "data_processing",
  "granted": true,
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0..."
}
```

**Response `200`:**

```json
{
  "id": "consent_new",
  "recorded": true,
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Get Audit Log

```
GET /api/v1/compliance/audit-log
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 20 | Items per page |
| action | string | — | Filter by action type |
| actor | string | — | Filter by actor |

**Response `200`:**

```json
{
  "data": [
    {
      "id": "a1",
      "action": "candidate.created",
      "actor": "user@acme.com",
      "resource_type": "candidate",
      "resource_id": "c1",
      "timestamp": "2025-01-20T10:00:00Z",
      "ip_address": "192.168.1.1",
      "details": {
        "candidate_name": "John Smith"
      }
    }
  ],
  "total": 1
}
```

### Export Data

```
POST /api/v1/compliance/data-export
```

**Request Body:**

```json
{
  "candidate_id": "c1",
  "format": "json"
}
```

**Response `200`:**

```json
{
  "export_id": "export_new",
  "status": "processing",
  "estimated_completion_seconds": 30
}
```

---

## Billing

### Get Subscription

```
GET /api/v1/billing/subscription
```

**Response `200`:**

```json
{
  "id": "sub_123",
  "plan": "enterprise",
  "status": "active",
  "monthly_price": 499,
  "currency": "USD",
  "seats": 50,
  "used_seats": 23,
  "ai_tokens_included": 5000000,
  "ai_tokens_used": 1250000,
  "current_period_start": "2025-01-01",
  "current_period_end": "2025-01-31"
}
```

### Create Subscription

```
POST /api/v1/billing/subscription
```

**Request Body:**

```json
{
  "plan": "enterprise",
  "seats": 50,
  "payment_method_id": "pm_123"
}
```

**Response `200`:**

```json
{
  "id": "sub_new",
  "created": true,
  "status": "active"
}
```

### List Invoices

```
GET /api/v1/billing/invoices
```

**Response `200`:**

```json
{
  "data": [
    {
      "id": "inv_001",
      "amount": 499,
      "currency": "USD",
      "status": "paid",
      "date": "2025-01-01",
      "period": "January 2025",
      "pdf_url": "/api/v1/billing/invoices/inv_001/pdf"
    }
  ],
  "total": 1
}
```

### Get Usage

```
GET /api/v1/billing/usage
```

**Response `200`:**

```json
{
  "period": "2025-01",
  "ai_tokens": 1250000,
  "ai_tokens_limit": 5000000,
  "candidates": 156,
  "interviews": 42,
  "storage_gb": 12.5,
  "storage_limit_gb": 100,
  "overage_charges": 0
}
```

---

## Search

### Search Candidates

```
POST /api/v1/search/candidates
```

**Request Body:**

```json
{
  "query": "senior python engineer with kubernetes experience",
  "filters": {
    "seniority": "senior",
    "skills": ["Python", "Kubernetes"],
    "location": "San Francisco"
  },
  "limit": 10
}
```

**Response `200`:**

```json
{
  "query": "senior python engineer with kubernetes experience",
  "results": [
    {
      "candidate_id": "c2",
      "name": "Sarah Chen",
      "score": 0.92,
      "skills_match": ["Python", "Kubernetes", "PostgreSQL"],
      "highlight": "Senior backend engineer with 7 years Python and 4 years Kubernetes..."
    }
  ],
  "total": 1,
  "search_time_ms": 45
}
```

### Search Jobs

```
POST /api/v1/search/jobs
```

**Request Body:**

```json
{
  "query": "backend engineer remote",
  "filters": {
    "remote_policy": "remote",
    "department": "Engineering"
  },
  "limit": 10
}
```

**Response `200`:**

```json
{
  "query": "backend engineer remote",
  "results": [
    {
      "job_id": "j1",
      "title": "Senior Backend Engineer",
      "department": "Engineering",
      "location": "Remote",
      "score": 0.95
    }
  ],
  "total": 1,
  "search_time_ms": 32
}
```

### Generate Embedding

```
POST /api/v1/search/embeddings
```

**Request Body:**

```json
{
  "text": "Senior Python engineer with Kubernetes experience",
  "model": "text-embedding-3-large"
}
```

**Response `200`:**

```json
{
  "embedding_id": "emb_new",
  "dimension": 3072,
  "model": "text-embedding-3-large"
}
```

### Get Embedding

```
GET /api/v1/search/embeddings/{embedding_id}
```

**Response `200`:**

```json
{
  "id": "emb_123",
  "dimension": 3072,
  "model": "text-embedding-3-large",
  "created_at": "2025-01-20T10:00:00Z"
}
```

---

## WebSocket API

### PPE WebSocket

```
WS /api/v1/ppe/ws/{session_id}
```

Real-time collaboration for pair programming evaluation sessions.

**Connection:**

```javascript
const ws = new WebSocket('ws://localhost:8000/api/v1/ppe/ws/session_123');
```

**Send message:**

```json
{
  "type": "code_update",
  "content": "def two_sum(nums, target):",
  "cursor_position": {"line": 1, "column": 25}
}
```

**Receive message:**

```json
{
  "type": "ack",
  "session_id": "session_123",
  "data": {
    "type": "code_update",
    "content": "def two_sum(nums, target):"
  }
}
```

**Message Types:**

| Type | Direction | Description |
|------|-----------|-------------|
| `code_update` | Client -> Server | Code editor content update |
| `cursor_move` | Client -> Server | Cursor position update |
| `agent_response` | Server -> Client | AI agent feedback |
| `test_result` | Server -> Client | Code execution results |
| `hint` | Server -> Client | AI-generated hint |
| `session_complete` | Server -> Client | Session completion notification |
| `error` | Server -> Client | Error message |

---

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": {
      "field": "email",
      "value": "not-an-email"
    }
  }
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource does not exist |
| 409 | Conflict - Resource already exists |
| 422 | Unprocessable Entity - Validation error |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |

### Error Codes

| Code | Description |
|------|-------------|
| `AUTH_INVALID_TOKEN` | Invalid or expired token |
| `AUTH_INSUFFICIENT_PERMISSIONS` | Not enough permissions |
| `AUTH_MFA_REQUIRED` | MFA verification required |
| `TENANT_NOT_FOUND` | Tenant does not exist |
| `TENANT_SUSPENDED` | Tenant account is suspended |
| `CANDIDATE_NOT_FOUND` | Candidate does not exist |
| `JOB_NOT_FOUND` | Job does not exist |
| `INTERVIEW_NOT_FOUND` | Interview does not exist |
| `PPE_SESSION_NOT_FOUND` | PPE session does not exist |
| `PPE_SESSION_EXPIRED` | PPE session has expired |
| `AI_AGENT_UNAVAILABLE` | AI agent is currently unavailable |
| `AI_TASK_FAILED` | AI task execution failed |
| `VALIDATION_ERROR` | Request validation failed |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `FILE_TOO_LARGE` | Uploaded file exceeds size limit |
| `UNSUPPORTED_FILE_TYPE` | File type not supported |
| `WORKFLOW_EXECUTION_FAILED` | Workflow step execution failed |

---

## Rate Limiting

API requests are rate-limited per user and per tenant:

| Tier | Requests/min | Burst |
|------|-------------|-------|
| Free | 60 | 10 |
| Pro | 300 | 50 |
| Enterprise | 1000 | 200 |

Rate limit headers are included in all responses:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 295
X-RateLimit-Reset: 1705780800
```

When rate limited:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please retry after 30 seconds.",
    "retry_after": 30
  }
}
```

---

## Pagination

All list endpoints support pagination:

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | int | 1 | Page number (1-indexed) |
| limit | int | 20 | Items per page (max 100) |

**Response Format:**

```json
{
  "data": [...],
  "total": 150,
  "page": 1,
  "limit": 20,
  "pages": 8
}
```

---

## Multi-Tenancy

All API requests are scoped to a tenant via the `X-Tenant-ID` header:

```bash
curl -H "X-Tenant-ID: tenant_123" http://localhost:8000/api/v1/candidates/
```

Resources are automatically filtered by tenant. Cross-tenant access is forbidden.
