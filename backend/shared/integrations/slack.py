"""Slack integration helpers.

Pure utility functions used by the integrations service (and by any other
code that wants to push a chat message to a Slack incoming webhook):

* :func:`send_slack_message` — POST a JSON payload to a Slack incoming
  webhook, returning ``True`` on a 2xx response.
* :func:`format_candidate_notification` — render a candidate event
  (e.g. ``candidate.created``) as a list of Slack Block Kit blocks.
* :func:`format_interview_notification` — render an interview + candidate
  pair as a list of Slack Block Kit blocks.

The formatters accept any object that exposes the relevant attributes
(SQLModel row, dict, ``SimpleNamespace`` …) so they can be unit-tested
without a database.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

import httpx


DEFAULT_TIMEOUT_S = 10.0


# ── Field extraction helpers ──────────────────────────────────────────────────


def _candidate_field(candidate: Any, key: str, default: Any = None) -> Any:
    """Read a field from a candidate-like object, accepting both SQLModel
    rows and dicts."""
    if candidate is None:
        return default
    if isinstance(candidate, dict):
        return candidate.get(key, default)
    return getattr(candidate, key, default)


def _interview_field(interview: Any, key: str, default: Any = None) -> Any:
    if interview is None:
        return default
    if isinstance(interview, dict):
        return interview.get(key, default)
    return getattr(interview, key, default)


def _format_dt(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M UTC")
    return str(value)


def _truncate(text: str, limit: int) -> str:
    if not text:
        return ""
    return text if len(text) <= limit else text[: max(0, limit - 1)] + "…"


# ── Event metadata ────────────────────────────────────────────────────────────


_EVENT_TITLES: dict[str, str] = {
    "candidate.created": "New Candidate",
    "candidate.updated": "Candidate Updated",
    "candidate.deleted": "Candidate Removed",
    "candidate.hired": "Candidate Hired",
    "candidate.rejected": "Candidate Rejected",
    "interview.scheduled": "Interview Scheduled",
    "interview.started": "Interview Started",
    "interview.completed": "Interview Completed",
    "interview.cancelled": "Interview Cancelled",
    "job.created": "New Job",
    "job.updated": "Job Updated",
    "offer.extended": "Offer Extended",
    "offer.accepted": "Offer Accepted",
    "offer.declined": "Offer Declined",
    "slack.test": "Slack Test",
}


def _event_emoji(event: str) -> str:
    return {
        "candidate.created": ":sparkles:",
        "candidate.updated": ":pencil2:",
        "candidate.hired": ":tada:",
        "candidate.rejected": ":x:",
        "interview.scheduled": ":calendar:",
        "interview.started": ":movie_camera:",
        "interview.completed": ":white_check_mark:",
        "interview.cancelled": ":no_entry_sign:",
        "job.created": ":briefcase:",
        "job.updated": ":pencil2:",
        "offer.extended": ":envelope:",
        "offer.accepted": ":tada:",
        "offer.declined": ":x:",
        "slack.test": ":test_tube:",
    }.get(event, ":bell:")


def _event_title(event: str) -> str:
    return _EVENT_TITLES.get(event) or event.replace(".", " ").replace("_", " ").title()


# ── Public formatters ─────────────────────────────────────────────────────────


def format_candidate_notification(candidate: Any, event: str) -> list[dict[str, Any]]:
    """Build Slack Block Kit blocks for a candidate event notification.

    The first block is a header with the candidate's name; the second is a
    two-column section with the most useful fields; the third is a context
    block that shows the event name and candidate id.
    """
    name = (
        _candidate_field(candidate, "full_name")
        or _candidate_field(candidate, "name")
        or "Unknown candidate"
    )
    status = _candidate_field(candidate, "status", "—")
    email = _candidate_field(candidate, "email", "—")
    location = _candidate_field(candidate, "location", "—")
    source = _candidate_field(candidate, "source", "—")
    cid = _candidate_field(candidate, "id", "—")

    title = f"{_event_emoji(event)} {_event_title(event)}: {name}"
    return [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": _truncate(title, 150)},
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Status:*\n{status}"},
                {"type": "mrkdwn", "text": f"*Email:*\n{email}"},
                {"type": "mrkdwn", "text": f"*Location:*\n{location}"},
                {"type": "mrkdwn", "text": f"*Source:*\n{source}"},
            ],
        },
        {
            "type": "context",
            "elements": [
                {"type": "mrkdwn", "text": f"Event: `{event}` • ID: `{cid}`"},
            ],
        },
    ]


def format_interview_notification(interview: Any, candidate: Any) -> list[dict[str, Any]]:
    """Build Slack Block Kit blocks for an interview notification."""
    c_name = (
        _candidate_field(candidate, "full_name")
        or _candidate_field(candidate, "name")
        or "Unknown candidate"
    )
    i_type = _interview_field(interview, "interview_type", "—")
    i_status = _interview_field(interview, "status", "—")
    i_scheduled = _format_dt(_interview_field(interview, "scheduled_at"))
    i_duration = _interview_field(interview, "duration_minutes", 60)
    i_id = _interview_field(interview, "id", "—")
    i_is_ai = bool(_interview_field(interview, "is_ai_interview", False))

    return [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": _truncate(f":calendar: Interview — {c_name}", 150),
            },
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Type:*\n{i_type}"},
                {"type": "mrkdwn", "text": f"*Status:*\n{i_status}"},
                {"type": "mrkdwn", "text": f"*When:*\n{i_scheduled}"},
                {"type": "mrkdwn", "text": f"*Duration:*\n{i_duration} min"},
            ],
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Mode:* {'AI' if i_is_ai else 'Human'}",
            },
        },
        {
            "type": "context",
            "elements": [
                {"type": "mrkdwn", "text": f"Interview ID: `{i_id}`"},
            ],
        },
    ]


# ── HTTP transport ────────────────────────────────────────────────────────────


async def send_slack_message(
    webhook_url: str,
    message: str,
    blocks: Optional[list[dict[str, Any]]] = None,
    timeout_s: float = DEFAULT_TIMEOUT_S,
) -> bool:
    """POST a message to a Slack incoming webhook.

    Returns ``True`` if the receiver responded with a 2xx status code,
    ``False`` on any other response or transport error.

    Slack incoming webhooks ignore the response body and only inspect the
    status code — anything other than 200 is a failure.
    """
    if not webhook_url:
        return False
    payload: dict[str, Any] = {"text": message or ""}
    if blocks:
        payload["blocks"] = blocks
    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            resp = await client.post(
                webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
        return 200 <= resp.status_code < 300
    except httpx.HTTPError:
        return False
