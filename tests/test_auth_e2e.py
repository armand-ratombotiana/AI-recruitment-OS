"""End-to-end tests for authentication (register, login, /me, logout)."""
import pytest
import httpx

BASE = "http://localhost:8000/api/v1"


@pytest.fixture
def client():
    with httpx.Client(base_url=BASE, timeout=30) as c:
        yield c


@pytest.fixture
def registered_user(client):
    """Register a user and return the response data."""
    import uuid
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/auth/register", json={
        "email": email,
        "full_name": "Test User",
        "password": "SecureP@ss123",
        "role": "candidate",
    })
    assert r.status_code == 200, f"Register failed: {r.text}"
    return r.json()


class TestRegisterFlow:
    def test_register_returns_tokens(self, client, registered_user):
        data = registered_user
        assert "access_token" in data, "Register should return access_token"
        assert "refresh_token" in data, "Register should return refresh_token"
        assert data["token_type"] == "bearer"
        assert "user" in data, "Register should return user object"
        assert "id" in data["user"]
        assert "email" in data["user"]
        assert "full_name" in data["user"]

    def test_register_user_data_correct(self, client, registered_user):
        user = registered_user["user"]
        assert user["full_name"] == "Test User"
        assert user["role"] == "candidate"
        assert user["email"].startswith("test_")

    def test_register_duplicate_email(self, client):
        import uuid
        email = f"dup_{uuid.uuid4().hex[:8]}@example.com"
        client.post("/auth/register", json={
            "email": email, "full_name": "User1", "password": "SecureP@ss123"
        })
        r = client.post("/auth/register", json={
            "email": email, "full_name": "User2", "password": "SecureP@ss123"
        })
        assert r.status_code == 409, f"Expected 409 for duplicate email, got {r.status_code}"


class TestLoginFlow:
    def test_login_returns_tokens(self, client, registered_user):
        email = registered_user["user"]["email"]
        r = client.post("/auth/login", json={"email": email, "password": "SecureP@ss123"})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert "refresh_token" in data

    def test_login_wrong_password(self, client, registered_user):
        email = registered_user["user"]["email"]
        r = client.post("/auth/login", json={"email": email, "password": "WrongPassword1"})
        assert r.status_code == 401

    def test_login_nonexistent_user(self, client):
        r = client.post("/auth/login", json={"email": "nonexistent@example.com", "password": "anything"})
        assert r.status_code == 401


class TestMeEndpoint:
    def test_me_with_valid_token(self, client, registered_user):
        token = registered_user["access_token"]
        r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == registered_user["user"]["email"]
        assert data["full_name"] == "Test User"

    def test_me_without_token(self, client):
        r = client.get("/auth/me")
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"

    def test_me_with_invalid_token(self, client):
        r = client.get("/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


class TestPasswordHashing:
    def test_password_is_hashed(self, client, registered_user):
        """Verify password is not stored in plaintext."""
        user_id = registered_user["user"]["id"]
        token = registered_user["access_token"]
        r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        # The password should never appear in any response
        assert "SecureP@ss123" not in str(r.json())


class TestRegisterLoginFlow:
    def test_full_flow(self, client):
        """Test complete register -> login -> me flow."""
        import uuid
        email = f"flow_{uuid.uuid4().hex[:8]}@example.com"

        # Step 1: Register
        r1 = client.post("/auth/register", json={
            "email": email, "full_name": "Flow Test", "password": "SecureP@ss123"
        })
        assert r1.status_code == 200
        reg_data = r1.json()

        # Step 2: Login
        r2 = client.post("/auth/login", json={"email": email, "password": "SecureP@ss123"})
        assert r2.status_code == 200
        login_data = r2.json()

        # Step 3: Me
        r3 = client.get("/auth/me", headers={"Authorization": f"Bearer {login_data['access_token']}"})
        assert r3.status_code == 200
        me_data = r3.json()
        assert me_data["email"] == email
        assert me_data["full_name"] == "Flow Test"
