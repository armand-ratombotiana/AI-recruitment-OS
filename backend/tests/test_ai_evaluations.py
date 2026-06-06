"""Tests for the new AI evaluation endpoints and the LLM response cache.

Covers:

* :class:`shared.ai.cache.LLMCache` — LRU semantics, TTL expiry, stats,
  key derivation.
* :class:`shared.ai.llm_router.LLMRouter` cache integration — hit returns
  cached payload without dispatching, miss dispatches and caches.
* ``POST /api/v1/ai/evaluate-resume`` — parses + scores a resume.
* ``POST /api/v1/ai/parse-job-description`` — extracts structured JD data.
* ``POST /api/v1/ai/suggest-improvements`` — suggests posting rewrites.
* ``POST /api/v1/ai/detect-bias`` — flags biased language.
* Tenant isolation — calls from tenant A do not leak into tenant B's
  cache and the prompt fingerprints differ across tenants.

Every test runs against an in-process FastAPI app that mounts only the
AI orchestrator router (no rate limiter / no DB dependency).  The LLM
router is monkey-patched with a deterministic fake that records every
call so we can assert hit/miss behaviour without touching a real API.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from typing import Any, AsyncGenerator

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.ai import llm_router as llm_router_mod
from shared.ai.cache import (
    DEFAULT_TTL_SECONDS,
    LLMCache,
    get_llm_cache,
    set_llm_cache,
)
from shared.ai.llm_router import LLMResponse, LLMRouter, set_llm_router
from shared.core.security import create_access_token


# ── Auth helpers ──────────────────────────────────────────────────────────────


def _make_token(tenant_id: str, sub: str = "user", role: str = "admin") -> str:
    return create_access_token({
        "sub": sub,
        "email": f"{sub}@{tenant_id}.test",
        "role": role,
        "tenant_id": tenant_id,
    })


def _auth(tenant_id: str, sub: str = "user", role: str = "admin") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


# ── Fake LLM router ───────────────────────────────────────────────────────────


# Canned JSON responses keyed by agent prompt name.  Each handler receives
# the user message so it can return a relevant payload.
_DEFAULT_PAYLOADS: dict[str, dict[str, Any]] = {
    "resume_eval_agent": {
        "parsed": {
            "name": "Jane Doe",
            "email": "jane@example.com",
            "phone": "+1-555-0100",
            "headline": "Senior Backend Engineer",
            "summary": "Backend engineer with 7 years of Python experience.",
            "years_experience": 7,
            "skills": ["Python", "FastAPI", "PostgreSQL", "Kubernetes"],
            "experience": [
                {
                    "title": "Senior Engineer",
                    "company": "Acme",
                    "duration": "2020 - 2024",
                    "highlights": ["Built billing platform", "Led 4 engineers"],
                }
            ],
            "education": [
                {"degree": "B.S. Computer Science", "school": "MIT", "year": 2017}
            ],
        },
        "score": 0.85,
        "breakdown": {
            "skills_match": 0.9,
            "experience_relevance": 0.85,
            "seniority_fit": 0.8,
            "communication_signals": 0.8,
        },
        "strengths": ["Strong Python", "Distributed systems experience"],
        "gaps": ["No Go experience"],
        "recommendation": "hire",
        "confidence_score": 0.9,
        "summary": "Strong fit for senior backend role.",
    },
    "jd_parser_agent": {
        "title": "Senior Backend Engineer",
        "seniority": "senior",
        "department": "Engineering",
        "employment_type": "full_time",
        "remote_policy": "hybrid",
        "location": "Berlin, DE",
        "salary_range": {"min": 80000, "max": 110000, "currency": "EUR", "period": "year"},
        "responsibilities": [
            "Design and build APIs",
            "Mentor junior engineers",
            "Own production reliability",
        ],
        "required_skills": ["Python", "PostgreSQL", "Kubernetes"],
        "nice_to_have_skills": ["Go", "AWS"],
        "required_experience_years": 5,
        "education_requirements": ["B.S. Computer Science or equivalent"],
        "benefits": ["30 vacation days", "Equity"],
        "keywords": ["python", "fastapi", "kubernetes", "backend", "senior"],
        "confidence_score": 0.92,
        "summary": "Senior backend role in Berlin focused on Python services.",
    },
    "improvement_agent": {
        "overall_score": 0.62,
        "scores": {
            "clarity": 0.55,
            "inclusivity": 0.5,
            "specificity": 0.7,
            "structure": 0.65,
            "appeal": 0.7,
        },
        "suggestions": [
            {
                "category": "inclusivity",
                "severity": "high",
                "issue": "Uses gendered language ('he/his').",
                "original": "He will own production",
                "suggestion": "They will own production",
            },
            {
                "category": "specificity",
                "severity": "medium",
                "issue": "Vague responsibilities.",
                "original": "Work on cool projects",
                "suggestion": "Design and ship at least one new service per quarter",
            },
            {
                "category": "clarity",
                "severity": "low",
                "issue": "Acronyms not expanded on first use.",
                "original": "Manage CI/CD pipelines",
                "suggestion": "Manage continuous integration (CI/CD) pipelines",
            },
        ],
        "missing_sections": ["Salary range", "Benefits"],
        "strengths": ["Clear seniority signal"],
        "confidence_score": 0.85,
        "summary": "Posting is decent but lacks inclusivity and concrete metrics.",
    },
    "bias_agent": {
        "bias_score": 0.45,
        "bias_level": "medium",
        "flagged_phrases": [
            {
                "phrase": "rockstar developer",
                "category": "culture_fit",
                "severity": "high",
                "explanation": "'Rockstar' signals exclusionary culture and skews male.",
                "suggestion": "Highly skilled developer",
            },
            {
                "phrase": "digital native",
                "category": "age",
                "severity": "medium",
                "explanation": "Implies a generational preference.",
                "suggestion": "Comfortable with modern web tooling",
            },
        ],
        "category_scores": {
            "gender": 0.3,
            "age": 0.5,
            "ethnicity": 0.0,
            "ability": 0.1,
            "education": 0.0,
            "socio_economic": 0.0,
            "parental": 0.0,
            "culture_fit": 0.6,
        },
        "suggestions": [
            "Replace gendered or generational shorthand with concrete requirements.",
        ],
        "confidence_score": 0.88,
        "summary": "Posting contains medium-severity coded language; concrete fixes proposed.",
    },
}


class _RecordingRouter:
    """Stand-in for :class:`LLMRouter` that records calls and consults a real cache.

    The router is intentionally minimal: it only implements ``complete``.
    We back it with a real :class:`LLMCache` so we can assert cache hits
    bypass the underlying handler.
    """

    def __init__(self, cache: LLMCache | None = None, *, content: str | None = None) -> None:
        self.cache = cache
        self.calls: list[dict[str, Any]] = []
        self._override_content = content

    async def complete(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: dict[str, str] | None = None,
        tenant_id: str | None = None,
        use_cache: bool = True,
    ) -> LLMResponse:
        chosen_model = model or "gpt-4o-mini"
        cache_key = None
        if use_cache and self.cache is not None:
            cache_key = self.cache.make_key(
                chosen_model,
                messages,
                temperature,
                tenant_id=tenant_id,
                extra={"max_tokens": max_tokens, "response_format": response_format},
            )
            cached = await self.cache.get(cache_key)
            if cached is not None:
                return LLMResponse(
                    content=cached["content"],
                    model=cached.get("model", chosen_model),
                    prompt_tokens=int(cached.get("prompt_tokens", 0) or 0),
                    completion_tokens=int(cached.get("completion_tokens", 0) or 0),
                    total_tokens=int(cached.get("total_tokens", 0) or 0),
                    latency_ms=0.1,
                    provider=cached.get("provider", "mock"),
                    cached=True,
                )

        # Decide the payload to return based on the system prompt fingerprint.
        sys_prompt = next((m["content"] for m in messages if m.get("role") == "system"), "")
        content = self._override_content or self._render_content(sys_prompt)
        self.calls.append({
            "model": chosen_model,
            "temperature": temperature,
            "tenant_id": tenant_id,
            "messages": messages,
            "response_format": response_format,
        })
        response = LLMResponse(
            content=content,
            model=chosen_model,
            prompt_tokens=120,
            completion_tokens=80,
            total_tokens=200,
            latency_ms=5.0,
            provider="fake",
            cached=False,
            cost_usd=0.0,
        )
        if use_cache and self.cache is not None and cache_key is not None:
            await self.cache.set(
                cache_key,
                {
                    "content": response.content,
                    "model": response.model,
                    "prompt_tokens": response.prompt_tokens,
                    "completion_tokens": response.completion_tokens,
                    "total_tokens": response.total_tokens,
                    "provider": response.provider,
                },
                ttl=DEFAULT_TTL_SECONDS,
            )
        return response

    @staticmethod
    def _render_content(sys_prompt: str) -> str:
        # Map by a stable substring from each agent's system prompt.
        if "parsing and" in sys_prompt and "scoring a resume" in sys_prompt:
            return json.dumps(_DEFAULT_PAYLOADS["resume_eval_agent"])
        if "extracting structured" in sys_prompt and "job description" in sys_prompt:
            return json.dumps(_DEFAULT_PAYLOADS["jd_parser_agent"])
        if "reviewing a job posting" in sys_prompt:
            return json.dumps(_DEFAULT_PAYLOADS["improvement_agent"])
        if "reviewing a piece of text for biased language" in sys_prompt:
            return json.dumps(_DEFAULT_PAYLOADS["bias_agent"])
        return json.dumps({"echo": sys_prompt[:80]})


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def isolated_cache() -> LLMCache:
    """Fresh in-memory LLM cache per test (no Redis)."""
    return LLMCache(max_size=64, ttl_seconds=3600, redis_url="")


@pytest.fixture
def fake_router(isolated_cache: LLMCache):
    """Install a recording router so no real LLM calls happen."""
    router = _RecordingRouter(cache=isolated_cache)
    set_llm_router(router)  # type: ignore[arg-type]
    set_llm_cache(isolated_cache)
    yield router
    set_llm_router(None)
    set_llm_cache(None)


@pytest_asyncio.fixture
async def ai_client(fake_router) -> AsyncGenerator[AsyncClient, None]:
    """Spin up only the AI orchestrator router on a bare FastAPI app.

    The rate-limit dependency is overridden so test loops can hammer the
    endpoints freely.
    """
    from apps.ai_orchestrator.main import router as ai_router
    from shared.middleware.rate_limit import rate_limit_ai

    app = FastAPI()
    app.include_router(ai_router, prefix="/api/v1/ai")

    # Bypass the AI rate limiter — we hit the endpoints in a tight loop.
    async def _noop_rate_limit() -> dict[str, Any]:
        return {"allowed": True, "bypass": True}

    # rate_limit_ai is a function returning a dependency, so we override
    # the *dependency* by replacing every Depends(rate_limit_ai()) instance.
    # The simplest hammer is to override the parent function itself via
    # FastAPI's dependency_overrides, keyed on the actual callable used.
    # The router applied ``rate_limit_ai()`` once at import time, so we
    # locate that callable and override it.
    for route in ai_router.routes:
        for dep in getattr(route, "dependencies", []) or []:
            app.dependency_overrides[dep.dependency] = _noop_rate_limit
        # Also the router-level dependencies
    # Plus the router-level dependency wrapper.
    for dep in ai_router.dependencies or []:
        app.dependency_overrides[dep.dependency] = _noop_rate_limit

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── 1. LLMCache unit tests ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cache_set_then_get_returns_payload(isolated_cache: LLMCache):
    key = isolated_cache.make_key("gpt-4o", [{"role": "user", "content": "hi"}], 0.2)
    await isolated_cache.set(key, {"content": "Hello!"})
    cached = await isolated_cache.get(key)
    assert cached == {"content": "Hello!"}
    stats = isolated_cache.stats()
    assert stats["hits"] == 1
    assert stats["memory_hits"] == 1
    assert stats["sets"] == 1
    assert stats["misses"] == 0


@pytest.mark.asyncio
async def test_cache_miss_increments_misses(isolated_cache: LLMCache):
    assert await isolated_cache.get("does-not-exist") is None
    stats = isolated_cache.stats()
    assert stats["misses"] == 1
    assert stats["hits"] == 0


@pytest.mark.asyncio
async def test_cache_key_is_stable(isolated_cache: LLMCache):
    messages = [{"role": "user", "content": "hi"}]
    k1 = isolated_cache.make_key("gpt-4o", messages, 0.5, tenant_id="t1")
    k2 = isolated_cache.make_key("gpt-4o", messages, 0.5, tenant_id="t1")
    assert k1 == k2
    # Different tenants → different key.
    assert k1 != isolated_cache.make_key("gpt-4o", messages, 0.5, tenant_id="t2")
    # Different model → different key.
    assert k1 != isolated_cache.make_key("gpt-4o-mini", messages, 0.5, tenant_id="t1")
    # Different temperature → different key.
    assert k1 != isolated_cache.make_key("gpt-4o", messages, 0.7, tenant_id="t1")
    # Different prompt → different key.
    assert k1 != isolated_cache.make_key(
        "gpt-4o", [{"role": "user", "content": "bye"}], 0.5, tenant_id="t1"
    )


@pytest.mark.asyncio
async def test_cache_temperature_rounding(isolated_cache: LLMCache):
    """0.20000001 and 0.2 should produce the same cache slot."""
    messages = [{"role": "user", "content": "hi"}]
    k1 = isolated_cache.make_key("gpt-4o", messages, 0.2)
    k2 = isolated_cache.make_key("gpt-4o", messages, 0.20000001)
    assert k1 == k2


@pytest.mark.asyncio
async def test_cache_lru_eviction(isolated_cache: LLMCache):
    small = LLMCache(max_size=3, ttl_seconds=3600, redis_url="")
    for i in range(5):
        await small.set(f"k{i}", {"v": i})
    # k0 and k1 should have been evicted.
    assert await small.get("k0") is None
    assert await small.get("k1") is None
    assert (await small.get("k4")) == {"v": 4}
    stats = small.stats()
    assert stats["evictions"] >= 2


@pytest.mark.asyncio
async def test_cache_ttl_expiry(isolated_cache: LLMCache):
    short = LLMCache(max_size=4, ttl_seconds=1, redis_url="")
    await short.set("k", {"v": 1}, ttl=1)
    # Fast-forward: monkeypatch time.time inside the backend.
    # Easier: wait > 1s.  This keeps the suite under 2s total.
    assert (await short.get("k")) == {"v": 1}
    await asyncio.sleep(1.05)
    assert await short.get("k") is None


@pytest.mark.asyncio
async def test_cache_invalidate(isolated_cache: LLMCache):
    key = isolated_cache.make_key("gpt-4o", [{"role": "user", "content": "hi"}], 0.5)
    await isolated_cache.set(key, {"content": "X"})
    await isolated_cache.invalidate(key)
    assert await isolated_cache.get(key) is None


@pytest.mark.asyncio
async def test_cache_zero_size_is_noop():
    disabled = LLMCache(max_size=0, ttl_seconds=3600, redis_url="")
    await disabled.set("k", {"v": 1})
    assert await disabled.get("k") is None


# ── 2. LLM router cache integration ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_router_cache_miss_then_hit_returns_same_response(isolated_cache: LLMCache):
    """First call hits the backend; second call with same args returns the cached payload."""

    call_count = {"n": 0}

    class _CountingRouter(LLMRouter):
        async def _dispatch(self, provider, messages, model, temperature, max_tokens, response_format):
            call_count["n"] += 1
            return LLMResponse(
                content=json.dumps({"hello": "world", "n": call_count["n"]}),
                model=model,
                prompt_tokens=100,
                completion_tokens=50,
                total_tokens=150,
                latency_ms=10.0,
                provider="fake",
            )

    router = _CountingRouter(cache=isolated_cache, allow_mock=False)
    messages = [{"role": "user", "content": "evaluate this resume"}]
    r1 = await router.complete(messages, model="gpt-4o-mini", temperature=0.2, tenant_id="t1")
    r2 = await router.complete(messages, model="gpt-4o-mini", temperature=0.2, tenant_id="t1")
    assert r1.content == r2.content
    assert r1.cached is False
    assert r2.cached is True
    assert call_count["n"] == 1, "second call must NOT have dispatched to the LLM"

    stats = isolated_cache.stats()
    assert stats["sets"] == 1
    assert stats["hits"] == 1
    assert stats["misses"] == 1


@pytest.mark.asyncio
async def test_router_different_tenant_does_not_share_cache(isolated_cache: LLMCache):
    """Cross-tenant requests with identical prompts must dispatch separately."""
    call_count = {"n": 0}

    class _CountingRouter(LLMRouter):
        async def _dispatch(self, provider, messages, model, temperature, max_tokens, response_format):
            call_count["n"] += 1
            return LLMResponse(
                content=json.dumps({"call": call_count["n"]}),
                model=model,
                prompt_tokens=10,
                completion_tokens=5,
                total_tokens=15,
                latency_ms=1.0,
                provider="fake",
            )

    router = _CountingRouter(cache=isolated_cache, allow_mock=False)
    messages = [{"role": "user", "content": "score this"}]
    await router.complete(messages, model="gpt-4o-mini", temperature=0.2, tenant_id="tenant-A")
    await router.complete(messages, model="gpt-4o-mini", temperature=0.2, tenant_id="tenant-B")
    assert call_count["n"] == 2, "different tenants must not collide on the same cache key"


@pytest.mark.asyncio
async def test_router_use_cache_false_bypasses(isolated_cache: LLMCache):
    """``use_cache=False`` must always dispatch and skip writing back."""
    call_count = {"n": 0}

    class _CountingRouter(LLMRouter):
        async def _dispatch(self, provider, messages, model, temperature, max_tokens, response_format):
            call_count["n"] += 1
            return LLMResponse(
                content="X",
                model=model,
                prompt_tokens=1,
                completion_tokens=1,
                total_tokens=2,
                latency_ms=1.0,
                provider="fake",
            )

    router = _CountingRouter(cache=isolated_cache, allow_mock=False)
    messages = [{"role": "user", "content": "no cache"}]
    await router.complete(messages, model="gpt-4o-mini", temperature=0.2, use_cache=False)
    await router.complete(messages, model="gpt-4o-mini", temperature=0.2, use_cache=False)
    assert call_count["n"] == 2
    assert isolated_cache.stats()["sets"] == 0


# ── 3. evaluate-resume endpoint ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_evaluate_resume_returns_structured_payload(
    ai_client: AsyncClient, fake_router: _RecordingRouter
):
    r = await ai_client.post(
        "/api/v1/ai/evaluate-resume",
        json={
            "resume_text": "Jane Doe — Senior Backend Engineer with 7 years Python.",
            "job_description": "Looking for a Senior Python engineer.",
            "candidate_id": "cand_1",
            "job_id": "job_1",
        },
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["agent_type"] == "resume_evaluation"
    assert body["tenant_id"] == "tenant-A"
    assert body["candidate_id"] == "cand_1"
    assert body["job_id"] == "job_1"
    assert 0.0 <= body["score"] <= 1.0
    assert body["recommendation"] in {"strong_hire", "hire", "lean_hire", "no_hire", "strong_no_hire"}
    assert body["parsed"]["name"] == "Jane Doe"
    assert "Python" in body["parsed"]["skills"]
    assert isinstance(body["parsed"]["experience"], list)
    assert body["parsed"]["experience"][0]["company"] == "Acme"
    assert "breakdown" in body
    assert "skills_match" in body["breakdown"]
    assert len(fake_router.calls) == 1


@pytest.mark.asyncio
async def test_evaluate_resume_requires_text(ai_client: AsyncClient):
    r = await ai_client.post(
        "/api/v1/ai/evaluate-resume",
        json={"resume_text": "   "},
        headers=_auth("tenant-A"),
    )
    # Pydantic min_length=10 rejects this.
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_evaluate_resume_requires_auth(ai_client: AsyncClient):
    r = await ai_client.post(
        "/api/v1/ai/evaluate-resume",
        json={"resume_text": "x" * 50},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_evaluate_resume_cache_hit_skips_llm(
    ai_client: AsyncClient, fake_router: _RecordingRouter
):
    payload = {
        "resume_text": "Jane Doe — Senior Backend Engineer, 7 years Python, FastAPI.",
        "job_description": "Senior Python engineer wanted.",
    }
    auth = _auth("tenant-A")
    r1 = await ai_client.post("/api/v1/ai/evaluate-resume", json=payload, headers=auth)
    r2 = await ai_client.post("/api/v1/ai/evaluate-resume", json=payload, headers=auth)
    assert r1.status_code == 200 and r2.status_code == 200
    # request_id is regenerated on each call, but the structured content
    # is identical because the LLM was only invoked once.
    assert r1.json()["score"] == r2.json()["score"]
    assert r1.json()["parsed"] == r2.json()["parsed"]
    assert len(fake_router.calls) == 1, "second identical request must hit the cache"


# ── 4. parse-job-description endpoint ────────────────────────────────────────


@pytest.mark.asyncio
async def test_parse_job_description_returns_structured_payload(
    ai_client: AsyncClient, fake_router: _RecordingRouter
):
    r = await ai_client.post(
        "/api/v1/ai/parse-job-description",
        json={
            "job_description": "Senior Backend Engineer at Acme. Python, FastAPI, K8s required.",
            "job_id": "job_42",
        },
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["agent_type"] == "jd_parser"
    assert body["tenant_id"] == "tenant-A"
    assert body["job_id"] == "job_42"
    assert body["title"] == "Senior Backend Engineer"
    assert body["seniority"] == "senior"
    assert "Python" in body["required_skills"]
    assert body["salary_range"]["currency"] == "EUR"
    assert body["salary_range"]["min"] == 80000
    assert isinstance(body["responsibilities"], list)
    assert isinstance(body["keywords"], list)
    assert len(fake_router.calls) == 1


@pytest.mark.asyncio
async def test_parse_job_description_validation(ai_client: AsyncClient):
    r = await ai_client.post(
        "/api/v1/ai/parse-job-description",
        json={"job_description": "x"},
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 422


# ── 5. suggest-improvements endpoint ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_suggest_improvements_returns_ordered_suggestions(
    ai_client: AsyncClient, fake_router: _RecordingRouter
):
    r = await ai_client.post(
        "/api/v1/ai/suggest-improvements",
        json={
            "job_description": (
                "We are looking for a rockstar developer. He will own production. "
                "Work on cool projects. Must manage CI/CD pipelines."
            ),
            "job_id": "job_99",
        },
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["agent_type"] == "improvement_suggestions"
    assert body["job_id"] == "job_99"
    assert 0.0 <= body["overall_score"] <= 1.0
    assert "scores" in body
    assert {"clarity", "inclusivity", "specificity", "structure", "appeal"} <= set(body["scores"].keys())
    assert len(body["suggestions"]) >= 3
    severities = [s["severity"] for s in body["suggestions"]]
    # High-severity suggestions must come first.
    assert severities == sorted(severities, key={"high": 0, "medium": 1, "low": 2}.get)
    assert "Salary range" in body["missing_sections"]


@pytest.mark.asyncio
async def test_suggest_improvements_requires_text(ai_client: AsyncClient):
    r = await ai_client.post(
        "/api/v1/ai/suggest-improvements",
        json={"job_description": ""},
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 422


# ── 6. detect-bias endpoint ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_detect_bias_returns_flagged_phrases(
    ai_client: AsyncClient, fake_router: _RecordingRouter
):
    r = await ai_client.post(
        "/api/v1/ai/detect-bias",
        json={
            "text": (
                "Looking for a rockstar developer and digital native who can hit the "
                "ground running."
            ),
            "job_id": "job_b1",
            "context": "job_description",
        },
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["agent_type"] == "bias_detection"
    assert body["job_id"] == "job_b1"
    assert 0.0 <= body["bias_score"] <= 1.0
    assert body["bias_level"] in {"none", "low", "medium", "high"}
    phrases = body["flagged_phrases"]
    assert len(phrases) >= 1
    assert any(p["phrase"] == "rockstar developer" for p in phrases)
    assert any(p["category"] == "age" for p in phrases)
    cats = body["category_scores"]
    assert {"gender", "age", "ethnicity", "ability"} <= set(cats.keys())


@pytest.mark.asyncio
async def test_detect_bias_validation(ai_client: AsyncClient):
    r = await ai_client.post(
        "/api/v1/ai/detect-bias",
        json={"text": "short"},
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 422


# ── 7. Tenant isolation ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_evaluate_resume_tenant_isolation(
    ai_client: AsyncClient, fake_router: _RecordingRouter
):
    """Tenant A and tenant B sending the same payload must each hit the LLM once.

    A naive cache implementation would serve tenant B from tenant A's
    response.  Our key derivation includes the tenant id specifically to
    avoid that data leak.
    """
    payload = {
        "resume_text": "Identical resume content across two tenants.",
        "job_description": "Identical job description across two tenants.",
    }
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    r1 = await ai_client.post("/api/v1/ai/evaluate-resume", json=payload, headers=a)
    r2 = await ai_client.post("/api/v1/ai/evaluate-resume", json=payload, headers=b)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["tenant_id"] == "tenant-A"
    assert r2.json()["tenant_id"] == "tenant-B"
    # Two separate LLM dispatches because tenant_id is part of the cache key.
    assert len(fake_router.calls) == 2

    # And within the same tenant, repeating returns the cached result.
    r3 = await ai_client.post("/api/v1/ai/evaluate-resume", json=payload, headers=a)
    assert r3.status_code == 200
    assert len(fake_router.calls) == 2, "third call should be served by the cache"


@pytest.mark.asyncio
async def test_detect_bias_tenant_isolation(
    ai_client: AsyncClient, fake_router: _RecordingRouter
):
    payload = {
        "text": "Looking for a rockstar developer who is a digital native.",
        "context": "job_description",
    }
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    await ai_client.post("/api/v1/ai/detect-bias", json=payload, headers=a)
    await ai_client.post("/api/v1/ai/detect-bias", json=payload, headers=b)
    assert len(fake_router.calls) == 2

    # Repeated calls for tenant A should hit cache.
    before = len(fake_router.calls)
    await ai_client.post("/api/v1/ai/detect-bias", json=payload, headers=a)
    await ai_client.post("/api/v1/ai/detect-bias", json=payload, headers=a)
    assert len(fake_router.calls) == before


@pytest.mark.asyncio
async def test_cache_stats_endpoint(ai_client: AsyncClient, fake_router: _RecordingRouter):
    """The introspection endpoint should reflect activity from the other tests."""
    payload = {"job_description": "Senior Backend Engineer wanted at Acme."}
    await ai_client.post(
        "/api/v1/ai/parse-job-description", json=payload, headers=_auth("tenant-A")
    )
    await ai_client.post(
        "/api/v1/ai/parse-job-description", json=payload, headers=_auth("tenant-A")
    )
    r = await ai_client.get("/api/v1/ai/cache/stats", headers=_auth("tenant-A"))
    assert r.status_code == 200, r.text
    stats = r.json()
    assert stats["hits"] >= 1
    assert stats["sets"] >= 1
    assert "hit_rate" in stats
    assert stats["max_size"] >= 1
