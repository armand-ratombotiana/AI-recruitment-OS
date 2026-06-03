"""Audit logging helper — write a single row to the audit_entries table.

Use ``await audit(...)`` from any service handler to record an action.  The
helper swallows any exception so an audit-write failure never breaks a user
request; we still log the failure via stdlib logging for ops visibility.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.models.compliance import AuditEntry


logger = logging.getLogger("audit")


async def audit(
    db: AsyncSession,
    *,
    tenant_id: str,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    actor_id: str | None = None,
    actor_email: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    details: dict[str, Any] | None = None,
    outcome: str = "success",
) -> None:
    """Append a row to ``audit_entries``.  Best-effort: never raises."""
    try:
        entry = AuditEntry(
            tenant_id=tenant_id,
            actor_id=actor_id,
            actor_email=actor_email,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details=json.dumps(details or {}, default=str),
            outcome=outcome,
        )
        db.add(entry)
        await db.flush()
    except Exception as exc:
        # Roll back only the audit insert; do not propagate.
        logger.warning("audit write failed (action=%s resource=%s): %s", action, resource_type, exc)
        try:
            await db.rollback()
        except Exception:
            pass
