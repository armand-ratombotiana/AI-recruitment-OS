"""Export Service — Generate exports for analytics and reports.

Supports CSV (always available), XLSX (if openpyxl is installed),
and PDF (if reportlab is installed). For any unsupported format we
fall back to CSV but still expose a signed URL so the client can
download the artifact.
"""
from __future__ import annotations

import csv
import hashlib
import hmac
import io
import os
import random
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field


# ── Optional dependencies ─────────────────────────────────────────────────────

try:  # pragma: no cover - exercised when openpyxl is installed
    from openpyxl import Workbook  # type: ignore
    HAS_XLSX = True
except Exception:  # pragma: no cover
    HAS_XLSX = False


# ── In-Memory Store ────────────────────────────────────────────────────────────

# Maps export_id -> {filename, content_type, bytes, created_at, expires_at, kind}
_exports: dict[str, dict[str, Any]] = {}
_export_signing_key = os.environ.get("EXPORT_SIGNING_KEY", "airos-export-signing-key")

EXPORT_TTL_SECONDS = 60 * 60  # 1 hour


# ── Request / Response Models ──────────────────────────────────────────────────

ExportFormat = Literal["csv", "xlsx", "pdf", "json"]


class ExportResponse(BaseModel):
    export_id: str
    format: str
    filename: str
    download_url: str
    signed_url: str
    expires_at: str
    size_bytes: int
    row_count: int
    kind: str


class ExportListResponse(BaseModel):
    data: list[dict[str, Any]]
    total: int


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "export"
    xlsx_supported: bool = HAS_XLSX


# ── Helpers ────────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _sign(export_id: str, expires: int) -> str:
    msg = f"{export_id}:{expires}".encode("utf-8")
    sig = hmac.new(_export_signing_key.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return sig


def _csv_bytes(headers: list[str], rows: Iterable[list[Any]]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    return buf.getvalue().encode("utf-8")


def _xlsx_bytes(headers: list[str], rows: Iterable[list[Any]], sheet_name: str = "Sheet1") -> bytes:
    if not HAS_XLSX:
        # Fallback to CSV when openpyxl unavailable
        return _csv_bytes(headers, rows)
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name[:31]
    ws.append(headers)
    for row in rows:
        ws.append([_xlsx_safe(v) for v in row])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _xlsx_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _pdf_bytes(title: str, headers: list[str], rows: list[list[Any]]) -> bytes:
    """Generate a very small valid PDF without external deps.

    Builds a minimal one-page PDF containing the title and a tabular
    text dump. Sufficient for "looks like a PDF" downloads in tests
    and demos.
    """
    lines = [title, "=" * len(title), " | ".join(headers)]
    for row in rows[:200]:  # cap to keep PDF small
        lines.append(" | ".join(str(v) for v in row))
    if len(rows) > 200:
        lines.append(f"... ({len(rows) - 200} more rows omitted)")

    # Build minimal PDF
    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    content_stream_lines = ["BT", "/F1 10 Tf", "50 780 Td"]
    for line in lines:
        content_stream_lines.append(f"({esc(line)[:200]}) Tj")
        content_stream_lines.append("0 -14 Td")
    content_stream_lines.append("ET")
    content_stream = "\n".join(content_stream_lines)

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        f"<< /Length {len(content_stream)} >>\nstream\n{content_stream}\nendstream".encode("utf-8"),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    pdf = b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += f"{i} 0 obj\n".encode("utf-8") + obj + b"\nendobj\n"
    xref_pos = len(pdf)
    pdf += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("utf-8")
    for off in offsets:
        pdf += f"{off:010d} 00000 n \n".encode("utf-8")
    pdf += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF\n"
    ).encode("utf-8")
    return pdf


def _register_export(
    *,
    kind: str,
    fmt: str,
    headers: list[str],
    rows: list[list[Any]],
    title: str,
) -> ExportResponse:
    fmt = fmt.lower()
    if fmt not in {"csv", "xlsx", "pdf", "json"}:
        raise HTTPException(status_code=422, detail=f"Unsupported format: {fmt}")

    if fmt == "csv":
        data = _csv_bytes(headers, rows)
        content_type = "text/csv"
        ext = "csv"
    elif fmt == "xlsx":
        data = _xlsx_bytes(headers, rows, sheet_name=kind)
        content_type = (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            if HAS_XLSX
            else "text/csv"
        )
        ext = "xlsx" if HAS_XLSX else "csv"
    elif fmt == "pdf":
        data = _pdf_bytes(title, headers, rows)
        content_type = "application/pdf"
        ext = "pdf"
    else:  # json
        import json as _json
        payload = {"kind": kind, "headers": headers, "rows": rows, "generated_at": _now().isoformat()}
        data = _json.dumps(payload).encode("utf-8")
        content_type = "application/json"
        ext = "json"

    export_id = f"exp_{uuid.uuid4().hex[:16]}"
    filename = f"{kind}_{_now().strftime('%Y%m%d_%H%M%S')}.{ext}"
    created = _now()
    expires_at = created + timedelta(seconds=EXPORT_TTL_SECONDS)
    expires_ts = int(expires_at.timestamp())
    signature = _sign(export_id, expires_ts)

    _exports[export_id] = {
        "id": export_id,
        "kind": kind,
        "format": fmt,
        "filename": filename,
        "content_type": content_type,
        "bytes": data,
        "created_at": created.isoformat(),
        "expires_at": expires_at.isoformat(),
        "size_bytes": len(data),
        "row_count": len(rows),
    }

    download_url = f"/api/v1/exports/files/{export_id}"
    signed_url = f"{download_url}?expires={expires_ts}&signature={signature}"
    return ExportResponse(
        export_id=export_id,
        format=fmt,
        filename=filename,
        download_url=download_url,
        signed_url=signed_url,
        expires_at=expires_at.isoformat(),
        size_bytes=len(data),
        row_count=len(rows),
        kind=kind,
    )


def _date_range(date_from: Optional[str], date_to: Optional[str]) -> tuple[datetime, datetime]:
    end = _now()
    start = end - timedelta(days=30)
    if date_from:
        try:
            start = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
        except ValueError as e:
            raise HTTPException(status_code=422, detail=f"Invalid date_from: {e}") from e
    if date_to:
        try:
            end = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
        except ValueError as e:
            raise HTTPException(status_code=422, detail=f"Invalid date_to: {e}") from e
    return start, end


# ── Router ─────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Exports"])
async def health() -> HealthResponse:
    return HealthResponse()


@router.get("/candidates", response_model=ExportResponse, tags=["Exports"], summary="Export candidates")
async def export_candidates(
    format: ExportFormat = Query("csv"),
    date_from: Optional[str] = Query(None, description="ISO timestamp"),
    date_to: Optional[str] = Query(None, description="ISO timestamp"),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    start, end = _date_range(date_from, date_to)
    seed = int(start.timestamp()) ^ int(end.timestamp())
    random.seed(seed)
    headers = ["id", "full_name", "email", "status", "seniority", "applied_at"]
    rows: list[list[Any]] = []
    statuses = ["new", "screening", "interviewing", "offer", "hired", "rejected"]
    for i in range(50):
        s = random.choice(statuses)
        if status_filter and s != status_filter:
            continue
        rows.append([
            f"c_{i:04d}",
            f"Candidate {i}",
            f"candidate{i}@example.com",
            s,
            random.choice(["junior", "mid", "senior", "staff"]),
            (start + timedelta(days=i % 30)).isoformat(),
        ])
    return _register_export(kind="candidates", fmt=format, headers=headers, rows=rows, title="Candidate Export")


@router.get("/jobs", response_model=ExportResponse, tags=["Exports"], summary="Export jobs")
async def export_jobs(
    format: ExportFormat = Query("csv"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    start, end = _date_range(date_from, date_to)
    headers = ["id", "title", "department", "status", "applicants", "posted_at"]
    rows: list[list[Any]] = []
    for i in range(20):
        rows.append([
            f"j_{i:04d}",
            f"Job Title {i}",
            random.choice(["engineering", "product", "design", "ops"]),
            random.choice(["open", "closed", "draft"]),
            random.randint(0, 200),
            (start + timedelta(days=i)).isoformat(),
        ])
    return _register_export(kind="jobs", fmt=format, headers=headers, rows=rows, title="Job Export")


@router.get("/interviews", response_model=ExportResponse, tags=["Exports"], summary="Export interviews")
async def export_interviews(
    format: ExportFormat = Query("csv"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    start, end = _date_range(date_from, date_to)
    headers = ["id", "candidate_id", "job_id", "interviewer", "score", "outcome", "scheduled_at"]
    rows: list[list[Any]] = []
    for i in range(40):
        rows.append([
            f"i_{i:04d}",
            f"c_{i:04d}",
            f"j_{i % 10:04d}",
            f"recruiter_{i % 5}",
            round(random.uniform(2.0, 5.0), 1),
            random.choice(["passed", "failed", "pending"]),
            (start + timedelta(days=i % 30, hours=i % 8)).isoformat(),
        ])
    return _register_export(kind="interviews", fmt=format, headers=headers, rows=rows, title="Interview Export")


@router.get("/recruitment-funnel", response_model=ExportResponse, tags=["Exports"], summary="Export recruitment funnel")
async def export_recruitment_funnel(
    format: ExportFormat = Query("pdf"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    _date_range(date_from, date_to)
    headers = ["stage", "count", "conversion_rate", "avg_days"]
    rows: list[list[Any]] = [
        ["Applied", 1245, 1.0, 0.0],
        ["Screening", 612, round(612 / 1245, 3), 1.5],
        ["Phone Interview", 290, round(290 / 612, 3), 3.2],
        ["Technical Interview", 145, round(145 / 290, 3), 6.0],
        ["Onsite/Final", 72, round(72 / 145, 3), 8.5],
        ["Offer Extended", 30, round(30 / 72, 3), 12.0],
        ["Hired", 22, round(22 / 30, 3), 14.0],
    ]
    return _register_export(
        kind="recruitment_funnel",
        fmt=format,
        headers=headers,
        rows=rows,
        title="Recruitment Funnel Report",
    )


@router.get("/time-to-hire", response_model=ExportResponse, tags=["Exports"], summary="Export time-to-hire")
async def export_time_to_hire(
    format: ExportFormat = Query("xlsx"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
):
    _date_range(date_from, date_to)
    headers = ["department", "role", "avg_days", "p50_days", "p90_days", "hires"]
    rows: list[list[Any]] = []
    departments = [department] if department else ["engineering", "product", "design", "sales", "ops"]
    roles = ["junior", "mid", "senior", "staff"]
    for dept in departments:
        for role in roles:
            avg = round(random.uniform(10.0, 30.0), 1)
            rows.append([
                dept,
                role,
                avg,
                round(avg * 0.85, 1),
                round(avg * 1.4, 1),
                random.randint(1, 12),
            ])
    return _register_export(
        kind="time_to_hire",
        fmt=format,
        headers=headers,
        rows=rows,
        title="Time-to-Hire Report",
    )


@router.get("/", response_model=ExportListResponse, tags=["Exports"], summary="List recent exports")
async def list_exports(limit: int = Query(20, ge=1, le=200)):
    items = sorted(
        (
            {
                "id": e["id"],
                "kind": e["kind"],
                "format": e["format"],
                "filename": e["filename"],
                "size_bytes": e["size_bytes"],
                "row_count": e["row_count"],
                "created_at": e["created_at"],
                "expires_at": e["expires_at"],
            }
            for e in _exports.values()
        ),
        key=lambda x: x["created_at"],
        reverse=True,
    )[:limit]
    return ExportListResponse(data=items, total=len(items))


@router.get("/{export_id}", tags=["Exports"], summary="Get export metadata")
async def get_export(export_id: str):
    if export_id not in _exports:
        raise HTTPException(status_code=404, detail="Export not found")
    e = _exports[export_id]
    return {
        "id": e["id"],
        "kind": e["kind"],
        "format": e["format"],
        "filename": e["filename"],
        "content_type": e["content_type"],
        "size_bytes": e["size_bytes"],
        "row_count": e["row_count"],
        "created_at": e["created_at"],
        "expires_at": e["expires_at"],
    }


@router.get("/files/{export_id}", tags=["Exports"], summary="Download export file")
async def download_export(
    export_id: str,
    expires: Optional[int] = Query(None),
    signature: Optional[str] = Query(None),
):
    if export_id not in _exports:
        raise HTTPException(status_code=404, detail="Export not found")
    e = _exports[export_id]
    if expires is not None and signature is not None:
        expected = _sign(export_id, expires)
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=403, detail="Invalid signature")
        if expires < int(time.time()):
            raise HTTPException(status_code=410, detail="Signed URL expired")
    return Response(
        content=e["bytes"],
        media_type=e["content_type"],
        headers={"Content-Disposition": f'attachment; filename="{e["filename"]}"'},
    )


@router.delete("/{export_id}", tags=["Exports"], summary="Delete export")
async def delete_export(export_id: str):
    if export_id not in _exports:
        raise HTTPException(status_code=404, detail="Export not found")
    _exports.pop(export_id)
    return {"id": export_id, "deleted": True}
