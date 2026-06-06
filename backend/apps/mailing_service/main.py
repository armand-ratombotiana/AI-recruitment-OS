"""Mailing Service — Account validation, password resets, and transactional emails.

Supports a mock/dev mode (logs + in-memory store) when SMTP is not configured,
and real SMTP delivery via aiosmtplib when configured.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from jinja2 import Environment, FileSystemLoader, Template
from pydantic import BaseModel, EmailStr, Field

from shared.core.config import get_settings

try:
    from apps.mailing_service.templates import get_template_metadata
except Exception:  # pragma: no cover - templates package not initialized
    get_template_metadata = None  # type: ignore[assignment]


logger = logging.getLogger("mailing_service")
settings = get_settings()


# ── In-Memory Stores ───────────────────────────────────────────────────────────

# Tokens for email verification and password reset (token -> record)
EMAIL_TOKENS: dict[str, dict[str, Any]] = {}
PASSWORD_RESET_TOKENS: dict[str, dict[str, Any]] = {}

# Sent emails (for dev/mock mode and admin introspection)
SENT_EMAILS: list[dict[str, Any]] = []


# ── Email Templates ────────────────────────────────────────────────────────────

# Resolve the templates directory once at import time so the Jinja2 environment
# can find both the base layout and the child templates.
_TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
_jinja_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=False,  # HTML is authored explicitly; we only escape variables we trust
    trim_blocks=True,
    lstrip_blocks=True,
)


def render_email_template(
    name: str,
    *,
    cta_url: str | None = None,
    cta_label: str | None = None,
    footer: str | None = None,
    extra: dict[str, Any] | None = None,
) -> tuple[str, str, str]:
    """Render a file-based email template.

    Returns ``(subject, html, text)``. The template file is loaded from
    ``apps/mailing_service/templates/<name>.html`` and rendered through the
    shared ``_base.html`` layout. The subject line comes from
    :data:`TEMPLATE_METADATA` and is rendered separately using a tiny
    :class:`jinja2.Template` so the same variables can be used in both.
    """
    if get_template_metadata is None:
        raise RuntimeError("Email templates package is not importable")

    metadata = get_template_metadata(name)
    extra_vars = dict(extra or {})

    subject_tmpl = Template(metadata["subject"])
    rendered_subject = subject_tmpl.render(**extra_vars)

    cta_url = cta_url if cta_url is not None else metadata.get("default_cta_url", "")
    cta_label_value = cta_label if cta_label is not None else metadata.get("default_cta_label", "")
    # The offer-letter default cta label contains an HTML entity that we keep
    # rendered literally in the base layout; decode it once.
    cta_label_value = cta_label_value.replace("&amp;", "&") if cta_label_value else ""
    footer_value = footer if footer is not None else metadata.get("default_footer", "")

    template = _jinja_env.get_template(f"{name}.html")
    body_html = template.render(**extra_vars)

    html = _jinja_env.get_template("_base.html").render(
        subject=rendered_subject,
        body_html=body_html,
        cta_url=cta_url,
        cta_label=cta_label_value,
        footer=footer_value,
    )
    text = f"{rendered_subject}\n\n{_strip_html(body_html)}\n\n{footer_value}"
    if cta_url and cta_label_value:
        text += f"\n\n{cta_label_value}: {cta_url}"
    return rendered_subject, html, text


_BASE_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><title>{{ subject }}</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e2e8f0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;">
  <tr><td style="background:linear-gradient(90deg,#6366f1 0%,#8b5cf6 100%);padding:24px;text-align:center;">
    <h1 style="margin:0;font-size:24px;color:#ffffff;font-weight:700;">AI-ROS</h1>
    <p style="margin:4px 0 0 0;color:#e0e7ff;font-size:14px;">AI-Native Recruitment OS</p>
  </td></tr>
  <tr><td style="padding:32px;">
    <h2 style="margin:0 0 16px 0;color:#f1f5f9;font-size:20px;">{{ subject }}</h2>
    <div style="color:#cbd5e1;font-size:15px;line-height:1.6;">{{ body_html | safe }}</div>
    {{ cta_html | safe }}
    <hr style="border:none;border-top:1px solid #334155;margin:32px 0 16px 0;">
    <p style="color:#94a3b8;font-size:12px;margin:0;">{{ footer }}</p>
  </td></tr>
</table>
<p style="color:#64748b;font-size:11px;text-align:center;margin-top:16px;">AI-ROS · Recruitment made intelligent</p>
</td></tr>
</table>
</body></html>"""

_BASE_HTML_TMPL = Template(_BASE_HTML)


def _render_email(
    subject: str,
    body_html: str,
    footer: str = "If you did not request this, you can safely ignore this email.",
    cta_html: str = "",
) -> tuple[str, str]:
    """Render HTML + plain text versions of an email."""
    html = _BASE_HTML_TMPL.render(
        subject=subject, body_html=body_html, footer=footer, cta_html=cta_html
    )
    text = f"{subject}\n\n{_strip_html(body_html)}\n\n{footer}"
    if cta_html:
        text += f"\n\n{_strip_html(cta_html)}"
    return html, text


def _strip_html(s: str) -> str:
    import re
    return re.sub(r"<[^>]+>", "", s).strip()


def _cta_button(url: str, label: str, color: str = "#6366f1") -> str:
    return (
        f'<div style="text-align:center;margin:32px 0;">'
        f'<a href="{url}" style="background:{color};color:#ffffff;padding:12px 32px;'
        f'border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">'
        f"{label}</a></div>"
    )


# Template bodies for each email type
TEMPLATE_BODIES: dict[str, dict[str, str]] = {
    "email_verification": {
        "subject": "Verify your AI-ROS email",
        "body": (
            "<p>Hi <strong>{{ full_name }}</strong>,</p>"
            "<p>Welcome to AI-ROS! Please confirm your email address to activate your account.</p>"
            "<p>Click the button below to verify your email. This link expires in {{ expiry_hours }} hours.</p>"
        ),
        "cta_label": "Verify Email",
        "footer": "If you did not create an AI-ROS account, you can safely ignore this email.",
    },
    "password_reset": {
        "subject": "Reset your AI-ROS password",
        "body": (
            "<p>Hi <strong>{{ full_name }}</strong>,</p>"
            "<p>We received a request to reset your password. Click the button below to set a new password.</p>"
            "<p>This link expires in {{ expiry_hours }} hours. If you did not request this, you can safely ignore this email.</p>"
        ),
        "cta_label": "Reset Password",
        "footer": "For security, this link can only be used once.",
    },
    "welcome": {
        "subject": "Welcome to AI-ROS",
        "body": (
            "<p>Hi <strong>{{ full_name }}</strong>,</p>"
            "<p>Your AI-ROS account is ready. Here is what you can do next:</p>"
            "<ul><li>Complete your profile</li><li>Post your first job</li><li>Invite your team</li></ul>"
        ),
        "cta_label": "Go to Dashboard",
        "footer": "Need help getting started? Reply to this email and we will be happy to assist.",
    },
    "interview_invitation": {
        "subject": "Interview Invitation — {{ job_title }}",
        "body": (
            "<p>Hi <strong>{{ full_name }}</strong>,</p>"
            "<p>You have been invited to interview for the <strong>{{ job_title }}</strong> position.</p>"
            "<p><strong>When:</strong> {{ scheduled_at }}<br>"
            "<strong>Type:</strong> {{ interview_type }}<br>"
            "<strong>Duration:</strong> {{ duration_minutes }} minutes</p>"
            "<p>Please confirm your availability by clicking the button below.</p>"
        ),
        "cta_label": "Confirm Interview",
        "footer": "If the timing does not work, reply to this email to reschedule.",
    },
    "application_status": {
        "subject": "Application Update — {{ job_title }}",
        "body": (
            "<p>Hi <strong>{{ full_name }}</strong>,</p>"
            "<p>There has been an update on your application for <strong>{{ job_title }}</strong>.</p>"
            "<p><strong>New status:</strong> {{ status }}<br>"
            "{{ extra_html | safe }}"
            "</p>"
        ),
        "cta_label": "View Application",
        "footer": "Thank you for your interest in joining our team.",
    },
    "offer_letter": {
        "subject": "Your offer from AI-ROS",
        "body": (
            "<p>Hi <strong>{{ full_name }}</strong>,</p>"
            "<p>We are thrilled to extend you an offer for the <strong>{{ job_title }}</strong> position.</p>"
            "<p>{{ extra_html | safe }}</p>"
            "<p>Click below to review the full offer and respond.</p>"
        ),
        "cta_label": "Review Offer",
        "footer": "We look forward to welcoming you to the team!",
    },
}


# ── Email Service ──────────────────────────────────────────────────────────────


class EmailService:
    """Service that dispatches emails via SMTP (aiosmtplib) or in mock mode."""

    def __init__(self):
        self._mock: bool = self._detect_mock_mode()

    def _detect_mock_mode(self) -> bool:
        if settings.MAIL_MOCK_MODE:
            return True
        return not settings.SMTP_HOST

    @property
    def is_mock(self) -> bool:
        return self._mock

    async def send_email(
        self,
        to: str,
        subject: str,
        html: str,
        text: str,
        from_email: str | None = None,
        from_name: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Send a single email. Returns metadata about the sent message."""
        message_id = f"em_{uuid.uuid4().hex[:16]}"
        record: dict[str, Any] = {
            "id": message_id,
            "to": to,
            "subject": subject,
            "from": from_email or settings.SMTP_FROM_EMAIL,
            "from_name": from_name or settings.SMTP_FROM_NAME,
            "html": html,
            "text": text,
            "status": "pending",
            "mode": "smtp" if not self._mock else "mock",
            "extra": extra or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
            "error": None,
        }

        if self._mock:
            return await self._send_mock(record)
        return await self._send_smtp(record)

    async def _send_mock(self, record: dict[str, Any]) -> dict[str, Any]:
        """Mock send: log + store in memory."""
        logger.info(
            f"[MOCK EMAIL] id={record['id']} to={record['to']} subject={record['subject']!r}"
        )
        # Also print to console so devs see it
        print(
            f"\n{'=' * 70}\n"
            f"[MOCK EMAIL] {record['id']}\n"
            f"  To:      {record['to']}\n"
            f"  From:    {record['from_name']} <{record['from']}>\n"
            f"  Subject: {record['subject']}\n"
            f"  Body:    {record['text'][:200]}{'...' if len(record['text']) > 200 else ''}\n"
            f"{'=' * 70}\n"
        )
        record["status"] = "sent"
        SENT_EMAILS.append(record)
        return record

    async def _send_smtp(self, record: dict[str, Any]) -> dict[str, Any]:
        """Real SMTP send via aiosmtplib."""
        try:
            import aiosmtplib
        except ImportError:
            logger.warning("aiosmtplib not available — falling back to mock mode")
            record["status"] = "failed"
            record["error"] = "aiosmtplib not installed"
            SENT_EMAILS.append(record)
            return record

        msg = EmailMessage()
        msg["From"] = f"{record['from_name']} <{record['from']}>"
        msg["To"] = record["to"]
        msg["Subject"] = record["subject"]
        msg.set_content(record["text"])
        msg.add_alternative(record["html"], subtype="html")

        try:
            if settings.SMTP_USE_SSL:
                await aiosmtplib.send(
                    msg,
                    hostname=settings.SMTP_HOST,
                    port=settings.SMTP_PORT,
                    username=settings.SMTP_USERNAME or None,
                    password=settings.SMTP_PASSWORD or None,
                    use_tls=True,
                )
            else:
                await aiosmtplib.send(
                    msg,
                    hostname=settings.SMTP_HOST,
                    port=settings.SMTP_PORT,
                    username=settings.SMTP_USERNAME or None,
                    password=settings.SMTP_PASSWORD or None,
                    use_tls=settings.SMTP_USE_TLS,
                )
            record["status"] = "sent"
            logger.info(f"Sent email {record['id']} to {record['to']}")
        except Exception as exc:
            record["status"] = "failed"
            record["error"] = str(exc)
            logger.error(f"Failed to send email {record['id']} to {record['to']}: {exc}")
        SENT_EMAILS.append(record)
        return record

    # ── Token generation helpers ────────────────────────────────────────────

    def create_verification_token(self, user_id: str, email: str) -> str:
        token = secrets.token_urlsafe(32)
        EMAIL_TOKENS[token] = {
            "user_id": user_id,
            "email": email,
            "type": "email_verification",
            "expires_at": datetime.now(timezone.utc)
            + timedelta(hours=settings.EMAIL_VERIFY_TOKEN_HOURS),
            "used_at": None,
        }
        return token

    def create_password_reset_token(self, user_id: str, email: str) -> str:
        token = secrets.token_urlsafe(32)
        PASSWORD_RESET_TOKENS[token] = {
            "user_id": user_id,
            "email": email,
            "type": "password_reset",
            "expires_at": datetime.now(timezone.utc)
            + timedelta(hours=settings.PASSWORD_RESET_TOKEN_HOURS),
            "used_at": None,
        }
        return token

    def consume_verification_token(self, token: str) -> dict[str, Any] | None:
        rec = EMAIL_TOKENS.get(token)
        if not rec:
            return None
        if rec["used_at"] is not None:
            return None
        if rec["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            return None
        rec["used_at"] = datetime.now(timezone.utc)
        return rec

    def consume_password_reset_token(self, token: str) -> dict[str, Any] | None:
        rec = PASSWORD_RESET_TOKENS.get(token)
        if not rec:
            return None
        if rec["used_at"] is not None:
            return None
        if rec["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            return None
        rec["used_at"] = datetime.now(timezone.utc)
        return rec

    def verify_token_exists(self, token: str) -> dict[str, Any] | None:
        """Return token record without consuming it (for inspection/admin)."""
        return EMAIL_TOKENS.get(token) or PASSWORD_RESET_TOKENS.get(token)


# Singleton instance
email_service = EmailService()


# ── Public Email Helpers ───────────────────────────────────────────────────────


async def send_verification_email(
    user_id: str, email: str, full_name: str, base_url: str = ""
) -> dict[str, Any]:
    """Send an email verification message."""
    token = email_service.create_verification_token(user_id, email)
    verify_url = f"{base_url or 'http://localhost:3000'}/verify-email?token={token}"
    tpl = TEMPLATE_BODIES["email_verification"]
    body = Template(tpl["body"]).render(
        full_name=full_name, expiry_hours=settings.EMAIL_VERIFY_TOKEN_HOURS
    )
    html, text = _render_email(
        subject=tpl["subject"],
        body_html=body,
        footer=tpl["footer"],
        cta_html=_cta_button(verify_url, tpl["cta_label"]),
    )
    return await email_service.send_email(
        to=email,
        subject=tpl["subject"],
        html=html,
        text=text,
        extra={"type": "email_verification", "token": token, "user_id": user_id},
    )


async def send_password_reset_email(
    user_id: str, email: str, full_name: str, base_url: str = ""
) -> dict[str, Any]:
    """Send a password reset message."""
    token = email_service.create_password_reset_token(user_id, email)
    reset_url = f"{base_url or 'http://localhost:3000'}/reset-password?token={token}"
    tpl = TEMPLATE_BODIES["password_reset"]
    body = Template(tpl["body"]).render(
        full_name=full_name, expiry_hours=settings.PASSWORD_RESET_TOKEN_HOURS
    )
    html, text = _render_email(
        subject=tpl["subject"],
        body_html=body,
        footer=tpl["footer"],
        cta_html=_cta_button(reset_url, tpl["cta_label"]),
    )
    return await email_service.send_email(
        to=email,
        subject=tpl["subject"],
        html=html,
        text=text,
        extra={"type": "password_reset", "token": token, "user_id": user_id},
    )


async def send_welcome_email(
    user_id: str, email: str, full_name: str, base_url: str = ""
) -> dict[str, Any]:
    """Send a welcome message."""
    dashboard_url = f"{base_url or 'http://localhost:3000'}/dashboard"
    tpl = TEMPLATE_BODIES["welcome"]
    body = Template(tpl["body"]).render(full_name=full_name)
    html, text = _render_email(
        subject=tpl["subject"],
        body_html=body,
        footer=tpl["footer"],
        cta_html=_cta_button(dashboard_url, tpl["cta_label"]),
    )
    return await email_service.send_email(
        to=email,
        subject=tpl["subject"],
        html=html,
        text=text,
        extra={"type": "welcome", "user_id": user_id},
    )


async def send_interview_invitation(
    user_id: str,
    email: str,
    full_name: str,
    job_title: str,
    scheduled_at: str,
    interview_type: str,
    duration_minutes: int,
    base_url: str = "",
) -> dict[str, Any]:
    """Send an interview invitation."""
    cta_url = f"{base_url or 'http://localhost:3000'}/interviews"
    tpl = TEMPLATE_BODIES["interview_invitation"]
    body = Template(tpl["body"]).render(
        full_name=full_name,
        job_title=job_title,
        scheduled_at=scheduled_at,
        interview_type=interview_type,
        duration_minutes=duration_minutes,
    )
    html, text = _render_email(
        subject=Template(tpl["subject"]).render(job_title=job_title),
        body_html=body,
        footer=tpl["footer"],
        cta_html=_cta_button(cta_url, tpl["cta_label"]),
    )
    return await email_service.send_email(
        to=email,
        subject=Template(tpl["subject"]).render(job_title=job_title),
        html=html,
        text=text,
        extra={"type": "interview_invitation", "user_id": user_id},
    )


async def send_application_status(
    user_id: str,
    email: str,
    full_name: str,
    job_title: str,
    status_label: str,
    extra_html: str = "",
    base_url: str = "",
) -> dict[str, Any]:
    """Send an application status update."""
    cta_url = f"{base_url or 'http://localhost:3000'}/applications"
    tpl = TEMPLATE_BODIES["application_status"]
    body = Template(tpl["body"]).render(
        full_name=full_name,
        job_title=job_title,
        status=status_label,
        extra_html=extra_html,
    )
    html, text = _render_email(
        subject=Template(tpl["subject"]).render(job_title=job_title),
        body_html=body,
        footer=tpl["footer"],
        cta_html=_cta_button(cta_url, tpl["cta_label"]),
    )
    return await email_service.send_email(
        to=email,
        subject=Template(tpl["subject"]).render(job_title=job_title),
        html=html,
        text=text,
        extra={"type": "application_status", "user_id": user_id},
    )


async def send_offer_letter(
    user_id: str,
    email: str,
    full_name: str,
    job_title: str,
    extra_html: str = "",
    base_url: str = "",
    *,
    company_name: str = "AI-ROS",
    job_level: str = "",
    start_date: str = "",
    manager_name: str = "",
    manager_title: str = "",
    location: str = "Remote",
    work_mode: str = "Remote",
    compensation_html: str = "",
    benefits_html: str = "",
    offer_expiry: str = "",
) -> dict[str, Any]:
    """Send an offer letter (file-based template)."""
    cta_url = f"{base_url or 'http://localhost:3000'}/offers"
    subject, html, text = render_email_template(
        "offer_letter",
        cta_url=cta_url,
        extra={
            "full_name": full_name,
            "job_title": job_title,
            "company_name": company_name,
            "job_level": job_level,
            "start_date": start_date,
            "manager_name": manager_name,
            "manager_title": manager_title,
            "location": location,
            "work_mode": work_mode,
            "compensation_html": compensation_html or extra_html or "See attached letter.",
            "benefits_html": benefits_html,
            "extra_html": extra_html,
            "offer_expiry": offer_expiry or "the date listed in the offer letter",
        },
    )
    return await email_service.send_email(
        to=email,
        subject=subject,
        html=html,
        text=text,
        extra={"type": "offer_letter", "user_id": user_id},
    )


async def send_interview_reminder(
    user_id: str,
    email: str,
    full_name: str,
    job_title: str,
    scheduled_at: str,
    interview_type: str,
    duration_minutes: int,
    base_url: str = "",
    *,
    location: str = "",
    interviewer_name: str = "",
    interviewer_title: str = "",
    preparation_html: str = "",
) -> dict[str, Any]:
    """Send a 24h interview reminder (file-based template)."""
    cta_url = f"{base_url or 'http://localhost:3000'}/interviews"
    subject, html, text = render_email_template(
        "interview_reminder",
        cta_url=cta_url,
        extra={
            "full_name": full_name,
            "job_title": job_title,
            "scheduled_at": scheduled_at,
            "interview_type": interview_type,
            "duration_minutes": duration_minutes,
            "location": location,
            "interviewer_name": interviewer_name,
            "interviewer_title": interviewer_title,
            "preparation_html": preparation_html,
        },
    )
    return await email_service.send_email(
        to=email,
        subject=subject,
        html=html,
        text=text,
        extra={"type": "interview_reminder", "user_id": user_id},
    )


async def send_candidate_status_change_to_recruiter(
    recruiter_user_id: str,
    recruiter_email: str,
    recruiter_name: str,
    candidate_name: str,
    candidate_email: str,
    job_title: str,
    previous_status: str,
    new_status: str,
    base_url: str = "",
    *,
    changed_by: str = "",
    changed_at: str = "",
    notes_html: str = "",
) -> dict[str, Any]:
    """Send a candidate-status change notification to the recruiter."""
    cta_url = f"{base_url or 'http://localhost:3000'}/candidates"
    subject, html, text = render_email_template(
        "candidate_status_change",
        cta_url=cta_url,
        extra={
            "recruiter_name": recruiter_name,
            "candidate_name": candidate_name,
            "candidate_email": candidate_email,
            "job_title": job_title,
            "previous_status": previous_status,
            "new_status": new_status,
            "changed_by": changed_by,
            "changed_at": changed_at or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "notes_html": notes_html,
        },
    )
    return await email_service.send_email(
        to=recruiter_email,
        subject=subject,
        html=html,
        text=text,
        extra={
            "type": "candidate_status_change",
            "user_id": recruiter_user_id,
            "candidate_name": candidate_name,
        },
    )


async def send_weekly_hiring_digest(
    leader_user_id: str,
    leader_email: str,
    leader_name: str,
    tenant_name: str,
    week_start: str,
    week_end: str,
    metrics: dict[str, int],
    highlights: list[str] | None = None,
    open_roles: list[dict[str, Any]] | None = None,
    risks: list[str] | None = None,
    base_url: str = "",
    *,
    report_format: str = "PDF",
    attachment_filename: str | None = None,
    attachment_bytes: bytes | None = None,
    attachment_mime: str = "application/pdf",
) -> dict[str, Any]:
    """Send the weekly hiring digest to leadership, optionally with a report file attached."""
    cta_url = f"{base_url or 'http://localhost:3000'}/analytics/hiring"
    safe_metrics = {
        "new_applications": int(metrics.get("new_applications", 0)),
        "interviews_conducted": int(metrics.get("interviews_conducted", 0)),
        "offers_extended": int(metrics.get("offers_extended", 0)),
        "hires": int(metrics.get("hires", 0)),
    }
    subject, html, text = render_email_template(
        "weekly_hiring_digest",
        cta_url=cta_url,
        extra={
            "leader_name": leader_name,
            "tenant_name": tenant_name,
            "week_start": week_start,
            "week_end": week_end,
            "metrics": safe_metrics,
            "highlights": highlights or [],
            "open_roles": open_roles or [],
            "risks": risks or [],
            "report_format": report_format,
        },
    )
    extra: dict[str, Any] = {
        "type": "weekly_hiring_digest",
        "user_id": leader_user_id,
        "week_start": week_start,
        "week_end": week_end,
    }
    if attachment_bytes is not None and attachment_filename:
        extra["attachment"] = {
            "filename": attachment_filename,
            "mime": attachment_mime,
            "size": len(attachment_bytes),
        }
        # When we have an attachment, append a short pointer to the text body
        # so plain-text readers know the file is part of the message.
        text += f"\n\nAttachment: {attachment_filename} ({len(attachment_bytes)} bytes)"
    return await email_service.send_email(
        to=leader_email,
        subject=subject,
        html=html,
        text=text,
        extra=extra,
    )


# ── Pydantic Schemas ───────────────────────────────────────────────────────────


class SendEmailRequest(BaseModel):
    to: EmailStr = Field(..., description="Recipient email address")
    subject: str = Field(..., min_length=1, max_length=300)
    html: str = Field(..., min_length=1, description="HTML body")
    text: str | None = Field(default=None, description="Plain text body (auto-generated if missing)")


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "mailing"
    mode: str  # "smtp" or "mock"


class EmailRecord(BaseModel):
    id: str
    to: str
    from_email: str
    from_name: str
    subject: str
    status: str
    mode: str
    created_at: str
    error: str | None = None
    extra: dict[str, Any] = {}


class SentEmailsResponse(BaseModel):
    total: int
    emails: list[EmailRecord]


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., min_length=8)


class VerifyEmailResponse(BaseModel):
    valid: bool
    user_id: str | None = None
    email: str | None = None
    used: bool = False
    expired: bool = False


# ── Router ─────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Mailing"], summary="Mailing service health")
async def health():
    return HealthResponse(
        status="healthy",
        service="mailing",
        mode="mock" if email_service.is_mock else "smtp",
    )


@router.post("/send", tags=["Mailing"], summary="Send a custom email (admin/test)")
async def send_custom(data: SendEmailRequest):
    text = data.text or _strip_html(data.html)
    record = await email_service.send_email(
        to=data.to,
        subject=data.subject,
        html=data.html,
        text=text,
    )
    return {"id": record["id"], "status": record["status"], "mode": record["mode"]}


@router.get("/admin/emails", response_model=SentEmailsResponse, tags=["Mailing"], summary="List sent emails")
async def list_sent_emails(
    to: str | None = Query(default=None, description="Filter by recipient"),
    type: str | None = Query(default=None, description="Filter by email type"),
    limit: int = Query(default=50, ge=1, le=500),
):
    emails = list(SENT_EMAILS)
    if to:
        emails = [e for e in emails if e["to"] == to]
    if type:
        emails = [e for e in emails if e.get("extra", {}).get("type") == type]
    emails = emails[-limit:][::-1]
    return SentEmailsResponse(
        total=len(emails),
        emails=[
            EmailRecord(
                id=e["id"],
                to=e["to"],
                from_email=e["from"],
                from_name=e["from_name"],
                subject=e["subject"],
                status=e["status"],
                mode=e["mode"],
                created_at=e["created_at"],
                error=e.get("error"),
                extra=e.get("extra", {}),
            )
            for e in emails
        ],
    )


@router.get("/admin/emails/{email_id}", tags=["Mailing"], summary="Get a single sent email")
async def get_sent_email(email_id: str):
    for e in SENT_EMAILS:
        if e["id"] == email_id:
            return e
    raise HTTPException(status_code=404, detail=f"Email {email_id} not found")


@router.delete("/admin/emails", tags=["Mailing"], summary="Clear the sent-emails log (dev/testing)")
async def clear_sent_emails():
    count = len(SENT_EMAILS)
    SENT_EMAILS.clear()
    return {"cleared": count}


@router.get("/admin/tokens", tags=["Mailing"], summary="List active tokens (dev/testing)")
async def list_tokens():
    now = datetime.now(timezone.utc)
    items = []
    for token, rec in EMAIL_TOKENS.items():
        expired = rec["expires_at"].replace(tzinfo=timezone.utc) < now
        items.append({
            "token": token,
            "type": "email_verification",
            "user_id": rec["user_id"],
            "email": rec["email"],
            "expires_at": rec["expires_at"].isoformat(),
            "used": rec["used_at"] is not None,
            "expired": expired,
        })
    for token, rec in PASSWORD_RESET_TOKENS.items():
        expired = rec["expires_at"].replace(tzinfo=timezone.utc) < now
        items.append({
            "token": token,
            "type": "password_reset",
            "user_id": rec["user_id"],
            "email": rec["email"],
            "expires_at": rec["expires_at"].isoformat(),
            "used": rec["used_at"] is not None,
            "expired": expired,
        })
    return {"total": len(items), "tokens": items}


@router.post(
    "/verify-token",
    response_model=VerifyEmailResponse,
    tags=["Mailing"],
    summary="Inspect a verification/reset token (without consuming)",
)
async def verify_token(data: VerifyEmailRequest):
    rec = email_service.verify_token_exists(data.token)
    if not rec:
        return VerifyEmailResponse(valid=False)
    now = datetime.now(timezone.utc)
    expired = rec["expires_at"].replace(tzinfo=timezone.utc) < now
    return VerifyEmailResponse(
        valid=not expired and rec["used_at"] is None,
        user_id=rec["user_id"],
        email=rec["email"],
        used=rec["used_at"] is not None,
        expired=expired,
    )
