"""Plan catalog for the AI-ROS billing service.

Single source of truth for all subscription plans, prices, limits, and per-seat
pricing. Both the FastAPI endpoints and the seed logic read from here.
"""
from __future__ import annotations

from typing import Any


PLANS: list[dict[str, Any]] = [
    {
        "id": "free",
        "name": "Free",
        "tier": 0,
        "monthly_price_cents": 0,
        "annual_price_cents": 0,
        "per_seat_price_cents": 0,
        "currency": "usd",
        "max_seats": 3,
        "limits": {
            "candidates": 50,
            "jobs": 10,
            "users": 3,
            "ai_calls_per_month": 100,
            "storage_gb": 1,
        },
        "features": [
            "50 candidates",
            "10 jobs",
            "Basic AI",
            "Community support",
        ],
        "is_popular": False,
        "is_custom_pricing": False,
    },
    {
        "id": "starter",
        "name": "Starter",
        "tier": 1,
        "monthly_price_cents": 4900,
        "annual_price_cents": 49000,
        "per_seat_price_cents": 900,
        "currency": "usd",
        "max_seats": 10,
        "limits": {
            "candidates": 500,
            "jobs": 50,
            "users": 10,
            "ai_calls_per_month": 5000,
            "storage_gb": 25,
        },
        "features": [
            "500 candidates",
            "50 jobs",
            "AI enrichment",
            "Email support",
            "Standard analytics",
        ],
        "is_popular": False,
        "is_custom_pricing": False,
    },
    {
        "id": "pro",
        "name": "Pro",
        "tier": 2,
        "monthly_price_cents": 19900,
        "annual_price_cents": 199000,
        "per_seat_price_cents": 1900,
        "currency": "usd",
        "max_seats": 50,
        "limits": {
            "candidates": 10000,
            "jobs": 500,
            "users": 50,
            "ai_calls_per_month": 50000,
            "storage_gb": 250,
        },
        "features": [
            "Unlimited candidates*",
            "Unlimited jobs*",
            "Advanced AI + custom prompts",
            "Priority support",
            "Advanced analytics",
            "Custom branding",
            "API access",
        ],
        "is_popular": True,
        "is_custom_pricing": False,
    },
    {
        "id": "enterprise",
        "name": "Enterprise",
        "tier": 3,
        "monthly_price_cents": 49900,
        "annual_price_cents": 499000,
        "per_seat_price_cents": 3900,
        "currency": "usd",
        "max_seats": 9999,
        "limits": {
            "candidates": -1,  # unlimited
            "jobs": -1,  # unlimited
            "users": 9999,
            "ai_calls_per_month": -1,  # unlimited / metered
            "storage_gb": 5000,
        },
        "features": [
            "Everything in Pro",
            "Unlimited everything",
            "Custom AI models",
            "Dedicated CSM",
            "99.9% SLA",
            "SSO / SAML",
            "Audit logs",
            "Onboarding & training",
        ],
        "is_popular": False,
        "is_custom_pricing": True,  # contact sales
    },
]


def get_plan(plan_id: str) -> dict[str, Any] | None:
    """Return a plan by id, or None if not found."""
    for p in PLANS:
        if p["id"] == plan_id:
            return p
    return None


def plan_price_cents(plan_id: str, billing_cycle: str = "monthly", seats: int = 1) -> int:
    """Compute the price (in cents) for a plan + cycle + seats.

    Per-seat plans: pro/enterprise add `per_seat_price_cents * (seats - 1)` to the
    base price (first seat is included in the base).
    """
    p = get_plan(plan_id)
    if not p:
        return 0
    if billing_cycle == "annual":
        base = p["annual_price_cents"]
    else:
        base = p["monthly_price_cents"]
    if p["per_seat_price_cents"] > 0 and seats > 1:
        base += p["per_seat_price_cents"] * (seats - 1)
    return base


def annual_savings_pct(plan_id: str) -> int:
    """Return the % saved by choosing annual vs 12×monthly."""
    p = get_plan(plan_id)
    if not p or p["monthly_price_cents"] <= 0:
        return 0
    twelve_monthly = p["monthly_price_cents"] * 12
    if twelve_monthly <= 0:
        return 0
    saved = twelve_monthly - p["annual_price_cents"]
    if saved <= 0:
        return 0
    return int(round(saved * 100 / twelve_monthly))
