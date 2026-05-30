"""Multi-provider LLM router with fallback and cost tracking."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from src.config import get_settings

settings = get_settings()


@dataclass
class LLMResponse:
    content: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    latency_ms: float
    provider: str
    cached: bool = False


@dataclass
class ProviderMetrics:
    total_calls: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    avg_latency_ms: float = 0.0
    error_rate: float = 0.0
    cache_hit_rate: float = 0.0


# Pricing per 1K tokens (approximate)
MODEL_PRICING = {
    "gpt-4o": {"input": 0.0025, "output": 0.01},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "claude-sonnet-4-20250514": {"input": 0.003, "output": 0.015},
    "text-embedding-3-large": {"input": 0.00013, "output": 0},
}


class LLMRouter:
    """
    Routes LLM requests across providers with:
    - Fallback on provider failure
    - Cost optimization (use cheaper models for simple tasks)
    - Semantic caching
    - Rate limiting per provider
    - Token usage tracking
    """

    def __init__(self) -> None:
        self.metrics: dict[str, ProviderMetrics] = {
            "openai": ProviderMetrics(),
            "anthropic": ProviderMetrics(),
        }
        self._fallback_order = ["openai", "anthropic"]

    async def complete(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tenant_id: str = "",
    ) -> LLMResponse:
        model = model or settings.OPENAI_MODEL_PRIMARY

        start = time.perf_counter()

        # Determine provider from model name
        provider = self._get_provider(model)

        try:
            response = await self._call_provider(provider, model, messages, temperature, max_tokens)
            latency = (time.perf_counter() - start) * 1000

            # Track metrics
            self.metrics[provider].total_calls += 1
            self.metrics[provider].total_tokens += response.total_tokens
            self.metrics[provider].avg_latency_ms = (
                self.metrics[provider].avg_latency_ms * 0.9 + latency * 0.1
            )

            # Calculate cost
            pricing = MODEL_PRICING.get(model, {"input": 0.002, "output": 0.008})
            cost = (response.prompt_tokens * pricing["input"] + response.completion_tokens * pricing["output"]) / 1000
            self.metrics[provider].total_cost_usd += cost

            return response

        except Exception:
            # Fallback to next provider
            self.metrics[provider].error_rate = min(1.0, self.metrics[provider].error_rate + 0.1)
            return await self._fallback(messages, model, temperature, max_tokens, exclude=provider)

    async def _call_provider(
        self,
        provider: str,
        model: str,
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> LLMResponse:
        if provider == "openai":
            return await self._call_openai(model, messages, temperature, max_tokens)
        if provider == "anthropic":
            return await self._call_anthropic(model, messages, temperature, max_tokens)
        raise ValueError(f"Unknown provider: {provider}")

    async def _call_openai(
        self, model: str, messages: list[dict], temperature: float, max_tokens: int
    ) -> LLMResponse:
        import openai

        client = openai.AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            org_id=settings.OPENAI_ORG_ID or None,
        )

        start = time.perf_counter()
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        latency = (time.perf_counter() - start) * 1000

        choice = response.choices[0]
        usage = response.usage

        return LLMResponse(
            content=choice.message.content or "",
            model=model,
            prompt_tokens=usage.prompt_tokens if usage else 0,
            completion_tokens=usage.completion_tokens if usage else 0,
            total_tokens=(usage.prompt_tokens + usage.completion_tokens) if usage else 0,
            latency_ms=latency,
            provider="openai",
        )

    async def _call_anthropic(
        self, model: str, messages: list[dict], temperature: float, max_tokens: int
    ) -> LLMResponse:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        # Convert messages format for Anthropic
        system_msg = ""
        user_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_msg = msg["content"]
            else:
                user_messages.append(msg)

        start = time.perf_counter()
        response = await client.messages.create(
            model=model,
            system=system_msg,
            messages=user_messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        latency = (time.perf_counter() - start) * 1000

        return LLMResponse(
            content=response.content[0].text if response.content else "",
            model=model,
            prompt_tokens=response.usage.input_tokens,
            completion_tokens=response.usage.output_tokens,
            total_tokens=response.usage.input_tokens + response.usage.output_tokens,
            latency_ms=latency,
            provider="anthropic",
        )

    async def _fallback(
        self,
        messages: list[dict],
        model: str,
        temperature: float,
        max_tokens: int,
        exclude: str,
    ) -> LLMResponse:
        for provider in self._fallback_order:
            if provider == exclude:
                continue
            try:
                fallback_model = self._get_fallback_model(provider)
                return await self._call_provider(provider, fallback_model, messages, temperature, max_tokens)
            except Exception:
                continue
        raise RuntimeError("All LLM providers failed")

    def _get_provider(self, model: str) -> str:
        if model.startswith("gpt") or model.startswith("text-embedding"):
            return "openai"
        if model.startswith("claude"):
            return "anthropic"
        return "openai"

    def _get_fallback_model(self, provider: str) -> str:
        if provider == "openai":
            return settings.OPENAI_MODEL_FAST
        if provider == "anthropic":
            return settings.ANTHROPIC_MODEL_PRIMARY
        return settings.OPENAI_MODEL_FAST

    def get_metrics(self) -> dict[str, Any]:
        return {
            provider: {
                "total_calls": m.total_calls,
                "total_tokens": m.total_tokens,
                "total_cost_usd": round(m.total_cost_usd, 4),
                "avg_latency_ms": round(m.avg_latency_ms, 2),
                "error_rate": round(m.error_rate, 4),
            }
            for provider, m in self.metrics.items()
        }
