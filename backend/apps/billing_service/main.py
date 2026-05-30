"""Billing Service — Subscription plans, invoices, usage tracking, and payment processing."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field


# ── Request Models ──────────────────────────────────────────────────────────────

class SubscriptionCreateRequest(BaseModel):
    plan: str = Field(..., description="free | starter | pro | enterprise")
    seats: int = Field(default=1, ge=1, description="Number of user seats")
    billing_cycle: str = Field(default="monthly", description="monthly | annual")

    model_config = {"json_schema_extra": {"examples": [
        {"plan": "enterprise", "seats": 50, "billing_cycle": "annual"}
    ]}}


class SubscriptionUpdateRequest(BaseModel):
    plan: str | None = Field(None, description="Plan to change to")
    seats: int | None = Field(None, ge=1, description="Number of user seats")
    billing_cycle: str | None = Field(None, description="monthly | annual")


class PaymentMethodRequest(BaseModel):
    type: str = Field(default="card", description="card | bank_transfer | invoice")
    token: str | None = Field(None, description="Payment token from processor")
    last_four: str | None = Field(None, description="Last four digits")
    exp_month: int | None = Field(None, ge=1, le=12)
    exp_year: int | None = Field(None, ge=2024)


class InvoicePayRequest(BaseModel):
    invoice_id: str = Field(..., description="Invoice to pay")
    payment_method_id: str | None = Field(None, description="Payment method to use")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "billing"


class PlanInfo(BaseModel):
    id: str
    name: str
    monthly_price: int
    annual_price: int
    max_seats: int
    features: list[str]


class PlanListResponse(BaseModel):
    data: list[PlanInfo]
    total: int


class SubscriptionResponse(BaseModel):
    id: str
    plan: str
    status: str
    monthly_price: int
    seats: int
    used_seats: int
    billing_cycle: str
    current_period_start: str
    current_period_end: str
    cancel_at: str | None = None


class SubscriptionCreateResponse(BaseModel):
    id: str
    plan: str
    created: bool = True


class SubscriptionUpdateResponse(BaseModel):
    id: str
    plan: str
    updated: bool = True


class SubscriptionCancelResponse(BaseModel):
    id: str
    canceled: bool = True
    effective_date: str


class InvoiceSummary(BaseModel):
    id: str
    amount: int
    status: str
    date: str
    description: str


class InvoiceListResponse(BaseModel):
    data: list[InvoiceSummary]
    total: int


class InvoiceDetailResponse(BaseModel):
    id: str
    amount: int
    status: str
    date: str
    description: str
    line_items: list[dict]
    subtotal: int
    tax: int
    total: int
    payment_method: str | None = None


class InvoicePayResponse(BaseModel):
    invoice_id: str
    status: str = "processing"
    transaction_id: str | None = None


class UsageResponse(BaseModel):
    period: str
    ai_tokens: int
    candidates: int
    interviews: int
    storage_gb: float


class UsageBreakdownItem(BaseModel):
    category: str
    quantity: int
    unit_price: int
    total: int


class UsageBreakdownResponse(BaseModel):
    period: str
    items: list[UsageBreakdownItem]
    subtotal: int
    tax: int
    total: int


class PaymentMethodResponse(BaseModel):
    id: str
    type: str
    last_four: str
    exp_month: int
    exp_year: int
    is_default: bool


class PaymentMethodListResponse(BaseModel):
    data: list[PaymentMethodResponse]
    total: int


class PaymentMethodCreateResponse(BaseModel):
    id: str
    type: str
    created: bool = True


class PaymentMethodDeleteResponse(BaseModel):
    id: str
    deleted: bool = True


class PaymentProcessResponse(BaseModel):
    transaction_id: str
    status: str
    amount: int
    currency: str = "usd"


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Billing"], summary="Billing service health check")
async def health():
    return HealthResponse()


# ── Plans ──────────────────────────────────────────────────────────────────────

@router.get("/plans", response_model=PlanListResponse, tags=["Billing"], summary="List available plans",
            description="Retrieve all available subscription plans with pricing and features.")
async def list_plans():
    return PlanListResponse(data=[
        PlanInfo(id="free", name="Free", monthly_price=0, annual_price=0, max_seats=3,
                 features=["50 candidates", "10 jobs", "Basic AI"]),
        PlanInfo(id="starter", name="Starter", monthly_price=99, annual_price=990, max_seats=10,
                 features=["500 candidates", "50 jobs", "AI enrichment", "Email support"]),
        PlanInfo(id="pro", name="Pro", monthly_price=299, annual_price=2990, max_seats=50,
                 features=["Unlimited candidates", "Unlimited jobs", "Advanced AI", "Priority support"]),
        PlanInfo(id="enterprise", name="Enterprise", monthly_price=499, annual_price=4990, max_seats=999,
                 features=["Everything in Pro", "Custom AI models", "Dedicated support", "SLA"]),
    ], total=4)


# ── Subscription Management ────────────────────────────────────────────────────

@router.get("/subscription", response_model=SubscriptionResponse, tags=["Billing"], summary="Get subscription",
            description="Retrieve the current subscription details for the tenant.")
async def get_subscription():
    return SubscriptionResponse(
        id="sub_123", plan="enterprise", status="active", monthly_price=499,
        seats=50, used_seats=23, billing_cycle="monthly",
        current_period_start="2025-01-01", current_period_end="2025-02-01",
    )


@router.post("/subscription", response_model=SubscriptionCreateResponse, tags=["Billing"],
             summary="Create subscription", description="Provision a new subscription plan.")
async def create_subscription(data: SubscriptionCreateRequest):
    return SubscriptionCreateResponse(id="sub_new", plan=data.plan)


@router.put("/subscription", response_model=SubscriptionUpdateResponse, tags=["Billing"],
            summary="Update subscription", description="Change plan, seats, or billing cycle.")
async def update_subscription(data: SubscriptionUpdateRequest):
    return SubscriptionUpdateResponse(id="sub_123", plan=data.plan or "enterprise")


@router.post("/subscription/cancel", response_model=SubscriptionCancelResponse, tags=["Billing"],
             summary="Cancel subscription",
             description="Cancel the current subscription. Takes effect at end of billing period.")
async def cancel_subscription():
    return SubscriptionCancelResponse(id="sub_123", canceled=True, effective_date="2025-02-01")


@router.post("/subscription/reactivate", response_model=SubscriptionResponse, tags=["Billing"],
             summary="Reactivate canceled subscription",
             description="Reactivate a subscription that was scheduled for cancellation.")
async def reactivate_subscription():
    return SubscriptionResponse(
        id="sub_123", plan="enterprise", status="active", monthly_price=499,
        seats=50, used_seats=23, billing_cycle="monthly",
        current_period_start="2025-01-01", current_period_end="2025-02-01",
    )


# ── Invoices ───────────────────────────────────────────────────────────────────

@router.get("/invoices", response_model=InvoiceListResponse, tags=["Billing"], summary="List invoices",
            description="Retrieve billing history with invoice amounts and payment status.")
async def list_invoices():
    return InvoiceListResponse(data=[
        InvoiceSummary(id="inv_001", amount=499, status="paid", date="2025-01-01", description="Enterprise Plan - January 2025"),
        InvoiceSummary(id="inv_002", amount=499, status="paid", date="2024-12-01", description="Enterprise Plan - December 2024"),
        InvoiceSummary(id="inv_003", amount=499, status="pending", date="2025-02-01", description="Enterprise Plan - February 2025"),
    ], total=3)


@router.get("/invoices/{invoice_id}", response_model=InvoiceDetailResponse, tags=["Billing"],
            summary="Get invoice details", description="Retrieve detailed line items for a specific invoice.")
async def get_invoice(invoice_id: str):
    return InvoiceDetailResponse(
        id=invoice_id, amount=499, status="paid", date="2025-01-01",
        description="Enterprise Plan - January 2025",
        line_items=[
            {"description": "Enterprise Plan (50 seats)", "amount": 449},
            {"description": "AI Token Overage (250K tokens)", "amount": 50},
        ],
        subtotal=499, tax=0, total=499, payment_method="card_***4242",
    )


@router.post("/invoices/{invoice_id}/pay", response_model=InvoicePayResponse, tags=["Billing"],
             summary="Pay invoice", description="Process payment for a pending invoice.")
async def pay_invoice(invoice_id: str, data: InvoicePayRequest):
    return InvoicePayResponse(invoice_id=invoice_id, status="paid", transaction_id="txn_new")


# ── Usage Tracking ─────────────────────────────────────────────────────────────

@router.get("/usage", response_model=UsageResponse, tags=["Billing"], summary="Get usage metrics",
            description="Retrieve current period resource consumption (tokens, candidates, storage).")
async def get_usage():
    return UsageResponse(period="2025-01", ai_tokens=1250000, candidates=156, interviews=42, storage_gb=12.5)


@router.get("/usage/breakdown", response_model=UsageBreakdownResponse, tags=["Billing"],
            summary="Get usage breakdown with costs",
            description="Detailed usage breakdown with per-category cost calculation.")
async def get_usage_breakdown():
    return UsageBreakdownResponse(period="2025-01", items=[
        UsageBreakdownItem(category="AI Tokens", quantity=1250000, unit_price=0, total=0),
        UsageBreakdownItem(category="Candidates", quantity=156, unit_price=0, total=0),
        UsageBreakdownItem(category="Interviews", quantity=42, unit_price=0, total=0),
        UsageBreakdownItem(category="Storage (GB)", quantity=12, unit_price=0, total=0),
    ], subtotal=449, tax=0, total=449)


# ── Payment Methods ────────────────────────────────────────────────────────────

@router.get("/payment-methods", response_model=PaymentMethodListResponse, tags=["Billing"],
            summary="List payment methods")
async def list_payment_methods():
    return PaymentMethodListResponse(data=[
        PaymentMethodResponse(id="pm_1", type="card", last_four="4242", exp_month=12, exp_year=2026, is_default=True),
    ], total=1)


@router.post("/payment-methods", response_model=PaymentMethodCreateResponse, tags=["Billing"],
             summary="Add payment method")
async def add_payment_method(data: PaymentMethodRequest):
    return PaymentMethodCreateResponse(id="pm_new", type=data.type)


@router.delete("/payment-methods/{method_id}", response_model=PaymentMethodDeleteResponse, tags=["Billing"],
               summary="Delete payment method")
async def delete_payment_method(method_id: str):
    return PaymentMethodDeleteResponse(id=method_id)


@router.post("/payment-methods/{method_id}/default", response_model=PaymentMethodResponse, tags=["Billing"],
             summary="Set default payment method")
async def set_default_payment_method(method_id: str):
    return PaymentMethodResponse(id=method_id, type="card", last_four="4242", exp_month=12, exp_year=2026, is_default=True)


# ── Payment Processing (Stubs) ────────────────────────────────────────────────

@router.post("/payments/process", response_model=PaymentProcessResponse, tags=["Billing"],
             summary="Process a payment",
             description="Process a payment using a stored payment method. Stub for payment gateway integration.")
async def process_payment(amount: int = 0):
    return PaymentProcessResponse(transaction_id="txn_stub", status="succeeded", amount=amount)
