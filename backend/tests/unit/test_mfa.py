"""Tests for shared.auth.mfa — TOTP generation, verification, otpauth URLs."""
from __future__ import annotations

import time

import pytest

from shared.auth.mfa import (
    generate_backup_codes,
    generate_secret,
    otpauth_url,
    verify_totp,
)


# ── generate_secret ──────────────────────────────────────────────────────────


def test_generate_secret_length():
    s = generate_secret()
    # 20 raw bytes base32-encoded without padding = 32 chars
    assert len(s) == 32
    # base32 alphabet
    assert all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567" for c in s)


def test_generate_secret_unique():
    a = generate_secret()
    b = generate_secret()
    assert a != b


# ── otpauth_url ───────────────────────────────────────────────────────────────


def test_otpauth_url_format():
    url = otpauth_url(generate_secret(), "user@acme.com", issuer="Acme")
    assert url.startswith("otpauth://totp/")
    assert "secret=" in url
    assert "issuer=Acme" in url
    assert "algorithm=SHA1" in url
    assert "digits=6" in url
    assert "period=30" in url


def test_otpauth_url_escapes_label():
    url = otpauth_url(generate_secret(), "user@acme.com", issuer="Acme Inc")
    # @ must be percent-encoded in the label
    assert "user%40acme.com" in url


# ── verify_totp ───────────────────────────────────────────────────────────────


def test_verify_totp_accepts_current_code():
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.twofactor.totp import TOTP

    secret = generate_secret()
    padded = secret + "=" * ((8 - len(secret) % 8) % 8)
    import base64
    key = base64.b32decode(padded.upper())
    expected = TOTP(key, length=6, algorithm=hashes.SHA1(), time_step=30).generate(int(time.time())).decode("ascii")
    assert verify_totp(secret, expected)


def test_verify_totp_rejects_garbage():
    assert verify_totp(generate_secret(), "abcdef") is False  # non-digit
    assert verify_totp(generate_secret(), "123") is False  # too short
    assert verify_totp(generate_secret(), "1234567") is False  # too long


def test_verify_totp_rejects_old_code():
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.twofactor.totp import TOTP
    import base64

    secret = generate_secret()
    padded = secret + "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(padded.upper())
    # Code from 5 minutes ago — outside the ±30s default window
    old_code = TOTP(key, length=6, algorithm=hashes.SHA1(), time_step=30).generate(int(time.time()) - 300).decode("ascii")
    assert verify_totp(secret, old_code) is False


def test_verify_totp_wider_window_accepts_neighbouring_step():
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.twofactor.totp import TOTP
    import base64

    secret = generate_secret()
    padded = secret + "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(padded.upper())
    # Code from one step ago — should match with valid_window=1 (default)
    prev_code = TOTP(key, length=6, algorithm=hashes.SHA1(), time_step=30).generate(int(time.time()) - 30).decode("ascii")
    assert verify_totp(secret, prev_code)


# ── generate_backup_codes ─────────────────────────────────────────────────────


def test_backup_codes_default_count():
    codes = generate_backup_codes()
    assert len(codes) == 10
    assert len(set(codes)) == 10  # all unique
    assert all(len(c) == 8 for c in codes)


def test_backup_codes_custom_count():
    codes = generate_backup_codes(count=5)
    assert len(codes) == 5
