"""Integrations service tests — Slack and Microsoft Teams.

Covers the full feature surface of the new :mod:`apps.integrations_service`
package, the :mod:`shared.integrations.slack` and
:mod:`shared.integrations.teams` helpers, and the
:class:`shared.core.models.integration.IntegrationConfig` model:

* Slack/Teams message formatting (Block Kit + MessageCard).
* Public send functions return the right success/failure bool.
* CRUD persistence for the per-tenant config (real SQLite).
* Tenant isolation: a tenant cannot see or mutate another tenant's config.
* Auth & RBAC: unauthenticated → 401, non-admin → 403, admin → 200.
* Test endpoints: outbound HTTP is captured, success/failure recorded.
* The webhook URL is never leaked in API responses (always masked).
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Callable, Optional
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, select

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.models.integration import (
    SLACK,
    SUPPORTED_PROVIDERS,
    TEAMS,
    IntegrationConfig,
)
from shared.core.security import create_access_token
from shared.integrations import slack, teams
from shared.integrations.slack import (
    format_candidate_notification,
    format_interview_notification,
    send_slack_message,
)
from shared.integrations.teams import format_candidate_card, send_teams_message


# ── Token helpers ─────────────────────────────────────────────────────────────


def _make_token(tenant_id: str, sub: str = "user", role: str = "admin") -> str:
    return create_access_token({
        "sub": sub,
        "email": f"{sub}@{tenant_id}.test",
        "role": role,
        "tenant_id": tenant_id,
    })


def _auth(tenant_id: str, sub: str = "user", role: str = "admin") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


# ── DB / app fixtures ─────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db_override(engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    def _install(app: FastAPI) -> None:
        async def _override():
            async with factory() as s:
                try:
                    yield s
                    await s.commit()
                except Exception:
                    await s.rollback()
                    raise

        app.dependency_overrides[get_db_dependency] = _override
        app.dependency_overrides[Settings] = lambda: Settings(
            SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
            ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
            DATABASE_URL="sqlite+aiosqlite:///:memory:",
            DEBUG=False,
        )

    return _install


@pytest_asyncio.fixture
async def integrations_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    from apps.integrations_service import main as ism
    from apps.integrations_service.main import router

    # Make sure no transport from a previous test bleeds in.
    ism._test_transport = None
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/integrations")
    db_override(app)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    ism._test_transport = None


@pytest_asyncio.fixture
async def db_session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ── HTTP transport capture ────────────────────────────────────────────────────


class _RecordedRequest:
    __slots__ = ("method", "url", "headers", "body")

    def __init__(self, method: str, url: str, headers: dict[str, str], body: bytes) -> None:
        self.method = method
        self.url = url
        self.headers = headers
        self.body = body


class _MockHttpRecorder:
    """Records every request the test endpoint makes and returns 200 by
    default.  Override ``handler`` to simulate failures."""

    def __init__(self) -> None:
        self.requests: list[_RecordedRequest] = []
        self.handler: Callable[[_RecordedRequest], httpx.Response] = self._default_handler

    def _default_handler(self, req: _RecordedRequest) -> httpx.Response:
        return httpx.Response(200, json={"ok": True})

    def build_transport(self) -> httpx.MockTransport:
        recorder = self

        def handle(request: httpx.Request) -> httpx.Response:
            rec = _RecordedRequest(
                method=request.method,
                url=str(request.url),
                headers=dict(request.headers),
                body=request.content,
            )
            recorder.requests.append(rec)
            return recorder.handler(rec)

        return httpx.MockTransport(handle)


# ── 1. Slack formatters ───────────────────────────────────────────────────────


def test_format_candidate_notification_returns_blocks():
    candidate = {
        "id": "c-1",
        "full_name": "Jane Doe",
        "email": "jane@example.com",
        "status": "interviewing",
        "location": "Paris",
        "source": "linkedin",
    }
    blocks = format_candidate_notification(candidate, "candidate.created")
    assert isinstance(blocks, list)
    assert len(blocks) >= 2
    # First block is the header with the candidate's name.
    header = blocks[0]
    assert header["type"] == "header"
    assert "Jane Doe" in header["text"]["text"]
    # Second block is the fields section.
    fields = blocks[1]
    assert fields["type"] == "section"
    field_texts = " ".join(f["text"] for f in fields["fields"])
    assert "interviewing" in field_texts
    assert "jane@example.com" in field_texts
    assert "Paris" in field_texts
    assert "linkedin" in field_texts


def test_format_candidate_notification_handles_dict_and_object():
    """The formatter must accept both dicts and attribute-bearing objects."""
    blocks = format_candidate_notification(
        {"id": "1", "full_name": "Dict Jane", "email": "d@x"}, "candidate.created"
    )
    assert "Dict Jane" in blocks[0]["text"]["text"]

    from types import SimpleNamespace

    blocks2 = format_candidate_notification(
        SimpleNamespace(id="2", full_name="Obj Jane", email="o@x", status="new"),
        "candidate.created",
    )
    assert "Obj Jane" in blocks2[0]["text"]["text"]


def test_format_candidate_notification_uses_event_emoji():
    blocks = format_candidate_notification(
        {"full_name": "X"}, "candidate.hired"
    )
    assert ":tada:" in blocks[0]["text"]["text"]


def test_format_interview_notification_returns_blocks():
    from types import SimpleNamespace

    candidate = SimpleNamespace(id="c-1", full_name="Bob", email="b@x")
    interview = SimpleNamespace(
        id="i-1",
        interview_type="technical",
        status="scheduled",
        scheduled_at=datetime(2030, 1, 1, 14, 30, tzinfo=timezone.utc),
        duration_minutes=90,
        is_ai_interview=False,
    )
    blocks = format_interview_notification(interview, candidate)
    assert isinstance(blocks, list)
    assert len(blocks) >= 2
    assert "Bob" in blocks[0]["text"]["text"]
    field_texts = " ".join(f["text"] for f in blocks[1]["fields"])
    assert "technical" in field_texts
    assert "scheduled" in field_texts
    assert "90 min" in field_texts
    # AI mode rendered in its own section.
    assert any("Human" in b.get("text", {}).get("text", "") for b in blocks)


# ── 2. Teams formatters ───────────────────────────────────────────────────────


def test_format_candidate_card_returns_messagecard():
    candidate = {
        "id": "c-1",
        "full_name": "Jane Doe",
        "email": "jane@example.com",
        "status": "offer",
        "location": "Remote",
        "source": "referral",
    }
    card = format_candidate_card(candidate, "candidate.hired")
    assert card["@type"] == "MessageCard"
    assert card["@context"] == "https://schema.org/extensions"
    assert "Jane Doe" in card["title"]
    assert "candidate.hired" in card["sections"][0]["activitySubtitle"]
    # Facts include status, email, location, source.
    fact_names = {f["name"] for f in card["sections"][0]["facts"]}
    assert fact_names == {"Status", "Email", "Location", "Source"}
    fact_values = {f["value"] for f in card["sections"][0]["facts"]}
    assert "offer" in fact_values
    assert "jane@example.com" in fact_values
    assert "Remote" in fact_values
    assert "referral" in fact_values


def test_format_candidate_card_color_per_event():
    card_hired = format_candidate_card({"full_name": "X"}, "candidate.hired")
    card_rejected = format_candidate_card({"full_name": "X"}, "candidate.rejected")
    assert card_hired["themeColor"] == "107C10"   # green
    assert card_rejected["themeColor"] == "D13438"  # red


# ── 3. Public send functions ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_send_slack_message_success():
    captured: list[_RecordedRequest] = []

    def handle(req: httpx.Request) -> httpx.Response:
        captured.append(_RecordedRequest(
            method=req.method, url=str(req.url),
            headers=dict(req.headers), body=req.content,
        ))
        return httpx.Response(200, text="ok")

    transport = httpx.MockTransport(handle)
    orig_init = httpx.AsyncClient.__init__

    def patched_init(self, *args, **kwargs):
        kwargs["transport"] = transport
        return orig_init(self, *args, **kwargs)

    httpx.AsyncClient.__init__ = patched_init  # type: ignore[assignment]
    try:
        ok = await send_slack_message(
            "https://hooks.slack.com/services/T0/B0/SECRET",
            "hello",
            blocks=[{"type": "section", "text": {"type": "mrkdwn", "text": "world"}}],
        )
    finally:
        httpx.AsyncClient.__init__ = orig_init  # type: ignore[assignment]

    assert ok is True
    assert len(captured) == 1
    body = captured[0].body.decode("utf-8")
    assert "hello" in body
    assert "world" in body


@pytest.mark.asyncio
async def test_send_slack_message_non_2xx_returns_false():
    def handle(req: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="nope")

    transport = httpx.MockTransport(handle)
    orig_init = httpx.AsyncClient.__init__

    def patched_init(self, *args, **kwargs):
        kwargs["transport"] = transport
        return orig_init(self, *args, **kwargs)

    httpx.AsyncClient.__init__ = patched_init  # type: ignore[assignment]
    try:
        ok = await send_slack_message("https://hooks.slack.com/x", "msg")
    finally:
        httpx.AsyncClient.__init__ = orig_init  # type: ignore[assignment]
    assert ok is False


@pytest.mark.asyncio
async def test_send_teams_message_success():
    captured: list[_RecordedRequest] = []

    def handle(req: httpx.Request) -> httpx.Response:
        captured.append(_RecordedRequest(
            method=req.method, url=str(req.url),
            headers=dict(req.headers), body=req.content,
        ))
        return httpx.Response(200, text="1")

    transport = httpx.MockTransport(handle)
    orig_init = httpx.AsyncClient.__init__

    def patched_init(self, *args, **kwargs):
        kwargs["transport"] = transport
        return orig_init(self, *args, **kwargs)

    httpx.AsyncClient.__init__ = patched_init  # type: ignore[assignment]
    try:
        card = format_candidate_card({"full_name": "Jane"}, "candidate.created")
        ok = await send_teams_message("https://outlook.office.com/webhook/x", "hi", card=card)
    finally:
        httpx.AsyncClient.__init__ = orig_init  # type: ignore[assignment]

    assert ok is True
    assert len(captured) == 1
    body = captured[0].body.decode("utf-8")
    assert "Jane" in body
    assert "hi" in body
    assert "@type" in body  # MessageCard marker present


@pytest.mark.asyncio
async def test_send_teams_message_transport_error_returns_false():
    def handle(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("dns")

    transport = httpx.MockTransport(handle)
    orig_init = httpx.AsyncClient.__init__

    def patched_init(self, *args, **kwargs):
        kwargs["transport"] = transport
        return orig_init(self, *args, **kwargs)

    httpx.AsyncClient.__init__ = patched_init  # type: ignore[assignment]
    try:
        ok = await send_teams_message("https://x", "msg")
    finally:
        httpx.AsyncClient.__init__ = orig_init  # type: ignore[assignment]
    assert ok is False


# ── 4. Slack config CRUD ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_configure_slack_creates_config(integrations_client, db_session_factory):
    r = await integrations_client.post(
        "/api/v1/integrations/slack",
        json={
            "webhook_url": "https://hooks.slack.com/services/T0/B0/SECRET",
            "channel_label": "#recruiting",
            "enabled": True,
        },
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provider"] == "slack"
    assert body["channel_label"] == "#recruiting"
    assert body["enabled"] is True
    # The webhook URL is masked; the secret is never returned in clear.
    assert "SECRET" not in body["webhook_url_masked"]
    assert "***" in body["webhook_url_masked"]
    assert body["webhook_url_masked"].startswith("https://hooks.slack.com/")

    # Persisted in the DB.
    async with db_session_factory() as session:
        result = await session.execute(
            select(IntegrationConfig).where(
                IntegrationConfig.tenant_id == "tenant-A",
                IntegrationConfig.provider == SLACK,
            )
        )
        row = result.scalar_one()
    assert row.channel_label == "#recruiting"
    # The DB still has the real URL (we need it to send messages).
    assert row.webhook_url == "https://hooks.slack.com/services/T0/B0/SECRET"


@pytest.mark.asyncio
async def test_configure_slack_updates_existing(integrations_client, db_session_factory):
    headers = _auth("tenant-A", "adminA", "admin")
    first = await integrations_client.post(
        "/api/v1/integrations/slack",
        json={"webhook_url": "https://hooks.slack.com/services/T0/B0/FIRST"},
        headers=headers,
    )
    first_id = first.json()["id"]

    second = await integrations_client.post(
        "/api/v1/integrations/slack",
        json={
            "webhook_url": "https://hooks.slack.com/services/T0/B0/SECOND",
            "enabled": False,
        },
        headers=headers,
    )
    assert second.status_code == 200
    assert second.json()["id"] == first_id  # same row, updated
    assert second.json()["enabled"] is False

    # Only one row exists for this tenant.
    async with db_session_factory() as session:
        result = await session.execute(
            select(IntegrationConfig).where(IntegrationConfig.tenant_id == "tenant-A")
        )
        rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].webhook_url.endswith("SECOND")


@pytest.mark.asyncio
async def test_get_slack_config_when_unconfigured_returns_404(integrations_client):
    r = await integrations_client.get(
        "/api/v1/integrations/slack", headers=_auth("tenant-A", "adminA", "admin")
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_slack_removes_config(integrations_client, db_session_factory):
    headers = _auth("tenant-A", "adminA", "admin")
    await integrations_client.post(
        "/api/v1/integrations/slack",
        json={"webhook_url": "https://hooks.slack.com/services/T0/B0/SECRET"},
        headers=headers,
    )

    r = await integrations_client.delete(
        "/api/v1/integrations/slack", headers=headers
    )
    assert r.status_code == 200
    assert r.json()["deleted"] is True
    assert r.json()["provider"] == "slack"

    async with db_session_factory() as session:
        result = await session.execute(
            select(IntegrationConfig).where(IntegrationConfig.tenant_id == "tenant-A")
        )
        assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_delete_slack_when_unconfigured_returns_404(integrations_client):
    r = await integrations_client.delete(
        "/api/v1/integrations/slack", headers=_auth("tenant-A", "adminA", "admin")
    )
    assert r.status_code == 404


# ── 5. Teams config CRUD ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_configure_teams_creates_config(integrations_client, db_session_factory):
    r = await integrations_client.post(
        "/api/v1/integrations/teams",
        json={
            "webhook_url": "https://outlook.office.com/webhook/abc/IncomingWebhook/xyz/SECRET",
            "channel_label": "Recruiting",
        },
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provider"] == "teams"
    assert body["channel_label"] == "Recruiting"
    # Mask: the secret tail must be replaced by ***.
    assert "SECRET" not in body["webhook_url_masked"]
    assert "***" in body["webhook_url_masked"]
    assert body["webhook_url_masked"].startswith("https://outlook.office.com/")

    async with db_session_factory() as session:
        result = await session.execute(
            select(IntegrationConfig).where(
                IntegrationConfig.tenant_id == "tenant-A",
                IntegrationConfig.provider == TEAMS,
            )
        )
        row = result.scalar_one()
    assert row.webhook_url.endswith("SECRET")


@pytest.mark.asyncio
async def test_get_teams_config_returns_config(integrations_client):
    headers = _auth("tenant-A", "adminA", "admin")
    await integrations_client.post(
        "/api/v1/integrations/teams",
        json={"webhook_url": "https://outlook.office.com/webhook/x/y/SECRET"},
        headers=headers,
    )
    r = await integrations_client.get("/api/v1/integrations/teams", headers=headers)
    assert r.status_code == 200
    assert r.json()["provider"] == "teams"


@pytest.mark.asyncio
async def test_delete_teams_removes_config(integrations_client, db_session_factory):
    headers = _auth("tenant-A", "adminA", "admin")
    await integrations_client.post(
        "/api/v1/integrations/teams",
        json={"webhook_url": "https://outlook.office.com/webhook/x/y/SECRET"},
        headers=headers,
    )
    r = await integrations_client.delete("/api/v1/integrations/teams", headers=headers)
    assert r.status_code == 200
    async with db_session_factory() as session:
        result = await session.execute(
            select(IntegrationConfig).where(IntegrationConfig.tenant_id == "tenant-A")
        )
        assert result.scalar_one_or_none() is None


# ── 6. Test endpoints ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_slack_test_sends_message_and_records_success(
    integrations_client, db_session_factory
):
    headers = _auth("tenant-A", "adminA", "admin")
    await integrations_client.post(
        "/api/v1/integrations/slack",
        json={"webhook_url": "https://hooks.slack.com/services/T0/B0/SECRET"},
        headers=headers,
    )

    recorder = _MockHttpRecorder()
    from apps.integrations_service import main as ism
    ism._test_transport = recorder.build_transport()
    try:
        r = await integrations_client.post(
            "/api/v1/integrations/slack/test", headers=headers
        )
    finally:
        ism._test_transport = None

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["delivered"] is True
    assert body["status_code"] == 200
    assert body["error"] is None

    # The mock received exactly one POST.
    assert len(recorder.requests) == 1
    req = recorder.requests[0]
    assert req.method == "POST"
    assert req.url == "https://hooks.slack.com/services/T0/B0/SECRET"
    assert req.headers["content-type"] == "application/json"
    # The body contains the blocks the formatter produced.
    import json as _json
    sent = _json.loads(req.body.decode("utf-8"))
    assert "AI-ROS Slack integration test" in sent["text"]
    assert sent["blocks"][0]["type"] == "header"

    # The DB row reflects the successful delivery.
    async with db_session_factory() as session:
        result = await session.execute(
            select(IntegrationConfig).where(IntegrationConfig.tenant_id == "tenant-A")
        )
        row = result.scalar_one()
    assert row.last_test_status == "success"
    assert row.last_test_status_code == 200
    assert row.last_test_error is None
    assert row.last_tested_at is not None


@pytest.mark.asyncio
async def test_slack_test_records_failure_when_receiver_returns_500(
    integrations_client, db_session_factory
):
    headers = _auth("tenant-A", "adminA", "admin")
    await integrations_client.post(
        "/api/v1/integrations/slack",
        json={"webhook_url": "https://hooks.slack.com/services/T0/B0/SECRET"},
        headers=headers,
    )

    recorder = _MockHttpRecorder()
    recorder.handler = lambda req: httpx.Response(500, text="nope")
    from apps.integrations_service import main as ism
    ism._test_transport = recorder.build_transport()
    try:
        r = await integrations_client.post(
            "/api/v1/integrations/slack/test", headers=headers
        )
    finally:
        ism._test_transport = None

    assert r.status_code == 200
    body = r.json()
    assert body["delivered"] is False
    assert body["status_code"] == 500
    assert "non-2xx" in (body["error"] or "")

    async with db_session_factory() as session:
        row = (await session.execute(
            select(IntegrationConfig).where(IntegrationConfig.tenant_id == "tenant-A")
        )).scalar_one()
    assert row.last_test_status == "failed"
    assert row.last_test_status_code == 500


@pytest.mark.asyncio
async def test_teams_test_sends_message_and_records_success(integrations_client):
    headers = _auth("tenant-A", "adminA", "admin")
    await integrations_client.post(
        "/api/v1/integrations/teams",
        json={"webhook_url": "https://outlook.office.com/webhook/x/y/SECRET"},
        headers=headers,
    )

    recorder = _MockHttpRecorder()
    from apps.integrations_service import main as ism
    ism._test_transport = recorder.build_transport()
    try:
        r = await integrations_client.post(
            "/api/v1/integrations/teams/test", headers=headers
        )
    finally:
        ism._test_transport = None

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["delivered"] is True
    assert body["status_code"] == 200

    import json as _json
    sent = _json.loads(recorder.requests[0].body.decode("utf-8"))
    # Teams card fields present.
    assert sent["@type"] == "MessageCard"
    assert "AI-ROS Teams integration test" in sent["text"]
    assert "facts" in sent["sections"][0]


@pytest.mark.asyncio
async def test_teams_test_unconfigured_returns_404(integrations_client):
    r = await integrations_client.post(
        "/api/v1/integrations/teams/test",
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_slack_test_disabled_returns_409(integrations_client):
    headers = _auth("tenant-A", "adminA", "admin")
    await integrations_client.post(
        "/api/v1/integrations/slack",
        json={
            "webhook_url": "https://hooks.slack.com/services/T0/B0/SECRET",
            "enabled": False,
        },
        headers=headers,
    )
    r = await integrations_client.post(
        "/api/v1/integrations/slack/test", headers=headers
    )
    assert r.status_code == 409


# ── 7. Auth & RBAC ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unauthenticated_get_slack_returns_401(integrations_client):
    r = await integrations_client.get("/api/v1/integrations/slack")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_unauthenticated_configure_slack_returns_401(integrations_client):
    r = await integrations_client.post(
        "/api/v1/integrations/slack",
        json={"webhook_url": "https://hooks.slack.com/services/T0/B0/SECRET"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_unauthenticated_teams_returns_401(integrations_client):
    r = await integrations_client.get("/api/v1/integrations/teams")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_non_admin_cannot_configure_slack(integrations_client):
    r = await integrations_client.post(
        "/api/v1/integrations/slack",
        json={"webhook_url": "https://hooks.slack.com/services/T0/B0/SECRET"},
        headers=_auth("tenant-A", "viewer1", "viewer"),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_non_admin_cannot_configure_teams(integrations_client):
    r = await integrations_client.post(
        "/api/v1/integrations/teams",
        json={"webhook_url": "https://outlook.office.com/webhook/x/y/SECRET"},
        headers=_auth("tenant-A", "recruiter1", "member"),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_non_admin_cannot_test_or_delete(integrations_client):
    admin = _auth("tenant-A", "adminA", "admin")
    await integrations_client.post(
        "/api/v1/integrations/slack",
        json={"webhook_url": "https://hooks.slack.com/services/T0/B0/SECRET"},
        headers=admin,
    )
    viewer = _auth("tenant-A", "viewer1", "viewer")
    r_test = await integrations_client.post(
        "/api/v1/integrations/slack/test", headers=viewer
    )
    assert r_test.status_code == 403
    r_del = await integrations_client.delete(
        "/api/v1/integrations/slack", headers=viewer
    )
    assert r_del.status_code == 403


# ── 8. Tenant isolation ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_slack_get(integrations_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")
    create = await integrations_client.post(
        "/api/v1/integrations/slack",
        json={"webhook_url": "https://hooks.slack.com/services/T0/B0/SECRET"},
        headers=b,
    )
    b_id = create.json()["id"]
    cross = await integrations_client.get(f"/api/v1/integrations/slack", headers=a)
    assert cross.status_code == 404
    own = await integrations_client.get("/api/v1/integrations/slack", headers=b)
    assert own.status_code == 200
    assert own.json()["id"] == b_id


@pytest.mark.asyncio
async def test_tenant_isolation_slack_delete(integrations_client, db_session_factory):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")
    create = await integrations_client.post(
        "/api/v1/integrations/slack",
        json={"webhook_url": "https://hooks.slack.com/services/T0/B0/SECRET"},
        headers=b,
    )
    b_id = create.json()["id"]

    cross = await integrations_client.delete(
        "/api/v1/integrations/slack", headers=a
    )
    assert cross.status_code == 404

    # Tenant B's row still exists.
    async with db_session_factory() as session:
        row = (await session.execute(
            select(IntegrationConfig).where(IntegrationConfig.id == b_id)
        )).scalar_one_or_none()
    assert row is not None


@pytest.mark.asyncio
async def test_tenant_isolation_teams_get(integrations_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")
    await integrations_client.post(
        "/api/v1/integrations/teams",
        json={"webhook_url": "https://outlook.office.com/webhook/x/y/SECRET"},
        headers=b,
    )
    cross = await integrations_client.get("/api/v1/integrations/teams", headers=a)
    assert cross.status_code == 404
    own = await integrations_client.get("/api/v1/integrations/teams", headers=b)
    assert own.status_code == 200


@pytest.mark.asyncio
async def test_tenant_isolation_teams_test(integrations_client):
    """Tenant A cannot trigger a test for Tenant B's Teams webhook."""
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")
    await integrations_client.post(
        "/api/v1/integrations/teams",
        json={"webhook_url": "https://outlook.office.com/webhook/x/y/SECRET"},
        headers=b,
    )
    r = await integrations_client.post(
        "/api/v1/integrations/teams/test", headers=a
    )
    assert r.status_code == 404


# ── 9. URL masking ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_webhook_url_is_masked_in_slack_response(integrations_client):
    secret_url = "https://hooks.slack.com/services/T01234/B05678/SECRETXYZ"
    r = await integrations_client.post(
        "/api/v1/integrations/slack",
        json={"webhook_url": secret_url},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 200
    masked = r.json()["webhook_url_masked"]
    assert "SECRETXYZ" not in masked
    assert "T01234" in masked  # workspace visible
    assert "***" in masked


@pytest.mark.asyncio
async def test_webhook_url_is_masked_in_teams_response(integrations_client):
    secret_url = "https://outlook.office.com/webhook/abc-def-ghi/IncomingWebhook/jkl-mno-pqr/SECRETTAIL"
    r = await integrations_client.post(
        "/api/v1/integrations/teams",
        json={"webhook_url": secret_url},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 200
    masked = r.json()["webhook_url_masked"]
    assert "SECRETTAIL" not in masked
    assert "abc-def-ghi" in masked  # first two segments visible
    assert "***" in masked


# ── 10. Misc service endpoints ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health_endpoint(integrations_client):
    r = await integrations_client.get("/api/v1/integrations/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"
    assert r.json()["service"] == "integrations"


@pytest.mark.asyncio
async def test_providers_endpoint(integrations_client):
    r = await integrations_client.get("/api/v1/integrations/providers")
    assert r.status_code == 200
    providers = r.json()["providers"]
    assert "slack" in providers
    assert "teams" in providers
    assert set(providers) == set(SUPPORTED_PROVIDERS)


@pytest.mark.asyncio
async def test_invalid_webhook_url_rejected_by_pydantic(integrations_client):
    r = await integrations_client.post(
        "/api/v1/integrations/slack",
        json={"webhook_url": "not-a-url"},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_slack_and_teams_configs_coexist_per_tenant(integrations_client):
    """A tenant should be able to configure Slack and Teams independently."""
    headers = _auth("tenant-A", "adminA", "admin")
    s = await integrations_client.post(
        "/api/v1/integrations/slack",
        json={"webhook_url": "https://hooks.slack.com/services/T0/B0/SECRET"},
        headers=headers,
    )
    t = await integrations_client.post(
        "/api/v1/integrations/teams",
        json={"webhook_url": "https://outlook.office.com/webhook/x/y/SECRET"},
        headers=headers,
    )
    assert s.status_code == 200
    assert t.status_code == 200
    assert s.json()["id"] != t.json()["id"]

    g_s = await integrations_client.get("/api/v1/integrations/slack", headers=headers)
    g_t = await integrations_client.get("/api/v1/integrations/teams", headers=headers)
    assert g_s.json()["provider"] == "slack"
    assert g_t.json()["provider"] == "teams"
