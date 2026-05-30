"""Compliance Service — GDPR/SOC2 compliance, policy management, audit logging, consent tracking, and data retention."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field


# ── Request Models ──────────────────────────────────────────────────────────────

class PolicyCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Policy name")
    type: str = Field(..., description="data_retention | access_control | encryption | audit | consent | data_processing")
    description: str = Field(default="", description="Policy description")
    rules: dict = Field(default_factory=dict, description="Policy rules configuration")

    model_config = {"json_schema_extra": {"examples": [
        {"name": "GDPR Data Retention", "type": "data_retention",
         "description": "Auto-delete candidate data after 2 years", "rules": {"retention_days": 730}}
    ]}}


class PolicyUpdateRequest(BaseModel):
    name: str | None = Field(None, description="Policy name")
    description: str | None = Field(None, description="Policy description")
    status: str | None = Field(None, description="active | inactive | archived")
    rules: dict | None = Field(None, description="Policy rules configuration")


class ConsentRequest(BaseModel):
    candidate_id: str = Field(..., description="Candidate ID")
    consent_type: str = Field(..., description="data_processing | marketing | third_party_sharing | storage")
    granted: bool = Field(default=True, description="Whether consent is granted")
    purpose: str | None = Field(None, description="Purpose of data processing")
    expiry: str | None = Field(None, description="Consent expiry date (ISO 8601)")


class ConsentRevokeRequest(BaseModel):
    consent_id: str = Field(..., description="Consent record to revoke")
    reason: str | None = Field(None, description="Reason for revocation")


class DataExportRequest(BaseModel):
    candidate_id: str = Field(..., description="Candidate to export data for")
    format: str = Field(default="json", description="json | csv")


class DataDeletionRequest(BaseModel):
    candidate_id: str = Field(..., description="Candidate to delete data for")
    reason: str = Field(default="user_request", description="Reason: user_request | retention_policy | compliance_order")
    confirm: bool = Field(..., description="Confirmation flag required for deletion")


class RetentionRuleRequest(BaseModel):
    data_type: str = Field(..., description="Type of data (candidate_resume | interview_recording | audit_log)")
    retention_days: int = Field(..., ge=1, description="Number of days to retain data")
    action: str = Field(default="delete", description="delete | anonymize | archive")
    auto_apply: bool = Field(default=True, description="Automatically apply retention rule")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "compliance"


class PolicySummary(BaseModel):
    id: str
    name: str
    status: str
    type: str
    created_at: str


class PolicyListResponse(BaseModel):
    data: list[PolicySummary]
    total: int


class PolicyDetailResponse(BaseModel):
    id: str
    name: str
    type: str
    description: str
    status: str
    rules: dict
    created_at: str
    updated_at: str


class PolicyCreateResponse(BaseModel):
    id: str
    created: bool = True


class PolicyUpdateResponse(BaseModel):
    id: str
    updated: bool = True


class PolicyDeleteResponse(BaseModel):
    id: str
    deleted: bool = True


class ConsentRecord(BaseModel):
    id: str
    candidate_id: str
    consent_type: str
    granted: bool
    purpose: str | None = None
    recorded_at: str
    expiry: str | None = None


class ConsentResponse(BaseModel):
    id: str
    recorded: bool = True


class ConsentListResponse(BaseModel):
    data: list[ConsentRecord]
    total: int


class ConsentRevokeResponse(BaseModel):
    id: str
    revoked: bool = True


class AuditLogEntry(BaseModel):
    id: str
    action: str
    actor: str
    resource_type: str
    resource_id: str
    details: dict = Field(default_factory=dict)
    timestamp: str


class AuditLogResponse(BaseModel):
    data: list[AuditLogEntry]
    total: int


class DataExportResponse(BaseModel):
    export_id: str
    status: str = "processing"
    estimated_completion: str


class DataDeletionResponse(BaseModel):
    deletion_id: str
    status: str = "scheduled"
    scheduled_date: str


class RetentionRuleResponse(BaseModel):
    id: str
    data_type: str
    retention_days: int
    action: str
    auto_apply: bool
    last_applied: str | None = None


class RetentionRuleListResponse(BaseModel):
    data: list[RetentionRuleResponse]
    total: int


class RetentionRuleCreateResponse(BaseModel):
    id: str
    created: bool = True


class ComplianceStatusResponse(BaseModel):
    gdpr_compliant: bool
    soc2_compliant: bool
    last_audit: str
    active_policies: int
    pending_reviews: int
    data_retention_days: int
    consents_active: int
    pending_deletions: int


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Compliance"], summary="Compliance service health check")
async def health():
    return HealthResponse()


# ── Policy Management ──────────────────────────────────────────────────────────

@router.get("/policies", response_model=PolicyListResponse, tags=["Compliance"], summary="List compliance policies")
async def list_policies():
    return PolicyListResponse(data=[
        PolicySummary(id="p1", name="GDPR Data Retention", status="active", type="data_retention", created_at="2024-01-01"),
        PolicySummary(id="p2", name="SOC2 Access Control", status="active", type="access_control", created_at="2024-01-01"),
        PolicySummary(id="p3", name="Consent Management", status="active", type="consent", created_at="2024-06-15"),
        PolicySummary(id="p4", name="Data Processing Agreement", status="active", type="data_processing", created_at="2024-03-10"),
    ], total=4)


@router.get("/policies/{policy_id}", response_model=PolicyDetailResponse, tags=["Compliance"],
            summary="Get policy details")
async def get_policy(policy_id: str):
    return PolicyDetailResponse(
        id=policy_id, name="GDPR Data Retention", type="data_retention",
        description="Auto-delete candidate data after retention period",
        status="active", rules={"retention_days": 730, "action": "delete", "data_types": ["resume", "profile"]},
        created_at="2024-01-01T00:00:00Z", updated_at="2025-01-01T00:00:00Z",
    )


@router.post("/policies", response_model=PolicyCreateResponse, tags=["Compliance"],
             summary="Create compliance policy")
async def create_policy(data: PolicyCreateRequest):
    return PolicyCreateResponse(id="p_new")


@router.put("/policies/{policy_id}", response_model=PolicyUpdateResponse, tags=["Compliance"],
            summary="Update compliance policy")
async def update_policy(policy_id: str, data: PolicyUpdateRequest):
    return PolicyUpdateResponse(id=policy_id)


@router.delete("/policies/{policy_id}", response_model=PolicyDeleteResponse, tags=["Compliance"],
               summary="Delete compliance policy")
async def delete_policy(policy_id: str):
    return PolicyDeleteResponse(id=policy_id)


# ── Consent Tracking ───────────────────────────────────────────────────────────

@router.get("/consent", response_model=ConsentListResponse, tags=["Compliance"],
            summary="List consent records",
            description="Retrieve all consent records, optionally filtered by candidate.")
async def list_consents(candidate_id: str | None = None):
    return ConsentListResponse(data=[
        ConsentRecord(id="c1", candidate_id="cand_1", consent_type="data_processing", granted=True,
                      purpose="Recruitment evaluation", recorded_at="2025-01-15T10:00:00Z", expiry="2027-01-15"),
        ConsentRecord(id="c2", candidate_id="cand_1", consent_type="marketing", granted=False,
                      purpose="Newsletter", recorded_at="2025-01-15T10:00:00Z"),
    ], total=2)


@router.post("/consent", response_model=ConsentResponse, tags=["Compliance"], summary="Record consent",
             description="Record a candidate's consent for data processing or sharing.")
async def record_consent(data: ConsentRequest):
    return ConsentResponse(id="consent_new")


@router.post("/consent/revoke", response_model=ConsentRevokeResponse, tags=["Compliance"],
             summary="Revoke consent",
             description="Revoke a previously granted consent record.")
async def revoke_consent(data: ConsentRevokeRequest):
    return ConsentRevokeResponse(id=data.consent_id)


# ── Audit Logging ──────────────────────────────────────────────────────────────

@router.get("/audit-log", response_model=AuditLogResponse, tags=["Compliance"], summary="Get audit log",
            description="Retrieve the compliance audit trail of system actions.")
async def get_audit_log(limit: int = 50):
    return AuditLogResponse(data=[
        AuditLogEntry(id="a1", action="candidate.created", actor="user@acme.com",
                      resource_type="candidate", resource_id="c1", details={"source": "manual"},
                      timestamp="2025-01-20T10:00:00Z"),
        AuditLogEntry(id="a2", action="interview.completed", actor="ai_agent",
                      resource_type="interview", resource_id="i1", details={"score": 0.87},
                      timestamp="2025-01-20T11:00:00Z"),
        AuditLogEntry(id="a3", action="consent.granted", actor="candidate@email.com",
                      resource_type="consent", resource_id="c1", details={"type": "data_processing"},
                      timestamp="2025-01-20T12:00:00Z"),
        AuditLogEntry(id="a4", action="data.exported", actor="hr@acme.com",
                      resource_type="candidate", resource_id="c2", details={"format": "json"},
                      timestamp="2025-01-20T13:00:00Z"),
    ], total=4)


# ── Data Export & Deletion ─────────────────────────────────────────────────────

@router.post("/data-export", response_model=DataExportResponse, tags=["Compliance"], summary="Export candidate data",
             description="Generate a GDPR-compliant data export for a candidate.")
async def export_data(data: DataExportRequest):
    return DataExportResponse(export_id="export_new", estimated_completion="2025-01-20T10:05:00Z")


@router.post("/data-deletion", response_model=DataDeletionResponse, tags=["Compliance"],
             summary="Request data deletion",
             description="Initiate a GDPR right-to-be-forgotten deletion request.")
async def request_data_deletion(data: DataDeletionRequest):
    return DataDeletionResponse(deletion_id="del_new", scheduled_date="2025-01-21T00:00:00Z")


# ── Data Retention Rules ───────────────────────────────────────────────────────

@router.get("/retention-rules", response_model=RetentionRuleListResponse, tags=["Compliance"],
            summary="List retention rules")
async def list_retention_rules():
    return RetentionRuleListResponse(data=[
        RetentionRuleResponse(id="rr1", data_type="candidate_resume", retention_days=730,
                              action="delete", auto_apply=True, last_applied="2025-01-01"),
        RetentionRuleResponse(id="rr2", data_type="interview_recording", retention_days=365,
                              action="anonymize", auto_apply=True, last_applied="2025-01-01"),
        RetentionRuleResponse(id="rr3", data_type="audit_log", retention_days=2555,
                              action="archive", auto_apply=False),
    ], total=3)


@router.post("/retention-rules", response_model=RetentionRuleCreateResponse, tags=["Compliance"],
             summary="Create retention rule")
async def create_retention_rule(data: RetentionRuleRequest):
    return RetentionRuleCreateResponse(id="rr_new")


# ── Compliance Status ──────────────────────────────────────────────────────────

@router.get("/status", response_model=ComplianceStatusResponse, tags=["Compliance"], summary="Get compliance status",
            description="Overview of current compliance posture (GDPR, SOC2).")
async def get_compliance_status():
    return ComplianceStatusResponse(
        gdpr_compliant=True, soc2_compliant=True, last_audit="2025-01-15",
        active_policies=4, pending_reviews=1, data_retention_days=730,
        consents_active=142, pending_deletions=3,
    )
