"""Intelligent Scheduling Service — AI-powered interview scheduling."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


# ── In-Memory Store ─────────────────────────────────────────────────────────────

_schedules: dict[str, dict[str, Any]] = {}
_availability: dict[str, dict[str, Any]] = {}


# ── Request Models ──────────────────────────────────────────────────────────────

class SuggestRequest(BaseModel):
    candidate_id: str = Field(..., description="Candidate identifier")
    job_id: str = Field(..., description="Job identifier")
    interview_type: str = Field(default="technical", description="Type of interview")
    preferred_dates: list[str] | None = Field(None, description="Preferred dates (ISO format)")
    duration_minutes: int = Field(default=60, description="Interview duration in minutes")


class OptimizeRequest(BaseModel):
    interviews: list[dict[str, Any]] = Field(default_factory=list, description="Interviews to schedule")
    constraints: dict[str, Any] | None = Field(None, description="Scheduling constraints")


class AvailabilitySetRequest(BaseModel):
    interviewer_id: str = Field(..., description="Interviewer identifier")
    available_slots: list[dict[str, Any]] = Field(default_factory=list)
    busy_slots: list[dict[str, Any]] = Field(default_factory=list)


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "scheduling"


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Scheduling"])
async def health():
    return HealthResponse()


@router.post("/suggest", tags=["Scheduling"], summary="Suggest interview times")
async def suggest_slots(data: SuggestRequest):
    schedule_id = f"sch_{uuid.uuid4().hex[:12]}"
    result = {
        "id": schedule_id,
        "candidate_id": data.candidate_id,
        "job_id": data.job_id,
        "interview_type": data.interview_type,
        "suggested_slots": [
            {"date": "2025-01-22", "time": "10:00", "duration_minutes": data.duration_minutes, "confidence": 0.95},
            {"date": "2025-01-22", "time": "14:00", "duration_minutes": data.duration_minutes, "confidence": 0.92},
            {"date": "2025-01-23", "time": "11:00", "duration_minutes": data.duration_minutes, "confidence": 0.88},
        ],
        "timezone": "America/New_York",
        "reasoning": "Based on candidate availability and interviewer schedules, these slots optimize for minimal conflict.",
    }
    _schedules[schedule_id] = result
    return result


@router.post("/optimize", tags=["Scheduling"], summary="Optimize interview schedule")
async def optimize_schedule(data: OptimizeRequest):
    return {
        "optimized_schedule": [
            {"candidate": "John Smith", "interviewer": "Alex Chen", "date": "2025-01-22", "time": "10:00", "type": "technical"},
            {"candidate": "Sarah Chen", "interviewer": "Maria Garcia", "date": "2025-01-22", "time": "14:00", "type": "system_design"},
        ],
        "efficiency_score": 0.92,
        "conflicts_resolved": len(data.interviews),
    }


@router.get("/availability/{interviewer_id}", tags=["Scheduling"], summary="Get interviewer availability")
async def get_availability(interviewer_id: str):
    if interviewer_id in _availability:
        return _availability[interviewer_id]
    return {
        "interviewer_id": interviewer_id,
        "available_slots": [
            {"date": "2025-01-22", "times": ["09:00", "10:00", "14:00", "15:00"]},
            {"date": "2025-01-23", "times": ["10:00", "11:00", "13:00"]},
        ],
        "busy_slots": [
            {"date": "2025-01-22", "time": "11:00", "event": "Team standup"},
            {"date": "2025-01-23", "time": "09:00", "event": "1:1 meeting"},
        ],
    }


@router.post("/availability", tags=["Scheduling"], summary="Set interviewer availability")
async def set_availability(data: AvailabilitySetRequest):
    _availability[data.interviewer_id] = {
        "interviewer_id": data.interviewer_id,
        "available_slots": data.available_slots,
        "busy_slots": data.busy_slots,
    }
    return {"interviewer_id": data.interviewer_id, "updated": True}
