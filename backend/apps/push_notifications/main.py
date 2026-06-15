"""Push Notifications Service — device management and push delivery."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import require_authenticated_user, require_member, require_tenant_id
from shared.core.database import get_db_dependency
from shared.core.models.push_notification import PushDevice, PushNotification, PushPlatform, PushStatus
from shared.push_notifications.provider import PushNotificationProvider, get_push_provider


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class DeviceRegisterRequest(BaseModel):
    device_token: str
    platform: str
    app_version: str | None = None


class DeviceUnregisterRequest(BaseModel):
    device_token: str


class PushSendRequest(BaseModel):
    user_id: str
    title: str
    body: str
    data: dict[str, Any] | None = None


class PushBroadcastRequest(BaseModel):
    title: str
    body: str
    data: dict[str, Any] | None = None


router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "healthy", "service": "push-notifications"}


@router.post("/register")
async def register_device(
    body: DeviceRegisterRequest,
    user: dict = Depends(require_authenticated_user),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    provider: PushNotificationProvider = Depends(get_push_provider),
):
    if body.platform not in {p.value for p in PushPlatform}:
        raise HTTPException(status_code=422, detail=f"Invalid platform: {body.platform}")
    if not body.device_token or not body.device_token.strip():
        raise HTTPException(status_code=422, detail="device_token is required")

    user_id = user["id"]

    existing = (
        await db.execute(
            select(PushDevice).where(
                PushDevice.tenant_id == tenant_id,
                PushDevice.user_id == user_id,
                PushDevice.device_token == body.device_token,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        existing.platform = body.platform
        existing.app_version = body.app_version
        existing.last_active_at = _utcnow()
        await db.commit()
        await db.refresh(existing)
        return _device_to_dict(existing)

    device_id = await provider.register_device(user_id, body.device_token, body.platform)

    device = PushDevice(
        id=device_id,
        user_id=user_id,
        tenant_id=tenant_id,
        device_token=body.device_token,
        platform=body.platform,
        app_version=body.app_version,
        last_active_at=_utcnow(),
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return _device_to_dict(device)


@router.delete("/unregister")
async def unregister_device(
    body: DeviceUnregisterRequest,
    user: dict = Depends(require_authenticated_user),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    provider: PushNotificationProvider = Depends(get_push_provider),
):
    user_id = user["id"]
    device = (
        await db.execute(
            select(PushDevice).where(
                PushDevice.tenant_id == tenant_id,
                PushDevice.user_id == user_id,
                PushDevice.device_token == body.device_token,
            )
        )
    ).scalar_one_or_none()

    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")

    await provider.unregister_device(body.device_token)
    await db.delete(device)
    await db.commit()
    return {"deleted": True, "device_token": body.device_token}


@router.get("/devices")
async def list_devices(
    user: dict = Depends(require_authenticated_user),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    user_id = user["id"]
    rows = (
        await db.execute(
            select(PushDevice).where(
                PushDevice.tenant_id == tenant_id,
                PushDevice.user_id == user_id,
            )
        )
    ).scalars().all()
    return {"devices": [_device_to_dict(d) for d in rows]}


@router.post("/send")
async def send_push(
    body: PushSendRequest,
    user: dict = Depends(require_member),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    provider: PushNotificationProvider = Depends(get_push_provider),
):
    devices = (
        await db.execute(
            select(PushDevice).where(
                PushDevice.tenant_id == tenant_id,
                PushDevice.user_id == body.user_id,
            )
        )
    ).scalars().all()

    if not devices:
        raise HTTPException(status_code=404, detail="No devices registered for user")

    data_json = json.dumps(body.data) if body.data else None
    results: list[dict[str, Any]] = []

    for device in devices:
        ok = await provider.send_push(
            device.device_token, body.title, body.body, body.data
        )
        status = PushStatus.SENT.value if ok else PushStatus.FAILED.value
        notification = PushNotification(
            tenant_id=tenant_id,
            user_id=body.user_id,
            device_id=device.id,
            title=body.title,
            body=body.body,
            data=data_json,
            status=status,
            sent_at=_utcnow() if ok else None,
        )
        db.add(notification)
        results.append({"device_id": device.id, "status": status})

    await db.commit()
    return {"sent": len(results), "results": results}


@router.post("/broadcast")
async def broadcast_push(
    body: PushBroadcastRequest,
    user: dict = Depends(require_member),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    provider: PushNotificationProvider = Depends(get_push_provider),
):
    all_devices = (
        await db.execute(
            select(PushDevice).where(PushDevice.tenant_id == tenant_id)
        )
    ).scalars().all()

    data_json = json.dumps(body.data) if body.data else None
    sent_count = 0
    user_ids_seen: set[str] = set()

    for device in all_devices:
        ok = await provider.send_push(
            device.device_token, body.title, body.body, body.data
        )
        status = PushStatus.SENT.value if ok else PushStatus.FAILED.value
        notification = PushNotification(
            tenant_id=tenant_id,
            user_id=device.user_id,
            device_id=device.id,
            title=body.title,
            body=body.body,
            data=data_json,
            status=status,
            sent_at=_utcnow() if ok else None,
        )
        db.add(notification)
        if ok:
            sent_count += 1
        user_ids_seen.add(device.user_id)

    await db.commit()
    return {
        "sent": sent_count,
        "devices_reached": len(all_devices),
        "users_reached": len(user_ids_seen),
    }


@router.get("/history")
async def notification_history(
    user: dict = Depends(require_authenticated_user),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    user_id = user["id"]
    rows = (
        await db.execute(
            select(PushNotification)
            .where(
                PushNotification.tenant_id == tenant_id,
                PushNotification.user_id == user_id,
            )
            .order_by(PushNotification.created_at.desc())
        )
    ).scalars().all()
    return {"notifications": [_notification_to_dict(n) for n in rows]}


def _device_to_dict(d: PushDevice) -> dict[str, Any]:
    return {
        "id": d.id,
        "user_id": d.user_id,
        "tenant_id": d.tenant_id,
        "device_token": d.device_token,
        "platform": d.platform,
        "app_version": d.app_version,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "last_active_at": d.last_active_at.isoformat() if d.last_active_at else None,
    }


def _notification_to_dict(n: PushNotification) -> dict[str, Any]:
    return {
        "id": n.id,
        "tenant_id": n.tenant_id,
        "user_id": n.user_id,
        "device_id": n.device_id,
        "title": n.title,
        "body": n.body,
        "data": json.loads(n.data) if n.data else None,
        "status": n.status,
        "sent_at": n.sent_at.isoformat() if n.sent_at else None,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }
