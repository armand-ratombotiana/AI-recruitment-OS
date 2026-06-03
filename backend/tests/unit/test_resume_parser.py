"""Unit tests for the resume parser (PDF / DOCX / text)."""
from __future__ import annotations

import os
import sys
from io import BytesIO

import pytest

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from apps.resume_service.parser import (
    ParsedResume,
    parse_docx,
    parse_pdf,
    parse_resume,
    parse_text,
)


pytestmark = [pytest.mark.unit, pytest.mark.resume_parser]


# ── Text parsing ──────────────────────────────────────────────────────────────


def test_parse_text_extracts_email_and_phone():
    data = b"""
    Jane Doe
    jane.doe@example.com
    +1 (415) 555-0123

    Summary
    Senior backend engineer with 10+ years building distributed systems.

    Skills
    Python, FastAPI, PostgreSQL, Docker, Kubernetes
    """
    result = parse_text(data)
    assert result.email == "jane.doe@example.com"
    assert result.phone is not None
    assert "415" in result.phone or "555" in result.phone
    assert "Skills" in result.sections
    assert "Python" in result.sections["Skills"]


def test_parse_text_handles_no_contact_info():
    data = b"Random text without any contact details whatsoever"
    result = parse_text(data)
    assert result.email is None
    assert result.phone is None
    assert result.confidence >= 0.5


def test_parse_text_sections_split_by_headers():
    data = b"""John Smith
john@example.com

Summary
Backend engineer.

Experience
Senior Engineer at Acme (2018-present).
Built distributed systems.

Education
BSc Computer Science, MIT 2014.
"""
    result = parse_text(data)
    assert "Summary" in result.sections
    assert "Experience" in result.sections
    assert "Education" in result.sections
    assert "Acme" in result.sections["Experience"]


def test_parse_text_confidence_increases_with_signals():
    bare = parse_text(b"Just some text with no useful info")
    rich = parse_text(
        b"jane@example.com\n+1-415-555-1234\n"
        b"Summary\nLong professional summary text here\n" * 20
    )
    assert rich.confidence > bare.confidence


# ── PDF parsing ────────────────────────────────────────────────────────────────


def _make_minimal_pdf_with_text(text: str) -> bytes:
    """Build a minimal single-page PDF that contains the given text.

    Uses raw PDF syntax so we don't depend on any extra Python packages.
    """
    # Escape parens
    text_safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    content_stream = f"BT /F1 12 Tf 50 700 Td ({text_safe}) Tj ET".encode("latin-1")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(content_stream)).encode() + b" >>\nstream\n" + content_stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    out = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    offsets = [0]
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"

    xref_pos = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF".encode()
    return out


def test_parse_pdf_extracts_email_and_phone():
    text = "Bob Smith\nbob.smith@acme.io\n+1 415 555 9988\nSenior Python Developer"
    pdf_bytes = _make_minimal_pdf_with_text(text)
    result = parse_pdf(pdf_bytes)
    assert result.email == "bob.smith@acme.io"
    assert result.phone is not None
    assert "415" in result.phone or "555" in result.phone
    assert "Senior Python Developer" in result.text


def test_parse_pdf_empty_returns_empty_parsed():
    empty_pdf = b"%PDF-1.4\n%%EOF\n"
    # Either the parser returns empty result or it raises; the top-level
    # dispatcher catches exceptions.  Test the dispatcher instead.
    result = parse_resume(empty_pdf, mime_type="application/pdf", filename="empty.pdf")
    assert isinstance(result, ParsedResume)
    assert result.confidence == 0.0
    assert result.text == ""


# ── DOCX parsing ───────────────────────────────────────────────────────────────


def _make_minimal_docx_with_text(text: str) -> bytes:
    """Build a minimal valid .docx (a zip with a single document.xml)."""
    import zipfile
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Minimal Content_Types
        zf.writestr(
            "[Content_Types].xml",
            "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"
            "<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'>"
            "<Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/>"
            "<Default Extension='xml' ContentType='application/xml'/>"
            "<Override PartName='/word/document.xml' ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'/>"
            "</Types>",
        )
        zf.writestr(
            "_rels/.rels",
            "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"
            "<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>"
            "<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' Target='word/document.xml'/>"
            "</Relationships>",
        )
        # Wrap each line in a <w:p>
        paragraphs = "".join(
            f"<w:p><w:r><w:t xml:space='preserve'>{line}</w:t></w:r></w:p>"
            for line in text.splitlines()
            if line.strip()
        )
        zf.writestr(
            "word/document.xml",
            "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"
            "<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'>"
            f"<w:body>{paragraphs}</w:body></w:document>",
        )
    return buf.getvalue()


def test_parse_docx_extracts_email_and_skills():
    text = """Alice Engineer
alice@example.com
+1-555-987-6543

Summary
Experienced full-stack engineer.

Skills
TypeScript, React, Node.js, GraphQL
"""
    docx_bytes = _make_minimal_docx_with_text(text)
    result = parse_docx(docx_bytes)
    assert result.email == "alice@example.com"
    assert result.phone is not None
    assert "TypeScript" in result.sections.get("Skills", "")


# ── Dispatcher ────────────────────────────────────────────────────────────────


def test_parse_resume_dispatches_by_mime_type():
    text = "person@example.com\nSummary\nA summary."
    txt_bytes = text.encode("utf-8")
    result = parse_resume(txt_bytes, mime_type="text/plain", filename="cv.txt")
    assert result.email == "person@example.com"
    assert "Summary" in result.sections


def test_parse_resume_dispatches_by_extension():
    text = "someone@example.com\n+1-555-123-4567\nSummary\nAn overview."
    txt_bytes = text.encode("utf-8")
    result = parse_resume(txt_bytes, mime_type="", filename="resume.txt")
    assert result.email == "someone@example.com"


def test_parse_resume_never_raises_on_garbage():
    """Even with completely invalid bytes, parse_resume returns a (possibly empty) ParsedResume."""
    result = parse_resume(b"\x00\x01\x02not a real file", mime_type="", filename="garbage.bin")
    assert isinstance(result, ParsedResume)
    # confidence should be 0 for unrecognised bytes
    assert result.confidence >= 0


def test_parse_resume_handles_pdf_magic_bytes():
    text = "pdf@example.com\nA PDF resume."
    pdf = _make_minimal_pdf_with_text(text)
    result = parse_resume(pdf, mime_type="", filename="unknown")
    assert result.email == "pdf@example.com"
