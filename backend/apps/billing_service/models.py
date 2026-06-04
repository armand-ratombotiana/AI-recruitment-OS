"""Pydantic schemas for the AI-ROS billing service.

These models are used for both request validation and response shaping.
The data store is in-memory dicts (see `store.py`).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field


# ── Plans ──────────────────────────────────────────────────────────────────────


class PlanLimits(BaseModel):
    candidates: int = Field(default=-1, description="-1 means unlimited")
    jobs: int = Field(default=-1, description="-1 means unlimited")
    users: int = Field(default=3)
    ai_calls_per_month: int = Field(default=0)
    storage_gb: int = Field(default=1)


class Plan(BaseModel):
    id: str
    name: str
    tier: int
    monthly_price_cents: int
    annual_price_cents: int
    per_seat_price_cents: int
    currency: str = "usd"
    max_seats: int
    limits: PlanLimits
    features: list[str]
    is_popular: bool = False
    is_custom_pricing: bool = False


# ── Customer ───────────────────────────────────────────────────────────────────


class Customer(BaseModel):
    id: str
    user_id: str
    tenant_id: str
    email: EmailStr
    name: str
    stripe_customer_id: str
    address: dict[str, Any] | None = None
    tax_id: str | None = None
    metadata: dict[str, Any] = {}
    created_at: datetime


# ── Subscription ───────────────────────────────────────────────────────────────


class SubscriptionStatus:
    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    UNPAID = "unpaid"
    PAUSED = "paused"
    INCOMPLETE = "incomplete"
    EXPIRED = "expired"


SUBSCRIPTION_STATUSES = (
    SubscriptionStatus.TRIALING,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.CANCELED,
    SubscriptionStatus.UNPAID,
    SubscriptionStatus.PAUSED,
    SubscriptionStatus.INCOMPLETE,
    SubscriptionStatus.EXPIRED,
)


class Subscription(BaseModel):
    id: str
    user_id: str
    tenant_id: str
    customer_id: str
    plan_id: str
    billing_cycle: Literal["monthly", "annual"] = "monthly"
    seats: int = 1
    status: str = SubscriptionStatus.ACTIVE
    current_period_start: datetime
    current_period_end: datetime
    trial_start: datetime | None = None
    trial_end: datetime | None = None
    cancel_at_period_end: bool = False
    canceled_at: datetime | None = None
    pause_start: datetime | None = None
    pause_end: datetime | None = None
    stripe_subscription_id: str | None = None
    coupon_code: str | None = None
    credit_cents: int = 0
    scheduled_plan_id: str | None = None  # for downgrades at period end
    scheduled_change_at: datetime | None = None
    metadata: dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime


# ── Payment Method ─────────────────────────────────────────────────────────────


class PaymentMethod(BaseModel):
    id: str
    user_id: str
    customer_id: str
    type: Literal["card", "bank_transfer", "invoice"] = "card"
    brand: str | None = None
    last_four: str | None = None
    exp_month: int | None = None
    exp_year: int | None = None
    bank_name: str | None = None
    is_default: bool = False
    stripe_payment_method_id: str | None = None
    created_at: datetime


# ── Invoice ────────────────────────────────────────────────────────────────────


class InvoiceLineItem(BaseModel):
    description: str
    quantity: int = 1
    unit_amount_cents: int
    amount_cents: int
    metadata: dict[str, Any] = {}


class Invoice(BaseModel):
    id: str
    user_id: str
    customer_id: str
    subscription_id: str | None = None
    tenant_id: str | None = None
    number: str
    status: Literal["draft", "open", "paid", "uncollectible", "void"] = "open"
    currency: str = "usd"
    subtotal_cents: int
    tax_cents: int = 0
    total_cents: int
    amount_due_cents: int
    amount_paid_cents: int = 0
    line_items: list[InvoiceLineItem] = []
    period_start: datetime | None = None
    period_end: datetime | None = None
    pdf_url: str | None = None
    hosted_url: str | None = None
    refunded_cents: int = 0
    stripe_invoice_id: str | None = None
    created_at: datetime
    paid_at: datetime | None = None


# ── Usage ──────────────────────────────────────────────────────────────────────


class UsageRecord(BaseModel):
    id: str
    user_id: str
    metric: str  # "ai_calls", "active_candidates", "active_jobs", "storage_gb"
    quantity: float
    period: str  # "YYYY-MM"
    metadata: dict[str, Any] = {}
    timestamp: datetime


class UsageSummary(BaseModel):
    period: str
    plan_id: str
    plan_name: str
    limits: PlanLimits
    usage: dict[str, dict[str, Any]]  # metric -> {used, limit, pct, overage}
    overage_cents: int = 0


# ── Coupon ─────────────────────────────────────────────────────────────────────


class Coupon(BaseModel):
    id: str
    code: str
    percent_off: int | None = None
    amount_off_cents: int | None = None
    currency: str | None = None
    duration: Literal["once", "forever", "repeating"] = "once"
    duration_months: int | None = None
    max_redemptions: int | None = None
    times_redeemed: int = 0
    valid: bool = True
    expires_at: datetime | None = None
    metadata: dict[str, Any] = {}


# ── Webhook ────────────────────────────────────────────────────────────────────


class WebhookEvent(BaseModel):
    id: str
    type: str
    api_version: str | None = None
    created: datetime
    data: dict[str, Any] = {}
    processed: bool = False
    processed_at: datetime | None = None
    error: str | None = None


# ── Request/Response DTOs ──────────────────────────────────────────────────────


class CheckoutRequest(BaseModel):
    plan_id: str = Field(..., description="free | starter | pro | enterprise")
    billing_cycle: Literal["monthly", "annual"] = "monthly"
    seats: int = Field(default=1, ge=1, le=9999)
    coupon_code: str | None = None
    success_url: str = Field(default="http://localhost:3000/billing/success")
    cancel_url: str = Field(default="http://localhost:3000/billing/cancel")


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str
    customer_id: str
    mode: str  # "mock" or "live"
    expires_at: datetime | None = None


class UpdateSubscriptionRequest(BaseModel):
    plan_id: str | None = None
    seats: int | None = Field(default=None, ge=1, le=9999)
    billing_cycle: Literal["monthly", "annual"] | None = None
    coupon_code: str | None = None
    prorate: bool = True


class CancelSubscriptionRequest(BaseModel):
    immediate: bool = Field(default=False, description="Cancel immediately vs at period end")
    reason: str | None = None


class PauseSubscriptionRequest(BaseModel):
    resume_at: datetime | None = None
    duration_days: int | None = Field(default=None, ge=1, le=365)


class RefundRequest(BaseModel):
    invoice_id: str
    amount_cents: int | None = None  # partial refund when set
    reason: str | None = None


class CreditRequest(BaseModel):
    user_id: str
    amount_cents: int = Field(..., ge=1)
    currency: str = "usd"
    description: str | None = None
    expires_at: datetime | None = None


class CouponRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)


class TrialRequest(BaseModel):
    plan_id: str = Field(default="pro", description="Plan to start trial on")
    days: int | None = Field(default=None, ge=1, le=90)


class WebhookResponse(BaseModel):
    received: bool = True
    event_id: str
    type: str
    processed: bool
    duplicate: bool = False
    error: str | None = None


class CustomerUpdateRequest(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    address: dict[str, Any] | None = None
    tax_id: str | None = None


class SetupIntentResponse(BaseModel):
    id: str
    client_secret: str
    customer_id: str
    mode: str


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "billing"
    mode: str  # "mock" or "live"
    currency: str
    trial_days: int


# ── Internal Events ────────────────────────────────────────────────────────────


BILLING_EVENT_TYPES = (
    "subscription.created",
    "subscription.updated",
    "subscription.canceled",
    "subscription.paused",
    "subscription.resumed",
    "subscription.expired",
    "subscription.downgraded",
    "payment.succeeded",
    "payment.failed",
    "invoice.created",
    "invoice.paid",
    "invoice.payment_failed",
    "trial.started",
    "trial.expiring",
    "trial.expired",
    "refund.issued",
    "credit.applied",
    "customer.created",
    "customer.updated",
)
