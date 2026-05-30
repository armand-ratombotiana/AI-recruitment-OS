"""Rate limiting middleware."""
import time
from collections import defaultdict

class RateLimiter:
    """In-memory rate limiter."""
    
    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: dict[str, list[float]] = defaultdict(list)
    
    def is_allowed(self, key: str) -> bool:
        now = time.time()
        self.requests[key] = [t for t in self.requests[key] if t > now - self.window_seconds]
        if len(self.requests[key]) >= self.max_requests:
            return False
        self.requests[key].append(now)
        return True
    
    def get_remaining(self, key: str) -> int:
        now = time.time()
        recent = [t for t in self.requests[key] if t > now - self.window_seconds]
        return max(0, self.max_requests - len(recent))

rate_limiter = RateLimiter(max_requests=100, window_seconds=60)