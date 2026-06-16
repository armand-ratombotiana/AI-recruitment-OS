"""Backup / restore engine.

Public API:

* :func:`create_backup` — build a snapshot of the tenant's primary
  data (candidates, jobs, applications, workflows, notifications) and
  persist a :class:`Backup` row.
* :func:`restore_backup` — flip a backup to ``restored`` and return its
  payload for the caller to apply.
* :func:`list_backups` — list all backups for a tenant.
* :func:`delete_backup` — remove a backup row and its payload.
* :func:`get_backup` — fetch a single row.
* :func:`get_backup_payload` — return the raw JSON payload.
* :func:`reset_store` — clear the in-memory store (test helper).
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.models.backup import Backup


BACKUP_DIR = Path(os.getenv("BACKUP_DIR", "/tmp/airos-backups"))
BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def _save_backup_payload(backup_id: str, payload: dict[str, Any]) -> str:
    filepath = BACKUP_DIR / f"{backup_id}.json"
    with open(filepath, "w") as f:
        json.dump(payload, f, default=str)
    return str(filepath)


def _load_backup_payload(backup_id: str) -> dict[str, Any]:
    filepath = BACKUP_DIR / f"{backup_id}.json"
    if not filepath.exists():
        raise FileNotFoundError(f"Backup {backup_id} not found")
    with open(filepath, "r") as f:
        return json.load(f)


def _delete_backup_payload(backup_id: str) -> None:
    filepath = BACKUP_DIR / f"{backup_id}.json"
    if filepath.exists():
        filepath.unlink()


# ── Allowed backup types ───────────────────────────────────────────────────────

ALLOWED_BACKUP_TYPES: set[str] = {
    "full",
    "candidates",
    "jobs",
    "workflows",
    "config",
}


# ── Helpers ────────────────────────────────────────────────────────────────────


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _new_id() -> str:
    return str(uuid.uuid4())


def _validate_type(backup_type: str) -> str:
    if not backup_type:
        return "full"
    cleaned = backup_type.strip().lower()
    if cleaned not in ALLOWED_BACKUP_TYPES:
        raise ValueError(
            f"Invalid backup type '{backup_type}'. "
            f"Allowed: {sorted(ALLOWED_BACKUP_TYPES)}"
        )
    return cleaned


def _approx_size(payload: dict[str, Any]) -> int:
    """Return an approximate byte size for a JSON payload."""
    try:
        return len(json.dumps(payload, default=str).encode("utf-8"))
    except (TypeError, ValueError):
        return 0


def _serialize(model: Any) -> dict[str, Any]:
    """Best-effort JSON-friendly dict for a SQLModel / ORM instance."""
    if model is None:
        return {}
    if isinstance(model, dict):
        return dict(model)
    out: dict[str, Any] = {}
    for col in model.__table__.columns:  # type: ignore[attr-defined]
        value = getattr(model, col.name, None)
        if isinstance(value, datetime):
            value = value.isoformat()
        out[col.name] = value
    return out


async def _build_payload(
    db: AsyncSession,
    tenant_id: str,
    backup_type: str,
) -> dict[str, Any]:
    """Build the snapshot payload for a backup.

    The shape is a small, well-known envelope with the per-resource
    lists inline.  We only touch the models that are guaranteed to be
    in the metadata; everything else goes in the ``meta`` block.
    """
    payload: dict[str, Any] = {
        "version": 1,
        "tenant_id": tenant_id,
        "type": backup_type,
        "created_at": _utcnow().isoformat(),
        "resources": {},
        "meta": {"includes": []},
    }

    includes: list[str] = []
    resources: dict[str, list[dict[str, Any]]] = {}

    # Lazy imports keep the backup engine decoupled from model import
    # order at app startup.
    from shared.core.models.candidate import Candidate
    from shared.core.models.recruitment import Job, Application
    from shared.core.models.workflow import Workflow
    from shared.core.models.notification import Notification

    type_filters: dict[str, list[Any]] = {
        "candidates": [Candidate],
        "jobs": [Job, Application],
        "workflows": [Workflow],
        "config": [],
        "full": [Candidate, Job, Application, Workflow, Notification],
    }
    models_to_dump = type_filters.get(backup_type, type_filters["full"])

    for model_cls in models_to_dump:
        try:
            stmt = select(model_cls).where(model_cls.tenant_id == tenant_id)
            rows = (await db.execute(stmt)).scalars().all()
            resources[model_cls.__tablename__] = [_serialize(r) for r in rows]
            includes.append(model_cls.__tablename__)
        except Exception:
            # Model may be missing the tenant_id column or table in some
            # deployments — skip rather than failing the whole backup.
            continue

    payload["resources"] = resources
    payload["meta"]["includes"] = includes
    payload["meta"]["resource_counts"] = {
        k: len(v) for k, v in resources.items()
    }
    return payload


# ── Public API ─────────────────────────────────────────────────────────────────


async def create_backup(
    db: AsyncSession,
    tenant_id: str,
    user_id: str,
    name: str,
    type: str = "full",
) -> Backup:
    """Create a new backup for ``tenant_id`` and persist its row.

    Returns the :class:`Backup` row in the ``completed`` state.
    """
    backup_type = _validate_type(type)
    clean_name = (name or "").strip() or f"{backup_type}-backup-{_utcnow().isoformat()}"

    payload = await _build_payload(db, tenant_id, backup_type)
    size = _approx_size(payload)

    backup = Backup(
        tenant_id=tenant_id,
        name=clean_name,
        type=backup_type,
        size_bytes=size,
        status="completed",
        created_by=user_id,
        meta={
            "includes": payload["meta"]["includes"],
            "resource_counts": payload["meta"]["resource_counts"],
        },
    )
    db.add(backup)
    await db.commit()
    await db.refresh(backup)

    _save_backup_payload(backup.id, payload)
    return backup


async def restore_backup(
    db: AsyncSession,
    backup_id: str,
    tenant_id: str,
) -> dict[str, Any]:
    """Restore a backup by id.

    Returns a small status dict with the snapshot payload so the caller
    can apply it.  The :class:`Backup` row is flipped to ``restored``.
    """
    row = (
        await db.execute(
            select(Backup).where(
                Backup.id == backup_id,
                Backup.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return {"status": "not_found", "backup_id": backup_id}

    try:
        payload = _load_backup_payload(backup_id)
    except FileNotFoundError:
        row.status = "failed"
        await db.commit()
        return {
            "status": "failed",
            "backup_id": backup_id,
            "error": "backup payload is no longer available",
        }

    row.status = "restored"
    await db.commit()
    await db.refresh(row)
    return {
        "status": "restored",
        "backup_id": backup_id,
        "type": row.type,
        "restored_at": _utcnow().isoformat(),
        "payload": payload,
    }


async def list_backups(
    db: AsyncSession,
    tenant_id: str,
) -> list[Backup]:
    """List all backups for a tenant, newest first."""
    stmt = (
        select(Backup)
        .where(Backup.tenant_id == tenant_id)
        .order_by(Backup.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def get_backup(
    db: AsyncSession,
    backup_id: str,
    tenant_id: str,
) -> Optional[Backup]:
    """Return a single backup row, or ``None`` if not found."""
    return (
        await db.execute(
            select(Backup).where(
                Backup.id == backup_id,
                Backup.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()


async def get_backup_payload(backup_id: str) -> Optional[dict[str, Any]]:
    """Return the raw JSON payload for a backup, if present."""
    try:
        return _load_backup_payload(backup_id)
    except FileNotFoundError:
        return None


async def delete_backup(
    db: AsyncSession,
    backup_id: str,
    tenant_id: str,
) -> bool:
    """Delete a backup row and its payload.  Returns ``True`` on success."""
    row = (
        await db.execute(
            select(Backup).where(
                Backup.id == backup_id,
                Backup.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return False
    await db.delete(row)
    await db.commit()
    _delete_backup_payload(backup_id)
    return True


def reset_store() -> None:
    """Clear all backup payload files.  Test helper only."""
    for f in BACKUP_DIR.glob("*.json"):
        f.unlink()
