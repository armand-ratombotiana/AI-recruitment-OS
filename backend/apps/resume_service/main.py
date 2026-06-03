"""Resume Service — Resume upload, parsing, and re-parsing.

Real PDF and DOCX parsing is performed by ``parser.parse_resume`` and the
structured output is stored in memory so subsequent ``/parsed`` reads return
the same data instead of canned placeholders.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from apps.resume_service.parser import parse_resume


# ── In-Memory Store ─────────────────────────────────────────────────────────────

_resumes: dict[str, dict[str, Any]] = {}
_parsed: dict[str, dict[str, Any]] = {}


# ── Request Models ──────────────────────────────────────────────────────────────

class ResumeUploadRequest(BaseModel):
    file_name: str = Field(..., description="Original file name")
    mime_type: str = Field(default="application/pdf", description="MIME type")
    file_size: int = Field(default=0, description="File size in bytes")
    candidate_id: str | None = Field(None, description="Associated candidate ID")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "resume"


class ResumeUploadResponse(BaseModel):
    id: str
    file_name: str
    status: str = "uploaded"
    created: bool = True
    parsing_confidence: float = 0.0
    extracted_email: str | None = None


class ResumeDetailResponse(BaseModel):
    id: str
    file_name: str
    status: str
    mime_type: str
    file_size: int
    candidate_id: str | None
    created_at: str


class ContactInfo(BaseModel):
    email: str | None = None
    phone: str | None = None


class ExperienceEntry(BaseModel):
    title: str
    company: str
    years: int


class ParsedSections(BaseModel):
    contact: ContactInfo
    summary: str | None = None
    experience: list[ExperienceEntry] = []
    skills: list[str] = []
    raw_sections: dict[str, str] = {}


class ParsedResumeResponse(BaseModel):
    resume_id: str
    sections: ParsedSections
    parsing_confidence: float
    text_preview: str | None = None


class ResumeReparseResponse(BaseModel):
    resume_id: str
    status: str = "reparsing"


class ResumeListResponse(BaseModel):
    data: list[ResumeDetailResponse]
    total: int


# ── Helpers ─────────────────────────────────────────────────────────────────────


def _extract_skills_from_sections(sections: dict[str, str]) -> list[str]:
    """Pick out a list of skills from the Skills section (comma- or pipe-separated)."""
    raw = sections.get("Skills") or sections.get("Technical Skills") or sections.get("Core Competencies") or ""
    if not raw:
        return []
    parts: list[str] = []
    for chunk in raw.replace("|", ",").split(","):
        s = chunk.strip().strip("•").strip()
        if s and len(s) < 60 and s.lower() not in {p.lower() for p in parts}:
            parts.append(s)
    return parts[:50]


def _build_parsed_sections(parsed: dict[str, Any]) -> ParsedSections:
    raw = parsed.get("sections", {}) or {}
    return ParsedSections(
        contact=ContactInfo(email=parsed.get("email"), phone=parsed.get("phone")),
        summary=(raw.get("Summary") or raw.get("Objective") or raw.get("Profile") or "").strip() or None,
        skills=_extract_skills_from_sections(raw),
        raw_sections={k: v[:500] for k, v in raw.items()},
    )


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Resumes"], summary="Resume service health check")
async def health():
    return HealthResponse()


@router.post("/", response_model=ResumeUploadResponse, tags=["Resumes"], summary="Upload resume (metadata-only)",
             description="Register a resume by metadata only. Use ``POST /upload`` to upload a real file.")
async def upload_resume(data: ResumeUploadRequest):
    resume_id = f"r_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    _resumes[resume_id] = {
        "id": resume_id,
        "file_name": data.file_name,
        "mime_type": data.mime_type,
        "file_size": data.file_size,
        "candidate_id": data.candidate_id,
        "status": "registered",
        "created_at": now,
    }
    return ResumeUploadResponse(id=resume_id, file_name=data.file_name)


@router.post(
    "/upload",
    response_model=ResumeUploadResponse,
    tags=["Resumes"],
    summary="Upload a resume file (multipart)",
    description=(
        "Accepts a PDF, DOCX, or TXT file via multipart form-data.  The file "
        "is parsed immediately with PyMuPDF (PDF) or python-docx (DOCX) and "
        "the structured output is stored for later retrieval via "
        "``GET /{id}/parsed``."
    ),
)
async def upload_resume_file(
    file: UploadFile = File(..., description="Resume file (PDF, DOCX, or TXT)"),
    candidate_id: str | None = Form(None, description="Optional candidate id to associate with this resume"),
):
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(contents) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")

    parsed = parse_resume(contents, mime_type=file.content_type or "", filename=file.filename)
    parsed_dict = parsed.to_dict()

    resume_id = f"r_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    _resumes[resume_id] = {
        "id": resume_id,
        "file_name": file.filename,
        "mime_type": file.content_type or "application/octet-stream",
        "file_size": len(contents),
        "candidate_id": candidate_id,
        "status": "parsed" if parsed.confidence > 0 else "stored",
        "created_at": now,
    }
    _parsed[resume_id] = parsed_dict

    return ResumeUploadResponse(
        id=resume_id,
        file_name=file.filename,
        status=_resumes[resume_id]["status"],
        created=True,
        parsing_confidence=parsed.confidence,
        extracted_email=parsed.email,
    )


@router.get("/", response_model=ResumeListResponse, tags=["Resumes"], summary="List all resumes")
async def list_resumes():
    items = [ResumeDetailResponse(**r) for r in _resumes.values()]
    return ResumeListResponse(data=items, total=len(items))


@router.get("/{resume_id}", response_model=ResumeDetailResponse, tags=["Resumes"], summary="Get resume metadata")
async def get_resume(resume_id: str):
    if resume_id not in _resumes:
        raise HTTPException(status_code=404, detail="Resume not found")
    return ResumeDetailResponse(**_resumes[resume_id])


@router.get("/{resume_id}/parsed", response_model=ParsedResumeResponse, tags=["Resumes"], summary="Get parsed resume data",
            description="Retrieve the structured parse of a previously uploaded resume.")
async def get_parsed_resume(resume_id: str):
    if resume_id not in _resumes:
        raise HTTPException(status_code=404, detail="Resume not found")
    if resume_id not in _parsed:
        raise HTTPException(
            status_code=409,
            detail="Resume was registered but no file was uploaded; POST a file to /upload first.",
        )
    parsed = _parsed[resume_id]
    return ParsedResumeResponse(
        resume_id=resume_id,
        sections=_build_parsed_sections(parsed),
        parsing_confidence=parsed.get("confidence", 0.0),
        text_preview=parsed.get("text_preview"),
    )


@router.post("/{resume_id}/reparse", response_model=ResumeReparseResponse, tags=["Resumes"], summary="Re-parse resume",
             description=("Triggers a re-parse of the stored resume.  Since we currently "
                          "do not persist raw file bytes, the original parse is returned."))
async def reparse_resume(resume_id: str):
    if resume_id not in _resumes:
        raise HTTPException(status_code=404, detail="Resume not found")
    _resumes[resume_id]["status"] = "reparsed"
    return ResumeReparseResponse(resume_id=resume_id)
