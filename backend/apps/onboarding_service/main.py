"""Onboarding Service — multi-step onboarding flow.

Tracks where each user is in the onboarding journey: profile,
organization setup, first job posting, first candidate, integrations,
billing, and team invites.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field


# ── Default Steps ──────────────────────────────────────────────────────────────


DEFAULT_STEPS: list[dict[str, Any]] = [
    {
        "id": "profile",
        "title": "Complete your profile",
        "description": "Add your name, photo, and role.",
        "order": 1,
        "required": True,
        "estimated_minutes": 2,
        "category": "account",
    },
    {
        "id": "organization",
        "title": "Set up your organization",
        "description": "Add company name, logo, and team size.",
        "order": 2,
        "required": True,
        "estimated_minutes": 3,
        "category": "organization",
    },
    {
        "id": "invite_team",
        "title": "Invite your team",
        "description": "Bring teammates on board (recruiters, hiring managers).",
        "order": 3,
        "required": False,
        "estimated_minutes": 2,
        "category": "team",
    },
    {
        "id": "first_job",
        "title": "Create your first job",
        "description": "Post a role to start sourcing candidates.",
        "order": 4,
        "required": True,
        "estimated_minutes": 5,
        "category": "recruiting",
    },
    {
        "id": "first_candidate",
        "title": "Add your first candidate",
        "description": "Manually add a candidate or import from your ATS.",
        "order": 5,
        "required": False,
        "estimated_minutes": 3,
        "category": "recruiting",
    },
    {
        "id": "integrations",
        "title": "Connect your tools",
        "description": "Calendar, email, LinkedIn, Slack — all in one place.",
        "order": 6,
        "required": False,
        "estimated_minutes": 4,
        "category": "integrations",
    },
    {
        "id": "billing",
        "title": "Choose a plan",
        "description": "Pick Free, Pro, or Enterprise — change any time.",
        "order": 7,
        "required": False,
        "estimated_minutes": 2,
        "category": "billing",
    },
    {
        "id": "tour",
        "title": "Take the product tour",
        "description": "Learn key features in 60 seconds.",
        "order": 8,
        "required": False,
        "estimated_minutes": 1,
        "category": "education",
    },
]

# ── In-Memory Store ────────────────────────────────────────────────────────────

# user_key -> {completed: set[step_id], skipped: bool, started_at, completed_at}
_user_state: dict[str, dict[str, Any]] = {}


# ── Models ─────────────────────────────────────────────────────────────────────


class OnboardingStep(BaseModel):
    id: str
    title: str
    description: str
    order: int
    required: bool
    estimated_minutes: int
    category: str
    completed: bool = False
    completed_at: Optional[str] = None


class OnboardingStatus(BaseModel):
    user_key: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    skipped: bool = False
    completion_percent: float = 0.0
    required_completion_percent: float = 0.0
    total_steps: int = 0
    completed_steps: int = 0
    required_steps_remaining: int = 0
    next_step: Optional[OnboardingStep] = None
    steps: list[OnboardingStep] = []


class StepsResponse(BaseModel):
    steps: list[OnboardingStep]
    total: int


class CompleteResponse(BaseModel):
    step_id: str
    completed: bool = True
    completion_percent: float


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "onboarding"


# ── Helpers ────────────────────────────────────────────────────────────────────


def _user_key(authorization: Optional[str], x_user_id: Optional[str]) -> str:
    if x_user_id:
        return x_user_id
    if authorization:
        return f"auth_{hash(authorization) & 0xffff:04x}"
    return "demo_user"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _state(user_key: str) -> dict[str, Any]:
    if user_key not in _user_state:
        _user_state[user_key] = {
            "started_at": _now().isoformat(),
            "completed_at": None,
            "skipped": False,
            "completed": {},  # step_id -> timestamp
        }
    return _user_state[user_key]


def _build_status(user_key: str) -> OnboardingStatus:
    state = _state(user_key)
    completed = state["completed"]
    skipped = state["skipped"]
    steps: list[OnboardingStep] = []
    for s in DEFAULT_STEPS:
        steps.append(OnboardingStep(
            **s,
            completed=s["id"] in completed,
            completed_at=completed.get(s["id"]),
        ))
    total = len(steps)
    done = sum(1 for s in steps if s.completed)
    required = [s for s in steps if s.required]
    required_done = sum(1 for s in required if s.completed)
    required_remaining = len(required) - required_done

    next_step = None
    for s in sorted(steps, key=lambda x: x.order):
        if not s.completed:
            next_step = s
            break

    if required_remaining == 0 and not state.get("completed_at"):
        state["completed_at"] = _now().isoformat()

    return OnboardingStatus(
        user_key=user_key,
        started_at=state["started_at"],
        completed_at=state.get("completed_at"),
        skipped=skipped,
        completion_percent=round((done / total) * 100, 1) if total else 0,
        required_completion_percent=(
            round((required_done / len(required)) * 100, 1) if required else 100.0
        ),
        total_steps=total,
        completed_steps=done,
        required_steps_remaining=required_remaining,
        next_step=next_step,
        steps=steps,
    )


# ── Router ─────────────────────────────────────────────────────────────────────


router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Onboarding"])
async def health() -> HealthResponse:
    return HealthResponse()


@router.get("/steps", response_model=StepsResponse, tags=["Onboarding"])
async def list_steps():
    steps = [OnboardingStep(**s) for s in DEFAULT_STEPS]
    return StepsResponse(steps=steps, total=len(steps))


@router.get("/status", response_model=OnboardingStatus, tags=["Onboarding"])
async def get_status(
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    return _build_status(_user_key(authorization, x_user_id))


@router.post("/step/{step_id}/complete", response_model=CompleteResponse, tags=["Onboarding"])
async def complete_step(
    step_id: str,
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    if not any(s["id"] == step_id for s in DEFAULT_STEPS):
        raise HTTPException(status_code=404, detail=f"Unknown step: {step_id}")
    user_key = _user_key(authorization, x_user_id)
    state = _state(user_key)
    state["completed"][step_id] = _now().isoformat()
    status_data = _build_status(user_key)
    return CompleteResponse(step_id=step_id, completed=True, completion_percent=status_data.completion_percent)


@router.post("/step/{step_id}/uncomplete", tags=["Onboarding"])
async def uncomplete_step(
    step_id: str,
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    user_key = _user_key(authorization, x_user_id)
    state = _state(user_key)
    state["completed"].pop(step_id, None)
    state["completed_at"] = None
    return {"step_id": step_id, "completed": False}


@router.post("/skip", tags=["Onboarding"])
async def skip_onboarding(
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    user_key = _user_key(authorization, x_user_id)
    state = _state(user_key)
    state["skipped"] = True
    state["completed_at"] = _now().isoformat()
    return {"skipped": True, "completed_at": state["completed_at"]}


@router.post("/reset", tags=["Onboarding"])
async def reset_onboarding(
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    user_key = _user_key(authorization, x_user_id)
    _user_state.pop(user_key, None)
    return {"reset": True, "user_key": user_key}
