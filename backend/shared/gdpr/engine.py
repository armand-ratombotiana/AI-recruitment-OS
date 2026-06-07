"""GDPR engine — implements export, anonymization, deletion, and consent logging.

This module collects user data across every domain table and exposes the
four core operations required by GDPR:

* :func:`export_user_data`  — Article 15 (right of access) and 20 (portability).
* :func:`anonymize_user`    — Article 17 alternative: pseudonymisation that
  keeps referential integrity for auditing while removing PII.
* :func:`delete_user_data`  — Article 17 (right to erasure / "be forgotten").
  Hard-deletes per-user rows from satellite tables and removes the User row.
  Audit log rows are kept but their ``user_id`` field is scrubbed so the
  audit trail remains intact without exposing PII.
* :func:`consent_log`       — Article 7 consent record (per-user, per-purpose).

All operations are tenant-scoped: a call against (user_id, tenant_id) will
silently no-op if the user does not belong to the tenant (returns ``False``
or an empty payload).  Operations are committed by the caller; this module
only flushes so the changes are visible inside the surrounding transaction.
"""
from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.models.audit_log import AuditLog
from shared.core.models.candidate_activity import CandidateActivity
from shared.core.models.compliance import ConsentRecord
from shared.core.models.identity import APIKey, Credential, Session, User, UserStatus
from shared.core.models.notification import Notification
from shared.core.models.notification_preference import (
    NotificationChannel,
    NotificationPreference,
)
from shared.core.models.search import SearchHistory


logger = logging.getLogger("gdpr.engine")


# ── Helpers ────────────────────────────────────────────────────────────────────


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _serialize_row(row: Any, exclude: tuple[str, ...] = ()) -> dict[str, Any]:
    """Convert a SQLModel row to a JSON-serialisable dict.

    Datetimes are isoformatted, enums are coerced to their ``.value``.
    """
    out: dict[str, Any] = {}
    columns = row.__table__.columns.keys() if hasattr(row, "__table__") else []
    for col in columns:
        if col in exclude:
            continue
        val = getattr(row, col, None)
        if isinstance(val, datetime):
            out[col] = val.isoformat()
        elif hasattr(val, "value"):  # Enum
            out[col] = val.value
        else:
            out[col] = val
    return out


async def _load_user(
    db: AsyncSession, user_id: str, tenant_id: str
) -> User | None:
    stmt = select(User).where(User.id == user_id, User.tenant_id == tenant_id)
    return (await db.execute(stmt)).scalar_one_or_none()


# ── Public API ────────────────────────────────────────────────────────────────


async def export_user_data(
    db: AsyncSession,
    user_id: str,
    tenant_id: str,
) -> dict[str, Any]:
    """Collect every row that belongs to ``user_id`` within ``tenant_id``.

    Returns a JSON-serialisable dict shaped as::

        {
            "user_id": "...",
            "tenant_id": "...",
            "exported_at": "2025-...",
            "user": {...} | None,
            "sessions": [...],
            "api_keys": [...],
            "credentials": [...],
            "notifications": [...],
            "notification_preferences": [...],
            "notification_channels": [...],
            "search_history": [...],
            "audit_log": [...],
            "candidate_activities": [...],
            "consent_records": [...],
        }

    If the user does not exist in this tenant, ``user`` is ``None`` and the
    satellite lists are still populated (so an operator can audit orphaned
    rows).  The function never raises on a missing user.
    """
    user = await _load_user(db, user_id, tenant_id)

    async def _all(stmt) -> list[Any]:
        return list((await db.execute(stmt)).scalars().all())

    sessions = await _all(
        select(Session).where(
            Session.user_id == user_id, Session.tenant_id == tenant_id
        )
    )
    api_keys = await _all(
        select(APIKey).where(
            APIKey.user_id == user_id, APIKey.tenant_id == tenant_id
        )
    )
    credentials = await _all(select(Credential).where(Credential.user_id == user_id))
    notifications = await _all(
        select(Notification).where(
            Notification.user_id == user_id, Notification.tenant_id == tenant_id
        )
    )
    notif_prefs = await _all(
        select(NotificationPreference).where(
            NotificationPreference.user_id == user_id,
            NotificationPreference.tenant_id == tenant_id,
        )
    )
    notif_channels = await _all(
        select(NotificationChannel).where(
            NotificationChannel.user_id == user_id,
            NotificationChannel.tenant_id == tenant_id,
        )
    )
    search_hist = await _all(
        select(SearchHistory).where(
            SearchHistory.user_id == user_id, SearchHistory.tenant_id == tenant_id
        )
    )
    audit_rows = await _all(
        select(AuditLog).where(
            AuditLog.user_id == user_id, AuditLog.tenant_id == tenant_id
        )
    )
    cand_acts = await _all(
        select(CandidateActivity).where(
            CandidateActivity.user_id == user_id,
            CandidateActivity.tenant_id == tenant_id,
        )
    )
    consents = await _all(
        select(ConsentRecord).where(
            ConsentRecord.candidate_id == user_id,
            ConsentRecord.tenant_id == tenant_id,
        )
    )

    sensitive_user_excludes = ("hashed_password", "mfa_secret", "totp_secret", "backup_codes")
    sensitive_session_excludes = ("refresh_token_hash",)
    sensitive_apikey_excludes = ("key_hash",)
    sensitive_credential_excludes = ("access_token", "refresh_token")

    return {
        "user_id": user_id,
        "tenant_id": tenant_id,
        "exported_at": _utcnow_naive().isoformat(),
        "user": _serialize_row(user, exclude=sensitive_user_excludes) if user else None,
        "sessions": [
            _serialize_row(s, exclude=sensitive_session_excludes) for s in sessions
        ],
        "api_keys": [
            _serialize_row(k, exclude=sensitive_apikey_excludes) for k in api_keys
        ],
        "credentials": [
            _serialize_row(c, exclude=sensitive_credential_excludes) for c in credentials
        ],
        "notifications": [_serialize_row(n) for n in notifications],
        "notification_preferences": [_serialize_row(p) for p in notif_prefs],
        "notification_channels": [_serialize_row(ch) for ch in notif_channels],
        "search_history": [_serialize_row(s) for s in search_hist],
        "audit_log": [_serialize_row(a) for a in audit_rows],
        "candidate_activities": [_serialize_row(c) for c in cand_acts],
        "consent_records": [_serialize_row(c) for c in consents],
    }


async def anonymize_user(
    db: AsyncSession,
    user_id: str,
    tenant_id: str,
) -> bool:
    """Replace the user's PII with anonymised markers.

    Returns ``True`` if the user was found and anonymised, ``False`` if the
    user does not exist in this tenant.  The user row is preserved so that
    historical references (audit logs, applications) remain valid.

    Anonymisation actions:

    * ``email``          → ``anonymised-<uuid>@deleted.invalid``
    * ``full_name``      → ``anonymised-<uuid>``
    * ``phone``          → ``None``
    * ``avatar_url``     → ``None``
    * ``mfa_secret``     → ``None`` (also disables MFA)
    * ``totp_secret``    → ``None`` (also disables TOTP)
    * ``backup_codes``   → ``None``
    * ``hashed_password`` → unusable salt (prevents login)
    * ``status``         → ``INACTIVE``
    * ``deactivated_at`` → now
    * notification channels: ``address`` → SHA-256 hash of original
    """
    user = await _load_user(db, user_id, tenant_id)
    if user is None:
        return False

    marker = f"anonymised-{uuid.uuid4().hex[:12]}"
    now = _utcnow_naive()

    user.email = f"{marker}@deleted.invalid"
    user.full_name = marker
    user.phone = None
    user.avatar_url = None
    user.mfa_enabled = False
    user.mfa_secret = None
    user.totp_enabled = False
    user.totp_secret = None
    user.backup_codes = None
    user.hashed_password = f"!disabled-{uuid.uuid4().hex}"
    user.status = UserStatus.INACTIVE
    user.deactivated_at = now
    user.updated_at = now

    # Hash PII in notification channels so we keep the row but cannot resolve
    # back to the user's contact info.
    channels = (
        await db.execute(
            select(NotificationChannel).where(
                NotificationChannel.user_id == user_id,
                NotificationChannel.tenant_id == tenant_id,
            )
        )
    ).scalars().all()
    for ch in channels:
        if ch.address:
            digest = hashlib.sha256(ch.address.encode("utf-8")).hexdigest()
            ch.address = f"sha256:{digest}"
            ch.verified = False

    # Revoke any active sessions.
    await db.execute(
        update(Session)
        .where(Session.user_id == user_id, Session.tenant_id == tenant_id)
        .values(revoked_at=now)
    )
    # Revoke API keys so an anonymised user can no longer call the API.
    await db.execute(
        update(APIKey)
        .where(APIKey.user_id == user_id, APIKey.tenant_id == tenant_id)
        .values(revoked_at=now)
    )

    await db.flush()
    return True


async def delete_user_data(
    db: AsyncSession,
    user_id: str,
    tenant_id: str,
) -> bool:
    """Hard-delete every row owned by the user in this tenant.

    Returns ``True`` if the user existed and was deleted, ``False`` otherwise.

    Deletion order (children before parents):

    1. Sessions, API keys, credentials.
    2. Notifications, notification preferences, notification channels.
    3. Search history, candidate activities.
    4. Consent records keyed on this user_id.
    5. Audit log rows are NOT deleted — instead the ``user_id`` field is
       set to ``NULL`` so the audit trail survives erasure (a regulatory
       requirement that overrides Art. 17 for security-relevant logs).
    6. Finally, the ``User`` row itself.
    """
    user = await _load_user(db, user_id, tenant_id)
    if user is None:
        return False

    # Children — tenant-scoped tables.
    await db.execute(
        delete(Session).where(
            Session.user_id == user_id, Session.tenant_id == tenant_id
        )
    )
    await db.execute(
        delete(APIKey).where(
            APIKey.user_id == user_id, APIKey.tenant_id == tenant_id
        )
    )
    await db.execute(delete(Credential).where(Credential.user_id == user_id))
    await db.execute(
        delete(Notification).where(
            Notification.user_id == user_id, Notification.tenant_id == tenant_id
        )
    )
    await db.execute(
        delete(NotificationPreference).where(
            NotificationPreference.user_id == user_id,
            NotificationPreference.tenant_id == tenant_id,
        )
    )
    await db.execute(
        delete(NotificationChannel).where(
            NotificationChannel.user_id == user_id,
            NotificationChannel.tenant_id == tenant_id,
        )
    )
    await db.execute(
        delete(SearchHistory).where(
            SearchHistory.user_id == user_id, SearchHistory.tenant_id == tenant_id
        )
    )
    await db.execute(
        delete(CandidateActivity).where(
            CandidateActivity.user_id == user_id,
            CandidateActivity.tenant_id == tenant_id,
        )
    )
    await db.execute(
        delete(ConsentRecord).where(
            ConsentRecord.candidate_id == user_id,
            ConsentRecord.tenant_id == tenant_id,
        )
    )

    # Preserve audit log integrity — scrub the user_id but keep the row.
    await db.execute(
        update(AuditLog)
        .where(AuditLog.user_id == user_id, AuditLog.tenant_id == tenant_id)
        .values(user_id=None)
    )

    await db.delete(user)
    await db.flush()
    return True


async def consent_log(
    db: AsyncSession,
    user_id: str,
    purpose: str,
    granted: bool,
    ip_address: str | None = None,
    tenant_id: str | None = None,
) -> ConsentRecord:
    """Record a consent decision for the given user / purpose.

    Persists a :class:`ConsentRecord` (the ``candidate_id`` column is reused
    to store the generic subject id — either a user id or a candidate id).
    The caller is responsible for committing the transaction.

    Parameters
    ----------
    db:
        Active async DB session.
    user_id:
        Identifier of the subject giving / withdrawing consent.
    purpose:
        One of ``data_processing``, ``marketing``, ``analytics``,
        ``third_party`` (free-form string, validated upstream).
    granted:
        ``True`` if consent is granted, ``False`` if withdrawn.
    ip_address:
        Optional originating IP for the consent action (audit trail).
    tenant_id:
        Tenant the consent belongs to.  Defaults to ``"default"`` when not
        provided (legacy behaviour).
    """
    record = ConsentRecord(
        tenant_id=tenant_id or "default",
        candidate_id=user_id,
        purpose=purpose,
        granted=granted,
        ip_address=ip_address,
        recorded_at=_utcnow_naive(),
        withdrawn_at=None if granted else _utcnow_naive(),
    )
    db.add(record)
    await db.flush()
    return record


async def get_consent_log(
    db: AsyncSession,
    user_id: str,
    tenant_id: str,
    purpose: str | None = None,
) -> list[dict[str, Any]]:
    """Return all consent records for the given user, newest first.

    When ``purpose`` is supplied, only records matching that purpose are
    returned.  Each record is JSON-serialisable.
    """
    stmt = (
        select(ConsentRecord)
        .where(
            ConsentRecord.candidate_id == user_id,
            ConsentRecord.tenant_id == tenant_id,
        )
        .order_by(ConsentRecord.recorded_at.desc())
    )
    if purpose:
        stmt = stmt.where(ConsentRecord.purpose == purpose)

    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "user_id": r.candidate_id,
            "tenant_id": r.tenant_id,
            "purpose": r.purpose,
            "granted": r.granted,
            "ip_address": r.ip_address,
            "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
            "withdrawn_at": r.withdrawn_at.isoformat() if r.withdrawn_at else None,
        }
        for r in rows
    ]
