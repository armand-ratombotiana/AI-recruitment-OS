"""Integrations Service — Slack and Microsoft Teams chat integration.

* One webhook URL per provider per tenant.
* Admin-only writes, tenant-scoped reads.
* A test endpoint that posts a real message through the configured
  webhook and records the outcome.
* The webhook URL is treated as a secret — the GET endpoint never
  returns it in clear, only a masked representation.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import require_admin, require_tenant_id
from shared.core.database import get_db_dependency
from shared.core.models.integration import (
    SLACK,
    SUPPORTED_PROVIDERS,
    TEAMS,
    IntegrationConfig,
)
from shared.integrations import slack, teams


# ── Constants ─────────────────────────────────────────────────────────────────


DEFAULT_TIMEOUT_S = 10.0


# ── Test seam ─────────────────────────────────────────────────────────────────

# Tests may set this module attribute to an :class:`httpx.MockTransport`
# to intercept outbound HTTP calls made by the test endpoint.  In
# production this stays ``None`` and the endpoint makes a real request.
_test_transport: httpx.MockTransport | None = None


def _build_http_client() -> httpx.AsyncClient:
    if _test_transport is not None:
        return httpx.AsyncClient(transport=_test_transport, timeout=DEFAULT_TIMEOUT_S)
    return httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_S)


# ── Schemas ───────────────────────────────────────────────────────────────────


class IntegrationConfigCreate(BaseModel):
    webhook_url: HttpUrl
    channel_label: Optional[str] = Field(None, max_length=200)
    enabled: bool = True


class IntegrationConfigRead(BaseModel):
    id: str
    tenant_id: str
    provider: str
    channel_label: Optional[str] = None
    enabled: bool
    last_tested_at: Optional[datetime] = None
    last_test_status: Optional[str] = None
    last_test_status_code: Optional[int] = None
    last_test_error: Optional[str] = None
    webhook_url_masked: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IntegrationTestResponse(BaseModel):
    delivered: bool
    status_code: Optional[int] = None
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "integrations"


# ── Helpers ───────────────────────────────────────────────────────────────────


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _mask_url(url: str) -> str:
    """Mask the secret portion of a webhook URL.

    Slack:   ``https://hooks.slack.com/services/T0/B0/SECRET``
    Teams:   ``https://outlook.office.com/webhook/<id>/IncomingWebhook/<id>/<SECRET>``

    We keep the scheme + host + first two path segments and replace every
    subsequent segment with ``***``.  This is enough to identify the
    endpoint while not leaking the shared secret.
    """
    if not url:
        return ""
    if "://" not in url:
        return "***"
    scheme, rest = url.split("://", 1)
    parts = rest.split("/", 1)
    host = parts[0]
    path = parts[1] if len(parts) > 1 else ""
    segments = [s for s in path.split("/") if s]
    if not segments:
        return f"{scheme}://{host}/***"
    visible = segments[:2]
    hidden = ["***"] * max(0, len(segments) - 2)
    return f"{scheme}://{host}/" + "/".join(visible + hidden)


def _to_read(cfg: IntegrationConfig) -> IntegrationConfigRead:
    return IntegrationConfigRead(
        id=cfg.id,
        tenant_id=cfg.tenant_id,
        provider=cfg.provider,
        channel_label=cfg.channel_label,
        enabled=cfg.enabled,
        last_tested_at=cfg.last_tested_at,
        last_test_status=cfg.last_test_status,
        last_test_status_code=cfg.last_test_status_code,
        last_test_error=cfg.last_test_error,
        webhook_url_masked=_mask_url(cfg.webhook_url),
        created_at=cfg.created_at,
        updated_at=cfg.updated_at,
    )


async def _get_config(
    db: AsyncSession, tenant_id: str, provider: str
) -> Optional[IntegrationConfig]:
    row = (
        await db.execute(
            select(IntegrationConfig).where(
                IntegrationConfig.tenant_id == tenant_id,
                IntegrationConfig.provider == provider,
            )
        )
    ).scalar_one_or_none()
    return row


async def _send_test_payload(
    webhook_url: str, payload: dict[str, Any]
) -> tuple[bool, Optional[int], Optional[str]]:
    """POST ``payload`` to ``webhook_url`` and return (success, code, error)."""
    client = _build_http_client()
    try:
        resp = await client.post(
            webhook_url,
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        ok = 200 <= resp.status_code < 300
        return ok, resp.status_code, None if ok else f"non-2xx: {resp.status_code}"
    except httpx.HTTPError as exc:
        return False, None, f"{type(exc).__name__}: {exc}"
    finally:
        await client.aclose()


# ── Router ────────────────────────────────────────────────────────────────────


router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Integrations"])
async def health() -> HealthResponse:
    return HealthResponse()


@router.get("/providers", tags=["Integrations"], summary="List supported providers")
async def list_providers() -> dict[str, Any]:
    return {"providers": list(SUPPORTED_PROVIDERS)}


# ── Slack ─────────────────────────────────────────────────────────────────────


@router.get(
    "/slack",
    response_model=IntegrationConfigRead,
    tags=["Integrations"],
    summary="Get the Slack integration configuration for this tenant",
)
async def get_slack_config(
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> IntegrationConfigRead:
    cfg = await _get_config(db, tenant_id, SLACK)
    if cfg is None:
        raise HTTPException(status_code=404, detail="Slack integration not configured")
    return _to_read(cfg)


@router.post(
    "/slack",
    response_model=IntegrationConfigRead,
    tags=["Integrations"],
    status_code=status.HTTP_200_OK,
    summary="Configure (or replace) the Slack webhook (admin only)",
)
async def configure_slack(
    data: IntegrationConfigCreate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
) -> IntegrationConfigRead:
    cfg = await _get_config(db, tenant_id, SLACK)
    if cfg is None:
        cfg = IntegrationConfig(
            tenant_id=tenant_id,
            provider=SLACK,
            webhook_url=str(data.webhook_url),
            channel_label=data.channel_label,
            enabled=data.enabled,
        )
        db.add(cfg)
    else:
        cfg.webhook_url = str(data.webhook_url)
        cfg.channel_label = data.channel_label
        cfg.enabled = data.enabled
        cfg.updated_at = _utcnow()
    await db.commit()
    await db.refresh(cfg)
    return _to_read(cfg)


@router.post(
    "/slack/test",
    response_model=IntegrationTestResponse,
    tags=["Integrations"],
    summary="Send a test message to the configured Slack webhook (admin only)",
)
async def test_slack(
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
) -> IntegrationTestResponse:
    cfg = await _get_config(db, tenant_id, SLACK)
    if cfg is None:
        raise HTTPException(status_code=404, detail="Slack integration not configured")
    if not cfg.enabled:
        raise HTTPException(status_code=409, detail="Slack integration is disabled")

    test_candidate = {
        "id": "test",
        "full_name": "AI-ROS Test",
        "email": "test@airos.io",
        "status": "new",
        "location": "—",
        "source": "test",
    }
    blocks = slack.format_candidate_notification(test_candidate, "candidate.created")
    payload = {"text": "AI-ROS Slack integration test", "blocks": blocks}

    ok, code, err = await _send_test_payload(cfg.webhook_url, payload)

    cfg.last_tested_at = _utcnow()
    cfg.last_test_status = "success" if ok else "failed"
    cfg.last_test_status_code = code
    cfg.last_test_error = err
    cfg.updated_at = _utcnow()
    await db.commit()

    return IntegrationTestResponse(delivered=ok, status_code=code, error=err)


@router.delete(
    "/slack",
    tags=["Integrations"],
    summary="Remove the Slack integration (admin only)",
)
async def delete_slack(
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
) -> dict[str, Any]:
    cfg = await _get_config(db, tenant_id, SLACK)
    if cfg is None:
        raise HTTPException(status_code=404, detail="Slack integration not configured")
    cfg_id = cfg.id
    await db.delete(cfg)
    await db.commit()
    return {"id": cfg_id, "deleted": True, "provider": SLACK}


# ── Teams ─────────────────────────────────────────────────────────────────────


@router.get(
    "/teams",
    response_model=IntegrationConfigRead,
    tags=["Integrations"],
    summary="Get the Teams integration configuration for this tenant",
)
async def get_teams_config(
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> IntegrationConfigRead:
    cfg = await _get_config(db, tenant_id, TEAMS)
    if cfg is None:
        raise HTTPException(status_code=404, detail="Teams integration not configured")
    return _to_read(cfg)


@router.post(
    "/teams",
    response_model=IntegrationConfigRead,
    tags=["Integrations"],
    status_code=status.HTTP_200_OK,
    summary="Configure (or replace) the Teams webhook (admin only)",
)
async def configure_teams(
    data: IntegrationConfigCreate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
) -> IntegrationConfigRead:
    cfg = await _get_config(db, tenant_id, TEAMS)
    if cfg is None:
        cfg = IntegrationConfig(
            tenant_id=tenant_id,
            provider=TEAMS,
            webhook_url=str(data.webhook_url),
            channel_label=data.channel_label,
            enabled=data.enabled,
        )
        db.add(cfg)
    else:
        cfg.webhook_url = str(data.webhook_url)
        cfg.channel_label = data.channel_label
        cfg.enabled = data.enabled
        cfg.updated_at = _utcnow()
    await db.commit()
    await db.refresh(cfg)
    return _to_read(cfg)


@router.post(
    "/teams/test",
    response_model=IntegrationTestResponse,
    tags=["Integrations"],
    summary="Send a test message to the configured Teams webhook (admin only)",
)
async def test_teams(
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
) -> IntegrationTestResponse:
    cfg = await _get_config(db, tenant_id, TEAMS)
    if cfg is None:
        raise HTTPException(status_code=404, detail="Teams integration not configured")
    if not cfg.enabled:
        raise HTTPException(status_code=409, detail="Teams integration is disabled")

    test_candidate = {
        "id": "test",
        "full_name": "AI-ROS Test",
        "email": "test@airos.io",
        "status": "new",
        "location": "—",
        "source": "test",
    }
    card = teams.format_candidate_card(test_candidate, "candidate.created")
    payload = {**card, "text": "AI-ROS Teams integration test"}

    ok, code, err = await _send_test_payload(cfg.webhook_url, payload)

    cfg.last_tested_at = _utcnow()
    cfg.last_test_status = "success" if ok else "failed"
    cfg.last_test_status_code = code
    cfg.last_test_error = err
    cfg.updated_at = _utcnow()
    await db.commit()

    return IntegrationTestResponse(delivered=ok, status_code=code, error=err)


@router.delete(
    "/teams",
    tags=["Integrations"],
    summary="Remove the Teams integration (admin only)",
)
async def delete_teams(
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
) -> dict[str, Any]:
    cfg = await _get_config(db, tenant_id, TEAMS)
    if cfg is None:
        raise HTTPException(status_code=404, detail="Teams integration not configured")
    cfg_id = cfg.id
    await db.delete(cfg)
    await db.commit()
    return {"id": cfg_id, "deleted": True, "provider": TEAMS}
