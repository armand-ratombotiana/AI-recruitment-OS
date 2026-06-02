"""Talent Intelligence Service — Market insights and analytics."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel


router = APIRouter()


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "talent-intelligence"


@router.get("/health", response_model=HealthResponse, tags=["Talent Intelligence"])
async def health():
    return HealthResponse()


@router.get("/market", tags=["Talent Intelligence"], summary="Get talent market insights")
async def get_market_insights():
    return {
        "market": "tech",
        "insights": {
            "demand_trend": "increasing",
            "top_skills": ["Python", "Kubernetes", "AI/ML", "Cloud"],
            "avg_salary_ranges": {
                "junior": {"min": 60000, "max": 80000, "currency": "USD"},
                "mid": {"min": 80000, "max": 120000, "currency": "USD"},
                "senior": {"min": 120000, "max": 180000, "currency": "USD"},
            },
            "competition_level": "high",
            "time_to_hire_avg_days": 32,
        },
    }


@router.get("/competitors", tags=["Talent Intelligence"], summary="Get competitor hiring analysis")
async def get_competitor_analysis():
    return {
        "competitors": [
            {"name": "TechCorp", "open_positions": 45, "avg_salary": 150000},
            {"name": "AIStart", "open_positions": 23, "avg_salary": 170000},
            {"name": "CloudInc", "open_positions": 67, "avg_salary": 140000},
        ],
        "recommendations": [
            "Consider increasing salary ranges for senior positions",
            "Focus on remote work options to expand talent pool",
            "Invest in employer branding to compete with larger companies",
        ],
    }


@router.get("/salary", tags=["Talent Intelligence"], summary="Get salary benchmarks for a role")
async def get_salary_benchmarks(role: str = "software_engineer"):
    return {
        "role": role,
        "location": "San Francisco, CA",
        "benchmarks": {
            "p25": 95000,
            "p50": 130000,
            "p75": 165000,
            "p90": 200000,
        },
        "factors": ["experience", "skills", "education", "location"],
        "market_conditions": "competitive",
    }


@router.get("/pool", tags=["Talent Intelligence"], summary="Get talent pool analytics")
async def get_talent_pool():
    return {
        "total_candidates": 1247,
        "by_status": {"new": 234, "screening": 156, "interviewing": 89, "offered": 23, "hired": 45},
        "by_seniority": {"junior": 312, "mid": 456, "senior": 389, "staff": 78, "principal": 12},
        "top_skills": [
            {"name": "Python", "count": 345},
            {"name": "JavaScript", "count": 298},
            {"name": "React", "count": 267},
            {"name": "Kubernetes", "count": 189},
            {"name": "AI/ML", "count": 156},
        ],
        "conversion_rates": {
            "application_to_screening": 0.67,
            "screening_to_interview": 0.57,
            "interview_to_offer": 0.26,
            "offer_to_hire": 0.65,
        },
    }
