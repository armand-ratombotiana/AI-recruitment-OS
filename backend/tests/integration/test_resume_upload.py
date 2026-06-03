"""Integration tests for the resume service HTTP endpoints."""
from __future__ import annotations

import io
import os
import sys
import zipfile
from io import BytesIO

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.pool import StaticPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlmodel import SQLModel

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.config import Settings
from shared.core.database import get_db_dependency


pytestmark = [pytest.mark.integration, pytest.mark.resume]


def _make_docx(text: str) -> bytes:
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
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


@pytest_asyncio.fixture
async def client():
    """Mount the resume router in a fresh FastAPI app for endpoint tests."""
    from apps.resume_service.main import router as resume_router

    app = FastAPI()
    app.include_router(resume_router, prefix="/resumes")
    app.dependency_overrides[Settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_upload_docx_file_parses_and_returns_resume(client):
    text = """Alex Engineer
alex@example.com
+1-555-123-4567

Summary
A senior engineer with ten years of experience.

Skills
Python, FastAPI, PostgreSQL
"""
    docx_bytes = _make_docx(text)
    files = {"file": ("resume.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    data = {"candidate_id": "cand_123"}

    r = await client.post("/resumes/upload", files=files, data=data)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["file_name"] == "resume.docx"
    assert body["extracted_email"] == "alex@example.com"
    assert body["parsing_confidence"] > 0.5
    assert body["status"] == "parsed"
    resume_id = body["id"]

    # Now fetch the parsed result
    r2 = await client.get(f"/resumes/{resume_id}/parsed")
    assert r2.status_code == 200
    parsed = r2.json()
    assert parsed["sections"]["contact"]["email"] == "alex@example.com"
    assert parsed["sections"]["contact"]["phone"] is not None
    assert "Python" in parsed["sections"]["skills"]


@pytest.mark.asyncio
async def test_upload_text_file_works(client):
    text = "Test User\ntest@example.com\n\nSummary\nA short bio.\n\nSkills\nGo, Rust"
    files = {"file": ("cv.txt", text.encode("utf-8"), "text/plain")}
    r = await client.post("/resumes/upload", files=files)
    assert r.status_code == 200
    body = r.json()
    assert body["extracted_email"] == "test@example.com"
    resume_id = body["id"]
    r2 = await client.get(f"/resumes/{resume_id}/parsed")
    assert r2.status_code == 200
    parsed = r2.json()
    assert "Go" in parsed["sections"]["skills"]


@pytest.mark.asyncio
async def test_upload_empty_file_returns_400(client):
    files = {"file": ("empty.pdf", b"", "application/pdf")}
    r = await client.post("/resumes/upload", files=files)
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_get_parsed_for_registered_only_resume_returns_409(client):
    """If a resume is registered via POST / (metadata only) but no file was uploaded,
    the /parsed endpoint should return 409 (data is missing), not 404."""
    r = await client.post(
        "/resumes/",
        json={"file_name": "ghost.pdf", "mime_type": "application/pdf", "file_size": 0},
    )
    assert r.status_code == 200
    rid = r.json()["id"]
    r2 = await client.get(f"/resumes/{rid}/parsed")
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_get_parsed_for_unknown_resume_returns_404(client):
    r = await client.get("/resumes/does-not-exist/parsed")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_list_resumes_includes_uploaded(client):
    text = "user@x.com\nSummary\nHello"
    files = {"file": ("cv.txt", text.encode(), "text/plain")}
    r = await client.post("/resumes/upload", files=files)
    assert r.status_code == 200

    r2 = await client.get("/resumes/")
    assert r2.status_code == 200
    assert r2.json()["total"] >= 1
