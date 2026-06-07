"""Tests for the file upload + resume parsing pipeline.

Covers:

* Storage round-trip (save / get / delete)
* Content type detection
* PDF and DOCX parsing
* Email, phone, skills, and experience-year extraction
* The HTTP upload / download / delete endpoints on the candidate service
* The stateless ``POST /parse-resume`` endpoint
* Tenant isolation for the resume endpoints
* Auth requirements for the resume endpoints
"""
from __future__ import annotations

import base64
import io
import os
import sys
import zipfile
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

# Make backend importable when this file is run in isolation.
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.models.candidate import Candidate, CandidateStatus
from shared.core.security import create_access_token
from shared.files import storage
from shared.files.parser import (
    detect_content_type,
    extract_email,
    extract_experience_years,
    extract_phone,
    extract_skills,
    parse_docx,
    parse_pdf,
    parse_resume,
    parse_text,
)


# ── Token / auth helpers ────────────────────────────────────────────────────


def _make_token(tenant_id: str, sub: str = "user", role: str = "recruiter") -> str:
    return create_access_token(
        {
            "sub": sub,
            "email": f"{sub}@{tenant_id}.test",
            "role": role,
            "tenant_id": tenant_id,
        }
    )


def _auth(tenant_id: str, sub: str = "user", role: str = "recruiter") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


# ── DOCX + PDF generators for the tests ────────────────────────────────────


def _make_docx(lines: list[str]) -> bytes:
    """Build a minimal valid .docx (a zip with the required parts)."""
    paragraphs = "".join(
        f"<w:p><w:r><w:t xml:space='preserve'>{line}</w:t></w:r></w:p>"
        for line in lines
        if line
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "[Content_Types].xml",
            "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"
            "<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'>"
            "<Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/>"
            "<Default Extension='xml' ContentType='application/xml'/>"
            "<Override PartName='/word/document.xml' "
            "ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'/>"
            "</Types>",
        )
        zf.writestr(
            "_rels/.rels",
            "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"
            "<Relationships xmlns='http://schemas.openxmlformats.org/officeDocument/2006/relationships'>"
            "<Relationship Id='rId1' "
            "Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' "
            "Target='word/document.xml'/>"
            "</Relationships>",
        )
        zf.writestr(
            "word/document.xml",
            "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"
            "<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'>"
            f"<w:body>{paragraphs}</w:body></w:document>",
        )
    return buf.getvalue()


def _make_pdf(lines: list[str]) -> bytes:
    """Render a real PDF with ``reportlab`` -- the file we ship to the parser
    is therefore a valid PDF, not a hand-rolled byte sequence."""
    from reportlab.lib.pagesizes import LETTER
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=LETTER)
    width, height = LETTER
    y = height - 72
    for line in lines:
        c.drawString(72, y, line)
        y -= 16
        if y < 72:
            c.showPage()
            y = height - 72
    c.save()
    return buf.getvalue()


# ── Engine / app fixtures ──────────────────────────────────────────────────


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    from shared.core.models import (  # noqa: F401
        candidate_activity,
        candidate,
        identity,
        audit_log,
        webhook,
    )
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def client(engine):
    from apps.candidate_service.main import router as candidate_router

    app = FastAPI()
    app.include_router(candidate_router, prefix="/api/v1/candidates")

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override():
        async with factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_db_dependency] = _override
    app.dependency_overrides[Settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def seeded_candidate(engine):
    tenant = f"tenant-{uuid4().hex[:8]}"
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        candidate = Candidate(
            id=str(uuid4()),
            tenant_id=tenant,
            email=f"seed-{uuid4().hex[:8]}@example.com",
            full_name="Seed Candidate",
            status=CandidateStatus.NEW,
        )
        session.add(candidate)
        await session.commit()
        await session.refresh(candidate)
    # Each test starts with an empty in-memory file store.
    storage.clear()
    return {
        "tenant_id": tenant,
        "candidate_id": candidate.id,
        "headers": _auth(tenant, sub="recruiter-1"),
    }


# ── Storage unit tests ────────────────────────────────────────────────────


def test_storage_save_and_get_roundtrip():
    """A saved file is retrievable by its id."""
    storage.clear()
    content = b"hello world"
    fid, url = storage.save_file(content, "hello.txt", "text/plain")
    assert fid
    assert url == f"file://{fid}"
    assert storage.get_file(fid) == content
    assert storage.get_file_meta(fid).filename == "hello.txt"
    assert storage.get_file_meta(fid).content_type == "text/plain"
    assert storage.get_file_meta(fid).size == len(content)


def test_storage_delete_returns_true_when_present():
    """delete_file returns True when a row was removed."""
    storage.clear()
    fid, _ = storage.save_file(b"abc", "x.txt", "text/plain")
    assert storage.delete_file(fid) is True
    assert storage.get_file(fid) is None
    assert storage.delete_file(fid) is False  # second delete is a no-op


def test_storage_get_missing_returns_none():
    """Missing ids return None for both get and get_meta."""
    storage.clear()
    assert storage.get_file("does-not-exist") is None
    assert storage.get_file_meta("does-not-exist") is None
    assert storage.delete_file("does-not-exist") is False


# ── Content type detection ───────────────────────────────────────────────


def test_detect_content_type_from_bytes():
    """A PDF magic header is detected even without filename hints."""
    pdf_bytes = b"%PDF-1.4\n...garbage..."
    assert detect_content_type(pdf_bytes) == "application/pdf"
    assert detect_content_type(pdf_bytes, filename="foo") == "application/pdf"


def test_detect_content_type_from_filename():
    """Filename extensions are honoured when bytes are ambiguous."""
    assert (
        detect_content_type(b"random bytes", filename="resume.docx")
        == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert detect_content_type(b"x", filename="cv.txt") == "text/plain"


# ── Parser unit tests ─────────────────────────────────────────────────────


def test_parse_pdf_extracts_text():
    """A real PDF renders text that the parser picks up."""
    lines = [
        "Jane Doe",
        "jane.doe@example.com",
        "+1 555 123 4567",
        "",
        "Summary",
        "Senior software engineer with 10 years of experience.",
    ]
    pdf_bytes = _make_pdf(lines)
    text = parse_pdf(pdf_bytes)
    assert "Jane Doe" in text
    assert "jane.doe@example.com" in text
    assert "10 years" in text


def test_parse_docx_extracts_text():
    """A real DOCX renders text that the parser picks up."""
    lines = [
        "John Smith",
        "john.smith@example.com",
        "Skills",
        "Python, FastAPI, PostgreSQL",
    ]
    docx_bytes = _make_docx(lines)
    text = parse_docx(docx_bytes)
    assert "John Smith" in text
    assert "john.smith@example.com" in text
    assert "Python" in text


def test_parse_resume_dispatches_on_filename():
    """parse_resume picks the right decoder from the filename."""
    docx_bytes = _make_docx(["Mark", "mark@example.com"])
    out = parse_resume(docx_bytes, content_type="application/octet-stream", filename="cv.docx")
    assert "Mark" in out
    assert "mark@example.com" in out


def test_extract_email():
    assert extract_email("Contact me at jane.doe@example.com please") == "jane.doe@example.com"
    assert extract_email("No email here") is None
    assert extract_email("") is None
    # Multiple emails: return the first one.
    assert extract_email("a@x.com b@x.com") == "a@x.com"


def test_extract_phone():
    assert extract_phone("Call me at +1 555 123 4567 anytime") == "+1 555 123 4567"
    assert extract_phone("Phone: (415) 555-1234") is not None
    # Year alone should not match (only 4 digits).
    assert extract_phone("Joined 2020") is None
    assert extract_phone("") is None


def test_extract_skills_case_insensitive_and_word_boundary():
    text = "We need a Python developer with React and PostgreSQL experience. Avoid googling."
    found = extract_skills(text, ["python", "react", "postgresql", "go", "java"])
    # python, react, postgresql appear; "go" should NOT match "googling"
    assert "python" in [s.lower() for s in found]
    assert "react" in [s.lower() for s in found]
    assert "postgresql" in [s.lower() for s in found]
    assert "go" not in [s.lower() for s in found]


def test_extract_skills_handles_special_chars():
    """Skills with ``+`` and ``#`` match even though they're not pure word chars."""
    text = "Experience with C++ and C# and Node.js"
    found = extract_skills(text, ["C++", "C#", "Node.js", "Go"])
    lowered = [s.lower() for s in found]
    assert "c++" in lowered
    assert "c#" in lowered
    assert "node.js" in lowered
    assert "go" not in lowered


def test_extract_experience_years():
    assert extract_experience_years("I have 8 years of experience in backend dev") == 8
    assert extract_experience_years("Over 12 years of professional work") == 12
    # No mention -> None
    assert extract_experience_years("No years mentioned here at all") is None
    # Range
    assert extract_experience_years("Worked 2015-2020 as a developer") == 5


# ── HTTP endpoint tests ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_resume(client, seeded_candidate):
    """Uploading a DOCX resume persists it and returns extracted fields."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]

    docx_bytes = _make_docx(
        [
            "Alice Engineer",
            "alice@example.com",
            "+1 415 555 9999",
            "Summary",
            "Backend engineer with 7 years of experience.",
            "Skills",
            "Python, FastAPI, PostgreSQL, Docker",
        ]
    )

    resp = await client.post(
        f"/api/v1/candidates/{cid}/resume",
        headers=headers,
        files={"file": ("alice.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["candidate_id"] == cid
    assert body["file_name"] == "alice.docx"
    assert body["size"] == len(docx_bytes)
    assert body["url"].startswith("file://")
    assert body["extracted_email"] == "alice@example.com"
    assert body["extracted_phone"] is not None
    assert body["experience_years"] == 7
    lowered = [s.lower() for s in body["extracted_skills"]]
    assert "python" in lowered
    assert "fastapi" in lowered
    assert "postgresql" in lowered

    # And the candidate row now references the file.
    detail = await client.get(f"/api/v1/candidates/{cid}", headers=headers)
    assert detail.status_code == 200
    # resume_file_id is private; just confirm the file is downloadable.


@pytest.mark.asyncio
async def test_upload_resume_pdf(client, seeded_candidate):
    """Uploading a PDF resume extracts email and years."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]

    pdf_bytes = _make_pdf(
        [
            "Bob Tester",
            "bob@example.com",
            "Summary",
            "I have 5 years of experience with Python.",
        ]
    )
    resp = await client.post(
        f"/api/v1/candidates/{cid}/resume",
        headers=headers,
        files={"file": ("bob.pdf", pdf_bytes, "application/pdf")},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["content_type"] == "application/pdf"
    assert body["extracted_email"] == "bob@example.com"
    assert body["experience_years"] == 5


@pytest.mark.asyncio
async def test_download_resume(client, seeded_candidate):
    """GET returns the same bytes we uploaded (base64-encoded)."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]

    docx_bytes = _make_docx(["Plain text only", "no email"])
    upload = await client.post(
        f"/api/v1/candidates/{cid}/resume",
        headers=headers,
        files={"file": ("a.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert upload.status_code == 201

    download = await client.get(
        f"/api/v1/candidates/{cid}/resume", headers=headers
    )
    assert download.status_code == 200, download.text
    body = download.json()
    assert body["file_name"] == "a.docx"
    assert body["size"] == len(docx_bytes)
    decoded = base64.b64decode(body["content_base64"])
    assert decoded == docx_bytes


@pytest.mark.asyncio
async def test_download_resume_returns_404_when_missing(client, seeded_candidate):
    """A candidate with no resume returns 404, not 500."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]
    resp = await client.get(f"/api/v1/candidates/{cid}/resume", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_resume(client, seeded_candidate):
    """DELETE clears the resume, and a subsequent GET returns 404."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]

    docx_bytes = _make_docx(["x@example.com"])
    await client.post(
        f"/api/v1/candidates/{cid}/resume",
        headers=headers,
        files={"file": ("x.docx", docx_bytes, "application/octet-stream")},
    )

    del_resp = await client.delete(
        f"/api/v1/candidates/{cid}/resume", headers=headers
    )
    assert del_resp.status_code == 200, del_resp.text
    body = del_resp.json()
    assert body["deleted"] is True
    assert body["file_id"] != ""

    # Subsequent GET should now 404.
    get_resp = await client.get(
        f"/api/v1/candidates/{cid}/resume", headers=headers
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_resume_is_idempotent(client, seeded_candidate):
    """Deleting a resume that was never uploaded is a no-op, not a 500."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]
    resp = await client.delete(f"/api/v1/candidates/{cid}/resume", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["deleted"] is False


@pytest.mark.asyncio
async def test_reupload_replaces_old_file(client, seeded_candidate):
    """Uploading twice in a row replaces the bytes in storage."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]

    first = _make_docx(["first@example.com"])
    second = _make_docx(["second@example.com"])

    r1 = await client.post(
        f"/api/v1/candidates/{cid}/resume",
        headers=headers,
        files={"file": ("first.docx", first, "application/octet-stream")},
    )
    assert r1.status_code == 201
    first_id = r1.json()["file_id"]

    r2 = await client.post(
        f"/api/v1/candidates/{cid}/resume",
        headers=headers,
        files={"file": ("second.docx", second, "application/octet-stream")},
    )
    assert r2.status_code == 201
    second_id = r2.json()["file_id"]
    assert second_id != first_id

    # The old file id should no longer be in storage.
    assert storage.get_file(first_id) is None
    # The new one should be downloadable.
    dl = await client.get(f"/api/v1/candidates/{cid}/resume", headers=headers)
    assert dl.status_code == 200
    assert base64.b64decode(dl.json()["content_base64"]) == second


@pytest.mark.asyncio
async def test_parse_resume_endpoint(client, seeded_candidate):
    """POST /parse-resume returns parsed fields without persisting the file."""
    headers = seeded_candidate["headers"]

    docx_bytes = _make_docx(
        [
            "Carla Tester",
            "carla@example.com",
            "+44 20 7946 0958",
            "Summary",
            "6 years of experience with Go and Kubernetes.",
        ]
    )
    resp = await client.post(
        "/api/v1/candidates/parse-resume",
        headers=headers,
        files={"file": ("carla.docx", docx_bytes, "application/octet-stream")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["email"] == "carla@example.com"
    assert body["phone"] is not None
    assert body["experience_years"] == 6
    lowered = [s.lower() for s in body["skills"]]
    assert "go" in lowered
    assert "kubernetes" in lowered
    assert "Carla Tester" in body["text"]


@pytest.mark.asyncio
async def test_parse_resume_with_custom_vocabulary(client, seeded_candidate):
    """The ``known_skills`` query string narrows the vocabulary."""
    headers = seeded_candidate["headers"]

    text = "We need python, react, kubernetes, fastapi"
    resp = await client.post(
        "/api/v1/candidates/parse-resume",
        headers=headers,
        params={"known_skills": "python, react, kubernetes"},
        files={"file": ("cv.txt", text.encode("utf-8"), "text/plain")},
    )
    assert resp.status_code == 200
    body = resp.json()
    # fastapi is NOT in the custom vocabulary -> must not appear
    assert "fastapi" not in [s.lower() for s in body["skills"]]
    lowered = [s.lower() for s in body["skills"]]
    assert "python" in lowered
    assert "react" in lowered
    assert "kubernetes" in lowered


@pytest.mark.asyncio
async def test_upload_empty_file_rejected(client, seeded_candidate):
    """An empty upload is a 400, not a 201."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]
    resp = await client.post(
        f"/api/v1/candidates/{cid}/resume",
        headers=headers,
        files={"file": ("empty.pdf", b"", "application/pdf")},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_resume_endpoints_require_auth(client, seeded_candidate):
    """All three resume endpoints must 401 without a bearer token."""
    cid = seeded_candidate["candidate_id"]
    assert (
        await client.post(
            f"/api/v1/candidates/{cid}/resume",
            files={"file": ("a.txt", b"hi", "text/plain")},
        )
    ).status_code == 401
    assert (
        await client.get(f"/api/v1/candidates/{cid}/resume")
    ).status_code == 401
    assert (
        await client.delete(f"/api/v1/candidates/{cid}/resume")
    ).status_code == 401


@pytest.mark.asyncio
async def test_resume_tenant_isolation(client, seeded_candidate, engine):
    """Tenant B cannot see or upload to Tenant A's candidate resume."""
    cid = seeded_candidate["candidate_id"]
    headers_a = seeded_candidate["headers"]
    headers_b = _auth(tenant_id="other-tenant", sub="attacker")

    docx = _make_docx(["x@example.com"])

    # Upload as A.
    r = await client.post(
        f"/api/v1/candidates/{cid}/resume",
        headers=headers_a,
        files={"file": ("x.docx", docx, "application/octet-stream")},
    )
    assert r.status_code == 201

    # Tenant B gets 404 on the candidate -> 404 on every resume endpoint.
    assert (
        await client.post(
            f"/api/v1/candidates/{cid}/resume",
            headers=headers_b,
            files={"file": ("y.docx", docx, "application/octet-stream")},
        )
    ).status_code == 404
    assert (
        await client.get(f"/api/v1/candidates/{cid}/resume", headers=headers_b)
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/candidates/{cid}/resume", headers=headers_b)
    ).status_code == 404
