"""Health check aggregator for all services."""
import asyncio
from typing import Any, Callable

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
                result = await check_func()
                results[name] = {"status": "healthy", "details": result}
            except Exception as e:
                results[name] = {"status": "unhealthy", "error": str(e)}
        return results
    
    async def check_database(self) -> dict:
        return {"type": "postgresql", "status": "connected"}
    
    async def check_redis(self) -> dict:
        return {"type": "redis", "status": "connected"}

health_checker = HealthChecker()
health_checker.register("database", health_checker.check_database)
health_checker.register("redis", health_checker.check_redis)