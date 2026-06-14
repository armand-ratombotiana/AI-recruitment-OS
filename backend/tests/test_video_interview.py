"""Tests for video interview service — rooms, recording, participants, tenant isolation."""
from __future__ import annotations

import os
import sys
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.security import create_access_token


def _make_token(tenant_id: str, sub: str = "user", role: str = "recruiter") -> str:
    return create_access_token(
        {"sub": sub, "email": f"{sub}@{tenant_id}.test", "role": role, "tenant_id": tenant_id}
    )


def _auth(tenant_id: str, sub: str = "user", role: str = "recruiter") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    from shared.core.models import video_interview as _vi  # noqa: F401

    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def video_client(engine):
    from apps.video_interview.main import router as video_router

    app = FastAPI()
    app.include_router(video_router, prefix="/api/v1/video")

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override():
        async with factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_db_dependency] = _override
    app.dependency_overrides[Settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


TENANT_A = f"tenant-a-{uuid4().hex[:8]}"
TENANT_B = f"tenant-b-{uuid4().hex[:8]}"


@pytest.mark.asyncio
async def test_create_room(video_client):
    resp = await video_client.post(
        "/api/v1/video/rooms",
        json={"interview_id": "iv1", "participants": ["u1", "u2"]},
        headers=_auth(TENANT_A),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["tenant_id"] == TENANT_A
    assert body["interview_id"] == "iv1"
    assert body["status"] == "created"
    assert body["room_url"].startswith("https://mock-video.test/rooms/")
    assert len(body["participants"]) == 2
    assert body["participants"][0]["role"] == "host"
    assert body["participants"][1]["role"] == "participant"


@pytest.mark.asyncio
async def test_create_room_no_participants(video_client):
    resp = await video_client.post(
        "/api/v1/video/rooms",
        json={"interview_id": "iv2", "participants": []},
        headers=_auth(TENANT_A),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert len(body["participants"]) == 0


@pytest.mark.asyncio
async def test_get_room(video_client):
    create_resp = await video_client.post(
        "/api/v1/video/rooms",
        json={"interview_id": "iv3", "participants": ["u1"]},
        headers=_auth(TENANT_A),
    )
    room_id = create_resp.json()["id"]

    resp = await video_client.get(f"/api/v1/video/rooms/{room_id}", headers=_auth(TENANT_A))
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == room_id
    assert len(body["participants"]) == 1


@pytest.mark.asyncio
async def test_get_room_not_found(video_client):
    resp = await video_client.get("/api/v1/video/rooms/nonexistent", headers=_auth(TENANT_A))
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_start_recording(video_client):
    create_resp = await video_client.post(
        "/api/v1/video/rooms",
        json={"interview_id": "iv4", "participants": ["u1"]},
        headers=_auth(TENANT_A),
    )
    room_id = create_resp.json()["id"]

    resp = await video_client.post(f"/api/v1/video/rooms/{room_id}/start", headers=_auth(TENANT_A))
    assert resp.status_code == 200
    body = resp.json()
    assert body["room_id"] == room_id
    assert body["status"] == "recording"
    assert "recording_id" in body


@pytest.mark.asyncio
async def test_stop_recording(video_client):
    create_resp = await video_client.post(
        "/api/v1/video/rooms",
        json={"interview_id": "iv5", "participants": ["u1"]},
        headers=_auth(TENANT_A),
    )
    room_id = create_resp.json()["id"]

    await video_client.post(f"/api/v1/video/rooms/{room_id}/start", headers=_auth(TENANT_A))
    resp = await video_client.post(f"/api/v1/video/rooms/{room_id}/stop", headers=_auth(TENANT_A))
    assert resp.status_code == 200
    body = resp.json()
    assert body["room_id"] == room_id
    assert body["recording_url"].startswith("https://mock-video.test/recordings/")
    assert body["status"] == "completed"


@pytest.mark.asyncio
async def test_stop_recording_not_started(video_client):
    create_resp = await video_client.post(
        "/api/v1/video/rooms",
        json={"interview_id": "iv6", "participants": ["u1"]},
        headers=_auth(TENANT_A),
    )
    room_id = create_resp.json()["id"]

    resp = await video_client.post(f"/api/v1/video/rooms/{room_id}/stop", headers=_auth(TENANT_A))
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_get_recording(video_client):
    create_resp = await video_client.post(
        "/api/v1/video/rooms",
        json={"interview_id": "iv7", "participants": ["u1"]},
        headers=_auth(TENANT_A),
    )
    room_id = create_resp.json()["id"]

    await video_client.post(f"/api/v1/video/rooms/{room_id}/start", headers=_auth(TENANT_A))
    await video_client.post(f"/api/v1/video/rooms/{room_id}/stop", headers=_auth(TENANT_A))

    resp = await video_client.get(f"/api/v1/video/rooms/{room_id}/recording", headers=_auth(TENANT_A))
    assert resp.status_code == 200
    body = resp.json()
    assert body["recording_url"].startswith("https://mock-video.test/recordings/")
    assert body["status"] == "completed"


@pytest.mark.asyncio
async def test_get_recording_not_available(video_client):
    create_resp = await video_client.post(
        "/api/v1/video/rooms",
        json={"interview_id": "iv8", "participants": ["u1"]},
        headers=_auth(TENANT_A),
    )
    room_id = create_resp.json()["id"]

    resp = await video_client.get(f"/api/v1/video/rooms/{room_id}/recording", headers=_auth(TENANT_A))
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_video_interviews(video_client):
    for i in range(3):
        await video_client.post(
            "/api/v1/video/rooms",
            json={"interview_id": f"iv_list_{i}", "participants": ["u1"]},
            headers=_auth(TENANT_A),
        )

    resp = await video_client.get("/api/v1/video/interviews", headers=_auth(TENANT_A))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 3
    assert len(body["data"]) >= 3


@pytest.mark.asyncio
async def test_list_video_interviews_with_status_filter(video_client):
    create_resp = await video_client.post(
        "/api/v1/video/rooms",
        json={"interview_id": "iv_filter", "participants": ["u1"]},
        headers=_auth(TENANT_A),
    )
    room_id = create_resp.json()["id"]
    await video_client.post(f"/api/v1/video/rooms/{room_id}/start", headers=_auth(TENANT_A))

    resp = await video_client.get("/api/v1/video/interviews?status=active", headers=_auth(TENANT_A))
    assert resp.status_code == 200
    body = resp.json()
    assert all(r["status"] == "active" for r in body["data"])


@pytest.mark.asyncio
async def test_delete_room(video_client):
    create_resp = await video_client.post(
        "/api/v1/video/rooms",
        json={"interview_id": "iv_del", "participants": ["u1", "u2"]},
        headers=_auth(TENANT_A),
    )
    room_id = create_resp.json()["id"]

    resp = await video_client.delete(f"/api/v1/video/rooms/{room_id}", headers=_auth(TENANT_A))
    assert resp.status_code == 204

    get_resp = await video_client.get(f"/api/v1/video/rooms/{room_id}", headers=_auth(TENANT_A))
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_room_not_found(video_client):
    resp = await video_client.delete("/api/v1/video/rooms/nonexistent", headers=_auth(TENANT_A))
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_get(video_client):
    create_resp = await video_client.post(
        "/api/v1/video/rooms",
        json={"interview_id": "iv_iso", "participants": ["u1"]},
        headers=_auth(TENANT_A),
    )
    room_id = create_resp.json()["id"]

    resp = await video_client.get(f"/api/v1/video/rooms/{room_id}", headers=_auth(TENANT_B))
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_start(video_client):
    create_resp = await video_client.post(
        "/api/v1/video/rooms",
        json={"interview_id": "iv_iso2", "participants": ["u1"]},
        headers=_auth(TENANT_A),
    )
    room_id = create_resp.json()["id"]

    resp = await video_client.post(f"/api/v1/video/rooms/{room_id}/start", headers=_auth(TENANT_B))
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_list(video_client):
    await video_client.post(
        "/api/v1/video/rooms",
        json={"interview_id": "iv_iso3", "participants": ["u1"]},
        headers=_auth(TENANT_A),
    )

    resp = await video_client.get("/api/v1/video/interviews", headers=_auth(TENANT_B))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_room_lifecycle(video_client):
    create_resp = await video_client.post(
        "/api/v1/video/rooms",
        json={"interview_id": "iv_lifecycle", "participants": ["host1", "cand1"]},
        headers=_auth(TENANT_A),
    )
    room_id = create_resp.json()["id"]
    assert create_resp.json()["status"] == "created"

    start_resp = await video_client.post(f"/api/v1/video/rooms/{room_id}/start", headers=_auth(TENANT_A))
    assert start_resp.status_code == 200

    get_resp = await video_client.get(f"/api/v1/video/rooms/{room_id}", headers=_auth(TENANT_A))
    assert get_resp.json()["status"] == "active"

    stop_resp = await video_client.post(f"/api/v1/video/rooms/{room_id}/stop", headers=_auth(TENANT_A))
    assert stop_resp.status_code == 200

    final_resp = await video_client.get(f"/api/v1/video/rooms/{room_id}", headers=_auth(TENANT_A))
    final = final_resp.json()
    assert final["status"] == "completed"
    assert final["recording_url"] is not None
    assert final["ended_at"] is not None

    for p in final["participants"]:
        assert p["left_at"] is not None


@pytest.mark.asyncio
async def test_unauthorized_no_token(video_client):
    resp = await video_client.get("/api/v1/video/interviews")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_start_recording_already_completed(video_client):
    create_resp = await video_client.post(
        "/api/v1/video/rooms",
        json={"interview_id": "iv_double", "participants": ["u1"]},
        headers=_auth(TENANT_A),
    )
    room_id = create_resp.json()["id"]

    await video_client.post(f"/api/v1/video/rooms/{room_id}/start", headers=_auth(TENANT_A))
    await video_client.post(f"/api/v1/video/rooms/{room_id}/stop", headers=_auth(TENANT_A))

    resp = await video_client.post(f"/api/v1/video/rooms/{room_id}/start", headers=_auth(TENANT_A))
    assert resp.status_code == 409
