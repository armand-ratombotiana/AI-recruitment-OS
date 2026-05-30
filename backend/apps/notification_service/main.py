"""Notification Service — Multi-channel notifications (email, push, in-app)."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field


# ── Request Models ──────────────────────────────────────────────────────────────

class NotificationCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Notification title")
    message: str = Field(..., min_length=1, description="Notification body")
    type: str = Field(default="info", description="info | success | warning | error")
    channel: str = Field(default="in_app", description="in_app | email | push | sms")
    recipient_id: str | None = Field(None, description="Target user ID (all users if null)")

    model_config = {"json_schema_extra": {"examples": [
        {"title": "New Application", "message": "John Smith applied for Senior Backend Engineer",
         "type": "info", "channel": "in_app", "recipient_id": "u1"}
    ]}}


class PreferencesUpdateRequest(BaseModel):
    email: bool | None = Field(None, description="Enable email notifications")
    push: bool | None = Field(None, description="Enable push notifications")
    in_app: bool | None = Field(None, description="Enable in-app notifications")
    sms: bool | None = Field(None, description="Enable SMS notifications")
    frequency: str | None = Field(None, description="immediate | daily_digest | weekly_digest")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "notification"


class NotificationSendResponse(BaseModel):
    id: str
    title: str
    message: str
    type: str
    channel: str
    status: str = "sent"
    created_at: str


class NotificationSummary(BaseModel):
    id: str
    title: str
    message: str
    type: str
    read: bool
    created_at: str


class NotificationListResponse(BaseModel):
    data: list[NotificationSummary]
    total: int
    unread: int


class MarkReadResponse(BaseModel):
    id: str
    read: bool = True


class PreferencesResponse(BaseModel):
    email: bool
    push: bool
    in_app: bool
    sms: bool
    frequency: str


class PreferencesUpdateResponse(BaseModel):
    updated: bool = True


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Notifications"], summary="Notification service health check")
async def health():
    return HealthResponse()


@router.post("/", response_model=NotificationSendResponse, tags=["Notifications"], summary="Send notification",
             description="Send a notification via the specified channel.")
async def send_notification(data: NotificationCreateRequest):
    return NotificationSendResponse(
        id="notif_123", title=data.title, message=data.message,
        type=data.type, channel=data.channel, created_at="2025-01-20T10:00:00Z",
    )


@router.get("/", response_model=NotificationListResponse, tags=["Notifications"], summary="List notifications",
            description="Retrieve notifications for the current user.")
async def list_notifications():
    return NotificationListResponse(
        data=[
            NotificationSummary(id="n1", title="New Application",
                                message="John Smith applied for Senior Backend Engineer",
                                type="info", read=False, created_at="2025-01-20T10:00:00Z"),
            NotificationSummary(id="n2", title="Interview Completed",
                                message="Sarah Chen completed PPE interview",
                                type="success", read=True, created_at="2025-01-20T09:00:00Z"),
            NotificationSummary(id="n3", title="Evaluation Ready",
                                message="AI evaluation completed for Mike Johnson",
                                type="info", read=False, created_at="2025-01-20T08:00:00Z"),
        ],
        total=3, unread=2,
    )


@router.put("/{notification_id}/read", response_model=MarkReadResponse, tags=["Notifications"],
            summary="Mark notification as read")
async def mark_read(notification_id: str):
    return MarkReadResponse(id=notification_id)


@router.get("/preferences", response_model=PreferencesResponse, tags=["Notifications"],
            summary="Get notification preferences")
async def get_preferences():
    return PreferencesResponse(email=True, push=True, in_app=True, sms=False, frequency="immediate")


@router.put("/preferences", response_model=PreferencesUpdateResponse, tags=["Notifications"],
            summary="Update notification preferences")
async def update_preferences(data: PreferencesUpdateRequest):
    return PreferencesUpdateResponse()
