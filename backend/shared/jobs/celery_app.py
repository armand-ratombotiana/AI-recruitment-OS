"""Celery application configuration for AI-ROS background job processing.

Provides:
- Redis broker and result backend
- Task routing with priority queues (high/medium/low)
- Beat scheduler for periodic tasks
- Tenant-aware task execution
"""
from __future__ import annotations

from celery import Celery
from celery.schedules import crontab
from kombu import Queue

from shared.core.config import get_settings


settings = get_settings()

celery_app = Celery(
    "airos",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "shared.jobs.tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,
    task_soft_time_limit=3000,
    result_expires=86400,
    worker_prefetch_multiplier=4,
    worker_max_tasks_per_child=1000,
    broker_connection_retry_on_startup=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_default_queue="medium",
    task_queues=(
        Queue("high", routing_key="high"),
        Queue("medium", routing_key="medium"),
        Queue("low", routing_key="low"),
    ),
    task_routes={
        "shared.jobs.tasks.send_bulk_email": {"queue": "high", "routing_key": "high"},
        "shared.jobs.tasks.generate_report": {"queue": "medium", "routing_key": "medium"},
        "shared.jobs.tasks.sync_integration": {"queue": "medium", "routing_key": "medium"},
        "shared.jobs.tasks.process_ai_batch": {"queue": "low", "routing_key": "low"},
        "shared.jobs.tasks.cleanup_old_data": {"queue": "low", "routing_key": "low"},
        "shared.jobs.tasks.scheduled_backup": {"queue": "low", "routing_key": "low"},
    },
    beat_schedule={
        "cleanup-old-data-daily": {
            "task": "shared.jobs.tasks.cleanup_old_data",
            "schedule": crontab(hour=2, minute=0),
            "options": {"queue": "low"},
        },
        "scheduled-backup-daily": {
            "task": "shared.jobs.tasks.scheduled_backup",
            "schedule": crontab(hour=2, minute=0),
            "options": {"queue": "low"},
        },
        "sync-integrations-hourly": {
            "task": "shared.jobs.tasks.sync_integration",
            "schedule": crontab(minute=0),
            "options": {"queue": "medium"},
            "args": ({"sync_all": True},),
        },
        "generate-daily-reports": {
            "task": "shared.jobs.tasks.generate_report",
            "schedule": crontab(hour=6, minute=0),
            "options": {"queue": "medium"},
            "args": ({"report_type": "daily", "auto": True},),
        },
    },
    beat_scheduler="celery.beat:PersistentScheduler",
    beat_dburi=settings.CELERY_RESULT_BACKEND,
)

celery_app.autodiscover_tasks(["shared.jobs"])


@celery_app.task(bind=True, ignore_result=False)
def debug_task(self):
    """Debug task to verify Celery is working."""
    return {"status": "ok", "worker": self.request.hostname}


def get_celery_app() -> Celery:
    """Get the configured Celery app instance."""
    return celery_app
