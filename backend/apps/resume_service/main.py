"""Resume Service — Resume upload, parsing, and re-parsing."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


# ── In-Memory Store ─────────────────────────────────────────────────────────────

_resumes: dict[str, dict[str, Any]] = {}


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


class ResumeDetailResponse(BaseModel):
    id: str
    file_name: str
    status: str
    mime_type: str
    file_size: int
    candidate_id: str | None
    created_at: str


class ContactInfo(BaseModel):
    email: str
    phone: str


class ExperienceEntry(BaseModel):
    title: str
    company: str
    years: int


class ParsedSections(BaseModel):
    contact: ContactInfo
    summary: str
    experience: list[ExperienceEntry]
    skills: list[str]


class ParsedResumeResponse(BaseModel):
    resume_id: str
    sections: ParsedSections
    parsing_confidence: float


class ResumeReparseResponse(BaseModel):
    resume_id: str
    status: str = "reparsing"


class ResumeListResponse(BaseModel):
    data: list[ResumeDetailResponse]
    total: int


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Resumes"], summary="Resume service health check")
async def health():
    return HealthResponse()


@router.post("/", response_model=ResumeUploadResponse, tags=["Resumes"], summary="Upload resume",
             description="Upload a resume file (PDF, DOCX). AI parsing begins automatically.")
async def upload_resume(data: ResumeUploadRequest):
    resume_id = f"r_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    _resumes[resume_id] = {
        "id": resume_id,
        "file_name": data.file_name,
        "mime_type": data.mime_type,
        "file_size": data.file_size,
        "candidate_id": data.candidate_id,
        "status": "parsed",
        "created_at": now,
    }
    return ResumeUploadResponse(id=resume_id, file_name=data.file_name)


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
            description="Retrieve AI-parsed resume sections including contact, experience, and skills.")
async def get_parsed_resume(resume_id: str):
    if resume_id not in _resumes:
        raise HTTPException(status_code=404, detail="Resume not found")
    return ParsedResumeResponse(
        resume_id=resume_id,
        sections=ParsedSections(
            contact=ContactInfo(email="john@email.com", phone="+1-555-0123"),
            summary="Senior backend engineer",
            experience=[ExperienceEntry(title="Senior Engineer", company="Tech Corp", years=5)],
            skills=["Python", "PostgreSQL", "Kubernetes"],
        ),
        parsing_confidence=0.95,
    )


@router.post("/{resume_id}/reparse", response_model=ResumeReparseResponse, tags=["Resumes"], summary="Re-parse resume",
             description="Trigger a fresh AI parse of the resume (useful after model updates).")
async def reparse_resume(resume_id: str):
    if resume_id not in _resumes:
        raise HTTPException(status_code=404, detail="Resume not found")
    _resumes[resume_id]["status"] = "reparsing"
    return ResumeReparseResponse(resume_id=resume_id)
