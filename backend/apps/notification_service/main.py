"""Notification Service — Multi-channel notifications with CRUD."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from shared.auth import require_admin, require_authenticated_user, require_tenant_id


NOTIFICATIONS_DB: dict[str, dict] = {
    "n1": {
        "id": "n1",
        "tenant_id": "default",
        "title": "New Application",
        "message": "John Smith applied for Senior Engineer",
        "type": "info",
        "channel": "in_app",
        "read": False,
        "created_at": "2025-01-20T10:30:00Z",
    },
    "n2": {
        "id": "n2",
        "tenant_id": "default",
        "title": "Interview Completed",
        "message": "Sarah Chen completed technical interview",
        "type": "success",
        "channel": "in_app",
        "read": True,
        "created_at": "2025-01-19T14:15:00Z",
    },
    "n3": {
        "id": "n3",
        "tenant_id": "default",
        "title": "Offer Accepted",
        "message": "Michael Brown accepted the offer for DevOps Lead",
        "type": "success",
        "channel": "email",
        "read": False,
        "created_at": "2025-01-18T09:00:00Z",
    },
}

PREFERENCES_DB: dict[str, dict] = {
    "default": {
        "tenant_id": "default",
        "email": True,
        "push": True,
        "in_app": True,
        "sms": False,
        "digest_frequency": "daily",
    },
}


class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str = "info"
    channel: str = "in_app"
    recipient_id: Optional[str] = None


class NotificationUpdate(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    type: Optional[str] = None
    read: Optional[bool] = None


class PreferencesUpdate(BaseModel):
    email: Optional[bool] = None
    push: Optional[bool] = None
    in_app: Optional[bool] = None
    sms: Optional[bool] = None
    digest_frequency: Optional[str] = None


router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "healthy", "service": "notification"}


@router.get("/preferences")
async def get_preferences(tenant_id: str = Depends(require_tenant_id)):
    if tenant_id not in PREFERENCES_DB:
        PREFERENCES_DB[tenant_id] = {
            "tenant_id": tenant_id,
            "email": True,
            "push": True,
            "in_app": True,
            "sms": False,
            "digest_frequency": "daily",
        }
    return PREFERENCES_DB[tenant_id]


@router.put("/preferences")
async def update_preferences(
    data: PreferencesUpdate,
    tenant_id: str = Depends(require_tenant_id),
):
    if tenant_id not in PREFERENCES_DB:
        PREFERENCES_DB[tenant_id] = {
            "tenant_id": tenant_id,
            "email": True,
            "push": True,
            "in_app": True,
            "sms": False,
            "digest_frequency": "daily",
        }
    prefs = PREFERENCES_DB[tenant_id]
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
    return prefs


@router.post("/read-all")
async def mark_all_read(tenant_id: str = Depends(require_tenant_id)):
    count = 0
    for n in NOTIFICATIONS_DB.values():
        if n.get("tenant_id", "default") == tenant_id and not n["read"]:
            n["read"] = True
            count += 1
    return {"marked_read": count}


@router.get("/")
async def list_notifications(
    read: Optional[bool] = None,
    type: Optional[str] = None,
    tenant_id: str = Depends(require_tenant_id),
):
    notifications = [n for n in NOTIFICATIONS_DB.values() if n.get("tenant_id", "default") == tenant_id]
    if read is not None:
        notifications = [n for n in notifications if n["read"] == read]
    if type:
        notifications = [n for n in notifications if n["type"] == type]

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
):
    notification = NOTIFICATIONS_DB.get(notification_id)
    if not notification or notification.get("tenant_id", "default") != tenant_id:
        raise HTTPException(status_code=404, detail=f"Notification {notification_id} not found")
    return notification


@router.post("/")
async def create_notification(
    data: NotificationCreate,
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
):
    notification_id = f"n_{uuid.uuid4().hex[:8]}"
    notification = {
        "id": notification_id,
        "tenant_id": tenant_id,
        "title": data.title,
        "message": data.message,
        "type": data.type,
        "channel": data.channel,
        "recipient_id": data.recipient_id,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    NOTIFICATIONS_DB[notification_id] = notification
    return notification


@router.put("/{notification_id}")
async def update_notification(
    notification_id: str,
    data: NotificationUpdate,
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
):
    notification = NOTIFICATIONS_DB.get(notification_id)
    if not notification or notification.get("tenant_id", "default") != tenant_id:
        raise HTTPException(status_code=404, detail=f"Notification {notification_id} not found")

    if data.title is not None:
        notification["title"] = data.title
    if data.message is not None:
        notification["message"] = data.message
    if data.type is not None:
        notification["type"] = data.type
    if data.read is not None:
        notification["read"] = data.read

    return notification


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
):
    notification = NOTIFICATIONS_DB.get(notification_id)
    if not notification or notification.get("tenant_id", "default") != tenant_id:
        raise HTTPException(status_code=404, detail=f"Notification {notification_id} not found")
    del NOTIFICATIONS_DB[notification_id]
    return {"deleted": True, "notification_id": notification_id}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    tenant_id: str = Depends(require_tenant_id),
):
    notification = NOTIFICATIONS_DB.get(notification_id)
    if not notification or notification.get("tenant_id", "default") != tenant_id:
        raise HTTPException(status_code=404, detail=f"Notification {notification_id} not found")
    notification["read"] = True
    return {"id": notification_id, "read": True}
