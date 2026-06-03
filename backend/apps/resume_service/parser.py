"""Resume parser — real PDF and DOCX text extraction.

Uses PyMuPDF (fitz) for PDFs and python-docx for DOCX files.  Falls back to
plain UTF-8 decode for unknown / unparsable files so the upload endpoint
never crashes the caller.
"""
from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger("resume_parser")

# Compiled once, reused for every call.
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_PHONE_RE = re.compile(
    r"(?:\+?\d{1,3}[\s\-]?)?(?:\(?\d{2,4}\)?[\s\-]?)?\d{3,4}[\s\-]?\d{3,4}"
)
_SECTION_HEADERS = {
    "summary", "objective", "profile", "about",
    "experience", "work experience", "professional experience", "employment",
    "education", "academic", "academic background",
    "skills", "technical skills", "core competencies",
    "projects", "certifications", "awards", "publications",
    "languages", "interests",
}


@dataclass
class ParsedResume:
    text: str
    email: str | None
    phone: str | None
    sections: dict[str, str] = field(default_factory=dict)
    confidence: float = 0.0

    def to_dict(self) -> dict:
        return {
            "text_preview": self.text[:500] if self.text else "",
            "email": self.email,
            "phone": self.phone,
            "sections": self.sections,
            "confidence": round(self.confidence, 2),
        }


def _parse_sections(text: str) -> dict[str, str]:
    """Split the resume text into sections by header keywords."""
    sections: dict[str, list[str]] = {}
    current = "_header"
    sections[current] = []

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        # A header is a short, title-cased line that matches a known keyword.
        if len(line) < 60 and line.lower() in _SECTION_HEADERS:
            current = line.lower()
            sections.setdefault(current, [])
        else:
            sections.setdefault(current, []).append(line)

    # Join each section, drop the "header" bucket if it has no content.
    out: dict[str, str] = {}
    for k, lines in sections.items():
        joined = "\n".join(lines).strip()
        if joined and k != "_header":
            out[k.title()] = joined[:2000]  # cap each section
    return out


def _extract_contact(text: str) -> tuple[str | None, str | None]:
    """Pull the first plausible email and phone from the text."""
    email_m = _EMAIL_RE.search(text)
    # Phone regex is greedy; require at least 7 digits to avoid catching years.
    phone_m = None
    for m in _PHONE_RE.finditer(text):
        candidate = m.group(0)
        digits = re.sub(r"\D", "", candidate)
        if len(digits) >= 7:
            phone_m = candidate
            break
    return (email_m.group(0) if email_m else None, phone_m)


def parse_pdf(data: bytes) -> ParsedResume:
    try:
        import fitz  # PyMuPDF
    except ImportError as exc:  # pragma: no cover - guard for missing dep
        raise RuntimeError("PyMuPDF (fitz) is required for PDF parsing") from exc

    doc = fitz.open(stream=data, filetype="pdf")
    pages_text: list[str] = []
    for page in doc:
        try:
            pages_text.append(page.get_text("text") or "")
        except Exception as exc:
            logger.warning("PDF page read failed: %s", exc)
            pages_text.append("")
    doc.close()

    text = "\n".join(pages_text).strip()
    if not text:
        return ParsedResume(text="", email=None, phone=None, confidence=0.0)

    email, phone = _extract_contact(text)
    sections = _parse_sections(text)
    # Confidence: more text + email + phone = higher.
    confidence = 0.5
    if email:
        confidence += 0.2
    if phone:
        confidence += 0.1
    if sections:
        confidence += 0.1
    if len(text) > 1000:
        confidence += 0.1
    return ParsedResume(text=text, email=email, phone=phone, sections=sections, confidence=min(confidence, 0.99))


def parse_docx(data: bytes) -> ParsedResume:
    try:
        from docx import Document
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("python-docx is required for DOCX parsing") from exc

    doc = Document(io.BytesIO(data))
    paragraphs = [p.text for p in doc.paragraphs if p.text]
    text = "\n".join(paragraphs).strip()
    if not text:
        return ParsedResume(text="", email=None, phone=None, confidence=0.0)

    email, phone = _extract_contact(text)
    sections = _parse_sections(text)
    confidence = 0.5
    if email:
        confidence += 0.2
    if phone:
        confidence += 0.1
    if sections:
        confidence += 0.1
    if len(text) > 1000:
        confidence += 0.1
    return ParsedResume(text=text, email=email, phone=phone, sections=sections, confidence=min(confidence, 0.99))


def parse_text(data: bytes) -> ParsedResume:
    text = data.decode("utf-8", errors="replace").strip()
    if not text:
        return ParsedResume(text="", email=None, phone=None, confidence=0.0)
    email, phone = _extract_contact(text)
    sections = _parse_sections(text)
    confidence = 0.5
    if email:
        confidence += 0.2
    if phone:
        confidence += 0.1
    if sections:
        confidence += 0.1
    if len(text) > 1000:
        confidence += 0.1
    return ParsedResume(text=text, email=email, phone=phone, sections=sections, confidence=min(confidence, 0.99))


def parse_resume(data: bytes, mime_type: str = "", filename: str = "") -> ParsedResume:
    """Top-level dispatcher.  Returns a ParsedResume (never raises)."""
    try:
        mt = (mime_type or "").lower()
        name = (filename or "").lower()

        if "pdf" in mt or name.endswith(".pdf"):
            return parse_pdf(data)
        if "word" in mt or name.endswith(".docx") or name.endswith(".doc"):
            return parse_docx(data)
        if "text" in mt or name.endswith(".txt") or name.endswith(".md"):
            return parse_text(data)
        # Try PDF first (most common), then DOCX, then text.
        if data[:4] == b"%PDF":
            return parse_pdf(data)
        if data[:2] == b"PK":  # zip → docx
            return parse_docx(data)
        return parse_text(data)
    except Exception as exc:
        logger.warning("Resume parse failed for %s: %s", filename, exc)
        return ParsedResume(text="", email=None, phone=None, confidence=0.0)
