from __future__ import annotations

class MockMetric:
    def __init__(self, name: str, description: str = ""):
        self.name = name
        self.description = description
    def inc(self, *args, **kwargs): pass
    def dec(self, *args, **kwargs): pass
    def observe(self, *args, **kwargs): pass
    def labels(self, *args, **kwargs): return self

REQUEST_COUNT = MockMetric("http_requests_total", "Total HTTP requests")
REQUEST_LATENCY = MockMetric("http_request_duration_seconds", "HTTP request latency")
AI_TOKENS_USED = MockMetric("ai_tokens_used_total", "Total AI tokens used")
