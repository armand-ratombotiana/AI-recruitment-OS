"""LLM router for multi-provider AI.

Provides a single async entry point (``LLMRouter.complete``) that picks the
right provider for a given model, dispatches the request, and tracks cost
and latency.  When no real API key is configured the router transparently
falls back to a deterministic in-process mock so that the rest of the system
can be developed and tested without network access.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, TYPE_CHECKING

logger = logging.getLogger("ai.llm_router")


# ── Pricing ────────────────────────────────────────────────────────────────────
# Values are USD per 1 000 tokens.  Kept in code so tests stay deterministic
# and we never depend on a live pricing API.

MODEL_PRICING: dict[str, dict[str, float]] = {
    # OpenAI
    "gpt-4o": {"input": 0.0025, "output": 0.010},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "gpt-4-turbo": {"input": 0.010, "output": 0.030},
    "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
    "text-embedding-3-large": {"input": 0.00013, "output": 0.0},
    # Anthropic
    "claude-sonnet-4-20250514": {"input": 0.003, "output": 0.015},
    "claude-3-opus": {"input": 0.015, "output": 0.075},
    "claude-haiku": {"input": 0.0008, "output": 0.004},
}


# ── Response dataclass ─────────────────────────────────────────────────────────


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
    cost_usd: float = 0.0
    raw: dict[str, Any] | None = field(default=None, repr=False)


# ── Provider detection ─────────────────────────────────────────────────────────


def _provider_for(model: str) -> str:
    if model.startswith(("gpt-", "text-embedding-", "o1", "o3", "o4")):
        return "openai"
    if model.startswith("claude-"):
        return "anthropic"
    return "openai"


# ── Optional SDK imports — the router must import even without the SDKs ───────

if TYPE_CHECKING:
    from openai import AsyncOpenAI  # noqa: F401
    from anthropic import AsyncAnthropic  # noqa: F401

try:
    from openai import AsyncOpenAI  # type: ignore
    _OPENAI_AVAILABLE = True
except Exception:  # pragma: no cover - optional dep
    _OPENAI_AVAILABLE = False

try:
    from anthropic import AsyncAnthropic  # type: ignore
    _ANTHROPIC_AVAILABLE = True
except Exception:  # pragma: no cover - optional dep
    _ANTHROPIC_AVAILABLE = False


# ── Router ─────────────────────────────────────────────────────────────────────


class LLMUnavailable(RuntimeError):
    """Raised when no LLM provider can be reached and no mock is allowed."""


class LLMRouter:
    """Routes completion requests to the right provider with metrics + cache."""

    _DEFAULT_FALLBACK: list[str] = ["openai", "anthropic"]

    def __init__(
        self,
        *,
        openai_api_key: str | None = None,
        anthropic_api_key: str | None = None,
        cache: Any | None = None,
        default_model: str | None = None,
        allow_mock: bool = True,
    ) -> None:
        self.metrics: dict[str, dict[str, Any]] = {
            "openai": {"calls": 0, "tokens": 0, "cost": 0.0, "errors": 0},
            "anthropic": {"calls": 0, "tokens": 0, "cost": 0.0, "errors": 0},
        }
        self._fallback_order: list[str] = list(self._DEFAULT_FALLBACK)
        self._openai: Any = None
        self._anthropic: Any = None
        self._cache = cache
        self._allow_mock = allow_mock

        if openai_api_key and _OPENAI_AVAILABLE:
            try:
                self._openai = AsyncOpenAI(api_key=openai_api_key)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("openai client init failed: %s", exc)
        if anthropic_api_key and _ANTHROPIC_AVAILABLE:
            try:
                self._anthropic = AsyncAnthropic(api_key=anthropic_api_key)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("anthropic client init failed: %s", exc)

        from shared.core.config import get_settings

        settings = get_settings()
        self._openai_key = openai_api_key or settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY", "")
        self._anthropic_key = anthropic_api_key or settings.ANTHROPIC_API_KEY or os.getenv("ANTHROPIC_API_KEY", "")
        self._default_model = default_model or settings.OPENAI_MODEL_PRIMARY

    # ── public API ─────────────────────────────────────────────────────────

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
        """Dispatch a chat completion request.

        ``response_format`` is forwarded to providers that support it (OpenAI
        ``json_object`` mode); Anthropic gets an equivalent instruction
        appended to the system prompt.
        """
        model = model or self._default_model
        provider = _provider_for(model)
        start = time.perf_counter()

        cache_key = self._make_cache_key(model, messages, temperature, max_tokens, response_format, tenant_id)
        if use_cache and self._cache is not None:
            cached = await self._cache.get(cache_key)
            if cached is not None:
                resp = LLMResponse(
                    content=cached["content"],
                    model=cached.get("model", model),
                    prompt_tokens=cached.get("prompt_tokens", 0),
                    completion_tokens=cached.get("completion_tokens", 0),
                    total_tokens=cached.get("total_tokens", 0),
                    latency_ms=(time.perf_counter() - start) * 1000,
                    provider=cached.get("provider", provider),
                    cached=True,
                    cost_usd=0.0,
                )
                logger.info("llm.cache.hit model=%s tenant=%s", model, tenant_id)
                return resp

        try:
            response = await self._dispatch(
                provider, messages, model, temperature, max_tokens, response_format
            )
        except Exception as exc:
            self.metrics[provider]["errors"] += 1
            logger.warning(
                "llm.dispatch.failed provider=%s model=%s err=%s", provider, model, exc
            )
            if not self._allow_mock:
                raise
            response = self._mock_response(model, messages, str(exc))

        if use_cache and self._cache is not None:
            try:
                await self._cache.set(
                    cache_key,
                    {
                        "content": response.content,
                        "model": response.model,
                        "prompt_tokens": response.prompt_tokens,
                        "completion_tokens": response.completion_tokens,
                        "total_tokens": response.total_tokens,
                        "provider": response.provider,
                    },
                    ttl=3600,
                )
            except Exception as exc:  # pragma: no cover - cache is best-effort
                logger.debug("llm.cache.set.failed err=%s", exc)

        return response

    async def embed(
        self,
        text: str,
        *,
        model: str | None = None,
        tenant_id: str | None = None,
    ) -> list[float]:
        """Return an embedding vector for *text* using the configured model."""
        from shared.core.config import get_settings

        model = model or get_settings().OPENAI_EMBEDDING_MODEL
        provider = _provider_for(model)
        start = time.perf_counter()

        cache_key = self._make_cache_key(model, [{"role": "user", "content": text}], 0.0, 0, None, tenant_id)
        if self._cache is not None:
            cached = await self._cache.get(cache_key)
            if cached is not None and "embedding" in cached:
                logger.info("llm.embed.cache.hit model=%s tenant=%s", model, tenant_id)
                return cached["embedding"]

        try:
            embedding = await self._call_embed(provider, text, model)
        except Exception as exc:
            self.metrics[provider]["errors"] += 1
            logger.warning("llm.embed.failed provider=%s model=%s err=%s", provider, model, exc)
            if not self._allow_mock:
                raise
            embedding = self._mock_embedding(text)

        if self._cache is not None:
            try:
                await self._cache.set(
                    cache_key,
                    {"embedding": embedding, "model": model, "provider": provider},
                    ttl=3600,
                )
            except Exception:
                pass

        self.metrics[provider]["calls"] += 1
        self.metrics[provider]["tokens"] += len(text) // 4
        return embedding

    async def _call_embed(self, provider: str, text: str, model: str) -> list[float]:
        if provider == "openai":
            return await self._call_openai_embed(text, model)
        raise LLMUnavailable(f"Embedding not supported for provider: {provider}")

    async def _call_openai_embed(self, text: str, model: str) -> list[float]:
        if self._openai is None:
            if not self._openai_key or self._openai_key == "sk-placeholder":
                raise LLMUnavailable("OPENAI_API_KEY not configured")
            if not _OPENAI_AVAILABLE:
                raise LLMUnavailable("openai SDK not installed")
            self._openai = AsyncOpenAI(api_key=self._openai_key)

        result = await self._openai.embeddings.create(input=text, model=model)
        return result.data[0].embedding

    def _mock_embedding(self, text: str) -> list[float]:
        """Deterministic pseudo-embedding used when no real provider is reachable."""
        import hashlib as _hl
        import re as _re

        text_norm = text.lower().strip()
        words = _re.findall(r'\w+', text_norm)
        dims = 384
        vec = [0.0] * dims
        for i, word in enumerate(words):
            h = int(_hl.md5(word.encode()).hexdigest(), 16)
            idx = h % dims
            pos_w = 1.0 / (1.0 + i * 0.1)
            len_w = min(len(word) / 10.0, 1.0)
            vec[idx] += pos_w * len_w
        mag = sum(x * x for x in vec) ** 0.5
        if mag > 0:
            vec = [x / mag for x in vec]
        return vec

    def get_metrics(self) -> dict[str, dict[str, Any]]:
        """Return a copy of the per-provider usage metrics."""
        return {provider: dict(values) for provider, values in self.metrics.items()}

    def reset_metrics(self) -> None:
        for provider in self.metrics:
            self.metrics[provider] = {"calls": 0, "tokens": 0, "cost": 0.0, "errors": 0}

    # ── internals ──────────────────────────────────────────────────────────

    def _make_cache_key(
        self,
        model: str,
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
        response_format: dict[str, str] | None,
        tenant_id: str | None,
    ) -> str:
        payload = json.dumps(
            {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "response_format": response_format,
                "tenant": tenant_id,
            },
            sort_keys=True,
            default=str,
        )
        digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        return f"llm:{tenant_id or 'global'}:{model}:{digest}"

    async def _dispatch(
        self,
        provider: str,
        messages: list[dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: int,
        response_format: dict[str, str] | None,
    ) -> LLMResponse:
        start = time.perf_counter()
        if provider == "openai":
            response = await self._call_openai(messages, model, temperature, max_tokens, response_format)
        elif provider == "anthropic":
            response = await self._call_anthropic(messages, model, temperature, max_tokens, response_format)
        else:
            raise LLMUnavailable(f"Unknown provider: {provider}")

        latency = (time.perf_counter() - start) * 1000
        cost = self._estimate_cost(model, response.prompt_tokens, response.completion_tokens)
        self.metrics[provider]["calls"] += 1
        self.metrics[provider]["tokens"] += response.total_tokens
        self.metrics[provider]["cost"] += cost
        response.latency_ms = latency
        response.cost_usd = cost
        return response

    async def _call_openai(
        self,
        messages: list[dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: int,
        response_format: dict[str, str] | None,
    ) -> LLMResponse:
        if self._openai is None:
            if not self._openai_key or self._openai_key == "sk-placeholder":
                raise LLMUnavailable("OPENAI_API_KEY not configured")
            if not _OPENAI_AVAILABLE:
                raise LLMUnavailable("openai SDK not installed")
            self._openai = AsyncOpenAI(api_key=self._openai_key)

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format is not None:
            kwargs["response_format"] = response_format

        result = await self._openai.chat.completions.create(**kwargs)
        choice = result.choices[0]
        usage = result.usage
        return LLMResponse(
            content=choice.message.content or "",
            model=result.model,
            prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
            total_tokens=getattr(usage, "total_tokens", 0) or 0,
            latency_ms=0.0,
            provider="openai",
            raw=result.model_dump() if hasattr(result, "model_dump") else None,
        )

    async def _call_anthropic(
        self,
        messages: list[dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: int,
        response_format: dict[str, str] | None,
    ) -> LLMResponse:
        if self._anthropic is None:
            if not self._anthropic_key:
                raise LLMUnavailable("ANTHROPIC_API_KEY not configured")
            if not _ANTHROPIC_AVAILABLE:
                raise LLMUnavailable("anthropic SDK not installed")
            self._anthropic = AsyncAnthropic(api_key=self._anthropic_key)

        system_prompt = ""
        chat_messages: list[dict[str, str]] = []
        for msg in messages:
            if msg.get("role") == "system":
                system_prompt += msg["content"] + "\n"
            else:
                chat_messages.append(msg)
        if response_format and response_format.get("type") == "json_object":
            system_prompt += "\nRespond with valid JSON only — no prose, no code fences."

        result = await self._anthropic.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt.strip() or "You are a helpful assistant.",
            messages=chat_messages,
        )
        content_blocks = result.content or []
        text = "".join(
            block.text for block in content_blocks if getattr(block, "type", None) == "text"
        )
        usage = result.usage
        return LLMResponse(
            content=text,
            model=result.model,
            prompt_tokens=getattr(usage, "input_tokens", 0) or 0,
            completion_tokens=getattr(usage, "output_tokens", 0) or 0,
            total_tokens=(getattr(usage, "input_tokens", 0) or 0)
            + (getattr(usage, "output_tokens", 0) or 0),
            latency_ms=0.0,
            provider="anthropic",
            raw=result.model_dump() if hasattr(result, "model_dump") else None,
        )

    def _estimate_cost(self, model: str, prompt_tokens: int, completion_tokens: int) -> float:
        pricing = MODEL_PRICING.get(model)
        if not pricing:
            return 0.0
        return round(
            (prompt_tokens * pricing["input"] + completion_tokens * pricing["output"]) / 1000.0,
            6,
        )

    def _mock_response(
        self,
        model: str,
        messages: list[dict[str, str]],
        reason: str,
    ) -> LLMResponse:
        """Deterministic in-process fallback so the system runs without keys."""
        logger.info("llm.mock.used model=%s reason=%s", model, reason)
        last_user = next(
            (m["content"] for m in reversed(messages) if m.get("role") == "user"),
            "",
        )
        snippet = (last_user or "")[:200].replace("\n", " ")
        return LLMResponse(
            content=json.dumps(
                {
                    "mock": True,
                    "model": model,
                    "echo": snippet,
                    "note": "LLM router running in mock mode — no real provider reachable.",
                }
            ),
            model=model,
            prompt_tokens=len(last_user) // 4,
            completion_tokens=64,
            total_tokens=(len(last_user) // 4) + 64,
            latency_ms=0.0,
            provider="mock",
        )


# ── Module-level singleton ─────────────────────────────────────────────────────


_router: LLMRouter | None = None


def get_llm_router() -> LLMRouter:
    """Lazy module-level singleton.

    The cache is wired in lazily on first use so import time stays cheap and
    tests can monkey-patch ``shared.ai.llm_router.llm_router`` if needed.
    """
    global _router
    if _router is None:
        try:
            from shared.ai.cache import get_llm_cache

            _router = LLMRouter(cache=get_llm_cache())
        except Exception:  # pragma: no cover - defensive fallback
            _router = LLMRouter(cache=None)
    return _router


def set_llm_router(router: LLMRouter | None) -> None:
    """Override the module singleton — used by tests."""
    global _router
    _router = router


# Backwards-compatible alias used elsewhere in the codebase.
llm_router = LLMRouter()
