"""Prometheus metrics collectors, middleware and LLM tracking decorator.

This module is the canonical source of truth for HTTP and LLM observability
in AI-ROS. It registers a small, well-known set of metrics on the default
Prometheus registry and provides:

* :class:`MetricsMiddleware` — records ``http_requests_total``,
  ``http_request_duration_seconds`` and ``http_requests_in_progress``.
* :func:`track_llm_call` / :func:`tracking` — context-manager + decorator
  helpers for wrapping LLM calls so token usage, latency and status are
  pushed to ``llm_*`` metrics.
* :func:`track_business_event` — increments :data:`BUSINESS_EVENTS_TOTAL`.
* :func:`render_prometheus_metrics` — text exposition format for the
  ``/metrics`` HTTP endpoint.
* :func:`business_summary` — JSON snapshot of the business metrics for
  the monitoring service dashboard.
"""
from __future__ import annotations

import functools
import time
from contextlib import contextmanager
from typing import Any, Callable, Iterator, Optional

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)


# ── Histogram buckets ─────────────────────────────────────────────────────────

# Tuned for typical CRUD + LLM-backed services: sub-millisecond cache
# hits up to 30-second LLM timeouts.
HTTP_LATENCY_BUCKETS = (
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30,
)

# Same idea but shifted for the slower LLM path.
LLM_LATENCY_BUCKETS = (
    0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120,
)


# ── Metric definitions ─────────────────────────────────────────────────────────

HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total HTTP requests processed by AI-ROS, by method/endpoint/status.",
    labelnames=("method", "endpoint", "status"),
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds, by method/endpoint.",
    labelnames=("method", "endpoint"),
    buckets=HTTP_LATENCY_BUCKETS,
)

HTTP_REQUESTS_IN_PROGRESS = Gauge(
    "http_requests_in_progress",
    "Number of HTTP requests currently in flight, by method/endpoint.",
    labelnames=("method", "endpoint"),
)

BUSINESS_EVENTS_TOTAL = Counter(
    "business_events_total",
    "Business-level events emitted by AI-ROS services.",
    labelnames=("event_type", "status"),
)

LLM_REQUESTS_TOTAL = Counter(
    "llm_requests_total",
    "Total LLM calls, by model and outcome status.",
    labelnames=("model", "status"),
)

LLM_REQUEST_DURATION_SECONDS = Histogram(
    "llm_request_duration_seconds",
    "LLM call latency in seconds, by model.",
    labelnames=("model",),
    buckets=LLM_LATENCY_BUCKETS,
)

LLM_TOKENS_TOTAL = Counter(
    "llm_tokens_total",
    "LLM tokens consumed, by model and type (prompt|completion).",
    labelnames=("model", "type"),
)

LLM_CACHE_HITS_TOTAL = Counter(
    "llm_cache_hits_total",
    "Total LLM cache hits served from the response cache.",
)


# ── Endpoint normalisation ─────────────────────────────────────────────────────


def _normalise_endpoint(scope: dict[str, Any]) -> str:
    """Return a low-cardinality label for a request's matched route.

    FastAPI's ``request.scope["path"]`` is the raw URL path which would
    explode the cardinality of the metric (one series per candidate id,
    job id, etc.). When a route has been matched we have access to the
    route template (``/candidates/{candidate_id}``) which is what we
    want to label the metric with.
    """
    route = scope.get("route")
    if route is not None and getattr(route, "path", None):
        return route.path
    path = scope.get("path") or ""
    # Fall back to the literal path but keep it bounded by dropping
    # obvious id-like segments.
    if path.startswith(("/api/", "/health", "/metrics", "/docs", "/redoc", "/openapi.json")):
        return path
    return "other"


# ── Middleware ─────────────────────────────────────────────────────────────────


class MetricsMiddleware:
    """ASGI middleware that records HTTP request metrics.

    Works without depending on Starlette's ``BaseHTTPMiddleware`` so it
    integrates cleanly with the rest of the ASGI stack. Skips a small
    allowlist of paths (probes, docs, the metrics endpoint itself) so
    scrapes do not pollute the data.
    """

    _SKIP_PREFIXES = ("/metrics",)
    _SKIP_EXACT = {"/favicon.ico"}

    def __init__(self, app: Callable) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Callable, send: Callable) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "") or ""
        if any(path.startswith(p) for p in self._SKIP_PREFIXES) or path in self._SKIP_EXACT:
            await self.app(scope, receive, send)
            return

        method = (scope.get("method") or "GET").upper()
        # The matched route (e.g. ``/items/{item_id}``) is added to
        # ``scope`` by Starlette's router *during* the call below, so
        # we resolve the endpoint label afterwards to keep cardinality
        # low.
        HTTP_REQUESTS_IN_PROGRESS.labels(method=method, endpoint="unmatched").inc()
        start = time.perf_counter()
        status_holder = {"code": 500}

        async def _send(message: dict[str, Any]) -> None:
            if message.get("type") == "http.response.start":
                status_holder["code"] = int(message.get("status", 500))
            await send(message)

        try:
            await self.app(scope, receive, _send)
        except Exception:
            status_holder["code"] = 500
            HTTP_REQUESTS_IN_PROGRESS.labels(method=method, endpoint="unmatched").dec()
            raise

        endpoint = _normalise_endpoint(scope)
        HTTP_REQUESTS_IN_PROGRESS.labels(method=method, endpoint="unmatched").dec()
        HTTP_REQUESTS_IN_PROGRESS.labels(method=method, endpoint=endpoint).inc()
        elapsed = time.perf_counter() - start
        status = str(status_holder["code"])
        HTTP_REQUESTS_TOTAL.labels(method=method, endpoint=endpoint, status=status).inc()
        HTTP_REQUEST_DURATION_SECONDS.labels(method=method, endpoint=endpoint).observe(elapsed)
        HTTP_REQUESTS_IN_PROGRESS.labels(method=method, endpoint=endpoint).dec()


# ── LLM tracking ──────────────────────────────────────────────────────────────


_VALID_TOKEN_TYPES = {"prompt", "completion"}


@contextmanager
def track_llm_call(
    model: str,
    *,
    cache_hit: bool = False,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
) -> Iterator[dict[str, Any]]:
    """Context manager that records LLM latency, status and token usage.

    Usage::

        with track_llm_call("gpt-4o-mini") as t:
            response = client.chat(...)
            t["prompt_tokens"] = response.usage.prompt_tokens
            t["completion_tokens"] = response.usage.completion_tokens

    The ``status`` defaults to ``"success"``; it is flipped to
    ``"error"`` if the wrapped block raises. Tokens are credited to
    ``llm_tokens_total{model, type}``.
    """
    state: dict[str, Any] = {
        "status": "success",
        "prompt_tokens": int(prompt_tokens),
        "completion_tokens": int(completion_tokens),
        "cache_hit": bool(cache_hit),
    }
    start = time.perf_counter()
    if cache_hit:
        LLM_CACHE_HITS_TOTAL.inc()
    try:
        yield state
    except Exception:
        state["status"] = "error"
        raise
    finally:
        elapsed = time.perf_counter() - start
        LLM_REQUESTS_TOTAL.labels(model=model, status=state["status"]).inc()
        LLM_REQUEST_DURATION_SECONDS.labels(model=model).observe(elapsed)
        pt = int(state.get("prompt_tokens", 0) or 0)
        ct = int(state.get("completion_tokens", 0) or 0)
        if pt:
            LLM_TOKENS_TOTAL.labels(model=model, type="prompt").inc(pt)
        if ct:
            LLM_TOKENS_TOTAL.labels(model=model, type="completion").inc(ct)


def tracking(
    model: Optional[str] = None,
    *,
    cache_hit_attr: Optional[str] = None,
    prompt_tokens_attr: Optional[str] = None,
    completion_tokens_attr: Optional[str] = None,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator wrapper around :func:`track_llm_call`.

    The decorated callable may either:
      * receive ``model`` as the first argument (in which case it is used
        as the LLM model label);
      * be configured with a literal ``model=`` value;
      * return a mapping exposing ``cache_hit`` / ``prompt_tokens`` /
        ``completion_tokens`` attributes (configurable via kwargs).

    The decorator forwards ``*args, **kwargs`` unchanged and returns the
    wrapped callable's return value (or re-raises its exception) so it is
    a transparent wrapper.
    """
    def _decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(fn)
        def _wrapper(*args: Any, **kwargs: Any) -> Any:
            chosen_model = model
            if chosen_model is None and args and isinstance(args[0], str):
                chosen_model = args[0]
            if not chosen_model:
                chosen_model = getattr(fn, "__qualname__", "unknown")

            with track_llm_call(chosen_model) as state:
                result = fn(*args, **kwargs)
                if cache_hit_attr and hasattr(result, cache_hit_attr):
                    state["cache_hit"] = bool(getattr(result, cache_hit_attr))
                if prompt_tokens_attr and hasattr(result, prompt_tokens_attr):
                    state["prompt_tokens"] = int(getattr(result, prompt_tokens_attr) or 0)
                if completion_tokens_attr and hasattr(result, completion_tokens_attr):
                    state["completion_tokens"] = int(getattr(result, completion_tokens_attr) or 0)
                return result
        return _wrapper
    return _decorator


# ── Business events ───────────────────────────────────────────────────────────


def track_business_event(event_type: str, status: str = "success", *, amount: int = 1) -> None:
    """Increment the business event counter.

    ``status`` is typically ``"success"`` or ``"error"`` but is
    deliberately unconstrained to allow custom event statuses
    (``"queued"``, ``"retry"`` etc.).
    """
    BUSINESS_EVENTS_TOTAL.labels(event_type=event_type, status=status).inc(amount)


# ── Prometheus exposition ─────────────────────────────────────────────────────


def render_prometheus_metrics() -> bytes:
    """Return the Prometheus text exposition for the default registry."""
    return generate_latest()


# ── Business summary (JSON) ────────────────────────────────────────────────────


def business_summary() -> dict[str, Any]:
    """Return a JSON-friendly snapshot of the business metrics.

    The format is intentionally simple: counts are aggregated by label
    set, suitable for the monitoring service dashboard.
    """
    from prometheus_client import REGISTRY

    def _metric_samples(name: str) -> list[Any]:
        try:
            metric = REGISTRY.get_sample_value(name, {})  # type: ignore[arg-type]
        except Exception:
            metric = None
        return metric  # noqa: RET504

    # Pull per-label samples for each counter/histogram so we can build
    # a human-friendly view.
    def _collect_counter(counter: Counter) -> dict[tuple[str, ...], float]:
        out: dict[tuple[str, ...], float] = {}
        for metric in REGISTRY.collect():
            if metric.name != counter._name:  # type: ignore[attr-defined]
                continue
            for sample in metric.samples:
                if sample.name.endswith("_total"):
                    out[tuple(sample.labels.items())] = float(sample.value)
        return out

    def _collect_histogram_sum(hist: Histogram) -> float:
        total = 0.0
        for metric in REGISTRY.collect():
            if metric.name != hist._name:  # type: ignore[attr-defined]
                continue
            for sample in metric.samples:
                if sample.name.endswith("_sum"):
                    total += float(sample.value)
        return total

    def _collect_gauge(gauge: Gauge) -> float:
        try:
            value = REGISTRY.get_sample_value(gauge._name)  # type: ignore[attr-defined]
        except Exception:
            value = None
        return float(value) if value is not None else 0.0

    http_total = _collect_counter(HTTP_REQUESTS_TOTAL)
    http_total_value = sum(http_total.values())
    business = _collect_counter(BUSINESS_EVENTS_TOTAL)
    llm = _collect_counter(LLM_REQUESTS_TOTAL)
    llm_total = sum(llm.values())
    tokens = _collect_counter(LLM_TOKENS_TOTAL)
    prompt_tokens = sum(v for labels, v in tokens.items() if dict(labels).get("type") == "prompt")
    completion_tokens = sum(v for labels, v in tokens.items() if dict(labels).get("type") == "completion")
    cache_hits = _metric_samples(LLM_CACHE_HITS_TOTAL._name + "_total") or 0.0  # type: ignore[attr-defined]

    return {
        "http": {
            "requests_total": http_total_value,
            "requests_by_status": {
                dict(labels).get("status", "unknown"): int(v)
                for labels, v in http_total.items()
            },
            "duration_seconds_sum": _collect_histogram_sum(HTTP_REQUEST_DURATION_SECONDS),
            "in_progress": _collect_gauge(HTTP_REQUESTS_IN_PROGRESS),
        },
        "business": {
            "events_total": sum(business.values()),
            "by_event_type": {
                dict(labels).get("event_type", "unknown"): int(v)
                for labels, v in business.items()
            },
        },
        "llm": {
            "requests_total": llm_total,
            "requests_by_status": {
                dict(labels).get("status", "unknown"): int(v)
                for labels, v in llm.items()
            },
            "duration_seconds_sum": _collect_histogram_sum(LLM_REQUEST_DURATION_SECONDS),
            "prompt_tokens_total": int(prompt_tokens),
            "completion_tokens_total": int(completion_tokens),
            "cache_hits_total": int(cache_hits),
        },
    }
