"""Video Interview Service — Room management, recording, and participant tracking."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db_dependency
from shared.core.models.video_interview import (
    VideoRoom,
    VideoRoomStatus,
    VideoParticipant,
    ParticipantRole,
)
from shared.auth.dependencies import require_tenant_id, require_member
from shared.video.provider import MockVideoProvider, VideoProvider

logger = logging.getLogger(__name__)

router = APIRouter()

_video_provider: VideoProvider = MockVideoProvider()


def get_video_provider() -> VideoProvider:
    return _video_provider


def set_video_provider(provider: VideoProvider) -> None:
    global _video_provider
    _video_provider = provider


class RoomCreateRequest(BaseModel):
    interview_id: str = ""
    participants: list[str] = Field(default_factory=list)
    options: dict[str, Any] = Field(default_factory=dict)


class ParticipantAddRequest(BaseModel):
    user_id: str
    role: ParticipantRole = ParticipantRole.PARTICIPANT


class RoomResponse(BaseModel):
    id: str
    tenant_id: str
    interview_id: str
    room_url: str
    status: VideoRoomStatus
    recording_url: str | None = None
    duration_seconds: int = 0
    created_at: datetime
    started_at: datetime | None = None
    ended_at: datetime | None = None

    model_config = {"from_attributes": True}


class ParticipantResponse(BaseModel):
    id: str
    room_id: str
    user_id: str
    role: ParticipantRole
    joined_at: datetime
    left_at: datetime | None = None

    model_config = {"from_attributes": True}


class RoomDetailResponse(RoomResponse):
    participants: list[ParticipantResponse] = []


class RecordingResponse(BaseModel):
    room_id: str
    recording_url: str
    duration_seconds: int
    status: str


class VideoInterviewListResponse(BaseModel):
    data: list[RoomResponse]
    total: int
    page: int
    page_size: int


class StartRecordingResponse(BaseModel):
    room_id: str
    recording_id: str
    status: str = "recording"


class StopRecordingResponse(BaseModel):
    room_id: str
    recording_url: str
    duration_seconds: int
    status: str = "completed"


def _room_to_response(room: VideoRoom) -> RoomResponse:
    return RoomResponse(
        id=room.id,
        tenant_id=room.tenant_id,
        interview_id=room.interview_id,
        room_url=room.room_url,
        status=room.status,
        recording_url=room.recording_url,
        duration_seconds=room.duration_seconds,
        created_at=room.created_at,
        started_at=room.started_at,
        ended_at=room.ended_at,
    )


@router.post("/rooms", response_model=RoomDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    data: RoomCreateRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
    provider: VideoProvider = Depends(get_video_provider),
):
    room_url = await provider.create_room(data.participants, data.options)

    room = VideoRoom(
        tenant_id=tenant_id,
        interview_id=data.interview_id,
        room_url=room_url,
        status=VideoRoomStatus.CREATED,
    )
    db.add(room)
    await db.flush()
    await db.refresh(room)

    created_participants: list[VideoParticipant] = []
    for user_id in data.participants:
        role = ParticipantRole.HOST if user_id == data.participants[0] else ParticipantRole.PARTICIPANT
        p = VideoParticipant(room_id=room.id, user_id=user_id, role=role)
        db.add(p)
        created_participants.append(p)
    await db.flush()
    for p in created_participants:
        await db.refresh(p)

    resp = _room_to_response(room)
    return RoomDetailResponse(
        **resp.model_dump(),
        participants=[ParticipantResponse.model_validate(p) for p in created_participants],
    )


@router.get("/rooms/{room_id}", response_model=RoomDetailResponse)
async def get_room(
    room_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
):
    room = await db.get(VideoRoom, room_id)
    if room is None or room.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    result = await db.execute(
        select(VideoParticipant).where(VideoParticipant.room_id == room_id)
    )
    participants = result.scalars().all()

    resp = _room_to_response(room)
    return RoomDetailResponse(
        **resp.model_dump(),
        participants=[ParticipantResponse.model_validate(p) for p in participants],
    )


@router.post("/rooms/{room_id}/start", response_model=StartRecordingResponse)
async def start_recording(
    room_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
    provider: VideoProvider = Depends(get_video_provider),
):
    room = await db.get(VideoRoom, room_id)
    if room is None or room.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    if room.status not in (VideoRoomStatus.CREATED, VideoRoomStatus.ACTIVE):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Room is not in a startable state")

    recording_id = await provider.start_recording(room_id)

    room.status = VideoRoomStatus.ACTIVE
    room.started_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(room)
    await db.flush()

    return StartRecordingResponse(room_id=room_id, recording_id=recording_id)


@router.post("/rooms/{room_id}/stop", response_model=StopRecordingResponse)
async def stop_recording(
    room_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
    provider: VideoProvider = Depends(get_video_provider),
):
    room = await db.get(VideoRoom, room_id)
    if room is None or room.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    if room.status != VideoRoomStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Room is not actively recording")

    recording_url = await provider.stop_recording(room_id)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    room.status = VideoRoomStatus.COMPLETED
    room.ended_at = now
    room.recording_url = recording_url
    if room.started_at:
        delta = now - room.started_at
        room.duration_seconds = int(delta.total_seconds())
    db.add(room)
    await db.flush()

    result = await db.execute(
        select(VideoParticipant).where(VideoParticipant.room_id == room_id)
    )
    for p in result.scalars().all():
        p.left_at = now
        db.add(p)
    await db.flush()

    return StopRecordingResponse(
        room_id=room_id,
        recording_url=recording_url,
        duration_seconds=room.duration_seconds,
    )


@router.get("/rooms/{room_id}/recording", response_model=RecordingResponse)
async def get_recording(
    room_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
):
    room = await db.get(VideoRoom, room_id)
    if room is None or room.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    if not room.recording_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No recording available")

    return RecordingResponse(
        room_id=room_id,
        recording_url=room.recording_url,
        duration_seconds=room.duration_seconds,
        status="completed" if room.status == VideoRoomStatus.COMPLETED else "processing",
    )


@router.get("/interviews", response_model=VideoInterviewListResponse)
async def list_video_interviews(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
):
    query = select(VideoRoom).where(VideoRoom.tenant_id == tenant_id)
    count_query = select(func.count()).select_from(VideoRoom).where(VideoRoom.tenant_id == tenant_id)

    if status_filter:
        query = query.where(VideoRoom.status == status_filter)
        count_query = count_query.where(VideoRoom.status == status_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(VideoRoom.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rooms = result.scalars().all()

    return VideoInterviewListResponse(
        data=[_room_to_response(r) for r in rooms],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.delete("/rooms/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(
    room_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
):
    room = await db.get(VideoRoom, room_id)
    if room is None or room.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    result = await db.execute(
        select(VideoParticipant).where(VideoParticipant.room_id == room_id)
    )
    for p in result.scalars().all():
        await db.delete(p)

    await db.delete(room)
    await db.flush()
    return None
