"""Log destinations: console, rotating file, CloudWatch, Datadog.

Each destination implements the LogDestination protocol and can be
attached to a StructuredLogger to route log output to multiple backends.
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from logging.handlers import RotatingFileHandler
from typing import Any, Optional, Protocol

from shared.logging.structured import JSONFormatter


class LogDestination(Protocol):
    def get_handler(self) -> logging.Handler: ...


class ConsoleDestination:
    def __init__(self, level: int = logging.DEBUG, use_colors: bool = True):
        self.level = level
        self.use_colors = use_colors

    def get_handler(self) -> logging.Handler:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(self.level)
        handler.setFormatter(JSONFormatter())
        return handler


class FileDestination:
    def __init__(
        self,
        filepath: str = "logs/airos.log",
        level: int = logging.INFO,
        max_bytes: int = 50 * 1024 * 1024,
        backup_count: int = 5,
    ):
        self.filepath = filepath
        self.level = level
        self.max_bytes = max_bytes
        self.backup_count = backup_count

    def get_handler(self) -> logging.Handler:
        log_dir = os.path.dirname(self.filepath)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        handler = RotatingFileHandler(
            self.filepath,
            maxBytes=self.max_bytes,
            backupCount=self.backup_count,
            encoding="utf-8",
        )
        handler.setLevel(self.level)
        handler.setFormatter(JSONFormatter())
        return handler


class CloudWatchDestination:
    def __init__(
        self,
        log_group: str = "/ai-ros/app",
        log_stream: Optional[str] = None,
        region: str = "eu-west-1",
        level: int = logging.INFO,
    ):
        self.log_group = log_group
        self.log_stream = log_stream or f"app-{int(time.time())}"
        self.region = region
        self.level = level
        self._buffer: list[dict[str, Any]] = []
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            try:
                import boto3
                self._client = boto3.client("logs", region_name=self.region)
            except Exception:
                self._client = None
        return self._client

    def get_handler(self) -> logging.Handler:
        handler = _CloudWatchHandler(self)
        handler.setLevel(self.level)
        return handler

    def send_batch(self, events: list[dict[str, Any]]) -> None:
        client = self._get_client()
        if client is None:
            return
        try:
            client.put_log_events(
                logGroupName=self.log_group,
                logStreamName=self.log_stream,
                logEvents=events,
            )
        except Exception:
            pass


class _CloudWatchHandler(logging.Handler):
    def __init__(self, destination: CloudWatchDestination):
        super().__init__()
        self.destination = destination
        self.setFormatter(JSONFormatter())

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            self.destination._buffer.append({
                "timestamp": int(record.created * 1000),
                "message": msg,
            })
            if len(self.destination._buffer) >= 50:
                self.destination.send_batch(self.destination._buffer)
                self.destination._buffer.clear()
        except Exception:
            self.handleError(record)


class DatadogDestination:
    def __init__(
        self,
        host: str = "localhost",
        port: int = 10518,
        level: int = logging.INFO,
        service: str = "ai-ros",
    ):
        self.host = host
        self.port = port
        self.level = level
        self.service = service

    def get_handler(self) -> logging.Handler:
        handler = _DatadogHandler(self)
        handler.setLevel(self.level)
        return handler


class _DatadogHandler(logging.Handler):
    def __init__(self, destination: DatadogDestination):
        super().__init__()
        self.destination = destination
        self.setFormatter(JSONFormatter())

    def emit(self, record: logging.LogRecord) -> None:
        try:
            import socket
            msg = self.format(record)
            parsed = json.loads(msg)
            parsed["service"] = self.destination.service
            payload = json.dumps(parsed, default=str) + "\n"
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                sock.sendto(payload.encode("utf-8"), (self.destination.host, self.destination.port))
            finally:
                sock.close()
        except Exception:
            self.handleError(record)


def create_destination(dest_type: str, **kwargs: Any) -> LogDestination:
    factories = {
        "console": ConsoleDestination,
        "file": FileDestination,
        "cloudwatch": CloudWatchDestination,
        "datadog": DatadogDestination,
    }
    factory = factories.get(dest_type)
    if factory is None:
        raise ValueError(f"Unknown destination type: {dest_type}. Available: {list(factories.keys())}")
    return factory(**kwargs)
