"""Analytics Service — Pipeline analytics, AI performance metrics, and reports."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field


# ── Request Models ──────────────────────────────────────────────────────────────

class ReportRequest(BaseModel):
    report_type: str = Field(default="pipeline", description="pipeline | ai_performance | custom")
    time_range: str = Field(default="30d", description="7d | 30d | 90d | 1y")
    filters: dict = Field(default_factory=dict, description="Additional report filters")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "analytics"


class DashboardMetrics(BaseModel):
    total_candidates: int
    open_positions: int
    active_interviews: int
    hires_this_month: int
    avg_time_to_hire_days: float
    ai_evaluation_accuracy: float


class DashboardResponse(BaseModel):
    time_range: str
    metrics: DashboardMetrics


class MetricDataPoint(BaseModel):
    timestamp: str
    value: int | float


class MetricsResponse(BaseModel):
    metric: str
    data: list[MetricDataPoint]


class PipelineStage(BaseModel):
    stage: str
    count: int


class PipelineResponse(BaseModel):
    pipeline: list[PipelineStage]


class AIMetric(BaseModel):
    name: str
    value: float
    target: float


class AIPerformanceResponse(BaseModel):
    metrics: list[AIMetric]


class ReportResponse(BaseModel):
    report_id: str
    status: str = "generating"


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Analytics"], summary="Analytics service health check")
async def health():
    return HealthResponse()


@router.get("/dashboard", response_model=DashboardResponse, tags=["Analytics"], summary="Get dashboard metrics",
            description="Retrieve high-level recruitment metrics for the dashboard.",
            responses={200: {"description": "Dashboard metrics retrieved successfully"}})
async def get_dashboard(time_range: str = "7d"):
    return DashboardResponse(
        time_range=time_range,
        metrics=DashboardMetrics(
            total_candidates=1247, open_positions=23, active_interviews=18,
            hires_this_month=7, avg_time_to_hire_days=14.7, ai_evaluation_accuracy=91.5,
        ),
    )


@router.get("/metrics", response_model=MetricsResponse, tags=["Analytics"], summary="Query metrics",
            description="Query a specific metric by name or retrieve all available metrics.")
async def query_metrics(metric_name: str | None = None):
    return MetricsResponse(metric=metric_name or "all", data=[
        MetricDataPoint(timestamp="2025-01-20", value=42),
        MetricDataPoint(timestamp="2025-01-21", value=38),
    ])


@router.get("/pipeline", response_model=PipelineResponse, tags=["Analytics"], summary="Pipeline analytics",
            description="Get candidate counts per pipeline stage (Applied → Hired).")
async def get_pipeline_analytics():
    return PipelineResponse(pipeline=[
        PipelineStage(stage="Applied", count=145), PipelineStage(stage="Screening", count=89),
        PipelineStage(stage="Interview", count=42), PipelineStage(stage="Evaluation", count=18),
        PipelineStage(stage="Offer", count=7), PipelineStage(stage="Hired", count=3),
    ])


@router.get("/ai-performance", response_model=AIPerformanceResponse, tags=["Analytics"],
            summary="AI model performance",
            description="Retrieve AI model accuracy metrics and target comparisons.")
async def get_ai_performance():
    return AIPerformanceResponse(metrics=[
        AIMetric(name="Resume Parsing Accuracy", value=94.2, target=95),
        AIMetric(name="Skill Extraction F1", value=89.7, target=90),
        AIMetric(name="PPE Evaluation Correlation", value=91.5, target=90),
    ])


@router.post("/reports", response_model=ReportResponse, tags=["Analytics"], summary="Generate report",
             description="Queue a custom analytics report for asynchronous generation.")
async def generate_report(data: ReportRequest):
    return ReportResponse(report_id="report_new")
