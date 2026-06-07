"""2FA helpers built on top of the ``pyotp`` library.

Public API
----------
* ``generate_secret()`` — 20 random bytes, base32-encoded (no padding)
* ``verify_totp(secret, code, valid_window=1)`` — RFC 6238 TOTP verification
* ``generate_backup_codes(count=10)`` — one-time recovery codes
* ``provisioning_uri(secret, account, issuer)`` — otpauth:// URL
* ``qr_data_url(otpauth_url)`` — base64 PNG ``data:`` URL for the QR code
"""
from __future__ import annotations

import base64
import io
import secrets
import string
from typing import Final

import pyotp
import qrcode


_DIGITS: Final[int] = 6
_INTERVAL: Final[int] = 30


def generate_secret(length: int = 32) -> str:
    """Return a base32-encoded TOTP secret suitable for storage and QR codes.

    ``length`` is the number of base32 characters (default 32 → 160 bits of
    entropy, the minimum recommended by RFC 6238 §5.1).
    """
    return pyotp.random_base32(length=length)


def verify_totp(secret: str, code: str, valid_window: int = 1) -> bool:
    """Validate ``code`` against the current TOTP step within ``valid_window`` steps."""
    if not secret or not code:
        return False
    code = str(code).strip()
    if not code.isdigit() or len(code) != _DIGITS:
        return False
    try:
        totp = pyotp.TOTP(secret, digits=_DIGITS, interval=_INTERVAL)
        return totp.verify(code, valid_window=valid_window)
    except Exception:
        return False


def provisioning_uri(secret: str, account: str, issuer: str = "AI-ROS") -> str:
    """Return the otpauth:// URL an authenticator app can consume."""
    return pyotp.TOTP(secret, digits=_DIGITS, interval=_INTERVAL).provisioning_uri(
        name=account, issuer_name=issuer
    )


def qr_data_url(otpauth_url: str) -> str:
    """Render ``otpauth_url`` as a base64-encoded PNG data URL (for inline <img>)."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(otpauth_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


_BACKUP_ALPHABET = string.ascii_uppercase + string.digits


def generate_backup_codes(count: int = 10, length: int = 10) -> list[str]:
    """Return ``count`` random, human-friendly recovery codes.

    Each code contains only uppercase letters and digits to keep them easy to
    transcribe.  A dash is inserted at the midpoint for readability
    (e.g. ``"AB3F-7K9P"``).
    """
    codes: list[str] = []
    while len(codes) < count:
        raw = "".join(secrets.choice(_BACKUP_ALPHABET) for _ in range(length))
        formatted = f"{raw[: length // 2]}-{raw[length // 2:]}"
        codes.append(formatted)
    return codes


def hash_backup_code(code: str) -> str:
    """Return a stable hash of ``code`` suitable for set membership checks."""
    import hashlib

    return hashlib.sha256(code.strip().upper().encode("utf-8")).hexdigest()
