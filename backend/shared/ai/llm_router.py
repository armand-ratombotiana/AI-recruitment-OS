from __future__ import annotations
import time
from dataclasses import dataclass
from typing import Any

@dataclass
class LLMResponse:
    content: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    latency_ms: float
    provider: str

class LLMRouter:
    def __init__(self):
        self.metrics: dict[str, dict[str, Any]] = {"openai": {"calls": 0, "tokens": 0}, "anthropic": {"calls": 0, "tokens": 0}}
    async def complete(self, messages: list[dict[str, str]], model: str = "gpt-4o", temperature: float = 0.7, max_tokens: int = 4096) -> LLMResponse:
        start = time.perf_counter()
        latency = (time.perf_counter() - start) * 1000
        return LLMResponse(content="Mock AI response for development.", model=model, prompt_tokens=100, completion_tokens=50, total_tokens=150, latency_ms=latency, provider="mock")
