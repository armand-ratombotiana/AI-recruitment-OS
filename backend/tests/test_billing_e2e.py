"""End-to-End billing service test suite.

Covers the complete subscription lifecycle using the billing service in
mock-Stripe mode.  Every assertion proves a real API round-trip against
the unified gateway (`backend/main.py`).

Run:  pytest tests/test_billing_e2e.py -v --tb=short
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_BASE = "http://test"
_BILLING = "/api/v1/billing"
_AUTH = "/api/v1/auth"


def _uid() -> str:
    return uuid.uuid4().hex[:16]


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": "default"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def _reset_billing_store():
    """Reset the in-memory billing store before every test."""
    from apps.billing_service import store
    from apps.billing_service.main import bootstrap_coupons
    store.reset_user_store()
    bootstrap_coupons()


@pytest.fixture()
async def app_client():
    """Create an async test client against the unified API gateway."""
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url=_BASE) as ac:
        yield ac


async def _register_and_login(c: AsyncClient, email: str | None = None, role: str = "recruiter") -> dict:
    """Register + login a fresh user, return {token, user_id, email}."""
    email = email or f"test_{_uid()}@airos.io"
    pwd = "TestPass123!@#"
    # Register
    r = await c.post(f"{_AUTH}/register", json={
        "email": email, "password": pwd, "full_name": "Test User", "role": role,
    })
    assert r.status_code in (200, 201, 409), f"Register failed: {r.status_code} {r.text}"
    # Login
    r = await c.post(f"{_AUTH}/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("access_token") or body.get("token") or ""
    user_id = body.get("user", {}).get("id") or body.get("user_id") or ""
    return {"token": token, "user_id": user_id, "email": email}


async def _register_admin(c: AsyncClient) -> dict:
    return await _register_and_login(c, email=f"admin_{_uid()}@airos.io", role="admin")


# ===========================================================================
# 1. Health & Plans (public)
# ===========================================================================

class TestHealthAndPlans:
    @pytest.mark.anyio
    async def test_health(self, app_client: AsyncClient):
        r = await app_client.get(f"{_BILLING}/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "healthy"
        assert body["mode"] in ("mock", "live")
        assert body["currency"] in ("usd", "USD")

    @pytest.mark.anyio
    async def test_list_plans(self, app_client: AsyncClient):
        r = await app_client.get(f"{_BILLING}/plans")
        assert r.status_code == 200
        body = r.json()
        assert body["total"] >= 3  # free, starter, pro, enterprise
        ids = {p["id"] for p in body["data"]}
        assert "free" in ids
        assert "pro" in ids

    @pytest.mark.anyio
    async def test_get_plan(self, app_client: AsyncClient):
        r = await app_client.get(f"{_BILLING}/plans/pro")
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == "pro"
        assert body["monthly_price"] > 0
        assert "limits" in body

    @pytest.mark.anyio
    async def test_get_plan_not_found(self, app_client: AsyncClient):
        r = await app_client.get(f"{_BILLING}/plans/nonexistent_plan")
        assert r.status_code == 404


# ===========================================================================
# 2. Full Subscription Lifecycle
# ===========================================================================

class TestSubscriptionLifecycle:
    @pytest.mark.anyio
    async def test_full_lifecycle(self, app_client: AsyncClient):
        """register → checkout → get subscription → upgrade → downgrade → pause → resume → cancel"""
        c = app_client
        user = await _register_and_login(c)
        h = _bearer(user["token"])

        # 1. No subscription yet
        r = await c.get(f"{_BILLING}/subscription/me", headers=h)
        assert r.status_code == 200
        body = r.json()
        assert body["has_subscription"] is False

        # 2. Create checkout → subscription
        r = await c.post(f"{_BILLING}/checkout", headers=h, json={
            "plan_id": "pro", "billing_cycle": "monthly", "seats": 3,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["checkout_url"]
        assert body["session_id"]
        assert body["mode"] == "mock"

        # 3. Simulate checkout completion via webhook
        session_id = body["session_id"]
        webhook_event = {
            "id": f"evt_{_uid()}",
            "type": "checkout.session.completed",
            "api_version": "2024-01-01",
            "data": {
                "object": {
                    "id": session_id,
                    "subscription": f"sub_stripe_{_uid()}",
                    "customer": f"cus_stripe_{_uid()}",
                    "metadata": {
                        "user_id": user["user_id"],
                        "tenant_id": "default",
                        "plan_id": "pro",
                        "billing_cycle": "monthly",
                        "seats": "3",
                        "email": user["email"],
                    },
                }
            },
        }
        r = await c.post(
            f"{_BILLING}/webhook",
            content=json.dumps(webhook_event).encode(),
            headers={"Content-Type": "application/json", "Stripe-Signature": "mock_sig_test"},
        )
        assert r.status_code == 200
        wh_body = r.json()
        assert wh_body["received"] is True
        assert wh_body["processed"] is True

        # 4. Verify subscription is now active
        r = await c.get(f"{_BILLING}/subscription/me", headers=h)
        assert r.status_code == 200
        body = r.json()
        assert body["has_subscription"] is True
        sub = body["subscription"]
        assert sub["plan_id"] == "pro"
        assert sub["status"] == "active"
        assert sub["seats"] == 3

        # 5. Upgrade to enterprise
        r = await c.put(f"{_BILLING}/subscription/me", headers=h, json={
            "plan_id": "enterprise", "prorate": True,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["plan_id"] == "enterprise"

        # 6. Update seats
        r = await c.put(f"{_BILLING}/subscription/me", headers=h, json={"seats": 10})
        assert r.status_code == 200
        assert r.json()["seats"] == 10

        # 7. Pause subscription
        r = await c.post(f"{_BILLING}/subscription/pause", headers=h, json={"duration_days": 30})
        assert r.status_code == 200
        assert r.json()["status"] == "paused"

        # 8. Resume subscription
        r = await c.post(f"{_BILLING}/subscription/resume", headers=h)
        assert r.status_code == 200
        assert r.json()["status"] == "active"

        # 9. Cancel at period end
        r = await c.delete(f"{_BILLING}/subscription/me", headers=h,
                           content=json.dumps({"immediate": False, "reason": "testing"}).encode(),
                           )
        assert r.status_code == 200
        body = r.json()
        assert body["cancel_at_period_end"] is True

        # 10. Resume after cancel-at-period-end
        r = await c.post(f"{_BILLING}/subscription/resume", headers=h)
        assert r.status_code == 200
        assert r.json()["cancel_at_period_end"] is False

        # 11. Immediate cancel
        r = await c.delete(f"{_BILLING}/subscription/me", headers=h,
                           content=json.dumps({"immediate": True}).encode())
        assert r.status_code == 200
        assert r.json()["status"] == "canceled"


# ===========================================================================
# 3. Payment Methods
# ===========================================================================

class TestPaymentMethods:
    @pytest.mark.anyio
    async def test_payment_method_crud(self, app_client: AsyncClient):
        c = app_client
        user = await _register_and_login(c)
        h = _bearer(user["token"])

        # List — initially empty
        r = await c.get(f"{_BILLING}/payment-methods/mine", headers=h)
        assert r.status_code == 200
        assert r.json()["total"] == 0

        # Add a card
        r = await c.post(f"{_BILLING}/payment-methods/mine", headers=h, json={
            "brand": "visa", "last_four": "1234", "exp_month": 6, "exp_year": 2029,
        })
        assert r.status_code == 200
        pm = r.json()
        pm_id = pm["id"]
        assert pm["brand"] == "visa"
        assert pm["last_four"] == "1234"

        # Add second card
        r = await c.post(f"{_BILLING}/payment-methods/mine", headers=h, json={
            "brand": "mastercard", "last_four": "5678", "exp_month": 3, "exp_year": 2028,
        })
        assert r.status_code == 200
        pm2_id = r.json()["id"]

        # List — should have 2
        r = await c.get(f"{_BILLING}/payment-methods/mine", headers=h)
        assert r.json()["total"] == 2

        # Set default
        r = await c.put(f"{_BILLING}/payment-methods/mine/{pm2_id}/default", headers=h)
        assert r.status_code == 200
        assert r.json()["is_default"] is True

        # Delete first card
        r = await c.delete(f"{_BILLING}/payment-methods/mine/{pm_id}", headers=h)
        assert r.status_code == 200
        assert r.json()["deleted"] is True

        # List — should have 1
        r = await c.get(f"{_BILLING}/payment-methods/mine", headers=h)
        assert r.json()["total"] == 1

    @pytest.mark.anyio
    async def test_setup_intent(self, app_client: AsyncClient):
        c = app_client
        user = await _register_and_login(c)
        h = _bearer(user["token"])
        r = await c.post(f"{_BILLING}/payment-methods/setup", headers=h)
        assert r.status_code == 200
        body = r.json()
        assert body["client_secret"]
        assert body["mode"] == "mock"


# ===========================================================================
# 4. Invoices
# ===========================================================================

class TestInvoices:
    @pytest.mark.anyio
    async def test_invoice_lifecycle(self, app_client: AsyncClient):
        c = app_client
        user = await _register_and_login(c)
        h = _bearer(user["token"])

        # Create subscription via webhook to generate an invoice
        webhook_event = {
            "id": f"evt_{_uid()}",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": f"cs_{_uid()}",
                    "subscription": f"sub_stripe_{_uid()}",
                    "metadata": {
                        "user_id": user["user_id"],
                        "tenant_id": "default",
                        "plan_id": "starter",
                        "billing_cycle": "monthly",
                        "seats": "1",
                        "email": user["email"],
                    },
                }
            },
        }
        r = await c.post(f"{_BILLING}/webhook",
                         content=json.dumps(webhook_event).encode(),
                         headers={"Content-Type": "application/json", "Stripe-Signature": "mock_sig_test"})
        assert r.status_code == 200

        # List invoices
        r = await c.get(f"{_BILLING}/invoices/mine", headers=h)
        assert r.status_code == 200
        invoices = r.json()
        assert invoices["total"] >= 1
        inv_id = invoices["data"][0]["id"]

        # Get specific invoice
        r = await c.get(f"{_BILLING}/invoices/mine/{inv_id}", headers=h)
        assert r.status_code == 200
        inv = r.json()
        assert inv["status"] == "paid"
        assert inv["total_cents"] > 0

        # Get invoice PDF link
        r = await c.get(f"{_BILLING}/invoices/mine/{inv_id}/pdf", headers=h)
        assert r.status_code == 200
        assert "url" in r.json()

    @pytest.mark.anyio
    async def test_invoice_not_found(self, app_client: AsyncClient):
        c = app_client
        user = await _register_and_login(c)
        h = _bearer(user["token"])
        r = await c.get(f"{_BILLING}/invoices/mine/inv_nonexistent", headers=h)
        assert r.status_code == 404


# ===========================================================================
# 5. Coupons
# ===========================================================================

class TestCoupons:
    @pytest.mark.anyio
    async def test_valid_coupon(self, app_client: AsyncClient):
        c = app_client
        user = await _register_and_login(c)
        h = _bearer(user["token"])
        r = await c.post(f"{_BILLING}/coupon", headers=h, json={"code": "WELCOME20"})
        assert r.status_code == 200
        body = r.json()
        assert body["valid"] is True
        assert body["percent_off"] == 20

    @pytest.mark.anyio
    async def test_invalid_coupon(self, app_client: AsyncClient):
        c = app_client
        user = await _register_and_login(c)
        h = _bearer(user["token"])
        r = await c.post(f"{_BILLING}/coupon", headers=h, json={"code": "DOESNOTEXIST"})
        assert r.status_code == 400

    @pytest.mark.anyio
    async def test_checkout_with_coupon(self, app_client: AsyncClient):
        c = app_client
        user = await _register_and_login(c)
        h = _bearer(user["token"])
        r = await c.post(f"{_BILLING}/checkout", headers=h, json={
            "plan_id": "pro", "billing_cycle": "monthly", "seats": 1,
            "coupon_code": "WELCOME20",
        })
        assert r.status_code == 200
        assert r.json()["session_id"]


# ===========================================================================
# 6. Webhooks
# ===========================================================================

class TestWebhooks:
    @pytest.mark.anyio
    async def test_webhook_idempotency(self, app_client: AsyncClient):
        """Sending the same event twice should mark it as duplicate."""
        c = app_client
        event_id = f"evt_{_uid()}"
        event = {
            "id": event_id,
            "type": "customer.created",
            "data": {"object": {"id": f"cus_{_uid()}", "email": "test@test.com"}},
        }
        payload = json.dumps(event).encode()

        # First send
        r = await c.post(f"{_BILLING}/webhook", content=payload,
                         headers={"Content-Type": "application/json", "Stripe-Signature": "mock_sig_test"})
        assert r.status_code == 200
        assert r.json()["duplicate"] is False

        # Second send — duplicate
        r = await c.post(f"{_BILLING}/webhook", content=payload,
                         headers={"Content-Type": "application/json", "Stripe-Signature": "mock_sig_test"})
        assert r.status_code == 200
        assert r.json()["duplicate"] is True

    @pytest.mark.anyio
    async def test_webhook_subscription_deleted(self, app_client: AsyncClient):
        c = app_client
        user = await _register_and_login(c)
        h = _bearer(user["token"])

        # Create sub via webhook
        stripe_sub_id = f"sub_stripe_{_uid()}"
        create_evt = {
            "id": f"evt_{_uid()}",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": f"cs_{_uid()}", "subscription": stripe_sub_id,
                    "metadata": {
                        "user_id": user["user_id"], "tenant_id": "default",
                        "plan_id": "pro", "billing_cycle": "monthly",
                        "seats": "1", "email": user["email"],
                    },
                }
            },
        }
        await c.post(f"{_BILLING}/webhook", content=json.dumps(create_evt).encode(),
                      headers={"Content-Type": "application/json", "Stripe-Signature": "mock_sig_test"})

        # Delete via webhook
        del_evt = {
            "id": f"evt_{_uid()}",
            "type": "customer.subscription.deleted",
            "data": {"object": {"id": stripe_sub_id}},
        }
        r = await c.post(f"{_BILLING}/webhook", content=json.dumps(del_evt).encode(),
                         headers={"Content-Type": "application/json", "Stripe-Signature": "mock_sig_test"})
        assert r.status_code == 200

        # Verify canceled
        r = await c.get(f"{_BILLING}/subscription/me", headers=h)
        sub = r.json().get("subscription")
        if sub:
            assert sub["status"] == "canceled"

    @pytest.mark.anyio
    async def test_webhook_invoice_paid(self, app_client: AsyncClient):
        c = app_client
        event = {
            "id": f"evt_{_uid()}",
            "type": "invoice.paid",
            "data": {
                "object": {
                    "id": f"in_{_uid()}", "customer": f"cus_nonexistent",
                    "amount_paid": 4900,
                }
            },
        }
        r = await c.post(f"{_BILLING}/webhook", content=json.dumps(event).encode(),
                         headers={"Content-Type": "application/json", "Stripe-Signature": "mock_sig_test"})
        assert r.status_code == 200
        assert r.json()["received"] is True


# ===========================================================================
# 7. Usage Tracking
# ===========================================================================

class TestUsage:
    @pytest.mark.anyio
    async def test_usage_tracking(self, app_client: AsyncClient):
        c = app_client
        user = await _register_and_login(c)
        h = _bearer(user["token"])

        # Create a subscription first
        webhook_event = {
            "id": f"evt_{_uid()}",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": f"cs_{_uid()}",
                    "metadata": {
                        "user_id": user["user_id"], "tenant_id": "default",
                        "plan_id": "pro", "billing_cycle": "monthly",
                        "seats": "1", "email": user["email"],
                    },
                }
            },
        }
        await c.post(f"{_BILLING}/webhook", content=json.dumps(webhook_event).encode(),
                      headers={"Content-Type": "application/json", "Stripe-Signature": "mock_sig_test"})

        # Record usage
        r = await c.post(f"{_BILLING}/usage/record?metric=ai_calls&quantity=50", headers=h)
        assert r.status_code == 200
        assert r.json()["metric"] == "ai_calls"

        # Get usage summary
        r = await c.get(f"{_BILLING}/usage/me", headers=h)
        assert r.status_code == 200
        body = r.json()
        assert body["plan_id"] == "pro"
        assert "usage" in body
        assert body["usage"]["ai_calls"]["used"] >= 50


# ===========================================================================
# 8. Trial Flow
# ===========================================================================

class TestTrialFlow:
    @pytest.mark.anyio
    async def test_trial_start(self, app_client: AsyncClient):
        c = app_client
        user = await _register_and_login(c)
        h = _bearer(user["token"])

        r = await c.post(f"{_BILLING}/trial", headers=h, json={"plan_id": "pro", "days": 14})
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "trialing"
        assert body["plan_id"] == "pro"

    @pytest.mark.anyio
    async def test_trial_duplicate(self, app_client: AsyncClient):
        c = app_client
        user = await _register_and_login(c)
        h = _bearer(user["token"])

        # First trial
        r = await c.post(f"{_BILLING}/trial", headers=h, json={"plan_id": "pro"})
        assert r.status_code == 200

        # Duplicate trial should fail
        r = await c.post(f"{_BILLING}/trial", headers=h, json={"plan_id": "starter"})
        assert r.status_code == 400


# ===========================================================================
# 9. Admin Operations
# ===========================================================================

class TestAdminOperations:
    @pytest.mark.anyio
    async def test_admin_list_subscriptions(self, app_client: AsyncClient):
        c = app_client
        admin = await _register_admin(c)
        h = _bearer(admin["token"])

        r = await c.get(f"{_BILLING}/admin/subscriptions", headers=h)
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        assert isinstance(body["data"], list)

    @pytest.mark.anyio
    async def test_admin_refund(self, app_client: AsyncClient):
        c = app_client
        admin = await _register_admin(c)
        admin_h = _bearer(admin["token"])
        user = await _register_and_login(c)
        user_h = _bearer(user["token"])

        # Create subscription + invoice via webhook
        webhook_event = {
            "id": f"evt_{_uid()}",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": f"cs_{_uid()}",
                    "metadata": {
                        "user_id": user["user_id"], "tenant_id": "default",
                        "plan_id": "pro", "billing_cycle": "monthly",
                        "seats": "1", "email": user["email"],
                    },
                }
            },
        }
        await c.post(f"{_BILLING}/webhook", content=json.dumps(webhook_event).encode(),
                      headers={"Content-Type": "application/json", "Stripe-Signature": "mock_sig_test"})

        # Get invoice ID
        r = await c.get(f"{_BILLING}/invoices/mine", headers=user_h)
        invoices = r.json()
        if invoices["total"] > 0:
            inv_id = invoices["data"][0]["id"]

            # Admin refund
            r = await c.post(f"{_BILLING}/admin/refund", headers=admin_h, json={
                "invoice_id": inv_id, "amount_cents": 1000, "reason": "test refund",
            })
            assert r.status_code == 200
            body = r.json()
            assert body["refund"]["status"] == "succeeded"

    @pytest.mark.anyio
    async def test_admin_credit(self, app_client: AsyncClient):
        c = app_client
        admin = await _register_admin(c)
        admin_h = _bearer(admin["token"])
        user = await _register_and_login(c)
        user_h = _bearer(user["token"])

        # Create subscription
        await c.post(f"{_BILLING}/trial", headers=user_h, json={"plan_id": "pro"})

        r = await c.post(f"{_BILLING}/admin/credit", headers=admin_h, json={
            "user_id": user["user_id"],
            "amount_cents": 5000,
            "description": "Loyalty bonus",
        })
        assert r.status_code == 200
        assert r.json()["amount_cents"] == 5000

    @pytest.mark.anyio
    async def test_admin_force_cancel(self, app_client: AsyncClient):
        c = app_client
        admin = await _register_admin(c)
        admin_h = _bearer(admin["token"])
        user = await _register_and_login(c)
        user_h = _bearer(user["token"])

        # Create subscription
        r = await c.post(f"{_BILLING}/trial", headers=user_h, json={"plan_id": "pro"})
        sub_id = r.json()["id"]

        # Force cancel
        r = await c.post(f"{_BILLING}/admin/cancel/{sub_id}?reason=policy_violation", headers=admin_h)
        assert r.status_code == 200
        assert r.json()["status"] == "canceled"


# ===========================================================================
# 10. Customer Profile
# ===========================================================================

class TestCustomerProfile:
    @pytest.mark.anyio
    async def test_customer_crud(self, app_client: AsyncClient):
        c = app_client
        user = await _register_and_login(c)
        h = _bearer(user["token"])

        # Get (auto-creates)
        r = await c.get(f"{_BILLING}/customer", headers=h)
        assert r.status_code == 200
        cust = r.json()
        assert cust["email"]
        assert cust["stripe_customer_id"]

        # Update
        r = await c.put(f"{_BILLING}/customer", headers=h, json={
            "name": "Updated Name", "tax_id": "US123456789",
        })
        assert r.status_code == 200
        assert r.json()["name"] == "Updated Name"

    @pytest.mark.anyio
    async def test_portal_url(self, app_client: AsyncClient):
        c = app_client
        user = await _register_and_login(c)
        h = _bearer(user["token"])
        r = await c.get(f"{_BILLING}/portal", headers=h)
        assert r.status_code == 200
        assert r.json()["url"]
        assert r.json()["mode"] == "mock"


# ===========================================================================
# 11. Auth Guard
# ===========================================================================

class TestAuthGuard:
    @pytest.mark.anyio
    async def test_unauthenticated_blocked(self, app_client: AsyncClient):
        """Endpoints requiring auth should return 401 without a token."""
        c = app_client
        endpoints = [
            ("GET", f"{_BILLING}/subscription/me"),
            ("GET", f"{_BILLING}/customer"),
            ("GET", f"{_BILLING}/payment-methods/mine"),
            ("GET", f"{_BILLING}/invoices/mine"),
            ("GET", f"{_BILLING}/usage/me"),
        ]
        for method, url in endpoints:
            r = await c.request(method, url)
            assert r.status_code == 401, f"{method} {url} should be 401, got {r.status_code}"

    @pytest.mark.anyio
    async def test_non_admin_blocked(self, app_client: AsyncClient):
        """Admin endpoints should return 403 for non-admin users."""
        c = app_client
        user = await _register_and_login(c)
        h = _bearer(user["token"])
        r = await c.get(f"{_BILLING}/admin/subscriptions", headers=h)
        assert r.status_code == 403


# ===========================================================================
# 12. Legacy Endpoints
# ===========================================================================

class TestLegacyEndpoints:
    @pytest.mark.anyio
    async def test_legacy_subscription(self, app_client: AsyncClient):
        r = await app_client.get(f"{_BILLING}/subscription")
        assert r.status_code == 200
        body = r.json()
        assert "plan" in body or "plan_id" in body

    @pytest.mark.anyio
    async def test_legacy_invoices(self, app_client: AsyncClient):
        r = await app_client.get(f"{_BILLING}/invoices")
        assert r.status_code == 200
        assert "data" in r.json()

    @pytest.mark.anyio
    async def test_legacy_payment_methods(self, app_client: AsyncClient):
        r = await app_client.get(f"{_BILLING}/payment-methods")
        assert r.status_code == 200
        assert "data" in r.json()

    @pytest.mark.anyio
    async def test_legacy_usage(self, app_client: AsyncClient):
        r = await app_client.get(f"{_BILLING}/usage")
        assert r.status_code == 200
        body = r.json()
        assert "period" in body

    @pytest.mark.anyio
    async def test_legacy_subscribe(self, app_client: AsyncClient):
        r = await app_client.post(f"{_BILLING}/subscribe?plan=pro&seats=2")
        assert r.status_code == 200
        assert r.json().get("created") is True
