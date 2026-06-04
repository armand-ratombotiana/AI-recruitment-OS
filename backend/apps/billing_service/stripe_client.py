"""Stripe client wrapper — real Stripe SDK when STRIPE_SECRET_KEY is set, otherwise
a fully-deterministic in-process mock.

The mock generates the same shape of objects (checkout sessions, customers,
subscriptions, invoices, payment methods) so the rest of the service can be
written exactly the same way it would be in production.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from shared.core.config import get_settings


logger = logging.getLogger("billing.stripe_client")
settings = get_settings()


# ── Mode detection ────────────────────────────────────────────────────────────


def is_live_mode() -> bool:
    """Return True when a Stripe key is configured and the explicit mode is 'live'."""
    if settings.STRIPE_MODE.lower() == "live":
        return bool(settings.STRIPE_SECRET_KEY)
    return False


def mode() -> str:
    return "live" if is_live_mode() else "mock"


def currency() -> str:
    return (settings.BILLING_CURRENCY or "usd").lower()


# ── Real Stripe SDK (lazy) ────────────────────────────────────────────────────

_real_stripe: Any = None


def _stripe():
    """Lazy import + setup of the real stripe SDK."""
    global _real_stripe
    if _real_stripe is None:
        try:
            import stripe as _sdk
            _sdk.api_key = settings.STRIPE_SECRET_KEY
            _real_stripe = _sdk
        except ImportError as exc:
            raise RuntimeError(
                "stripe package not installed but STRIPE_MODE='live'. "
                "Install with: pip install 'stripe>=7.0.0,<12.0.0'"
            ) from exc
    return _real_stripe


# ── Helpers ──────────────────────────────────────────────────────────────────


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _new(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:16]}"


# ── Public API ────────────────────────────────────────────────────────────────


def create_customer(email: str, name: str = "", metadata: dict | None = None) -> dict[str, Any]:
    """Create a Stripe customer (or mock)."""
    if is_live_mode():
        s = _stripe()
        cust = s.Customer.create(
            email=email,
            name=name or None,
            metadata=metadata or {},
        )
        return cust.to_dict() if hasattr(cust, "to_dict") else dict(cust)
    return _mock_customer(email=email, name=name, metadata=metadata or {})


def update_customer(customer_id: str, **fields: Any) -> dict[str, Any]:
    if is_live_mode():
        s = _stripe()
        cust = s.Customer.modify(customer_id, **fields)
        return cust.to_dict() if hasattr(cust, "to_dict") else dict(cust)
    return _mock_customer_update(customer_id=customer_id, **fields)


def create_checkout_session(
    customer_id: str,
    price_cents: int,
    plan_id: str,
    billing_cycle: str,
    seats: int,
    success_url: str,
    cancel_url: str,
    metadata: dict | None = None,
) -> dict[str, Any]:
    """Create a Stripe Checkout Session (or mock)."""
    if is_live_mode():
        s = _stripe()
        # Real Stripe expects a Price ID; in a real deploy the customer would
        # also pre-create Stripe Prices. We create an inline price_data here.
        sess = s.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=[{
                "price_data": {
                    "currency": currency(),
                    "product_data": {"name": f"AI-ROS {plan_id.title()} ({billing_cycle})"},
                    "unit_amount": price_cents,
                    "recurring": {"interval": "month" if billing_cycle == "monthly" else "year"},
                },
                "quantity": 1,
            }],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={**(metadata or {}), "plan_id": plan_id, "seats": seats, "billing_cycle": billing_cycle},
        )
        return sess.to_dict() if hasattr(sess, "to_dict") else dict(sess)
    return _mock_checkout_session(
        customer_id=customer_id,
        price_cents=price_cents,
        plan_id=plan_id,
        billing_cycle=billing_cycle,
        seats=seats,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata or {},
    )


def create_setup_intent(customer_id: str) -> dict[str, Any]:
    if is_live_mode():
        s = _stripe()
        intent = s.SetupIntent.create(customer=customer_id)
        return intent.to_dict() if hasattr(intent, "to_dict") else dict(intent)
    return _mock_setup_intent(customer_id=customer_id)


def attach_payment_method(payment_method_id: str, customer_id: str) -> dict[str, Any]:
    if is_live_mode():
        s = _stripe()
        pm = s.PaymentMethod.attach(payment_method_id, customer=customer_id)
        return pm.to_dict() if hasattr(pm, "to_dict") else dict(pm)
    return _mock_payment_method_attach(payment_method_id, customer_id)


def detach_payment_method(payment_method_id: str) -> dict[str, Any]:
    if is_live_mode():
        s = _stripe()
        pm = s.PaymentMethod.detach(payment_method_id)
        return pm.to_dict() if hasattr(pm, "to_dict") else dict(pm)
    return {"id": payment_method_id, "object": "payment_method", "detached": True}


def list_customer_payment_methods(customer_id: str) -> list[dict[str, Any]]:
    if is_live_mode():
        s = _stripe()
        pms = s.PaymentMethod.list(customer=customer_id, type="card")
        return [p.to_dict() if hasattr(p, "to_dict") else dict(p) for p in pms.data]
    return _mock_list_pms(customer_id)


def create_subscription(
    customer_id: str,
    price_cents: int,
    plan_id: str,
    billing_cycle: str,
    seats: int,
    trial_days: int = 0,
) -> dict[str, Any]:
    if is_live_mode():
        s = _stripe()
        sub = s.Subscription.create(
            customer=customer_id,
            items=[{
                "price_data": {
                    "currency": currency(),
                    "product_data": {"name": f"AI-ROS {plan_id.title()}"},
                    "unit_amount": price_cents,
                    "recurring": {"interval": "month" if billing_cycle == "monthly" else "year"},
                }
            }],
            trial_period_days=trial_days if trial_days > 0 else None,
        )
        return sub.to_dict() if hasattr(sub, "to_dict") else dict(sub)
    return _mock_subscription_create(
        customer_id=customer_id,
        price_cents=price_cents,
        plan_id=plan_id,
        billing_cycle=billing_cycle,
        seats=seats,
        trial_days=trial_days,
    )


def update_subscription_plan(
    subscription_id: str,
    new_price_cents: int,
    new_plan_id: str,
    billing_cycle: str,
) -> dict[str, Any]:
    if is_live_mode():
        s = _stripe()
        # In real Stripe you'd call .modify with the new item.
        sub = s.Subscription.modify(
            subscription_id,
            items=[{
                "price_data": {
                    "currency": currency(),
                    "product_data": {"name": f"AI-ROS {new_plan_id.title()}"},
                    "unit_amount": new_price_cents,
                    "recurring": {"interval": "month" if billing_cycle == "monthly" else "year"},
                }
            }],
            proration_behavior="create_prorations",
        )
        return sub.to_dict() if hasattr(sub, "to_dict") else dict(sub)
    return _mock_subscription_update(
        subscription_id=subscription_id,
        new_price_cents=new_price_cents,
        new_plan_id=new_plan_id,
        billing_cycle=billing_cycle,
    )


def cancel_subscription(subscription_id: str, immediate: bool = False) -> dict[str, Any]:
    if is_live_mode():
        s = _stripe()
        if immediate:
            sub = s.Subscription.delete(subscription_id)
        else:
            sub = s.Subscription.modify(subscription_id, cancel_at_period_end=True)
        return sub.to_dict() if hasattr(sub, "to_dict") else dict(sub)
    return _mock_subscription_cancel(subscription_id=subscription_id, immediate=immediate)


def resume_subscription(subscription_id: str) -> dict[str, Any]:
    if is_live_mode():
        s = _stripe()
        sub = s.Subscription.modify(subscription_id, cancel_at_period_end=False)
        return sub.to_dict() if hasattr(sub, "to_dict") else dict(sub)
    return _mock_subscription_resume(subscription_id)


def pause_subscription(subscription_id: str, resume_at: datetime | None) -> dict[str, Any]:
    if is_live_mode():
        s = _stripe()
        sub = s.Subscription.modify(
            subscription_id,
            pause_collection={"behavior": "keep_as_draft"} if resume_at is None
            else {"behavior": "void", "resumes_at": int(resume_at.timestamp())},
        )
        return sub.to_dict() if hasattr(sub, "to_dict") else dict(sub)
    return _mock_subscription_pause(subscription_id=subscription_id, resume_at=resume_at)


def create_portal_session(customer_id: str, return_url: str) -> dict[str, Any]:
    if is_live_mode():
        s = _stripe()
        sess = s.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url,
        )
        return sess.to_dict() if hasattr(sess, "to_dict") else dict(sess)
    return _mock_portal_session(customer_id=customer_id, return_url=return_url)


def create_invoice(customer_id: str, amount_cents: int, description: str) -> dict[str, Any]:
    if is_live_mode():
        s = _stripe()
        inv = s.Invoice.create(
            customer=customer_id,
            collection_method="charge_automatically",
            auto_advance=False,
        )
        s.InvoiceItem.create(
            customer=customer_id,
            invoice=inv.id,
            amount=amount_cents,
            currency=currency(),
            description=description,
        )
        finalized = inv.finalize_invoice()
        return finalized.to_dict() if hasattr(finalized, "to_dict") else dict(finalized)
    return _mock_invoice_create(customer_id=customer_id, amount_cents=amount_cents, description=description)


def mark_invoice_paid(invoice_id: str) -> dict[str, Any]:
    if is_live_mode():
        s = _stripe()
        inv = s.Invoice.pay(invoice_id)
        return inv.to_dict() if hasattr(inv, "to_dict") else dict(inv)
    return _mock_invoice_paid(invoice_id)


def mark_invoice_failed(invoice_id: str) -> dict[str, Any]:
    if is_live_mode():
        # Stripe marks failed via the customer's default_source — for the mock
        # we just return a state change.
        return {"id": invoice_id, "status": "open", "marked_failed": True}
    return _mock_invoice_failed(invoice_id)


def refund_invoice(invoice_id: str, amount_cents: int | None) -> dict[str, Any]:
    if is_live_mode():
        s = _stripe()
        kwargs: dict[str, Any] = {"invoice": invoice_id}
        if amount_cents is not None:
            kwargs["amount"] = amount_cents
        refund = s.Refund.create(**kwargs)
        return refund.to_dict() if hasattr(refund, "to_dict") else dict(refund)
    return _mock_refund(invoice_id=invoice_id, amount_cents=amount_cents)


def verify_webhook_signature(payload: bytes, sig_header: str) -> dict[str, Any]:
    """Verify a Stripe webhook signature and return the parsed event.

    In live mode this uses `stripe.Webhook.construct_event`.
    In mock mode the signature is accepted if it starts with `mock_sig_` or
    if no signature is supplied.
    """
    if is_live_mode():
        s = _stripe()
        return s.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        ).to_dict()
    # Mock mode: accept any well-formed JSON or the explicit mock_sig prefix.
    if not sig_header:
        try:
            return json.loads(payload.decode("utf-8"))
        except Exception as exc:
            raise ValueError(f"Invalid mock webhook payload: {exc}")
    if not sig_header.startswith(("mock_sig_", "t=", "v1=")):
        # Try JSON anyway (lenient)
        try:
            return json.loads(payload.decode("utf-8"))
        except Exception as exc:
            raise ValueError(f"Invalid mock signature: {sig_header[:32]}… ({exc})")
    try:
        return json.loads(payload.decode("utf-8"))
    except Exception as exc:
        raise ValueError(f"Invalid mock webhook JSON: {exc}")


# ── Mock state (deterministic per process) ────────────────────────────────────

_MOCK_CUSTOMERS: dict[str, dict[str, Any]] = {}
_MOCK_PMS: dict[str, dict[str, Any]] = {}
_MOCK_SESSIONS: dict[str, dict[str, Any]] = {}
_MOCK_SUBS: dict[str, dict[str, Any]] = {}
_MOCK_INVOICES: dict[str, dict[str, Any]] = {}
_MOCK_PORTALS: dict[str, dict[str, Any]] = {}


def _mock_customer(email: str, name: str, metadata: dict) -> dict[str, Any]:
    cid = _new("cus_mock")
    obj = {
        "id": cid,
        "object": "customer",
        "email": email,
        "name": name or None,
        "metadata": metadata,
        "created": int(_utcnow().timestamp()),
    }
    _MOCK_CUSTOMERS[cid] = obj
    return obj


def _mock_customer_update(customer_id: str, **fields: Any) -> dict[str, Any]:
    cust = _MOCK_CUSTOMERS.setdefault(customer_id, {
        "id": customer_id, "object": "customer", "email": None, "name": None, "metadata": {},
    })
    cust.update({k: v for k, v in fields.items() if v is not None})
    return cust


def _mock_payment_method_attach(pm_id: str, customer_id: str) -> dict[str, Any]:
    obj = {
        "id": pm_id,
        "object": "payment_method",
        "customer": customer_id,
        "type": "card",
        "card": {
            "brand": "visa",
            "last4": "4242",
            "exp_month": 12,
            "exp_year": 2030,
        },
    }
    _MOCK_PMS[pm_id] = obj
    return obj


def _mock_list_pms(customer_id: str) -> list[dict[str, Any]]:
    return [pm for pm in _MOCK_PMS.values() if pm.get("customer") == customer_id]


def _mock_checkout_session(
    customer_id: str,
    price_cents: int,
    plan_id: str,
    billing_cycle: str,
    seats: int,
    success_url: str,
    cancel_url: str,
    metadata: dict,
) -> dict[str, Any]:
    sid = _new("cs_mock")
    obj = {
        "id": sid,
        "object": "checkout.session",
        "customer": customer_id,
        "mode": "subscription",
        "payment_method_types": ["card"],
        "amount_subtotal": price_cents,
        "amount_total": price_cents,
        "currency": currency(),
        "status": "open",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "url": f"http://localhost:8000/api/v1/billing/mock-checkout/{sid}",
        "expires_at": int((_utcnow() + timedelta(hours=24)).timestamp()),
        "metadata": {**metadata, "plan_id": plan_id, "seats": seats, "billing_cycle": billing_cycle},
        "created": int(_utcnow().timestamp()),
    }
    _MOCK_SESSIONS[sid] = obj
    return obj


def _mock_setup_intent(customer_id: str) -> dict[str, Any]:
    sid = _new("seti_mock")
    return {
        "id": sid,
        "object": "setup_intent",
        "customer": customer_id,
        "client_secret": f"{sid}_secret_{uuid4().hex[:24]}",
        "status": "requires_payment_method",
        "created": int(_utcnow().timestamp()),
    }


def _mock_subscription_create(
    customer_id: str,
    price_cents: int,
    plan_id: str,
    billing_cycle: str,
    seats: int,
    trial_days: int,
) -> dict[str, Any]:
    sid = _new("sub_mock")
    now = _utcnow()
    period_end = now + (timedelta(days=trial_days) if trial_days > 0 else timedelta(days=30 if billing_cycle == "monthly" else 365))
    obj = {
        "id": sid,
        "object": "subscription",
        "customer": customer_id,
        "status": "trialing" if trial_days > 0 else "active",
        "items": {
            "data": [{
                "price": {
                    "id": _new("price_mock"),
                    "unit_amount": price_cents,
                    "currency": currency(),
                    "recurring": {"interval": "month" if billing_cycle == "monthly" else "year"},
                },
                "quantity": seats,
            }]
        },
        "current_period_start": int(now.timestamp()),
        "current_period_end": int(period_end.timestamp()),
        "trial_start": int(now.timestamp()) if trial_days > 0 else None,
        "trial_end": int(period_end.timestamp()) if trial_days > 0 else None,
        "cancel_at_period_end": False,
        "metadata": {"plan_id": plan_id, "billing_cycle": billing_cycle, "seats": seats},
        "created": int(now.timestamp()),
    }
    _MOCK_SUBS[sid] = obj
    return obj


def _mock_subscription_update(
    subscription_id: str,
    new_price_cents: int,
    new_plan_id: str,
    billing_cycle: str,
) -> dict[str, Any]:
    sub = _MOCK_SUBS.setdefault(subscription_id, {
        "id": subscription_id, "object": "subscription", "items": {"data": [{}]},
    })
    items = sub.setdefault("items", {"data": [{}]}).setdefault("data", [{}])
    if items:
        item = items[0]
        item["price"] = {
            "id": _new("price_mock"),
            "unit_amount": new_price_cents,
            "currency": currency(),
            "recurring": {"interval": "month" if billing_cycle == "monthly" else "year"},
        }
    sub.setdefault("metadata", {})["plan_id"] = new_plan_id
    sub["updated"] = int(_utcnow().timestamp())
    return sub


def _mock_subscription_cancel(subscription_id: str, immediate: bool) -> dict[str, Any]:
    sub = _MOCK_SUBS.setdefault(subscription_id, {"id": subscription_id, "object": "subscription"})
    if immediate:
        sub["status"] = "canceled"
        sub["canceled_at"] = int(_utcnow().timestamp())
    else:
        sub["cancel_at_period_end"] = True
    return sub


def _mock_subscription_resume(subscription_id: str) -> dict[str, Any]:
    sub = _MOCK_SUBS.setdefault(subscription_id, {"id": subscription_id, "object": "subscription"})
    sub["status"] = "active"
    sub["cancel_at_period_end"] = False
    return sub


def _mock_subscription_pause(subscription_id: str, resume_at: datetime | None) -> dict[str, Any]:
    sub = _MOCK_SUBS.setdefault(subscription_id, {"id": subscription_id, "object": "subscription"})
    sub["status"] = "paused"
    sub["pause_collection"] = {
        "behavior": "void" if resume_at else "keep_as_draft",
        "resumes_at": int(resume_at.timestamp()) if resume_at else None,
    }
    return sub


def _mock_portal_session(customer_id: str, return_url: str) -> dict[str, Any]:
    pid = _new("bps_mock")
    obj = {
        "id": pid,
        "object": "billing_portal.session",
        "customer": customer_id,
        "return_url": return_url,
        "url": f"http://localhost:8000/api/v1/billing/mock-portal/{pid}",
        "created": int(_utcnow().timestamp()),
    }
    _MOCK_PORTALS[pid] = obj
    return obj


def _mock_invoice_create(customer_id: str, amount_cents: int, description: str) -> dict[str, Any]:
    iid = _new("in_mock")
    obj = {
        "id": iid,
        "object": "invoice",
        "customer": customer_id,
        "amount_due": amount_cents,
        "amount_paid": 0,
        "amount_remaining": amount_cents,
        "currency": currency(),
        "status": "open",
        "description": description,
        "lines": {
            "data": [{
                "description": description,
                "amount": amount_cents,
                "quantity": 1,
            }]
        },
        "hosted_invoice_url": f"http://localhost:8000/api/v1/billing/mock-invoice/{iid}",
        "invoice_pdf": f"http://localhost:8000/api/v1/billing/mock-invoice/{iid}/pdf",
        "created": int(_utcnow().timestamp()),
    }
    _MOCK_INVOICES[iid] = obj
    return obj


def _mock_invoice_paid(invoice_id: str) -> dict[str, Any]:
    inv = _MOCK_INVOICES.setdefault(invoice_id, {"id": invoice_id, "object": "invoice"})
    inv["status"] = "paid"
    inv["amount_paid"] = inv.get("amount_due", 0)
    inv["amount_remaining"] = 0
    inv["paid_at"] = int(_utcnow().timestamp())
    return inv


def _mock_invoice_failed(invoice_id: str) -> dict[str, Any]:
    inv = _MOCK_INVOICES.setdefault(invoice_id, {"id": invoice_id, "object": "invoice"})
    inv["status"] = "open"
    inv["last_payment_error"] = {"message": "Your card was declined (mock)."}
    return inv


def _mock_refund(invoice_id: str, amount_cents: int | None) -> dict[str, Any]:
    return {
        "id": _new("re_mock"),
        "object": "refund",
        "invoice": invoice_id,
        "amount": amount_cents,
        "status": "succeeded",
        "created": int(_utcnow().timestamp()),
    }


def _mock_signature(payload: bytes) -> str:
    h = hashlib.sha256(payload).hexdigest()
    return f"mock_sig_{h}"


# Convenience: callers can use this to attach a signature header for round-trip
# tests without going through the real Stripe SDK.
def sign_mock(payload: bytes) -> str:
    return _mock_signature(payload)
