"""Calendar Service — Google / Outlook integration (mocked).

Implements a complete mock OAuth flow with state validation, plus
endpoints to list events, sync interviews, and compute free/busy
availability. All data is held in memory.
"""
from __future__ import annotations

import random
import secrets
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field


# ── In-Memory Store ────────────────────────────────────────────────────────────

# user_key -> { provider: connection }
_connections: dict[str, dict[str, dict[str, Any]]] = {}
# state -> { provider, user_key, created_at, redirect_uri }
_oauth_states: dict[str, dict[str, Any]] = {}
# user_key -> [event]
_calendar_events: dict[str, list[dict[str, Any]]] = {}
# interview_id -> event_id
_interview_event_map: dict[str, dict[str, Any]] = {}


# ── Models ─────────────────────────────────────────────────────────────────────

Provider = Literal["google", "outlook"]


class ConnectResponse(BaseModel):
    provider: str
    authorize_url: str
    state: str


class CallbackResponse(BaseModel):
    provider: str
    connected: bool
    user_key: str
    expires_at: str
    email: str


class Connection(BaseModel):
    provider: str
    email: str
    connected_at: str
    expires_at: str


class CalendarEvent(BaseModel):
    id: str
    title: str
    start: str
    end: str
    location: Optional[str] = None
    description: Optional[str] = None
    attendees: list[str] = []
    source: str = "calendar"
    interview_id: Optional[str] = None


class EventListResponse(BaseModel):
    data: list[CalendarEvent]
    total: int


class AvailabilitySlot(BaseModel):
    start: str
    end: str
    duration_minutes: int


class AvailabilityResponse(BaseModel):
    date: str
    duration_minutes: int
    timezone: str
    slots: list[AvailabilitySlot]
    busy: list[AvailabilitySlot]


class SyncResponse(BaseModel):
    interview_id: str
    event_id: str
    provider: str
    synced: bool = True
    calendar_link: str


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "calendar"
    providers: list[str] = ["google", "outlook"]


# ── Helpers ────────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _user_key(authorization: Optional[str], x_user_id: Optional[str]) -> str:
    if x_user_id:
        return x_user_id
    if authorization:
        return f"auth_{hash(authorization) & 0xffff:04x}"
    return "demo_user"


def _seed_user_events(user_key: str) -> None:
    if user_key in _calendar_events:
        return
    base = _now().replace(hour=9, minute=0, second=0, microsecond=0)
    events: list[dict[str, Any]] = []
    rng = random.Random(hash(user_key) & 0xffffffff)
    for day in range(7):
        for hour in (10, 14, 16):
            if rng.random() < 0.45:
                start = base + timedelta(days=day, hours=hour - 9)
                end = start + timedelta(minutes=rng.choice([30, 45, 60]))
                events.append({
                    "id": f"evt_{uuid.uuid4().hex[:12]}",
                    "title": rng.choice([
                        "Team Standup",
                        "1:1 with Manager",
                        "Sprint Planning",
                        "Customer Demo",
                        "Eng Review",
                    ]),
                    "start": start.isoformat(),
                    "end": end.isoformat(),
                    "location": rng.choice(["Zoom", "Office", None]),
                    "attendees": [f"colleague{i}@example.com" for i in range(rng.randint(1, 3))],
                    "source": "calendar",
                })
    _calendar_events[user_key] = events


def _require_connection(user_key: str, provider: Optional[str] = None) -> dict[str, Any]:
    user_conns = _connections.get(user_key)
    if not user_conns:
        raise HTTPException(status_code=403, detail="Calendar not connected. Use /calendar/connect/{provider} first.")
    if provider:
        if provider not in user_conns:
            raise HTTPException(status_code=403, detail=f"{provider} calendar not connected")
        return user_conns[provider]
    # return first connection
    return next(iter(user_conns.values()))


# ── Router ─────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Calendar"])
async def health() -> HealthResponse:
    return HealthResponse()


@router.get("/connect/{provider}", response_model=ConnectResponse, tags=["Calendar"])
async def connect_calendar(
    provider: Provider,
    redirect_uri: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    user_key = _user_key(authorization, x_user_id)
    state = secrets.token_urlsafe(24)
    _oauth_states[state] = {
        "provider": provider,
        "user_key": user_key,
        "created_at": _now().isoformat(),
        "redirect_uri": redirect_uri or "/calendar/callback",
    }
    # Mock authorize URL
    base = "https://accounts.google.com/o/oauth2/v2/auth" if provider == "google" \
        else "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
    authorize_url = (
        f"{base}?response_type=code&client_id=mock-client-id"
        f"&redirect_uri=http://localhost:8000/api/v1/calendar/callback/{provider}"
        f"&state={state}&scope=calendar.events"
    )
    return ConnectResponse(provider=provider, authorize_url=authorize_url, state=state)


@router.get("/callback/{provider}", response_model=CallbackResponse, tags=["Calendar"])
async def calendar_callback(
    provider: Provider,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")
    if not code or not state:
        raise HTTPException(status_code=422, detail="Missing code or state")
    record = _oauth_states.pop(state, None)
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    if record["provider"] != provider:
        raise HTTPException(status_code=400, detail="State/provider mismatch")

    user_key = record["user_key"]
    connected_at = _now()
    expires_at = connected_at + timedelta(hours=1)
    email = f"{user_key}@{'gmail.com' if provider == 'google' else 'outlook.com'}"
    conn = {
        "provider": provider,
        "email": email,
        "access_token": f"mock_access_{uuid.uuid4().hex}",
        "refresh_token": f"mock_refresh_{uuid.uuid4().hex}",
        "connected_at": connected_at.isoformat(),
        "expires_at": expires_at.isoformat(),
    }
    _connections.setdefault(user_key, {})[provider] = conn
    _seed_user_events(user_key)
    return CallbackResponse(
        provider=provider,
        connected=True,
        user_key=user_key,
        expires_at=expires_at.isoformat(),
        email=email,
    )


@router.get("/connections", tags=["Calendar"], summary="List connected calendar providers")
async def list_connections(
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    user_key = _user_key(authorization, x_user_id)
    user_conns = _connections.get(user_key, {})
    items = [
        Connection(
            provider=conn["provider"],
            email=conn["email"],
            connected_at=conn["connected_at"],
            expires_at=conn["expires_at"],
        )
        for conn in user_conns.values()
    ]
    return {"data": [c.model_dump() for c in items], "total": len(items)}


@router.delete("/disconnect/{provider}", tags=["Calendar"], summary="Disconnect a provider")
async def disconnect_calendar(
    provider: Provider,
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    user_key = _user_key(authorization, x_user_id)
    user_conns = _connections.get(user_key, {})
    if provider not in user_conns:
        raise HTTPException(status_code=404, detail=f"{provider} not connected")
    user_conns.pop(provider)
    return {"provider": provider, "disconnected": True}


@router.get("/events", response_model=EventListResponse, tags=["Calendar"])
async def list_events(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    user_key = _user_key(authorization, x_user_id)
    _require_connection(user_key)
    _seed_user_events(user_key)
    events = _calendar_events.get(user_key, [])
    start = _now() - timedelta(days=7)
    end = _now() + timedelta(days=14)
    if from_:
        try:
            start = datetime.fromisoformat(from_.replace("Z", "+00:00"))
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
    if to:
        try:
            end = datetime.fromisoformat(to.replace("Z", "+00:00"))
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
    filtered = []
    for evt in events:
        evt_start = datetime.fromisoformat(evt["start"])
        if evt_start.tzinfo is None:
            evt_start = evt_start.replace(tzinfo=timezone.utc)
        if start <= evt_start <= end:
            filtered.append(CalendarEvent(**evt))
    filtered.sort(key=lambda e: e.start)
    return EventListResponse(data=filtered, total=len(filtered))


@router.post("/interviews/{interview_id}/sync", response_model=SyncResponse, tags=["Calendar"])
async def sync_interview(
    interview_id: str,
    provider: Provider = Query("google"),
    title: Optional[str] = Query(None),
    duration_minutes: int = Query(60, ge=15, le=480),
    starts_at: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    user_key = _user_key(authorization, x_user_id)
    _require_connection(user_key, provider)
    start_dt = _now() + timedelta(days=1, hours=10 - _now().hour)
    if starts_at:
        try:
            start_dt = datetime.fromisoformat(starts_at.replace("Z", "+00:00"))
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
    end_dt = start_dt + timedelta(minutes=duration_minutes)
    event_id = f"evt_int_{uuid.uuid4().hex[:12]}"
    event = {
        "id": event_id,
        "title": title or f"Interview {interview_id}",
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
        "location": "Zoom",
        "description": f"Auto-synced from AI-ROS interview {interview_id}",
        "attendees": ["interviewer@example.com", "candidate@example.com"],
        "source": provider,
        "interview_id": interview_id,
    }
    _calendar_events.setdefault(user_key, []).append(event)
    _interview_event_map[interview_id] = {"event_id": event_id, "provider": provider, "user_key": user_key}
    link = (
        f"https://calendar.google.com/calendar/event?eid={event_id}"
        if provider == "google"
        else f"https://outlook.office.com/calendar/item/{event_id}"
    )
    return SyncResponse(
        interview_id=interview_id,
        event_id=event_id,
        provider=provider,
        synced=True,
        calendar_link=link,
    )


@router.delete("/interviews/{interview_id}/sync", tags=["Calendar"])
async def unsync_interview(
    interview_id: str,
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    mapping = _interview_event_map.pop(interview_id, None)
    if not mapping:
        raise HTTPException(status_code=404, detail="Interview not synced")
    user_key = mapping["user_key"]
    events = _calendar_events.get(user_key, [])
    _calendar_events[user_key] = [e for e in events if e["id"] != mapping["event_id"]]
    return {"interview_id": interview_id, "unsynced": True}


@router.get("/availability", response_model=AvailabilityResponse, tags=["Calendar"])
async def get_availability(
    date_str: Optional[str] = Query(None, alias="date"),
    duration: int = Query(30, ge=15, le=240),
    tz: str = Query("UTC", alias="timezone"),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    user_key = _user_key(authorization, x_user_id)
    _seed_user_events(user_key)
    if date_str:
        try:
            target_date = date.fromisoformat(date_str)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
    else:
        target_date = (_now() + timedelta(days=1)).date()

    day_start = datetime.combine(target_date, time(9, 0), tzinfo=timezone.utc)
    day_end = datetime.combine(target_date, time(18, 0), tzinfo=timezone.utc)

    events = _calendar_events.get(user_key, [])
    busy: list[tuple[datetime, datetime]] = []
    for evt in events:
        s = datetime.fromisoformat(evt["start"])
        e = datetime.fromisoformat(evt["end"])
        if s.tzinfo is None:
            s = s.replace(tzinfo=timezone.utc)
            e = e.replace(tzinfo=timezone.utc)
        if s.date() == target_date:
            busy.append((s, e))
    busy.sort()

    slots: list[AvailabilitySlot] = []
    cursor = day_start
    delta = timedelta(minutes=duration)
    while cursor + delta <= day_end:
        slot_end = cursor + delta
        if not any(s < slot_end and cursor < e for s, e in busy):
            slots.append(AvailabilitySlot(
                start=cursor.isoformat(),
                end=slot_end.isoformat(),
                duration_minutes=duration,
            ))
        cursor += timedelta(minutes=30)

    busy_payload = [
        AvailabilitySlot(start=s.isoformat(), end=e.isoformat(),
                         duration_minutes=int((e - s).total_seconds() // 60))
        for s, e in busy
    ]
    return AvailabilityResponse(
        date=target_date.isoformat(),
        duration_minutes=duration,
        timezone=tz,
        slots=slots,
        busy=busy_payload,
    )
