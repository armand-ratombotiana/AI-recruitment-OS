# API Contracts — Complete REST API Specification

## API Design Principles

- **Versioning**: URL-based (`/api/v1/`, `/api/v2/`)
- **Pagination**: Cursor-based for all list endpoints
- **Filtering**: Query parameter based (`?status=active&seniority=senior`)
- **Sorting**: `?sort=created_at:desc`
- **Field Selection**: `?fields=id,email,full_name`
- **Error Format**: Standardized error response

### Standard Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

### Pagination Response

```json
{
  "data": [...],
  "pagination": {
    "cursor": "eyJpZCI6...",
    "has_more": true,
    "total_count": 150
  }
}
```

## Auth API

### POST /api/v1/auth/register
```json
// Request
{
  "email": "recruiter@company.com",
  "full_name": "Jane Smith",
  "password": "securePassword123!",
  "role": "recruiter"
}

// Response 201
{
  "id": "uuid",
  "email": "recruiter@company.com",
  "full_name": "Jane Smith",
  "role": "recruiter",
  "created_at": "2025-01-15T10:00:00Z"
}
```

### POST /api/v1/auth/login
```json
// Request
{
  "email": "recruiter@company.com",
  "password": "securePassword123!"
}

// Response 200
{
  "access_token": "eyJhbG...",
  "refresh_token": "eyJhbG...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

### POST /api/v1/auth/mfa/enable
```json
// Response 200
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qr_code": "data:image/png;base64,...",
  "backup_codes": ["123456", "789012"]
}
```

## Candidate API

### POST /api/v1/candidates
```json
// Request
{
  "email": "john.doe@email.com",
  "full_name": "John Doe",
  "phone": "+1-555-0123",
  "location": "San Francisco, CA",
  "linkedin_url": "https://linkedin.com/in/johndoe",
  "source": "linkedin"
}

// Response 201
{
  "id": "uuid",
  "tenant_id": "tenant_uuid",
  "email": "john.doe@email.com",
  "full_name": "John Doe",
  "status": "new",
  "created_at": "2025-01-15T10:00:00Z"
}
```

### GET /api/v1/candidates
```
Query Parameters:
  - cursor: string (pagination)
  - limit: integer (default 20, max 100)
  - status: string (filter)
  - seniority: string (filter)
  - search: string (full-text search)
  - sort: string (field:direction)
  - skills: string[] (filter by skills)

// Response 200
{
  "data": [
    {
      "id": "uuid",
      "email": "john.doe@email.com",
      "full_name": "John Doe",
      "status": "screening",
      "seniority_level": "senior",
      "years_experience": 8,
      "match_score": 0.87,
      "created_at": "2025-01-15T10:00:00Z"
    }
  ],
  "pagination": {
    "cursor": "eyJpZCI6...",
    "has_more": true,
    "total_count": 150
  }
}
```

### GET /api/v1/candidates/{id}
```json
// Response 200
{
  "id": "uuid",
  "email": "john.doe@email.com",
  "full_name": "John Doe",
  "phone": "+1-555-0123",
  "location": "San Francisco, CA",
  "status": "screening",
  "profile": {
    "seniority_level": "senior",
    "years_experience": 8,
    "summary": "Senior backend engineer with 8 years...",
    "skills": [
      {"name": "Python", "proficiency": "expert", "years": 7},
      {"name": "PostgreSQL", "proficiency": "advanced", "years": 6},
      {"name": "Kubernetes", "proficiency": "advanced", "years": 4}
    ],
    "domains": ["backend", "infrastructure", "data"],
    "education": [
      {
        "degree": "M.S. Computer Science",
        "institution": "Stanford University",
        "year": 2017
      }
    ]
  },
  "evaluations": [
    {
      "id": "eval_uuid",
      "type": "comprehensive",
      "overall_score": 8.2,
      "seniority_estimation": "senior"
    }
  ],
  "applications": 3,
  "interviews_completed": 2,
  "created_at": "2025-01-15T10:00:00Z"
}
```

### POST /api/v1/candidates/{id}/enrich
```json
// Response 202
{
  "task_id": "uuid",
  "status": "processing",
  "estimated_completion": "2025-01-15T10:02:00Z"
}
```

## Resume API

### POST /api/v1/resumes/upload
```
Content-Type: multipart/form-data

Fields:
  - candidate_id: string
  - file: binary (PDF, DOCX, PNG, JPG)

// Response 201
{
  "id": "uuid",
  "candidate_id": "candidate_uuid",
  "file_name": "john_doe_resume.pdf",
  "file_size": 245000,
  "mime_type": "application/pdf",
  "status": "uploaded",
  "created_at": "2025-01-15T10:00:00Z"
}
```

### GET /api/v1/resumes/{id}/parsed
```json
// Response 200
{
  "resume_id": "uuid",
  "status": "parsed",
  "sections": {
    "contact": {
      "email": "john.doe@email.com",
      "phone": "+1-555-0123",
      "location": "San Francisco, CA"
    },
    "summary": "Senior backend engineer with expertise in distributed systems...",
    "experience": [
      {
        "title": "Senior Software Engineer",
        "company": "Tech Corp",
        "start_date": "2020-01",
        "end_date": null,
        "description": "Led development of microservices platform...",
        "skills_used": ["Python", "Kubernetes", "PostgreSQL"]
      }
    ],
    "education": [
      {
        "degree": "M.S. Computer Science",
        "institution": "Stanford University",
        "year": 2017
      }
    ],
    "skills": ["Python", "PostgreSQL", "Kubernetes", "Redis", "Kafka"]
  },
  "parsing_confidence": 0.95,
  "created_at": "2025-01-15T10:00:05Z"
}
```

## Job API

### POST /api/v1/jobs
```json
// Request
{
  "title": "Senior Backend Engineer",
  "description": "We are looking for a senior backend engineer to join our platform team...",
  "department": "Engineering",
  "location": "San Francisco, CA",
  "remote_policy": "hybrid",
  "job_type": "full_time",
  "seniority_required": "senior",
  "required_skills": ["Python", "PostgreSQL", "Kubernetes"],
  "preferred_skills": ["Redis", "Kafka", "Terraform"]
}

// Response 201
{
  "id": "uuid",
  "title": "Senior Backend Engineer",
  "status": "draft",
  "created_at": "2025-01-15T10:00:00Z"
}
```

### GET /api/v1/jobs/{id}/candidates
```json
// Response 200
{
  "job_id": "uuid",
  "job_title": "Senior Backend Engineer",
  "matched_candidates": [
    {
      "candidate_id": "uuid",
      "name": "John Doe",
      "overall_score": 0.87,
      "skill_match_score": 0.92,
      "experience_match_score": 0.85,
      "semantic_similarity": 0.89,
      "explanation": "Strong match in Python, PostgreSQL, and Kubernetes. "
                     "8 years experience exceeds minimum. "
                     "Background in distributed systems aligns well."
    }
  ]
}
```

## PPE API

### POST /api/v1/ppe/sessions
```json
// Request
{
  "interview_id": "interview_uuid",
  "language": "python",
  "difficulty": "medium",
  "max_duration_seconds": 1800
}

// Response 201
{
  "id": "session_uuid",
  "interview_id": "interview_uuid",
  "language": "python",
  "status": "created",
  "difficulty": "medium",
  "room_id": "ppe-session_uuid",
  "websocket_url": "wss://api.airos.com/ws/ppe/session_uuid",
  "created_at": "2025-01-15T10:00:00Z"
}
```

### POST /api/v1/ppe/sessions/{id}/execute
```json
// Request
{
  "code": "def two_sum(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        complement = target - num\n        if complement in seen:\n            return [seen[complement], i]\n        seen[num] = i\n    return []",
  "language": "python"
}

// Response 200
{
  "execution": {
    "stdout": "",
    "stderr": "",
    "exit_code": 0,
    "tests_passed": "3/5",
    "all_tests_passed": false
  },
  "agent_response": {
    "type": "code_review",
    "tests_passed": "3/5",
    "all_tests_passed": false,
    "message": "3 out of 5 tests pass. The failing tests involve edge cases with duplicate values. Consider how your solution handles when the same element could be used twice.",
    "hint_available": true
  }
}
```

### POST /api/v1/ppe/sessions/{id}/hint
```json
// Response 200
{
  "type": "hint",
  "message": "Have you considered what happens when the complement equals the current element? Think about the order of operations in your hash map insertion.",
  "hints_remaining": 2,
  "hint_level": 1
}
```

### GET /api/v1/ppe/sessions/{id}/evaluation
```json
// Response 200
{
  "id": "eval_uuid",
  "session_id": "session_uuid",
  "overall_score": 7.8,
  "seniority_estimation": "senior",
  "confidence_level": 0.85,
  "hiring_recommendation": "hire",
  "scores": {
    "technical_skills": {
      "correctness": 8.5,
      "efficiency": 7.5,
      "algorithm_quality": 8.0,
      "edge_case_handling": 6.5
    },
    "cs_fundamentals": {
      "big_o_understanding": 8.0,
      "tradeoff_reasoning": 7.5,
      "scalability_awareness": 7.0,
      "data_structures": 8.5
    },
    "code_quality": {
      "readability": 8.5,
      "maintainability": 8.0,
      "modularity": 7.5,
      "naming": 9.0
    },
    "problem_solving": {
      "decomposition": 8.0,
      "iterative_reasoning": 7.5,
      "debugging": 7.0,
      "optimization": 7.5
    },
    "communication": {
      "clarity": 8.5,
      "collaboration": 8.0,
      "transparency": 8.0
    }
  },
  "strengths": ["Strong Code Quality", "Solid CS Fundamentals"],
  "weaknesses": ["Edge case handling could improve"],
  "reasoning_trace": {
    "session_summary": {
      "total_code_submissions": 4,
      "hints_provided": 1,
      "follow_ups_asked": 3
    }
  },
  "created_at": "2025-01-15T10:30:00Z"
}
```

## WebSocket API — Live Coding

### Connection
```
wss://api.airos.com/ws/ppe/{session_id}

Headers:
  Authorization: Bearer {access_token}
  X-Tenant-ID: {tenant_id}
```

### Message Types

#### Candidate → Server
```json
{"type": "code_update", "code": "...", "cursor_position": 42}
{"type": "execute"}
{"type": "request_hint"}
{"type": "message", "content": "Can you explain the time complexity?"}
```

#### Server → Candidate
```json
{"type": "code_sync", "code": "...", "version": 5}
{"type": "execution_result", "stdout": "", "stderr": "", "exit_code": 0, "tests": [...]}
{"type": "hint", "message": "...", "hints_remaining": 2}
{"type": "agent_message", "content": "Good approach! Let me ask a follow-up..."}
{"type": "session_complete", "evaluation_summary": {...}}
{"type": "heartbeat"}
```
