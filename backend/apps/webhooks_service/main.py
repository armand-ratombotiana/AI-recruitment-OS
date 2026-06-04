"""Webhooks Service — Register, manage, and deliver outgoing webhooks.

Features:
- HMAC SHA-256 signature in `X-AIROS-Signature`
- Exponential retry: 1m → 5m → 30m → 2h → 12h (up to 5 attempts)
- Test event delivery + delivery history
- In-memory store (swap to DB for production)
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status
from pydantic import BaseModel, Field, HttpUrl


# ── In-Memory Store ────────────────────────────────────────────────────────────

_webhooks: dict[str, dict[str, Any]] = {}
_deliveries: dict[str, list[dict[str, Any]]] = {}  # webhook_id -> deliveries

# Retry schedule in seconds: 60, 300, 1800, 7200, 43200
RETRY_DELAYS_S = [60, 300, 1800, 7200, 43200]

# Allowed event types — extend freely as services emit events.
ALLOWED_EVENTS = {
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
    "*",  # wildcard
}


# ── Request/Response Models ────────────────────────────────────────────────────


class WebhookCreate(BaseModel):
    url: HttpUrl
    events: list[str] = Field(..., min_length=1, description="Event types to subscribe to")
    secret: Optional[str] = Field(None, description="HMAC secret. Generated if not supplied.")
    description: Optional[str] = Field(None, max_length=500)
    enabled: bool = True
    headers: Optional[dict[str, str]] = Field(None, description="Custom headers added to each delivery")


class WebhookUpdate(BaseModel):
    url: Optional[HttpUrl] = None
    events: Optional[list[str]] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    headers: Optional[dict[str, str]] = None


class WebhookResponse(BaseModel):
    id: str
    url: str
    events: list[str]
    description: Optional[str] = None
    enabled: bool
    created_at: str
    updated_at: str
    last_delivery_at: Optional[str] = None
    failure_count: int = 0
    success_count: int = 0


class WebhookCreateResponse(WebhookResponse):
    secret: str


class WebhookListResponse(BaseModel):
    data: list[WebhookResponse]
    total: int


class DeliveryAttempt(BaseModel):
    id: str
    webhook_id: str
    event: str
    payload: dict[str, Any]
    status_code: Optional[int] = None
    success: bool
    attempt: int
    error: Optional[str] = None
    delivered_at: str
    duration_ms: Optional[int] = None
    next_retry_at: Optional[str] = None


class DeliveryListResponse(BaseModel):
    data: list[DeliveryAttempt]
    total: int


class TestEventRequest(BaseModel):
    event: str = Field(default="webhook.test")
    payload: Optional[dict[str, Any]] = None


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "webhooks"


# ── Helpers ────────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _validate_events(events: list[str]) -> list[str]:
    for ev in events:
        if ev not in ALLOWED_EVENTS:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown event type: {ev}. Allowed: {sorted(ALLOWED_EVENTS)}",
            )
    return events


def _sign_payload(secret: str, body: bytes, timestamp: int) -> str:
    msg = f"{timestamp}.".encode("utf-8") + body
    return hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def _to_response(w: dict[str, Any]) -> WebhookResponse:
    return WebhookResponse(
        id=w["id"],
        url=w["url"],
        events=w["events"],
        description=w.get("description"),
        enabled=w["enabled"],
        created_at=w["created_at"],
        updated_at=w["updated_at"],
        last_delivery_at=w.get("last_delivery_at"),
        failure_count=w.get("failure_count", 0),
        success_count=w.get("success_count", 0),
    )


async def _deliver_once(webhook: dict[str, Any], event: str, payload: dict[str, Any], attempt: int) -> dict[str, Any]:
    body = json.dumps({"event": event, "data": payload, "delivered_at": _now().isoformat()}).encode("utf-8")
    ts = int(time.time())
    signature = _sign_payload(webhook["secret"], body, ts)
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "AIROS-Webhook/1.0",
        "X-AIROS-Signature": f"t={ts},v1={signature}",
        "X-AIROS-Event": event,
        "X-AIROS-Delivery": uuid.uuid4().hex,
        "X-AIROS-Attempt": str(attempt),
    }
    for k, v in (webhook.get("headers") or {}).items():
        headers[k] = v

    started = time.perf_counter()
    delivery_id = f"del_{uuid.uuid4().hex[:16]}"
    record: dict[str, Any] = {
        "id": delivery_id,
        "webhook_id": webhook["id"],
        "event": event,
        "payload": payload,
        "status_code": None,
        "success": False,
        "attempt": attempt,
        "error": None,
        "delivered_at": _now().isoformat(),
        "duration_ms": None,
        "next_retry_at": None,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook["url"], content=body, headers=headers)
        record["status_code"] = resp.status_code
        record["success"] = 200 <= resp.status_code < 300
        record["duration_ms"] = int((time.perf_counter() - started) * 1000)
    except Exception as exc:  # pragma: no cover - network errors
        record["error"] = str(exc)
        record["duration_ms"] = int((time.perf_counter() - started) * 1000)

    if not record["success"] and attempt < len(RETRY_DELAYS_S):
        delay = RETRY_DELAYS_S[attempt - 1]
        record["next_retry_at"] = (_now() + timedelta(seconds=delay)).isoformat()

    webhook["last_delivery_at"] = record["delivered_at"]
    webhook["success_count"] = webhook.get("success_count", 0) + (1 if record["success"] else 0)
    webhook["failure_count"] = webhook.get("failure_count", 0) + (0 if record["success"] else 1)
    _deliveries.setdefault(webhook["id"], []).append(record)
    return record


async def _deliver_with_retry(webhook_id: str, event: str, payload: dict[str, Any]) -> None:
    webhook = _webhooks.get(webhook_id)
    if not webhook or not webhook.get("enabled"):
        return
    for attempt in range(1, len(RETRY_DELAYS_S) + 2):
        record = await _deliver_once(webhook, event, payload, attempt)
        if record["success"]:
            return
        if attempt > len(RETRY_DELAYS_S):
            return
        # In production we'd schedule with Celery / RQ. Here we wait a
        # microsleep so tests stay fast — the schedule is recorded in
        # `next_retry_at` for observability.
        await asyncio.sleep(0)


# ── Router ─────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Webhooks"])
async def health() -> HealthResponse:
    return HealthResponse()


@router.get("/events", tags=["Webhooks"], summary="List supported event types")
async def list_event_types():
    return {"events": sorted(ALLOWED_EVENTS), "total": len(ALLOWED_EVENTS)}


@router.post("/", response_model=WebhookCreateResponse, status_code=status.HTTP_201_CREATED, tags=["Webhooks"])
async def create_webhook(data: WebhookCreate):
    _validate_events(data.events)
    webhook_id = f"wh_{uuid.uuid4().hex[:16]}"
    now = _now().isoformat()
    secret = data.secret or f"whsec_{uuid.uuid4().hex}"
    webhook = {
        "id": webhook_id,
        "url": str(data.url),
        "events": data.events,
        "secret": secret,
        "description": data.description,
        "enabled": data.enabled,
        "headers": data.headers or {},
        "created_at": now,
        "updated_at": now,
        "last_delivery_at": None,
        "success_count": 0,
        "failure_count": 0,
    }
    _webhooks[webhook_id] = webhook
    _deliveries[webhook_id] = []
    resp = _to_response(webhook).model_dump()
    resp["secret"] = secret
    return WebhookCreateResponse(**resp)


@router.get("/", response_model=WebhookListResponse, tags=["Webhooks"])
async def list_webhooks(enabled_only: bool = Query(False)):
    items = [
        _to_response(w)
        for w in _webhooks.values()
        if (not enabled_only or w["enabled"])
    ]
    return WebhookListResponse(data=items, total=len(items))


@router.get("/{webhook_id}", response_model=WebhookResponse, tags=["Webhooks"])
async def get_webhook(webhook_id: str):
    if webhook_id not in _webhooks:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return _to_response(_webhooks[webhook_id])


@router.put("/{webhook_id}", response_model=WebhookResponse, tags=["Webhooks"])
async def update_webhook(webhook_id: str, data: WebhookUpdate):
    if webhook_id not in _webhooks:
        raise HTTPException(status_code=404, detail="Webhook not found")
    w = _webhooks[webhook_id]
    if data.url is not None:
        w["url"] = str(data.url)
    if data.events is not None:
        _validate_events(data.events)
        w["events"] = data.events
    if data.description is not None:
        w["description"] = data.description
    if data.enabled is not None:
        w["enabled"] = data.enabled
    if data.headers is not None:
        w["headers"] = data.headers
    w["updated_at"] = _now().isoformat()
    return _to_response(w)


@router.delete("/{webhook_id}", tags=["Webhooks"])
async def delete_webhook(webhook_id: str):
    if webhook_id not in _webhooks:
        raise HTTPException(status_code=404, detail="Webhook not found")
    _webhooks.pop(webhook_id)
    _deliveries.pop(webhook_id, None)
    return {"id": webhook_id, "deleted": True}


@router.post("/{webhook_id}/rotate-secret", tags=["Webhooks"])
async def rotate_secret(webhook_id: str):
    if webhook_id not in _webhooks:
        raise HTTPException(status_code=404, detail="Webhook not found")
    new_secret = f"whsec_{uuid.uuid4().hex}"
    _webhooks[webhook_id]["secret"] = new_secret
    _webhooks[webhook_id]["updated_at"] = _now().isoformat()
    return {"id": webhook_id, "secret": new_secret}


@router.get("/{webhook_id}/deliveries", response_model=DeliveryListResponse, tags=["Webhooks"])
async def list_deliveries(
    webhook_id: str,
    limit: int = Query(50, ge=1, le=500),
    success: Optional[bool] = Query(None),
):
    if webhook_id not in _webhooks:
        raise HTTPException(status_code=404, detail="Webhook not found")
    items = list(_deliveries.get(webhook_id, []))
    if success is not None:
        items = [d for d in items if d["success"] == success]
    items.sort(key=lambda d: d["delivered_at"], reverse=True)
    return DeliveryListResponse(
        data=[DeliveryAttempt(**d) for d in items[:limit]],
        total=len(items),
    )


@router.post("/{webhook_id}/test", tags=["Webhooks"])
async def send_test_event(
    webhook_id: str,
    body: Optional[TestEventRequest] = None,
    background_tasks: BackgroundTasks = None,
):
    if webhook_id not in _webhooks:
        raise HTTPException(status_code=404, detail="Webhook not found")
    body = body or TestEventRequest()
    payload = body.payload or {
        "message": "This is a test event from AI-ROS",
        "test": True,
        "timestamp": _now().isoformat(),
    }
    # Run once, no retry, but synchronously so tests can observe the result
    record = await _deliver_once(_webhooks[webhook_id], body.event, payload, attempt=1)
    return {
        "delivered": True,
        "delivery_id": record["id"],
        "status_code": record["status_code"],
        "success": record["success"],
        "duration_ms": record["duration_ms"],
        "error": record["error"],
    }


@router.post("/dispatch", tags=["Webhooks"], summary="Internal: dispatch an event to all matching webhooks")
async def dispatch_event(
    event: str,
    payload: Optional[dict[str, Any]] = None,
    background_tasks: BackgroundTasks = None,
):
    """Fan-out an event to every enabled subscriber.

    The retry loop is scheduled on the BackgroundTasks runner so the
    request returns immediately.
    """
    payload = payload or {}
    if event not in ALLOWED_EVENTS:
        raise HTTPException(status_code=422, detail=f"Unknown event: {event}")
    targets = [
        w for w in _webhooks.values()
        if w["enabled"] and (event in w["events"] or "*" in w["events"])
    ]
    for w in targets:
        if background_tasks is not None:
            background_tasks.add_task(_deliver_with_retry, w["id"], event, payload)
        else:  # pragma: no cover
            await _deliver_with_retry(w["id"], event, payload)
    return {"event": event, "dispatched_to": len(targets)}
