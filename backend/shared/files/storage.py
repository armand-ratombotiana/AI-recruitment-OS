"""In-memory file storage for resume uploads.

The store is keyed by a process-unique ``file_id`` (UUID4) and is intentionally
process-local: it survives across requests inside the same Python process but
disappears on restart.  This keeps the upload / download / delete endpoints
fully functional during local development and unit tests without dragging in
S3 / MinIO / Azure Blob dependencies.

The module is thread-safe under CPython's GIL via a single module-level
``threading.Lock`` because the endpoints that touch it (``save_file``,
``get_file``, ``delete_file``) all do multiple dict operations on a single
``StoredFile`` row.

A future change can swap the ``_FILES`` dict for a disk-backed or
object-storage backend without changing the public API.
"""
from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


@dataclass
class StoredFile:
    """Metadata + raw bytes for a single stored object."""

    file_id: str
    filename: str
    content_type: str
    content: bytes
    size: int
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    def to_dict(self) -> dict:
        return {
            "file_id": self.file_id,
            "filename": self.filename,
            "content_type": self.content_type,
            "size": self.size,
            "created_at": self.created_at.isoformat(),
        }


_LOCK = threading.Lock()
_FILES: dict[str, StoredFile] = {}


def _new_file_id() -> str:
    return str(uuid.uuid4())


def save_file(content: bytes, filename: str, content_type: str) -> tuple[str, str]:
    """Store ``content`` and return ``(file_id, url)``.

    ``url`` is an opaque reference the API exposes to clients; clients should
    use the matching GET endpoint to download the bytes.  Storing it as
    ``"file://<file_id>"`` makes the value round-trippable without being a
    real fetchable URL.
    """
    if not isinstance(content, (bytes, bytearray)):
        raise TypeError("content must be bytes")
    raw = bytes(content)
    fid = _new_file_id()
    stored = StoredFile(
        file_id=fid,
        filename=filename or "unnamed",
        content_type=content_type or "application/octet-stream",
        content=raw,
        size=len(raw),
    )
    with _LOCK:
        _FILES[fid] = stored
    return fid, f"file://{fid}"


def get_file(file_id: str) -> Optional[bytes]:
    """Return the raw bytes for ``file_id`` or ``None`` if missing."""
    if not file_id:
        return None
    with _LOCK:
        stored = _FILES.get(file_id)
        if stored is None:
            return None
        return stored.content


def get_file_meta(file_id: str) -> Optional[StoredFile]:
    """Return the full ``StoredFile`` (metadata + bytes) or ``None``."""
    if not file_id:
        return None
    with _LOCK:
        return _FILES.get(file_id)


def delete_file(file_id: str) -> bool:
    """Delete the file.  Returns ``True`` if a row was removed."""
    if not file_id:
        return False
    with _LOCK:
        return _FILES.pop(file_id, None) is not None


def list_files() -> list[StoredFile]:
    """Return a snapshot of every stored file (for tests / admin views)."""
    with _LOCK:
        return list(_FILES.values())


def clear() -> None:
    """Wipe the store.  Intended for tests only."""
    with _LOCK:
        _FILES.clear()
