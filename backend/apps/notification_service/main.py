"""Notification Service — Multi-channel notifications backed by the database.

All notification records are now persisted via SQLModel (``Notification``)
instead of an in-memory dict.  Per-tenant channel preferences remain a
small in-memory helper because they are configuration rather than data and
the task focused on replacing the data-plane stubs.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import require_admin, require_authenticated_user, require_tenant_id
from shared.core.database import get_db_dependency
from shared.core.models.notification import Notification


# Per-tenant channel preferences (config, not data; kept in-memory on purpose).
_PREFERENCES: dict[str, dict[str, Any]] = {}


def _default_preferences(tenant_id: str) -> dict[str, Any]:
    return {
        "tenant_id": tenant_id,
        "email": True,
        "push": True,
        "in_app": True,
        "sms": False,
        "digest_frequency": "daily",
    }


class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str = "info"
    channel: str = "in_app"
    recipient_id: Optional[str] = None
    link: Optional[str] = None


class NotificationUpdate(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    type: Optional[str] = None
    read: Optional[bool] = None
    link: Optional[str] = None


class PreferencesUpdate(BaseModel):
    email: Optional[bool] = None
    push: Optional[bool] = None
    in_app: Optional[bool] = None
    sms: Optional[bool] = None
    digest_frequency: Optional[str] = None


def _to_dict(n: Notification) -> dict[str, Any]:
    return {
        "id": n.id,
        "tenant_id": n.tenant_id,
        "user_id": n.user_id,
        "title": n.title,
        "message": n.message,
        "type": n.type,
        "link": n.link,
        "read": n.read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "healthy", "service": "notification"}


@router.get("/preferences")
async def get_preferences(tenant_id: str = Depends(require_tenant_id)):
    prefs = _PREFERENCES.get(tenant_id) or _default_preferences(tenant_id)
    _PREFERENCES[tenant_id] = prefs
    return prefs


@router.put("/preferences")
async def update_preferences(
    data: PreferencesUpdate,
    tenant_id: str = Depends(require_tenant_id),
):
    prefs = _PREFERENCES.get(tenant_id) or _default_preferences(tenant_id)
    if data.email is not None:
        prefs["email"] = data.email
    if data.push is not None:
        prefs["push"] = data.push
    if data.in_app is not None:
        prefs["in_app"] = data.in_app
    if data.sms is not None:
        prefs["sms"] = data.sms
    if data.digest_frequency is not None:
        prefs["digest_frequency"] = data.digest_frequency
    _PREFERENCES[tenant_id] = prefs
    return prefs


@router.post("/read-all")
async def mark_all_read(
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    result = await db.execute(
        update(Notification)
        .where(Notification.tenant_id == tenant_id, Notification.read.is_(False))
        .values(read=True)
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    return {"marked_read": result.rowcount or 0}


@router.get("/")
async def list_notifications(
    read: Optional[bool] = None,
    type: Optional[str] = None,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    stmt = select(Notification).where(Notification.tenant_id == tenant_id)
    if read is not None:
        stmt = stmt.where(Notification.read == read)
    if type:
        stmt = stmt.where(Notification.type == type)
    stmt = stmt.order_by(Notification.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    notifications = [_to_dict(n) for n in rows]
    unread_count = sum(1 for n in notifications if not n["read"])
    return {
        "notifications": notifications,
        "total": len(notifications),
        "unread_count": unread_count,
    }


@router.get("/{notification_id}")
async def get_notification(
    notification_id: str,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    row = (
        await db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Notification {notification_id} not found")
    return _to_dict(row)


@router.post("/")
async def create_notification(
    data: NotificationCreate,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
):
    row = Notification(
        tenant_id=tenant_id,
        user_id=data.recipient_id,
        type=data.type,
        title=data.title,
        message=data.message,
        link=data.link,
        read=False,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_dict(row)


@router.put("/{notification_id}")
async def update_notification(
    notification_id: str,
    data: NotificationUpdate,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
):
    row = (
        await db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Notification {notification_id} not found")

    if data.title is not None:
        row.title = data.title
    if data.message is not None:
        row.message = data.message
    if data.type is not None:
        row.type = data.type
    if data.read is not None:
        row.read = data.read
    if data.link is not None:
        row.link = data.link

    await db.commit()
    await db.refresh(row)
    return _to_dict(row)


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
):
    row = (
        await db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Notification {notification_id} not found")
    await db.delete(row)
    await db.commit()
    return {"deleted": True, "notification_id": notification_id}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    row = (
        await db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Notification {notification_id} not found")
    row.read = True
    await db.commit()
    return {"id": notification_id, "read": True}
