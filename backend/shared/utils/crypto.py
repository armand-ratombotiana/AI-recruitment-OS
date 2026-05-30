from __future__ import annotations
import hashlib
import secrets

def hash_string(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()

def generate_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)
