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
    return {"id": "n_new", "title": data.title, "message": data.message, "type": data.type, "channel": data.channel, "status": "sent"}

@router.get("/")
async def list_notifications():
    return {"data": [
        {"id": "n1", "title": "New Application", "message": "John Smith applied for Senior Backend", "type": "info", "read": False, "created_at": "2025-01-20T10:00:00Z"},
        {"id": "n2", "title": "Interview Completed", "message": "Sarah Chen completed PPE interview", "type": "success", "read": True, "created_at": "2025-01-20T09:00:00Z"},
    ], "total": 2, "unread": 1}

@router.put("/{notification_id}/read")
async def mark_read(notification_id: str):
    return {"id": notification_id, "read": True}

@router.get("/preferences")
async def get_preferences():
    return {"email": True, "push": True, "in_app": True, "sms": False, "frequency": "immediate"}

@router.put("/preferences")
async def update_preferences():
    return {"updated": True}
