"""Production-grade in-process monitoring & observability.

Provides:
- Per-endpoint request counters and latency histograms (Prometheus-style)
- A live request log kept in a bounded ring buffer (in-memory)
- Active-user tracking (5-minute sliding window)
- Exposed via the `/api/v1/monitoring/*` endpoints (curated, JSON)
- Exposed via the `/metrics` Prometheus endpoint (text format)

All collectors are designed to be cheap on the hot path:
- Counters/Histograms use a small fixed-cost dict update.
- The ring buffer is bounded (MAX_SAMPLES) so memory cannot grow.
- The active-user set is expired lazily on each record.

If `prometheus_client` is not installed the module falls back to the
no-op behaviour already used by the rest of the observability layer —
the API still works, only the `/metrics` output is disabled.
"""
from __future__ import annotations

import bisect
import math
import os
import threading
import time
from collections import deque
from typing import Any, Deque, Optional

try:
    from prometheus_client import Counter, Gauge, Histogram
    _PROM_AVAILABLE = True
except Exception:  # pragma: no cover - fallback when prom is missing
    _PROM_AVAILABLE = False

# ── Constants ────────────────────────────────────────────────────────────────

MAX_SAMPLES = int(os.getenv("AIROS_MONITORING_SAMPLES", "5000"))
ACTIVE_USER_WINDOW_S = 300  # 5 minutes
TOP_N = 10

# Histogram buckets for HTTP latency, in seconds. Tuned for a typical
# CRUD + LLM-backed service: sub-millisecond cache hits up to 30-second
# LLM timeouts.
_LATENCY_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30)

# Same buckets but for the slower AI orchestration path.
_AI_BUCKETS = (0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120)


# ── Prometheus custom metrics ────────────────────────────────────────────────
# Use a no-op stub when prometheus_client is unavailable so that importing
# this module never breaks the application.


class _NoopMetric:
    def __init__(self, *_, **__):
        pass

    def labels(self, *_, **__):
        return self

    def inc(self, *_):
        pass

    def dec(self, *_):
        pass

    def set(self, *_):
        pass

    def observe(self, *_):
        pass


def _make_counter(name: str, doc: str, labels: list[str]):
    return Counter(name, doc, labels) if _PROM_AVAILABLE else _NoopMetric()


def _make_histogram(name: str, doc: str, labels: list[str], buckets: tuple):
    return Histogram(name, doc, labels, buckets=buckets) if _PROM_AVAILABLE else _NoopMetric()


def _make_gauge(name: str, doc: str):
    return Gauge(name, doc) if _PROM_AVAILABLE else _NoopMetric()


PROM_REQUESTS_TOTAL = _make_counter(
    "airos_requests_total",
    "Total HTTP requests handled by AI-ROS",
    ["endpoint", "method", "status"],
)
PROM_REQUEST_DURATION = _make_histogram(
    "airos_request_duration_seconds",
    "HTTP request latency in seconds",
    ["endpoint", "method"],
    _LATENCY_BUCKETS,
)
PROM_ACTIVE_USERS = _make_gauge(
    "airos_active_users",
    "Authenticated users active in the last 5 minutes",
)
PROM_AI_ORCHESTRATION_DURATION = _make_histogram(
    "airos_ai_orchestration_duration_seconds",
    "AI orchestration task duration in seconds",
    ["agent_type"],
    _AI_BUCKETS,
)
PROM_BILLING_WEBHOOK = _make_counter(
    "airos_billing_webhook_total",
    "Billing webhook events received, by event type and status",
    ["event_type", "status"],
)
PROM_ERRORS = _make_counter(
    "airos_errors_total",
    "HTTP errors by endpoint and error class",
    ["endpoint", "error_type"],
)


# ── In-process state ────────────────────────────────────────────────────────


class _PercentileWindow:
    """Sliding window with O(log n) percentile computation.

    Stores (timestamp, value) tuples in a deque and keeps a parallel
    sorted list of values for fast percentile queries. The sorted list is
    re-built on demand — cheap because the window is bounded by
    MAX_SAMPLES and percentile queries are infrequent (dashboard polls).
    """

    __slots__ = ("_buf",)

    def __init__(self, maxlen: int = MAX_SAMPLES) -> None:
        self._buf: Deque[tuple[float, float]] = deque(maxlen=maxlen)

    def add(self, ts: float, value: float) -> None:
        self._buf.append((ts, value))

    def __len__(self) -> int:
        return len(self._buf)

    def values(self) -> list[float]:
        return [v for _, v in self._buf]

    def percentile(self, p: float) -> float:
        if not self._buf:
            return 0.0
        sorted_vals = sorted(self.values())
        if len(sorted_vals) == 1:
            return sorted_vals[0]
        k = (len(sorted_vals) - 1) * p
        f = math.floor(k)
        c = math.ceil(k)
        if f == c:
            return sorted_vals[int(k)]
        return sorted_vals[f] * (c - k) + sorted_vals[c] * (k - f)

    def p50(self) -> float:
        return self.percentile(0.50)

    def p95(self) -> float:
        return self.percentile(0.95)

    def p99(self) -> float:
        return self.percentile(0.99)


class MonitoringStore:
    """Thread-safe aggregator for request metrics."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._started = time.time()
        # endpoint_key -> window
        self._latency: dict[str, _PercentileWindow] = {}
        # endpoint_key -> status -> count
        self._count: dict[tuple[str, str, str], int] = {}
        # endpoint_key -> count
        self._endpoint_totals: dict[str, int] = {}
        # error_type -> count
        self._errors: dict[tuple[str, str], int] = {}
        # user_id -> last_seen_ts
        self._active_users: dict[str, float] = {}
        # agent_type -> window
        self._ai_latency: dict[str, _PercentileWindow] = {}
        # event_type -> status -> count
        self._billing_webhook: dict[tuple[str, str], int] = {}
        # sample ring buffer (most recent requests)
        self._samples: Deque[dict[str, Any]] = deque(maxlen=MAX_SAMPLES)

    # ── Recording API (hot path) ──────────────────────────────────────────

    def record_request(
        self,
        endpoint: str,
        method: str,
        status_code: int,
        duration_s: float,
        user_id: Optional[str] = None,
        error_type: Optional[str] = None,
    ) -> None:
        status = str(status_code)
        key = (endpoint, method, status)

        with self._lock:
            # Latency window per (endpoint, method)
            wkey = f"{method} {endpoint}"
            w = self._latency.get(wkey)
            if w is None:
                w = _PercentileWindow()
                self._latency[wkey] = w
            w.add(time.time(), duration_s)

            # Counters
            self._count[key] = self._count.get(key, 0) + 1
            self._endpoint_totals[endpoint] = self._endpoint_totals.get(endpoint, 0) + 1

            # Errors
            if error_type:
                ekey = (endpoint, error_type)
                self._errors[ekey] = self._errors.get(ekey, 0) + 1

            # Active users (lazy expire)
            if user_id:
                self._active_users[user_id] = time.time()

            # Sample ring buffer
            self._samples.append({
                "ts": time.time(),
                "endpoint": endpoint,
                "method": method,
                "status": status,
                "duration_ms": round(duration_s * 1000, 2),
                "user_id": user_id,
                "error_type": error_type,
            })

        # Prometheus (labelled) — these are safe to call unlocked
        try:
            PROM_REQUESTS_TOTAL.labels(endpoint=endpoint, method=method, status=status).inc()
            PROM_REQUEST_DURATION.labels(endpoint=endpoint, method=method).observe(duration_s)
            if error_type:
                PROM_ERRORS.labels(endpoint=endpoint, error_type=error_type).inc()
            if user_id:
                PROM_ACTIVE_USERS.set(self.active_users_count())
        except Exception:  # pragma: no cover - never let metrics break the app
            pass

    def record_ai_orchestration(self, agent_type: str, duration_s: float) -> None:
        with self._lock:
            w = self._ai_latency.get(agent_type)
            if w is None:
                w = _PercentileWindow()
                self._ai_latency[agent_type] = w
            w.add(time.time(), duration_s)
        try:
            PROM_AI_ORCHESTRATION_DURATION.labels(agent_type=agent_type).observe(duration_s)
        except Exception:
            pass

    def record_billing_webhook(self, event_type: str, status: str) -> None:
        with self._lock:
            key = (event_type, status)
            self._billing_webhook[key] = self._billing_webhook.get(key, 0) + 1
        try:
            PROM_BILLING_WEBHOOK.labels(event_type=event_type, status=status).inc()
        except Exception:
            pass

    # ── Query API (read-only, called from dashboard endpoints) ───────────

    def active_users_count(self) -> int:
        cutoff = time.time() - ACTIVE_USER_WINDOW_S
        with self._lock:
            # Drop expired entries
            expired = [uid for uid, ts in self._active_users.items() if ts < cutoff]
            for uid in expired:
                self._active_users.pop(uid, None)
            return len(self._active_users)

    def summary(self) -> dict[str, Any]:
        with self._lock:
            now = time.time()
            uptime_s = now - self._started
            total_requests = sum(self._count.values())
            # Status breakdown
            by_status: dict[str, int] = {}
            for (_ep, _m, status), n in self._count.items():
                by_status[status] = by_status.get(status, 0) + n
            # Error rate
            errors = sum(n for s, n in by_status.items() if s.startswith(("4", "5")))
            error_rate = (errors / total_requests) if total_requests else 0.0
            # Latency aggregate (across all endpoints)
            all_values: list[float] = []
            for w in self._latency.values():
                all_values.extend(w.values())
            all_values.sort()
            p50 = _percentile(all_values, 0.50)
            p95 = _percentile(all_values, 0.95)
            p99 = _percentile(all_values, 0.99)
            # Top endpoints by request count
            top_endpoints = sorted(
                self._endpoint_totals.items(), key=lambda kv: kv[1], reverse=True
            )[:TOP_N]
            # Top errors
            top_errors = sorted(
                ({"endpoint": ep, "error_type": et, "count": n} for (ep, et), n in self._errors.items()),
                key=lambda d: d["count"], reverse=True,
            )[:TOP_N]
            return {
                "uptime_seconds": round(uptime_s, 1),
                "started_at": self._started,
                "total_requests": total_requests,
                "active_users_5m": self.active_users_count(),
                "error_rate": round(error_rate, 4),
                "by_status": dict(sorted(by_status.items())),
                "latency_seconds": {
                    "p50": round(p50, 4),
                    "p95": round(p95, 4),
                    "p99": round(p99, 4),
                    "samples": len(all_values),
                },
                "top_endpoints": [
                    {"endpoint": ep, "count": n} for ep, n in top_endpoints
                ],
                "top_errors": top_errors,
                "endpoints_tracked": len(self._endpoint_totals),
                "ai_orchestration": {
                    a: {
                        "p50_s": round(w.p50(), 4),
                        "p95_s": round(w.p95(), 4),
                        "p99_s": round(w.p99(), 4),
                        "samples": len(w),
                    }
                    for a, w in self._ai_latency.items()
                },
                "billing_webhooks": {
                    f"{et}|{st}": n for (et, st), n in self._billing_webhook.items()
                },
            }

    def endpoint_detail(self, endpoint: str) -> dict[str, Any]:
        with self._lock:
            rows = []
            for (ep, method, status), n in self._count.items():
                if ep != endpoint:
                    continue
                w = self._latency.get(f"{method} {ep}")
                rows.append({
                    "method": method,
                    "status": status,
                    "count": n,
                    "p50_ms": round(w.p50() * 1000, 2) if w else 0.0,
                    "p95_ms": round(w.p95() * 1000, 2) if w else 0.0,
                    "p99_ms": round(w.p99() * 1000, 2) if w else 0.0,
                })
            return {"endpoint": endpoint, "rows": rows}

    def recent_samples(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._samples)[-limit:][::-1]


def _percentile(sorted_values: list[float], p: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    k = (len(sorted_values) - 1) * p
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_values[int(k)]
    return sorted_values[f] * (c - k) + sorted_values[c] * (k - f)


# ── Singleton ────────────────────────────────────────────────────────────────


store = MonitoringStore()


# ── FastAPI router ───────────────────────────────────────────────────────────

from fastapi import APIRouter, Query  # noqa: E402  (deferred import on purpose)

monitoring_router = APIRouter(prefix="/api/v1/monitoring", tags=["Monitoring"])


@monitoring_router.get("/metrics", summary="Curated in-process metrics (JSON)")
def get_metrics() -> dict[str, Any]:
    """Lightweight JSON snapshot of in-process metrics.

    Use this for dashboards that do not require the full Prometheus
    exposition format. For Prometheus scraping use `/metrics` at the
    application root.
    """
    return store.summary()


@monitoring_router.get("/health-summary", summary="Compact health & traffic summary")
def health_summary() -> dict[str, Any]:
    s = store.summary()
    return {
        "status": "healthy" if s["error_rate"] < 0.05 else "degraded",
        "uptime_seconds": s["uptime_seconds"],
        "total_requests": s["total_requests"],
        "active_users_5m": s["active_users_5m"],
        "error_rate": s["error_rate"],
        "latency_p95_s": s["latency_seconds"]["p95"],
        "p95_under_2s": s["latency_seconds"]["p95"] < 2.0,
    }


@monitoring_router.get("/active-users", summary="Currently active users (5m window)")
def active_users() -> dict[str, Any]:
    return {
        "active_users_5m": store.active_users_count(),
        "window_seconds": ACTIVE_USER_WINDOW_S,
    }


@monitoring_router.get("/endpoint", summary="Per-endpoint breakdown")
def endpoint_detail(endpoint: str = Query(..., min_length=1)) -> dict[str, Any]:
    return store.endpoint_detail(endpoint)


@monitoring_router.get("/samples", summary="Recent request samples")
def recent_samples(limit: int = Query(100, ge=1, le=1000)) -> dict[str, Any]:
    return {"samples": store.recent_samples(limit), "count": min(limit, len(store._samples))}


__all__ = [
    "store",
    "monitoring_router",
    "MAX_SAMPLES",
    "ACTIVE_USER_WINDOW_S",
    "PROM_REQUESTS_TOTAL",
    "PROM_REQUEST_DURATION",
    "PROM_ACTIVE_USERS",
    "PROM_AI_ORCHESTRATION_DURATION",
    "PROM_BILLING_WEBHOOK",
    "PROM_ERRORS",
]
