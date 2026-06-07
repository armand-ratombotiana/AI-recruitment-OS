"""Tenant management — usage, limits, quotas, and billing summaries.

The :class:`TenantManager` is the single source of truth for *what a tenant
is allowed to do* and *what they are currently using*.  All other services
should call into this manager instead of re-implementing quota logic.

Key responsibilities:

* **Usage** — count rows in the ``users``, ``candidates``, and ``jobs``
  tables for a tenant.  Storage is approximated from the number of
  candidates and their notes (the per-candidate budget is configurable so
  tests can scale storage up or down).
* **Limits** — pull the plan limits from the billing catalog keyed off the
  tenant's current plan.  ``-1`` from the catalog is normalised to
  ``math.inf`` so callers never have to special-case the unlimited value.
* **Quota enforcement** — :meth:`TenantManager.check_quota` raises
  :class:`QuotaExceededError` when adding a single resource would push the
  tenant over its plan.  The same method returns ``True`` for unlimited
  resources so callers can chain ``if manager.check_quota(...)`` checks.
* **Billing summaries** — combine the plan, current usage, and a
  deterministic overage calculation ($0.10 per unit over the limit) so the
  frontend can render an invoice preview.

The manager is intentionally decoupled from any specific HTTP framework or
DB layer so it can be unit-tested with pure-Python dicts.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.billing_service.plans import PLANS, get_plan
from shared.core.models.candidate import Candidate
from shared.core.models.identity import User
from shared.core.models.recruitment import Job


logger = logging.getLogger("shared.tenants")


# Resources managed by the quota system.
VALID_RESOURCES = frozenset({"users", "candidates", "jobs", "storage_mb"})

# Default storage budget per candidate (KB).  Used to approximate the
# tenant's total storage footprint in MB from the candidate count.
DEFAULT_STORAGE_PER_CANDIDATE_KB = 256

# 1 MB = 1024 KB.  Defined as a module constant for readability.
_KB_PER_MB = 1024

# Mock overage rate: $0.10 per unit over the limit (matches the billing
# service's ``usage/me`` endpoint).
OVERAGE_CENTS_PER_UNIT = 10


class TenantNotFoundError(LookupError):
    """Raised when an unknown tenant is requested."""


class QuotaExceededError(PermissionError):
    """Raised when adding a resource would push a tenant over its plan."""

    def __init__(
        self,
        tenant_id: str,
        resource: str,
        *,
        used: int,
        limit: int,
        attempted: int = 1,
    ) -> None:
        self.tenant_id = tenant_id
        self.resource = resource
        self.used = used
        self.limit = limit
        self.attempted = attempted
        super().__init__(
            f"Quota exceeded for tenant '{tenant_id}': {resource} "
            f"used={used} limit={limit} attempted_to_add={attempted}"
        )


class TenantManager:
    """Per-tenant resource manager.

    The manager can run in two modes:

    * **DB-backed** — pass an :class:`AsyncSession` and real usage counts
      are read from the SQLModel tables.  This is the mode used by
      production services.
    * **In-memory / unit-test** — leave ``db`` as ``None`` and the manager
      falls back to the in-memory tenant store from
      :mod:`apps.tenant_service.main` plus zero usage counts.  Useful for
      pure-Python tests of the manager itself.
    """

    DEFAULT_PLAN_ID = "free"

    def __init__(
        self,
        db: AsyncSession | None = None,
        *,
        storage_per_candidate_kb: int = DEFAULT_STORAGE_PER_CANDIDATE_KB,
    ) -> None:
        self._db = db
        self._storage_per_candidate_kb = storage_per_candidate_kb

    # ── Tenant lookups ────────────────────────────────────────────────────

    def get_tenant(self, tenant_id: str) -> dict[str, Any] | None:
        """Return the tenant record for ``tenant_id`` (in-memory store)."""
        from apps.tenant_service.main import _tenants

        return _tenants.get(tenant_id)

    def get_plan_id(self, tenant_id: str) -> str:
        """Return the plan id for ``tenant_id`` (defaults to ``free``)."""
        record = self.get_tenant(tenant_id)
        if not record:
            return self.DEFAULT_PLAN_ID
        return record.get("plan") or self.DEFAULT_PLAN_ID

    def get_plan(self, tenant_id: str) -> dict[str, Any]:
        """Return the full plan dict for ``tenant_id``."""
        return get_plan(self.get_plan_id(tenant_id)) or get_plan(self.DEFAULT_PLAN_ID)

    def get_or_create_tenant(
        self,
        tenant_id: str,
        *,
        name: str | None = None,
        plan: str | None = None,
    ) -> dict[str, Any]:
        """Return the existing tenant or auto-create a default record.

        The auto-create path is the foundation for the
        ``/tenants/current`` endpoint: a brand-new tenant hitting the API
        for the first time gets a sensible record (plan=free, status=active)
        without requiring a separate onboarding call.
        """
        from apps.tenant_service.main import (
            _tenants,
            _tenant_settings,
            _tenant_branding,
        )
        from datetime import datetime, timezone

        existing = _tenants.get(tenant_id)
        if existing is not None:
            return existing

        now = datetime.now(timezone.utc).isoformat()
        record = {
            "id": tenant_id,
            "name": name or tenant_id,
            "slug": tenant_id,
            "plan": plan or self.DEFAULT_PLAN_ID,
            "status": "active",
            "created_at": now,
            "updated_at": now,
        }
        _tenants[tenant_id] = record
        _tenant_settings[tenant_id] = {
            "tenant_id": tenant_id,
            "settings": {
                "notifications": True,
                "ai_enabled": True,
                "max_users": 100,
                "default_language": "en",
                "timezone": "UTC",
            },
        }
        _tenant_branding[tenant_id] = {
            "tenant_id": tenant_id,
            "branding": {
                "primary_color": "#3b82f6",
                "logo_url": "/logo.svg",
                "company_name": record["name"],
            },
        }
        return record

    def update_tenant(
        self,
        tenant_id: str,
        *,
        name: str | None = None,
        plan: str | None = None,
        status: str | None = None,
    ) -> dict[str, Any]:
        """Update mutable fields on a tenant and return the new record."""
        from datetime import datetime, timezone

        record = self.get_or_create_tenant(tenant_id)
        if name is not None:
            record["name"] = name
        if plan is not None:
            record["plan"] = plan
        if status is not None:
            record["status"] = status
        record["updated_at"] = datetime.now(timezone.utc).isoformat()
        return record

    # ── Usage ─────────────────────────────────────────────────────────────

    async def get_usage(self, tenant_id: str) -> dict[str, Any]:
        """Return the current resource consumption for ``tenant_id``.

        Returns a dict with keys ``users``, ``candidates``, ``jobs`` and
        ``storage_mb``.  When the manager is not bound to a DB, all counts
        are zero (suitable for unit tests).
        """
        if self._db is None:
            return {
                "tenant_id": tenant_id,
                "users": 0,
                "candidates": 0,
                "jobs": 0,
                "storage_mb": 0,
            }

        users_count = (await self._db.execute(
            select(func.count()).select_from(User).where(User.tenant_id == tenant_id)
        )).scalar_one()

        candidates_count = (await self._db.execute(
            select(func.count()).select_from(Candidate).where(Candidate.tenant_id == tenant_id)
        )).scalar_one()

        jobs_count = (await self._db.execute(
            select(func.count()).select_from(Job).where(Job.tenant_id == tenant_id)
        )).scalar_one()

        storage_mb = self._estimate_storage_mb(int(candidates_count))
        return {
            "tenant_id": tenant_id,
            "users": int(users_count),
            "candidates": int(candidates_count),
            "jobs": int(jobs_count),
            "storage_mb": storage_mb,
        }

    def _estimate_storage_mb(self, candidate_count: int) -> int:
        """Approximate storage in MB from the candidate count."""
        kb = candidate_count * self._storage_per_candidate_kb
        return int(math.ceil(kb / _KB_PER_MB))

    # ── Limits ────────────────────────────────────────────────────────────

    def get_limits(self, tenant_id: str) -> dict[str, Any]:
        """Return the plan limits for ``tenant_id``.

        ``-1`` in the plan catalog is translated to :data:`math.inf` for
        easy comparison in Python.  A separate ``unlimited`` flag preserves
        the wire-level representation.
        """
        plan = self.get_plan(tenant_id)
        raw = plan.get("limits", {}) or {}
        max_users = self._normalise_limit(raw.get("users"))
        max_candidates = self._normalise_limit(raw.get("candidates"))
        max_jobs = self._normalise_limit(raw.get("jobs"))
        max_storage_mb = self._normalise_limit(
            (raw.get("storage_gb") or 0) * _KB_PER_MB
        )
        return {
            "tenant_id": tenant_id,
            "plan_id": plan.get("id"),
            "plan_name": plan.get("name"),
            "max_users": max_users,
            "max_candidates": max_candidates,
            "max_jobs": max_jobs,
            "max_storage_mb": max_storage_mb,
            "unlimited": {
                "users": math.isinf(max_users),
                "candidates": math.isinf(max_candidates),
                "jobs": math.isinf(max_jobs),
                "storage_mb": math.isinf(max_storage_mb),
            },
        }

    @staticmethod
    def _normalise_limit(value: int | None) -> int:
        """Translate ``-1`` / ``None`` to :data:`math.inf`."""
        if value is None:
            return math.inf
        if value < 0:
            return math.inf
        return int(value)

    # ── Quota enforcement ────────────────────────────────────────────────

    async def check_quota(
        self,
        tenant_id: str,
        resource: str,
        *,
        additional: int = 1,
    ) -> bool:
        """Verify that adding ``additional`` units of ``resource`` is allowed.

        Returns ``True`` if the operation may proceed.  Raises
        :class:`QuotaExceededError` when the tenant is at or above its
        plan limit for the requested resource.  Unlimited resources always
        return ``True`` without consulting the DB.
        """
        if resource not in VALID_RESOURCES:
            raise ValueError(
                f"Unknown resource '{resource}'. "
                f"Valid: {sorted(VALID_RESOURCES)}"
            )

        limits = self.get_limits(tenant_id)
        limit_key = f"max_{resource}"
        limit = limits[limit_key]
        if math.isinf(limit):
            return True

        usage = await self.get_usage(tenant_id)
        used = int(usage.get(resource, 0))
        if used + additional > limit:
            raise QuotaExceededError(
                tenant_id,
                resource,
                used=used,
                limit=limit,
                attempted=additional,
            )
        return True

    def check_quota_sync(
        self,
        tenant_id: str,
        resource: str,
        *,
        used: int,
        additional: int = 1,
    ) -> bool:
        """Synchronous quota check using a pre-computed ``used`` value.

        Mirrors :meth:`check_quota` for callers that already have the
        current usage on hand (e.g. when the same usage object is being
        passed to multiple checks).
        """
        if resource not in VALID_RESOURCES:
            raise ValueError(
                f"Unknown resource '{resource}'. "
                f"Valid: {sorted(VALID_RESOURCES)}"
            )

        limits = self.get_limits(tenant_id)
        limit_key = f"max_{resource}"
        limit = limits[limit_key]
        if math.isinf(limit):
            return True

        if used + additional > limit:
            raise QuotaExceededError(
                tenant_id,
                resource,
                used=used,
                limit=limit,
                attempted=additional,
            )
        return True

    # ── Billing summary ──────────────────────────────────────────────────

    async def get_billing_summary(self, tenant_id: str) -> dict[str, Any]:
        """Return a billing summary for the current period.

        Shape::

            {
                "tenant_id": "...",
                "plan": { ... full plan dict ... },
                "current_usage": { users, candidates, jobs, storage_mb },
                "limits":      { max_users, max_candidates, max_jobs, max_storage_mb },
                "overage": {
                    "users":        { used, limit, overage, unlimited },
                    "candidates":   { used, limit, overage, unlimited },
                    "jobs":         { used, limit, overage, unlimited },
                    "storage_mb":   { used, limit, overage, unlimited },
                },
                "overage_cents": 1234,
                "currency": "usd",
                "period": "2025-01",
                "generated_at": "2025-01-15T10:00:00Z",
            }
        """
        plan = self.get_plan(tenant_id)
        limits = self.get_limits(tenant_id)
        usage = await self.get_usage(tenant_id)

        overage_by_resource: dict[str, dict[str, Any]] = {}
        total_overage_cents = 0

        for resource in VALID_RESOURCES:
            limit = limits[f"max_{resource}"]
            used = int(usage.get(resource, 0))
            if math.isinf(limit):
                overage_by_resource[resource] = {
                    "used": used,
                    "limit": -1,
                    "unlimited": True,
                    "overage": 0,
                }
                continue
            overage = max(0, used - limit)
            total_overage_cents += overage * OVERAGE_CENTS_PER_UNIT
            overage_by_resource[resource] = {
                "used": used,
                "limit": limit,
                "unlimited": False,
                "overage": overage,
            }

        return {
            "tenant_id": tenant_id,
            "plan": {
                "id": plan.get("id"),
                "name": plan.get("name"),
                "tier": plan.get("tier"),
                "monthly_price_cents": plan.get("monthly_price_cents"),
                "annual_price_cents": plan.get("annual_price_cents"),
                "per_seat_price_cents": plan.get("per_seat_price_cents"),
                "currency": plan.get("currency"),
                "max_seats": plan.get("max_seats"),
            },
            "current_usage": usage,
            "limits": {
                "max_users": _to_wire(limits["max_users"]),
                "max_candidates": _to_wire(limits["max_candidates"]),
                "max_jobs": _to_wire(limits["max_jobs"]),
                "max_storage_mb": _to_wire(limits["max_storage_mb"]),
            },
            "overage": overage_by_resource,
            "overage_cents": total_overage_cents,
            "currency": plan.get("currency", "usd"),
            "period": datetime.now(timezone.utc).strftime("%Y-%m"),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }


def _to_wire(value: float) -> int:
    """Convert :data:`math.inf` to ``-1`` for JSON-serialisable output."""
    if math.isinf(value):
        return -1
    return int(value)
