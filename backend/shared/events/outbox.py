"""Shared Events — Transactional outbox pattern for reliable event publishing."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from sqlmodel import SQLModel, Field as SQLField, Session, select, update

from shared.core.database import sync_engine
from shared.events.schemas import EventEnvelope

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Outbox entry model
# ---------------------------------------------------------------------------

class OutboxEntry(SQLModel, table=True):
    __tablename__ = "outbox_entries"

    id: str = SQLField(primary_key=True)
    aggregate_type: str = SQLField(index=True)
    aggregate_id: str = SQLField(index=True)
    event_type: str = SQLField(index=True)
    payload: str
    tenant_id: str = SQLField(index=True)
    correlation_id: str | None = None
    causation_id: str | None = None
    published: bool = SQLField(default=False, index=True)
    retry_count: int = SQLField(default=0)
    max_retries: int = SQLField(default=5)
    last_error: str | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))
    published_at: datetime | None = None


# ---------------------------------------------------------------------------
# Outbox publisher
# ---------------------------------------------------------------------------

class OutboxPublisher:
    def __init__(self, batch_size: int = 100) -> None:
        self.batch_size = batch_size

    async def publish_pending(self) -> int:
        published_count = 0
        try:
            with Session(sync_engine) as session:
                stmt = (
                    select(OutboxEntry)
                    .where(OutboxEntry.published == False)  # noqa: E712
                    .where(OutboxEntry.retry_count < OutboxEntry.max_retries)
                    .order_by(OutboxEntry.created_at)
                    .limit(self.batch_size)
                )
                entries = session.exec(stmt).all()

                for entry in entries:
                    try:
                        entry.published = True
                        entry.published_at = datetime.now(timezone.utc)
                        session.add(entry)
                        session.commit()
                        published_count += 1
                        logger.info("published outbox entry %s (%s)", entry.id, entry.event_type)
                    except Exception as exc:
                        entry.retry_count += 1
                        entry.last_error = str(exc)[:500]
                        session.add(entry)
                        session.commit()
                        logger.warning(
                            "failed to publish outbox entry %s (attempt %d/%d): %s",
                            entry.id,
                            entry.retry_count,
                            entry.max_retries,
                            exc,
                        )
        except Exception as exc:
            logger.exception("outbox publish failed")

        return published_count

    async def mark_published(self, entry_id: str) -> None:
        with Session(sync_engine) as session:
            stmt = update(OutboxEntry).where(OutboxEntry.id == entry_id).values(
                published=True,
                published_at=datetime.now(timezone.utc),
            )
            session.exec(stmt)
            session.commit()

    async def requeue_stale(self, stale_seconds: int = 300) -> int:
        cutoff = datetime.now(timezone.utc)
        with Session(sync_engine) as session:
            stmt = (
                select(OutboxEntry)
                .where(OutboxEntry.published == False)  # noqa: E712
                .where(OutboxEntry.retry_count > 0)
                .where(OutboxEntry.created_at < cutoff)
            )
            entries = session.exec(stmt).all()
            requeued = 0
            for entry in entries:
                entry.retry_count = 0
                entry.last_error = None
                session.add(entry)
                requeued += 1
            session.commit()
        return requeued

    @staticmethod
    def _topic_for_event(event_type: str) -> str:
        prefix = event_type.split(".")[0]
        topic_map = {
            "candidate": "airos.candidates",
            "resume": "airos.resumes",
            "job": "airos.jobs",
            "application": "airos.applications",
            "interview": "airos.interviews",
            "evaluation": "airos.evaluations",
            "ppe": "airos.ppe",
            "workflow": "airos.workflows",
            "ai": "airos.ai",
            "notification": "airos.notifications",
            "analytics": "airos.analytics",
        }
        return topic_map.get(prefix, "airos.events")


# ---------------------------------------------------------------------------
# Convenience helper: write event inside a DB transaction
# ---------------------------------------------------------------------------

def append_to_outbox(
    session: Session,
    aggregate_type: str,
    aggregate_id: str,
    event: EventEnvelope,
) -> OutboxEntry:
    entry = OutboxEntry(
        id=str(uuid.uuid4()),
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        event_type=event.event_type,
        payload=event.model_dump_json(),
        tenant_id=event.tenant_id,
    )
    session.add(entry)
    return entry


outbox_publisher = OutboxPublisher()
