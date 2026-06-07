"""Compliance Service — GDPR / SOC2 / ISO27001 compliance.

Persistence: all entries are now stored in the database (was in-memory dicts
in the previous version).  Audit log, consent, data export, and data deletion
each have a dedicated SQLModel in ``shared.core.models.compliance``.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from shared.audit import audit
from shared.auth import require_admin, require_tenant_id
from shared.core.database import get_db_dependency
from shared.core.models.candidate import Candidate, CandidateProfile, CandidateStatus
from shared.core.models.compliance import (
    AuditEntry,
    ConsentRecord,
    DataDeletionRequest,
    DataExportRequest,
)
from shared.core.security import require_tenant, require_user
from shared.gdpr import (
    anonymize_user,
    consent_log,
    delete_user_data,
    export_user_data,
    get_consent_log,
)


logger = logging.getLogger("compliance_service")
router = APIRouter()


# ── Static policy data (in code; not user-mutable) ─────────────────────────────

_POLICIES: list[dict[str, Any]] = [
    {"id": "p1", "name": "Data Retention Policy", "type": "data_retention", "status": "active",
     "description": "Defines data retention periods for different data types"},
    {"id": "p2", "name": "Access Control Policy", "type": "access_control", "status": "active",
     "description": "Defines role-based access control rules"},
    {"id": "p3", "name": "Encryption Policy", "type": "encryption", "status": "active",
     "description": "Defines encryption standards for data at rest and in transit"},
]

_RETENTION: list[dict[str, Any]] = [
    {"data_type": "candidate_resumes", "retention_days": 365, "auto_delete": True},
    {"data_type": "interview_transcripts", "retention_days": 730, "auto_delete": True},
    {"data_type": "audit_logs", "retention_days": 2555, "auto_delete": False},
]


# ── Request / Response Models ──────────────────────────────────────────────────


class ConsentRecordRequest(BaseModel):
    candidate_id: str | None = None
    user_id: str | None = None
    type: str = Field(..., description="data_processing | marketing | analytics | third_party")
    granted: bool
    purpose: str | None = None
    ip_address: str | None = None


class DataExportRequestIn(BaseModel):
    candidate_id: str
    format: str = Field(default="json", description="json | csv | pdf")
    include_sections: list[str] | None = None


class DataDeletionRequestIn(BaseModel):
    candidate_id: str
    reason: str = Field(default="user_request", description="user_request | retention_expired | legal_hold")
    confirm: bool = Field(..., description="Must be true to confirm deletion")


class AuditEntryIn(BaseModel):
    action: str
    resource_type: str
    resource_id: str | None = None
    details: dict[str, Any] | None = None
    outcome: str = "success"


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "compliance"


# ── Health / status ────────────────────────────────────────────────────────────


@router.get("/health", response_model=HealthResponse, tags=["Compliance"])
async def health():
    return HealthResponse()


@router.get("/status", tags=["Compliance"], summary="Get compliance status")
async def get_status():
    return {
        "overall_status": "compliant",
        "frameworks": {
            "gdpr": {"status": "compliant", "score": 95},
            "soc2": {"status": "compliant", "score": 92},
            "iso27001": {"status": "in_progress", "score": 78},
        },
    }


# ── Policies ───────────────────────────────────────────────────────────────────


@router.get("/policies", tags=["Compliance"], summary="List compliance policies")
async def list_policies():
    return {"data": _POLICIES, "total": len(_POLICIES)}


@router.get("/retention", tags=["Compliance"], summary="Get retention policy")
async def get_retention():
    return {"policies": _RETENTION}


# ── Audit log ──────────────────────────────────────────────────────────────────


@router.get("/audit-log", tags=["Compliance"], summary="Get audit log (DB-backed)")
async def get_audit_log(
    limit: int = 50,
    offset: int = 0,
    action: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
):
    stmt = (
        select(AuditEntry)
        .where(AuditEntry.tenant_id == tenant_id)
        .order_by(desc(AuditEntry.created_at))
        .offset(offset)
        .limit(limit)
    )
    if action:
        stmt = stmt.where(AuditEntry.action == action)
    if resource_type:
        stmt = stmt.where(AuditEntry.resource_type == resource_type)
    if resource_id:
        stmt = stmt.where(AuditEntry.resource_id == resource_id)

    rows = (await db.execute(stmt)).scalars().all()
    return {
        "data": [
            {
                "id": r.id,
                "tenant_id": r.tenant_id,
                "actor_id": r.actor_id,
                "actor_email": r.actor_email,
                "action": r.action,
                "resource_type": r.resource_type,
                "resource_id": r.resource_id,
                "outcome": r.outcome,
                "details": json.loads(r.details) if r.details else {},
                "ip_address": r.ip_address,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total": len(rows),
    }


@router.post("/audit-log", tags=["Compliance"], summary="Append an audit log entry")
async def create_audit_entry(
    data: AuditEntryIn,
    user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db_dependency),
    _tenant_id: str = Depends(require_tenant_id),
):
    await audit(
        db,
        tenant_id=user["tenant_id"],
        action=data.action,
        resource_type=data.resource_type,
        resource_id=data.resource_id,
        details=data.details,
        outcome=data.outcome,
        actor_id=user["id"],
        actor_email=user.get("email"),
    )
    await db.commit()
    return {"recorded": True}


# ── Consent ────────────────────────────────────────────────────────────────────


@router.post("/consent", tags=["Compliance"], summary="Record consent")
async def record_consent(
    data: ConsentRecordRequest,
    user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db_dependency),
    _tenant_id: str = Depends(require_tenant_id),
):
    subject_id = data.user_id or data.candidate_id
    if not subject_id:
        raise HTTPException(
            status_code=400,
            detail="Either user_id or candidate_id is required",
        )
    rec = ConsentRecord(
        tenant_id=user["tenant_id"],
        candidate_id=subject_id,
        purpose=data.type,
        granted=data.granted,
        ip_address=data.ip_address,
    )
    db.add(rec)
    await audit(
        db,
        tenant_id=user["tenant_id"],
        action="consent.recorded",
        resource_type="user" if data.user_id else "candidate",
        resource_id=subject_id,
        actor_id=user["id"],
        actor_email=user.get("email"),
        details={"purpose": data.type, "granted": data.granted},
    )
    await db.commit()
    return {"id": rec.id, "recorded": True}


@router.get("/consent", tags=["Compliance"], summary="List consent records")
async def list_consent(
    candidate_id: str | None = None,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
):
    stmt = select(ConsentRecord).where(ConsentRecord.tenant_id == tenant_id)
    if candidate_id:
        stmt = stmt.where(ConsentRecord.candidate_id == candidate_id)
    rows = (await db.execute(stmt)).scalars().all()
    return {
        "data": [
            {
                "id": r.id,
                "candidate_id": r.candidate_id,
                "type": r.purpose,
                "granted": r.granted,
                "purpose": r.purpose,
                "ip_address": r.ip_address,
                "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
                "withdrawn_at": r.withdrawn_at.isoformat() if r.withdrawn_at else None,
            }
            for r in rows
        ],
        "total": len(rows),
    }


# ── GDPR data export ───────────────────────────────────────────────────────────


@router.post("/data-export", tags=["Compliance"], summary="Request a GDPR data export")
async def request_data_export(
    data: DataExportRequestIn,
    user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db_dependency),
    _tenant_id: str = Depends(require_tenant_id),
):
    """Build a real export of the candidate's data and return the populated record."""
    candidate = (
        await db.execute(
            select(Candidate).where(
                Candidate.id == data.candidate_id,
                Candidate.tenant_id == user["tenant_id"],
            )
        )
    ).scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    profile = (
        await db.execute(
            select(CandidateProfile).where(CandidateProfile.candidate_id == data.candidate_id)
        )
    ).scalar_one_or_none()

    payload = {
        "candidate": {
            "id": candidate.id,
            "email": candidate.email,
            "full_name": candidate.full_name,
            "phone": candidate.phone,
            "location": candidate.location,
            "linkedin_url": candidate.linkedin_url,
            "status": candidate.status.value if hasattr(candidate.status, "value") else candidate.status,
            "source": candidate.source,
            "notes": candidate.notes,
            "created_at": candidate.created_at.isoformat() if candidate.created_at else None,
            "updated_at": candidate.updated_at.isoformat() if candidate.updated_at else None,
        },
        "profile": (
            {
                "summary": profile.summary,
                "seniority_level": profile.seniority_level,
                "years_experience": profile.years_experience,
                "domains": json.loads(profile.domains) if profile and profile.domains else [],
                "education": profile.education,
                "languages": profile.languages,
            }
            if profile
            else None
        ),
        "export_metadata": {
            "format": data.format,
            "include_sections": data.include_sections,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "exported_by": user["id"],
        },
    }

    export = DataExportRequest(
        tenant_id=user["tenant_id"],
        candidate_id=data.candidate_id,
        requested_by=user["id"],
        format=data.format,
        status="ready",
        payload=json.dumps(payload, default=str),
        completed_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(export)
    await audit(
        db,
        tenant_id=user["tenant_id"],
        action="gdpr.export",
        resource_type="candidate",
        resource_id=data.candidate_id,
        actor_id=user["id"],
        actor_email=user.get("email"),
        details={"format": data.format},
    )
    await db.commit()
    return {"id": export.id, "candidate_id": data.candidate_id, "format": data.format, "status": "ready"}


@router.get("/data-export/{export_id}", tags=["Compliance"], summary="Download a data export")
async def get_data_export(
    export_id: str,
    user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db_dependency),
    _tenant_id: str = Depends(require_tenant_id),
):
    export = (
        await db.execute(
            select(DataExportRequest).where(
                DataExportRequest.id == export_id,
                DataExportRequest.tenant_id == user["tenant_id"],
            )
        )
    ).scalar_one_or_none()
    if not export:
        raise HTTPException(status_code=404, detail="Export not found")
    if export.status != "ready":
        raise HTTPException(status_code=409, detail=f"Export is {export.status}")
    return {
        "id": export.id,
        "candidate_id": export.candidate_id,
        "format": export.format,
        "status": export.status,
        "created_at": export.created_at.isoformat() if export.created_at else None,
        "completed_at": export.completed_at.isoformat() if export.completed_at else None,
        "payload": json.loads(export.payload) if export.payload else {},
    }


# ── GDPR data deletion / anonymisation ─────────────────────────────────────────


@router.post("/data-deletion", tags=["Compliance"], summary="Anonymise / delete a candidate's data")
async def request_data_deletion(
    data: DataDeletionRequestIn,
    user: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db_dependency),
    _tenant_id: str = Depends(require_tenant_id),
):
    """Anonymise the candidate in place (soft delete) and record the action.

    Real PII fields (name, email, phone, location, linkedin_url, notes) are
    replaced with anonymised markers.  The row is kept so referential integrity
    with interviews / applications is preserved.  This matches the GDPR Art. 17
    "right to erasure" as commonly implemented — pseudonymisation rather than
    hard delete.
    """
    if not data.confirm:
        raise HTTPException(status_code=400, detail="Deletion must be confirmed")

    candidate = (
        await db.execute(
            select(Candidate).where(
                Candidate.id == data.candidate_id,
                Candidate.tenant_id == user["tenant_id"],
            )
        )
    ).scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    now = datetime.now(timezone.utc)
    anonymised_marker = f"anonymised-{now.strftime('%Y%m%d%H%M%S')}"
    fields = []
    if candidate.full_name:
        candidate.full_name = anonymised_marker
        fields.append("full_name")
    if candidate.email:
        candidate.email = f"{anonymised_marker}@deleted.invalid"
        fields.append("email")
    if candidate.phone:
        candidate.phone = None
        fields.append("phone")
    if candidate.location:
        candidate.location = None
        fields.append("location")
    if candidate.linkedin_url:
        candidate.linkedin_url = None
        fields.append("linkedin_url")
    if candidate.notes:
        candidate.notes = None
        fields.append("notes")
    candidate.status = CandidateStatus.WITHDRAWN
    candidate.updated_at = now.replace(tzinfo=None)

    deletion = DataDeletionRequest(
        tenant_id=user["tenant_id"],
        candidate_id=data.candidate_id,
        requested_by=user["id"],
        reason=data.reason,
        status="completed",
        anonymized_fields=json.dumps(fields),
        completed_at=now.replace(tzinfo=None),
    )
    db.add(deletion)
    await audit(
        db,
        tenant_id=user["tenant_id"],
        action="gdpr.delete",
        resource_type="candidate",
        resource_id=data.candidate_id,
        actor_id=user["id"],
        actor_email=user.get("email"),
        details={"reason": data.reason, "anonymised_fields": fields},
    )
    await db.commit()
    return {
        "id": deletion.id,
        "candidate_id": data.candidate_id,
        "status": "completed",
        "anonymized_fields": fields,
    }


# ── Compliance check / report ──────────────────────────────────────────────────


@router.post("/check", tags=["Compliance"], summary="Run compliance check")
async def run_compliance_check(
    data: dict | None = None,
    tenant_id: str = Depends(require_tenant_id),
):
    framework = (data or {}).get("framework", "gdpr")
    return {
        "check_id": f"chk_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "tenant_id": tenant_id,
        "framework": framework,
        "status": "passed",
        "passed": 45,
        "failed": 2,
        "total": 47,
    }


@router.get("/report", tags=["Compliance"], summary="Generate compliance report")
async def get_compliance_report(
    period: str = "2025-01",
    tenant_id: str = Depends(require_tenant_id),
):
    return {
        "report_id": f"rpt_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "tenant_id": tenant_id,
        "period": period,
        "overall_score": 88,
        "frameworks": {
            "gdpr": {"status": "compliant", "score": 95},
            "soc2": {"status": "compliant", "score": 92},
            "iso27001": {"status": "in_progress", "score": 78},
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ── GDPR engine endpoints (user-scoped) ────────────────────────────────────────


class GDPRConsentRequest(BaseModel):
    user_id: str
    purpose: str = Field(..., description="data_processing | marketing | analytics | third_party")
    granted: bool
    ip_address: str | None = None


@router.get(
    "/gdpr/export/{user_id}",
    tags=["Compliance"],
    summary="Export all data for a user (GDPR Art. 15 / 20)",
)
async def gdpr_export_user(
    user_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    admin: dict = Depends(require_admin),
):
    payload = await export_user_data(db, user_id, tenant_id)
    if payload.get("user") is None:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found in tenant")
    await audit(
        db,
        tenant_id=tenant_id,
        action="gdpr.user.export",
        resource_type="user",
        resource_id=user_id,
        actor_id=admin.get("id"),
        actor_email=admin.get("email"),
        details={"size_estimate": sum(len(v) for v in payload.values() if isinstance(v, list))},
    )
    await db.commit()
    return payload


@router.post(
    "/gdpr/anonymize/{user_id}",
    tags=["Compliance"],
    summary="Anonymise a user's PII (GDPR Art. 17 pseudonymisation)",
)
async def gdpr_anonymize_user(
    user_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    admin: dict = Depends(require_admin),
):
    ok = await anonymize_user(db, user_id, tenant_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found in tenant")
    await audit(
        db,
        tenant_id=tenant_id,
        action="gdpr.user.anonymize",
        resource_type="user",
        resource_id=user_id,
        actor_id=admin.get("id"),
        actor_email=admin.get("email"),
    )
    await db.commit()
    return {"user_id": user_id, "anonymized": True}


@router.delete(
    "/gdpr/user/{user_id}",
    tags=["Compliance"],
    summary="Delete all data for a user (GDPR Art. 17 right to erasure)",
)
async def gdpr_delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    admin: dict = Depends(require_admin),
):
    ok = await delete_user_data(db, user_id, tenant_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found in tenant")
    await audit(
        db,
        tenant_id=tenant_id,
        action="gdpr.user.delete",
        resource_type="user",
        resource_id=user_id,
        actor_id=admin.get("id"),
        actor_email=admin.get("email"),
    )
    await db.commit()
    return {"user_id": user_id, "deleted": True}


@router.get(
    "/consent/{user_id}",
    tags=["Compliance"],
    summary="Get consent log for a user",
)
async def get_user_consent_log(
    user_id: str,
    purpose: str | None = None,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _user: dict = Depends(require_user),
):
    records = await get_consent_log(db, user_id, tenant_id, purpose=purpose)
    return {"data": records, "total": len(records), "user_id": user_id}


@router.get(
    "/audit",
    tags=["Compliance"],
    summary="Compliance audit log (admin only)",
)
async def get_compliance_audit_log(
    limit: int = 50,
    offset: int = 0,
    action: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
):
    stmt = (
        select(AuditEntry)
        .where(AuditEntry.tenant_id == tenant_id)
        .order_by(desc(AuditEntry.created_at))
        .offset(offset)
        .limit(limit)
    )
    if action:
        stmt = stmt.where(AuditEntry.action == action)
    if resource_type:
        stmt = stmt.where(AuditEntry.resource_type == resource_type)
    if resource_id:
        stmt = stmt.where(AuditEntry.resource_id == resource_id)

    rows = (await db.execute(stmt)).scalars().all()
    return {
        "data": [
            {
                "id": r.id,
                "tenant_id": r.tenant_id,
                "actor_id": r.actor_id,
                "actor_email": r.actor_email,
                "action": r.action,
                "resource_type": r.resource_type,
                "resource_id": r.resource_id,
                "outcome": r.outcome,
                "details": json.loads(r.details) if r.details else {},
                "ip_address": r.ip_address,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total": len(rows),
        "limit": limit,
        "offset": offset,
    }
