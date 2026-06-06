"""Tests for the Reports Service — scheduled reports CRUD + run-now.

These tests build a minimal FastAPI app that hosts the ``reports_service``
router with an isolated in-memory store. A JWT is minted with the shared
``create_access_token`` helper and forwarded as a Bearer token so the
``require_tenant_id`` dependency can decode the tenant claim.
"""
from __future__ import annotations

import os
import sys

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.config import Settings  # noqa: E402
from shared.core.security import create_access_token  # noqa: E402


def _make_token(tenant_id: str, sub: str = "user", role: str = "recruiter") -> str:
    return create_access_token({
        "sub": sub,
        "email": f"{sub}@{tenant_id}.test",
        "role": role,
        "tenant_id": tenant_id,
    })


def _auth(tenant_id: str, sub: str = "user", role: str = "recruiter") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


@pytest_asyncio.fixture
async def reports_client():
    """Build a FastAPI app that hosts the reports router with a clean store."""
    from apps.reports_service import main as svc

    svc._reset_store()

    app = FastAPI()
    app.include_router(svc.router, prefix="/api/v1/reports")

    app.dependency_overrides[Settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    svc._reset_store()


def _payload(**overrides) -> dict:
    base = {
        "name": "Weekly Candidate Report",
        "kind": "candidates",
        "frequency": "weekly",
        "format": "csv",
        "recipients": ["lead@example.com"],
        "params": {"status": "all"},
        "enabled": True,
        "description": "All candidates updated this week",
    }
    base.update(overrides)
    return base


# ── Schedule + lifecycle ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_schedule_report_returns_201_with_id(reports_client: AsyncClient):
    resp = await reports_client.post(
        "/api/v1/reports/schedule",
        json=_payload(),
        headers=_auth("tenant-A"),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["id"].startswith("rpt_")
    assert body["tenant_id"] == "tenant-A"
    assert body["name"] == "Weekly Candidate Report"
    assert body["kind"] == "candidates"
    assert body["frequency"] == "weekly"
    assert body["format"] == "csv"
    assert body["enabled"] is True
    assert body["status"] in {"active", "paused"}
    assert body["created_at"]
    assert body["updated_at"]


@pytest.mark.asyncio
async def test_list_scheduled_reports_is_tenant_scoped(reports_client: AsyncClient):
    # Two schedules for tenant-A
    for i in range(2):
        r = await reports_client.post(
            "/api/v1/reports/schedule",
            json=_payload(name=f"Report {i}"),
            headers=_auth("tenant-A"),
        )
        assert r.status_code == 201
    # One schedule for tenant-B
    r = await reports_client.post(
        "/api/v1/reports/schedule",
        json=_payload(name="Tenant B report"),
        headers=_auth("tenant-B"),
    )
    assert r.status_code == 201

    # tenant-A sees only its own two
    resp = await reports_client.get(
        "/api/v1/reports/scheduled", headers=_auth("tenant-A")
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert all(item["tenant_id"] == "tenant-A" for item in body["data"])
    names = {item["name"] for item in body["data"]}
    assert names == {"Report 0", "Report 1"}

    # tenant-B sees only its one
    resp_b = await reports_client.get(
        "/api/v1/reports/scheduled", headers=_auth("tenant-B")
    )
    assert resp_b.status_code == 200
    body_b = resp_b.json()
    assert body_b["total"] == 1
    assert body_b["data"][0]["tenant_id"] == "tenant-B"


@pytest.mark.asyncio
async def test_get_single_scheduled_report(reports_client: AsyncClient):
    created = await reports_client.post(
        "/api/v1/reports/schedule",
        json=_payload(),
        headers=_auth("tenant-A"),
    )
    rid = created.json()["id"]

    resp = await reports_client.get(
        f"/api/v1/reports/scheduled/{rid}", headers=_auth("tenant-A")
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == rid
    assert body["name"] == "Weekly Candidate Report"

    # Missing tenant context → 401 (or 404 depending on auth). Either is acceptable
    # for "not visible"; we additionally check cross-tenant isolation.
    cross = await reports_client.get(
        f"/api/v1/reports/scheduled/{rid}", headers=_auth("tenant-B")
    )
    assert cross.status_code == 404

    missing = await reports_client.get(
        "/api/v1/reports/scheduled/rpt_doesnotexist", headers=_auth("tenant-A")
    )
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_update_scheduled_report(reports_client: AsyncClient):
    created = await reports_client.post(
        "/api/v1/reports/schedule",
        json=_payload(),
        headers=_auth("tenant-A"),
    )
    rid = created.json()["id"]
    original_updated_at = created.json()["updated_at"]

    resp = await reports_client.put(
        f"/api/v1/reports/scheduled/{rid}",
        json={
            "name": "Renamed Report",
            "frequency": "daily",
            "format": "pdf",
            "enabled": False,
            "recipients": ["new@example.com"],
        },
        headers=_auth("tenant-A"),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Renamed Report"
    assert body["frequency"] == "daily"
    assert body["format"] == "pdf"
    assert body["enabled"] is False
    assert body["status"] == "paused"
    assert body["recipients"] == ["new@example.com"]
    assert body["updated_at"] >= original_updated_at


@pytest.mark.asyncio
async def test_run_scheduled_report_immediately(reports_client: AsyncClient):
    created = await reports_client.post(
        "/api/v1/reports/schedule",
        json=_payload(),
        headers=_auth("tenant-A"),
    )
    rid = created.json()["id"]
    assert created.json()["run_count"] == 0
    assert created.json()["last_run_at"] is None

    resp = await reports_client.post(
        f"/api/v1/reports/scheduled/{rid}/run", headers=_auth("tenant-A")
    )
    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert body["id"] == rid
    assert body["status"] == "running"
    assert body["run_id"].startswith("run_")
    assert body["started_at"]
    assert "triggered" in body["message"].lower()

    # The underlying record should have been updated too.
    refetched = await reports_client.get(
        f"/api/v1/reports/scheduled/{rid}", headers=_auth("tenant-A")
    )
    assert refetched.json()["run_count"] == 1
    assert refetched.json()["last_run_at"] is not None
    assert refetched.json()["status"] == "running"


@pytest.mark.asyncio
async def test_cancel_scheduled_report(reports_client: AsyncClient):
    created = await reports_client.post(
        "/api/v1/reports/schedule",
        json=_payload(),
        headers=_auth("tenant-A"),
    )
    rid = created.json()["id"]

    resp = await reports_client.delete(
        f"/api/v1/reports/scheduled/{rid}", headers=_auth("tenant-A")
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "cancelled"
    assert body["enabled"] is False

    # After cancelling, a run-now should be rejected.
    run_resp = await reports_client.post(
        f"/api/v1/reports/scheduled/{rid}/run", headers=_auth("tenant-A")
    )
    assert run_resp.status_code == 409

    # Cancelled reports should still appear in the list.
    listing = await reports_client.get(
        "/api/v1/reports/scheduled", headers=_auth("tenant-A")
    )
    assert listing.json()["total"] == 1
    assert listing.json()["data"][0]["status"] == "cancelled"


@pytest.mark.asyncio
async def test_list_filters_by_kind_and_enabled(reports_client: AsyncClient):
    await reports_client.post(
        "/api/v1/reports/schedule",
        json=_payload(name="active candidates", kind="candidates", enabled=True),
        headers=_auth("tenant-A"),
    )
    await reports_client.post(
        "/api/v1/reports/schedule",
        json=_payload(name="paused jobs", kind="jobs", enabled=False),
        headers=_auth("tenant-A"),
    )

    resp_kind = await reports_client.get(
        "/api/v1/reports/scheduled?kind=candidates", headers=_auth("tenant-A")
    )
    assert resp_kind.status_code == 200
    body_kind = resp_kind.json()
    assert body_kind["total"] == 1
    assert body_kind["data"][0]["kind"] == "candidates"

    resp_enabled = await reports_client.get(
        "/api/v1/reports/scheduled?enabled=true", headers=_auth("tenant-A")
    )
    body_enabled = resp_enabled.json()
    assert body_enabled["total"] == 1
    assert body_enabled["data"][0]["enabled"] is True
