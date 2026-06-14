"""Structured JSON logging with correlation and sensitive-data masking.

Provides:
- JSON-formatted log records with timestamp, level, logger name, message
- Automatic correlation fields: request_id, user_id, tenant_id
- Sensitive data masking (passwords, tokens, credit cards, SSNs, emails, API keys)
- Context-aware logging via contextvars
"""
from __future__ import annotations

import json
import logging
import re
import sys
import traceback
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Optional

request_id_ctx: ContextVar[str] = ContextVar("structlog_request_id", default="")
user_id_ctx: ContextVar[str] = ContextVar("structlog_user_id", default="")
tenant_id_ctx: ContextVar[str] = ContextVar("structlog_tenant_id", default="")

SENSITIVE_KEYS = frozenset({
    "password", "passwd", "secret", "token", "api_key", "apikey",
    "authorization", "cookie", "session_id", "credit_card", "card_number",
    "cvv", "ssn", "social_security", "access_token", "refresh_token",
})

SENSITIVE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(?:\d[ -]*?){13,16}\b"), "***CARD***"),
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "***SSN***"),
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"), "***EMAIL***"),
    (re.compile(r"(?:Bearer\s+)[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE), "Bearer ***TOKEN***"),
    (re.compile(r"sk-[A-Za-z0-9]{20,}"), "***API_KEY***"),
]


def mask_value(key: str, value: Any) -> Any:
    if key.lower() in SENSITIVE_KEYS:
        return "***MASKED***"
    if isinstance(value, str):
        masked = value
        for pattern, replacement in SENSITIVE_PATTERNS:
            masked = pattern.sub(replacement, masked)
        return masked
    return value


def mask_dict(data: dict[str, Any]) -> dict[str, Any]:
    return {k: mask_value(k, v) for k, v in data.items()}


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            "process": record.process,
            "thread": record.thread,
        }

        rid = request_id_ctx.get("")
        if rid:
            log_entry["request_id"] = rid

        uid = user_id_ctx.get("")
        if uid:
            log_entry["user_id"] = uid

        tid = tenant_id_ctx.get("")
        if tid:
            log_entry["tenant_id"] = tid

        if hasattr(record, "extra_fields"):
            extra = mask_dict(record.extra_fields)
            log_entry.update(extra)

        if record.exc_info:
            exc_type, exc_value, exc_tb = record.exc_info
            if exc_type:
                log_entry["exception"] = {
                    "type": exc_type.__name__,
                    "message": str(exc_value),
                    "traceback": "".join(traceback.format_exception(exc_type, exc_value, exc_tb)),
                }

        return json.dumps(log_entry, default=str, ensure_ascii=False)


class StructuredLogger:
    def __init__(self, name: str, level: int = logging.DEBUG):
        self._logger = logging.getLogger(name)
        self._logger.setLevel(level)
        if not any(isinstance(h, logging.StreamHandler) and isinstance(h.formatter, JSONFormatter) for h in self._logger.handlers):
            handler = logging.StreamHandler(sys.stdout)
            handler.setFormatter(JSONFormatter())
            self._logger.addHandler(handler)
        self._logger.propagate = False

    def _log(self, level: int, message: str, **kwargs: Any) -> None:
        extra = kwargs.pop("extra_fields", {})
        extra.update(kwargs)
        record = self._logger.makeRecord(
            self._logger.name, level, "(structured)", 0,
            message, (), None,
        )
        record.extra_fields = extra
        self._logger.handle(record)

    def debug(self, message: str, **kwargs: Any) -> None:
        self._log(logging.DEBUG, message, **kwargs)

    def info(self, message: str, **kwargs: Any) -> None:
        self._log(logging.INFO, message, **kwargs)

    def warning(self, message: str, **kwargs: Any) -> None:
        self._log(logging.WARNING, message, **kwargs)

    def error(self, message: str, **kwargs: Any) -> None:
        self._log(logging.ERROR, message, **kwargs)

    def critical(self, message: str, **kwargs: Any) -> None:
        self._log(logging.CRITICAL, message, **kwargs)

    def set_correlation(self, request_id: str = "", user_id: str = "", tenant_id: str = "") -> None:
        if request_id:
            request_id_ctx.set(request_id)
        if user_id:
            user_id_ctx.set(user_id)
        if tenant_id:
            tenant_id_ctx.set(tenant_id)

    @property
    def logger(self) -> logging.Logger:
        return self._logger


def get_structured_logger(name: str, level: int = logging.DEBUG) -> StructuredLogger:
    return StructuredLogger(name, level)
