"""Email template registry for AI-ROS.

Exposes two layers of helpers:

* :data:`TEMPLATE_METADATA` and :func:`get_template_metadata` — used by
  :mod:`apps.mailing_service.main` to render full email envelopes (subject,
  CTA, footer) from a single template name.

* :func:`get_template` and :func:`render_template` — a thin registry layer
  that loads a template file by name and renders it through the shared
  Jinja2 environment.

Template files live alongside this ``__init__`` (``interview_reminder.html``,
``candidate_status_change.html``, ``weekly_hiring_digest.html``,
``offer_letter.html`` and the shared ``_base.html`` layout).
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape


# ── Metadata registry (used by mailing_service.main) ──────────────────────────

TEMPLATE_METADATA: dict[str, dict[str, str]] = {
    "interview_reminder": {
        "subject": "Interview Reminder — {{ job_title }} on {{ scheduled_at }}",
        "default_footer": (
            "If you need to reschedule, reply to this email at least 12 hours "
            "before the interview."
        ),
        "default_cta_label": "View Interview Details",
        "default_cta_url": "/interviews",
    },
    "candidate_status_change": {
        "subject": "Candidate Update — {{ candidate_name }} is now {{ new_status }}",
        "default_footer": (
            "You are receiving this because you are assigned to the "
            "candidate's hiring pipeline."
        ),
        "default_cta_label": "Open Candidate",
        "default_cta_url": "/candidates",
    },
    "weekly_hiring_digest": {
        "subject": "Weekly Hiring Digest — {{ week_start }} to {{ week_end }}",
        "default_footer": (
            "This digest is generated automatically every Monday at 09:00 UTC. "
            "Reply to this email to reach the People Ops team."
        ),
        "default_cta_label": "Open Hiring Dashboard",
        "default_cta_url": "/analytics/hiring",
    },
    "offer_letter": {
        "subject": "Your offer from {{ company_name }} — {{ job_title }}",
        "default_footer": (
            "We are excited to have you join the team. Please respond by the "
            "date listed in the offer letter."
        ),
        "default_cta_label": "Review &amp; Respond to Offer",
        "default_cta_url": "/offers",
    },
}


def get_template_metadata(name: str) -> dict[str, str]:
    """Return metadata for a template or raise :class:`KeyError`."""
    return TEMPLATE_METADATA[name]


def list_templates() -> list[str]:
    """Return the list of registered template names."""
    return sorted(TEMPLATE_METADATA.keys())


# ── Jinja2 environment & registry helpers ─────────────────────────────────────

_TEMPLATES_DIR = Path(__file__).resolve().parent

_jinja_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(enabled_extensions=("html",), default_for_string=False),
    trim_blocks=True,
    lstrip_blocks=True,
)


def _normalize_name(name: str) -> str:
    """Strip a trailing ``.html`` if present so callers can pass either form."""
    return name[:-5] if name.endswith(".html") else name


def get_template(name: str) -> str:
    """Load the raw contents of a template file by name.

    The ``name`` argument may include or omit the ``.html`` suffix. The file
    is resolved relative to the ``apps/mailing_service/templates`` directory
    and the source text is returned verbatim — no rendering is performed.

    Raises
    ------
    FileNotFoundError
        If no matching ``.html`` file exists in the templates directory.
    """
    template_name = _normalize_name(name)
    rel_path = f"{template_name}.html"
    loader = _jinja_env.loader
    try:
        source = loader.get_source(_jinja_env, rel_path)
    except Exception as exc:  # jinja2.TemplateNotFound inherits from Exception
        raise FileNotFoundError(
            f"Email template '{rel_path}' not found in {_TEMPLATES_DIR}"
        ) from exc
    return source[0]


def render_template(name: str, context: dict[str, Any] | None = None) -> str:
    """Render ``name`` with the given ``context`` using Jinja2.

    Returns the rendered string. The shared :file:`_base.html` layout is
    *not* applied here — only the body template is rendered. Callers that
    want the full email envelope should use
    :func:`apps.mailing_service.main.render_email_template`.
    """
    template_name = _normalize_name(name)
    rel_path = f"{template_name}.html"
    template = _jinja_env.get_template(rel_path)
    return template.render(**(context or {}))
