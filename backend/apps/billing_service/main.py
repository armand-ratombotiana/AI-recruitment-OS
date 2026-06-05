"""Billing Service — production-grade subscription & payment system.

This module wires the FastAPI router and orchestrates the per-user store,
the Stripe client (real or mock), webhook handling, and the internal
event bus.

The legacy endpoints (`/subscribe`, the global `/invoices`, etc.) remain
in place to keep the existing test suite (`test_all_endpoints.py`) green.
The new authenticated endpoints are added on top.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, Request, status
from pydantic import BaseModel

from shared.core.config import get_settings
from shared.core.security import decode_token
from shared.auth import require_tenant_id

from apps.billing_service import store, events
from apps.billing_service.models import (
    CheckoutRequest,
    CheckoutResponse,
    CouponRequest,
    CreditRequest,
    CustomerUpdateRequest,
    HealthResponse,
    PauseSubscriptionRequest,
    RefundRequest,
    SetupIntentResponse,
    Subscription,
    SubscriptionStatus,
    TrialRequest,
    UpdateSubscriptionRequest,
    WebhookResponse,
    CancelSubscriptionRequest,
)
from apps.billing_service.plans import (
    PLANS,
    annual_savings_pct,
    get_plan,
    plan_price_cents,
)
from apps.billing_service.stripe_client import (
    create_checkout_session,
    create_customer,
    create_invoice,
    create_portal_session,
    create_setup_intent,
    create_subscription,
    cancel_subscription,
    detach_payment_method,
    is_live_mode,
    mark_invoice_paid,
    mark_invoice_failed,
    mode as stripe_mode,
    pause_subscription,
    refund_invoice,
    resume_subscription,
    update_subscription_plan,
    verify_webhook_signature,
    attach_payment_method,
    list_customer_payment_methods,
    update_customer,
)
from apps.billing_service.models import (
    PaymentMethod,
    Invoice,
    InvoiceLineItem,
    Customer,
    WebhookEvent,
    Coupon,
    UsageRecord,
)
from apps.billing_service.store import (
    _utcnow,
    _new_event_id,
    seed_demo_subscription,
)


logger = logging.getLogger("billing_service")
settings = get_settings()
router = APIRouter()
v2 = APIRouter()  # sub-router included FIRST so it takes precedence over legacy routes


# ── Auth helpers ──────────────────────────────────────────────────────────────


def _current_user(
    authorization: str | None = Header(None),
    x_tenant_id: str | None = Header(None, alias="X-Tenant-ID"),
) -> dict[str, Any]:
    """Extract user/tenant from a bearer token.

    Returns a dict with at least `user_id`, `email`, `role`, and `tenant_id`.
    When no token is supplied, returns the anonymous demo user so that
    legacy endpoints continue to work.
    """
    tenant_id = x_tenant_id or "default"
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
        payload = decode_token(token) or {}
        user_id = payload.get("sub")
        email = payload.get("email")
        role = payload.get("role")
        if user_id:
            # Lazy-seed demo user on first access (multi-worker safety net)
            _ensure_demo_seeded_for(user_id, email or "")
            return {
                "user_id": user_id,
                "email": email or "",
                "role": role or "candidate",
                "tenant_id": tenant_id,
                "is_authenticated": True,
            }
    # Anonymous — keep the legacy global state working.
    return {
        "user_id": "anon",
        "email": "",
        "role": "guest",
        "tenant_id": tenant_id,
        "is_authenticated": False,
    }


def _ensure_demo_seeded_for(user_id: str, email: str) -> None:
    """Lazy-seed the demo user's billing data on first access (idempotent).

    With multiple uvicorn workers each process has its own in-memory store.
    When the demo user hits a worker that hasn't seeded yet, this seeds it
    on the fly. Safe to call repeatedly (the seed is idempotent).
    """
    if store.get_subscription_by_user(user_id) is not None:
        return
    if email and email.lower() != "demo@airos.io":
        return
    if not email:
        # No email in the JWT — we cannot identify the user as the demo account.
        return
    # Quick path: assume the user_id is the demo user (the only seeded path)
    try:
        # Create the customer and seed a default PM + Pro subscription inline.
        from datetime import timedelta
        cust = store.get_or_create_customer(
            user_id=user_id, tenant_id="default", email="demo@airos.io", name="Demo User"
        )
        bucket = store._payment_methods_by_user.setdefault(user_id, {})
        if "pm_demo_default" not in bucket:
            from apps.billing_service.models import PaymentMethod
            bucket["pm_demo_default"] = PaymentMethod(
                id="pm_demo_default", user_id=user_id, customer_id=cust.id,
                type="card", brand="visa", last_four="4242", exp_month=12, exp_year=2028,
                is_default=True, stripe_payment_method_id="pm_stripe_demo_default",
                created_at=store._utcnow(),
            )
        from apps.billing_service.models import Subscription, SubscriptionStatus
        now = store._utcnow()
        sub = Subscription(
            id="sub_demo_pro", user_id=user_id, tenant_id="default", customer_id=cust.id,
            plan_id="pro", billing_cycle="monthly", seats=5,
            status=SubscriptionStatus.ACTIVE,
            current_period_start=now, current_period_end=now + timedelta(days=30),
            stripe_subscription_id="sub_stripe_demo_pro", created_at=now, updated_at=now,
        )
        store.save_subscription(sub)
        # Invoice
        from apps.billing_service.plans import plan_price_cents
        from apps.billing_service.models import Invoice, InvoiceLineItem
        amount = plan_price_cents("pro", "monthly", 5)
        inv = Invoice(
            id="inv_demo_001", user_id=user_id, customer_id=cust.id,
            subscription_id=sub.id, number="AIROS-2025-0001",
            status="paid", currency="usd", subtotal_cents=amount, tax_cents=0,
            total_cents=amount, amount_due_cents=0, amount_paid_cents=amount,
            line_items=[InvoiceLineItem(
                description="Pro Plan (5 seats, monthly)", quantity=1,
                unit_amount_cents=amount, amount_cents=amount,
            )],
            period_start=now, period_end=now + timedelta(days=30),
            pdf_url="http://localhost:8000/api/v1/billing/invoices/inv_demo_001/pdf",
            hosted_url="http://localhost:8000/api/v1/billing/invoices/inv_demo_001",
            stripe_invoice_id="in_stripe_demo_001",
            created_at=now, paid_at=now,
        )
        store.save_invoice(inv)
        # Usage records
        period = now.strftime("%Y-%m")
        for metric, qty in [("ai_calls", 1240.0), ("active_candidates", 17.0),
                             ("active_jobs", 4.0), ("storage_gb", 3.2)]:
            store.record_usage(UsageRecord(
                id=store._new_id("u"), user_id=user_id, metric=metric, quantity=qty,
                period=period, timestamp=now,
            ))
    except Exception as exc:
        logger.debug("Lazy demo seed failed (non-fatal): %s", exc)


# ── Health ────────────────────────────────────────────────────────────────────


@router.get("/health", response_model=HealthResponse, tags=["Billing"])
async def health() -> HealthResponse:
    return HealthResponse(
        status="healthy",
        service="billing",
        mode=stripe_mode(),
        currency=settings.BILLING_CURRENCY,
        trial_days=settings.TRIAL_DAYS,
    )


# ── Plans (public) ────────────────────────────────────────────────────────────


def _serialize_plan(p: dict[str, Any]) -> dict[str, Any]:
    """Return the public-facing plan shape with computed fields."""
    return {
        **p,
        "monthly_price": p["monthly_price_cents"] / 100,
        "annual_price": p["annual_price_cents"] / 100,
        "per_seat_price": p["per_seat_price_cents"] / 100,
        "annual_savings_pct": annual_savings_pct(p["id"]),
        "limits": p["limits"],
    }


@router.get("/plans", tags=["Billing"], summary="List available plans")
async def list_plans() -> dict[str, Any]:
    data = [_serialize_plan(p) for p in PLANS]
    return {"data": data, "total": len(data)}


@router.get("/plans/{plan_id}", tags=["Billing"], summary="Get a plan")
async def get_plan_endpoint(plan_id: str) -> dict[str, Any]:
    p = get_plan(plan_id)
    if not p:
        raise HTTPException(status_code=404, detail=f"Plan '{plan_id}' not found")
    return _serialize_plan(p)


# ── Customer ──────────────────────────────────────────────────────────────────


@router.get("/customer", tags=["Billing"], summary="Get current customer profile")
async def get_customer(user: dict[str, Any] = Depends(_current_user)) -> dict[str, Any]:
    _require_user(user)
    customer = _ensure_customer(user)
    return customer.model_dump(mode="json")


@router.put("/customer", tags=["Billing"], summary="Update customer profile")
async def update_customer_endpoint(
    data: CustomerUpdateRequest,
    user: dict[str, Any] = Depends(_current_user),
) -> dict[str, Any]:
    _require_user(user)
    customer = _ensure_customer(user)
    payload = data.model_dump(exclude_none=True)
    if not payload:
        return customer.model_dump(mode="json")
    # Update mock
    store.update_customer(user["user_id"], **payload)
    # Sync with stripe (no-op in mock)
    if customer.stripe_customer_id:
        try:
            update_customer(customer.stripe_customer_id, **payload)
        except Exception as exc:
            logger.warning("Stripe customer update failed (non-fatal in mock): %s", exc)
    events.emit("customer.updated", user["tenant_id"], {
        "user_id": user["user_id"], "fields": list(payload.keys()),
    })
    return store.get_customer_by_user(user["user_id"]).model_dump(mode="json")


# ── Payment methods ───────────────────────────────────────────────────────────


@router.post("/payment-methods/setup", response_model=SetupIntentResponse, tags=["Billing"], summary="Create SetupIntent")
async def setup_payment_method(user: dict[str, Any] = Depends(_current_user)) -> SetupIntentResponse:
    _require_user(user)
    customer = _ensure_customer(user)
    intent = create_setup_intent(customer_id=customer.stripe_customer_id)
    return SetupIntentResponse(
        id=intent.get("id", ""),
        client_secret=intent.get("client_secret", ""),
        customer_id=customer.id,
        mode=stripe_mode(),
    )


@router.get("/payment-methods/mine", tags=["Billing"], summary="List my payment methods")
async def list_my_payment_methods(user: dict[str, Any] = Depends(_current_user)) -> dict[str, Any]:
    _require_user(user)
    items = store.list_payment_methods(user["user_id"])
    return {"data": [pm.model_dump(mode="json") for pm in items], "total": len(items)}


class AddPaymentMethodBody(BaseModel):
    brand: str = "visa"
    last_four: str = "4242"
    exp_month: int = 12
    exp_year: int = 2030
    set_default: bool = True
    stripe_payment_method_id: str | None = None  # when supplied (live mode), attach it


@router.post("/payment-methods/mine", tags=["Billing"], summary="Add a payment method")
async def add_my_payment_method(
    data: AddPaymentMethodBody,
    user: dict[str, Any] = Depends(_current_user),
) -> dict[str, Any]:
    _require_user(user)
    customer = _ensure_customer(user)
    bucket = store.list_payment_methods(user["user_id"])
    make_default = data.set_default and not bucket
    pm_id = store._new_payment_method_id()
    stripe_pm_id = data.stripe_payment_method_id
    if is_live_mode() and stripe_pm_id:
        try:
            attach_payment_method(stripe_pm_id, customer.stripe_customer_id)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not attach payment method: {exc}")
    elif is_live_mode() and not stripe_pm_id:
        # Use the SetupIntent flow instead
        intent = create_setup_intent(customer_id=customer.stripe_customer_id)
        return {
            "setup_intent_id": intent.get("id"),
            "client_secret": intent.get("client_secret"),
            "mode": stripe_mode(),
        }
    pm = PaymentMethod(
        id=pm_id,
        user_id=user["user_id"],
        customer_id=customer.id,
        type="card",
        brand=data.brand,
        last_four=data.last_four,
        exp_month=data.exp_month,
        exp_year=data.exp_year,
        is_default=make_default,
        stripe_payment_method_id=stripe_pm_id or f"pm_mock_{pm_id.split('_')[-1]}",
        created_at=_utcnow(),
    )
    store.add_payment_method(user["user_id"], pm)
    return pm.model_dump(mode="json")


@router.delete("/payment-methods/mine/{pm_id}", tags=["Billing"], summary="Remove a payment method")
async def remove_my_payment_method(
    pm_id: str,
    user: dict[str, Any] = Depends(_current_user),
) -> dict[str, Any]:
    _require_user(user)
    pm = store.get_payment_method(user["user_id"], pm_id)
    if not pm:
        raise HTTPException(status_code=404, detail="Payment method not found")
    if pm.stripe_payment_method_id and is_live_mode():
        try:
            detach_payment_method(pm.stripe_payment_method_id)
        except Exception as exc:
            logger.warning("Stripe detach failed: %s", exc)
    store.remove_payment_method(user["user_id"], pm_id)
    return {"id": pm_id, "deleted": True}


@router.put("/payment-methods/mine/{pm_id}/default", tags=["Billing"], summary="Set default payment method")
async def set_default_my_payment_method(
    pm_id: str,
    user: dict[str, Any] = Depends(_current_user),
) -> dict[str, Any]:
    _require_user(user)
    ok = store.set_default_payment_method(user["user_id"], pm_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Payment method not found")
    return {"id": pm_id, "is_default": True}


# ── Invoices ──────────────────────────────────────────────────────────────────


@router.get("/invoices/mine", tags=["Billing"], summary="List my invoices")
async def list_my_invoices(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    user: dict[str, Any] = Depends(_current_user),
) -> dict[str, Any]:
    _require_user(user)
    items = store.list_invoices(user["user_id"], status=status_filter)
    items = items[:limit]
    return {
        "data": [inv.model_dump(mode="json") for inv in items],
        "total": len(items),
    }


@router.get("/invoices/mine/{invoice_id}", tags=["Billing"], summary="Get one of my invoices")
async def get_my_invoice(
    invoice_id: str,
    user: dict[str, Any] = Depends(_current_user),
) -> dict[str, Any]:
    _require_user(user)
    inv = store.get_invoice(user["user_id"], invoice_id) or store.get_invoice_any(invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv.model_dump(mode="json")


@router.get("/invoices/mine/{invoice_id}/pdf", tags=["Billing"], summary="Download invoice PDF (mock signed URL)")
async def get_my_invoice_pdf(
    invoice_id: str,
    user: dict[str, Any] = Depends(_current_user),
) -> dict[str, Any]:
    _require_user(user)
    inv = store.get_invoice(user["user_id"], invoice_id) or store.get_invoice_any(invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    # In live mode this would be Stripe's invoice_pdf URL. In mock, we return
    # a signed-style URL the frontend can hit.
    return {
        "url": f"http://localhost:8000/api/v1/billing/invoices/{invoice_id}/pdf?token=mock_signed_{invoice_id}",
        "expires_in": 3600,
        "invoice_id": invoice_id,
        "mode": stripe_mode(),
    }


# ── Usage ─────────────────────────────────────────────────────────────────────


@router.get("/usage/me", tags=["Billing"], summary="My current usage vs plan limits")
async def get_my_usage(user: dict[str, Any] = Depends(_current_user)) -> dict[str, Any]:
    _require_user(user)
    sub = store.get_subscription_by_user(user["user_id"])
    plan_id = sub.plan_id if sub else "free"
    plan = get_plan(plan_id) or get_plan("free")
    period = _utcnow().strftime("%Y-%m")
    recs = store.list_usage(user["user_id"], period=period)
    by_metric: dict[str, float] = {}
    for r in recs:
        by_metric[r.metric] = by_metric.get(r.metric, 0.0) + r.quantity

    def _build(metric: str, used: float, limit: int) -> dict[str, Any]:
        if limit == -1:
            return {"used": used, "limit": -1, "unlimited": True, "pct": 0, "overage": 0}
        pct = (used / limit * 100) if limit > 0 else 0
        overage = max(0.0, used - limit)
        return {"used": used, "limit": limit, "unlimited": False, "pct": round(pct, 1), "overage": overage}

    limits = plan["limits"]
    usage = {
        "ai_calls": _build("ai_calls", by_metric.get("ai_calls", 0.0), limits["ai_calls_per_month"]),
        "active_candidates": _build("active_candidates", by_metric.get("active_candidates", 0.0), limits["candidates"]),
        "active_jobs": _build("active_jobs", by_metric.get("active_jobs", 0.0), limits["jobs"]),
        "storage_gb": _build("storage_gb", by_metric.get("storage_gb", 0.0), limits["storage_gb"]),
    }

    overage_cents = 0
    for metric_name, info in usage.items():
        if info.get("unlimited"):
            continue
        # mock: $0.10 per unit over the limit
        if info["overage"] > 0:
            overage_cents += int(info["overage"] * 10)

    return {
        "period": period,
        "plan_id": plan_id,
        "plan_name": plan["name"],
        "limits": limits,
        "usage": usage,
        "overage_cents": overage_cents,
    }


@router.post("/usage/record", tags=["Billing"], summary="Record a usage event (internal)")
async def record_usage_event(
    metric: str = Query(..., description="ai_calls | active_candidates | active_jobs | storage_gb"),
    quantity: float = Query(default=1.0, ge=0),
    user: dict[str, Any] = Depends(_current_user),
) -> dict[str, Any]:
    _require_user(user)
    rec = store.UsageRecord(
        id=f"u_{uuid_str()[:16]}",
        user_id=user["user_id"],
        metric=metric,
        quantity=quantity,
        period=_utcnow().strftime("%Y-%m"),
        timestamp=_utcnow(),
    )
    store.record_usage(rec)
    return rec.model_dump(mode="json")


# ── Coupons ───────────────────────────────────────────────────────────────────


@router.post("/coupon", tags=["Billing"], summary="Validate and preview a coupon")
async def apply_coupon(
    data: CouponRequest,
    user: dict[str, Any] = Depends(_current_user),
) -> dict[str, Any]:
    _require_user(user)
    coupon = store.get_coupon(data.code)
    if not coupon:
        raise HTTPException(status_code=400, detail="Invalid coupon code")
    if not coupon.valid:
        raise HTTPException(status_code=400, detail="Coupon is no longer valid")
    return {
        "valid": True,
        "code": coupon.code,
        "percent_off": coupon.percent_off,
        "amount_off_cents": coupon.amount_off_cents,
        "currency": coupon.currency,
        "duration": coupon.duration,
        "duration_months": coupon.duration_months,
    }


# ── Customer portal ───────────────────────────────────────────────────────────


@router.get("/portal", tags=["Billing"], summary="Get a Stripe customer portal URL")
async def get_portal_url(
    return_url: str = Query(default="http://localhost:3000/billing"),
    user: dict[str, Any] = Depends(_current_user),
) -> dict[str, Any]:
    _require_user(user)
    customer = _ensure_customer(user)
    sess = create_portal_session(customer_id=customer.stripe_customer_id, return_url=return_url)
    return {"url": sess.get("url"), "id": sess.get("id"), "mode": stripe_mode()}


# ── Trial ─────────────────────────────────────────────────────────────────────


@router.post("/trial", tags=["Billing"], summary="Start a free trial")
async def start_trial(
    data: TrialRequest,
    user: dict[str, Any] = Depends(_current_user),
) -> dict[str, Any]:
    _require_user(user)
    if store.get_subscription_by_user(user["user_id"]):
        raise HTTPException(status_code=400, detail="User already has a subscription")

    plan = get_plan(data.plan_id) or get_plan("pro")
    customer = _ensure_customer(user)
    now = _utcnow()
    trial_days = data.days or settings.TRIAL_DAYS
    sub = Subscription(
        id=store._new_subscription_id(),
        user_id=user["user_id"],
        tenant_id=user["tenant_id"],
        customer_id=customer.id,
        plan_id=plan["id"],
        billing_cycle="monthly",
        seats=1,
        status=SubscriptionStatus.TRIALING,
        current_period_start=now,
        current_period_end=now + timedelta(days=trial_days),
        trial_start=now,
        trial_end=now + timedelta(days=trial_days),
        stripe_subscription_id=f"sub_trial_{uuid_str()[:12]}",
        created_at=now,
        updated_at=now,
    )
    store.save_subscription(sub)
    events.emit("trial.started", user["tenant_id"], {
        "user_id": user["user_id"],
        "plan_id": plan["id"],
        "trial_days": trial_days,
        "trial_end": sub.trial_end.isoformat(),
    })
    return sub.model_dump(mode="json")


# ── Admin endpoints ───────────────────────────────────────────────────────────


def _require_admin(user: dict[str, Any]) -> None:
    if not user.get("is_authenticated"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required for this endpoint.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    role = (user.get("role") or "").lower()
    if role not in ("super_admin", "tenant_admin", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Admin role required (super_admin, tenant_admin, or admin).",
        )


@router.get("/admin/subscriptions", tags=["Billing — Admin"], summary="List ALL subscriptions")
async def admin_list_subscriptions(
    user: dict[str, Any] = Depends(_current_user),
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    _require_admin(user)
    subs = [s.model_dump(mode="json") for s in store.list_all_subscriptions() if s.tenant_id == tenant_id]
    return {"data": subs, "total": len(subs)}


@router.post("/admin/refund", tags=["Billing — Admin"], summary="Issue a refund")
async def admin_refund(
    data: RefundRequest,
    user: dict[str, Any] = Depends(_current_user),
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    _require_admin(user)
    inv = store.get_invoice_any(data.invoice_id)
    if not inv or inv.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    result = refund_invoice(invoice_id=data.invoice_id, amount_cents=data.amount_cents)
    inv.refunded_cents += data.amount_cents or inv.total_cents
    if inv.refunded_cents >= inv.total_cents:
        inv.status = "void"
    store.save_invoice(inv)
    store.record_refund({
        "invoice_id": data.invoice_id,
        "user_id": inv.user_id,
        "amount_cents": data.amount_cents,
        "reason": data.reason,
        "refund_id": result.get("id"),
        "issued_by": user["user_id"],
        "issued_at": _utcnow().isoformat(),
    })
    events.emit("refund.issued", inv.tenant_id or "default", {
        "invoice_id": data.invoice_id,
        "amount_cents": data.amount_cents or inv.total_cents,
        "user_id": inv.user_id,
    })
    return {"refund": result, "invoice": inv.model_dump(mode="json")}


@router.post("/admin/credit", tags=["Billing — Admin"], summary="Apply a credit to a subscription")
async def admin_credit(
    data: CreditRequest,
    user: dict[str, Any] = Depends(_current_user),
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    _require_admin(user)
    sub = store.get_subscription_by_user(data.user_id)
    if not sub or sub.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Target user has no subscription")
    sub.credit_cents = (sub.credit_cents or 0) + data.amount_cents
    sub.updated_at = _utcnow()
    store.save_subscription(sub)
    record = {
        "user_id": data.user_id,
        "amount_cents": data.amount_cents,
        "currency": data.currency,
        "description": data.description,
        "expires_at": data.expires_at.isoformat() if data.expires_at else None,
        "issued_by": user["user_id"],
        "issued_at": _utcnow().isoformat(),
        "subscription_credit_total_cents": sub.credit_cents,
    }
    store.record_credit(record)
    events.emit("credit.applied", sub.tenant_id, {
        "user_id": data.user_id, "amount_cents": data.amount_cents, "total_credit_cents": sub.credit_cents,
    })
    return record


@router.post("/admin/cancel/{subscription_id}", tags=["Billing — Admin"], summary="Force-cancel a subscription")
async def admin_force_cancel(
    subscription_id: str,
    reason: str | None = Query(default=None),
    user: dict[str, Any] = Depends(_current_user),
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    _require_admin(user)
    sub = store.get_subscription(subscription_id)
    if not sub or sub.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.status = SubscriptionStatus.CANCELED
    sub.canceled_at = _utcnow()
    sub.cancel_at_period_end = False
    sub.updated_at = _utcnow()
    store.save_subscription(sub)
    events.emit("subscription.canceled", sub.tenant_id, {
        "user_id": sub.user_id, "force": True, "reason": reason, "by": user["user_id"],
    })
    return sub.model_dump(mode="json")


# ── Webhook (public) ──────────────────────────────────────────────────────────


@router.post("/webhook", response_model=WebhookResponse, tags=["Billing — Webhook"], summary="Stripe webhook")
async def stripe_webhook(request: Request) -> WebhookResponse:
    """Receive a Stripe webhook (or a mock equivalent).

    The handler is idempotent: events with the same `id` are processed exactly
    once. Signature verification is enforced in live mode; mock mode accepts
    any well-formed event.
    """
    payload = await request.body()
    sig_header = request.headers.get("Stripe-Signature") or request.headers.get("X-Stripe-Signature")
    try:
        event = verify_webhook_signature(payload, sig_header or "")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid webhook: {exc}")

    event_id = str(event.get("id", ""))
    event_type = str(event.get("type", ""))
    if not event_id or not event_type:
        raise HTTPException(status_code=400, detail="Webhook missing id/type")

    if (existing := store.get_webhook_event(event_id)) is not None:
        return WebhookResponse(
            received=True,
            event_id=event_id,
            type=event_type,
            processed=existing.processed,
            duplicate=True,
            error=existing.error,
        )

    wh = WebhookEvent(
        id=event_id,
        type=event_type,
        api_version=event.get("api_version"),
        created=_utcnow(),
        data=event.get("data", {}),
    )
    store.record_webhook_event(wh)
    try:
        _handle_webhook_event(wh, event)
        wh.processed = True
        wh.processed_at = _utcnow()
        store.record_webhook_event(wh)
        return WebhookResponse(received=True, event_id=event_id, type=event_type, processed=True, duplicate=False)
    except Exception as exc:
        wh.processed = False
        wh.error = str(exc)
        wh.processed_at = _utcnow()
        store.record_webhook_event(wh)
        return WebhookResponse(
            received=True, event_id=event_id, type=event_type,
            processed=False, duplicate=False, error=str(exc),
        )


def _handle_webhook_event(wh: WebhookEvent, raw: dict[str, Any]) -> None:
    """Apply the side effects of a webhook event to the in-memory store."""
    et = wh.type
    obj = (raw.get("data") or {}).get("object") or {}

    if et == "checkout.session.completed":
        # Create or upgrade subscription for the user.
        metadata = obj.get("metadata") or {}
        user_id = metadata.get("user_id") or "anon"
        tenant_id = metadata.get("tenant_id") or "default"
        plan_id = metadata.get("plan_id") or "pro"
        billing_cycle = metadata.get("billing_cycle") or "monthly"
        seats = int(metadata.get("seats") or 1)
        customer = store.get_or_create_customer(
            user_id=user_id, tenant_id=tenant_id,
            email=metadata.get("email") or f"{user_id}@airos.io",
        )
        now = _utcnow()
        sub = store.get_subscription_by_user(user_id)
        if sub is None:
            sub = Subscription(
                id=store._new_subscription_id(),
                user_id=user_id, tenant_id=tenant_id, customer_id=customer.id,
                plan_id=plan_id, billing_cycle=billing_cycle, seats=seats,
                status=SubscriptionStatus.ACTIVE,
                current_period_start=now, current_period_end=now + timedelta(days=30 if billing_cycle == "monthly" else 365),
                stripe_subscription_id=obj.get("subscription"),
                created_at=now, updated_at=now,
            )
            store.save_subscription(sub)
        # Always create a paid invoice for the checkout (idempotency on event id
        # ensures the same event never produces two invoices).
        amount = plan_price_cents(plan_id, billing_cycle, seats)
        existing_inv = store.get_invoice_by_stripe_id(
            f"in_{obj.get('id', store._new_invoice_id())}"
        )
        if existing_inv is None:
            inv = _build_invoice(
                user={"user_id": user_id, "tenant_id": tenant_id},
                customer=customer, subscription=sub,
                amount_cents=amount,
                description=f"{plan_id.title()} Plan ({seats} seats, {billing_cycle})",
                status_value="paid",
                invoice_id=store._new_invoice_id(),
            )
            inv.stripe_invoice_id = f"in_{obj.get('id', 'pending')}"
            store.save_invoice(inv)
            events.emit("payment.succeeded", tenant_id, {
                "user_id": user_id, "amount_cents": amount, "invoice_id": inv.id,
            })

    elif et == "customer.subscription.updated":
        sub_id = obj.get("id")
        sub = next((s for s in store.list_all_subscriptions() if s.stripe_subscription_id == sub_id), None)
        if sub:
            new_status = obj.get("status", sub.status)
            mapping = {
                "active": SubscriptionStatus.ACTIVE,
                "past_due": SubscriptionStatus.PAST_DUE,
                "trialing": SubscriptionStatus.TRIALING,
                "canceled": SubscriptionStatus.CANCELED,
                "unpaid": SubscriptionStatus.UNPAID,
                "paused": SubscriptionStatus.PAUSED,
                "incomplete": SubscriptionStatus.INCOMPLETE,
            }
            sub.status = mapping.get(new_status, sub.status)
            sub.cancel_at_period_end = bool(obj.get("cancel_at_period_end", False))
            sub.updated_at = _utcnow()
            store.save_subscription(sub)
            events.emit("subscription.updated", sub.tenant_id, {
                "user_id": sub.user_id, "status": sub.status,
            })

    elif et == "customer.subscription.deleted":
        sub_id = obj.get("id")
        sub = next((s for s in store.list_all_subscriptions() if s.stripe_subscription_id == sub_id), None)
        if sub:
            sub.status = SubscriptionStatus.CANCELED
            sub.canceled_at = _utcnow()
            sub.updated_at = _utcnow()
            store.save_subscription(sub)
            events.emit("subscription.canceled", sub.tenant_id, {"user_id": sub.user_id, "reason": "stripe"})

    elif et == "invoice.paid":
        stripe_inv_id = obj.get("id")
        # Try to find a matching invoice by stripe id, otherwise create one.
        inv = None
        for invs in store._invoices_by_user.values():
            for i in invs.values():
                if i.stripe_invoice_id == stripe_inv_id:
                    inv = i
                    break
            if inv:
                break
        if inv is None:
            customer = next(
                (c for c in store.list_customers() if c.stripe_customer_id == obj.get("customer")),
                None,
            )
            if customer is None:
                return
            amount = int(obj.get("amount_paid", 0))
            sub = store.get_subscription_by_user(customer.user_id)
            inv = _build_invoice(
                user={"user_id": customer.user_id, "tenant_id": customer.tenant_id},
                customer=customer, subscription=sub,
                amount_cents=amount, description="Stripe invoice",
                status_value="paid", invoice_id=store._new_invoice_id(),
            )
        inv.status = "paid"
        inv.amount_paid_cents = inv.total_cents
        inv.amount_due_cents = 0
        inv.paid_at = _utcnow()
        store.save_invoice(inv)
        events.emit("invoice.paid", inv.user_id, {
            "user_id": inv.user_id, "invoice_id": inv.id, "amount_cents": inv.total_cents,
        })

    elif et == "invoice.payment_failed":
        stripe_inv_id = obj.get("id")
        for invs in store._invoices_by_user.values():
            for i in invs.values():
                if i.stripe_invoice_id == stripe_inv_id:
                    i.status = "open"  # Stripe marks unpaid as open
                    store.save_invoice(i)
                    events.emit("payment.failed", i.user_id, {
                        "user_id": i.user_id, "invoice_id": i.id,
                    })
                    return

    elif et in ("customer.created", "customer.updated"):
        # We sync from the customer object; no-op in mock.
        events.emit("customer.updated", "default", {"stripe_customer": obj.get("id")})

    # Unknown event types are still accepted (acknowledged) — Stripe expects a 2xx.
    return None


# ── Coupons bootstrap (deterministic mock coupons) ───────────────────────────


def bootstrap_coupons() -> None:
    """Register a few deterministic coupons for testing/UX."""
    from datetime import timezone
    now = _utcnow()
    if store.get_coupon("WELCOME20") is None:
        store.register_coupon(Coupon(
            id="cpn_welcome20", code="WELCOME20", percent_off=20,
            duration="once", max_redemptions=1000, valid=True, expires_at=None,
        ))
    if store.get_coupon("PRO50") is None:
        store.register_coupon(Coupon(
            id="cpn_pro50", code="PRO50", percent_off=50,
            duration="repeating", duration_months=3, valid=True,
        ))
    if store.get_coupon("FLAT10") is None:
        store.register_coupon(Coupon(
            id="cpn_flat10", code="FLAT10", amount_off_cents=1000,
            currency="usd", duration="once", valid=True,
        ))




# ── Legacy endpoints (backward compatible) ────────────────────────────────────


@router.get("/subscription", tags=["Billing"], summary="Get current subscription (legacy)")
async def get_subscription_legacy() -> dict[str, Any]:
    return store.get_legacy_subscription()


@router.post("/subscribe", tags=["Billing"], summary="Subscribe (legacy)")
async def subscribe_legacy(
    plan: str | None = Query(default=None),
    seats: int | None = Query(default=None, ge=1),
    billing_cycle: str | None = Query(default=None),
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    # Accept either query params OR a JSON body (for backward compat).
    payload: dict[str, Any] = {}
    if body:
        payload.update(body)
    if plan is not None:
        payload["plan"] = plan
    if seats is not None:
        payload["seats"] = seats
    if billing_cycle is not None:
        payload["billing_cycle"] = billing_cycle
    plan_id = payload.get("plan") or "pro"
    seats_n = int(payload.get("seats") or 1)
    cycle = payload.get("billing_cycle") or "monthly"
    p = get_plan(plan_id)
    if not p:
        raise HTTPException(status_code=404, detail=f"Plan '{plan_id}' not found")
    sub = store.get_legacy_subscription()
    sub.update({
        "plan": plan_id,
        "plan_id": plan_id,
        "status": "active",
        "monthly_price": p["monthly_price_cents"] / 100,
        "seats": seats_n,
        "billing_cycle": cycle,
        "current_period_start": _utcnow().isoformat()[:10],
    })
    return {"id": sub["id"], "plan": plan_id, "created": True}


@router.get("/invoices", tags=["Billing"], summary="List invoices (legacy)")
async def list_invoices_legacy() -> dict[str, Any]:
    items = list(store.get_legacy_invoices().values())
    return {"data": items, "total": len(items)}


@router.get("/invoices/{invoice_id}", tags=["Billing"], summary="Get invoice (legacy)")
async def get_invoice_legacy(invoice_id: str) -> dict[str, Any]:
    # Avoid catching the new endpoint paths.
    if invoice_id in {"mine", "list", "get", "setup"}:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invs = store.get_legacy_invoices()
    if invoice_id not in invs:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv = dict(invs[invoice_id])
    inv.setdefault("line_items", [
        {"description": "Enterprise Plan (50 seats)", "amount": 44900},
        {"description": "AI Token Overage (250K tokens)", "amount": 5000},
    ])
    inv.setdefault("subtotal", inv.get("amount_cents", 49900))
    inv.setdefault("tax", 0)
    inv.setdefault("total", inv.get("amount_cents", 49900))
    return inv


@router.get("/usage", tags=["Billing"], summary="Get usage stats (legacy)")
async def get_usage_legacy() -> dict[str, Any]:
    return {
        "period": _utcnow().strftime("%Y-%m"),
        "ai_tokens": 1250000,
        "candidates": 156,
        "interviews": 42,
        "storage_gb": 12.5,
    }


@router.get("/payment-methods", tags=["Billing"], summary="List payment methods (legacy)")
async def list_payment_methods_legacy() -> dict[str, Any]:
    items = list(store.get_legacy_payment_methods().values())
    return {"data": items, "total": len(items)}


@router.post("/payment-methods", tags=["Billing"], summary="Add payment method (legacy)")
async def add_payment_method_legacy(
    type: str = Query(default="card"),
    last_four: str | None = Query(default=None),
    exp_month: int | None = Query(default=None, ge=1, le=12),
    exp_year: int | None = Query(default=None, ge=2024),
) -> dict[str, Any]:
    import uuid
    pm_id = f"pm_{uuid.uuid4().hex[:8]}"
    pm = {
        "id": pm_id,
        "type": type,
        "last_four": last_four or "0000",
        "exp_month": exp_month or 12,
        "exp_year": exp_year or 2026,
        "is_default": False,
        "created_at": _utcnow().isoformat(),
    }
    store.get_legacy_payment_methods()[pm_id] = pm
    return {"id": pm_id, "type": type, "created": True}


@router.delete("/payment-methods/{method_id}", tags=["Billing"], summary="Delete PM (legacy)")
async def delete_payment_method_legacy(method_id: str) -> dict[str, Any]:
    # Avoid catching the new endpoint paths.
    if method_id in {"mine", "list", "setup"}:
        raise HTTPException(status_code=404, detail="Payment method not found")
    invs = store.get_legacy_payment_methods()
    if method_id not in invs:
        raise HTTPException(status_code=404, detail="Payment method not found")
    del invs[method_id]
    return {"id": method_id, "deleted": True}


# ── New authenticated endpoints ───────────────────────────────────────────────


def _require_user(user: dict[str, Any]) -> dict[str, Any]:
    if not user.get("is_authenticated"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required for this endpoint.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def _ensure_customer(user: dict[str, Any]) -> Customer:
    cust = store.get_or_create_customer(
        user_id=user["user_id"],
        tenant_id=user["tenant_id"],
        email=user["email"] or f"{user['user_id']}@airos.io",
        name=user.get("name") or (user["email"].split("@")[0] if user["email"] else user["user_id"]),
    )
    return cust


def _build_invoice(
    user: dict[str, Any],
    customer: Customer,
    subscription: Subscription | None,
    amount_cents: int,
    description: str,
    status_value: str = "open",
    invoice_id: str | None = None,
    number: str | None = None,
) -> Invoice:
    period = _utcnow()
    period_end = subscription.current_period_end if subscription else (period + timedelta(days=30))
    tax_cents = int(amount_cents * (settings.TAX_RATE_PCT / 100.0))
    total = amount_cents + tax_cents
    inv = Invoice(
        id=invoice_id or store._new_invoice_id(),
        user_id=user["user_id"],
        customer_id=customer.id,
        subscription_id=subscription.id if subscription else None,
        tenant_id=user.get("tenant_id"),
        number=number or f"AIROS-{period.strftime('%Y%m')}-{uuid_str()[:6].upper()}",
        status=status_value,
        currency=settings.BILLING_CURRENCY or "usd",
        subtotal_cents=amount_cents,
        tax_cents=tax_cents,
        total_cents=total,
        amount_due_cents=0 if status_value == "paid" else total,
        amount_paid_cents=total if status_value == "paid" else 0,
        line_items=[InvoiceLineItem(
            description=description,
            quantity=1,
            unit_amount_cents=amount_cents,
            amount_cents=amount_cents,
        )],
        period_start=period,
        period_end=period_end,
        pdf_url=f"http://localhost:8000/api/v1/billing/invoices/{invoice_id or 'pending'}/pdf",
        hosted_url=f"http://localhost:8000/api/v1/billing/invoices/{invoice_id or 'pending'}",
        stripe_invoice_id=f"in_mock_{(invoice_id or 'pending').split('_')[-1]}",
        created_at=period,
        paid_at=period if status_value == "paid" else None,
    )
    return inv


def uuid_str() -> str:
    import uuid
    return uuid.uuid4().hex


@router.post("/checkout", response_model=CheckoutResponse, tags=["Billing"], summary="Create a checkout session")
async def create_checkout(
    data: CheckoutRequest,
    user: dict[str, Any] = Depends(_current_user),
) -> CheckoutResponse:
    _require_user(user)
    p = get_plan(data.plan_id)
    if not p:
        raise HTTPException(status_code=404, detail=f"Plan '{data.plan_id}' not found")

    customer = _ensure_customer(user)
    amount = plan_price_cents(data.plan_id, data.billing_cycle, data.seats)

    # Apply coupon if any.
    coupon = None
    if data.coupon_code:
        coupon = store.get_coupon(data.coupon_code)
        if not coupon:
            raise HTTPException(status_code=400, detail="Invalid coupon code")
        if not coupon.valid:
            raise HTTPException(status_code=400, detail="Coupon is no longer valid")
        if coupon.percent_off:
            amount = int(amount * (1 - coupon.percent_off / 100.0))
        elif coupon.amount_off_cents:
            amount = max(0, amount - coupon.amount_off_cents)

    sess = create_checkout_session(
        customer_id=customer.stripe_customer_id,
        price_cents=amount,
        plan_id=data.plan_id,
        billing_cycle=data.billing_cycle,
        seats=data.seats,
        success_url=data.success_url,
        cancel_url=data.cancel_url,
        metadata={
            "user_id": user["user_id"],
            "tenant_id": user["tenant_id"],
            "coupon_code": data.coupon_code or "",
        },
    )
    events.emit("subscription.created", user["tenant_id"], {
        "user_id": user["user_id"],
        "plan_id": data.plan_id,
        "seats": data.seats,
        "billing_cycle": data.billing_cycle,
        "mode": stripe_mode(),
        "session_id": sess.get("id"),
    })
    return CheckoutResponse(
        checkout_url=sess.get("url", ""),
        session_id=sess.get("id", ""),
        customer_id=customer.id,
        mode=stripe_mode(),
        expires_at=datetime.fromtimestamp(sess["expires_at"], tz=timezone.utc).replace(tzinfo=None) if sess.get("expires_at") else None,
    )


@router.get("/subscription/me", tags=["Billing"], summary="Get the current user's subscription")
async def get_my_subscription(user: dict[str, Any] = Depends(_current_user)) -> dict[str, Any]:
    _require_user(user)
    sub = store.get_subscription_by_user(user["user_id"])
    if not sub:
        return {"has_subscription": False, "subscription": None}
    return {"has_subscription": True, "subscription": sub.model_dump(mode="json")}


@router.put("/subscription/me", tags=["Billing"], summary="Update the current user's subscription")
async def update_my_subscription(
    data: UpdateSubscriptionRequest,
    user: dict[str, Any] = Depends(_current_user),
) -> dict[str, Any]:
    _require_user(user)
    sub = store.get_subscription_by_user(user["user_id"])
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")
    if sub.status in (SubscriptionStatus.CANCELED, SubscriptionStatus.EXPIRED):
        raise HTTPException(status_code=400, detail="Subscription is not active")

    # Plan change (immediate for mock; with proration in real)
    if data.plan_id and data.plan_id != sub.plan_id:
        new_plan = get_plan(data.plan_id)
        if not new_plan:
            raise HTTPException(status_code=404, detail=f"Plan '{data.plan_id}' not found")
        is_downgrade = new_plan["tier"] < get_plan(sub.plan_id)["tier"]
        if is_downgrade and data.prorate:
            sub.scheduled_plan_id = data.plan_id
            sub.scheduled_change_at = sub.current_period_end
        else:
            new_amount = plan_price_cents(data.plan_id, sub.billing_cycle, sub.seats)
            update_subscription_plan(
                subscription_id=sub.stripe_subscription_id or sub.id,
                new_price_cents=new_amount,
                new_plan_id=data.plan_id,
                billing_cycle=sub.billing_cycle,
            )
            sub.plan_id = data.plan_id
        events.emit("subscription.updated", user["tenant_id"], {
            "user_id": user["user_id"], "plan_id": sub.plan_id, "change": "plan"
        })

    if data.seats is not None and data.seats != sub.seats:
        sub.seats = data.seats
        events.emit("subscription.updated", user["tenant_id"], {
            "user_id": user["user_id"], "seats": sub.seats
        })

    if data.billing_cycle and data.billing_cycle != sub.billing_cycle:
        sub.billing_cycle = data.billing_cycle
        events.emit("subscription.updated", user["tenant_id"], {
            "user_id": user["user_id"], "billing_cycle": sub.billing_cycle
        })

    if data.coupon_code:
        coupon = store.get_coupon(data.coupon_code)
        if not coupon:
            raise HTTPException(status_code=400, detail="Invalid coupon code")
        sub.coupon_code = coupon.code

    sub.updated_at = _utcnow()
    store.save_subscription(sub)
    return sub.model_dump(mode="json")


@router.delete("/subscription/me", tags=["Billing"], summary="Cancel the current user's subscription")
async def cancel_my_subscription(
    data: CancelSubscriptionRequest = CancelSubscriptionRequest(),
    user: dict[str, Any] = Depends(_current_user),
) -> dict[str, Any]:
    _require_user(user)
    sub = store.get_subscription_by_user(user["user_id"])
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")

    cancel_subscription(sub.stripe_subscription_id or sub.id, immediate=data.immediate)
    if data.immediate:
        sub.status = SubscriptionStatus.CANCELED
        sub.canceled_at = _utcnow()
    else:
        sub.cancel_at_period_end = True
    sub.updated_at = _utcnow()
    store.save_subscription(sub)
    events.emit("subscription.canceled", user["tenant_id"], {
        "user_id": user["user_id"], "immediate": data.immediate, "reason": data.reason,
    })
    return sub.model_dump(mode="json")


@router.post("/subscription/resume", tags=["Billing"], summary="Resume a canceled subscription")
async def resume_my_subscription(user: dict[str, Any] = Depends(_current_user)) -> dict[str, Any]:
    _require_user(user)
    sub = store.get_subscription_by_user(user["user_id"])
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription to resume")
    if sub.status not in (SubscriptionStatus.CANCELED, SubscriptionStatus.PAUSED) and not sub.cancel_at_period_end:
        raise HTTPException(status_code=400, detail="Subscription is not paused or pending cancellation")
    resume_subscription(sub.stripe_subscription_id or sub.id)
    sub.status = SubscriptionStatus.ACTIVE
    sub.cancel_at_period_end = False
    sub.canceled_at = None
    sub.updated_at = _utcnow()
    store.save_subscription(sub)
    events.emit("subscription.resumed", user["tenant_id"], {"user_id": user["user_id"]})
    return sub.model_dump(mode="json")


@router.post("/subscription/pause", tags=["Billing"], summary="Pause a subscription")
async def pause_my_subscription(
    data: PauseSubscriptionRequest = PauseSubscriptionRequest(),
    user: dict[str, Any] = Depends(_current_user),
) -> dict[str, Any]:
    _require_user(user)
    sub = store.get_subscription_by_user(user["user_id"])
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")
    resume_at = data.resume_at
    if not resume_at and data.duration_days:
        resume_at = _utcnow() + timedelta(days=data.duration_days)
    pause_subscription(sub.stripe_subscription_id or sub.id, resume_at=resume_at)
    sub.status = SubscriptionStatus.PAUSED
    sub.pause_start = _utcnow()
    sub.pause_end = resume_at
    sub.updated_at = _utcnow()
    store.save_subscription(sub)
    events.emit("subscription.paused", user["tenant_id"], {
        "user_id": user["user_id"], "resume_at": resume_at.isoformat() if resume_at else None,
    })
    return sub.model_dump(mode="json")




# ── Startup helper (called from main.py) ────────────────────────────────────


def seed_billing_on_startup() -> None:
    """Synchronous seed (for lazy / non-async paths). Bootstraps coupons and
    attempts a demo subscription seed (which may no-op if the DB isn't ready).
    """
    bootstrap_coupons()
    seed_demo_subscription()


async def seed_billing_on_startup_async() -> None:
    """Idempotent async startup: bootstrap coupons and seed the demo subscription."""
    bootstrap_coupons()
    try:
        await store.seed_demo_subscription_async()
    except Exception as exc:
        logger.warning("Async demo billing seed failed (non-fatal): %s", exc)
