"""Example data for AI-ROS API entities, requests, responses, and errors.

All examples are plain dicts so they can be serialised directly into
OpenAPI ``x-examples`` extensions, Postman collections, or test fixtures.
"""
from __future__ import annotations

from typing import Any


# ── Entity examples ────────────────────────────────────────────────────────────


def candidate_example() -> dict[str, Any]:
    return {
        "id": "cand_01HQX3EXAMPLE",
        "tenant_id": "tenant_default",
        "email": "jane.doe@example.com",
        "full_name": "Jane Doe",
        "phone": "+33 6 12 34 56 78",
        "location": "Paris, France",
        "status": "new",
        "source": "linkedin",
        "skills": ["Python", "FastAPI", "PostgreSQL", "Docker"],
        "experience_years": 5,
        "current_company": "Acme Corp",
        "current_title": "Senior Backend Engineer",
        "education": [
            {
                "degree": "MSc Computer Science",
                "institution": "ENS Paris",
                "year": 2019,
            }
        ],
        "tags": ["backend", "senior", "python"],
        "created_at": "2025-06-01T10:00:00Z",
        "updated_at": "2025-06-10T14:30:00Z",
    }


def job_example() -> dict[str, Any]:
    return {
        "id": "job_01HQX3EXAMPLE",
        "tenant_id": "tenant_default",
        "title": "Senior Backend Engineer",
        "department": "Engineering",
        "location": "Paris, France (Hybrid)",
        "employment_type": "full_time",
        "status": "open",
        "description": "We are looking for a senior backend engineer...",
        "requirements": ["5+ years Python", "FastAPI or Django", "PostgreSQL"],
        "salary_min": 65000,
        "salary_max": 85000,
        "salary_currency": "EUR",
        "skills_required": ["Python", "FastAPI", "PostgreSQL", "Docker"],
        "skills_nice_to_have": ["Kubernetes", "GraphQL"],
        "openings": 2,
        "created_at": "2025-05-15T09:00:00Z",
        "updated_at": "2025-06-10T14:30:00Z",
    }


def interview_example() -> dict[str, Any]:
    return {
        "id": "int_01HQX3EXAMPLE",
        "tenant_id": "tenant_default",
        "candidate_id": "cand_01HQX3EXAMPLE",
        "job_id": "job_01HQX3EXAMPLE",
        "type": "technical",
        "status": "scheduled",
        "scheduled_at": "2025-06-20T14:00:00Z",
        "duration_minutes": 60,
        "location": "https://meet.google.com/abc-defg-hij",
        "interviewers": ["user_01HQX3EXAMPLE"],
        "notes": "Focus on system design and Python internals.",
        "created_at": "2025-06-10T14:30:00Z",
    }


def tenant_example() -> dict[str, Any]:
    return {
        "id": "tenant_default",
        "name": "Acme Recruitment",
        "slug": "acme-recruitment",
        "plan": "pro",
        "settings": {
            "default_language": "en",
            "timezone": "Europe/Paris",
            "ai_enabled": True,
        },
        "created_at": "2025-01-01T00:00:00Z",
    }


def user_example() -> dict[str, Any]:
    return {
        "id": "user_01HQX3EXAMPLE",
        "tenant_id": "tenant_default",
        "email": "recruiter@acme.com",
        "full_name": "Alice Recruiter",
        "role": "recruiter",
        "status": "active",
        "created_at": "2025-01-15T08:00:00Z",
    }


def offer_example() -> dict[str, Any]:
    return {
        "id": "offer_01HQX3EXAMPLE",
        "tenant_id": "tenant_default",
        "candidate_id": "cand_01HQX3EXAMPLE",
        "job_id": "job_01HQX3EXAMPLE",
        "status": "pending",
        "salary": 75000,
        "currency": "EUR",
        "start_date": "2025-08-01",
        "expires_at": "2025-07-01T00:00:00Z",
        "created_at": "2025-06-12T10:00:00Z",
    }


def workflow_example() -> dict[str, Any]:
    return {
        "id": "wf_01HQX3EXAMPLE",
        "tenant_id": "tenant_default",
        "name": "Auto-reject no-reply",
        "trigger": "candidate.created",
        "conditions": [
            {"field": "email", "operator": "contains", "value": "noreply"},
        ],
        "actions": [
            {"type": "update_status", "value": "rejected"},
            {"type": "notify", "channel": "email", "template": "rejection"},
        ],
        "enabled": True,
        "created_at": "2025-03-01T12:00:00Z",
    }


def webhook_example() -> dict[str, Any]:
    return {
        "id": "wh_01HQX3EXAMPLE",
        "tenant_id": "tenant_default",
        "url": "https://hooks.example.com/ai-ros",
        "events": ["candidate.created", "candidate.updated", "interview.scheduled"],
        "secret": "whsec_****************",
        "active": True,
        "created_at": "2025-04-01T12:00:00Z",
    }


def billing_example() -> dict[str, Any]:
    return {
        "tenant_id": "tenant_default",
        "plan": "pro",
        "status": "active",
        "current_period_start": "2025-06-01T00:00:00Z",
        "current_period_end": "2025-07-01T00:00:00Z",
        "usage": {
            "candidates": 245,
            "candidates_limit": 1000,
            "ai_requests": 1200,
            "ai_requests_limit": 5000,
        },
    }


def analytics_example() -> dict[str, Any]:
    return {
        "period": {"start": "2025-06-01", "end": "2025-06-30"},
        "pipeline": {
            "new": 120,
            "screening": 45,
            "interview": 20,
            "offer": 8,
            "hired": 5,
            "rejected": 42,
        },
        "metrics": {
            "time_to_hire_days": 23.4,
            "offer_acceptance_rate": 0.875,
            "source_breakdown": {
                "linkedin": 45,
                "referral": 30,
                "website": 25,
                "agency": 20,
            },
        },
    }


# ── Error examples ─────────────────────────────────────────────────────────────


def get_error_examples() -> dict[str, dict[str, Any]]:
    return {
        "Unauthorized": {
            "error": {
                "code": "UNAUTHORIZED",
                "message": "Missing or invalid authorization header",
            },
        },
        "Forbidden": {
            "error": {
                "code": "FORBIDDEN",
                "message": "Insufficient role: requires one of admin (got 'viewer')",
            },
        },
        "NotFound": {
            "error": {
                "code": "NOT_FOUND",
                "message": "Resource not found",
            },
        },
        "Validation": {
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": [
                    {"field": "email", "message": "Invalid email format"},
                ],
            },
        },
        "RateLimit": {
            "error": {
                "code": "RATE_LIMIT_EXCEEDED",
                "message": "Too many requests. Retry after 30 seconds.",
                "retry_after": 30,
            },
        },
        "Conflict": {
            "error": {
                "code": "CONFLICT",
                "message": "A resource with this email already exists",
            },
        },
        "Internal": {
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred. Please try again later.",
            },
        },
    }


# ── Endpoint-specific examples ─────────────────────────────────────────────────


def get_all_examples() -> dict[str, dict[str, Any]]:
    """Return examples keyed by ``METHOD /path``."""
    return {
        "POST /api/v1/auth/login": {
            "summary": "Login with email and password",
            "request": {
                "email": "recruiter@acme.com",
                "password": "SecureP@ss123",
            },
            "response": {
                "access_token": "eyJhbGciOiJIUzI1NiIs...",
                "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
                "token_type": "bearer",
                "expires_in": 1800,
                "user": user_example(),
            },
        },
        "POST /api/v1/candidates": {
            "summary": "Create a new candidate",
            "request": {
                "email": "jane.doe@example.com",
                "full_name": "Jane Doe",
                "phone": "+33 6 12 34 56 78",
                "location": "Paris, France",
                "source": "linkedin",
                "skills": ["Python", "FastAPI"],
            },
            "response": candidate_example(),
        },
        "GET /api/v1/candidates": {
            "summary": "List candidates with pagination",
            "request": {"limit": 20, "offset": 0, "status": "new"},
            "response": {
                "data": [candidate_example()],
                "total": 245,
                "limit": 20,
                "offset": 0,
            },
        },
        "POST /api/v1/jobs": {
            "summary": "Create a new job posting",
            "request": {
                "title": "Senior Backend Engineer",
                "department": "Engineering",
                "location": "Paris, France (Hybrid)",
                "employment_type": "full_time",
                "description": "We are looking for...",
                "skills_required": ["Python", "FastAPI"],
            },
            "response": job_example(),
        },
        "GET /api/v1/jobs": {
            "summary": "List job postings",
            "request": {"limit": 20, "offset": 0, "status": "open"},
            "response": {
                "data": [job_example()],
                "total": 12,
                "limit": 20,
                "offset": 0,
            },
        },
        "POST /api/v1/interviews": {
            "summary": "Schedule an interview",
            "request": {
                "candidate_id": "cand_01HQX3EXAMPLE",
                "job_id": "job_01HQX3EXAMPLE",
                "type": "technical",
                "scheduled_at": "2025-06-20T14:00:00Z",
                "duration_minutes": 60,
            },
            "response": interview_example(),
        },
        "POST /api/v1/workflows": {
            "summary": "Create a workflow automation",
            "request": {
                "name": "Auto-reject no-reply",
                "trigger": "candidate.created",
                "conditions": [
                    {"field": "email", "operator": "contains", "value": "noreply"},
                ],
                "actions": [
                    {"type": "update_status", "value": "rejected"},
                ],
            },
            "response": workflow_example(),
        },
        "POST /api/v1/webhooks": {
            "summary": "Register a webhook subscription",
            "request": {
                "url": "https://hooks.example.com/ai-ros",
                "events": ["candidate.created", "interview.scheduled"],
            },
            "response": webhook_example(),
        },
        "GET /api/v1/analytics/pipeline": {
            "summary": "Get pipeline analytics",
            "request": {"start_date": "2025-06-01", "end_date": "2025-06-30"},
            "response": analytics_example(),
        },
        "GET /api/v1/billing/usage": {
            "summary": "Get current billing usage",
            "response": billing_example(),
        },
        "POST /api/v1/offers": {
            "summary": "Create a job offer",
            "request": {
                "candidate_id": "cand_01HQX3EXAMPLE",
                "job_id": "job_01HQX3EXAMPLE",
                "salary": 75000,
                "currency": "EUR",
                "start_date": "2025-08-01",
            },
            "response": offer_example(),
        },
    }


def get_example_by_tag(tag: str) -> list[dict[str, Any]]:
    """Return general examples associated with a tag name."""
    tag_examples: dict[str, list[dict[str, Any]]] = {
        "Auth": [
            {
                "summary": "Register a new user",
                "request": {
                    "email": "new.user@acme.com",
                    "password": "SecureP@ss123",
                    "full_name": "New User",
                    "tenant_id": "tenant_default",
                },
                "response": {
                    "access_token": "eyJhbGciOiJIUzI1NiIs...",
                    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
                    "token_type": "bearer",
                    "expires_in": 1800,
                },
            },
        ],
        "Candidates": [
            {
                "summary": "Enrich candidate with AI",
                "request": {"candidate_id": "cand_01HQX3EXAMPLE"},
                "response": {
                    **candidate_example(),
                    "ai_enrichment": {
                        "extracted_skills": ["Python", "FastAPI", "Docker", "Kubernetes"],
                        "seniority": "senior",
                        "confidence": 0.92,
                    },
                },
            },
        ],
        "Jobs": [
            {
                "summary": "Match candidates to a job",
                "request": {"job_id": "job_01HQX3EXAMPLE", "limit": 10},
                "response": {
                    "matches": [
                        {
                            "candidate": candidate_example(),
                            "score": 0.87,
                            "matched_skills": ["Python", "FastAPI", "PostgreSQL"],
                            "missing_skills": ["Kubernetes"],
                        },
                    ],
                },
            },
        ],
        "Search": [
            {
                "summary": "Semantic search for candidates",
                "request": {
                    "query": "Senior Python developer with cloud experience",
                    "limit": 10,
                },
                "response": {
                    "results": [
                        {
                            "candidate": candidate_example(),
                            "score": 0.94,
                            "highlights": ["Python", "cloud"],
                        },
                    ],
                },
            },
        ],
        "PPE": [
            {
                "summary": "Start a pair programming session",
                "request": {
                    "candidate_id": "cand_01HQX3EXAMPLE",
                    "job_id": "job_01HQX3EXAMPLE",
                    "challenge_id": "challenge_binary_tree",
                },
                "response": {
                    "session_id": "ppe_01HQX3EXAMPLE",
                    "status": "active",
                    "websocket_url": "wss://api.ai-ros.io/api/v1/ws/ppe/ppe_01HQX3EXAMPLE",
                    "started_at": "2025-06-15T14:00:00Z",
                },
            },
        ],
    }
    return tag_examples.get(tag, [])


def get_entity_examples() -> dict[str, dict[str, Any]]:
    """Return one example per entity type."""
    return {
        "candidate": candidate_example(),
        "job": job_example(),
        "interview": interview_example(),
        "tenant": tenant_example(),
        "user": user_example(),
        "offer": offer_example(),
        "workflow": workflow_example(),
        "webhook": webhook_example(),
        "billing": billing_example(),
        "analytics": analytics_example(),
    }
