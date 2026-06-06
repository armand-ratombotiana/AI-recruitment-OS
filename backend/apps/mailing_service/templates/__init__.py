"""Email template metadata for the new file-based templates.

Each entry maps a template name (without ``.html`` suffix) to the metadata
needed to render and dispatch a complete email:

* ``subject``       — Jinja2 template for the email subject line
* ``default_footer``— Footer text used when callers do not supply their own
* ``default_cta_label`` / ``default_cta_url`` — Optional CTA button
"""
from __future__ import annotations

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
    """Return metadata for a template or raise ``KeyError``."""
    return TEMPLATE_METADATA[name]
