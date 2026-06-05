"""Multi-tenancy integration tests.

Verifies that every protected service routes requests through the bearer
token's ``tenant_id`` claim, so users can only access their own tenant's
data and cross-tenant access is blocked (returning 404, not 403, to avoid
disclosing the existence of resources in other tenants).
"""
from __future__ import annotations

import os
import sys
from typing import AsyncGenerator
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
    return create_access_token({
        "sub": sub, "email": f"{sub}@{tenant_id}.test", "role": role, "tenant_id": tenant_id,
    })


def _auth(tenant_id: str, sub: str = "user", role: str = "recruiter") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


# ── Engine / DB fixtures ───────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db_override(engine):
    """Return a context manager that installs a DB dependency override on an app."""
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    def _install(app: FastAPI) -> None:
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

    return _install


# ── Service app factories ─────────────────────────────────────────────────────


def _build_users_service_app(install_db) -> FastAPI:
    from apps.user_service.main import router

    app = FastAPI()
    app.include_router(router, prefix="/users")
    install_db(app)
    return app


def _build_workflows_service_app(install_db) -> FastAPI:
    from apps.workflow_engine.main import router

    app = FastAPI()
    app.include_router(router, prefix="/workflows")
    install_db(app)
    return app


def _build_tenants_service_app(install_db) -> FastAPI:
    from apps.tenant_service.main import router

    app = FastAPI()
    app.include_router(router, prefix="/tenants")
    install_db(app)
    return app


def _build_notifications_service_app(install_db) -> FastAPI:
    from apps.notification_service.main import router

    app = FastAPI()
    app.include_router(router, prefix="/notifications")
    install_db(app)
    return app


def _build_compliance_service_app(install_db) -> FastAPI:
    from apps.compliance_service.main import router

    app = FastAPI()
    app.include_router(router, prefix="/compliance")
    install_db(app)
    return app


# ── User service multi-tenancy ────────────────────────────────────────────────


@pytest_asyncio.fixture
async def users_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    app = _build_users_service_app(db_override)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_user_list_isolated_by_tenant(users_client):
    """Tenant A and tenant B each see only their own user records."""
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    admin_b = _auth("tenant-B", "adminB", "tenant_admin")

    r1 = await users_client.post(
        "/users/", json={"email": "a@x.com", "full_name": "A User", "role": "recruiter"}, headers=admin_a
    )
    r2 = await users_client.post(
        "/users/", json={"email": "b@x.com", "full_name": "B User", "role": "recruiter"}, headers=admin_b
    )
    assert r1.status_code == 200
    assert r2.status_code == 200
    user_a_id = r1.json()["id"]
    user_b_id = r2.json()["id"]

    list_a = await users_client.get("/users/", headers=admin_a)
    list_b = await users_client.get("/users/", headers=admin_b)
    assert list_a.status_code == 200
    assert list_b.status_code == 200
    a_ids = {u["id"] for u in list_a.json()["data"]}
    b_ids = {u["id"] for u in list_b.json()["data"]}
    assert user_a_id in a_ids
    assert user_b_id not in a_ids
    assert user_b_id in b_ids
    assert user_a_id not in b_ids


@pytest.mark.asyncio
async def test_user_get_cross_tenant_is_404(users_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    admin_b = _auth("tenant-B", "adminB", "tenant_admin")

    r = await users_client.post(
        "/users/", json={"email": "b@x.com", "full_name": "B User", "role": "recruiter"}, headers=admin_b
    )
    b_id = r.json()["id"]

    cross = await users_client.get(f"/users/{b_id}", headers=admin_a)
    assert cross.status_code == 404

    own = await users_client.get(f"/users/{b_id}", headers=admin_b)
    assert own.status_code == 200


@pytest.mark.asyncio
async def test_user_update_cross_tenant_is_404(users_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    admin_b = _auth("tenant-B", "adminB", "tenant_admin")

    r = await users_client.post(
        "/users/", json={"email": "b@x.com", "full_name": "B User", "role": "recruiter"}, headers=admin_b
    )
    b_id = r.json()["id"]

    cross = await users_client.put(
        f"/users/{b_id}", json={"full_name": "Hacked"}, headers=admin_a
    )
    assert cross.status_code == 404


@pytest.mark.asyncio
async def test_user_delete_cross_tenant_is_404(users_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    admin_b = _auth("tenant-B", "adminB", "tenant_admin")

    r = await users_client.post(
        "/users/", json={"email": "b@x.com", "full_name": "B User", "role": "recruiter"}, headers=admin_b
    )
    b_id = r.json()["id"]

    cross = await users_client.delete(f"/users/{b_id}", headers=admin_a)
    assert cross.status_code == 404

    still = await users_client.get(f"/users/{b_id}", headers=admin_b)
    assert still.status_code == 200


# ── Workflow service multi-tenancy ───────────────────────────────────────────


@pytest_asyncio.fixture
async def workflows_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    app = _build_workflows_service_app(db_override)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_workflow_list_uses_token_tenant(workflows_client):
    """The list endpoint must scope workflows to the caller's tenant only."""
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    admin_b = _auth("tenant-B", "adminB", "tenant_admin")

    r1 = await workflows_client.post(
        "/workflows/",
        json={"name": "Workflow A", "trigger": "x.y", "steps": []},
        headers=admin_a,
    )
    r2 = await workflows_client.post(
        "/workflows/",
        json={"name": "Workflow B", "trigger": "x.y", "steps": []},
        headers=admin_b,
    )
    assert r1.status_code == 200
    assert r2.status_code == 200

    list_a = await workflows_client.get("/workflows/", headers=admin_a)
    list_b = await workflows_client.get("/workflows/", headers=admin_b)
    assert list_a.status_code == 200
    assert list_b.status_code == 200
    a_names = {w["name"] for w in list_a.json()["workflows"]}
    b_names = {w["name"] for w in list_b.json()["workflows"]}
    assert "Workflow A" in a_names
    assert "Workflow B" not in a_names
    assert "Workflow B" in b_names
    assert "Workflow A" not in b_names


@pytest.mark.asyncio
async def test_workflow_get_cross_tenant_is_404(workflows_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")

    r = await workflows_client.post(
        "/workflows/",
        json={"name": "Workflow B", "trigger": "x.y", "steps": []},
        headers=_auth("tenant-B", "adminB", "tenant_admin"),
    )
    b_id = r.json()["id"]

    cross = await workflows_client.get(f"/workflows/{b_id}", headers=admin_a)
    assert cross.status_code == 404


@pytest.mark.asyncio
async def test_workflow_update_cross_tenant_is_404(workflows_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")

    r = await workflows_client.post(
        "/workflows/",
        json={"name": "Workflow B", "trigger": "x.y", "steps": []},
        headers=_auth("tenant-B", "adminB", "tenant_admin"),
    )
    b_id = r.json()["id"]

    cross = await workflows_client.put(
        f"/workflows/{b_id}", json={"name": "Hacked"}, headers=admin_a
    )
    assert cross.status_code == 404


@pytest.mark.asyncio
async def test_workflow_delete_cross_tenant_is_404(workflows_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    admin_b = _auth("tenant-B", "adminB", "tenant_admin")

    r = await workflows_client.post(
        "/workflows/",
        json={"name": "Workflow B", "trigger": "x.y", "steps": []},
        headers=admin_b,
    )
    b_id = r.json()["id"]

    cross = await workflows_client.delete(f"/workflows/{b_id}", headers=admin_a)
    assert cross.status_code == 404

    still = await workflows_client.get(f"/workflows/{b_id}", headers=admin_b)
    assert still.status_code == 200


# ── Tenant service multi-tenancy ──────────────────────────────────────────────


@pytest_asyncio.fixture
async def tenants_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    app = _build_tenants_service_app(db_override)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_tenant_get_cross_tenant_is_404(tenants_client):
    super_admin = _auth("super-tenant", "root", "super_admin")

    r = await tenants_client.post(
        "/tenants/",
        json={"name": "Acme", "slug": "acme", "plan": "free"},
        headers=super_admin,
    )
    assert r.status_code == 200
    other_tenant_id = r.json()["id"]

    cross = await tenants_client.get(
        f"/tenants/{other_tenant_id}", headers=_auth("tenant-X", "uX", "tenant_admin")
    )
    assert cross.status_code == 404


@pytest.mark.asyncio
async def test_tenant_update_cross_tenant_is_404(tenants_client):
    super_admin = _auth("super-tenant", "root", "super_admin")

    r = await tenants_client.post(
        "/tenants/",
        json={"name": "Acme", "slug": "acme", "plan": "free"},
        headers=super_admin,
    )
    other_tenant_id = r.json()["id"]

    cross = await tenants_client.put(
        f"/tenants/{other_tenant_id}",
        json={"name": "Hacked"},
        headers=_auth("tenant-X", "uX", "tenant_admin"),
    )
    assert cross.status_code == 404


# ── Notification service multi-tenancy ────────────────────────────────────────


@pytest_asyncio.fixture
async def notifications_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    app = _build_notifications_service_app(db_override)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_notifications_list_scoped_to_tenant(notifications_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    admin_b = _auth("tenant-B", "adminB", "tenant_admin")

    r1 = await notifications_client.post(
        "/notifications/",
        json={"title": "A notice", "message": "For A"},
        headers=admin_a,
    )
    r2 = await notifications_client.post(
        "/notifications/",
        json={"title": "B notice", "message": "For B"},
        headers=admin_b,
    )
    assert r1.status_code == 200
    assert r2.status_code == 200

    list_a = await notifications_client.get("/notifications/", headers=admin_a)
    list_b = await notifications_client.get("/notifications/", headers=admin_b)
    a_titles = {n["title"] for n in list_a.json()["notifications"]}
    b_titles = {n["title"] for n in list_b.json()["notifications"]}
    assert "A notice" in a_titles
    assert "B notice" not in a_titles
    assert "B notice" in b_titles
    assert "A notice" not in b_titles


@pytest.mark.asyncio
async def test_notifications_get_cross_tenant_is_404(notifications_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    admin_b = _auth("tenant-B", "adminB", "tenant_admin")

    r = await notifications_client.post(
        "/notifications/",
        json={"title": "B only", "message": "secret"},
        headers=admin_b,
    )
    b_id = r.json()["id"]

    cross = await notifications_client.get(f"/notifications/{b_id}", headers=admin_a)
    assert cross.status_code == 404


# ── Compliance service multi-tenancy ──────────────────────────────────────────


@pytest_asyncio.fixture
async def compliance_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    app = _build_compliance_service_app(db_override)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_compliance_audit_log_scoped_to_tenant(compliance_client):
    r1 = await compliance_client.post(
        "/compliance/audit-log",
        json={"action": "test.event", "resource_type": "thing", "resource_id": "1"},
        headers=_auth("tenant-A", "uA", "recruiter"),
    )
    r2 = await compliance_client.post(
        "/compliance/audit-log",
        json={"action": "test.event", "resource_type": "thing", "resource_id": "2"},
        headers=_auth("tenant-B", "uB", "recruiter"),
    )
    assert r1.status_code == 200
    assert r2.status_code == 200

    log_a = await compliance_client.get(
        "/compliance/audit-log", headers=_auth("tenant-A", "uA", "recruiter")
    )
    log_b = await compliance_client.get(
        "/compliance/audit-log", headers=_auth("tenant-B", "uB", "recruiter")
    )
    assert log_a.status_code == 200
    assert log_b.status_code == 200
    a_resource_ids = {row["resource_id"] for row in log_a.json()["data"]}
    b_resource_ids = {row["resource_id"] for row in log_b.json()["data"]}
    assert "1" in a_resource_ids
    assert "2" not in a_resource_ids
    assert "2" in b_resource_ids
    assert "1" not in b_resource_ids


# ── Unauthenticated access is rejected everywhere ────────────────────────────


@pytest.mark.asyncio
async def test_user_endpoints_require_authentication(users_client):
    r = await users_client.get("/users/")
    assert r.status_code == 401

    r = await users_client.post(
        "/users/", json={"email": "x@x.com", "full_name": "X", "role": "recruiter"}
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_workflow_endpoints_require_authentication(workflows_client):
    r = await workflows_client.get("/workflows/")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_tenant_endpoints_require_authentication(tenants_client):
    r = await tenants_client.get("/tenants/")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_notification_endpoints_require_authentication(notifications_client):
    r = await notifications_client.get("/notifications/")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_compliance_endpoints_require_authentication(compliance_client):
    r = await compliance_client.get("/compliance/audit-log")
    assert r.status_code == 401
