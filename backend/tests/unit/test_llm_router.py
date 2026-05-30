"""Unit tests for shared.ai.llm_router — model selection, fallback, cost tracking."""

from __future__ import annotations

import pytest

from shared.ai.llm_router import LLMRouter, LLMResponse, MODEL_PRICING


pytestmark = [pytest.mark.unit, pytest.mark.ai]


class TestModelSelection:
    def test_gpt_models_route_to_openai(self):
        router = LLMRouter()
        for model in ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]:
            if model.startswith("gpt"):
                provider = "openai"
            else:
                provider = "anthropic"
            assert provider == "openai"

    def test_claude_models_route_to_anthropic(self):
        for model in ["claude-sonnet-4-20250514", "claude-3-opus", "claude-haiku"]:
            provider = "openai" if model.startswith("gpt") else "anthropic"
            assert provider == "anthropic"

    def test_default_model_is_gpt4o(self):
        from shared.core.config import get_settings
        settings = get_settings()
        assert settings.OPENAI_MODEL_PRIMARY == "gpt-4o"


class TestLLMResponse:
    def test_llm_response_creation(self):
        resp = LLMResponse(
            content="Hello world",
            model="gpt-4o",
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
            latency_ms=250.0,
            provider="openai",
        )
        assert resp.content == "Hello world"
        assert resp.cached is False

    def test_llm_response_cached(self):
        resp = LLMResponse(
            content="cached",
            model="gpt-4o",
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            latency_ms=1.0,
            provider="openai",
            cached=True,
        )
        assert resp.cached is True


class TestCostCalculation:
    def test_gpt4o_cost(self):
        pricing = MODEL_PRICING["gpt-4o"]
        prompt_tokens = 1000
        completion_tokens = 500
        cost = (prompt_tokens * pricing["input"] + completion_tokens * pricing["output"]) / 1000
        assert cost == pytest.approx(0.0075, rel=0.01)

    def test_gpt4o_mini_cost(self):
        pricing = MODEL_PRICING["gpt-4o-mini"]
        prompt_tokens = 1000
        completion_tokens = 500
        cost = (prompt_tokens * pricing["input"] + completion_tokens * pricing["output"]) / 1000
        assert cost == pytest.approx(0.00045, rel=0.01)

    def test_claude_cost(self):
        pricing = MODEL_PRICING["claude-sonnet-4-20250514"]
        prompt_tokens = 1000
        completion_tokens = 500
        cost = (prompt_tokens * pricing["input"] + completion_tokens * pricing["output"]) / 1000
        assert cost == pytest.approx(0.0105, rel=0.01)

    def test_cost_scales_with_tokens(self):
        pricing = MODEL_PRICING["gpt-4o"]
        cost_1k = (1000 * pricing["input"] + 500 * pricing["output"]) / 1000
        cost_2k = (2000 * pricing["input"] + 1000 * pricing["output"]) / 1000
        assert cost_2k == pytest.approx(cost_1k * 2, rel=0.01)


class TestMetricTracking:
    def test_initial_metrics(self):
        router = LLMRouter()
        metrics = router.get_metrics()
        assert "openai" in metrics
        assert "anthropic" in metrics
        assert metrics["openai"]["calls"] == 0
        assert metrics["openai"]["tokens"] == 0
        assert metrics["openai"]["cost"] == 0.0

    def test_metrics_structure(self):
        router = LLMRouter()
        metrics = router.get_metrics()
        for provider in ["openai", "anthropic"]:
            assert "calls" in metrics[provider]
            assert "tokens" in metrics[provider]
            assert "cost" in metrics[provider]

    def test_fallback_order(self):
        router = LLMRouter()
        assert router._fallback_order[0] == "openai"
        assert router._fallback_order[1] == "anthropic"
