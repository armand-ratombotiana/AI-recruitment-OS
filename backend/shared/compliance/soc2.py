"""SOC2 security-check engine.

The engine runs a fixed suite of automated security / compliance controls
against the current tenant's data and returns a :class:`ComplianceCheck`
record for each one.  The suite is intentionally derived from the SOC2
Trust Services Criteria — specifically CC6 (Logical Access) and CC7
(System Operations) — because those are the criteria a real auditor will
sample first.

Each check yields one of three statuses:

* ``"pass"``    — control objective is met
* ``"warning"`` — control cannot be evaluated (e.g. no data) or is partially met
* ``"fail"``    — control objective is violated

The function :func:`run_security_checks` performs the live DB inspection;
:func:`compute_compliance_score` and :func:`build_soc2_report` operate on
the result list.  All functions are sync-from-async-safe — they take an
``AsyncSession`` and run the queries themselves so callers can use them
from inside a FastAPI handler.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Literal

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.models.identity import User, UserRole, UserStatus, Session
from shared.core.models.api_key import ApiKey
from shared.core.models.audit_log import AuditLog
from shared.core.models.compliance import AuditEntry
from shared.core.models.webhook import Webhook


# ── Public types ───────────────────────────────────────────────────────────────


CheckStatus = Literal["pass", "fail", "warning"]
CheckCategory = Literal["access_control", "session_management", "credentials",
                        "audit_logging", "data_in_transit", "business_continuity",
                        "authentication", "rate_limiting"]


@dataclass
class ComplianceCheck:
    """A single SOC2 control evaluation."""

    id: str
    name: str
    category: CheckCategory
    status: CheckStatus
    description: str
    evidence: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ── Constants ──────────────────────────────────────────────────────────────────


# Hard-coded SOC2 control catalogue.  Each entry maps to a check function below
# and is referenced by ``id`` from the API surface (clients can request a
# single check by id if needed).
ALL_CHECK_IDS: tuple[str, ...] = (
    "SOC2-CC6.1-2FA-ADMIN",
    "SOC2-CC6.2-SESSION-24H",
    "SOC2-CC6.1-API-KEY-ROTATION",
    "SOC2-CC7.2-AUDIT-RETENTION",
    "SOC2-CC6.7-WEBHOOK-TLS",
    "SOC2-CC6.1-ADMIN-EXISTS",
    "SOC2-CC6.1-PASSWORD-POLICY",
    "SOC2-CC6.6-RATE-LIMIT-AUTH",
)


# A tenant passes a check that has a minimum age requirement only when there
# is *real* data of that age to look at.  Otherwise we report a ``warning``
# rather than a hard fail — the control is configured but unproven.
AUDIT_RETENTION_MIN_DAYS = 90
API_KEY_MAX_AGE = timedelta(days=365)
SESSION_MAX_LIFETIME = timedelta(hours=24)
PASSWORD_MIN_LENGTH = 8


# ── Check helpers ──────────────────────────────────────────────────────────────


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _is_admin_role(role: Any) -> bool:
    if role is None:
        return False
    raw = str(getattr(role, "value", role)).lower()
    return raw in {"admin", "super_admin", "tenant_admin"}


def _is_expired(ts: datetime | None) -> bool:
    if ts is None:
        return False
    return ts <= _utcnow()


# ── Individual checks ──────────────────────────────────────────────────────────


async def _check_admin_2fa(db: AsyncSession, tenant_id: str) -> ComplianceCheck:
    """SOC2 CC6.1 — every admin user has MFA enabled."""
    admin_roles = (UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
    stmt = select(User).where(
        User.tenant_id == tenant_id,
        User.role.in_(admin_roles),
        User.status == UserStatus.ACTIVE,
    )
    admins = (await db.execute(stmt)).scalars().all()

    total = len(admins)
    if total == 0:
        return ComplianceCheck(
            id="SOC2-CC6.1-2FA-ADMIN",
            name="All admin users have 2FA enabled",
            category="access_control",
            status="warning",
            description="No active admin users were found in this tenant — control "
                        "cannot be evaluated yet.",
            evidence={"admins_total": 0, "admins_with_2fa": 0},
        )

    # Both mfa_enabled and totp_enabled count as "second factor" — an org may
    # have TOTP-only or TOTP+SMS; we just need at least one to be on.
    with_2fa = [u for u in admins if bool(u.mfa_enabled) or bool(u.totp_enabled)]
    without_2fa = [u for u in admins if u not in with_2fa]

    return ComplianceCheck(
        id="SOC2-CC6.1-2FA-ADMIN",
        name="All admin users have 2FA enabled",
        category="access_control",
        status="pass" if not without_2fa else "fail",
        description=(
            "Every active admin in the tenant must have at least one second factor "
            "(TOTP or MFA) enabled to satisfy SOC2 CC6.1 multi-factor authentication."
        ),
        evidence={
            "admins_total": total,
            "admins_with_2fa": len(with_2fa),
            "admins_without_2fa": [
                {"id": u.id, "email": u.email, "role": u.role.value}
                for u in without_2fa
            ],
        },
    )


async def _check_session_lifetime(db: AsyncSession, tenant_id: str) -> ComplianceCheck:
    """SOC2 CC6.2 — every active session expires within 24 hours of issue."""
    stmt = select(Session).where(
        Session.tenant_id == tenant_id,
        Session.revoked_at.is_(None),
    )
    sessions = (await db.execute(stmt)).scalars().all()

    overlong: list[dict[str, Any]] = []
    for s in sessions:
        if s.expires_at is None or s.created_at is None:
            continue
        lifetime = s.expires_at - s.created_at
        if lifetime > SESSION_MAX_LIFETIME:
            overlong.append({
                "session_id": s.id,
                "user_id": s.user_id,
                "lifetime_hours": round(lifetime.total_seconds() / 3600.0, 2),
            })

    total = len(sessions)
    if total == 0:
        status: CheckStatus = "warning"
    elif overlong:
        status = "fail"
    else:
        status = "pass"
    return ComplianceCheck(
        id="SOC2-CC6.2-SESSION-24H",
        name="All sessions expire within 24h",
        category="session_management",
        status=status,
        description=(
            "Active user sessions must expire within 24 hours of creation to "
            "limit the impact of a stolen bearer token (SOC2 CC6.2)."
        ),
        evidence={
            "active_sessions": total,
            "max_lifetime_hours": int(SESSION_MAX_LIFETIME.total_seconds() // 3600),
            "overlong_sessions": overlong[:25],
        },
    )


async def _check_api_key_age(db: AsyncSession, tenant_id: str) -> ComplianceCheck:
    """SOC2 CC6.1 — no unrevoked API key is older than 1 year."""
    stmt = select(ApiKey).where(
        ApiKey.tenant_id == tenant_id,
        ApiKey.revoked.is_(False),
    )
    keys = (await db.execute(stmt)).scalars().all()

    now = _utcnow()
    stale: list[dict[str, Any]] = []
    for k in keys:
        if k.created_at is None:
            continue
        age = now - k.created_at
        if age > API_KEY_MAX_AGE:
            stale.append({
                "key_id": k.id,
                "name": k.name,
                "user_id": k.user_id,
                "age_days": int(age.total_seconds() // 86400),
            })

    if len(keys) == 0:
        status = "warning"
    elif stale:
        status = "fail"
    else:
        status = "pass"
    return ComplianceCheck(
        id="SOC2-CC6.1-API-KEY-ROTATION",
        name="No API keys older than 1 year",
        category="credentials",
        status=status,
        description=(
            "All non-revoked API keys must be rotated at least once per year to "
            "limit the blast radius of a key compromise (SOC2 CC6.1)."
        ),
        evidence={
            "active_keys": len(keys),
            "max_age_days": int(API_KEY_MAX_AGE.total_seconds() // 86400),
            "stale_keys": stale[:25],
        },
    )


async def _check_audit_retention(db: AsyncSession, tenant_id: str) -> ComplianceCheck:
    """SOC2 CC7.2 — audit log data is retained for >= 90 days."""
    # We check the operational audit log AND the GDPR audit entries table.
    # "Retention" here means: the oldest row currently in the table is at
    # least 90 days old, OR (when the tenant has just been created) we fall
    # back to a ``warning`` because the control cannot be evidenced yet.
    oldest_op: datetime | None = (
        await db.execute(
            select(func.min(AuditLog.created_at)).where(AuditLog.tenant_id == tenant_id)
        )
    ).scalar_one()
    oldest_gdpr: datetime | None = (
        await db.execute(
            select(func.min(AuditEntry.created_at)).where(AuditEntry.tenant_id == tenant_id)
        )
    ).scalar_one()

    candidates = [d for d in (oldest_op, oldest_gdpr) if d is not None]
    if not candidates:
        # Brand-new tenant: no history.  Fall back to the configured retention
        # in the static compliance policy (audit_logs: 2555 days by default)
        # and report a warning so operators know to seed history.
        return ComplianceCheck(
            id="SOC2-CC7.2-AUDIT-RETENTION",
            name="Audit log retention >= 90 days",
            category="audit_logging",
            status="warning",
            description=(
                "No audit log rows were found in this tenant.  The configured "
                "retention policy stores audit logs for the period required by "
                "SOC2 CC7.2, but retention cannot be evidenced against real data "
                "until the tenant has been in operation for the retention window."
            ),
            evidence={
                "min_retention_days": AUDIT_RETENTION_MIN_DAYS,
                "oldest_audit_log": None,
                "oldest_audit_entry": None,
            },
        )

    oldest = min(candidates)
    age_days = int((_utcnow() - oldest).total_seconds() // 86400)
    status: CheckStatus = "pass" if age_days >= AUDIT_RETENTION_MIN_DAYS else "warning"

    return ComplianceCheck(
        id="SOC2-CC7.2-AUDIT-RETENTION",
        name="Audit log retention >= 90 days",
        category="audit_logging",
        status=status,
        description=(
            "Operational and GDPR audit log rows must remain queryable for at "
            "least 90 days to satisfy SOC2 CC7.2 system operations criteria."
        ),
        evidence={
            "min_retention_days": AUDIT_RETENTION_MIN_DAYS,
            "oldest_audit_log": oldest_op.isoformat() if oldest_op else None,
            "oldest_audit_entry": oldest_gdpr.isoformat() if oldest_gdpr else None,
            "oldest_age_days": age_days,
        },
    )


async def _check_webhook_https(db: AsyncSession, tenant_id: str) -> ComplianceCheck:
    """SOC2 CC6.7 — every active webhook uses HTTPS."""
    stmt = select(Webhook).where(
        Webhook.tenant_id == tenant_id,
        Webhook.active.is_(True),
    )
    webhooks = (await db.execute(stmt)).scalars().all()

    insecure: list[dict[str, Any]] = []
    for w in webhooks:
        if not (w.url or "").lower().startswith("https://"):
            insecure.append({"webhook_id": w.id, "url": w.url})

    total = len(webhooks)
    return ComplianceCheck(
        id="SOC2-CC6.7-WEBHOOK-TLS",
        name="All webhooks use HTTPS",
        category="data_in_transit",
        status=(
            "pass" if total == 0 or not insecure
            else "fail"
        ),
        description=(
            "All outgoing webhook subscriptions must use TLS (https://) to "
            "protect data in transit (SOC2 CC6.7)."
        ),
        evidence={
            "active_webhooks": total,
            "insecure_webhooks": insecure[:25],
        },
    )


async def _check_admin_exists(db: AsyncSession, tenant_id: str) -> ComplianceCheck:
    """SOC2 CC6.1 — at least one active admin user exists in the tenant."""
    admin_roles = (UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
    stmt = (
        select(func.count())
        .select_from(User)
        .where(
            User.tenant_id == tenant_id,
            User.role.in_(admin_roles),
            User.status == UserStatus.ACTIVE,
        )
    )
    count = int((await db.execute(stmt)).scalar_one() or 0)

    return ComplianceCheck(
        id="SOC2-CC6.1-ADMIN-EXISTS",
        name="At least one admin user exists",
        category="access_control",
        status="pass" if count >= 1 else "fail",
        description=(
            "Every tenant must have at least one active admin so that privileged "
            "operations (key rotation, compliance review) can be performed "
            "(SOC2 CC6.1)."
        ),
        evidence={"active_admins": count},
    )


async def _check_password_policy(db: AsyncSession, tenant_id: str) -> ComplianceCheck:
    """SOC2 CC6.1 — passwords are required to be at least 8 characters.

    The platform enforces this at the API layer via Pydantic
    ``Field(min_length=8)`` on every password field.  We verify the
    enforcement is intact by introspecting the live schemas; Pydantic v2
    stores string-length constraints in ``FieldInfo.metadata`` as
    ``annotated_types.MinLen`` instances, so we look there rather than at
    the (now-removed) direct ``min_length`` attribute.
    """
    from shared.core.models.identity import UserCreate, RegisterRequest, PasswordReset

    def _extract_min_length(field_info) -> int | None:
        # Pydantic v2 path: constraints live in ``field_info.metadata``.
        meta = getattr(field_info, "metadata", None) or []
        for m in meta:
            # annotated_types.MinLen / StrLen
            min_len = getattr(m, "min_length", None) or getattr(m, "min_len", None)
            if isinstance(min_len, int):
                return min_len
        # Fall back to the direct attribute for any future Pydantic versions
        # that re-expose it.
        return getattr(field_info, "min_length", None)

    enforced_on: list[str] = []
    for schema in (UserCreate, RegisterRequest, PasswordReset):
        for fname in ("password", "new_password"):
            field = schema.model_fields.get(fname)
            if field is None:
                continue
            min_length = _extract_min_length(field)
            if min_length is not None and min_length >= PASSWORD_MIN_LENGTH:
                enforced_on.append(f"{schema.__name__}.{fname} (min_length={min_length})")

    active_users = int(
        (await db.execute(
            select(func.count()).select_from(User).where(
                User.tenant_id == tenant_id, User.status == UserStatus.ACTIVE,
            )
        )).scalar_one() or 0
    )

    if not enforced_on:
        status: CheckStatus = "fail"
    elif active_users == 0:
        status = "warning"
    else:
        status = "pass"

    return ComplianceCheck(
        id="SOC2-CC6.1-PASSWORD-POLICY",
        name="Password policy enforced (min 8 chars)",
        category="authentication",
        status=status,
        description=(
            "All password inputs must be validated for a minimum length of 8 "
            "characters to satisfy SOC2 CC6.1 authentication requirements."
        ),
        evidence={
            "min_length": PASSWORD_MIN_LENGTH,
            "enforced_on_schemas": enforced_on,
            "active_users_in_tenant": active_users,
        },
    )


async def _check_auth_rate_limiting(db: AsyncSession, tenant_id: str) -> ComplianceCheck:
    """SOC2 CC6.6 — rate limiting is enabled on auth endpoints.

    Rate limiting is a process-wide configuration rather than a per-tenant
    setting, so we look at the registered middleware limiters and confirm
    at least one auth-scoped limiter has a per-minute cap > 0.  A missing
    or zero-cap limiter is reported as ``fail``.
    """
    from shared.core.ratelimit import (
        auth_login_limiter,
        auth_register_limiter,
        auth_password_reset_limiter,
    )

    limiters = (
        ("auth.login", auth_login_limiter),
        ("auth.register", auth_register_limiter),
        ("auth.password_reset", auth_password_reset_limiter),
    )
    configured: dict[str, dict[str, Any]] = {}
    healthy = True
    for name, lim in limiters:
        cap = int(getattr(lim, "max_requests", 0) or 0)
        window = int(getattr(lim, "window_seconds", 0) or 0)
        info = {"max_requests": cap, "window_seconds": window}
        configured[name] = info
        if cap <= 0 or window <= 0:
            healthy = False

    # If the shared.core.ratelimit module also ships the middleware-defined
    # auth_ip_limiter (from shared.middleware.rate_limit), accept either
    # stack as proof that the control is in place.
    try:
        from shared.middleware.rate_limit import auth_ip_limiter  # type: ignore
        configured["auth.ip"] = {
            "per_minute": getattr(auth_ip_limiter, "per_minute", 0),
            "per_hour": getattr(auth_ip_limiter, "per_hour", 0),
            "per_day": getattr(auth_ip_limiter, "per_day", 0),
        }
    except Exception:
        pass

    return ComplianceCheck(
        id="SOC2-CC6.6-RATE-LIMIT-AUTH",
        name="Rate limiting enabled on auth endpoints",
        category="rate_limiting",
        status="pass" if healthy else "fail",
        description=(
            "Authentication endpoints (login, register, password reset) must be "
            "rate limited to mitigate brute-force and credential-stuffing attacks "
            "(SOC2 CC6.6)."
        ),
        evidence={"limiters": configured},
    )


# ── Catalogue of all checks (registration order = display order) ──────────────


ALL_CHECKS: list[tuple[str, Any]] = [
    ("SOC2-CC6.1-2FA-ADMIN", _check_admin_2fa),
    ("SOC2-CC6.2-SESSION-24H", _check_session_lifetime),
    ("SOC2-CC6.1-API-KEY-ROTATION", _check_api_key_age),
    ("SOC2-CC7.2-AUDIT-RETENTION", _check_audit_retention),
    ("SOC2-CC6.7-WEBHOOK-TLS", _check_webhook_https),
    ("SOC2-CC6.1-ADMIN-EXISTS", _check_admin_exists),
    ("SOC2-CC6.1-PASSWORD-POLICY", _check_password_policy),
    ("SOC2-CC6.6-RATE-LIMIT-AUTH", _check_auth_rate_limiting),
]


# ── Public engine ──────────────────────────────────────────────────────────────


async def run_security_checks(
    db: AsyncSession,
    tenant_id: str,
    check_ids: Iterable[str] | None = None,
) -> list[ComplianceCheck]:
    """Run the SOC2 check suite and return one :class:`ComplianceCheck` per control.

    ``check_ids`` optionally restricts execution to a subset of the catalogue
    (useful for filtered HTTP endpoints).
    """
    selected = (
        [(cid, fn) for cid, fn in ALL_CHECKS if cid in set(check_ids)]
        if check_ids is not None
        else list(ALL_CHECKS)
    )
    results: list[ComplianceCheck] = []
    for _cid, fn in selected:
        try:
            results.append(await fn(db, tenant_id))
        except Exception as exc:  # pragma: no cover - defensive
            # A misbehaving check must not break the whole report.
            results.append(ComplianceCheck(
                id=_cid,
                name=fn.__name__.replace("_", " "),
                category="access_control",
                status="fail",
                description="Check failed to execute — see evidence for details.",
                evidence={"error": str(exc)},
            ))
    return results


# ── Scoring / reporting ────────────────────────────────────────────────────────


# Per-status point value used to compute the 0–100 compliance score.  A
# warning is worth half a pass so the score can move gradually as controls
# are evidenced.
_STATUS_WEIGHT: dict[str, int] = {"pass": 100, "warning": 50, "fail": 0}


def compute_compliance_score(checks: list[ComplianceCheck]) -> int:
    """Compute the SOC2 compliance score (0–100).

    Each check contributes its status weight; the final number is the
    truncated arithmetic mean (round toward 0).  Returns 0 for an empty
    list.
    """
    if not checks:
        return 0
    total = sum(_STATUS_WEIGHT.get(c.status, 0) for c in checks)
    return int(total // len(checks))


def build_soc2_report(
    checks: list[ComplianceCheck],
    *,
    tenant_id: str,
    score: int | None = None,
    report_id: str | None = None,
) -> dict[str, Any]:
    """Assemble a PDF-ready JSON report for the SOC2 control set.

    The output is structured to map cleanly to a SOC2 Trust Services
    Criteria report layout: one section per category with its check
    results and an evidence summary.
    """
    if score is None:
        score = compute_compliance_score(checks)

    passed = sum(1 for c in checks if c.status == "pass")
    failed = sum(1 for c in checks if c.status == "fail")
    warned = sum(1 for c in checks if c.status == "warning")

    # Group checks by category for the report.
    by_category: dict[str, list[dict[str, Any]]] = {}
    for c in checks:
        by_category.setdefault(c.category, []).append({
            "id": c.id,
            "name": c.name,
            "status": c.status,
            "description": c.description,
            "evidence": c.evidence,
        })

    overall = (
        "compliant" if failed == 0 and warned == 0
        else "partially_compliant" if failed == 0
        else "non_compliant"
    )

    return {
        "report_id": report_id or f"soc2_{_utcnow().strftime('%Y%m%d%H%M%S')}",
        "framework": "SOC2",
        "tenant_id": tenant_id,
        "generated_at": _utcnow().isoformat() + "Z",
        "overall_status": overall,
        "score": score,
        "summary": {
            "total": len(checks),
            "passed": passed,
            "failed": failed,
            "warnings": warned,
        },
        "categories": by_category,
        "controls": [c.to_dict() for c in checks],
    }
