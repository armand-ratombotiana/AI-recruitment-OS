"""Microsoft Teams integration helpers.

Pure utility functions for pushing chat messages to a Teams incoming
webhook connector:

* :func:`send_teams_message` — POST a JSON payload (text + optional
  MessageCard) to a Teams connector URL.
* :func:`format_candidate_card` — render a candidate event as a
  legacy Office 365 ``MessageCard`` (the format accepted by Teams
  incoming webhooks).

Formatters accept any object that exposes the relevant attributes, the
same as the Slack module.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx


DEFAULT_TIMEOUT_S = 10.0


# ── Field extraction helpers ──────────────────────────────────────────────────


def _candidate_field(candidate: Any, key: str, default: Any = None) -> Any:
    if candidate is None:
        return default
    if isinstance(candidate, dict):
        return candidate.get(key, default)
    return getattr(candidate, key, default)


def _event_title(event: str) -> str:
    titles = {
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
        "teams.test": "Teams Test",
    }
    return titles.get(event) or event.replace(".", " ").replace("_", " ").title()


def _event_color(event: str) -> str:
    return {
        "candidate.created": "0078D4",   # blue
        "candidate.updated": "FFB900",   # amber
        "candidate.deleted": "8A8886",   # gray
        "candidate.hired": "107C10",     # green
        "candidate.rejected": "D13438",  # red
        "interview.scheduled": "5C2D91",
        "interview.started": "0078D4",
        "interview.completed": "107C10",
        "interview.cancelled": "D13438",
        "job.created": "0078D4",
        "job.updated": "FFB900",
        "offer.extended": "0078D4",
        "offer.accepted": "107C10",
        "offer.declined": "D13438",
        "teams.test": "5C2D91",
    }.get(event, "0078D4")


# ── Public formatters ─────────────────────────────────────────────────────────


def format_candidate_card(candidate: Any, event: str) -> dict[str, Any]:
    """Build a Teams ``MessageCard`` for a candidate event.

    The resulting dict conforms to the legacy Office 365 connector card
    format that Teams incoming webhooks accept out of the box.
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

    title = f"{_event_title(event)}: {name}"
    return {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": title,
        "themeColor": _event_color(event),
        "title": title,
        "sections": [
            {
                "activityTitle": f"Candidate: {name}",
                "activitySubtitle": f"Event: {event}",
                "facts": [
                    {"name": "Status", "value": str(status)},
                    {"name": "Email", "value": str(email)},
                    {"name": "Location", "value": str(location)},
                    {"name": "Source", "value": str(source)},
                ],
                "markdown": True,
            }
        ],
        "potentialAction": [],
    }


# ── HTTP transport ────────────────────────────────────────────────────────────


async def send_teams_message(
    webhook_url: str,
    message: str,
    card: Optional[dict[str, Any]] = None,
    timeout_s: float = DEFAULT_TIMEOUT_S,
) -> bool:
    """POST a message to a Teams incoming webhook.

    Returns ``True`` on a 2xx response, ``False`` otherwise.

    The shape of the payload depends on whether ``card`` is supplied:

    * Without a card, a plain ``{"text": message}`` payload is sent.
    * With a card, the card fields are merged in and ``text`` is included
      as a fallback for clients that don't render the card.
    """
    if not webhook_url:
        return False
    if card:
        payload: dict[str, Any] = {**card, "text": message or card.get("summary", "")}
    else:
        payload = {"text": message or ""}
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
