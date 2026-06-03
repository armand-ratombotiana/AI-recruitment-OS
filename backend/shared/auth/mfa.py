"""MFA / TOTP helpers built on the stdlib ``cryptography`` package.

We avoid adding ``pyotp`` / ``qrcode`` as dependencies — the ``cryptography``
HOTP/TOTP primitives are enough to build a standards-compliant (RFC 6238)
time-based one-time password implementation.

Public API
----------
* ``generate_secret()`` — 20 random bytes, base32-encoded for storage
* ``otpauth_url(secret, account, issuer)`` — the URL the user's authenticator
  app scans or pastes into its manual-entry field
* ``verify_totp(secret, code, valid_window=1)`` — returns True iff the code
  matches within ``±valid_window`` time steps (default ±30s)
* ``generate_backup_codes(n=10)`` — one-time recovery codes
"""
from __future__ import annotations

import base64
import secrets
import time
import urllib.parse

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.twofactor import InvalidToken
from cryptography.hazmat.primitives.twofactor.totp import TOTP


# Standard TOTP parameters per RFC 6238: 30-second time step, 6-digit codes.
_TIME_STEP = 30
_DIGITS = 6
_ALGORITHM = hashes.SHA1()


def generate_secret(num_bytes: int = 20) -> str:
    """Generate a base32-encoded TOTP secret suitable for storage and QR codes."""
    raw = secrets.token_bytes(num_bytes)
    return base64.b32encode(raw).decode("ascii").rstrip("=")


def otpauth_url(secret: str, account: str, issuer: str = "AI-ROS") -> str:
    """Return the otpauth:// URL an authenticator app understands."""
    label = urllib.parse.quote(f"{issuer}:{account}", safe="")
    params = urllib.parse.urlencode({
        "secret": secret,
        "issuer": issuer,
        "algorithm": "SHA1",
        "digits": _DIGITS,
        "period": _TIME_STEP,
    })
    return f"otpauth://totp/{label}?{params}"


def verify_totp(secret: str, code: str, valid_window: int = 1) -> bool:
    """Check ``code`` against the current TOTP step ± ``valid_window`` steps.

    ``cryptography``'s TOTP.verify does not accept a window parameter, so we
    iterate through the candidate time values ourselves.
    """
    if not code or not code.isdigit() or len(code) != _DIGITS:
        return False
    try:
        key = _decode_secret(secret)
        totp = TOTP(key, length=_DIGITS, algorithm=_ALGORITHM, time_step=_TIME_STEP)
        now = int(time.time())
        for offset in range(-valid_window, valid_window + 1):
            try:
                totp.verify(code.encode("ascii"), now + offset * _TIME_STEP)
                return True
            except InvalidToken:
                continue
        return False
    except Exception:
        return False


def generate_backup_codes(count: int = 10) -> list[str]:
    """Return ``count`` random 8-character hex recovery codes."""
    return [secrets.token_hex(4).upper() for _ in range(count)]


def _decode_secret(secret: str) -> bytes:
    """Restore the raw bytes from a base32-encoded secret (with or without padding)."""
    padded = secret + "=" * ((8 - len(secret) % 8) % 8)
    return base64.b32decode(padded.upper())
