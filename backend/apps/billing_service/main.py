"""Billing Service — Subscription plans, invoices, usage tracking, and payment processing."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


# ── In-Memory Store ─────────────────────────────────────────────────────────────

_plans: list[dict[str, Any]] = [
    {"id": "free", "name": "Free", "monthly_price": 0, "annual_price": 0, "max_seats": 3, "features": ["50 candidates", "10 jobs", "Basic AI"]},
    {"id": "starter", "name": "Starter", "monthly_price": 99, "annual_price": 990, "max_seats": 10, "features": ["500 candidates", "50 jobs", "AI enrichment", "Email support"]},
    {"id": "pro", "name": "Pro", "monthly_price": 299, "annual_price": 2990, "max_seats": 50, "features": ["Unlimited candidates", "Unlimited jobs", "Advanced AI", "Priority support"]},
    {"id": "enterprise", "name": "Enterprise", "monthly_price": 499, "annual_price": 4990, "max_seats": 999, "features": ["Everything in Pro", "Custom AI models", "Dedicated support", "SLA"]},
]

_subscription: dict[str, Any] = {
    "id": "sub_123", "plan": "enterprise", "status": "active", "monthly_price": 499,
    "seats": 50, "used_seats": 23, "billing_cycle": "monthly",
    "current_period_start": "2025-01-01", "current_period_end": "2025-02-01",
}

_invoices: dict[str, dict[str, Any]] = {
    "inv_001": {"id": "inv_001", "amount": 499, "status": "paid", "date": "2025-01-01", "description": "Enterprise Plan - January 2025"},
    "inv_002": {"id": "inv_002", "amount": 499, "status": "paid", "date": "2024-12-01", "description": "Enterprise Plan - December 2024"},
    "inv_003": {"id": "inv_003", "amount": 499, "status": "pending", "date": "2025-02-01", "description": "Enterprise Plan - February 2025"},
}

_payment_methods: dict[str, dict[str, Any]] = {
    "pm_1": {"id": "pm_1", "type": "card", "last_four": "4242", "exp_month": 12, "exp_year": 2026, "is_default": True},
}


# ── Request Models ──────────────────────────────────────────────────────────────

class SubscribeRequest(BaseModel):
    plan: str = Field(..., description="free | starter | pro | enterprise")
    seats: int = Field(default=1, ge=1, description="Number of user seats")
    billing_cycle: str = Field(default="monthly", description="monthly | annual")


class PaymentMethodRequest(BaseModel):
    type: str = Field(default="card", description="card | bank_transfer | invoice")
    token: str | None = Field(None, description="Payment token from processor")
    last_four: str | None = Field(None, description="Last four digits")
    exp_month: int | None = Field(None, ge=1, le=12)
    exp_year: int | None = Field(None, ge=2024)


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "billing"


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Billing"])
async def health():
    return HealthResponse()


@router.get("/plans", tags=["Billing"], summary="List available plans")
async def list_plans():
    return {"data": _plans, "total": len(_plans)}


@router.get("/subscription", tags=["Billing"], summary="Get current subscription")
async def get_subscription():
    return _subscription


@router.post("/subscribe", tags=["Billing"], summary="Subscribe to a plan")
async def subscribe(data: SubscribeRequest):
    plan = next((p for p in _plans if p["id"] == data.plan), None)
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan '{data.plan}' not found")
    now = datetime.now(timezone.utc).isoformat()
    _subscription.update({
        "plan": data.plan,
        "status": "active",
        "monthly_price": plan["monthly_price"],
        "seats": data.seats,
        "billing_cycle": data.billing_cycle,
        "current_period_start": now[:10],
    })
    return {"id": _subscription["id"], "plan": data.plan, "created": True}


@router.get("/invoices", tags=["Billing"], summary="List invoices")
async def list_invoices():
    items = list(_invoices.values())
    return {"data": items, "total": len(items)}


@router.get("/invoices/{invoice_id}", tags=["Billing"], summary="Get invoice details")
async def get_invoice(invoice_id: str):
    if invoice_id not in _invoices:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv = _invoices[invoice_id]
    inv["line_items"] = [
        {"description": "Enterprise Plan (50 seats)", "amount": 449},
        {"description": "AI Token Overage (250K tokens)", "amount": 50},
    ]
    inv["subtotal"] = inv["amount"]
    inv["tax"] = 0
    inv["total"] = inv["amount"]
    return inv


@router.get("/usage", tags=["Billing"], summary="Get usage stats")
async def get_usage():
    return {"period": "2025-01", "ai_tokens": 1250000, "candidates": 156, "interviews": 42, "storage_gb": 12.5}


@router.post("/payment-methods", tags=["Billing"], summary="Add payment method")
async def add_payment_method(data: PaymentMethodRequest):
    pm_id = f"pm_{uuid.uuid4().hex[:8]}"
    pm = {
        "id": pm_id,
        "type": data.type,
        "last_four": data.last_four or "0000",
        "exp_month": data.exp_month or 12,
        "exp_year": data.exp_year or 2026,
        "is_default": False,
    }
    _payment_methods[pm_id] = pm
    return {"id": pm_id, "type": data.type, "created": True}


@router.get("/payment-methods", tags=["Billing"], summary="List payment methods")
async def list_payment_methods():
    items = list(_payment_methods.values())
    return {"data": items, "total": len(items)}


@router.delete("/payment-methods/{method_id}", tags=["Billing"], summary="Delete payment method")
async def delete_payment_method(method_id: str):
    if method_id not in _payment_methods:
        raise HTTPException(status_code=404, detail="Payment method not found")
    del _payment_methods[method_id]
    return {"id": method_id, "deleted": True}
