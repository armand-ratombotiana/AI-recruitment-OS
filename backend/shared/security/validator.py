from __future__ import annotations

import html
import os
import re
import time
import mimetypes
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

_SQL_INJECTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b\s)", re.IGNORECASE),
    re.compile(r"(--|;(?!\s*$)|/\*|\*/|@@)"),
    re.compile(r"(\b(OR|AND)\b\s+\d+\s*=\s*\d+)", re.IGNORECASE),
    re.compile(r"('\s*(OR|AND)\s+')", re.IGNORECASE),
    re.compile(r"(CHAR|NCHAR|VARCHAR|NVARCHAR)\s*\(", re.IGNORECASE),
    re.compile(r"(0x[0-9a-fA-F]+)"),
    re.compile(r"(\bxp_\w+)"),
    re.compile(r"(EXEC\s+xp_cmdshell)", re.IGNORECASE),
    re.compile(r"(WAITFOR\s+DELAY)", re.IGNORECASE),
    re.compile(r"(BENCHMARK\s*\()", re.IGNORECASE),
    re.compile(r"(SLEEP\s*\()", re.IGNORECASE),
]

_DANGEROUS_PATH_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\.\."),
    re.compile(r"(^|[/\\])\.(?=$|[/\\])"),
    re.compile(r"(%2e%2e|%252e%252e)", re.IGNORECASE),
    re.compile(r"(\\|%5c)(\\|%5c)"),
]

_MAGIC_BYTES: dict[str, list[bytes]] = {
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/gif": [b"GIF87a", b"GIF89a"],
    "image/webp": [b"RIFF"],
    "application/pdf": [b"%PDF"],
    "application/zip": [b"PK\x03\x04", b"PK\x05\x06"],
    "application/x-tar": [b"ustar"],
    "application/gzip": [b"\x1f\x8b"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [b"PK\x03\x04"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [b"PK\x03\x04"],
}

ALLOWED_MIME_TYPES: set[str] = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
    "application/zip", "application/gzip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain", "text/csv",
    "application/msword",
    "application/json",
}

DEFAULT_MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024

_XSS_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"<script[^>]*>", re.IGNORECASE),
    re.compile(r"javascript\s*:", re.IGNORECASE),
    re.compile(r"on\w+\s*=\s*[\"'\w]", re.IGNORECASE),
    re.compile(r"<\s*iframe", re.IGNORECASE),
    re.compile(r"<\s*object", re.IGNORECASE),
    re.compile(r"<\s*embed", re.IGNORECASE),
    re.compile(r"<\s*link", re.IGNORECASE),
    re.compile(r"<\s*style", re.IGNORECASE),
    re.compile(r"expression\s*\(", re.IGNORECASE),
    re.compile(r"url\s*\(", re.IGNORECASE),
    re.compile(r"vbscript\s*:", re.IGNORECASE),
    re.compile(r"data\s*:\s*text/html", re.IGNORECASE),
]


@dataclass
class ValidationResult:
    is_valid: bool
    sanitized_value: Any = None
    threats_detected: list[str] = field(default_factory=list)
    details: str = ""


@dataclass
class FileValidationResult:
    is_valid: bool
    detected_mime: str = ""
    declared_mime: str = ""
    size: int = 0
    threats: list[str] = field(default_factory=list)
    details: str = ""


@dataclass
class RateLimitResult:
    allowed: bool
    remaining: int = 0
    limit: int = 0
    reset_at: float = 0.0
    retry_after: float = 0.0


class InputSanitizer:
    @staticmethod
    def sanitize_string(value: str) -> str:
        if not isinstance(value, str):
            return value
        sanitized = html.escape(value, quote=True)
        sanitized = sanitized.replace("\x00", "")
        return sanitized

    @staticmethod
    def check_xss(value: str) -> ValidationResult:
        threats: list[str] = []
        for pattern in _XSS_PATTERNS:
            if pattern.search(value):
                threats.append(f"XSS pattern detected: {pattern.pattern}")
        sanitized = InputSanitizer.sanitize_string(value)
        return ValidationResult(
            is_valid=len(threats) == 0,
            sanitized_value=sanitized,
            threats_detected=threats,
            details=f"{len(threats)} XSS threat(s) found" if threats else "Clean",
        )

    @staticmethod
    def sanitize_dict(data: dict[str, Any]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in data.items():
            if isinstance(value, str):
                result[key] = InputSanitizer.sanitize_string(value)
            elif isinstance(value, dict):
                result[key] = InputSanitizer.sanitize_dict(value)
            elif isinstance(value, list):
                result[key] = InputSanitizer.sanitize_list(value)
            else:
                result[key] = value
        return result

    @staticmethod
    def sanitize_list(data: list[Any]) -> list[Any]:
        result: list[Any] = []
        for item in data:
            if isinstance(item, str):
                result.append(InputSanitizer.sanitize_string(item))
            elif isinstance(item, dict):
                result.append(InputSanitizer.sanitize_dict(item))
            elif isinstance(item, list):
                result.append(InputSanitizer.sanitize_list(item))
            else:
                result.append(item)
        return result


class SQLInjectionPreventer:
    @staticmethod
    def check(value: str) -> ValidationResult:
        if not isinstance(value, str):
            return ValidationResult(is_valid=True, sanitized_value=value)
        threats: list[str] = []
        for pattern in _SQL_INJECTION_PATTERNS:
            if pattern.search(value):
                threats.append(f"SQL injection pattern: {pattern.pattern}")
        return ValidationResult(
            is_valid=len(threats) == 0,
            sanitized_value=value,
            threats_detected=threats,
            details=f"{len(threats)} SQL injection pattern(s) found" if threats else "Clean",
        )

    @staticmethod
    def check_dict(data: dict[str, Any]) -> ValidationResult:
        all_threats: list[str] = []
        for key, value in data.items():
            if isinstance(value, str):
                result = SQLInjectionPreventer.check(value)
                if not result.is_valid:
                    all_threats.extend([f"field '{key}': {t}" for t in result.threats_detected])
            elif isinstance(value, dict):
                nested = SQLInjectionPreventer.check_dict(value)
                if not nested.is_valid:
                    all_threats.extend(nested.threats_detected)
        return ValidationResult(
            is_valid=len(all_threats) == 0,
            threats_detected=all_threats,
            details=f"{len(all_threats)} SQL injection threat(s) found" if all_threats else "Clean",
        )


class PathTraversalPreventer:
    @staticmethod
    def check(path: str) -> ValidationResult:
        threats: list[str] = []
        for pattern in _DANGEROUS_PATH_PATTERNS:
            if pattern.search(path):
                threats.append(f"Path traversal pattern: {pattern.pattern}")
        return ValidationResult(
            is_valid=len(threats) == 0,
            sanitized_value=path,
            threats_detected=threats,
            details=f"{len(threats)} path traversal pattern(s) found" if threats else "Clean",
        )

    @staticmethod
    def safe_path(base_dir: str, user_path: str) -> str | None:
        base = os.path.realpath(os.path.abspath(base_dir))
        joined = os.path.realpath(os.path.join(base, user_path))
        if not joined.startswith(base + os.sep) and joined != base:
            return None
        return joined

    @staticmethod
    def validate_filename(filename: str) -> str:
        safe = os.path.basename(filename)
        safe = re.sub(r"[^\w\s\-.]", "", safe)
        safe = safe.strip()
        if not safe:
            safe = "unnamed_file"
        return safe


class FileUploadValidator:
    def __init__(
        self,
        max_size: int = DEFAULT_MAX_UPLOAD_SIZE,
        allowed_types: set[str] | None = None,
        check_magic: bool = True,
    ):
        self.max_size = max_size
        self.allowed_types = allowed_types or ALLOWED_MIME_TYPES
        self.check_magic = check_magic

    def validate(self, filename: str, content: bytes, declared_content_type: str = "") -> FileValidationResult:
        threats: list[str] = []
        size = len(content)
        detected_mime = ""

        if size == 0:
            return FileValidationResult(
                is_valid=False, size=size,
                threats=["Empty file"],
                details="File is empty",
            )

        if size > self.max_size:
            threats.append(f"File size {size} exceeds maximum {self.max_size}")

        safe_name = PathTraversalPreventer.validate_filename(filename)
        if safe_name != filename:
            threats.append(f"Unsafe filename sanitized: '{filename}' -> '{safe_name}'")

        guessed_mime = mimetypes.guess_type(filename)[0] or ""
        if declared_content_type and declared_content_type not in self.allowed_types:
            threats.append(f"Declared MIME type '{declared_content_type}' not in allowed types")

        if self.check_magic and size >= 4:
            detected_mime = self._detect_mime(content)
            if detected_mime and declared_content_type and detected_mime != declared_content_type:
                if not (detected_mime.startswith("application/vnd.openxmlformats") and declared_content_type.startswith("application/vnd.openxmlformats")):
                    if not (detected_mime == "application/zip" and "openxmlformats" in declared_content_type):
                        threats.append(
                            f"MIME mismatch: declared='{declared_content_type}', detected='{detected_mime}'"
                        )

        if guessed_mime and guessed_mime not in self.allowed_types:
            threats.append(f"File type '{guessed_mime}' not allowed")

        if detected_mime and detected_mime not in self.allowed_types:
            threats.append(f"Detected file type '{detected_mime}' not allowed")

        return FileValidationResult(
            is_valid=len(threats) == 0,
            detected_mime=detected_mime,
            declared_mime=declared_content_type,
            size=size,
            threats=threats,
            details=f"{len(threats)} issue(s) found" if threats else "File is valid",
        )

    @staticmethod
    def _detect_mime(data: bytes) -> str:
        for mime, signatures in _MAGIC_BYTES.items():
            for sig in signatures:
                if data[:len(sig)] == sig:
                    return mime
        return ""


class EndpointRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, list[float]] = defaultdict(list)
        self._configs: dict[str, tuple[int, float]] = {}

    def configure(self, endpoint: str, max_requests: int, window_seconds: float) -> None:
        self._configs[endpoint] = (max_requests, window_seconds)

    def check(self, endpoint: str, client_id: str = "default") -> RateLimitResult:
        key = f"{endpoint}:{client_id}"
        now = time.time()
        max_requests, window = self._configs.get(endpoint, (100, 60.0))
        self._buckets[key] = [t for t in self._buckets[key] if t > now - window]
        if len(self._buckets[key]) >= max_requests:
            oldest = min(self._buckets[key])
            reset_at = oldest + window
            retry_after = reset_at - now
            return RateLimitResult(
                allowed=False,
                remaining=0,
                limit=max_requests,
                reset_at=reset_at,
                retry_after=max(0, retry_after),
            )
        self._buckets[key].append(now)
        remaining = max_requests - len(self._buckets[key])
        return RateLimitResult(
            allowed=True,
            remaining=remaining,
            limit=max_requests,
            reset_at=now + window,
        )

    def reset(self, endpoint: str = "", client_id: str = "") -> None:
        if endpoint and client_id:
            key = f"{endpoint}:{client_id}"
            self._buckets.pop(key, None)
        elif endpoint:
            keys_to_remove = [k for k in self._buckets if k.startswith(f"{endpoint}:")]
            for k in keys_to_remove:
                del self._buckets[k]
        else:
            self._buckets.clear()


sanitizer = InputSanitizer()
sql_preventer = SQLInjectionPreventer()
path_preventer = PathTraversalPreventer()
file_validator = FileUploadValidator()
rate_limiter = EndpointRateLimiter()
