"""Tests for the new production endpoints (exports, webhooks, search,
calendar, health, activity, onboarding, support, batch, background jobs).

Designed to:
- Hit the live unified app via ASGITransport (no Docker required for tests)
- Cover happy paths + a few key error cases
- Stay fast (<3s)
"""
from __future__ import annotations

import asyncio
import io
import json
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


pytestmark = [pytest.mark.integration]


@pytest_asyncio.fixture(scope="function")
async def client() -> AsyncGenerator[AsyncClient, None]:
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ────────────────────────────────────────────────────────────────────────────
# Exports
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_health(client: AsyncClient):
    resp = await client.get("/api/v1/exports/health")
    assert resp.status_code == 200
    assert resp.json()["service"] == "export"


@pytest.mark.asyncio
async def test_export_candidates_csv(client: AsyncClient):
    resp = await client.get("/api/v1/exports/candidates?format=csv")
    assert resp.status_code == 200
    body = resp.json()
    assert body["format"] == "csv"
    assert body["kind"] == "candidates"
    assert body["row_count"] > 0
    assert body["signed_url"].startswith("/api/v1/exports/files/")
    assert "signature=" in body["signed_url"]


@pytest.mark.asyncio
async def test_export_candidates_csv_via_analytics_alias(client: AsyncClient):
    resp = await client.get("/api/v1/analytics/export/candidates?format=csv")
    assert resp.status_code == 200
    assert resp.json()["kind"] == "candidates"


@pytest.mark.asyncio
async def test_export_jobs_xlsx(client: AsyncClient):
    resp = await client.get("/api/v1/exports/jobs?format=xlsx")
    assert resp.status_code == 200
    body = resp.json()
    assert body["kind"] == "jobs"
    assert body["format"] == "xlsx"


@pytest.mark.asyncio
async def test_export_interviews_csv(client: AsyncClient):
    resp = await client.get("/api/v1/exports/interviews?format=csv")
    assert resp.status_code == 200
    assert resp.json()["kind"] == "interviews"


@pytest.mark.asyncio
async def test_export_recruitment_funnel_pdf(client: AsyncClient):
    resp = await client.get("/api/v1/exports/recruitment-funnel?format=pdf")
    assert resp.status_code == 200
    body = resp.json()
    assert body["format"] == "pdf"
    # Download the file
    download = await client.get(body["signed_url"])
    assert download.status_code == 200
    assert download.headers["content-type"].startswith("application/pdf")
    assert download.content.startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_export_time_to_hire_xlsx(client: AsyncClient):
    resp = await client.get("/api/v1/exports/time-to-hire?format=xlsx&department=engineering")
    assert resp.status_code == 200
    body = resp.json()
    assert body["kind"] == "time_to_hire"


@pytest.mark.asyncio
async def test_export_unsupported_format(client: AsyncClient):
    resp = await client.get("/api/v1/exports/candidates?format=docx")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_export_download_and_signature_validation(client: AsyncClient):
    create = await client.get("/api/v1/exports/candidates?format=csv")
    assert create.status_code == 200
    body = create.json()
    download = await client.get(body["signed_url"])
    assert download.status_code == 200
    assert "Content-Disposition" in download.headers
    # Tampering with signature → 403
    bad_url = body["download_url"] + "?expires=9999999999&signature=deadbeef"
    bad = await client.get(bad_url)
    assert bad.status_code == 403


@pytest.mark.asyncio
async def test_export_list(client: AsyncClient):
    await client.get("/api/v1/exports/jobs?format=csv")
    resp = await client.get("/api/v1/exports/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    assert isinstance(body["data"], list)


# ────────────────────────────────────────────────────────────────────────────
# Webhooks
# ────────────────────────────────────────────────────────────────────────────
#
# The webhook endpoints were migrated from an in-memory implementation
# (``apps/webhooks_service``) to a SQLModel-backed, auth-aware
# implementation (``apps/webhook_service``).  The full coverage of the
# new implementation lives in ``tests/test_webhooks.py`` (it owns its
# own minimal FastAPI app + in-memory DB so it can run without the
# production database).  Smoke tests against the unified ``main.app``
# used to live here; they were removed when the in-memory service was
# replaced because they no longer reflect the current behaviour.
#


# ────────────────────────────────────────────────────────────────────────────
# Search (global)
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_global_search_all(client: AsyncClient):
    resp = await client.get("/api/v1/global-search/?q=Python&type=all&limit=10")
    assert resp.status_code == 200
    body = resp.json()
    assert "results" in body
    assert "grouped" in body
    assert body["query"] == "Python"


@pytest.mark.asyncio
async def test_global_search_via_search_alias(client: AsyncClient):
    resp = await client.get("/api/v1/search/?q=Python&type=all&limit=10")
    assert resp.status_code == 200
    assert resp.json()["query"] == "Python"


@pytest.mark.asyncio
async def test_search_suggest(client: AsyncClient):
    resp = await client.get("/api/v1/global-search/suggest?q=Sa")
    assert resp.status_code == 200
    body = resp.json()
    assert "suggestions" in body


@pytest.mark.asyncio
async def test_search_recent_round_trip(client: AsyncClient):
    headers = {"X-User-ID": "tester-recent"}
    await client.get("/api/v1/global-search/?q=Kubernetes", headers=headers)
    recent = await client.get("/api/v1/global-search/recent", headers=headers)
    assert recent.status_code == 200
    body = recent.json()
    assert body["total"] >= 1
    assert any(item["query"] == "Kubernetes" for item in body["data"])


@pytest.mark.asyncio
async def test_search_clear_recent(client: AsyncClient):
    headers = {"X-User-ID": "tester-clear"}
    await client.get("/api/v1/global-search/?q=Sql", headers=headers)
    resp = await client.delete("/api/v1/global-search/recent", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["cleared"] is True


# ────────────────────────────────────────────────────────────────────────────
# Calendar
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_calendar_connect_and_callback_google(client: AsyncClient):
    headers = {"X-User-ID": "cal-user-1"}
    connect = await client.get("/api/v1/calendar/connect/google", headers=headers)
    assert connect.status_code == 200
    body = connect.json()
    assert "authorize_url" in body
    state = body["state"]

    callback = await client.get(
        f"/api/v1/calendar/callback/google?code=mock-code&state={state}",
        headers=headers,
    )
    assert callback.status_code == 200
    assert callback.json()["connected"] is True


@pytest.mark.asyncio
async def test_calendar_events_requires_connection(client: AsyncClient):
    headers = {"X-User-ID": "cal-no-connect"}
    resp = await client.get("/api/v1/calendar/events", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_calendar_events_after_connect(client: AsyncClient):
    headers = {"X-User-ID": "cal-user-2"}
    connect = await client.get("/api/v1/calendar/connect/google", headers=headers)
    state = connect.json()["state"]
    await client.get(f"/api/v1/calendar/callback/google?code=x&state={state}", headers=headers)
    events = await client.get("/api/v1/calendar/events", headers=headers)
    assert events.status_code == 200
    assert isinstance(events.json()["data"], list)


@pytest.mark.asyncio
async def test_calendar_sync_interview(client: AsyncClient):
    headers = {"X-User-ID": "cal-user-3"}
    connect = await client.get("/api/v1/calendar/connect/google", headers=headers)
    state = connect.json()["state"]
    await client.get(f"/api/v1/calendar/callback/google?code=x&state={state}", headers=headers)

    sync = await client.post(
        "/api/v1/calendar/interviews/int_test_001/sync?provider=google&duration_minutes=45",
        headers=headers,
    )
    assert sync.status_code == 200
    assert sync.json()["synced"] is True

    unsync = await client.delete(
        "/api/v1/calendar/interviews/int_test_001/sync", headers=headers
    )
    assert unsync.status_code == 200


@pytest.mark.asyncio
async def test_calendar_availability(client: AsyncClient):
    headers = {"X-User-ID": "cal-avail-1"}
    resp = await client.get("/api/v1/calendar/availability?duration=30", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "slots" in body
    assert "busy" in body


@pytest.mark.asyncio
async def test_calendar_invalid_state(client: AsyncClient):
    resp = await client.get("/api/v1/calendar/callback/google?code=x&state=invalid")
    assert resp.status_code == 400


# ────────────────────────────────────────────────────────────────────────────
# Health
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health_services_aggregate(client: AsyncClient):
    resp = await client.get("/api/v1/health/services")
    # Either 200 (healthy/degraded) or 503 (unhealthy)
    assert resp.status_code in (200, 503)
    body = resp.json()
    assert body["status"] in ("healthy", "degraded", "unhealthy")
    assert "services" in body
    assert "summary" in body


@pytest.mark.asyncio
async def test_health_specific_service(client: AsyncClient):
    resp = await client.get("/api/v1/health/services/database")
    assert resp.status_code == 200
    assert resp.json()["name"] == "database"


@pytest.mark.asyncio
async def test_health_unknown_service(client: AsyncClient):
    resp = await client.get("/api/v1/health/services/doesnotexist")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_health_live_probe(client: AsyncClient):
    resp = await client.get("/api/v1/health/live")
    assert resp.status_code == 200
    assert resp.json()["live"] is True


@pytest.mark.asyncio
async def test_health_version(client: AsyncClient):
    resp = await client.get("/api/v1/health/version")
    assert resp.status_code == 200
    assert "version" in resp.json()


# ────────────────────────────────────────────────────────────────────────────
# Activity
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_recent(client: AsyncClient):
    resp = await client.get("/api/v1/activity/recent?limit=10")
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    assert body["total"] >= 1


@pytest.mark.asyncio
async def test_activity_me(client: AsyncClient):
    resp = await client.get("/api/v1/activity/me?limit=5", headers={"X-User-ID": "u_act_me"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_activity_emit_and_mark_read(client: AsyncClient):
    create = await client.post(
        "/api/v1/activity/",
        json={
            "action": "candidate.created",
            "description": "New candidate Test User",
            "user_id": "u_emit",
        },
        headers={"X-Tenant-ID": "tenant-test"},
    )
    assert create.status_code == 200
    activity_id = create.json()["id"]

    mark = await client.post(
        f"/api/v1/activity/mark-read/{activity_id}",
        headers={"X-User-ID": "tester-mr"},
    )
    assert mark.status_code == 200
    assert mark.json()["read"] is True


@pytest.mark.asyncio
async def test_activity_actions_listing(client: AsyncClient):
    resp = await client.get("/api/v1/activity/actions")
    assert resp.status_code == 200
    assert "candidate.created" in resp.json()["actions"]


@pytest.mark.asyncio
async def test_activity_unread_count(client: AsyncClient):
    resp = await client.get(
        "/api/v1/activity/unread-count",
        headers={"X-User-ID": "tester-unread"},
    )
    assert resp.status_code == 200
    assert "unread" in resp.json()


# ────────────────────────────────────────────────────────────────────────────
# Onboarding
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_onboarding_steps(client: AsyncClient):
    resp = await client.get("/api/v1/onboarding/steps")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 5
    assert any(s["id"] == "profile" for s in body["steps"])


@pytest.mark.asyncio
async def test_onboarding_status(client: AsyncClient):
    resp = await client.get(
        "/api/v1/onboarding/status", headers={"X-User-ID": "ob-user-1"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["completion_percent"] >= 0
    assert "next_step" in body


@pytest.mark.asyncio
async def test_onboarding_complete_step(client: AsyncClient):
    headers = {"X-User-ID": "ob-user-2"}
    resp = await client.post("/api/v1/onboarding/step/profile/complete", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["completed"] is True

    status = await client.get("/api/v1/onboarding/status", headers=headers)
    body = status.json()
    assert body["completed_steps"] >= 1


@pytest.mark.asyncio
async def test_onboarding_unknown_step(client: AsyncClient):
    resp = await client.post(
        "/api/v1/onboarding/step/does-not-exist/complete",
        headers={"X-User-ID": "ob-user-3"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_onboarding_skip_and_reset(client: AsyncClient):
    headers = {"X-User-ID": "ob-user-4"}
    skipped = await client.post("/api/v1/onboarding/skip", headers=headers)
    assert skipped.status_code == 200
    assert skipped.json()["skipped"] is True

    reset = await client.post("/api/v1/onboarding/reset", headers=headers)
    assert reset.status_code == 200
    assert reset.json()["reset"] is True


# ────────────────────────────────────────────────────────────────────────────
# Support
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_support_create_and_get_ticket(client: AsyncClient):
    headers = {"X-User-ID": "sup-user-1"}
    create = await client.post(
        "/api/v1/support/tickets",
        json={"subject": "Cannot upload resume", "description": "Returns 500 on .docx", "priority": "high"},
        headers=headers,
    )
    assert create.status_code == 200
    tkt = create.json()
    assert tkt["status"] == "open"
    assert tkt["message_count"] == 1

    got = await client.get(f"/api/v1/support/tickets/{tkt['id']}")
    assert got.status_code == 200
    assert got.json()["id"] == tkt["id"]


@pytest.mark.asyncio
async def test_support_list_tickets(client: AsyncClient):
    headers = {"X-User-ID": "sup-list-1"}
    await client.post(
        "/api/v1/support/tickets",
        json={"subject": "ListTest", "description": "..."},
        headers=headers,
    )
    listed = await client.get("/api/v1/support/tickets", headers=headers)
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1


@pytest.mark.asyncio
async def test_support_add_message_and_close(client: AsyncClient):
    headers = {"X-User-ID": "sup-msg-1"}
    create = await client.post(
        "/api/v1/support/tickets",
        json={"subject": "Question about API", "description": "blah"},
        headers=headers,
    )
    ticket_id = create.json()["id"]
    msg = await client.post(
        f"/api/v1/support/tickets/{ticket_id}/messages",
        json={"body": "Any update?"},
        headers=headers,
    )
    assert msg.status_code == 200

    close = await client.post(f"/api/v1/support/tickets/{ticket_id}/close?resolution=fixed")
    assert close.status_code == 200
    assert close.json()["status"] == "closed"


@pytest.mark.asyncio
async def test_support_404(client: AsyncClient):
    resp = await client.get("/api/v1/support/tickets/tkt_doesnotexist")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_support_stats(client: AsyncClient):
    resp = await client.get("/api/v1/support/stats", headers={"X-User-ID": "sup-stats-1"})
    assert resp.status_code == 200
    body = resp.json()
    assert "total" in body


# ────────────────────────────────────────────────────────────────────────────
# Batch
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_batch_bulk_import_candidates(client: AsyncClient):
    payload = {
        "candidates": [
            {"email": f"bulk{i}@example.com", "full_name": f"Bulk {i}"}
            for i in range(5)
        ]
    }
    resp = await client.post("/api/v1/candidates/bulk-import", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["successful"] == 5
    assert body["failed"] == 0


@pytest.mark.asyncio
async def test_batch_bulk_import_handles_bad_emails(client: AsyncClient):
    payload = {
        "candidates": [
            {"email": "good@example.com", "full_name": "Good"},
            {"email": "no-at-sign", "full_name": "Bad"},
        ]
    }
    resp = await client.post("/api/v1/candidates/bulk-import", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["successful"] == 1
    assert body["failed"] == 1


@pytest.mark.asyncio
async def test_batch_bulk_update_candidates(client: AsyncClient):
    resp = await client.post(
        "/api/v1/candidates/bulk-update",
        json={"ids": ["c1", "c2", "c3"], "updates": {"status": "screening"}},
    )
    assert resp.status_code == 200
    assert resp.json()["successful"] == 3


@pytest.mark.asyncio
async def test_batch_bulk_delete_candidates(client: AsyncClient):
    resp = await client.post(
        "/api/v1/candidates/bulk-delete",
        json={"ids": ["c1", "c2"]},
    )
    assert resp.status_code == 200
    assert resp.json()["successful"] == 2


@pytest.mark.asyncio
async def test_batch_bulk_archive_jobs(client: AsyncClient):
    resp = await client.post(
        "/api/v1/jobs/bulk-archive",
        json={"ids": ["j1", "j2"], "reason": "closed by hiring manager"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["successful"] == 2


@pytest.mark.asyncio
async def test_batch_size_limit(client: AsyncClient):
    payload = {
        "candidates": [
            {"email": f"big{i}@example.com", "full_name": f"Big {i}"}
            for i in range(1001)
        ]
    }
    resp = await client.post("/api/v1/candidates/bulk-import", json=payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_batch_csv_import(client: AsyncClient):
    csv_data = "email,full_name,seniority_level\nuser1@e.com,User 1,senior\nuser2@e.com,User 2,mid\n"
    files = {"file": ("candidates.csv", csv_data.encode("utf-8"), "text/csv")}
    resp = await client.post("/api/v1/candidates/bulk-import-csv", files=files)
    assert resp.status_code == 200
    assert resp.json()["successful"] == 2


# ────────────────────────────────────────────────────────────────────────────
# Background Jobs
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_jobs_active(client: AsyncClient):
    resp = await client.get("/api/v1/background-jobs/active")
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body


@pytest.mark.asyncio
async def test_jobs_history(client: AsyncClient):
    resp = await client.get("/api/v1/background-jobs/history?limit=5")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["data"], list)


@pytest.mark.asyncio
async def test_jobs_enqueue_and_status(client: AsyncClient):
    enq = await client.post(
        "/api/v1/background-jobs/",
        json={"name": "test.job", "args": {"foo": "bar"}},
    )
    assert enq.status_code == 200
    job_id = enq.json()["id"]

    status = await client.get(f"/api/v1/background-jobs/{job_id}/status")
    assert status.status_code == 200
    assert status.json()["status"] == "queued"


@pytest.mark.asyncio
async def test_jobs_cancel(client: AsyncClient):
    enq = await client.post(
        "/api/v1/background-jobs/",
        json={"name": "cancel.me"},
    )
    job_id = enq.json()["id"]
    cancel = await client.post(f"/api/v1/background-jobs/{job_id}/cancel")
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_jobs_cancel_404(client: AsyncClient):
    resp = await client.post("/api/v1/background-jobs/job_doesnotexist/cancel")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_jobs_stats(client: AsyncClient):
    resp = await client.get("/api/v1/background-jobs/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert "by_status" in body
    assert "total" in body
