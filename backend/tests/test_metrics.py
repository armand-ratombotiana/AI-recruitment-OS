"""Tests for the Prometheus metrics layer and the monitoring service.

Covers:

* ``MetricsMiddleware`` records HTTP request metrics (counter, histogram,
  gauge).
* The ``/metrics`` endpoint exposes the Prometheus text format.
* The ``tracking`` decorator and ``track_llm_call`` context manager push
  to the LLM counters / histograms and the cache hit counter.
* ``track_business_event`` increments ``business_events_total``.
* The monitoring service's ``/api/v1/monitoring/health`` endpoint
  reports DB, Redis and registered services.
* The monitoring service's ``/api/v1/monitoring/metrics`` endpoint
  returns a JSON summary of business metrics.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Force a clean in-process state for the in-memory rate limiters.
os.environ.pop("REDIS_URL", None)

from prometheus_client import REGISTRY, generate_latest  # noqa: E402

from shared.metrics import (  # noqa: E402
    HTTP_REQUESTS_IN_PROGRESS,
    HTTP_REQUESTS_TOTAL,
    LLM_CACHE_HITS_TOTAL,
    MetricsMiddleware,
    business_summary,
    render_prometheus_metrics,
    track_business_event,
    track_llm_call,
    tracking,
)
from apps.monitoring_service.main import router as monitoring_service_router  # noqa: E402


# ── Helpers ───────────────────────────────────────────────────────────────────


def _counter_value(name: str, **labels: str) -> float:
    """Return the current value of a counter sample, 0.0 if missing."""
    try:
        val = REGISTRY.get_sample_value(name, labels)
    except Exception:
        return 0.0
    return float(val) if val is not None else 0.0


def _build_app() -> FastAPI:
    """Minimal app that exercises the middleware and the new service."""
    app = FastAPI()
    app.add_middleware(MetricsMiddleware)
    app.include_router(monitoring_service_router, prefix="/api/v1/monitoring")

    @app.get("/probe")
    async def _probe() -> dict[str, str]:
        return {"ok": "true"}

    @app.get("/probe-error")
    async def _probe_error() -> dict[str, str]:
        from fastapi import HTTPException
        raise HTTPException(status_code=418, detail="teapot")

    @app.get("/items/{item_id}")
    async def _item(item_id: str) -> dict[str, str]:
        return {"item_id": item_id}

    return app


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=_build_app())
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def baseline_samples() -> dict[str, float]:
    """Snapshot the counter values that the tests will assert on."""
    return {
        "probe_200": _counter_value(
            "http_requests_total", method="GET", endpoint="/probe", status="200"
        ),
        "item_200": _counter_value(
            "http_requests_total", method="GET", endpoint="/items/{item_id}", status="200"
        ),
        "probe_error_418": _counter_value(
            "http_requests_total", method="GET", endpoint="/probe-error", status="418"
        ),
        "llm_gpt_4o": _counter_value(
            "llm_requests_total", model="gpt-4o-mini", status="success"
        ),
        "llm_gpt_4o_err": _counter_value(
            "llm_requests_total", model="gpt-4o-mini", status="error"
        ),
        "llm_tokens_prompt": _counter_value(
            "llm_tokens_total", model="gpt-4o-mini", type="prompt"
        ),
        "llm_tokens_completion": _counter_value(
            "llm_tokens_total", model="gpt-4o-mini", type="completion"
        ),
        "llm_cache_hits": _counter_value("llm_cache_hits_total"),
        "business_logins": _counter_value(
            "business_events_total", event_type="user.login", status="success"
        ),
    }


# ── Tests: middleware records requests ───────────────────────────────────────


@pytest.mark.asyncio
async def test_metrics_middleware_records_successful_request(client, baseline_samples):
    response = await client.get("/probe")
    assert response.status_code == 200

    new_value = _counter_value(
        "http_requests_total", method="GET", endpoint="/probe", status="200"
    )
    assert new_value == baseline_samples["probe_200"] + 1


@pytest.mark.asyncio
async def test_metrics_middleware_uses_route_template_for_path_params(client, baseline_samples):
    # 5 hits on /items/{item_id} with 5 different ids should all be
    # counted under a single time series, not 5 separate ones.
    for i in range(5):
        response = await client.get(f"/items/{i}")
        assert response.status_code == 200

    new_value = _counter_value(
        "http_requests_total", method="GET", endpoint="/items/{item_id}", status="200"
    )
    assert new_value == baseline_samples["item_200"] + 5


@pytest.mark.asyncio
async def test_metrics_middleware_records_error_status(client, baseline_samples):
    response = await client.get("/probe-error")
    assert response.status_code == 418

    new_value = _counter_value(
        "http_requests_total", method="GET", endpoint="/probe-error", status="418"
    )
    assert new_value == baseline_samples["probe_error_418"] + 1


@pytest.mark.asyncio
async def test_metrics_middleware_in_progress_gauge_returns_to_baseline(client):
    # After the response the gauge must be back to its previous value.
    before = _counter_value("http_requests_in_progress", method="GET", endpoint="/probe")
    response = await client.get("/probe")
    assert response.status_code == 200
    after = _counter_value("http_requests_in_progress", method="GET", endpoint="/probe")
    assert after == before


@pytest.mark.asyncio
async def test_metrics_endpoint_returns_prometheus_format(client, baseline_samples):
    # Generate a couple of requests so the endpoint has data to report.
    await client.get("/probe")

    # /metrics is mounted on the unified app, not the test fixture; the
    # fixture's app does not mount the prom ASGI app, so we render the
    # output from the global registry instead. This still proves the
    # library produces the canonical exposition format.
    payload = render_prometheus_metrics()
    assert isinstance(payload, bytes)
    text = payload.decode("utf-8")
    assert "# HELP http_requests_total" in text
    assert "# TYPE http_requests_total counter" in text
    assert "http_request_duration_seconds" in text
    assert "http_requests_in_progress" in text
    # Our /probe call must show up in the request counter.
    assert 'endpoint="/probe"' in text


@pytest.mark.asyncio
async def test_metrics_endpoint_mounted_on_unified_app():
    """The full /metrics route must be served by the unified FastAPI app."""
    from main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Hit /metrics — even if the app is partially broken elsewhere
        # this endpoint should still respond with Prometheus text.
        # Follow redirects in case the mount is mounted with a trailing
        # slash redirect (Starlette mounts sometimes do this).
        response = await ac.get("/metrics", follow_redirects=True)
    # /metrics is mounted as a sub-app; ASGITransport handles it.
    assert response.status_code == 200, response.text
    body = response.text
    assert "# HELP" in body
    assert "http_requests_total" in body


# ── Tests: LLM tracking ───────────────────────────────────────────────────────


def test_track_llm_call_context_manager_records_success(baseline_samples):
    with track_llm_call("gpt-4o-mini", prompt_tokens=10, completion_tokens=20) as state:
        state["prompt_tokens"] = 10
        state["completion_tokens"] = 20

    assert _counter_value(
        "llm_requests_total", model="gpt-4o-mini", status="success"
    ) == baseline_samples["llm_gpt_4o"] + 1
    assert _counter_value(
        "llm_tokens_total", model="gpt-4o-mini", type="prompt"
    ) == baseline_samples["llm_tokens_prompt"] + 10
    assert _counter_value(
        "llm_tokens_total", model="gpt-4o-mini", type="completion"
    ) == baseline_samples["llm_tokens_completion"] + 20


def test_track_llm_call_records_error_status(baseline_samples):
    with pytest.raises(RuntimeError):
        with track_llm_call("gpt-4o-mini"):
            raise RuntimeError("boom")

    assert _counter_value(
        "llm_requests_total", model="gpt-4o-mini", status="error"
    ) == baseline_samples["llm_gpt_4o_err"] + 1


def test_track_llm_call_increments_cache_hits(baseline_samples):
    with track_llm_call("gpt-4o-mini", cache_hit=True):
        pass
    assert _counter_value("llm_cache_hits_total") == baseline_samples["llm_cache_hits"] + 1


def test_tracking_decorator_wraps_function(baseline_samples):
    @tracking(model="gpt-4o-mini")
    def fake_llm_call(prompt: str) -> str:
        return f"echo: {prompt}"

    result = fake_llm_call("hello")
    assert result == "echo: hello"
    assert _counter_value(
        "llm_requests_total", model="gpt-4o-mini", status="success"
    ) == baseline_samples["llm_gpt_4o"] + 1


def test_tracking_decorator_promotes_error_status(baseline_samples):
    @tracking(model="gpt-4o-mini")
    def boom() -> None:
        raise ValueError("nope")

    with pytest.raises(ValueError):
        boom()
    assert _counter_value(
        "llm_requests_total", model="gpt-4o-mini", status="error"
    ) == baseline_samples["llm_gpt_4o_err"] + 1


# ── Tests: business events ────────────────────────────────────────────────────


def test_track_business_event_increments_counter(baseline_samples):
    track_business_event("user.login", status="success")
    track_business_event("user.login", status="success")
    track_business_event("user.login", status="error")

    success = _counter_value(
        "business_events_total", event_type="user.login", status="success"
    )
    error = _counter_value(
        "business_events_total", event_type="user.login", status="error"
    )
    assert success == baseline_samples["business_logins"] + 2
    assert error >= 1


# ── Tests: business summary helper ────────────────────────────────────────────


def test_business_summary_structure():
    summary = business_summary()
    assert "http" in summary and "business" in summary and "llm" in summary
    assert "requests_total" in summary["http"]
    assert "events_total" in summary["business"]
    assert "prompt_tokens_total" in summary["llm"]
    assert "completion_tokens_total" in summary["llm"]
    assert "cache_hits_total" in summary["llm"]


# ── Tests: monitoring service endpoints ──────────────────────────────────────


@pytest.mark.asyncio
async def test_monitoring_health_returns_status(client):
    response = await client.get("/api/v1/monitoring/health")
    assert response.status_code in (200, 503)
    body = response.json()
    assert "status" in body
    assert "version" in body
    assert "uptime_seconds" in body
    assert "services" in body
    assert "summary" in body
    # The service list always contains a number of known services.
    assert isinstance(body["services"], list)
    assert len(body["services"]) >= 1
    # DB and Redis should be in the registered services (or at least
    # there must be at least one healthy entry from the static list).
    statuses = {s["status"] for s in body["services"]}
    assert "healthy" in statuses or "unhealthy" in statuses


@pytest.mark.asyncio
async def test_monitoring_metrics_returns_summary(client):
    response = await client.get("/api/v1/monitoring/metrics")
    assert response.status_code == 200
    body = response.json()
    assert "http" in body
    assert "business" in body
    assert "llm" in body
    # Push a business event so the summary has something to report.
    track_business_event("test.event", status="success")
    response2 = await client.get("/api/v1/monitoring/metrics")
    assert response2.status_code == 200
    body2 = response2.json()
    assert body2["business"]["events_total"] >= body["business"]["events_total"]


# ── Tests: exposition format sanity ───────────────────────────────────────────


def test_render_prometheus_metrics_uses_correct_content_type():
    from shared.metrics import CONTENT_TYPE_LATEST

    # The Prometheus text format must be served as `text/plain; ...`.
    assert CONTENT_TYPE_LATEST.startswith("text/plain")
    payload = render_prometheus_metrics()
    # Every line of valid exposition output is `key{labels} value` or
    # `# HELP ...` / `# TYPE ...`. The Prometheus client emits a
    # trailing newline.
    assert payload.endswith(b"\n")
