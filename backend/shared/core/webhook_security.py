"""Incoming webhook signature verification (HMAC-SHA256).

Used by ``POST /billing/webhook`` (Stripe) and the future
``/integrations/*`` family.  Verifies the ``X-Signature`` header against
the shared secret using a constant-time comparison.  Logs every
verification failure with the request id for traceability.

Header format
-------------
``X-Signature: sha256=<hex>``

The signature is computed over the **raw** request body using the
shared secret.  The body must NOT be re-serialized (e.g. from a parsed
JSON dict) before signing.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
from typing import Any

from fastapi import Header, HTTPException, Request, status

logger = logging.getLogger("webhook_security")

SIGNATURE_PREFIX = "sha256="
TOLERANCE_SECONDS = 300  # 5 min window for `t=` timestamp param (if present)


def _resolve_secret(secret: str | None) -> str | None:
    if secret:
        return secret
    return os.getenv("INCOMING_WEBHOOK_SECRET") or os.getenv("STRIPE_WEBHOOK_SECRET") or None


def _extract_signature(header_value: str | None) -> str | None:
    """Return the raw hex digest (without the ``sha256=`` prefix) or None."""
    if not header_value:
        return None
    header_value = header_value.strip()
    if header_value.startswith(SIGNATURE_PREFIX):
        return header_value[len(SIGNATURE_PREFIX):]
    # Some clients send the bare hex digest.
    if all(c in "0123456789abcdefABCDEF" for c in header_value):
        return header_value
    return None


def compute_signature(secret: str, payload: bytes) -> str:
    """Compute the HMAC-SHA256 hex digest of ``payload`` using ``secret``."""
    mac = hmac.new(secret.encode("utf-8"), msg=payload, digestmod=hashlib.sha256)
    return mac.hexdigest()


def verify_signature(secret: str, payload: bytes, signature_header: str | None) -> bool:
    """Constant-time verification of the signature header."""
    provided = _extract_signature(signature_header)
    if not provided:
        return False
    expected = compute_signature(secret, payload)
    return hmac.compare_digest(provided, expected)


async def require_valid_signature(
    request: Request,
    x_signature: str | None = Header(default=None, alias="X-Signature"),
    secret: str | None = None,
) -> bytes:
    """FastAPI dependency that verifies the request signature.

    Returns the raw request body when verification succeeds; raises 401
    otherwise.  The body is also cached on ``request.state.webhook_body``
    so downstream handlers don't have to re-read it.
    """
    body = await request.body()
    if getattr(request.state, "webhook_body", None) is None:
        request.state.webhook_body = body

    secret_value = _resolve_secret(secret)
    if not secret_value:
        # Fail closed when no secret is configured — this is a hard security
        # boundary and we don't want to silently allow unverified webhooks.
        rid = getattr(request.state, "request_id", "unknown")
        logger.error("webhook signature verification skipped: no secret configured (rid=%s)", rid)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Webhook signing secret is not configured",
        )

    if not verify_signature(secret_value, body, x_signature):
        rid = getattr(request.state, "request_id", "unknown")
        client = request.client.host if request.client else "unknown"
        logger.warning(
            "webhook signature verification failed (rid=%s ip=%s len=%d)",
            rid,
            client,
            len(body),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )
    return body
