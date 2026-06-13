"""Video Interview domain — VideoRoom, VideoInterview, Recording models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field
from sqlmodel import SQLModel, Field as SQLField


class VideoRoomStatus(str, Enum):
    ACTIVE = "active"
    ENDED = "ended"
    ARCHIVED = "archived"


class VideoInterviewStatus(str, Enum):
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class VideoRoom(SQLModel, table=True):
    __tablename__ = "video_rooms"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str
    created_by: str = SQLField(index=True)
    max_participants: int = 10
    status: VideoRoomStatus = VideoRoomStatus.ACTIVE
    provider: str = "daily"  # daily, twilio, vonage
    provider_room_id: str | None = None
    provider_room_url: str | None = None
    recording_enabled: bool = False
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    ended_at: datetime | None = None


class VideoInterview(SQLModel, table=True):
    __tablename__ = "video_interviews"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    interview_id: str = SQLField(index=True)  # Link to Interview table
    room_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    interviewer_id: str | None = None
    status: VideoInterviewStatus = VideoInterviewStatus.SCHEDULED
    recording_url: str | None = None
    recording_provider_id: str | None = None
    duration_seconds: int = 0
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class VideoRecording(SQLModel, table=True):
    __tablename__ = "video_recordings"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    room_id: str = SQLField(index=True)
    video_interview_id: str = SQLField(index=True)
    provider: str
    provider_recording_id: str
    recording_url: str
    status: str = "processing"  # processing, completed, failed
    duration_seconds: int = 0
    file_size_bytes: int | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


# --- API Schemas ---


class VideoRoomCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    max_participants: int = Field(default=10, ge=2, le=50)
    provider: str = Field(default="daily", description="Video provider: daily, twilio, vonage")
    recording_enabled: bool = False


class VideoRoomRead(BaseModel):
    id: str
    tenant_id: str
    name: str
    created_by: str
    max_participants: int
    status: VideoRoomStatus
    provider: str
    provider_room_id: str | None = None
    provider_room_url: str | None = None
    recording_enabled: bool
    created_at: datetime
    ended_at: datetime | None = None

    model_config = {"from_attributes": True}


class VideoRoomJoinResponse(BaseModel):
    room_id: str
    room_url: str
    token: str
    user_name: str
    is_owner: bool = False


class VideoInterviewRead(BaseModel):
    id: str
    tenant_id: str
    interview_id: str
    room_id: str
    candidate_id: str
    interviewer_id: str | None = None
    status: VideoInterviewStatus
    recording_url: str | None = None
    duration_seconds: int
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class VideoInterviewListResponse(BaseModel):
    data: list[VideoInterviewRead]
    total: int
    page: int
    page_size: int


class RecordingRead(BaseModel):
    id: str
    tenant_id: str
    room_id: str
    video_interview_id: str
    provider: str
    provider_recording_id: str
    recording_url: str
    status: str
    duration_seconds: int
    file_size_bytes: int | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class StartRecordingRequest(BaseModel):
    provider_options: dict | None = None


class StopRecordingResponse(BaseModel):
    recording_id: str
    recording_url: str
    duration_seconds: int
    status: str
