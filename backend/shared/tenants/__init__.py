"""Tenant management and billing integration helpers.

This package exposes :class:`shared.tenants.manager.TenantManager` — the
single source of truth for per-tenant resource usage, plan limits, quota
enforcement, and billing summaries.
"""
from shared.tenants.manager import (
    QuotaExceededError,
    TenantManager,
    TenantNotFoundError,
)

__all__ = [
    "QuotaExceededError",
    "TenantManager",
    "TenantNotFoundError",
]
