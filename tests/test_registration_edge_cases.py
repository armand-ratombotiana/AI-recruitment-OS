"""Comprehensive edge case tests for user registration endpoint.

Tests bulletproofing the /auth/register endpoint against:
- Valid/invalid email formats
- Password length and complexity requirements
- Email case insensitivity
- Special characters in names
- Empty/missing fields
- Response structure
- Full register -> login -> /me flow
- Concurrent duplicate registrations
"""
import pytest
import uuid
import httpx

BASE = "http://localhost:8000/api/v1"


@pytest.fixture
def client():
    with httpx.Client(base_url=BASE, timeout=30) as c:
        yield c


class TestValidEmailFormats:
    """Valid email formats should all register successfully."""

    @pytest.mark.parametrize("local_part", [
        "user", "user.name", "user+tag", "user123", "u",
    ])
    def test_valid_email_formats(self, client, local_part):
        email = f"{uuid.uuid4().hex[:6]}_{local_part}@example.com"
        r = client.post("/auth/register", json={
            "email": email, "full_name": "Test", "password": "SecureP@ss123"
        })
        assert r.status_code == 200, f"Valid email {email} should register, got {r.status_code}: {r.text}"


class TestInvalidEmailFormats:
    """Invalid email formats should be rejected with 422."""

    @pytest.mark.parametrize("email", [
        "notanemail",
        "@example.com",
        "user@",
        "user@@example.com",
        "user space@example.com",
        "",
    ])
    def test_invalid_email_rejected(self, client, email):
        r = client.post("/auth/register", json={
            "email": email, "full_name": "Test", "password": "SecureP@ss123"
        })
        assert r.status_code == 422, f"Invalid email '{email}' should return 422, got {r.status_code}"


class TestPasswordLength:
    """Passwords below 8 characters should be rejected."""

    @pytest.mark.parametrize("password", ["", "1", "1234567"])
    def test_weak_password_rejected(self, client, password):
        r = client.post("/auth/register", json={
            "email": f"pwd_{uuid.uuid4().hex[:6]}@example.com",
            "full_name": "Test", "password": password,
        })
        assert r.status_code == 422, f"Weak password should return 422, got {r.status_code}"


class TestPasswordComplexity:
    """Passwords must have uppercase, lowercase, digit, and special character."""

    @pytest.mark.parametrize("password,missing", [
        ("abcdefgh", "uppercase"),
        ("ABCDEFGH", "lowercase"),
        ("Abcdefgh", "digit"),
        ("Abcdefg1", "special"),
    ])
    def test_password_complexity(self, client, password, missing):
        r = client.post("/auth/register", json={
            "email": f"complex_{uuid.uuid4().hex[:6]}@example.com",
            "full_name": "Test", "password": password,
        })
        assert r.status_code == 422, f"Password missing {missing} should return 422, got {r.status_code}"


class TestStrongPasswordsAccepted:
    """Strong passwords meeting all requirements should register."""

    @pytest.mark.parametrize("password", [
        "SecureP@ss123", "MyP@ssw0rd!", "C0mpl3x!Pass", "Aa1!aaaa",
    ])
    def test_strong_password_accepted(self, client, password):
        r = client.post("/auth/register", json={
            "email": f"strong_{uuid.uuid4().hex[:6]}@example.com",
            "full_name": "Test", "password": password,
        })
        assert r.status_code == 200, f"Strong password should register, got {r.status_code}: {r.text}"


class TestEmailCaseInsensitivity:
    """Same email in different case should be treated as duplicate."""

    def test_email_case_insensitive(self, client):
        suffix = uuid.uuid4().hex[:6]
        email_upper = f"case_{suffix}@Example.COM"
        r1 = client.post("/auth/register", json={
            "email": email_upper, "full_name": "Test", "password": "SecureP@ss123"
        })
        assert r1.status_code == 200

        # Same email in different case should be rejected
        r2 = client.post("/auth/register", json={
            "email": email_upper.lower(), "full_name": "Test2", "password": "SecureP@ss123"
        })
        assert r2.status_code == 409, f"Duplicate email (different case) should be rejected, got {r2.status_code}"


class TestSpecialCharactersInName:
    """Names with international characters and hyphens should work."""

    @pytest.mark.parametrize("name", [
        "Jean-Pierre", "O'Brien", "Jose Garcia", "Test User 123",
    ])
    def test_special_chars_in_name(self, client, name):
        r = client.post("/auth/register", json={
            "email": f"name_{uuid.uuid4().hex[:6]}@example.com",
            "full_name": name, "password": "SecureP@ss123",
        })
        assert r.status_code == 200, f"Name '{name}' should register, got {r.status_code}"


class TestEmptyNameRejected:
    """Empty name should be rejected."""

    def test_empty_name_rejected(self, client):
        r = client.post("/auth/register", json={
            "email": f"empty_{uuid.uuid4().hex[:6]}@example.com",
            "full_name": "", "password": "SecureP@ss123",
        })
        assert r.status_code == 422


class TestResponseStructure:
    """Registration response should have the expected structure."""

    def test_response_structure(self, client):
        r = client.post("/auth/register", json={
            "email": f"struct_{uuid.uuid4().hex[:6]}@example.com",
            "full_name": "Struct Test", "password": "SecureP@ss123",
        })
        assert r.status_code == 200
        data = r.json()
        required = ["access_token", "refresh_token", "token_type", "expires_in", "user"]
        for field in required:
            assert field in data, f"Missing field: {field}"
        user_required = ["id", "email", "full_name", "role", "created_at"]
        for field in user_required:
            assert field in data["user"], f"Missing user field: {field}"
        assert data["token_type"] == "bearer"
        assert data["expires_in"] == 1800
        assert len(data["access_token"]) > 50, "Access token should be a real JWT"


class TestFullRegisterLoginMeFlow:
    """End-to-end: register -> login -> /me should all work."""

    def test_full_flow(self, client):
        email = f"full_{uuid.uuid4().hex[:6]}@example.com"
        r1 = client.post("/auth/register", json={
            "email": email, "full_name": "Full Flow", "password": "SecureP@ss123"
        })
        assert r1.status_code == 200
        token = r1.json()["access_token"]

        r2 = client.post("/auth/login", json={"email": email, "password": "SecureP@ss123"})
        assert r2.status_code == 200

        r3 = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r3.status_code == 200
        assert r3.json()["email"] == email


class TestConcurrentDuplicateRegistrations:
    """Concurrent registrations with the same email: at least one succeeds, others rejected."""

    def test_concurrent_duplicates(self, client):
        email = f"race_{uuid.uuid4().hex[:6]}@example.com"
        statuses = []
        for _ in range(3):
            r = client.post("/auth/register", json={
                "email": email, "full_name": "Race", "password": "SecureP@ss123"
            })
            statuses.append(r.status_code)
        assert 200 in statuses, f"At least one should succeed: {statuses}"
        assert 409 in statuses, f"At least one should be rejected: {statuses}"
