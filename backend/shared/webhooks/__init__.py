"""Outgoing webhook dispatcher package.

Public entry points:

* :func:`dispatch_event`        — fan-out an event to every active webhook
  for the tenant that subscribed to it.  Raises on failure.
* :func:`safe_dispatch_event`   — same as :func:`dispatch_event` but never
  raises (best-effort delivery for API endpoints).
* :func:`sign_payload`          — HMAC-SHA256 signing helper.
* :func:`deliver_with_retries`  — single-webhook retry loop.
"""
from shared.webhooks.dispatcher import (
    dispatch_event,
    dispatch_event_to_webhook,
    safe_dispatch_event,
    deliver_with_retries,
    sign_payload,
    DEFAULT_MAX_ATTEMPTS,
    DEFAULT_BACKOFF_BASE_S,
    DEFAULT_TIMEOUT_S,
)

__all__ = [
    "dispatch_event",
    "dispatch_event_to_webhook",
    "safe_dispatch_event",
    "deliver_with_retries",
    "sign_payload",
    "DEFAULT_MAX_ATTEMPTS",
    "DEFAULT_BACKOFF_BASE_S",
    "DEFAULT_TIMEOUT_S",
]
