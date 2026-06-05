"""Role-Based Access Control (RBAC) tests.

Verifies that:

* The shared ``require_role`` / ``require_admin`` dependencies enforce
  the role hierarchy (super_admin > admin > member > viewer).
* Admin-only endpoints return 403 for non-admin authenticated users.
* Cross-tenant access is still blocked for admins who only own a
  different tenant.
"""
from __future__ import annotations

import os
import sys
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from fastapi import Depends, FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.auth import require_admin, require_role, require_tenant_id
from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.security import create_access_token, require_user
from shared.core.exceptions import AuthorizationError, AuthenticationError


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


# ── Direct dependency unit tests ──────────────────────────────────────────────


def test_require_role_rejects_missing_token():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        _run_require(require_role("admin"), None)
    assert exc.value.status_code == 401


def test_require_role_rejects_invalid_token():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        _run_require(require_role("admin"), "Bearer garbage")
    assert exc.value.status_code == 401


def test_require_admin_accepts_tenant_admin():
    user = _run_require(require_admin, f"Bearer {_make_token('t1', 'u1', 'tenant_admin')}")
    assert user["role"] == "tenant_admin"


def test_require_admin_accepts_super_admin():
    user = _run_require(require_admin, f"Bearer {_make_token('t1', 'u1', 'super_admin')}")
    assert user["role"] == "super_admin"


def test_require_admin_rejects_recruiter():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        _run_require(require_admin, f"Bearer {_make_token('t1', 'u1', 'recruiter')}")
    assert exc.value.status_code == 403


def test_require_admin_rejects_candidate():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        _run_require(require_admin, f"Bearer {_make_token('t1', 'u1', 'candidate')}")
    assert exc.value.status_code == 403


def test_require_role_hierarchy_admin_includes_super_admin():
    user = _run_require(require_role("admin"), f"Bearer {_make_token('t1', 'u1', 'super_admin')}")
    assert user["role"] == "super_admin"


def test_require_role_hierarchy_member_includes_admin():
    user = _run_require(require_role("member"), f"Bearer {_make_token('t1', 'u1', 'tenant_admin')}")
    assert user["role"] == "tenant_admin"


def test_require_role_hierarchy_member_rejects_candidate():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        _run_require(require_role("member"), f"Bearer {_make_token('t1', 'u1', 'candidate')}")
    assert exc.value.status_code == 403


def test_require_tenant_id_returns_claim():
    tenant = _run_require_tenant("t-123", f"Bearer {_make_token('t-123', 'u1', 'recruiter')}")
    assert tenant == "t-123"


def _run_require(dep, authorization_header: str | None) -> dict:
    import inspect
    sig = inspect.signature(dep)
    kwargs = {}
    for name, param in sig.parameters.items():
        if name == "authorization":
            kwargs[name] = authorization_header
    return dep(**kwargs)


def _run_require_tenant(expected: str, header: str) -> str:
    return _run_require(require_tenant_id, header)


# ── Service-level RBAC tests ──────────────────────────────────────────────────


def _build_user_app(install_db) -> FastAPI:
    from apps.user_service.main import router
    app = FastAPI()
    app.include_router(router, prefix="/users")
    install_db(app)
    return app


def _build_tenant_app(install_db) -> FastAPI:
    from apps.tenant_service.main import router
    app = FastAPI()
    app.include_router(router, prefix="/tenants")
    install_db(app)
    return app


def _build_workflow_app(install_db) -> FastAPI:
    from apps.workflow_engine.main import router
    app = FastAPI()
    app.include_router(router, prefix="/workflows")
    install_db(app)
    return app


def _build_notification_app(install_db) -> FastAPI:
    from apps.notification_service.main import router
    app = FastAPI()
    app.include_router(router, prefix="/notifications")
    install_db(app)
    return app


@pytest_asyncio.fixture
async def users_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    app = _build_user_app(db_override)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def tenants_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    app = _build_tenant_app(db_override)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def workflows_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    app = _build_workflow_app(db_override)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def notifications_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    app = _build_notification_app(db_override)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── User service RBAC ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_user_create_requires_admin(users_client):
    recruiter = _auth("tenant-A", "uA", "recruiter")
    r = await users_client.post(
        "/users/",
        json={"email": "x@x.com", "full_name": "X", "role": "recruiter"},
        headers=recruiter,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_user_update_requires_admin(users_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    create = await users_client.post(
        "/users/",
        json={"email": "u@x.com", "full_name": "U", "role": "recruiter"},
        headers=admin_a,
    )
    user_id = create.json()["id"]

    recruiter = _auth("tenant-A", "recA", "recruiter")
    r = await users_client.put(
        f"/users/{user_id}",
        json={"full_name": "Hacked"},
        headers=recruiter,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_user_delete_requires_admin(users_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    create = await users_client.post(
        "/users/",
        json={"email": "u@x.com", "full_name": "U", "role": "recruiter"},
        headers=admin_a,
    )
    user_id = create.json()["id"]

    recruiter = _auth("tenant-A", "recA", "recruiter")
    r = await users_client.delete(f"/users/{user_id}", headers=recruiter)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_user_read_allowed_for_member(users_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    create = await users_client.post(
        "/users/",
        json={"email": "u@x.com", "full_name": "U", "role": "recruiter"},
        headers=admin_a,
    )
    user_id = create.json()["id"]

    recruiter = _auth("tenant-A", "recA", "recruiter")
    r = await users_client.get(f"/users/{user_id}", headers=recruiter)
    assert r.status_code == 200
    assert r.json()["id"] == user_id

    listing = await users_client.get("/users/", headers=recruiter)
    assert listing.status_code == 200


@pytest.mark.asyncio
async def test_user_read_rejects_candidate(users_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    create = await users_client.post(
        "/users/",
        json={"email": "u@x.com", "full_name": "U", "role": "recruiter"},
        headers=admin_a,
    )
    user_id = create.json()["id"]

    candidate = _auth("tenant-A", "candA", "candidate")
    r = await users_client.get(f"/users/{user_id}", headers=candidate)
    assert r.status_code == 403


# ── Tenant service RBAC ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_create_requires_admin(tenants_client):
    recruiter = _auth("tenant-A", "recA", "recruiter")
    r = await tenants_client.post(
        "/tenants/",
        json={"name": "Acme", "slug": "acme", "plan": "free"},
        headers=recruiter,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_tenant_update_requires_admin(tenants_client):
    super_admin = _auth("super-tenant", "root", "super_admin")
    create = await tenants_client.post(
        "/tenants/",
        json={"name": "Acme", "slug": "acme", "plan": "free"},
        headers=super_admin,
    )
    tenant_id = create.json()["id"]

    recruiter = _auth("tenant-A", "recA", "recruiter")
    r = await tenants_client.put(
        f"/tenants/{tenant_id}",
        json={"name": "Hacked"},
        headers=recruiter,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_tenant_delete_requires_admin(tenants_client):
    super_admin = _auth("super-tenant", "root", "super_admin")
    create = await tenants_client.post(
        "/tenants/",
        json={"name": "Acme", "slug": "acme", "plan": "free"},
        headers=super_admin,
    )
    tenant_id = create.json()["id"]

    recruiter = _auth("tenant-A", "recA", "recruiter")
    r = await tenants_client.delete(f"/tenants/{tenant_id}", headers=recruiter)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_tenant_update_cross_tenant_admin_forbidden(tenants_client):
    """Admin of tenant A cannot modify tenant B (returns 404 to avoid info disclosure)."""
    super_admin = _auth("super-tenant", "root", "super_admin")
    create = await tenants_client.post(
        "/tenants/",
        json={"name": "Acme", "slug": "acme", "plan": "free"},
        headers=super_admin,
    )
    tenant_id = create.json()["id"]

    admin_other = _auth("tenant-X", "adminX", "tenant_admin")
    r = await tenants_client.put(
        f"/tenants/{tenant_id}",
        json={"name": "Hacked"},
        headers=admin_other,
    )
    assert r.status_code == 404


# ── Workflow service RBAC ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_workflow_create_requires_admin(workflows_client):
    recruiter = _auth("tenant-A", "recA", "recruiter")
    r = await workflows_client.post(
        "/workflows/",
        json={"name": "My WF", "trigger": "x.y", "steps": []},
        headers=recruiter,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_workflow_update_requires_admin(workflows_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    create = await workflows_client.post(
        "/workflows/",
        json={"name": "WF", "trigger": "x.y", "steps": []},
        headers=admin_a,
    )
    workflow_id = create.json()["id"]

    recruiter = _auth("tenant-A", "recA", "recruiter")
    r = await workflows_client.put(
        f"/workflows/{workflow_id}",
        json={"name": "Hacked"},
        headers=recruiter,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_workflow_delete_requires_admin(workflows_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    create = await workflows_client.post(
        "/workflows/",
        json={"name": "WF", "trigger": "x.y", "steps": []},
        headers=admin_a,
    )
    workflow_id = create.json()["id"]

    recruiter = _auth("tenant-A", "recA", "recruiter")
    r = await workflows_client.delete(f"/workflows/{workflow_id}", headers=recruiter)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_workflow_read_allowed_for_recruiter(workflows_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    create = await workflows_client.post(
        "/workflows/",
        json={"name": "WF", "trigger": "x.y", "steps": []},
        headers=admin_a,
    )
    workflow_id = create.json()["id"]

    recruiter = _auth("tenant-A", "recA", "recruiter")
    r = await workflows_client.get(f"/workflows/{workflow_id}", headers=recruiter)
    assert r.status_code == 200


# ── Notification service RBAC ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_notification_create_requires_admin(notifications_client):
    recruiter = _auth("tenant-A", "recA", "recruiter")
    r = await notifications_client.post(
        "/notifications/",
        json={"title": "T", "message": "M"},
        headers=recruiter,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_notification_read_allowed_for_recruiter(notifications_client):
    admin_a = _auth("tenant-A", "adminA", "tenant_admin")
    create = await notifications_client.post(
        "/notifications/",
        json={"title": "T", "message": "M"},
        headers=admin_a,
    )
    notification_id = create.json()["id"]

    recruiter = _auth("tenant-A", "recA", "recruiter")
    r = await notifications_client.get(f"/notifications/{notification_id}", headers=recruiter)
    assert r.status_code == 200
