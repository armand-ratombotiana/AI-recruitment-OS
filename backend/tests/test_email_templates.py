"""Tests for the email template registry.

Covers both layers exposed by :mod:`apps.mailing_service.templates`:

* :func:`get_template` — load a template file by name (with or without
  ``.html`` suffix) and assert that the file exists.
* :func:`render_template` — render a template with a context dict and
  assert that context values flow through to the rendered output.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from apps.mailing_service.templates import (  # noqa: E402
    get_template,
    get_template_metadata,
    list_templates,
    render_template,
)


REGISTERED_TEMPLATES = [
    "interview_reminder",
    "candidate_status_change",
    "weekly_hiring_digest",
    "offer_letter",
]


# ── get_template ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize("name", REGISTERED_TEMPLATES)
def test_get_template_loads_registered_template(name: str):
    body = get_template(name)
    assert isinstance(body, str)
    assert body.strip() != ""


@pytest.mark.parametrize("name", REGISTERED_TEMPLATES)
def test_get_template_accepts_html_suffix(name: str):
    with_suffix = get_template(f"{name}.html")
    without_suffix = get_template(name)
    assert with_suffix == without_suffix


def test_get_template_missing_raises():
    with pytest.raises(FileNotFoundError):
        get_template("nonexistent_template")


def test_get_template_metadata_returns_all_registered():
    for name in REGISTERED_TEMPLATES:
        meta = get_template_metadata(name)
        assert "subject" in meta
        assert "default_footer" in meta
        assert "default_cta_label" in meta
        assert "default_cta_url" in meta


def test_list_templates_includes_all_registered():
    listed = set(list_templates())
    assert set(REGISTERED_TEMPLATES).issubset(listed)


# ── render_template ───────────────────────────────────────────────────────────


def test_render_interview_reminder_contains_context_values():
    html = render_template(
        "interview_reminder",
        {
            "full_name": "Ada Lovelace",
            "job_title": "Principal Engineer",
            "scheduled_at": "2026-07-01 10:00 UTC",
            "interview_type": "Technical",
            "duration_minutes": 60,
            "location": "Zoom",
            "interviewer_name": "Grace Hopper",
            "interviewer_title": "CTO",
        },
    )
    assert "Ada Lovelace" in html
    assert "Principal Engineer" in html
    assert "2026-07-01 10:00 UTC" in html
    assert "Technical" in html
    assert "60" in html
    assert "Zoom" in html
    assert "Grace Hopper" in html
    assert "CTO" in html


def test_render_candidate_status_change_contains_context_values():
    html = render_template(
        "candidate_status_change",
        {
            "recruiter_name": "Sam Recruiter",
            "candidate_name": "Linus Torvalds",
            "candidate_email": "linus@kernel.org",
            "job_title": "Kernel Architect",
            "previous_status": "Screening",
            "new_status": "Offer",
            "changed_by": "Sam Recruiter",
            "changed_at": "2026-06-06 12:00 UTC",
        },
    )
    assert "Sam Recruiter" in html
    assert "Linus Torvalds" in html
    assert "linus@kernel.org" in html
    assert "Kernel Architect" in html
    assert "Screening" in html
    assert "Offer" in html
    assert "2026-06-06 12:00 UTC" in html


def test_render_weekly_hiring_digest_contains_context_values():
    metrics = {
        "new_applications": 42,
        "interviews_conducted": 11,
        "offers_extended": 3,
        "hires": 1,
    }
    html = render_template(
        "weekly_hiring_digest",
        {
            "leader_name": "Pat Director",
            "tenant_name": "Acme Corp",
            "week_start": "2026-06-01",
            "week_end": "2026-06-07",
            "metrics": metrics,
            "highlights": ["Hired a senior engineer", "Reduced time-to-hire by 12%"],
            "open_roles": [
                {
                    "title": "Staff Backend Engineer",
                    "department": "Engineering",
                    "pipeline_count": 18,
                    "days_open": 7,
                }
            ],
            "risks": ["Two offers pending decision"],
            "report_format": "pdf",
        },
    )
    assert "Pat Director" in html
    assert "Acme Corp" in html
    assert "2026-06-01" in html
    assert "2026-06-07" in html
    assert "42" in html
    assert "11" in html
    assert "3" in html
    assert "1" in html
    assert "Hired a senior engineer" in html
    assert "Reduced time-to-hire by 12%" in html
    assert "Staff Backend Engineer" in html
    assert "Engineering" in html
    assert "18" in html
    assert "Two offers pending decision" in html
    assert "PDF" in html or "pdf" in html


def test_render_offer_letter_contains_context_values():
    html = render_template(
        "offer_letter",
        {
            "full_name": "Margaret Hamilton",
            "company_name": "AI-ROS",
            "job_title": "VP of Engineering",
            "job_level": "L6",
            "start_date": "2026-08-01",
            "manager_name": "Grace Hopper",
            "manager_title": "CTO",
            "location": "Remote",
            "work_mode": "Remote",
            "compensation_html": "<strong>$250,000</strong> base + equity",
            "benefits_html": "<ul><li>Unlimited PTO</li><li>Health</li></ul>",
            "extra_html": "<em>Sign-on bonus $25k</em>",
            "offer_expiry": "2026-07-15",
        },
    )
    assert "Margaret Hamilton" in html
    assert "AI-ROS" in html
    assert "VP of Engineering" in html
    assert "L6" in html
    assert "2026-08-01" in html
    assert "Grace Hopper" in html
    assert "CTO" in html
    assert "Remote" in html
    assert "$250,000" in html
    assert "Unlimited PTO" in html
    assert "Sign-on bonus $25k" in html
    assert "2026-07-15" in html


_MINIMAL_CONTEXTS: dict[str, dict] = {
    "interview_reminder": {
        "full_name": "Test User",
        "job_title": "Test Job",
        "scheduled_at": "2026-06-07 10:00 UTC",
        "interview_type": "Technical",
        "duration_minutes": 60,
    },
    "candidate_status_change": {
        "recruiter_name": "Test Recruiter",
        "candidate_name": "Test Candidate",
        "candidate_email": "c@example.com",
        "job_title": "Test Job",
        "previous_status": "Screening",
        "new_status": "Offer",
    },
    "weekly_hiring_digest": {
        "leader_name": "Test Leader",
        "tenant_name": "Test Tenant",
        "week_start": "2026-06-01",
        "week_end": "2026-06-07",
        "metrics": {
            "new_applications": 0,
            "interviews_conducted": 0,
            "offers_extended": 0,
            "hires": 0,
        },
        "report_format": "pdf",
    },
    "offer_letter": {
        "full_name": "Test Candidate",
        "company_name": "Test Co",
        "job_title": "Engineer",
        "start_date": "2026-08-01",
        "manager_name": "Test Manager",
        "location": "Remote",
        "work_mode": "Remote",
        "compensation_html": "TBD",
        "offer_expiry": "2026-07-15",
    },
}


@pytest.mark.parametrize("name", REGISTERED_TEMPLATES)
def test_render_template_returns_non_empty_string(name: str):
    html = render_template(name, _MINIMAL_CONTEXTS[name])
    assert isinstance(html, str)
    assert html.strip() != ""


def test_render_template_missing_raises():
    with pytest.raises(Exception):
        render_template("nonexistent_template", {})


def test_template_files_exist_on_disk():
    """All registered templates must have a backing ``.html`` file."""
    templates_dir = Path(__file__).resolve().parents[1] / "apps" / "mailing_service" / "templates"
    for name in REGISTERED_TEMPLATES:
        path = templates_dir / f"{name}.html"
        assert path.is_file(), f"Missing template file: {path}"
