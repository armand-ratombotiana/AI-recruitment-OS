"""Prometheus metrics for AI-ROS.

Exposes the canonical HTTP and LLM metrics used by the platform.
All metrics are registered against the default global ``REGISTRY`` and
can be scraped from the ``/metrics`` endpoint on the unified app.
"""

from shared.metrics.collector import (  # noqa: F401
    HTTP_REQUESTS_TOTAL,
    HTTP_REQUEST_DURATION_SECONDS,
    HTTP_REQUESTS_IN_PROGRESS,
    BUSINESS_EVENTS_TOTAL,
    LLM_REQUESTS_TOTAL,
    LLM_REQUEST_DURATION_SECONDS,
    LLM_TOKENS_TOTAL,
    LLM_CACHE_HITS_TOTAL,
    MetricsMiddleware,
    track_business_event,
    track_llm_call,
    tracking,
    business_summary,
    render_prometheus_metrics,
    CONTENT_TYPE_LATEST,
)

__all__ = [
    "HTTP_REQUESTS_TOTAL",
    "HTTP_REQUEST_DURATION_SECONDS",
    "HTTP_REQUESTS_IN_PROGRESS",
    "BUSINESS_EVENTS_TOTAL",
    "LLM_REQUESTS_TOTAL",
    "LLM_REQUEST_DURATION_SECONDS",
    "LLM_TOKENS_TOTAL",
    "LLM_CACHE_HITS_TOTAL",
    "MetricsMiddleware",
    "track_business_event",
    "track_llm_call",
    "tracking",
    "business_summary",
    "render_prometheus_metrics",
    "CONTENT_TYPE_LATEST",
]
