import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from shared.security.csrf import CSRFMiddleware


@pytest.fixture
def app():
    _app = FastAPI()

    @_app.get("/health")
    async def health():
        return {"status": "ok"}

    @_app.get("/api/v1/candidates")
    async def list_candidates():
        return {"candidates": []}

    @_app.post("/api/v1/candidates")
    async def create_candidate():
        return {"id": "1"}

    @_app.post("/api/v1/auth/login")
    async def login():
        return {"token": "fake"}

    @_app.put("/api/v1/candidates/1")
    async def update_candidate():
        return {"id": "1"}

    @_app.delete("/api/v1/candidates/1")
    async def delete_candidate():
        return {"deleted": True}

    @_app.patch("/api/v1/candidates/1")
    async def patch_candidate():
        return {"id": "1"}

    _app.add_middleware(CSRFMiddleware)
    return _app


@pytest.fixture
def client(app):
    return TestClient(app)


def test_get_request_sets_csrf_cookie(client):
    response = client.get("/api/v1/candidates")
    assert response.status_code == 200
    assert "csrf_token" in response.cookies


def test_post_without_csrf_token_fails(client):
    client.get("/api/v1/candidates")
    response = client.post("/api/v1/candidates", json={"name": "Test"})
    assert response.status_code == 403
    assert response.json()["detail"] == "CSRF token missing"


def test_post_with_wrong_csrf_token_fails(client):
    client.get("/api/v1/candidates")
    response = client.post(
        "/api/v1/candidates",
        json={"name": "Test"},
        headers={"X-CSRF-Token": "wrong-token"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "CSRF token mismatch"


def test_post_with_correct_csrf_token_succeeds(client):
    get_response = client.get("/api/v1/candidates")
    csrf_token = get_response.cookies["csrf_token"]
    response = client.post(
        "/api/v1/candidates",
        json={"name": "Test"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 200


def test_post_with_bearer_token_skips_csrf(client):
    response = client.post(
        "/api/v1/candidates",
        json={"name": "Test"},
        headers={"Authorization": "Bearer fake-jwt-token"},
    )
    assert response.status_code == 200


def test_exempt_paths_skip_csrf(client):
    response = client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "test"})
    assert response.status_code == 200


def test_put_without_csrf_token_fails(client):
    client.get("/api/v1/candidates")
    response = client.put("/api/v1/candidates/1", json={"name": "Updated"})
    assert response.status_code == 403


def test_delete_without_csrf_token_fails(client):
    client.get("/api/v1/candidates")
    response = client.delete("/api/v1/candidates/1")
    assert response.status_code == 403


def test_patch_without_csrf_token_fails(client):
    client.get("/api/v1/candidates")
    response = client.patch("/api/v1/candidates/1", json={"name": "Patched"})
    assert response.status_code == 403


def test_exempt_path_no_csrf_cookie_set(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert "csrf_token" not in response.cookies
