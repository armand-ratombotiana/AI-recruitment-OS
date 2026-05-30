"""Resume Service — Resume upload, parsing, and re-parsing."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field


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


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Resumes"], summary="Resume service health check")
async def health():
    return HealthResponse()


@router.post("/upload", response_model=ResumeUploadResponse, tags=["Resumes"], summary="Upload resume",
             description="Upload a resume file (PDF, DOCX). AI parsing begins automatically.")
async def upload_resume():
    return ResumeUploadResponse(id="r_new", file_name="resume.pdf")


@router.get("/{resume_id}", response_model=ResumeDetailResponse, tags=["Resumes"], summary="Get resume metadata")
async def get_resume(resume_id: str):
    return ResumeDetailResponse(id=resume_id, file_name="resume.pdf", status="parsed", mime_type="application/pdf")


@router.get("/{resume_id}/parsed", response_model=ParsedResumeResponse, tags=["Resumes"], summary="Get parsed resume data",
            description="Retrieve AI-parsed resume sections including contact, experience, and skills.")
async def get_parsed_resume(resume_id: str):
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
    return ResumeReparseResponse(resume_id=resume_id)
