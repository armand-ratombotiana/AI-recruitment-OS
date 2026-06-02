"""Analytics Service — Metrics, reporting, dashboards."""
from __future__ import annotations

import random
from datetime import datetime, timezone

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "healthy", "service": "analytics"}


@router.get("/dashboard")
async def get_dashboard(time_range: str = "7d", department: str = "engineering"):
    seed = hash(time_range + department) % 10000
    random.seed(seed)

    base_candidates = random.randint(800, 1500)
    base_jobs = random.randint(15, 35)
    base_interviews = random.randint(20, 60)

    return {
        "time_range": time_range,
        "department": department,
        "metrics": {
            "total_candidates": base_candidates,
            "open_positions": base_jobs,
            "active_interviews": base_interviews,
            "hires_this_month": random.randint(5, 15),
            "avg_time_to_hire_days": round(random.uniform(12.0, 18.0), 1),
            "ai_evaluation_accuracy": round(random.uniform(88.0, 95.0), 1),
            "conversion_rate": round(random.uniform(0.08, 0.18), 2),
            "candidate_satisfaction": round(random.uniform(4.0, 4.8), 1),
        },
        "trends": {
            "candidates_delta": round(random.uniform(-0.1, 0.2), 2),
            "hires_delta": round(random.uniform(-0.1, 0.3), 2),
            "time_to_hire_delta": round(random.uniform(-2.0, 1.0), 1),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/pipeline")
async def get_pipeline(department: str = "engineering", days: int = 30):
    seed = hash(department + str(days)) % 10000
    random.seed(seed)

    applied = random.randint(120, 200)
    screening = int(applied * random.uniform(0.5, 0.7))
    interview = int(screening * random.uniform(0.4, 0.6))
    evaluation = int(interview * random.uniform(0.5, 0.7))
    offer = int(evaluation * random.uniform(0.3, 0.5))
    hired = int(offer * random.uniform(0.6, 0.9))

    stages = [
        {"stage": "Applied", "count": applied, "conversion_rate": round(screening / applied, 2) if applied else 0},
        {"stage": "Screening", "count": screening, "conversion_rate": round(interview / screening, 2) if screening else 0},
        {"stage": "Interview", "count": interview, "conversion_rate": round(evaluation / interview, 2) if interview else 0},
        {"stage": "Evaluation", "count": evaluation, "conversion_rate": round(offer / evaluation, 2) if evaluation else 0},
        {"stage": "Offer", "count": offer, "conversion_rate": round(hired / offer, 2) if offer else 0},
        {"stage": "Hired", "count": hired, "conversion_rate": 1.0},
    ]

    return {
        "department": department,
        "days": days,
        "pipeline": stages,
        "overall_conversion": round(hired / applied, 3) if applied else 0,
    }


@router.get("/ai-performance")
async def get_ai_performance(agent_type: Optional[str] = None):
    metrics_data = [
        {"name": "Resume Parsing Accuracy", "value": round(random.uniform(91.0, 96.0), 1), "target": 95.0, "agent": "resume_parsing"},
        {"name": "Skill Extraction F1", "value": round(random.uniform(87.0, 93.0), 1), "target": 90.0, "agent": "skill_extraction"},
        {"name": "PPE Evaluation Correlation", "value": round(random.uniform(89.0, 94.0), 1), "target": 90.0, "agent": "ppe_evaluation"},
        {"name": "Candidate Matching Accuracy", "value": round(random.uniform(85.0, 92.0), 1), "target": 90.0, "agent": "candidate_profiling"},
        {"name": "Interview Score Predictiveness", "value": round(random.uniform(82.0, 90.0), 1), "target": 85.0, "agent": "hr_interview"},
        {"name": "Technical Assessment Validity", "value": round(random.uniform(86.0, 94.0), 1), "target": 88.0, "agent": "technical_interview"},
    ]

    if agent_type:
        metrics_data = [m for m in metrics_data if m["agent"] == agent_type]

    return {
        "metrics": metrics_data,
        "overall_score": round(sum(m["value"] for m in metrics_data) / len(metrics_data), 1) if metrics_data else 0,
    }


from typing import Optional


@router.get("/recruiter-productivity")
async def get_recruiter_productivity():
    recruiters = [
        {"name": "Jane Smith", "candidates_reviewed": random.randint(30, 60),
         "interviews_conducted": random.randint(8, 18), "hires": random.randint(2, 6),
         "avg_response_time_hours": round(random.uniform(1.0, 4.0), 1)},
        {"name": "Bob Johnson", "candidates_reviewed": random.randint(25, 50),
         "interviews_conducted": random.randint(6, 15), "hires": random.randint(1, 5),
         "avg_response_time_hours": round(random.uniform(1.5, 5.0), 1)},
        {"name": "Alice Williams", "candidates_reviewed": random.randint(35, 65),
         "interviews_conducted": random.randint(10, 20), "hires": random.randint(3, 7),
         "avg_response_time_hours": round(random.uniform(0.8, 3.5), 1)},
    ]
    return {"recruiters": recruiters}


@router.get("/time-to-hire")
async def get_time_to_hire():
    application = 0
    screening = round(random.uniform(0.8, 2.0), 1)
    interview = round(screening + random.uniform(3.0, 6.0), 1)
    evaluation = round(interview + random.uniform(1.5, 3.0), 1)
    offer = round(evaluation + random.uniform(2.0, 4.0), 1)
    hired = round(offer + random.uniform(1.0, 3.0), 1)

    return {
        "average_days": hired,
        "by_stage": [
            {"stage": "Application", "days": application},
            {"stage": "Screening", "days": screening},
            {"stage": "Interview", "days": interview},
            {"stage": "Evaluation", "days": evaluation},
            {"stage": "Offer", "days": offer},
            {"stage": "Hired", "days": hired},
        ],
    }


@router.post("/reports")
async def generate_report(report_type: str = "monthly"):
    report_id = f"report_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    return {
        "report_id": report_id,
        "status": "generating",
        "report_type": report_type,
        "estimated_time": "30 seconds",
    }


@router.get("/reports/{report_id}")
async def get_report(report_id: str):
    return {
        "report_id": report_id,
        "status": "completed",
        "data": {
            "summary": "Monthly recruitment report",
            "hires": random.randint(5, 15),
            "time_to_hire": round(random.uniform(12.0, 18.0), 1),
            "top_source": "LinkedIn",
            "ai_accuracy": round(random.uniform(88.0, 95.0), 1),
        },
    }
