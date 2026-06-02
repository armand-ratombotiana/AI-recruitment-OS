"""Health check aggregator for all services."""
import asyncio
import time
from typing import Any, Callable

from shared.core.config import get_settings

settings = get_settings()


class HealthChecker:
    """Aggregate health checks from all services."""

    def __init__(self):
        self.checks: dict[str, Callable] = {}

    def register(self, name: str, check_func):
        self.checks[name] = check_func

    async def check_all(self) -> dict[str, Any]:
        results = {}
        for name, check_func in self.checks.items():
            try:
                result = await asyncio.wait_for(check_func(), timeout=5.0)
                results[name] = {"status": "healthy", "details": result}
            except asyncio.TimeoutError:
                results[name] = {"status": "unhealthy", "error": "Health check timed out"}
            except Exception as e:
                results[name] = {"status": "unhealthy", "error": str(e)}
        return results

    async def check_database(self) -> dict:
        from shared.core.database import engine
        start = time.perf_counter()
        async with engine.connect() as conn:
            result = await conn.execute(
                __import__("sqlalchemy").text("SELECT 1")
            )
            result.scalar()
        elapsed_ms = (time.perf_counter() - start) * 1000
        return {
            "type": "postgresql",
            "status": "connected",
            "latency_ms": round(elapsed_ms, 2),
        }

    async def check_redis(self) -> dict:
        from redis.asyncio import from_url
        r = from_url(settings.REDIS_URL, socket_connect_timeout=3)
        try:
            start = time.perf_counter()
            pong = await r.ping()
            elapsed_ms = (time.perf_counter() - start) * 1000
            info = await r.info("server")
            return {
                "type": "redis",
                "status": "connected",
                "ping": pong,
                "version": info.get("redis_version", "unknown"),
                "latency_ms": round(elapsed_ms, 2),
            }
        finally:
            await r.aclose()


health_checker = HealthChecker()
health_checker.register("database", health_checker.check_database)
health_checker.register("redis", health_checker.check_redis)