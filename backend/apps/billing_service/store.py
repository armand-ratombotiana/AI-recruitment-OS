"""In-memory data store for the billing service.

The store has two scopes:

1. **Global scope** (legacy): `_subscription`, `_invoices`, `_payment_methods`
   These are the keys the original code used and what the existing test suite
   (`test_all_endpoints.py::TestBillingEndpoints`) still asserts on. They are
   left in place and exposed on the original endpoints to preserve backward
   compatibility.

2. **Per-user scope** (new): keyed by `user_id` (or `"anon"` for unauthenticated
   calls). All new endpoints (`/checkout`, `/trial`, `/admin/*`, etc.) operate
   on the per-user store. The demo user `demo@airos.io` is pre-seeded with a
   Pro subscription on first load.
"""
from __future__ import annotations

import hashlib
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from apps.billing_service.models import (
    Customer,
    Invoice,
    InvoiceLineItem,
    PaymentMethod,
    Subscription,
    SubscriptionStatus,
    UsageRecord,
    WebhookEvent,
    Coupon,
)
from apps.billing_service.plans import PLANS, get_plan, plan_price_cents


# ── Thread-safety ──────────────────────────────────────────────────────────────

_LOCK = threading.RLock()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


# ── Global (legacy) scope ──────────────────────────────────────────────────────

_subscription: dict[str, Any] = {
    "id": "sub_123",
    "plan": "enterprise",
    "plan_id": "enterprise",
    "status": "active",
    "monthly_price": 499,
    "seats": 50,
    "used_seats": 23,
    "billing_cycle": "monthly",
    "current_period_start": "2025-01-01",
    "current_period_end": "2025-02-01",
    "currency": "usd",
    "trial_ends_at": None,
    "cancel_at_period_end": False,
    "created_at": "2024-06-15T00:00:00Z",
}

_invoices: dict[str, dict[str, Any]] = {
    "inv_001": {
        "id": "inv_001",
        "amount": 499,
        "amount_cents": 49900,
        "status": "paid",
        "date": "2025-01-01",
        "created_at": "2025-01-01T00:00:00Z",
        "description": "Enterprise Plan - January 2025",
        "currency": "usd",
        "line_items": [
            {"description": "Enterprise Plan (50 seats)", "amount": 44900, "quantity": 1},
            {"description": "AI Token Overage (250K tokens)", "amount": 5000, "quantity": 1},
        ],
        "subtotal": 49900,
        "tax": 0,
        "total": 49900,
        "paid_at": "2025-01-01T00:05:00Z",
    },
    "inv_002": {
        "id": "inv_002",
        "amount": 499,
        "amount_cents": 49900,
        "status": "paid",
        "date": "2024-12-01",
        "created_at": "2024-12-01T00:00:00Z",
        "description": "Enterprise Plan - December 2024",
        "currency": "usd",
        "line_items": [
            {"description": "Enterprise Plan (50 seats)", "amount": 49900, "quantity": 1},
        ],
        "subtotal": 49900,
        "tax": 0,
        "total": 49900,
        "paid_at": "2024-12-01T00:05:00Z",
    },
    "inv_003": {
        "id": "inv_003",
        "amount": 499,
        "amount_cents": 49900,
        "status": "open",
        "date": "2025-02-01",
        "created_at": "2025-02-01T00:00:00Z",
        "description": "Enterprise Plan - February 2025",
        "currency": "usd",
        "line_items": [
            {"description": "Enterprise Plan (50 seats)", "amount": 49900, "quantity": 1},
        ],
        "subtotal": 49900,
        "tax": 0,
        "total": 49900,
    },
}

_payment_methods: dict[str, dict[str, Any]] = {
    "pm_1": {
        "id": "pm_1",
        "type": "card",
        "brand": "visa",
        "last_four": "4242",
        "exp_month": 12,
        "exp_year": 2026,
        "is_default": True,
        "created_at": "2024-06-15T00:00:00Z",
    },
}


def get_legacy_subscription() -> dict[str, Any]:
    return _subscription


def get_legacy_invoices() -> dict[str, dict[str, Any]]:
    return _invoices


def get_legacy_payment_methods() -> dict[str, dict[str, Any]]:
    return _payment_methods


# ── Per-user store (new) ──────────────────────────────────────────────────────

# Keyed by user_id (e.g. "demo@airos.io" or a UUID).
_users_customers: dict[str, str] = {}  # user_id -> customer_id
_customers: dict[str, Customer] = {}
_subscriptions: dict[str, Subscription] = {}  # by subscription id
_subscriptions_by_user: dict[str, str] = {}  # user_id -> subscription id (one active)
_payment_methods_by_user: dict[str, dict[str, PaymentMethod]] = {}  # user_id -> {pm_id: pm}
_invoices_by_user: dict[str, dict[str, Invoice]] = {}  # user_id -> {inv_id: invoice}
_usage_records: list[UsageRecord] = []  # global; filterable by user
_webhook_events: dict[str, WebhookEvent] = {}  # event_id -> event (idempotency)
_coupons: dict[str, Coupon] = {}  # code -> coupon
_refunds: list[dict[str, Any]] = []  # audit log
_credits: list[dict[str, Any]] = []  # audit log
_idempotency_keys: dict[str, str] = {}  # key -> resulting action id


def _new_customer_id() -> str:
    return f"cus_{uuid.uuid4().hex[:16]}"


def _new_subscription_id() -> str:
    return f"sub_{uuid.uuid4().hex[:16]}"


def _new_invoice_id() -> str:
    return f"inv_{uuid.uuid4().hex[:16]}"


def _new_payment_method_id() -> str:
    return f"pm_{uuid.uuid4().hex[:16]}"


def _new_event_id() -> str:
    return f"evt_{uuid.uuid4().hex[:16]}"


def get_or_create_customer(
    user_id: str,
    tenant_id: str,
    email: str,
    name: str = "",
) -> Customer:
    """Return the existing customer for a user or create one (idempotent)."""
    with _LOCK:
        existing_id = _users_customers.get(user_id)
        if existing_id and existing_id in _customers:
            c = _customers[existing_id]
            # Keep email/name in sync.
            if email and email != c.email:
                c.email = email
            if name and name != c.name:
                c.name = name
            return c
        cust = Customer(
            id=_new_customer_id(),
            user_id=user_id,
            tenant_id=tenant_id,
            email=email,
            name=name or email.split("@")[0],
            stripe_customer_id=f"cus_stripe_{hashlib.md5(user_id.encode()).hexdigest()[:12]}",
            created_at=_utcnow(),
        )
        _customers[cust.id] = cust
        _users_customers[user_id] = cust.id
        return cust


def get_customer_by_user(user_id: str) -> Customer | None:
    cid = _users_customers.get(user_id)
    return _customers.get(cid) if cid else None


def list_customers() -> list[Customer]:
    return list(_customers.values())


def update_customer(user_id: str, **fields: Any) -> Customer | None:
    cust = get_customer_by_user(user_id)
    if not cust:
        return None
    for k, v in fields.items():
        if v is not None and hasattr(cust, k):
            setattr(cust, k, v)
    return cust


def get_subscription_by_user(user_id: str) -> Subscription | None:
    sid = _subscriptions_by_user.get(user_id)
    return _subscriptions.get(sid) if sid else None


def get_subscription(subscription_id: str) -> Subscription | None:
    return _subscriptions.get(subscription_id)


def save_subscription(sub: Subscription) -> Subscription:
    with _LOCK:
        _subscriptions[sub.id] = sub
        _subscriptions_by_user[sub.user_id] = sub.id
    return sub


def remove_subscription(sub: Subscription) -> None:
    with _LOCK:
        _subscriptions.pop(sub.id, None)
        if _subscriptions_by_user.get(sub.user_id) == sub.id:
            _subscriptions_by_user.pop(sub.user_id, None)


def list_all_subscriptions() -> list[Subscription]:
    return list(_subscriptions.values())


# ── Payment methods ───────────────────────────────────────────────────────────


def list_payment_methods(user_id: str) -> list[PaymentMethod]:
    return list(_payment_methods_by_user.get(user_id, {}).values())


def add_payment_method(user_id: str, pm: PaymentMethod) -> PaymentMethod:
    with _LOCK:
        bucket = _payment_methods_by_user.setdefault(user_id, {})
        if pm.is_default:
            for other in bucket.values():
                if other.is_default:
                    other.is_default = False
        bucket[pm.id] = pm
    return pm


def get_payment_method(user_id: str, pm_id: str) -> PaymentMethod | None:
    return _payment_methods_by_user.get(user_id, {}).get(pm_id)


def remove_payment_method(user_id: str, pm_id: str) -> bool:
    bucket = _payment_methods_by_user.get(user_id, {})
    if pm_id in bucket:
        was_default = bucket[pm_id].is_default
        del bucket[pm_id]
        if was_default and bucket:
            # Transfer default flag to the most recently added one
            newest = max(bucket.values(), key=lambda p: p.created_at)
            newest.is_default = True
        return True
    return False


def set_default_payment_method(user_id: str, pm_id: str) -> bool:
    bucket = _payment_methods_by_user.get(user_id, {})
    if pm_id not in bucket:
        return False
    for p in bucket.values():
        p.is_default = (p.id == pm_id)
    return True


# ── Invoices ──────────────────────────────────────────────────────────────────


def list_invoices(user_id: str, status: str | None = None) -> list[Invoice]:
    items = list(_invoices_by_user.get(user_id, {}).values())
    if status:
        items = [i for i in items if i.status == status]
    return sorted(items, key=lambda i: i.created_at, reverse=True)


def get_invoice(user_id: str, invoice_id: str) -> Invoice | None:
    return _invoices_by_user.get(user_id, {}).get(invoice_id)


def get_invoice_any(invoice_id: str) -> Invoice | None:
    for bucket in _invoices_by_user.values():
        if invoice_id in bucket:
            return bucket[invoice_id]
    return None


def get_invoice_by_stripe_id(stripe_invoice_id: str) -> Invoice | None:
    """Find any invoice by its Stripe invoice id (e.g. 'in_xxx')."""
    for bucket in _invoices_by_user.values():
        for inv in bucket.values():
            if inv.stripe_invoice_id == stripe_invoice_id:
                return inv
    return None


def save_invoice(inv: Invoice) -> Invoice:
    with _LOCK:
        bucket = _invoices_by_user.setdefault(inv.user_id, {})
        bucket[inv.id] = inv
    return inv


# ── Usage records ─────────────────────────────────────────────────────────────


def record_usage(rec: UsageRecord) -> UsageRecord:
    _usage_records.append(rec)
    return rec


def list_usage(user_id: str, period: str | None = None) -> list[UsageRecord]:
    items = [r for r in _usage_records if r.user_id == user_id]
    if period:
        items = [r for r in items if r.period == period]
    return items


# ── Webhook idempotency ────────────────────────────────────────────────────────


def record_webhook_event(event: WebhookEvent) -> WebhookEvent:
    with _LOCK:
        _webhook_events[event.id] = event
    return event


def get_webhook_event(event_id: str) -> WebhookEvent | None:
    return _webhook_events.get(event_id)


# ── Coupons ───────────────────────────────────────────────────────────────────


def register_coupon(coupon: Coupon) -> Coupon:
    _coupons[coupon.code.upper()] = coupon
    return coupon


def get_coupon(code: str) -> Coupon | None:
    return _coupons.get(code.upper())


def list_coupons() -> list[Coupon]:
    return list(_coupons.values())


# ── Refunds & credits ─────────────────────────────────────────────────────────


def record_refund(record: dict[str, Any]) -> None:
    _refunds.append(record)


def list_refunds() -> list[dict[str, Any]]:
    return list(_refunds)


def record_credit(record: dict[str, Any]) -> None:
    _credits.append(record)


def list_credits() -> list[dict[str, Any]]:
    return list(_credits)


# ── Idempotency keys ──────────────────────────────────────────────────────────


def remember_idempotency(key: str, action_id: str) -> str | None:
    """Store a key→action_id mapping. Returns the existing action_id if duplicate."""
    with _LOCK:
        if key in _idempotency_keys:
            return _idempotency_keys[key]
        _idempotency_keys[key] = action_id
        return None


# ── Reset (testing) ──────────────────────────────────────────────────────────


def reset_user_store() -> None:
    """Wipe per-user data — used by tests."""
    with _LOCK:
        _users_customers.clear()
        _customers.clear()
        _subscriptions.clear()
        _subscriptions_by_user.clear()
        _payment_methods_by_user.clear()
        _invoices_by_user.clear()
        _usage_records.clear()
        _webhook_events.clear()
        _idempotency_keys.clear()
        _refunds.clear()
        _credits.clear()


def all_webhook_events() -> list[WebhookEvent]:
    return list(_webhook_events.values())


# ── Demo seed ─────────────────────────────────────────────────────────────────


async def seed_demo_subscription_async() -> Subscription | None:
    """Pre-load the demo user with a Pro monthly subscription, default PM, and
    one paid invoice. Idempotent.

    Resolves the demo user from the database so the subscription is keyed by the
    actual user UUID (which is what the JWT will contain after login).
    Returns the subscription, or None if the demo user cannot be resolved.
    """
    import logging
    logger = logging.getLogger("billing.store")

    demo_email = "demo@airos.io"
    demo_user_id: str | None = None
    try:
        from sqlalchemy import select as sa_select
        from shared.core.models.identity import User
        from shared.core.database import async_session_factory
        async with async_session_factory() as session:
            result = await session.execute(
                sa_select(User.id).where(User.email == demo_email)
            )
            row = result.first()
            if row is not None:
                demo_user_id = row[0]
    except Exception as exc:
        logger.warning("Could not resolve demo user for billing seed: %s", exc)
        return None

    if demo_user_id is None:
        logger.info("Demo user not found; skipping billing seed.")
        return None

    cust = get_or_create_customer(
        user_id=demo_user_id,
        tenant_id="default",
        email=demo_email,
        name="Demo User",
    )

    # Default payment method
    bucket = _payment_methods_by_user.setdefault(demo_user_id, {})
    if "pm_demo_default" not in bucket:
        bucket["pm_demo_default"] = PaymentMethod(
            id="pm_demo_default",
            user_id=demo_user_id,
            customer_id=cust.id,
            type="card",
            brand="visa",
            last_four="4242",
            exp_month=12,
            exp_year=2028,
            is_default=True,
            stripe_payment_method_id="pm_stripe_demo_default",
            created_at=_utcnow(),
        )

    # Demo subscription (Pro monthly)
    if get_subscription_by_user(demo_user_id) is None:
        now = _utcnow()
        sub = Subscription(
            id="sub_demo_pro",
            user_id=demo_user_id,
            tenant_id="default",
            customer_id=cust.id,
            plan_id="pro",
            billing_cycle="monthly",
            seats=5,
            status=SubscriptionStatus.ACTIVE,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
            stripe_subscription_id="sub_stripe_demo_pro",
            created_at=now,
            updated_at=now,
        )
        save_subscription(sub)

        # Paid invoice for the current period
        from apps.billing_service.plans import plan_price_cents
        amount = plan_price_cents("pro", "monthly", 5)
        line = InvoiceLineItem(
            description="Pro Plan (5 seats, monthly)",
            quantity=1,
            unit_amount_cents=amount,
            amount_cents=amount,
        )
        inv = Invoice(
            id="inv_demo_001",
            user_id=demo_user_id,
            customer_id=cust.id,
            subscription_id=sub.id,
            number="AIROS-2025-0001",
            status="paid",
            currency="usd",
            subtotal_cents=amount,
            tax_cents=0,
            total_cents=amount,
            amount_due_cents=0,
            amount_paid_cents=amount,
            line_items=[line],
            period_start=now,
            period_end=now + timedelta(days=30),
            pdf_url=f"http://localhost:8000/api/v1/billing/invoices/inv_demo_001/pdf",
            hosted_url=f"http://localhost:8000/api/v1/billing/invoices/inv_demo_001",
            stripe_invoice_id="in_stripe_demo_001",
            created_at=now,
            paid_at=now,
        )
        save_invoice(inv)

    # Seed a few usage records so /usage is not all zeros
    period = _utcnow().strftime("%Y-%m")
    existing = [r for r in _usage_records if r.user_id == demo_user_id and r.period == period]
    if not existing:
        now = _utcnow()
        for metric, qty in [
            ("ai_calls", 1240.0),
            ("active_candidates", 17.0),
            ("active_jobs", 4.0),
            ("storage_gb", 3.2),
        ]:
            record_usage(UsageRecord(
                id=_new_id("u"),
                user_id=demo_user_id,
                metric=metric,
                quantity=qty,
                period=period,
                timestamp=now,
            ))

    return get_subscription_by_user(demo_user_id)  # type: ignore[return-value]


def seed_demo_subscription() -> Subscription | None:
    """Synchronous shim — resolves the demo user by *email* only when the DB
    is already populated with that user, otherwise no-op. For the canonical
    path use `seed_demo_subscription_async` (called from the FastAPI lifespan).
    """
    # If a subscription already exists for *any* demo-style user, do nothing.
    for uid, sub in _subscriptions_by_user.items():
        if sub is not None:
            return sub
    return None
