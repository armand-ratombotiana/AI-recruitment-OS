"""Analytics Service — Metrics, reporting, dashboards."""
from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "analytics"}

@router.get("/dashboard")
async def get_dashboard(time_range: str = "7d"):
    return {"time_range": time_range, "metrics": {"total_candidates": 1247, "open_positions": 23, "active_interviews": 18, "hires_this_month": 7, "avg_time_to_hire_days": 14.7, "ai_evaluation_accuracy": 91.5, "conversion_rate": 0.12, "candidate_satisfaction": 4.5}}

@router.get("/pipeline")
async def get_pipeline():
    return {"pipeline": [{"stage": "Applied", "count": 145, "conversion_rate": 0.61}, {"stage": "Screening", "count": 89, "conversion_rate": 0.47}, {"stage": "Interview", "count": 42, "conversion_rate": 0.43}, {"stage": "Evaluation", "count": 18, "conversion_rate": 0.39}, {"stage": "Offer", "count": 7, "conversion_rate": 0.43}, {"stage": "Hired", "count": 3, "conversion_rate": 1.0}]}

@router.get("/ai-performance")
async def get_ai_performance():
    return {"metrics": [{"name": "Resume Parsing Accuracy", "value": 94.2, "target": 95}, {"name": "Skill Extraction F1", "value": 89.7, "target": 90}, {"name": "PPE Evaluation Correlation", "value": 91.5, "target": 90}, {"name": "Candidate Matching Accuracy", "value": 87.2, "target": 90}]}

@router.get("/recruiter-productivity")
async def get_recruiter_productivity():
    return {"recruiters": [{"name": "Jane Smith", "candidates_reviewed": 45, "interviews_conducted": 12, "hires": 3}, {"name": "Bob Johnson", "candidates_reviewed": 38, "interviews_conducted": 10, "hires": 2}]}

@router.get("/time-to-hire")
async def get_time_to_hire():
    return {"average_days": 14.7, "by_stage": [{"stage": "Application", "days": 0}, {"stage": "Screening", "days": 1.2}, {"stage": "Interview", "days": 5.4}, {"stage": "Evaluation", "days": 7.1}, {"stage": "Offer", "days": 10.3}, {"stage": "Hired", "days": 14.7}]}

@router.post("/reports")
async def generate_report():
    return {"report_id": "report_new", "status": "generating", "estimated_time": "30 seconds"}

@router.get("/reports/{report_id}")
async def get_report(report_id: str):
    return {"report_id": report_id, "status": "completed", "data": {"summary": "Monthly recruitment report", "hires": 7, "time_to_hire": 14.7}}