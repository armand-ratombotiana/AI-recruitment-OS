"""Notification Service — Multi-channel notifications."""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str = "info"
    channel: str = "in_app"

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "notification"}

@router.post("/")
async def send_notification(data: NotificationCreate):
    return {"id": "n_new", "title": data.title, "status": "sent"}

@router.get("/")
async def list_notifications():
    return {"data": [
        {"id": "n1", "title": "New Application", "message": "John Smith applied", "type": "info", "read": False},
        {"id": "n2", "title": "Interview Completed", "message": "Sarah Chen completed", "type": "success", "read": True},
    ], "total": 2, "unread": 1}

@router.put("/{notification_id}/read")
async def mark_read(notification_id: str):
    return {"id": notification_id, "read": True}

@router.get("/preferences")
async def get_preferences():
    return {"email": True, "push": True, "in_app": True, "sms": False}

@router.put("/preferences")
async def update_preferences():
    return {"updated": True}
