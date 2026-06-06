"""Backward-compatible GDPR audit entry writer.

The original ``shared/audit.py`` module lived at this location; it was
promoted to a package (``shared/audit/``) so we can ship additional
operational audit helpers without breaking the existing
``from shared.audit import audit`` import path used by several services.
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
    """Append a row to ``audit_entries``.  Best-effort: never raises.

    Uses a SAVEPOINT so a failure here never rolls back the parent transaction
    (which would invalidate identity-mapped objects and break the caller).
    """
    sp = None
    try:
        sp = await db.begin_nested()
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
        await sp.commit()
    except Exception as exc:
        logger.warning("audit write failed (action=%s resource=%s): %s", action, resource_type, exc)
        if sp is not None:
            try:
                await sp.rollback()
            except Exception:
                pass
