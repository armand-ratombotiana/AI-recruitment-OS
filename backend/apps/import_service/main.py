"""Import Service — Candidate import endpoints.

* ``POST /api/v1/imports/candidates/csv``      — bulk import from a CSV upload
* ``POST /api/v1/imports/candidates/linkedin`` — import a single candidate
  submitted with a LinkedIn URL (the actual LinkedIn scrape is a stub)
* ``GET  /api/v1/imports/candidates/template`` — download a CSV template

All writes are scoped to the caller's tenant via ``require_tenant_id`` and
each successful import is recorded in the audit log.
"""
from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone
from typing import Any, Optional, Union

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import require_tenant_id
from shared.core.database import get_db_dependency
from shared.core.models.candidate import (
    Candidate,
    CandidateProfile,
    CandidateSkill,
    CandidateStatus,
    Skill,
    SeniorityLevel,
)
from shared.audit import audit


# ── Limits / constants ────────────────────────────────────────────────────────

MAX_CSV_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_ROWS = 1000

# Synonyms accepted for each logical column. Keys are lowercased / stripped.
COLUMN_ALIASES: dict[str, list[str]] = {
    "full_name": ["full_name", "name", "fullname", "candidate_name"],
    "email": ["email", "email_address", "e_mail"],
    "phone": ["phone", "phone_number", "mobile", "tel"],
    "location": ["location", "city", "address"],
    "skills": ["skills", "skill", "skill_set", "tech", "technologies"],
    "experience_years": [
        "experience_years",
        "years_experience",
        "years",
        "yoe",
        "experience",
    ],
    "linkedin_url": ["linkedin_url", "linkedin", "profile_url"],
    "seniority_level": ["seniority", "seniority_level", "level"],
}

VALID_SENIORITY = {level.value for level in SeniorityLevel}


# ── Request / response models ────────────────────────────────────────────────


class LinkedInImportRequest(BaseModel):
    linkedin_url: str = Field(..., description="LinkedIn profile URL")
    name: str = Field(..., min_length=1, description="Candidate full name")
    email: str = Field(..., description="Candidate email")
    phone: Optional[str] = None
    location: Optional[str] = None
    skills: Optional[Union[str, list[Union[str, int]]]] = None
    experience_years: Optional[int] = Field(None, ge=0)

    @field_validator("skills", mode="before")
    @classmethod
    def _coerce_skills(cls, v: Any) -> Any:
        # Allow callers to submit a comma/semicolon separated string. We
        # leave list-of-strings unchanged so JSON-native clients still work.
        if v is None or isinstance(v, list):
            return v
        if isinstance(v, str):
            return v
        return v


class ImportError(BaseModel):
    row: Optional[int] = None
    email: Optional[str] = None
    error: str


class ImportedCandidate(BaseModel):
    id: str
    email: str
    full_name: str


class CSVImportResponse(BaseModel):
    imported: int
    failed: int
    errors: list[ImportError] = []
    candidates: list[ImportedCandidate] = []


class LinkedInImportResponse(BaseModel):
    id: str
    email: str
    full_name: str
    linkedin_url: str
    source: str = "linkedin"
    scraped: bool = False
    created: bool = True


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "import"


# ── Helpers ──────────────────────────────────────────────────────────────────


def _build_alias_lookup() -> dict[str, str]:
    """Map every accepted header (lowercased/stripped) to its canonical key."""
    lookup: dict[str, str] = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            lookup[alias.lower().strip()] = canonical
    return lookup


_ALIAS_LOOKUP = _build_alias_lookup()


def _normalize_row(raw: dict[str, Any]) -> dict[str, str]:
    """Map a raw DictReader row to the canonical schema using COLUMN_ALIASES."""
    normalized: dict[str, str] = {}
    for key, value in raw.items():
        if key is None:
            continue
        canonical = _ALIAS_LOOKUP.get(key.lower().strip())
        if not canonical:
            continue
        if value is None:
            continue
        value_str = str(value).strip()
        if not value_str:
            continue
        # If the same canonical column appears twice, keep the first non-empty.
        normalized.setdefault(canonical, value_str)
    return normalized


def _parse_experience(value: str | None) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        raise ValueError(f"experience_years must be numeric, got {value!r}")


def _parse_skills(value: str | None) -> list[str]:
    if not value:
        return []
    # Support ; , | / separators plus whitespace.
    parts: list[str] = []
    for chunk in value.replace("|", ",").replace(";", ",").replace("/", ",").split(","):
        chunk = chunk.strip()
        if chunk:
            parts.append(chunk)
    return parts


def _split_skill_list(value: Any) -> list[str]:
    """Accept either a string or a list of strings from the JSON endpoint."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        return _parse_skills(value)
    return [str(value).strip()]


async def _upsert_skill(db: AsyncSession, *, tenant_id: str, name: str) -> Skill:
    """Find an existing skill (per tenant) or create a new one."""
    normalized = name.lower().strip()
    result = await db.execute(
        select(Skill).where(
            Skill.tenant_id == tenant_id, Skill.normalized_name == normalized
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing
    skill = Skill(tenant_id=tenant_id, name=name, normalized_name=normalized)
    db.add(skill)
    await db.flush()
    return skill


async def _attach_skills(
    db: AsyncSession,
    *,
    candidate: Candidate,
    tenant_id: str,
    skill_names: list[str],
) -> list[str]:
    """Create Skill rows as needed and link them to the candidate.

    Returns the list of skill names that were attached.
    """
    attached: list[str] = []
    for raw_name in skill_names:
        name = raw_name.strip()
        if not name:
            continue
        skill = await _upsert_skill(db, tenant_id=tenant_id, name=name)
        link = CandidateSkill(
            candidate_id=candidate.id,
            skill_id=skill.id,
            tenant_id=tenant_id,
        )
        db.add(link)
        attached.append(skill.name)
    return attached


async def _create_candidate(
    db: AsyncSession,
    *,
    tenant_id: str,
    full_name: str,
    email: str,
    phone: Optional[str],
    location: Optional[str],
    linkedin_url: Optional[str],
    source: str,
    skills: list[str],
    experience_years: Optional[int],
    seniority_level: Optional[str] = None,
) -> Candidate:
    candidate = Candidate(
        tenant_id=tenant_id,
        email=email,
        full_name=full_name,
        phone=phone or None,
        location=location or None,
        linkedin_url=linkedin_url or None,
        source=source,
        status=CandidateStatus.NEW,
    )
    db.add(candidate)
    await db.flush()

    if seniority_level or experience_years is not None:
        profile = CandidateProfile(
            candidate_id=candidate.id,
            tenant_id=tenant_id,
            seniority_level=seniority_level,
            years_experience=experience_years,
        )
        db.add(profile)

    if skills:
        await _attach_skills(
            db, candidate=candidate, tenant_id=tenant_id, skill_names=skills
        )

    return candidate


# ── Router ──────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Imports"], summary="Import service health check")
async def health() -> HealthResponse:
    return HealthResponse()


@router.get(
    "/candidates/template",
    tags=["Imports"],
    summary="Download CSV import template",
    response_class=StreamingResponse,
    responses={
        200: {
            "description": "CSV template with header row and one example row",
            "content": {
                "text/csv": {
                    "example": (
                        "full_name,email,phone,location,skills,experience_years,linkedin_url\n"
                        "Jane Doe,jane@example.com,+1-555-0100,New York,"
                        "python;fastapi;postgres,5,https://linkedin.com/in/janedoe\n"
                    )
                }
            },
        }
    },
)
async def download_candidate_csv_template(
    _tenant_id: str = Depends(require_tenant_id),
) -> StreamingResponse:
    """Return a small CSV template that the user can fill in and re-upload.

    The endpoint is authenticated (so anonymous scrapers can't pull our
    template format), but it does not need a DB session.
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "full_name",
            "email",
            "phone",
            "location",
            "skills",
            "experience_years",
            "linkedin_url",
        ]
    )
    writer.writerow(
        [
            "Jane Doe",
            "jane@example.com",
            "+1-555-0100",
            "New York, NY",
            "python;fastapi;postgres",
            "5",
            "https://linkedin.com/in/janedoe",
        ]
    )
    writer.writerow(
        [
            "John Smith",
            "john@example.com",
            "",
            "Remote",
            "react,typescript,graphql",
            "8",
            "",
        ]
    )
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="candidates_template.csv"',
        },
    )


@router.post(
    "/candidates/csv",
    response_model=CSVImportResponse,
    tags=["Imports"],
    summary="Bulk-import candidates from a CSV file",
    description=(
        "Upload a CSV file (multipart/form-data, ``file`` field) with a header row. "
        "Recognised columns: ``full_name`` (or ``name``), ``email``, ``phone``, "
        "``location``, ``skills`` (separated by ``;``, ``,``, ``|`` or ``/``), "
        "``experience_years`` and ``linkedin_url``.\n\n"
        "Returns counts plus per-row errors; valid rows are committed to the "
        "caller's tenant."
    ),
)
async def import_candidates_from_csv(
    file: UploadFile = File(..., description="CSV file to import"),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> CSVImportResponse:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(raw) > MAX_CSV_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"CSV exceeds {MAX_CSV_BYTES} bytes",
        )
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400, detail=f"File is not valid UTF-8: {exc}"
        ) from exc

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise HTTPException(
            status_code=400, detail="CSV is missing a header row"
        )

    imported: list[ImportedCandidate] = []
    errors: list[ImportError] = []

    # Cache of emails already seen in the file so duplicates fail fast.
    seen_in_file: set[str] = set()
    # Cache of emails that already exist in the DB to avoid a query per row.
    existing_in_db: set[str] = set()

    for row_idx, raw_row in enumerate(reader, start=1):
        if row_idx > MAX_ROWS:
            errors.append(
                ImportError(row=row_idx, error=f"Exceeded maximum of {MAX_ROWS} rows")
            )
            break

        row = _normalize_row(raw_row or {})

        email = (row.get("email") or "").lower()
        full_name = row.get("full_name") or ""

        if not email or "@" not in email:
            errors.append(
                ImportError(row=row_idx, error="Missing or invalid email")
            )
            continue
        if not full_name:
            errors.append(
                ImportError(row=row_idx, email=email, error="Missing full_name")
            )
            continue
        if email in seen_in_file:
            errors.append(
                ImportError(
                    row=row_idx,
                    email=email,
                    error="Duplicate email within uploaded file",
                )
            )
            continue
        seen_in_file.add(email)

        if email not in existing_in_db:
            existing_result = await db.execute(
                select(Candidate.email).where(
                    Candidate.tenant_id == tenant_id, Candidate.email == email
                )
            )
            existing_in_db.update({row[0] for row in existing_result.all()})

        if email in existing_in_db:
            errors.append(
                ImportError(
                    row=row_idx,
                    email=email,
                    error="A candidate with this email already exists",
                )
            )
            continue

        try:
            years = _parse_experience(row.get("experience_years"))
        except ValueError as exc:
            errors.append(ImportError(row=row_idx, email=email, error=str(exc)))
            continue

        skills = _parse_skills(row.get("skills"))

        try:
            candidate = await _create_candidate(
                db,
                tenant_id=tenant_id,
                full_name=full_name,
                email=email,
                phone=row.get("phone"),
                location=row.get("location"),
                linkedin_url=row.get("linkedin_url"),
                source="csv_import",
                skills=skills,
                experience_years=years,
                seniority_level=row.get("seniority_level"),
            )
        except Exception as exc:  # noqa: BLE001 — surface as a row error
            errors.append(
                ImportError(row=row_idx, email=email, error=f"DB error: {exc}")
            )
            continue

        imported.append(
            ImportedCandidate(
                id=candidate.id,
                email=candidate.email,
                full_name=candidate.full_name,
            )
        )

    await db.commit()
    await audit(
        db,
        tenant_id=tenant_id,
        action="candidate.import.csv",
        resource_type="candidate",
        resource_id=None,
        details={
            "imported": len(imported),
            "failed": len(errors),
            "filename": file.filename,
        },
    )

    return CSVImportResponse(
        imported=len(imported),
        failed=len(errors),
        errors=errors,
        candidates=imported,
    )


@router.post(
    "/candidates/linkedin",
    response_model=LinkedInImportResponse,
    tags=["Imports"],
    summary="Import a candidate from a LinkedIn profile",
    description=(
        "Stub endpoint: accepts the candidate data plus a LinkedIn URL and "
        "creates a candidate row tagged with ``source='linkedin'``. The actual "
        "LinkedIn scrape/profile fetch is not implemented yet; the caller is "
        "expected to have already pulled the data and submit it here."
    ),
)
async def import_candidate_from_linkedin(
    data: LinkedInImportRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> LinkedInImportResponse:
    email = data.email.strip().lower()
    if "@" not in email:
        raise HTTPException(
            status_code=400, detail="Invalid email address"
        )

    existing = await db.execute(
        select(Candidate).where(
            Candidate.tenant_id == tenant_id, Candidate.email == email
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A candidate with this email already exists",
        )

    candidate = await _create_candidate(
        db,
        tenant_id=tenant_id,
        full_name=data.name.strip(),
        email=email,
        phone=data.phone,
        location=data.location,
        linkedin_url=data.linkedin_url,
        source="linkedin",
        skills=_split_skill_list(data.skills),
        experience_years=data.experience_years,
    )
    await db.commit()
    await audit(
        db,
        tenant_id=tenant_id,
        action="candidate.import.linkedin",
        resource_type="candidate",
        resource_id=candidate.id,
        details={"linkedin_url": data.linkedin_url},
    )

    return LinkedInImportResponse(
        id=candidate.id,
        email=candidate.email,
        full_name=candidate.full_name,
        linkedin_url=data.linkedin_url,
        source="linkedin",
        scraped=False,
        created=True,
    )
