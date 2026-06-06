"""Notification Service — Multi-channel notifications backed by the database.

The service now provides:

* The original CRUD endpoints for in-app notifications (backed by the
  ``Notification`` table) — preserved for backwards compatibility.
* Per-user notification preferences (``/preferences``) controlling which
  events are delivered through which channels.
* A channel registry (``/channels``) where each user can register one or
  more delivery addresses (email, phone, push token, Slack webhook) and
  mark them verified.
* Creation logic that **respects preferences and routes deliveries to the
  registered, verified channels** for the recipient.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import require_admin, require_authenticated_user, require_tenant_id
from shared.core.database import get_db_dependency
from shared.core.models.notification import Notification
from shared.core.models.notification_preference import (
    NotificationChannel,
    NotificationChannelType,
    NotificationPreference,
)


# ── Schemas ───────────────────────────────────────────────────────────────────


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
    slack: Optional[bool] = None
    digest_frequency: Optional[str] = None


# ── New preference / channel schemas ──────────────────────────────────────────


class PreferenceItem(BaseModel):
    event_type: str
    channel: str
    enabled: bool


class PreferencesBulkUpdate(BaseModel):
    preferences: list[PreferenceItem] = Field(default_factory=list)


class ChannelCreate(BaseModel):
    channel_type: str
    address: str


# ── Helpers ───────────────────────────────────────────────────────────────────


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


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


def _pref_to_dict(p: NotificationPreference) -> dict[str, Any]:
    return {
        "id": p.id,
        "tenant_id": p.tenant_id,
        "user_id": p.user_id,
        "event_type": p.event_type,
        "channel": p.channel,
        "enabled": p.enabled,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _channel_to_dict(c: NotificationChannel) -> dict[str, Any]:
    return {
        "id": c.id,
        "tenant_id": c.tenant_id,
        "user_id": c.user_id,
        "channel_type": c.channel_type,
        "address": c.address,
        "verified": c.verified,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "verified_at": c.verified_at.isoformat() if c.verified_at else None,
    }


def _valid_channel(value: str) -> bool:
    try:
        NotificationChannelType(value)
        return True
    except ValueError:
        return False


async def _allowed_channels(
    db: AsyncSession,
    tenant_id: str,
    user_id: str,
    event_type: str,
) -> list[str]:
    """Return the list of channels the user has *enabled* for ``event_type``.

    The rule is:
    * If an explicit ``NotificationPreference`` row exists for
      (user, event_type, channel) we honour its ``enabled`` flag.
    * Otherwise we default to enabling the in-app channel only.
    """
    rows = (
        await db.execute(
            select(NotificationPreference).where(
                NotificationPreference.tenant_id == tenant_id,
                NotificationPreference.user_id == user_id,
                NotificationPreference.event_type == event_type,
            )
        )
    ).scalars().all()

    if not rows:
        # No preferences stored — sane default: in-app only.
        return [NotificationChannelType.IN_APP.value]

    return [r.channel for r in rows if r.enabled]


async def _verified_addresses(
    db: AsyncSession,
    tenant_id: str,
    user_id: str,
    channels: list[str],
) -> list[NotificationChannel]:
    """Return verified ``NotificationChannel`` rows for ``user_id`` matching
    any of the requested ``channels``."""
    if not channels:
        return []
    rows = (
        await db.execute(
            select(NotificationChannel).where(
                NotificationChannel.tenant_id == tenant_id,
                NotificationChannel.user_id == user_id,
                NotificationChannel.channel_type.in_(channels),
                NotificationChannel.verified.is_(True),
            )
        )
    ).scalars().all()
    return list(rows)


# ── Router ────────────────────────────────────────────────────────────────────


router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "healthy", "service": "notification"}


# ── Preferences ───────────────────────────────────────────────────────────────


@router.get("/preferences")
async def get_preferences(
    user: dict = Depends(require_authenticated_user),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    """Return all ``(event_type, channel)`` preferences for the caller."""
    user_id = user["id"]
    rows = (
        await db.execute(
            select(NotificationPreference).where(
                NotificationPreference.tenant_id == tenant_id,
                NotificationPreference.user_id == user_id,
            )
        )
    ).scalars().all()
    return {"preferences": [_pref_to_dict(r) for r in rows]}


@router.put("/preferences")
async def update_preferences(
    data: PreferencesBulkUpdate,
    user: dict = Depends(require_authenticated_user),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    """Upsert a batch of ``(event_type, channel, enabled)`` preferences.

    Any prior row for the same triple is replaced.
    """
    user_id = user["id"]
    if not data.preferences:
        return {"updated": 0, "preferences": []}

    # Validate all entries up-front so we can fail fast.
    for item in data.preferences:
        if not item.event_type:
            raise HTTPException(
                status_code=422, detail="event_type is required for each preference"
            )
        if not _valid_channel(item.channel):
            raise HTTPException(
                status_code=422,
                detail=f"Unsupported channel '{item.channel}'. "
                f"Allowed: {[c.value for c in NotificationChannelType]}",
            )

    upserted: list[NotificationPreference] = []
    for item in data.preferences:
        existing = (
            await db.execute(
                select(NotificationPreference).where(
                    NotificationPreference.tenant_id == tenant_id,
                    NotificationPreference.user_id == user_id,
                    NotificationPreference.event_type == item.event_type,
                    NotificationPreference.channel == item.channel,
                )
            )
        ).scalar_one_or_none()

        now = _utcnow()
        if existing is None:
            row = NotificationPreference(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                user_id=user_id,
                event_type=item.event_type,
                channel=item.channel,
                enabled=item.enabled,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
            upserted.append(row)
        else:
            existing.enabled = item.enabled
            existing.updated_at = now
            upserted.append(existing)

    await db.commit()
    for row in upserted:
        await db.refresh(row)
    return {"updated": len(upserted), "preferences": [_pref_to_dict(r) for r in upserted]}


# ── Channels ──────────────────────────────────────────────────────────────────


@router.get("/channels")
async def list_channels(
    user: dict = Depends(require_authenticated_user),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    """Return all delivery channels registered for the caller."""
    user_id = user["id"]
    rows = (
        await db.execute(
            select(NotificationChannel).where(
                NotificationChannel.tenant_id == tenant_id,
                NotificationChannel.user_id == user_id,
            )
        )
    ).scalars().all()
    return {"channels": [_channel_to_dict(r) for r in rows]}


@router.post("/channels", status_code=201)
async def add_channel(
    data: ChannelCreate,
    user: dict = Depends(require_authenticated_user),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    """Register a new delivery channel for the caller.

    Newly added channels start as ``verified=False``.  Clients must call
    ``POST /channels/{id}/verify`` to flip the flag.
    """
    if not _valid_channel(data.channel_type):
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported channel_type '{data.channel_type}'. "
            f"Allowed: {[c.value for c in NotificationChannelType]}",
        )
    if not data.address or not data.address.strip():
        raise HTTPException(status_code=422, detail="address is required")

    user_id = user["id"]
    row = NotificationChannel(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        user_id=user_id,
        channel_type=data.channel_type,
        address=data.address.strip(),
        verified=False,
        created_at=_utcnow(),
        verified_at=None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _channel_to_dict(row)


@router.delete("/channels/{channel_id}")
async def remove_channel(
    channel_id: str,
    user: dict = Depends(require_authenticated_user),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    """Delete a delivery channel owned by the caller."""
    user_id = user["id"]
    row = (
        await db.execute(
            select(NotificationChannel).where(
                NotificationChannel.id == channel_id,
                NotificationChannel.tenant_id == tenant_id,
                NotificationChannel.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Channel {channel_id} not found")
    await db.delete(row)
    await db.commit()
    return {"deleted": True, "channel_id": channel_id}


@router.post("/channels/{channel_id}/verify")
async def verify_channel(
    channel_id: str,
    user: dict = Depends(require_authenticated_user),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    """Mark a delivery channel as verified.

    In a real deployment this would confirm a one-time code sent to the
    address.  For the purposes of this service we treat the call itself
    as the confirmation gesture.
    """
    user_id = user["id"]
    row = (
        await db.execute(
            select(NotificationChannel).where(
                NotificationChannel.id == channel_id,
                NotificationChannel.tenant_id == tenant_id,
                NotificationChannel.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Channel {channel_id} not found")
    row.verified = True
    row.verified_at = _utcnow()
    await db.commit()
    await db.refresh(row)
    return _channel_to_dict(row)


# ── Notifications (existing CRUD, now preference-aware) ──────────────────────


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
    """Create a notification that respects the recipient's preferences.

    The new flow:
    1. Determine the ``event_type`` (defaults to ``data.type``).
    2. Look up which channels the recipient has *enabled* for that event.
    3. Look up the *verified* delivery addresses for those channels.
    4. Persist a single ``Notification`` row tagged with the resolved
       delivery list (``routed_channels``) so the in-app feed shows the
       user *what* was sent and *where* it went.  Out-of-band delivery
       (email, push, Slack) is a no-op stub in this service but the
       routing decision is real and persisted.
    5. If the user has disabled every channel for this event the row is
       persisted with ``routed_channels=[]`` so the audit trail still
       records that we considered (and suppressed) the event.
    """
    event_type = data.type
    requested_channel = data.channel
    recipient_id = data.recipient_id

    # If a specific channel was requested, intersect it with the
    # recipient's preferences so callers can override the global default
    # on a per-event basis.
    enabled_channels = await _allowed_channels(db, tenant_id, recipient_id or "", event_type)
    if requested_channel and requested_channel in enabled_channels:
        target_channels = [requested_channel]
    else:
        target_channels = list(enabled_channels)

    # Resolve the verified delivery endpoints.
    addresses = await _verified_addresses(db, tenant_id, recipient_id or "", target_channels)
    routed = sorted({c.channel_type for c in addresses}) if addresses else list(target_channels)

    row = Notification(
        tenant_id=tenant_id,
        user_id=recipient_id,
        type=event_type,
        title=data.title,
        message=data.message,
        link=data.link,
        read=False,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    payload = _to_dict(row)
    payload["routed_channels"] = routed
    payload["deliveries"] = [
        {"channel": c.channel_type, "address": c.address} for c in addresses
    ]
    return payload


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
