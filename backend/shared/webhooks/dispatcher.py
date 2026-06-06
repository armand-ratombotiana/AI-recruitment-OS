"""Outgoing webhook dispatcher.

When a domain event happens (e.g. ``candidate.created``) the calling service
invokes :func:`dispatch_event` with the event name, payload, and tenant id.
The dispatcher:

1. Looks up every :class:`~shared.core.models.webhook.Webhook` row for the
   tenant that is ``active`` and lists the event in its ``events`` array (or
   contains the ``"*"`` wildcard).
2. For each matching webhook, signs the JSON payload with the webhook's
   ``secret`` using HMAC-SHA256 and POSTs it to the configured URL via
   :class:`httpx.AsyncClient`.
3. On failure, retries with exponential backoff (3 retries total = 4 attempts
   by default).
4. Writes a :class:`~shared.core.models.webhook.WebhookDelivery` row for
   *every* attempt so operators can see the full retry sequence.

The function uses the caller's ``AsyncSession`` and never commits — the
caller's outer transaction is responsible for persisting the rows.  This
keeps webhook delivery consistent with the calling domain event (either both
commit or both roll back) while avoiding extra round-trips to the database.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.models.webhook import Webhook, WebhookDelivery


logger = logging.getLogger("airos.webhooks.dispatcher")


# ── Tunables ───────────────────────────────────────────────────────────────────

DEFAULT_MAX_ATTEMPTS: int = 4       # 1 initial + 3 retries
DEFAULT_BACKOFF_BASE_S: float = 0.1  # 0.1s, 0.2s, 0.4s, ...
DEFAULT_TIMEOUT_S: float = 10.0

SleepFn = Callable[[float], Awaitable[None]]


# ── Signing ────────────────────────────────────────────────────────────────────


def sign_payload(secret: str, body: bytes, timestamp: int) -> str:
    """Return the HMAC-SHA256 hex digest of ``timestamp.body`` keyed by ``secret``.

    The convention ``t=<ts>,v1=<hex>`` matches Stripe's webhook signing
    scheme and allows receivers to verify both the payload integrity and the
    freshness of the delivery.
    """
    msg = f"{timestamp}.".encode("utf-8") + body
    return hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()


# ── Per-attempt delivery ───────────────────────────────────────────────────────


def _build_envelope(event: str, tenant_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "event": event,
        "tenant_id": tenant_id,
        "data": payload,
        "delivered_at": datetime.now(timezone.utc).isoformat(),
    }


async def _attempt_delivery(
    webhook: Webhook,
    event: str,
    envelope: dict[str, Any],
    attempt: int,
    *,
    db: AsyncSession,
    http_client: httpx.AsyncClient,
    timeout_s: float,
) -> WebhookDelivery:
    """POST the event to ``webhook`` once and record the attempt.

    The :class:`WebhookDelivery` row is added to ``db`` but **not** committed
    — the caller's transaction owns the commit boundary.  This is wrapped
    in a try/except so a transport error never escapes; the row is always
    written.
    """
    body = json.dumps(envelope, default=str, separators=(",", ":")).encode("utf-8")
    timestamp = int(time.time())
    signature = sign_payload(webhook.secret, body, timestamp)
    delivery_id = str(uuid.uuid4())

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "AIROS-Webhook/1.0",
        "X-AIROS-Signature": f"t={timestamp},v1={signature}",
        "X-AIROS-Event": event,
        "X-AIROS-Delivery": delivery_id,
        "X-AIROS-Attempt": str(attempt),
    }

    started = time.perf_counter()
    status_code: Optional[int] = None
    response_text: Optional[str] = None
    error: Optional[str] = None
    status = "failed"

    try:
        resp = await http_client.post(
            webhook.url, content=body, headers=headers, timeout=timeout_s
        )
        status_code = resp.status_code
        response_text = (resp.text or "")[:4000]
        if 200 <= resp.status_code < 300:
            status = "success"
        else:
            error = f"non-2xx response: {resp.status_code}"
    except httpx.HTTPError as exc:
        error = f"{type(exc).__name__}: {exc}"[:1000]
    except asyncio.CancelledError:
        # Propagate cancellation so callers can interrupt slow retries.
        raise
    except Exception as exc:  # pragma: no cover - defensive
        error = f"unexpected: {type(exc).__name__}: {exc}"[:1000]
    finally:
        duration_ms = int((time.perf_counter() - started) * 1000)

    record = WebhookDelivery(
        id=delivery_id,
        webhook_id=webhook.id,
        tenant_id=webhook.tenant_id,
        event=event,
        payload=envelope,
        status=status,
        response_code=status_code,
        response_body=response_text,
        attempt=attempt,
        error=error,
        duration_ms=duration_ms,
    )
    db.add(record)
    return record


# ── Retry loop ─────────────────────────────────────────────────────────────────


async def deliver_with_retries(
    webhook: Webhook,
    event: str,
    payload: dict[str, Any],
    *,
    db: AsyncSession,
    http_client: httpx.AsyncClient,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    backoff_base_s: float = DEFAULT_BACKOFF_BASE_S,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    sleep: SleepFn = asyncio.sleep,
) -> list[WebhookDelivery]:
    """Deliver an event to a single webhook with exponential backoff retries.

    Returns the list of :class:`WebhookDelivery` rows added to ``db`` (one per
    attempt).  The loop stops as soon as a delivery succeeds.  The caller
    is responsible for committing the transaction.
    """
    envelope = _build_envelope(event, webhook.tenant_id, payload)
    attempts: list[WebhookDelivery] = []
    for attempt in range(1, max_attempts + 1):
        record = await _attempt_delivery(
            webhook,
            event,
            envelope,
            attempt,
            db=db,
            http_client=http_client,
            timeout_s=timeout_s,
        )
        attempts.append(record)
        if record.status == "success":
            return attempts
        if attempt < max_attempts:
            # Exponential backoff: base * 2^(attempt-1)
            await sleep(backoff_base_s * (2 ** (attempt - 1)))
    return attempts


# ── Fan-out ────────────────────────────────────────────────────────────────────


def _webhook_subscribes(webhook: Webhook, event: str) -> bool:
    """Return True if ``webhook`` is subscribed to ``event``.

    The ``events`` column is a JSON-encoded list; the wildcard ``"*"``
    subscribes to every event.
    """
    try:
        events = json.loads(webhook.events or "[]")
    except (TypeError, ValueError):
        return False
    if not isinstance(events, list):
        return False
    if "*" in events:
        return True
    return event in events


async def dispatch_event_to_webhook(
    webhook_id: str,
    event: str,
    payload: dict[str, Any],
    *,
    db: AsyncSession,
    http_client: Optional[httpx.AsyncClient] = None,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    backoff_base_s: float = DEFAULT_BACKOFF_BASE_S,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    sleep: SleepFn = asyncio.sleep,
) -> list[WebhookDelivery]:
    """Deliver an event to a single webhook by id (used by the ``/test`` endpoint)."""
    row = (await db.execute(
        select(Webhook).where(Webhook.id == webhook_id)
    )).scalar_one_or_none()
    if row is None or not row.active:
        return []
    owns_client = http_client is None
    if owns_client:
        http_client = httpx.AsyncClient(timeout=timeout_s)
    try:
        return await deliver_with_retries(
            row,
            event,
            payload,
            db=db,
            http_client=http_client,
            max_attempts=max_attempts,
            backoff_base_s=backoff_base_s,
            timeout_s=timeout_s,
            sleep=sleep,
        )
    finally:
        if owns_client:
            await http_client.aclose()


async def dispatch_event(
    event: str,
    payload: dict[str, Any],
    tenant_id: str,
    *,
    db: AsyncSession,
    http_client: Optional[httpx.AsyncClient] = None,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    backoff_base_s: float = DEFAULT_BACKOFF_BASE_S,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    sleep: SleepFn = asyncio.sleep,
) -> list[WebhookDelivery]:
    """Fan out ``event`` to every active subscriber of the given tenant.

    The function looks up matching webhooks, then for each one runs the
    full retry loop.  Returns the flat list of every
    :class:`WebhookDelivery` row created during the call.

    The caller's session is used but never committed — see module docstring.
    """
    if not tenant_id:
        return []

    rows = (await db.execute(
        select(Webhook).where(
            Webhook.tenant_id == tenant_id,
            Webhook.active.is_(True),
        )
    )).scalars().all()

    targets = [w for w in rows if _webhook_subscribes(w, event)]
    if not targets:
        return []

    owns_client = http_client is None
    if owns_client:
        http_client = httpx.AsyncClient(timeout=timeout_s)
    try:
        all_attempts: list[WebhookDelivery] = []
        for webhook in targets:
            attempts = await deliver_with_retries(
                webhook,
                event,
                payload,
                db=db,
                http_client=http_client,
                max_attempts=max_attempts,
                backoff_base_s=backoff_base_s,
                timeout_s=timeout_s,
                sleep=sleep,
            )
            all_attempts.extend(attempts)
        return all_attempts
    finally:
        if owns_client:
            await http_client.aclose()


async def safe_dispatch_event(
    event: str,
    payload: dict[str, Any],
    tenant_id: str,
    *,
    db: AsyncSession,
    http_client: Optional[httpx.AsyncClient] = None,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    backoff_base_s: float = DEFAULT_BACKOFF_BASE_S,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    sleep: SleepFn = asyncio.sleep,
) -> list[WebhookDelivery]:
    """Same as :func:`dispatch_event` but never raises.

    Webhook delivery is a side-effect: a failure to reach a customer's URL
    must not break the originating API call.  This wrapper logs and
    swallows any exception.  Returns the empty list on failure.
    """
    try:
        return await dispatch_event(
            event,
            payload,
            tenant_id,
            db=db,
            http_client=http_client,
            max_attempts=max_attempts,
            backoff_base_s=backoff_base_s,
            timeout_s=timeout_s,
            sleep=sleep,
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "safe_dispatch_event failed (event=%s tenant=%s): %s",
            event,
            tenant_id,
            exc,
        )
        return []
