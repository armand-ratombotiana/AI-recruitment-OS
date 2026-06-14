"""Video Interview domain — VideoRoom and VideoParticipant models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlmodel import SQLModel, Field as SQLField


class VideoRoomStatus(str, Enum):
    CREATED = "created"
    ACTIVE = "active"
    COMPLETED = "completed"
    EXPIRED = "expired"


class ParticipantRole(str, Enum):
    HOST = "host"
    PARTICIPANT = "participant"


class VideoRoom(SQLModel, table=True):
    __tablename__ = "video_interview_rooms"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    interview_id: str = SQLField(index=True, default="")
    room_url: str = ""
    status: VideoRoomStatus = VideoRoomStatus.CREATED
    recording_url: str | None = None
    duration_seconds: int = 0
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    started_at: datetime | None = None
    ended_at: datetime | None = None


class VideoParticipant(SQLModel, table=True):
    __tablename__ = "video_participants"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    room_id: str = SQLField(index=True, foreign_key="video_interview_rooms.id")
    user_id: str = SQLField(index=True)
    role: ParticipantRole = ParticipantRole.PARTICIPANT
    joined_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    left_at: datetime | None = None
