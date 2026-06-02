"""Notification Service — Multi-channel notifications with CRUD."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


NOTIFICATIONS_DB: dict[str, dict] = {
    "n1": {
        "id": "n1",
        "title": "New Application",
        "message": "John Smith applied for Senior Engineer",
        "type": "info",
        "channel": "in_app",
        "read": False,
        "created_at": "2025-01-20T10:30:00Z",
    },
    "n2": {
        "id": "n2",
        "title": "Interview Completed",
        "message": "Sarah Chen completed technical interview",
        "type": "success",
        "channel": "in_app",
        "read": True,
        "created_at": "2025-01-19T14:15:00Z",
    },
    "n3": {
        "id": "n3",
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
async def get_preferences():
    return PREFERENCES_DB["default"]


@router.put("/preferences")
async def update_preferences(data: PreferencesUpdate):
    prefs = PREFERENCES_DB["default"]
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
async def mark_all_read():
    count = 0
    for n in NOTIFICATIONS_DB.values():
        if not n["read"]:
            n["read"] = True
            count += 1
    return {"marked_read": count}


@router.get("/")
async def list_notifications(read: Optional[bool] = None, type: Optional[str] = None):
    notifications = list(NOTIFICATIONS_DB.values())
    if read is not None:
        notifications = [n for n in notifications if n["read"] == read]
    if type:
        notifications = [n for n in notifications if n["type"] == type]

    unread_count = sum(1 for n in NOTIFICATIONS_DB.values() if not n["read"])

    return {
        "notifications": notifications,
        "total": len(notifications),
        "unread_count": unread_count,
    }


@router.get("/{notification_id}")
async def get_notification(notification_id: str):
    notification = NOTIFICATIONS_DB.get(notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail=f"Notification {notification_id} not found")
    return notification


@router.post("/")
async def create_notification(data: NotificationCreate):
    notification_id = f"n_{uuid.uuid4().hex[:8]}"
    notification = {
        "id": notification_id,
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
async def update_notification(notification_id: str, data: NotificationUpdate):
    notification = NOTIFICATIONS_DB.get(notification_id)
    if not notification:
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
async def delete_notification(notification_id: str):
    if notification_id not in NOTIFICATIONS_DB:
        raise HTTPException(status_code=404, detail=f"Notification {notification_id} not found")
    del NOTIFICATIONS_DB[notification_id]
    return {"deleted": True, "notification_id": notification_id}


@router.post("/{notification_id}/read")
async def mark_read(notification_id: str):
    notification = NOTIFICATIONS_DB.get(notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail=f"Notification {notification_id} not found")
    notification["read"] = True
    return {"id": notification_id, "read": True}
