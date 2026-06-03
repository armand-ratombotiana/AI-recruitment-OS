"""Tests for the mailing service.

Exercises:
- Health endpoint
- Mock mode detection
- Token generation and consumption
- Public email helpers (verification, password reset, welcome, etc.)
- Admin endpoints
"""
from __future__ import annotations

import os
import sys

import pytest
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

pytestmark = [pytest.mark.integration, pytest.mark.mailing]


@pytest.fixture(autouse=True)
def _enable_demo_seed(monkeypatch):
    """Ensure tests run with DEMO_ENABLED off so we don't pollute state."""
    from shared.core.config import get_settings
    get_settings.cache_clear()


@pytest.fixture
async def mailing_client():
    """Spin up a minimal FastAPI app that only includes the mailing router."""
    from fastapi import FastAPI
    from apps.mailing_service.main import router

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/mailing")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_mailing_health(mailing_client: AsyncClient):
    resp = await mailing_client.get("/api/v1/mailing/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["service"] == "mailing"
    # In test env, SMTP_HOST is not set so we should be in mock mode
    assert body["mode"] in {"mock", "smtp"}


@pytest.mark.asyncio
async def test_send_custom_email_in_mock_mode(mailing_client: AsyncClient):
    resp = await mailing_client.post(
        "/api/v1/mailing/send",
        json={
            "to": "user@example.com",
            "subject": "Hello",
            "html": "<p>This is a <strong>test</strong></p>",
            "text": "This is a test",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "sent"
    assert "id" in body
    assert body["mode"] in {"mock", "smtp"}


@pytest.mark.asyncio
async def test_list_sent_emails(mailing_client: AsyncClient):
    # Send one
    await mailing_client.post(
        "/api/v1/mailing/send",
        json={"to": "a@example.com", "subject": "S1", "html": "<p>x</p>"},
    )
    await mailing_client.post(
        "/api/v1/mailing/send",
        json={"to": "b@example.com", "subject": "S2", "html": "<p>x</p>"},
    )

    resp = await mailing_client.get("/api/v1/mailing/admin/emails")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 2
    subjects = [e["subject"] for e in body["emails"]]
    assert "S1" in subjects
    assert "S2" in subjects


@pytest.mark.asyncio
async def test_filter_sent_emails_by_recipient(mailing_client: AsyncClient):
    await mailing_client.post(
        "/api/v1/mailing/send",
        json={"to": "filter@example.com", "subject": "FS", "html": "<p>x</p>"},
    )
    resp = await mailing_client.get("/api/v1/mailing/admin/emails?to=filter@example.com")
    assert resp.status_code == 200
    body = resp.json()
    assert all(e["to"] == "filter@example.com" for e in body["emails"])


@pytest.mark.asyncio
async def test_clear_sent_emails(mailing_client: AsyncClient):
    await mailing_client.post(
        "/api/v1/mailing/send",
        json={"to": "clear@example.com", "subject": "C", "html": "<p>x</p>"},
    )
    resp = await mailing_client.delete("/api/v1/mailing/admin/emails")
    assert resp.status_code == 200
    assert resp.json()["cleared"] >= 1


@pytest.mark.asyncio
async def test_get_single_email(mailing_client: AsyncClient):
    send_resp = await mailing_client.post(
        "/api/v1/mailing/send",
        json={"to": "single@example.com", "subject": "single", "html": "<p>x</p>"},
    )
    email_id = send_resp.json()["id"]

    resp = await mailing_client.get(f"/api/v1/mailing/admin/emails/{email_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == email_id

    # 404 case
    resp404 = await mailing_client.get("/api/v1/mailing/admin/emails/em_doesnotexist")
    assert resp404.status_code == 404


# ── Direct service-level tests ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_email_service_token_lifecycle():
    from apps.mailing_service.main import email_service, SENT_EMAILS, EMAIL_TOKENS

    EMAIL_TOKENS.clear()
    SENT_EMAILS.clear()

    token = email_service.create_verification_token("u1", "user@example.com")
    assert token in EMAIL_TOKENS

    # Inspect without consuming
    rec = email_service.verify_token_exists(token)
    assert rec is not None
    assert rec["email"] == "user@example.com"

    # Consume
    rec = email_service.consume_verification_token(token)
    assert rec is not None

    # Re-consume should fail
    rec2 = email_service.consume_verification_token(token)
    assert rec2 is None


@pytest.mark.asyncio
async def test_send_verification_email_helper():
    from apps.mailing_service.main import (
        send_verification_email,
        SENT_EMAILS,
        EMAIL_TOKENS,
    )
    EMAIL_TOKENS.clear()
    SENT_EMAILS.clear()

    record = await send_verification_email("u1", "user@example.com", "User One")
    assert record["status"] == "sent"
    assert record["extra"]["type"] == "email_verification"
    assert record["extra"]["token"] in EMAIL_TOKENS
    assert "Verify Email" in record["text"]


@pytest.mark.asyncio
async def test_send_password_reset_email_helper():
    from apps.mailing_service.main import (
        send_password_reset_email,
        PASSWORD_RESET_TOKENS,
        SENT_EMAILS,
    )
    PASSWORD_RESET_TOKENS.clear()
    SENT_EMAILS.clear()

    record = await send_password_reset_email("u1", "user@example.com", "User One")
    assert record["status"] == "sent"
    assert record["extra"]["type"] == "password_reset"
    assert record["extra"]["token"] in PASSWORD_RESET_TOKENS
    assert "Reset Password" in record["text"]


@pytest.mark.asyncio
async def test_send_welcome_email_helper():
    from apps.mailing_service.main import send_welcome_email, SENT_EMAILS

    SENT_EMAILS.clear()
    record = await send_welcome_email("u1", "user@example.com", "User One")
    assert record["status"] == "sent"
    assert "Welcome" in record["subject"]


@pytest.mark.asyncio
async def test_send_interview_invitation_helper():
    from apps.mailing_service.main import send_interview_invitation, SENT_EMAILS

    SENT_EMAILS.clear()
    record = await send_interview_invitation(
        "u1", "user@example.com", "User One",
        job_title="Senior Engineer",
        scheduled_at="2025-06-15 14:00 UTC",
        interview_type="Technical",
        duration_minutes=60,
    )
    assert record["status"] == "sent"
    assert "Senior Engineer" in record["subject"]
    assert "Technical" in record["text"]


@pytest.mark.asyncio
async def test_send_application_status_helper():
    from apps.mailing_service.main import send_application_status, SENT_EMAILS

    SENT_EMAILS.clear()
    record = await send_application_status(
        "u1", "user@example.com", "User One",
        job_title="Backend Engineer",
        status_label="Interviewing",
        extra_html="<p>Next steps attached.</p>",
    )
    assert record["status"] == "sent"
    assert "Interviewing" in record["text"]


@pytest.mark.asyncio
async def test_send_offer_letter_helper():
    from apps.mailing_service.main import send_offer_letter, SENT_EMAILS

    SENT_EMAILS.clear()
    record = await send_offer_letter(
        "u1", "user@example.com", "User One",
        job_title="Staff Engineer",
        extra_html="<p>Salary: $200k base + equity</p>",
    )
    assert record["status"] == "sent"
    # Subject is fixed for offer letters (the body mentions the job title)
    assert "offer" in record["subject"].lower()
    # The job title should appear in the body
    assert "Staff Engineer" in record["text"]


@pytest.mark.asyncio
async def test_token_expiry(monkeypatch):
    """Expired tokens should not be consumable."""
    from datetime import datetime, timedelta, timezone
    from apps.mailing_service.main import email_service, EMAIL_TOKENS

    EMAIL_TOKENS.clear()
    token = email_service.create_verification_token("u1", "u@example.com")

    # Force the token to be expired
    EMAIL_TOKENS[token]["expires_at"] = datetime.now(timezone.utc) - timedelta(seconds=1)

    rec = email_service.consume_verification_token(token)
    assert rec is None


@pytest.mark.asyncio
async def test_admin_tokens_endpoint(mailing_client: AsyncClient):
    from apps.mailing_service.main import EMAIL_TOKENS, PASSWORD_RESET_TOKENS
    EMAIL_TOKENS.clear()
    PASSWORD_RESET_TOKENS.clear()

    # Generate a couple of tokens
    await mailing_client.post(
        "/api/v1/mailing/send",
        json={"to": "tok@example.com", "subject": "tok", "html": "<p>x</p>"},
    )
    # Use the helper to also get a verification token
    from apps.mailing_service.main import send_verification_email, send_password_reset_email
    await send_verification_email("u1", "verify@example.com", "V")
    await send_password_reset_email("u2", "reset@example.com", "R")

    resp = await mailing_client.get("/api/v1/mailing/admin/tokens")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 2
    types = {t["type"] for t in body["tokens"]}
    assert "email_verification" in types
    assert "password_reset" in types


@pytest.mark.asyncio
async def test_verify_token_endpoint(mailing_client: AsyncClient):
    from apps.mailing_service.main import (
        send_verification_email,
        EMAIL_TOKENS,
        PASSWORD_RESET_TOKENS,
        SENT_EMAILS,
    )
    EMAIL_TOKENS.clear()
    PASSWORD_RESET_TOKENS.clear()
    SENT_EMAILS.clear()

    record = await send_verification_email("u1", "v@example.com", "V")
    token = record["extra"]["token"]

    resp = await mailing_client.post(
        "/api/v1/mailing/verify-token", json={"token": token}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is True
    assert body["user_id"] == "u1"
    assert body["used"] is False
