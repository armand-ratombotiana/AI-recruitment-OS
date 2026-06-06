"""Operational audit log writer — the public helper services call.

Use :func:`log_action` from any service handler to record what just
happened in a structured, queryable form.  The entry is persisted to the
``audit_logs`` table (see :class:`shared.core.models.audit_log.AuditLog`)
and is visible to tenant admins via ``GET /api/v1/audit/logs``.

The helper is best-effort: any DB failure is logged at WARNING level and
swallowed so the calling request is not broken by a logging problem.
We use a SAVEPOINT to keep a logging failure from rolling back the
caller's own transaction.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.models.audit_log import AuditLog


logger = logging.getLogger("audit.log")


async def log_action(
    db: AsyncSession,
    *,
    action: str,
    resource_type: str,
    tenant_id: str,
    resource_id: Optional[str] = None,
    user_id: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Optional[AuditLog]:
    """Append a row to ``audit_logs`` and return the persisted object.

    Returns ``None`` on failure — never raises — so callers can use it
    inside a request handler without worrying about breaking the response
    on a transient DB error.  The caller's transaction is never rolled
    back: a logging failure is isolated by a SAVEPOINT.
    """
    sp = None
    try:
        sp = await db.begin_nested()
        entry = AuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.add(entry)
        await sp.commit()
        return entry
    except Exception as exc:
        logger.warning(
            "log_action failed (action=%s resource=%s/%s tenant=%s): %s",
            action,
            resource_type,
            resource_id,
            tenant_id,
            exc,
        )
        if sp is not None:
            try:
                await sp.rollback()
            except Exception:
                pass
        return None
