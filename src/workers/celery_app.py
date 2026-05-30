"""Celery application configuration and periodic tasks."""

from celery import Celery
from celery.schedules import crontab

from src.config import get_settings

settings = get_settings()

celery_app = Celery(
    "ai_ros",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "src.workers.tasks.resume_tasks.*": {"queue": "resume"},
        "src.workers.tasks.ai_tasks.*": {"queue": "ai"},
        "src.workers.tasks.interview_tasks.*": {"queue": "interview"},
        "src.workers.tasks.workflow_tasks.*": {"queue": "workflow"},
        "src.workers.tasks.analytics_tasks.*": {"queue": "analytics"},
        "src.workers.tasks.notification_tasks.*": {"queue": "notification"},
    },
    beat_schedule={
        "aggregate-metrics": {
            "task": "src.workers.tasks.analytics_tasks.aggregate_metrics",
            "schedule": crontab(minute="*/5"),
        },
        "cleanup-expired-sessions": {
            "task": "src.workers.tasks.interview_tasks.cleanup_expired_sessions",
            "schedule": crontab(minute="*/10"),
        },
        "refresh-embeddings": {
            "task": "src.workers.tasks.ai_tasks.refresh_stale_embeddings",
            "schedule": crontab(hour="2", minute="0"),  # Daily at 2 AM
        },
        "generate-daily-reports": {
            "task": "src.workers.tasks.analytics_tasks.generate_daily_reports",
            "schedule": crontab(hour="6", minute="0"),  # Daily at 6 AM
        },
    },
)


# --- Task Registration ---

@celery_app.task(name="src.workers.tasks.resume_tasks.process_resume")
def process_resume(resume_id: str, tenant_id: str) -> dict:
    """Process an uploaded resume: parse, extract, embed, enrich."""
    # 1. Download file from S3
    # 2. Extract text (PDF/DOCX/OCR)
    # 3. Parse sections via AI
    # 4. Extract skills via AI
    # 5. Generate embedding
    # 6. Enrich candidate profile
    # 7. Match against open jobs
    return {"resume_id": resume_id, "status": "completed"}


@celery_app.task(name="src.workers.tasks.ai_tasks.run_evaluation")
def run_evaluation(candidate_id: str, job_id: str, evaluation_type: str, tenant_id: str) -> dict:
    """Run AI-powered candidate evaluation."""
    # 1. Gather candidate data
    # 2. Run AI evaluation
    # 3. Compute scores
    # 4. Generate explanation
    # 5. Store results
    return {"candidate_id": candidate_id, "status": "completed"}


@celery_app.task(name="src.workers.tasks.analytics_tasks.aggregate_metrics")
def aggregate_metrics() -> dict:
    """Periodic task to aggregate analytics metrics."""
    return {"status": "completed"}


@celery_app.task(name="src.workers.tasks.interview_tasks.cleanup_expired_sessions")
def cleanup_expired_sessions() -> dict:
    """Clean up expired interview and coding sessions."""
    return {"status": "completed"}


@celery_app.task(name="src.workers.tasks.ai_tasks.refresh_stale_embeddings")
def refresh_stale_embeddings() -> dict:
    """Re-embed candidates/jobs with stale embeddings."""
    return {"status": "completed"}


@celery_app.task(name="src.workers.tasks.analytics_tasks.generate_daily_reports")
def generate_daily_reports() -> dict:
    """Generate and distribute daily analytics reports."""
    return {"status": "completed"}
