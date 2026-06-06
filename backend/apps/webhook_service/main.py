"""Webhook Service — Register, manage, and deliver outgoing webhooks.

* HMAC SHA-256 signature in ``X-AIROS-Signature`` (``t=<ts>,v1=<hex>``).
* Exponential retry with up to 4 attempts (1 initial + 3 retries).
* Tenant-scoped CRUD with admin-only writes.
* Per-tenant tenant isolation enforced at every endpoint.
* Every attempt recorded in :class:`WebhookDelivery` for observability.
"""
from __future__ import annotations

import json
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import require_admin, require_tenant_id
from shared.core.database import get_db_dependency
from shared.core.models.webhook import Webhook, WebhookDelivery
from shared.webhooks.dispatcher import (
    DEFAULT_MAX_ATTEMPTS,
    DEFAULT_BACKOFF_BASE_S,
    DEFAULT_TIMEOUT_S,
    deliver_with_retries,
    sign_payload,
)


# ── Event catalogue ────────────────────────────────────────────────────────────

ALLOWED_EVENTS: set[str] = {
    "candidate.created", "candidate.updated", "candidate.deleted",
    "candidate.hired", "candidate.rejected",
    "job.created", "job.updated", "job.archived", "job.published",
    "interview.scheduled", "interview.started", "interview.completed",
    "interview.cancelled",
    "ppe.session_started", "ppe.session_completed",
    "offer.extended", "offer.accepted", "offer.declined",
    "billing.subscription.created", "billing.subscription.cancelled",
    "billing.invoice.paid", "billing.invoice.failed",
    "user.invited", "user.activated",
    "workflow.completed", "workflow.failed",
    "webhook.test",
    "*",  # wildcard
}


# ── Schemas ────────────────────────────────────────────────────────────────────


class WebhookCreate(BaseModel):
    url: HttpUrl
    events: list[str] = Field(..., min_length=1, description="Event types to subscribe to")
    description: Optional[str] = Field(None, max_length=500)
    active: bool = True


class WebhookUpdate(BaseModel):
    url: Optional[HttpUrl] = None
    events: Optional[list[str]] = Field(None, min_length=1)
    description: Optional[str] = Field(None, max_length=500)
    active: Optional[bool] = None


class WebhookRead(BaseModel):
    id: str
    tenant_id: str
    url: str
    events: list[str]
    description: Optional[str] = None
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WebhookCreateResponse(WebhookRead):
    secret: str


class WebhookListResponse(BaseModel):
    data: list[WebhookRead]
    total: int


class WebhookDeliveryRead(BaseModel):
    id: str
    webhook_id: str
    event: str
    status: str
    response_code: Optional[int] = None
    response_body: Optional[str] = None
    attempt: int
    error: Optional[str] = None
    duration_ms: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class WebhookDeliveryListResponse(BaseModel):
    data: list[WebhookDeliveryRead]
    total: int


class WebhookTestRequest(BaseModel):
    event: str = Field(default="webhook.test")
    payload: Optional[dict[str, Any]] = None


class WebhookTestResponse(BaseModel):
    delivered: bool
    delivery_id: Optional[str] = None
    status: Optional[str] = None
    status_code: Optional[int] = None
    error: Optional[str] = None
    attempt: int
    duration_ms: Optional[int] = None
    signature: str


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "webhooks"


# ── Helpers ────────────────────────────────────────────────────────────────────


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _generate_secret() -> str:
    return f"whsec_{secrets.token_urlsafe(32)}"


def _parse_events(raw: str | list[str]) -> list[str]:
    if isinstance(raw, list):
        return raw
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if not isinstance(parsed, list):
        return []
    return [str(x) for x in parsed]


def _validate_events(events: list[str]) -> list[str]:
    cleaned = [e.strip() for e in events if e and e.strip()]
    if not cleaned:
        raise HTTPException(status_code=422, detail="At least one event is required")
    for ev in cleaned:
        if ev not in ALLOWED_EVENTS:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown event type: {ev}",
            )
    return cleaned


def _to_read(webhook: Webhook) -> WebhookRead:
    return WebhookRead(
        id=webhook.id,
        tenant_id=webhook.tenant_id,
        url=webhook.url,
        events=_parse_events(webhook.events),
        description=webhook.description,
        active=webhook.active,
        created_at=webhook.created_at,
        updated_at=webhook.updated_at,
    )


def _to_delivery_read(d: WebhookDelivery) -> WebhookDeliveryRead:
    return WebhookDeliveryRead(
        id=d.id,
        webhook_id=d.webhook_id,
        event=d.event,
        status=d.status,
        response_code=d.response_code,
        response_body=d.response_body,
        attempt=d.attempt,
        error=d.error,
        duration_ms=d.duration_ms,
        created_at=d.created_at,
    )


# ── Router ─────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Webhooks"])
async def health() -> HealthResponse:
    return HealthResponse()


@router.get("/events", tags=["Webhooks"], summary="List supported event types")
async def list_event_types() -> dict[str, Any]:
    return {"events": sorted(ALLOWED_EVENTS), "total": len(ALLOWED_EVENTS)}


@router.get("/", response_model=WebhookListResponse, tags=["Webhooks"],
            summary="List webhooks for the current tenant")
async def list_webhooks(
    active: Optional[bool] = Query(None, description="Filter by active flag"),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> WebhookListResponse:
    stmt = select(Webhook).where(Webhook.tenant_id == tenant_id)
    if active is not None:
        stmt = stmt.where(Webhook.active == active)
    stmt = stmt.order_by(Webhook.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    data = [_to_read(w) for w in rows]
    return WebhookListResponse(data=data, total=len(data))


@router.post("/", response_model=WebhookCreateResponse, status_code=status.HTTP_201_CREATED,
             tags=["Webhooks"], summary="Create a webhook subscription (admin only)")
async def create_webhook(
    data: WebhookCreate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
) -> WebhookCreateResponse:
    events = _validate_events(data.events)
    secret = _generate_secret()
    webhook = Webhook(
        tenant_id=tenant_id,
        url=str(data.url),
        events=json.dumps(events),
        secret=secret,
        description=data.description,
        active=data.active,
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)
    resp = _to_read(webhook).model_dump()
    resp["secret"] = secret
    return WebhookCreateResponse(**resp)


@router.get("/{webhook_id}", response_model=WebhookRead, tags=["Webhooks"],
            summary="Get a single webhook by id")
async def get_webhook(
    webhook_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> WebhookRead:
    row = (await db.execute(
        select(Webhook).where(
            Webhook.id == webhook_id,
            Webhook.tenant_id == tenant_id,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return _to_read(row)


@router.put("/{webhook_id}", response_model=WebhookRead, tags=["Webhooks"],
            summary="Update a webhook (admin only)")
async def update_webhook(
    webhook_id: str,
    data: WebhookUpdate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
) -> WebhookRead:
    row = (await db.execute(
        select(Webhook).where(
            Webhook.id == webhook_id,
            Webhook.tenant_id == tenant_id,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Webhook not found")
    if data.url is not None:
        row.url = str(data.url)
    if data.events is not None:
        events = _validate_events(data.events)
        row.events = json.dumps(events)
    if data.description is not None:
        row.description = data.description
    if data.active is not None:
        row.active = data.active
    row.updated_at = _utcnow()
    await db.commit()
    await db.refresh(row)
    return _to_read(row)


@router.delete("/{webhook_id}", tags=["Webhooks"], summary="Delete a webhook (admin only)")
async def delete_webhook(
    webhook_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
) -> dict[str, Any]:
    row = (await db.execute(
        select(Webhook).where(
            Webhook.id == webhook_id,
            Webhook.tenant_id == tenant_id,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Webhook not found")
    await db.delete(row)
    await db.commit()
    return {"id": webhook_id, "deleted": True}


@router.get("/{webhook_id}/deliveries", response_model=WebhookDeliveryListResponse,
            tags=["Webhooks"], summary="List delivery attempts for a webhook")
async def list_deliveries(
    webhook_id: str,
    limit: int = Query(50, ge=1, le=500),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> WebhookDeliveryListResponse:
    exists = (await db.execute(
        select(func.count()).select_from(Webhook).where(
            Webhook.id == webhook_id,
            Webhook.tenant_id == tenant_id,
        )
    )).scalar_one()
    if not exists:
        raise HTTPException(status_code=404, detail="Webhook not found")

    stmt = (
        select(WebhookDelivery)
        .where(
            WebhookDelivery.webhook_id == webhook_id,
            WebhookDelivery.tenant_id == tenant_id,
        )
        .order_by(WebhookDelivery.created_at.desc())
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(WebhookDelivery.status == status_filter)
    rows = (await db.execute(stmt)).scalars().all()
    data = [_to_delivery_read(r) for r in rows]
    return WebhookDeliveryListResponse(data=data, total=len(data))


@router.post("/{webhook_id}/test", response_model=WebhookTestResponse, tags=["Webhooks"],
             summary="Send a test event to a webhook (admin only)")
async def send_test_event(
    webhook_id: str,
    data: Optional[WebhookTestRequest] = None,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
) -> WebhookTestResponse:
    row = (await db.execute(
        select(Webhook).where(
            Webhook.id == webhook_id,
            Webhook.tenant_id == tenant_id,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Webhook not found")

    request = data or WebhookTestRequest()
    payload = request.payload or {
        "message": "This is a test event from AI-ROS",
        "test": True,
        "timestamp": _utcnow().isoformat(),
    }

    # For the test endpoint we always use the secret the client already knows
    # (i.e. the stored secret) to sign the request.  We compute the signature
    # preview up front so the response can show what the receiver should see.
    body_preview = json.dumps({"event": request.event, "data": payload}, default=str).encode("utf-8")
    ts = int(_utcnow().timestamp())
    signature = sign_payload(row.secret, body_preview, ts)

    # Make ONE HTTP attempt (no retries) for fast feedback.  We use a fresh
    # client so failures don't bleed into other dispatcher calls.
    started_at = _utcnow()
    delivery_id = str(uuid.uuid4())
    record = WebhookDelivery(
        id=delivery_id,
        webhook_id=row.id,
        tenant_id=row.tenant_id,
        event=request.event,
        payload={"event": request.event, "data": payload, "delivered_at": started_at.isoformat()},
        status="pending",
        attempt=1,
    )
    db.add(record)

    status_code: Optional[int] = None
    response_text: Optional[str] = None
    error: Optional[str] = None
    success = False
    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_S) as client:
            resp = await client.post(
                row.url,
                content=body_preview,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "AIROS-Webhook/1.0",
                    "X-AIROS-Signature": f"t={ts},v1={signature}",
                    "X-AIROS-Event": request.event,
                    "X-AIROS-Delivery": delivery_id,
                    "X-AIROS-Attempt": "1",
                },
            )
        status_code = resp.status_code
        response_text = (resp.text or "")[:4000]
        success = 200 <= resp.status_code < 300
        if not success:
            error = f"non-2xx response: {resp.status_code}"
    except httpx.HTTPError as exc:
        error = f"{type(exc).__name__}: {exc}"[:1000]
    except Exception as exc:  # pragma: no cover - defensive
        error = f"unexpected: {type(exc).__name__}: {exc}"[:1000]

    record.status = "success" if success else "failed"
    record.response_code = status_code
    record.response_body = response_text
    record.error = error
    record.duration_ms = int((_utcnow().timestamp() - started_at.timestamp()) * 1000)
    await db.commit()
    await db.refresh(record)

    return WebhookTestResponse(
        delivered=True,
        delivery_id=record.id,
        status=record.status,
        status_code=record.response_code,
        error=record.error,
        attempt=record.attempt,
        duration_ms=record.duration_ms,
        signature=signature,
    )
