"""Shared Events — Celery task definitions for all async operations."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from celery import shared_task

from shared.events.celery_app import celery_app

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Resume processing
# ---------------------------------------------------------------------------

@celery_app.task(
    name="shared.events.tasks.process_resume_task",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
    track_started=True,
)
def process_resume_task(self, payload: dict[str, Any]) -> dict[str, Any]:
    from shared.events.handlers import event_store
    from shared.events.schemas import EventEnvelope

    resume_id = payload["resume_id"]
    candidate_id = payload["candidate_id"]

    logger.info("processing resume %s for candidate %s", resume_id, candidate_id)

    try:
        parsed_sections = ["contact", "experience", "education", "skills"]

        event = EventEnvelope(
            event_type="resume.parsed",
            tenant_id=payload.get("tenant_id", ""),
            payload={
                "resume_id": resume_id,
                "candidate_id": candidate_id,
                "parser_version": "1.0.0",
                "sections": parsed_sections,
                "raw_text_length": 0,
            },
        )
        event_store.append(event)

        return {"status": "completed", "resume_id": resume_id, "sections": parsed_sections}
    except Exception as exc:
        logger.exception("failed to process resume %s", resume_id)
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# AI evaluation
# ---------------------------------------------------------------------------

@celery_app.task(
    name="shared.events.tasks.run_ai_evaluation_task",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
    track_started=True,
)
def run_ai_evaluation_task(self, payload: dict[str, Any]) -> dict[str, Any]:
    from shared.events.handlers import event_store
    from shared.events.schemas import EventEnvelope

    evaluation_id = payload["evaluation_id"]
    candidate_id = payload["candidate_id"]
    evaluation_type = payload.get("evaluation_type", "comprehensive")
    job_id = payload.get("job_id")

    logger.info("running AI evaluation %s (type=%s)", evaluation_id, evaluation_type)

    try:
        overall_score = 0.0
        confidence = 0.0

        event = EventEnvelope(
            event_type="evaluation.completed",
            tenant_id=payload.get("tenant_id", ""),
            payload={
                "evaluation_id": evaluation_id,
                "candidate_id": candidate_id,
                "job_id": job_id,
                "evaluation_type": evaluation_type,
                "overall_score": overall_score,
                "confidence_score": confidence,
                "tokens_consumed": 0,
            },
        )
        event_store.append(event)

        return {
            "status": "completed",
            "evaluation_id": evaluation_id,
            "overall_score": overall_score,
        }
    except Exception as exc:
        logger.exception("failed to run evaluation %s", evaluation_id)
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# Notification sending
# ---------------------------------------------------------------------------

@celery_app.task(
    name="shared.events.tasks.send_notification_task",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    acks_late=True,
    track_started=True,
)
def send_notification_task(self, payload: dict[str, Any]) -> dict[str, Any]:
    from shared.events.handlers import event_store
    from shared.events.schemas import EventEnvelope

    notification_id = payload.get("notification_id", str(uuid.uuid4()))
    recipient_id = payload["recipient_id"]
    channel = payload.get("channel", "email")

    logger.info("sending notification %s to %s via %s", notification_id, recipient_id, channel)

    try:
        delivery_status = "delivered"

        event = EventEnvelope(
            event_type="notification.delivered",
            tenant_id=payload.get("tenant_id", ""),
            payload={
                "notification_id": notification_id,
                "delivered_at": datetime.now(timezone.utc).isoformat(),
                "delivery_status": delivery_status,
            },
        )
        event_store.append(event)

        return {
            "status": "sent",
            "notification_id": notification_id,
            "channel": channel,
            "delivery_status": delivery_status,
        }
    except Exception as exc:
        logger.exception("failed to send notification %s", notification_id)
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# Embedding generation
# ---------------------------------------------------------------------------

@celery_app.task(
    name="shared.events.tasks.generate_embedding_task",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
    track_started=True,
)
def generate_embedding_task(self, payload: dict[str, Any]) -> dict[str, Any]:
    from shared.events.handlers import event_store
    from shared.events.schemas import EventEnvelope

    entity_type = payload.get("entity_type", "candidate")
    entity_id = payload["entity_id"]
    model = payload.get("model", "text-embedding-3-large")

    logger.info("generating embedding for %s %s", entity_type, entity_id)

    try:
        embedding_id = str(uuid.uuid4())

        event = EventEnvelope(
            event_type="resume.embedded" if entity_type == "resume" else "candidate.enriched",
            tenant_id=payload.get("tenant_id", ""),
            payload={
                "resume_id": entity_id if entity_type == "resume" else None,
                "candidate_id": entity_id if entity_type == "candidate" else payload.get("candidate_id", ""),
                "embedding_id": embedding_id,
                "embedding_model": model,
                "dimensions": 3072,
            },
        )
        event_store.append(event)

        return {
            "status": "completed",
            "entity_id": entity_id,
            "embedding_id": embedding_id,
        }
    except Exception as exc:
        logger.exception("failed to generate embedding for %s %s", entity_type, entity_id)
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# Analytics aggregation
# ---------------------------------------------------------------------------

@celery_app.task(
    name="shared.events.tasks.aggregate_analytics_task",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
    track_started=True,
)
def aggregate_analytics_task(self, payload: dict[str, Any]) -> dict[str, Any]:
    from shared.events.handlers import event_store
    from shared.events.schemas import EventEnvelope

    metric_name = payload["metric_name"]
    time_range = payload.get("time_range", "1h")
    dimensions = payload.get("dimensions", {})

    logger.info("aggregating analytics metric=%s range=%s", metric_name, time_range)

    try:
        metric_value = 0.0

        event = EventEnvelope(
            event_type="analytics.metric_collected",
            tenant_id=payload.get("tenant_id", ""),
            payload={
                "metric_name": metric_name,
                "metric_value": metric_value,
                "dimensions": dimensions,
                "source_service": "analytics_aggregator",
            },
        )
        event_store.append(event)

        return {
            "status": "completed",
            "metric_name": metric_name,
            "metric_value": metric_value,
        }
    except Exception as exc:
        logger.exception("failed to aggregate analytics for %s", metric_name)
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# Session cleanup
# ---------------------------------------------------------------------------

@celery_app.task(
    name="shared.events.tasks.cleanup_expired_sessions_task",
    bind=True,
    max_retries=1,
    acks_late=True,
    track_started=True,
)
def cleanup_expired_sessions_task(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    logger.info("running expired session cleanup")

    try:
        from sqlmodel import Session as SQLModelSession, select
        from shared.core.database import sync_engine
        from shared.core.models.evaluation import CodingSession

        cleaned = 0
        with SQLModelSession(sync_engine) as session:
            now = datetime.now(timezone.utc)
            stmt = select(CodingSession).where(
                CodingSession.status == "active"  # noqa: E712
            )
            active_sessions = session.exec(stmt).all()
            for cs in active_sessions:
                if cs.started_at and cs.max_duration_seconds:
                    elapsed = (now - cs.started_at).total_seconds()
                    if elapsed > cs.max_duration_seconds:
                        cs.status = "expired"
                        cs.ended_at = now
                        session.add(cs)
                        cleaned += 1
            session.commit()

        return {"status": "completed", "cleaned_sessions": cleaned}
    except Exception as exc:
        logger.exception("session cleanup failed")
        return {"status": "failed", "error": str(exc)}


# ---------------------------------------------------------------------------
# Embedding refresh
# ---------------------------------------------------------------------------

@celery_app.task(
    name="shared.events.tasks.refresh_embeddings_task",
    bind=True,
    max_retries=2,
    default_retry_delay=120,
    acks_late=True,
    track_started=True,
)
def refresh_embeddings_task(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    logger.info("starting embedding refresh")

    try:
        from sqlmodel import Session as SQLModelSession, select
        from shared.core.database import sync_engine
        from shared.core.models.candidate import CandidateProfile

        refreshed = 0
        with SQLModelSession(sync_engine) as session:
            stmt = select(CandidateProfile).where(
                CandidateProfile.embedding_id == None  # noqa: E711
            )
            profiles = session.exec(stmt).all()
            for profile in profiles:
                generate_embedding_task.delay({
                    "entity_type": "candidate",
                    "entity_id": profile.candidate_id,
                    "tenant_id": profile.tenant_id,
                    "text": profile.summary or "",
                })
                refreshed += 1

        return {"status": "completed", "queued_count": refreshed}
    except Exception as exc:
        logger.exception("embedding refresh failed")
        return {"status": "failed", "error": str(exc)}
