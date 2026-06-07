"""SOC2 compliance suite — engine + HTTP endpoint tests.

Covers:

* The :mod:`shared.compliance.soc2` engine — every individual check, the
  score calculator, and the report builder.
* The three HTTP endpoints in :mod:`apps.compliance_service.main`:
  ``GET /soc2/checks``, ``GET /soc2/score``, ``GET /soc2/report``.
* Tenant isolation — a SOC2 report for tenant A must not include any
  data from tenant B.
* RBAC — non-admin users are rejected with 403.
* Unauthenticated requests are rejected with 401.
* The suite handles empty / brand-new tenants gracefully (``warning``
  status instead of crash).
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.compliance import (
    ALL_CHECKS,
    ComplianceCheck,
    build_soc2_report,
    compute_compliance_score,
    run_security_checks,
)
from shared.compliance.soc2 import (
    AUDIT_RETENTION_MIN_DAYS,
    PASSWORD_MIN_LENGTH,
    _check_admin_2fa,
    _check_admin_exists,
    _check_api_key_age,
    _check_audit_retention,
    _check_auth_rate_limiting,
    _check_password_policy,
    _check_session_lifetime,
    _check_webhook_https,
)
from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.models.api_key import ApiKey
from shared.core.models.audit_log import AuditLog
from shared.core.models.compliance import AuditEntry
from shared.core.models.identity import (
    Session,
    User,
    UserRole,
    UserStatus,
)
from shared.core.models.webhook import Webhook
from shared.core.security import create_access_token, hash_password


# ── Fixtures ──────────────────────────────────────────────────────────────────


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _token(tenant_id: str, sub: str = "user-1", role: str = "admin") -> str:
    return create_access_token({
        "sub": sub,
        "email": f"{sub}@{tenant_id}.test",
        "role": role,
        "tenant_id": tenant_id,
    })


def _auth(tenant_id: str, sub: str = "user-1", role: str = "admin") -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(tenant_id, sub, role)}"}


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
async def session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def db_override(session_factory):
    def _install(app: FastAPI) -> None:
        async def _override():
            async with session_factory() as s:
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


@pytest_asyncio.fixture
async def compliance_client(db_override) -> AsyncClient:
    from apps.compliance_service.main import router

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/compliance")
    db_override(app)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def seed_factory(session_factory):
    """Helper factory that returns a coroutine-creating helper.

    Each helper inserts a row and commits it in its own session so callers
    can stage complex fixtures without juggling transactions.
    """

    async def _add(model, **kwargs):
        async with session_factory() as s:
            obj = model(**kwargs)
            s.add(obj)
            await s.commit()
            await s.refresh(obj)
            return obj

    return _add


# ── 1. Engine — individual check (pass/fail/warning) ──────────────────────────


@pytest.mark.asyncio
async def test_check_admin_2fa_passes_when_all_admins_have_mfa(session_factory):
    async with session_factory() as s:
        for i in range(2):
            s.add(User(
                id=f"admin-{i}", tenant_id="acme", email=f"a{i}@acme.com",
                full_name=f"Admin {i}", hashed_password=hash_password("Good12345!"),
                role=UserRole.TENANT_ADMIN, status=UserStatus.ACTIVE,
                mfa_enabled=True,
            ))
        await s.commit()

    async with session_factory() as s:
        result = await _check_admin_2fa(s, "acme")

    assert isinstance(result, ComplianceCheck)
    assert result.id == "SOC2-CC6.1-2FA-ADMIN"
    assert result.status == "pass"
    assert result.evidence["admins_total"] == 2
    assert result.evidence["admins_with_2fa"] == 2
    assert result.evidence["admins_without_2fa"] == []


@pytest.mark.asyncio
async def test_check_admin_2fa_fails_when_admin_lacks_mfa(session_factory):
    async with session_factory() as s:
        s.add(User(
            id="admin-good", tenant_id="acme", email="good@acme.com",
            full_name="Good Admin", hashed_password=hash_password("Good12345!"),
            role=UserRole.TENANT_ADMIN, status=UserStatus.ACTIVE, mfa_enabled=True,
        ))
        s.add(User(
            id="admin-bad", tenant_id="acme", email="bad@acme.com",
            full_name="Bad Admin", hashed_password=hash_password("Good12345!"),
            role=UserRole.SUPER_ADMIN, status=UserStatus.ACTIVE, mfa_enabled=False,
        ))
        await s.commit()

    async with session_factory() as s:
        result = await _check_admin_2fa(s, "acme")

    assert result.status == "fail"
    evidence_offenders = result.evidence["admins_without_2fa"]
    assert any(o["id"] == "admin-bad" for o in evidence_offenders)


@pytest.mark.asyncio
async def test_check_admin_2fa_warning_when_no_admins(session_factory):
    async with session_factory() as s:
        result = await _check_admin_2fa(s, "ghost-tenant")
    assert result.status == "warning"
    assert result.evidence["admins_total"] == 0


# ── 2. Session lifetime ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_check_session_lifetime_passes_when_all_under_24h(session_factory):
    now = _utcnow()
    async with session_factory() as s:
        s.add(Session(
            id="s1", user_id="u1", tenant_id="acme", refresh_token_hash="h1",
            expires_at=now + timedelta(hours=1),
            created_at=now - timedelta(hours=1),
        ))
        s.add(Session(
            id="s2", user_id="u2", tenant_id="acme", refresh_token_hash="h2",
            expires_at=now + timedelta(hours=23),
            created_at=now - timedelta(hours=1),
        ))
        await s.commit()

    async with session_factory() as s:
        result = await _check_session_lifetime(s, "acme")
    assert result.status == "pass"
    assert result.evidence["active_sessions"] == 2
    assert result.evidence["overlong_sessions"] == []


@pytest.mark.asyncio
async def test_check_session_lifetime_fails_on_overlong_session(session_factory):
    now = _utcnow()
    async with session_factory() as s:
        s.add(Session(
            id="s1", user_id="u1", tenant_id="acme", refresh_token_hash="h1",
            expires_at=now + timedelta(hours=25),
            created_at=now - timedelta(hours=1),
        ))
        await s.commit()

    async with session_factory() as s:
        result = await _check_session_lifetime(s, "acme")
    assert result.status == "fail"
    assert len(result.evidence["overlong_sessions"]) == 1


@pytest.mark.asyncio
async def test_check_session_lifetime_ignores_revoked_sessions(session_factory):
    now = _utcnow()
    async with session_factory() as s:
        # Revoked with a 48h lifetime — must not count against the check.
        s.add(Session(
            id="s-revoked", user_id="u1", tenant_id="acme", refresh_token_hash="h1",
            expires_at=now + timedelta(hours=48),
            created_at=now - timedelta(hours=1),
            revoked_at=now - timedelta(minutes=5),
        ))
        await s.commit()

    async with session_factory() as s:
        result = await _check_session_lifetime(s, "acme")
    assert result.status == "warning"
    assert result.evidence["active_sessions"] == 0


# ── 3. API key age ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_check_api_key_age_passes_for_fresh_keys(session_factory):
    now = _utcnow()
    async with session_factory() as s:
        s.add(ApiKey(
            id="k1", tenant_id="acme", user_id="u1", name="fresh",
            key_prefix="airos_abc", key_hash="h" * 64,
            created_at=now - timedelta(days=10),
        ))
        await s.commit()

    async with session_factory() as s:
        result = await _check_api_key_age(s, "acme")
    assert result.status == "pass"
    assert result.evidence["active_keys"] == 1


@pytest.mark.asyncio
async def test_check_api_key_age_fails_on_stale_key(session_factory):
    now = _utcnow()
    async with session_factory() as s:
        s.add(ApiKey(
            id="k-stale", tenant_id="acme", user_id="u1", name="ancient",
            key_prefix="airos_old", key_hash="h" * 64,
            created_at=now - timedelta(days=400),
        ))
        await s.commit()

    async with session_factory() as s:
        result = await _check_api_key_age(s, "acme")
    assert result.status == "fail"
    assert result.evidence["stale_keys"][0]["key_id"] == "k-stale"


@pytest.mark.asyncio
async def test_check_api_key_age_ignores_revoked_keys(session_factory):
    now = _utcnow()
    async with session_factory() as s:
        # 5-year-old key, but revoked — must be ignored.
        s.add(ApiKey(
            id="k-old-revoked", tenant_id="acme", user_id="u1", name="old",
            key_prefix="airos_old", key_hash="h" * 64,
            created_at=now - timedelta(days=365 * 5),
            revoked=True,
        ))
        await s.commit()

    async with session_factory() as s:
        result = await _check_api_key_age(s, "acme")
    assert result.status == "warning"
    assert result.evidence["active_keys"] == 0


# ── 4. Audit log retention ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_check_audit_retention_passes_when_history_exceeds_90_days(session_factory):
    now = _utcnow()
    old = now - timedelta(days=AUDIT_RETENTION_MIN_DAYS + 5)
    async with session_factory() as s:
        s.add(AuditLog(
            id="log-old", tenant_id="acme", action="x", resource_type="r",
            created_at=old,
        ))
        await s.commit()

    async with session_factory() as s:
        result = await _check_audit_retention(s, "acme")
    assert result.status == "pass"
    assert result.evidence["oldest_age_days"] >= AUDIT_RETENTION_MIN_DAYS


@pytest.mark.asyncio
async def test_check_audit_retention_warns_for_empty_tenant(session_factory):
    async with session_factory() as s:
        result = await _check_audit_retention(s, "fresh-tenant")
    assert result.status == "warning"
    assert result.evidence["oldest_audit_log"] is None


@pytest.mark.asyncio
async def test_check_audit_retention_uses_gdpr_audit_entries_fallback(session_factory):
    now = _utcnow()
    old = now - timedelta(days=120)
    async with session_factory() as s:
        # No AuditLog rows; only the GDPR AuditEntry table has history.
        s.add(AuditEntry(
            id="gdpr-old", tenant_id="acme", action="x", resource_type="r",
            created_at=old,
        ))
        await s.commit()

    async with session_factory() as s:
        result = await _check_audit_retention(s, "acme")
    assert result.status == "pass"
    assert result.evidence["oldest_audit_entry"] is not None


# ── 5. Webhooks must use HTTPS ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_check_webhook_https_passes_for_https_only(session_factory):
    async with session_factory() as s:
        s.add(Webhook(
            id="w1", tenant_id="acme", url="https://hooks.example.com/x",
            secret="s" * 32, events="[]", active=True,
        ))
        await s.commit()

    async with session_factory() as s:
        result = await _check_webhook_https(s, "acme")
    assert result.status == "pass"
    assert result.evidence["active_webhooks"] == 1


@pytest.mark.asyncio
async def test_check_webhook_https_fails_on_http(session_factory):
    async with session_factory() as s:
        s.add(Webhook(
            id="w1", tenant_id="acme", url="https://hooks.example.com/x",
            secret="s" * 32, events="[]", active=True,
        ))
        s.add(Webhook(
            id="w2", tenant_id="acme", url="http://insecure.example.com/x",
            secret="s" * 32, events="[]", active=True,
        ))
        await s.commit()

    async with session_factory() as s:
        result = await _check_webhook_https(s, "acme")
    assert result.status == "fail"
    insecure = result.evidence["insecure_webhooks"]
    assert any(w["webhook_id"] == "w2" for w in insecure)


@pytest.mark.asyncio
async def test_check_webhook_https_passes_for_no_webhooks(session_factory):
    async with session_factory() as s:
        result = await _check_webhook_https(s, "acme")
    # No webhooks = vacuously compliant.
    assert result.status == "pass"
    assert result.evidence["active_webhooks"] == 0


# ── 6. Admin must exist ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_check_admin_exists_passes_when_admin_present(session_factory):
    async with session_factory() as s:
        s.add(User(
            id="a1", tenant_id="acme", email="a@acme.com", full_name="A",
            hashed_password=hash_password("Good12345!"),
            role=UserRole.TENANT_ADMIN, status=UserStatus.ACTIVE,
        ))
        await s.commit()

    async with session_factory() as s:
        result = await _check_admin_exists(s, "acme")
    assert result.status == "pass"
    assert result.evidence["active_admins"] == 1


@pytest.mark.asyncio
async def test_check_admin_exists_fails_when_no_admins(session_factory):
    async with session_factory() as s:
        s.add(User(
            id="r1", tenant_id="acme", email="r@acme.com", full_name="R",
            hashed_password=hash_password("Good12345!"),
            role=UserRole.RECRUITER, status=UserStatus.ACTIVE,
        ))
        await s.commit()

    async with session_factory() as s:
        result = await _check_admin_exists(s, "acme")
    assert result.status == "fail"
    assert result.evidence["active_admins"] == 0


# ── 7. Password policy ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_check_password_policy_passes_for_tenant_with_users(session_factory):
    async with session_factory() as s:
        s.add(User(
            id="u1", tenant_id="acme", email="u@acme.com", full_name="U",
            hashed_password=hash_password("Good12345!"),
            role=UserRole.RECRUITER, status=UserStatus.ACTIVE,
        ))
        await s.commit()

    async with session_factory() as s:
        result = await _check_password_policy(s, "acme")
    assert result.status == "pass"
    assert PASSWORD_MIN_LENGTH in (result.evidence["min_length"],)
    # The three schemas (UserCreate, RegisterRequest, PasswordReset) all
    # enforce ``min_length=8`` and should be enumerated.
    assert len(result.evidence["enforced_on_schemas"]) >= 1


# ── 8. Rate limiting ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_check_rate_limit_passes_when_auth_limiters_configured(session_factory):
    async with session_factory() as s:
        result = await _check_auth_rate_limiting(s, "acme")
    assert result.status == "pass"
    # All three registered limiters must report >0 capacity.
    for name in ("auth.login", "auth.register", "auth.password_reset"):
        assert name in result.evidence["limiters"]
        assert result.evidence["limiters"][name]["max_requests"] > 0


# ── 9. run_security_checks — full suite ──────────────────────────────────────


@pytest.mark.asyncio
async def test_run_security_checks_returns_all_eight(session_factory):
    async with session_factory() as s:
        # A baseline tenant that should pass most checks.
        s.add(User(
            id="a1", tenant_id="acme", email="a@acme.com", full_name="A",
            hashed_password=hash_password("Good12345!"),
            role=UserRole.TENANT_ADMIN, status=UserStatus.ACTIVE, mfa_enabled=True,
        ))
        s.add(Webhook(
            id="w1", tenant_id="acme", url="https://h.example.com",
            secret="s" * 32, events="[]", active=True,
        ))
        await s.commit()

    async with session_factory() as s:
        results = await run_security_checks(s, "acme")
    assert len(results) == len(ALL_CHECKS) == 8
    # Every result must have a well-formed id and one of the allowed statuses.
    for c in results:
        assert isinstance(c, ComplianceCheck)
        assert c.id in [cid for cid, _ in ALL_CHECKS]
        assert c.status in ("pass", "fail", "warning")
        assert c.evidence  # non-empty


@pytest.mark.asyncio
async def test_run_security_checks_respects_check_ids_filter(session_factory):
    async with session_factory() as s:
        results = await run_security_checks(
            s, "acme", check_ids=["SOC2-CC6.1-2FA-ADMIN", "SOC2-CC6.1-ADMIN-EXISTS"]
        )
    assert [c.id for c in results] == [
        "SOC2-CC6.1-2FA-ADMIN", "SOC2-CC6.1-ADMIN-EXISTS",
    ]


@pytest.mark.asyncio
async def test_run_security_checks_continues_when_a_check_raises(session_factory):
    from shared.compliance import soc2 as soc2_mod

    async def boom(*_args, **_kwargs):
        raise RuntimeError("kaboom")

    original = next(fn for cid, fn in soc2_mod.ALL_CHECKS
                    if cid == "SOC2-CC6.1-2FA-ADMIN")
    # Swap the catalogue entry directly.  ``ALL_CHECKS`` is a module-level
    # list so this is the canonical mutation point.
    for i, (cid, _fn) in enumerate(soc2_mod.ALL_CHECKS):
        if cid == "SOC2-CC6.1-2FA-ADMIN":
            soc2_mod.ALL_CHECKS[i] = (cid, boom)
            break
    try:
        async with session_factory() as s:
            results = await run_security_checks(s, "acme")
        # Every check ran, the broken one is reported as a fail with the error
        # captured in evidence.
        assert len(results) == 8
        broken = next(c for c in results if c.id == "SOC2-CC6.1-2FA-ADMIN")
        assert broken.status == "fail"
        assert "kaboom" in broken.evidence["error"]
    finally:
        for i, (cid, _fn) in enumerate(soc2_mod.ALL_CHECKS):
            if cid == "SOC2-CC6.1-2FA-ADMIN":
                soc2_mod.ALL_CHECKS[i] = (cid, original)
                break


# ── 10. compute_compliance_score ────────────────────────────────────────────


def test_score_is_zero_for_empty_input():
    assert compute_compliance_score([]) == 0


def test_score_is_100_for_all_passes():
    checks = [
        ComplianceCheck(id="x", name="x", category="access_control",
                        status="pass", description="d"),
        ComplianceCheck(id="y", name="y", category="access_control",
                        status="pass", description="d"),
    ]
    assert compute_compliance_score(checks) == 100


def test_score_is_zero_for_all_fails():
    checks = [
        ComplianceCheck(id="x", name="x", category="access_control",
                        status="fail", description="d"),
        ComplianceCheck(id="y", name="y", category="access_control",
                        status="fail", description="d"),
    ]
    assert compute_compliance_score(checks) == 0


def test_score_is_50_for_all_warnings():
    checks = [
        ComplianceCheck(id="x", name="x", category="access_control",
                        status="warning", description="d"),
    ]
    assert compute_compliance_score(checks) == 50


def test_score_blends_pass_warning_fail():
    # 1 pass (100) + 1 warning (50) + 1 fail (0) → 150/3 = 50
    checks = [
        ComplianceCheck(id="p", name="p", category="access_control", status="pass", description="d"),
        ComplianceCheck(id="w", name="w", category="access_control", status="warning", description="d"),
        ComplianceCheck(id="f", name="f", category="access_control", status="fail", description="d"),
    ]
    assert compute_compliance_score(checks) == 50


# ── 11. build_soc2_report ────────────────────────────────────────────────────


def test_report_groups_by_category_and_contains_all_fields():
    checks = [
        ComplianceCheck(id="a", name="A", category="access_control",
                        status="pass", description="d1", evidence={"k": 1}),
        ComplianceCheck(id="b", name="B", category="audit_logging",
                        status="fail", description="d2", evidence={"k": 2}),
        ComplianceCheck(id="c", name="C", category="audit_logging",
                        status="warning", description="d3"),
    ]
    report = build_soc2_report(checks, tenant_id="acme", score=60)

    assert report["framework"] == "SOC2"
    assert report["tenant_id"] == "acme"
    assert report["score"] == 60
    assert report["summary"]["total"] == 3
    assert report["summary"]["passed"] == 1
    assert report["summary"]["failed"] == 1
    assert report["summary"]["warnings"] == 1
    # partially_compliant because there's a fail with a warning also present
    assert report["overall_status"] == "non_compliant"
    assert "access_control" in report["categories"]
    assert len(report["categories"]["audit_logging"]) == 2
    assert len(report["controls"]) == 3


def test_report_is_compliant_when_no_failures():
    checks = [
        ComplianceCheck(id="a", name="A", category="access_control",
                        status="pass", description="d1"),
    ]
    report = build_soc2_report(checks, tenant_id="acme", score=100)
    assert report["overall_status"] == "compliant"


def test_report_is_partially_compliant_for_warnings_only():
    checks = [
        ComplianceCheck(id="a", name="A", category="access_control",
                        status="warning", description="d1"),
    ]
    report = build_soc2_report(checks, tenant_id="acme", score=50)
    assert report["overall_status"] == "partially_compliant"


# ── 12. HTTP endpoints ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_http_checks_endpoint_returns_all_checks(compliance_client):
    r = await compliance_client.get(
        "/api/v1/compliance/soc2/checks", headers=_auth("acme", "admin", "admin")
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["framework"] == "SOC2"
    assert body["total"] == 8
    assert len(body["checks"]) == 8
    ids = {c["id"] for c in body["checks"]}
    expected = {cid for cid, _ in ALL_CHECKS}
    assert ids == expected


@pytest.mark.asyncio
async def test_http_score_endpoint_returns_int(compliance_client):
    r = await compliance_client.get(
        "/api/v1/compliance/soc2/score", headers=_auth("acme", "admin", "admin")
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body["score"], int)
    assert 0 <= body["score"] <= 100
    assert body["checks_total"] == 8
    assert body["passed"] + body["warnings"] + body["failed"] == 8


@pytest.mark.asyncio
async def test_http_report_endpoint_returns_full_payload(compliance_client):
    r = await compliance_client.get(
        "/api/v1/compliance/soc2/report", headers=_auth("acme", "admin", "admin")
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["framework"] == "SOC2"
    assert body["tenant_id"] == "acme"
    assert "controls" in body and len(body["controls"]) == 8
    assert "categories" in body
    assert body["score"] == compute_compliance_score([
        ComplianceCheck(**c) for c in body["controls"]
    ])
    # report_id is generated and starts with the soc2_ prefix.
    assert body["report_id"].startswith("soc2_")


@pytest.mark.asyncio
async def test_http_endpoints_audit_run(compliance_client, session_factory):
    """Running the SOC2 endpoints must record an audit entry."""
    await compliance_client.get("/api/v1/compliance/soc2/checks", headers=_auth("acme"))
    await compliance_client.get("/api/v1/compliance/soc2/report", headers=_auth("acme"))
    async with session_factory() as s:
        rows = (await s.execute(
            select(AuditEntry).where(
                AuditEntry.tenant_id == "acme",
                AuditEntry.action.in_(["soc2.checks.run", "soc2.report.generate"]),
            )
        )).scalars().all()
    actions = {r.action for r in rows}
    assert "soc2.checks.run" in actions
    assert "soc2.report.generate" in actions


# ── 13. RBAC and auth ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_http_checks_rejects_unauthenticated(compliance_client):
    r = await compliance_client.get("/api/v1/compliance/soc2/checks")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_http_score_rejects_non_admin(compliance_client):
    r = await compliance_client.get(
        "/api/v1/compliance/soc2/score", headers=_auth("acme", "rec", "recruiter")
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_http_report_rejects_non_admin(compliance_client):
    r = await compliance_client.get(
        "/api/v1/compliance/soc2/report", headers=_auth("acme", "mem", "member")
    )
    assert r.status_code == 403


# ── 14. Tenant isolation ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_score_reflects_only_calling_tenants_data(compliance_client, session_factory):
    # Acme: 1 admin with 2FA — passes the 2FA check.
    # Beta: 1 admin WITHOUT 2FA — fails it.
    async with session_factory() as s:
        s.add(User(
            id="a-acme", tenant_id="acme", email="a@acme.com", full_name="A",
            hashed_password=hash_password("Good12345!"),
            role=UserRole.TENANT_ADMIN, status=UserStatus.ACTIVE, mfa_enabled=True,
        ))
        s.add(User(
            id="a-beta", tenant_id="beta", email="b@beta.com", full_name="B",
            hashed_password=hash_password("Good12345!"),
            role=UserRole.TENANT_ADMIN, status=UserStatus.ACTIVE, mfa_enabled=False,
        ))
        s.add(Webhook(
            id="w-acme", tenant_id="acme", url="https://h.example.com",
            secret="s" * 32, events="[]", active=True,
        ))
        await s.commit()

    acme_score = (await compliance_client.get(
        "/api/v1/compliance/soc2/score", headers=_auth("acme", "admin", "admin")
    )).json()["score"]
    beta_score = (await compliance_client.get(
        "/api/v1/compliance/soc2/score", headers=_auth("beta", "admin", "admin")
    )).json()["score"]

    assert acme_score > beta_score, (
        f"acme should score higher than beta: {acme_score} vs {beta_score}"
    )

    # The 2FA evidence must be tenant-scoped.
    acme_checks = (await compliance_client.get(
        "/api/v1/compliance/soc2/checks", headers=_auth("acme", "admin", "admin")
    )).json()["checks"]
    twofa = next(c for c in acme_checks if c["id"] == "SOC2-CC6.1-2FA-ADMIN")
    assert twofa["status"] == "pass"
    assert twofa["evidence"]["admins_total"] == 1

    beta_checks = (await compliance_client.get(
        "/api/v1/compliance/soc2/checks", headers=_auth("beta", "admin", "admin")
    )).json()["checks"]
    twofa_beta = next(c for c in beta_checks if c["id"] == "SOC2-CC6.1-2FA-ADMIN")
    assert twofa_beta["status"] == "fail"
    # Beta's evidence must not mention any acme user.
    for offender in twofa_beta["evidence"]["admins_without_2fa"]:
        assert offender["id"] != "a-acme"
