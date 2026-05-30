"""Unit tests for shared.core.security — JWT, password hashing, API keys."""

from __future__ import annotations

from datetime import timedelta

import pytest

from shared.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_api_key,
    hash_api_key,
)


pytestmark = [pytest.mark.unit, pytest.mark.security]


class TestPasswordHashing:
    def test_hash_password_returns_string(self):
        result = hash_password("MySecurePass123!")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_verify_password_correct(self):
        plain = "MySecurePass123!"
        hashed = hash_password(plain)
        assert verify_password(plain, hashed) is True

    def test_verify_password_incorrect(self):
        hashed = hash_password("CorrectPassword")
        assert verify_password("WrongPassword", hashed) is False

    def test_different_hashes_for_same_input(self):
        h1 = hash_password("same_password")
        h2 = hash_password("same_password")
        assert h1 != h2

    def test_empty_password(self):
        hashed = hash_password("")
        assert verify_password("", hashed) is True


class TestJWTTokens:
    def test_create_access_token(self):
        token = create_access_token({"sub": "user@example.com", "tenant_id": "t1"})
        assert isinstance(token, str)
        assert len(token) > 0

    def test_decode_access_token(self):
        data = {"sub": "user@example.com", "tenant_id": "t1"}
        token = create_access_token(data)
        decoded = decode_token(token)
        assert decoded is not None
        assert decoded["sub"] == "user@example.com"
        assert decoded["tenant_id"] == "t1"
        assert decoded["type"] == "access"

    def test_decode_expired_token(self):
        token = create_access_token(
            {"sub": "user@example.com"},
            expires_delta=timedelta(seconds=-1),
        )
        decoded = decode_token(token)
        assert decoded is None

    def test_create_refresh_token(self):
        data = {"sub": "user@example.com", "tenant_id": "t1"}
        token = create_refresh_token(data)
        decoded = decode_token(token)
        assert decoded is not None
        assert decoded["type"] == "refresh"

    def test_decode_invalid_token(self):
        decoded = decode_token("invalid.token.value")
        assert decoded is None

    def test_custom_expires_delta(self):
        token = create_access_token(
            {"sub": "user@example.com"},
            expires_delta=timedelta(minutes=5),
        )
        decoded = decode_token(token)
        assert decoded is not None


class TestAPIKeyGeneration:
    def test_generate_api_key_format(self):
        key = generate_api_key()
        assert isinstance(key, str)
        assert len(key) > 0

    def test_generate_unique_keys(self):
        keys = {generate_api_key() for _ in range(100)}
        assert len(keys) == 100

    def test_hash_api_key(self):
        key = generate_api_key()
        hashed = hash_api_key(key)
        assert isinstance(hashed, str)
        assert len(hashed) == 64

    def test_hash_api_key_deterministic(self):
        key = "test-api-key-123"
        h1 = hash_api_key(key)
        h2 = hash_api_key(key)
        assert h1 == h2

    def test_hash_api_key_differs_from_key(self):
        key = "test-api-key-123"
        hashed = hash_api_key(key)
        assert hashed != key
