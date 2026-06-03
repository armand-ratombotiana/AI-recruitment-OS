"""Validation proof tests for authentication system."""
import pytest
import httpx
import json
from datetime import datetime

BASE = "http://localhost:8000/api/v1"


@pytest.fixture
def client():
    with httpx.Client(base_url=BASE, timeout=30) as c:
        yield c


class TestPasswordHashingProof:
    def test_password_not_in_response(self, client):
        """PROOF: Password is never returned in any API response."""
        import uuid
        email = f"proof_{uuid.uuid4().hex[:8]}@example.com"
        password = "MySecretP@ss123"

        # Register
        r = client.post("/auth/register", json={
            "email": email, "full_name": "Proof User", "password": password
        })
        assert r.status_code == 200
        response_text = json.dumps(r.json())
        assert password not in response_text, "Password should NOT appear in register response"

        # Login
        r = client.post("/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200
        response_text = json.dumps(r.json())
        assert password not in response_text, "Password should NOT appear in login response"

        # Me
        token = r.json()["access_token"]
        r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        response_text = json.dumps(r.json())
        assert password not in response_text, "Password should NOT appear in /me response"


class TestJWTTokenProof:
    def test_token_contains_correct_data(self, client):
        """PROOF: JWT tokens contain correct user data."""
        import uuid
        from jose import jwt as jose_jwt
        import base64, json

        email = f"jwt_{uuid.uuid4().hex[:8]}@example.com"
        r = client.post("/auth/register", json={
            "email": email, "full_name": "JWT Test", "password": "SecureP@ss123"
        })
        assert r.status_code == 200
        token = r.json()["access_token"]

        # Decode JWT payload (middle part) without verification
        parts = token.split(".")
        payload_bytes = parts[1] + "=" * (4 - len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_bytes))
        assert payload.get("email") == email, f"Token should contain correct email, got {payload.get('email')}"
        assert "exp" in payload, "Token should have expiry"
        assert "sub" in payload, "Token should have subject (user ID)"

    def test_token_expiry(self, client):
        """PROOF: Tokens have proper expiry timestamps."""
        import uuid
        import base64, json

        email = f"exp_{uuid.uuid4().hex[:8]}@example.com"
        r = client.post("/auth/register", json={
            "email": email, "full_name": "Expiry Test", "password": "SecureP@ss123"
        })
        token = r.json()["access_token"]

        parts = token.split(".")
        payload_bytes = parts[1] + "=" * (4 - len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_bytes))

        exp = payload.get("exp")
        assert exp is not None
        # Token should expire in the future
        assert exp > datetime.utcnow().timestamp()


class TestDuplicateEmailProof:
    def test_duplicate_email_rejected(self, client):
        """PROOF: Duplicate email registration is rejected with 409."""
        import uuid
        email = f"dup_{uuid.uuid4().hex[:8]}@example.com"

        r1 = client.post("/auth/register", json={
            "email": email, "full_name": "First User", "password": "SecureP@ss123"
        })
        assert r1.status_code == 200

        r2 = client.post("/auth/register", json={
            "email": email, "full_name": "Second User", "password": "SecureP@ss123"
        })
        assert r2.status_code == 409, f"Expected 409, got {r2.status_code}"
        assert "already exists" in r2.json().get("detail", "")


class TestWrongPasswordProof:
    def test_wrong_password_rejected(self, client):
        """PROOF: Wrong password is rejected with 401."""
        import uuid
        email = f"wp_{uuid.uuid4().hex[:8]}@example.com"

        client.post("/auth/register", json={
            "email": email, "full_name": "WP Test", "password": "SecureP@ss123"
        })

        r = client.post("/auth/login", json={"email": email, "password": "WrongPassword1"})
        assert r.status_code == 401


class TestMeEndpointProof:
    def test_me_requires_authentication(self, client):
        """PROOF: /me endpoint requires valid authentication."""
        r = client.get("/auth/me")
        assert r.status_code in (401, 403)

    def test_me_returns_correct_user(self, client):
        """PROOF: /me returns the correct authenticated user."""
        import uuid
        email = f"me_{uuid.uuid4().hex[:8]}@example.com"

        r = client.post("/auth/register", json={
            "email": email, "full_name": "Me Test", "password": "SecureP@ss123"
        })
        token = r.json()["access_token"]

        r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == email
        assert data["full_name"] == "Me Test"
        assert "id" in data
        assert "role" in data
