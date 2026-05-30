"""Caching middleware for API responses."""
import json
from functools import wraps
from typing import Any, Callable

class CacheManager:
    """Redis-based cache manager."""
    
    def __init__(self):
        self.cache: dict[str, Any] = {}  # In-memory fallback
    
    async def get(self, key: str) -> Any | None:
        return self.cache.get(key)
    
    async def set(self, key: str, value: Any, ttl: int = 300) -> None:
        self.cache[key] = value
    
    async def delete(self, key: str) -> None:
        self.cache.pop(key, None)
    
    async def clear(self) -> None:
        self.cache.clear()

cache_manager = CacheManager()

def cached(ttl: int = 300, key_prefix: str = ""):
    """Decorator for caching API responses."""
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache_key = f"{key_prefix}:{func.__name__}:{hash(str(args) + str(kwargs))}"
            cached_value = await cache_manager.get(cache_key)
            if cached_value is not None:
                return cached_value
            result = await func(*args, **kwargs)
            await cache_manager.set(cache_key, result, ttl)
            return result
        return wrapper
    return decorator