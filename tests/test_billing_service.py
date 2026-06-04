"""Live E2E validation tests for the AI-ROS billing service.

These tests hit the running Docker API at http://localhost:8000. They are
skipped automatically when the API is not reachable so that local pytest runs
don't fail in environments where the stack isn't up.

The tests use httpx and avoid fancy Unicode output so they run cleanly on
Windows consoles (charmap encoding). Auth-bound tests fall back to a locally
generated JWT (using the same secret as the API) when the auth service
is unavailable, so the billing surface is still exercised end-to-end.
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid

import httpx

BASE_URL = os.environ.get("AIROS_BASE_URL", "http://localhost:8000")


def _reachable() -> bool:
    try:
        r = httpx.get(f"{BASE_URL}/health", timeout=2.0)
        return r.status_code == 200
    except Exception:
        return False


if not _reachable():
    print(f"[SKIP] {BASE_URL} not reachable; skipping live E2E tests.")
    sys.exit(0)


def _login_demo() -> str | None:
    try:
        r = httpx.post(
            f"{BASE_URL}/api/v1/auth/login",
            json={"email": "demo@airos.io", "password": "demo1234"},
            timeout=5.0,
        )
        if r.status_code == 200:
            return r.json().get("access_token")
    except Exception:
        return None
    return None


def _register_user(email: str, password: str = "TestP@ss1234") -> str | None:
    try:
        r = httpx.post(
            f"{BASE_URL}/api/v1/auth/register",
            json={"email": email, "full_name": "E2E Tester", "password": password},
            timeout=5.0,
        )
        if r.status_code in (200, 201):
            return r.json().get("access_token")
    except Exception:
        return None
    return None


def _jwt_for(user_id: str, email: str, role: str = "super_admin") -> str:
    """Generate a JWT using the API's secret (works even if auth/login is down)."""
    # Use the jose lib that the backend uses
    try:
        from jose import jwt as _jwt
    except Exception:
        # Fallback: PyJWT
        import jwt as _jwt  # type: ignore
    # Read the actual default secret from backend config; fall back to a sane
    # default for local dev.
    secret = os.environ.get("JWT_SECRET_KEY") or os.environ.get("SECRET_KEY")
    if not secret:
        try:
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
            from shared.core.config import get_settings
            secret = get_settings().SECRET_KEY
        except Exception:
            secret = "dev-secret-key-change-in-production-min-32-chars!!"
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
        "type": "access",
        "jti": uuid.uuid4().hex,
    }
    return _jwt.encode(payload, secret, algorithm="HS256")


def _resolve_demo_user_id() -> str:
    """Resolve the demo user's UUID from the DB via a quick local query.
    Falls back to a hard-coded UUID if anything goes wrong (the demo seed
    will still create a sub for this user on first access via the API).
    """
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
        import asyncio
        from shared.core.database import async_session_factory
        from shared.core.models.identity import User
        from sqlalchemy import select as sa_select

        async def _fetch():
            async with async_session_factory() as s:
                u = (await s.execute(sa_select(User).where(User.email == "demo@airos.io"))).scalar_one_or_none()
                return str(u.id) if u else None

        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(_fetch()) or "demo-user-fallback"
        finally:
            loop.close()
    except Exception:
        return "demo-user-fallback"


def _auth_header_for_demo() -> dict[str, str]:
    token = _login_demo()
    if token:
        return {"Authorization": f"Bearer {token}"}
    # Fallback: mint a JWT locally
    user_id = _resolve_demo_user_id()
    return {"Authorization": f"Bearer {_jwt_for(user_id, 'demo@airos.io', 'super_admin')}"}


def _auth_header_for_fresh_user(email: str, role: str = "member") -> dict[str, str]:
    token = _register_user(email)
    if token:
        # Decode without verification to get the sub
        try:
            from jose import jwt as _jwt
            payload = _jwt.get_unverified_claims(token)
            user_id = payload.get("sub", "anon")
        except Exception:
            import jwt as _jwt  # type: ignore
            payload = _jwt.decode(token, options={"verify_signature": False})
            user_id = payload.get("sub", "anon")
        return {"Authorization": f"Bearer {token}", "X-User-Id": user_id}
    # Fallback: mint a JWT locally with a UUID
    user_id = str(uuid.uuid4())
    return {"Authorization": f"Bearer {_jwt_for(user_id, email, role)}", "X-User-Id": user_id}


def _log(name: str, body: dict) -> None:
    """ASCII-safe logging for Windows consoles."""
    try:
        s = json.dumps(body, default=str)
    except Exception:
        s = str(body)
    if len(s) > 200:
        s = s[:200] + "..."
    print(f"[OK] {name} -> {s}")


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_billing_health_live():
    r = httpx.get(f"{BASE_URL}/api/v1/billing/health", timeout=5.0)
    assert r.status_code == 200
    body = r.json()
    assert body["service"] == "billing"
    assert body["status"] == "healthy"
    _log("/billing/health", body)


def test_list_plans_live():
    r = httpx.get(f"{BASE_URL}/api/v1/billing/plans", timeout=5.0)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 4
    plan_ids = {p["id"] for p in body["data"]}
    assert plan_ids == {"free", "starter", "pro", "enterprise"}
    _log("/billing/plans", {"total": body["total"], "ids": sorted(plan_ids)})


def test_get_plan_live():
    r = httpx.get(f"{BASE_URL}/api/v1/billing/plans/pro", timeout=5.0)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "pro"
    assert body["monthly_price_cents"] == 19900
    assert body["annual_savings_pct"] == 17
    _log("/billing/plans/pro", {
        "monthly_cents": body["monthly_price_cents"],
        "annual_savings_pct": body["annual_savings_pct"],
    })


def test_demo_user_has_pro_subscription_live():
    headers = _auth_header_for_demo()
    r = httpx.get(
        f"{BASE_URL}/api/v1/billing/subscription/me",
        headers=headers, timeout=5.0,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["has_subscription"] is True
    sub = body["subscription"]
    assert sub["plan_id"] == "pro"
    assert sub["status"] == "active"
    assert sub["billing_cycle"] == "monthly"
    _log("demo@airos.io subscription", {
        "plan": sub["plan_id"], "seats": sub["seats"], "status": sub["status"],
    })


def test_demo_user_invoices_live():
    headers = _auth_header_for_demo()
    r = httpx.get(
        f"{BASE_URL}/api/v1/billing/invoices/mine",
        headers=headers, timeout=5.0,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    inv = body["data"][0]
    assert inv["status"] == "paid"
    assert inv["total_cents"] > 0
    _log("demo invoices", {"total": body["total"], "first_status": inv["status"]})


def test_demo_usage_live():
    headers = _auth_header_for_demo()
    r = httpx.get(
        f"{BASE_URL}/api/v1/billing/usage/me",
        headers=headers, timeout=5.0,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["plan_id"] == "pro"
    assert body["usage"]["ai_calls"]["used"] >= 0
    _log("demo usage", {"plan": body["plan_id"], "period": body["period"]})


def test_checkout_creates_session_live():
    headers = _auth_header_for_fresh_user(
        f"e2e_checkout_{int(time.time())}@example.com"
    )
    r = httpx.post(
        f"{BASE_URL}/api/v1/billing/checkout",
        json={"plan_id": "pro", "billing_cycle": "annual", "seats": 5},
        headers=headers, timeout=5.0,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] in ("mock", "live")
    assert body["checkout_url"]
    assert body["session_id"]
    _log("/billing/checkout", {"mode": body["mode"], "session_id": body["session_id"]})


def test_webhook_simulated_live():
    user_id = str(uuid.uuid4())
    email = f"e2e_webhook_{int(time.time())}@example.com"
    headers = {"Authorization": f"Bearer {_jwt_for(user_id, email)}"}
    event = {
        "id": f"evt_e2e_{uuid.uuid4().hex[:8]}",
        "type": "checkout.session.completed",
        "data": {"object": {
            "id": f"cs_e2e_{uuid.uuid4().hex[:8]}",
            "customer": "cus_stripe_e2e",
            "subscription": f"sub_stripe_e2e_{uuid.uuid4().hex[:8]}",
            "metadata": {
                "user_id": user_id,
                "tenant_id": "default",
                "plan_id": "pro",
                "billing_cycle": "monthly",
                "seats": 2,
            },
        }},
    }
    r = httpx.post(
        f"{BASE_URL}/api/v1/billing/webhook",
        content=json.dumps(event),
        headers={"Content-Type": "application/json"},
        timeout=5.0,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["processed"] is True
    assert body["type"] == "checkout.session.completed"
    _log("/billing/webhook", {"processed": body["processed"], "duplicate": body["duplicate"]})

    r2 = httpx.get(
        f"{BASE_URL}/api/v1/billing/subscription/me",
        headers=headers, timeout=5.0,
    )
    assert r2.status_code == 200
    sub_body = r2.json()
    assert sub_body["has_subscription"] is True
    assert sub_body["subscription"]["plan_id"] == "pro"
    _log("subscription after webhook", {
        "plan": sub_body["subscription"]["plan_id"],
        "status": sub_body["subscription"]["status"],
    })


def test_payment_method_setup_intent_live():
    headers = _auth_header_for_fresh_user(f"e2e_pm_{int(time.time())}@example.com")
    r = httpx.post(
        f"{BASE_URL}/api/v1/billing/payment-methods/setup",
        headers=headers, timeout=5.0,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["client_secret"]
    assert body["id"]
    _log("/billing/payment-methods/setup", {"id": body["id"]})


def test_admin_subscriptions_require_admin_live():
    headers = _auth_header_for_fresh_user(
        f"e2e_nonadmin_{int(time.time())}@example.com", role="member"
    )
    r = httpx.get(
        f"{BASE_URL}/api/v1/billing/admin/subscriptions",
        headers=headers, timeout=5.0,
    )
    assert r.status_code == 403
    print("[OK] non-admin /admin/subscriptions -> 403 (expected)")

    admin_headers = _auth_header_for_demo()  # demo@airos.io is super_admin
    r2 = httpx.get(
        f"{BASE_URL}/api/v1/billing/admin/subscriptions",
        headers=admin_headers, timeout=5.0,
    )
    assert r2.status_code == 200
    body2 = r2.json()
    _log("admin /admin/subscriptions", {"total": body2.get("total", 0)})


def test_full_e2e_flow_live():
    user_id = str(uuid.uuid4())
    email = f"e2e_full_{int(time.time())}@example.com"
    headers = {"Authorization": f"Bearer {_jwt_for(user_id, email)}"}

    # Start trial
    r = httpx.post(
        f"{BASE_URL}/api/v1/billing/trial",
        json={"plan_id": "starter"}, headers=headers, timeout=5.0,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "trialing"

    # Upgrade
    r = httpx.put(
        f"{BASE_URL}/api/v1/billing/subscription/me",
        json={"plan_id": "pro"}, headers=headers, timeout=5.0,
    )
    assert r.status_code == 200
    assert r.json()["plan_id"] == "pro"

    # Add payment method
    r = httpx.post(
        f"{BASE_URL}/api/v1/billing/payment-methods/mine",
        json={"brand": "visa", "last_four": "4242", "set_default": True},
        headers=headers, timeout=5.0,
    )
    assert r.status_code == 200
    assert r.json()["is_default"] is True

    # Cancel at period end
    r = httpx.request(
        "DELETE",
        f"{BASE_URL}/api/v1/billing/subscription/me",
        json={"immediate": False}, headers=headers, timeout=5.0,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["cancel_at_period_end"] is True

    # Resume
    r = httpx.post(
        f"{BASE_URL}/api/v1/billing/subscription/resume",
        headers=headers, timeout=5.0,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["cancel_at_period_end"] is False
    _log("E2E flow", {
        "plan": body["plan_id"], "status": body["status"],
        "cancel_at_period_end": body["cancel_at_period_end"],
    })


# ── Runner ────────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    fns = [
        test_billing_health_live,
        test_list_plans_live,
        test_get_plan_live,
        test_demo_user_has_pro_subscription_live,
        test_demo_user_invoices_live,
        test_demo_usage_live,
        test_checkout_creates_session_live,
        test_webhook_simulated_live,
        test_payment_method_setup_intent_live,
        test_admin_subscriptions_require_admin_live,
        test_full_e2e_flow_live,
    ]
    passed, failed = 0, 0
    for fn in fns:
        name = fn.__name__
        try:
            fn()
            passed += 1
        except Exception as exc:
            print(f"[FAIL] {name}: {exc}")
            failed += 1
    print("=" * 60)
    print(f"Live E2E results: {passed} passed, {failed} failed (of {len(fns)})")
    print("=" * 60)
    sys.exit(0 if failed == 0 else 1)
