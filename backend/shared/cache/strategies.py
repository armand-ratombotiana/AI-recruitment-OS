"""Cache strategies: cache-aside, write-through, write-behind, stampede prevention."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable

from shared.cache.manager import CacheManager, get_cache_manager

logger = logging.getLogger("cache.strategies")


class CacheAside:
    async def get_or_set(
        self,
        key: str,
        factory: Callable[[], Awaitable[Any]],
        ttl: int = 300,
        cache_manager: CacheManager | None = None,
    ) -> Any:
        cm = cache_manager or get_cache_manager()
        value = await cm.get(key)
        if value is not None:
            return value
        value = await factory()
        await cm.set(key, value, ttl=ttl)
        return value


class WriteThrough:
    async def write(
        self,
        key: str,
        value: Any,
        persist_fn: Callable[[str, Any], Awaitable[None]],
        ttl: int = 300,
        cache_manager: CacheManager | None = None,
    ) -> None:
        await persist_fn(key, value)
        cm = cache_manager or get_cache_manager()
        await cm.set(key, value, ttl=ttl)

    async def read(
        self,
        key: str,
        load_fn: Callable[[str], Awaitable[Any]],
        ttl: int = 300,
        cache_manager: CacheManager | None = None,
    ) -> Any:
        cm = cache_manager or get_cache_manager()
        value = await cm.get(key)
        if value is not None:
            return value
        value = await load_fn(key)
        await cm.set(key, value, ttl=ttl)
        return value


class WriteBehind:
    def __init__(self, flush_interval: float = 5.0, batch_size: int = 50) -> None:
        self._flush_interval = flush_interval
        self._batch_size = batch_size
        self._pending: dict[str, tuple[Any, float]] = {}
        self._lock = asyncio.Lock()
        self._flush_task: asyncio.Task | None = None
        self._running = False
        self._persist_fn: Callable[[list[tuple[str, Any]]], Awaitable[None]] | None = None
        self._flushed_batches: list[list[tuple[str, Any]]] = []

    async def start(
        self,
        persist_fn: Callable[[list[tuple[str, Any]]], Awaitable[None]],
    ) -> None:
        self._persist_fn = persist_fn
        self._running = True
        self._flush_task = asyncio.create_task(self._flush_loop())

    async def stop(self) -> None:
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        await self.flush()

    async def write(
        self,
        key: str,
        value: Any,
        cache_manager: CacheManager | None = None,
    ) -> None:
        cm = cache_manager or get_cache_manager()
        await cm.set(key, value, ttl=300)
        async with self._lock:
            self._pending[key] = (value, time.time())
            if len(self._pending) >= self._batch_size:
                await self._do_flush()

    async def flush(self) -> None:
        async with self._lock:
            await self._do_flush()

    async def _do_flush(self) -> None:
        if not self._pending or not self._persist_fn:
            return
        batch = list(self._pending.items())
        self._pending.clear()
        pairs = [(k, v) for k, (v, _) in batch]
        await self._persist_fn(pairs)
        self._flushed_batches.append(pairs)

    async def _flush_loop(self) -> None:
        while self._running:
            await asyncio.sleep(self._flush_interval)
            try:
                await self.flush()
            except Exception as exc:
                logger.error("WriteBehind flush error: %s", exc)

    @property
    def pending_count(self) -> int:
        return len(self._pending)

    @property
    def flushed_batches(self) -> list[list[tuple[str, Any]]]:
        return list(self._flushed_batches)


class StampedePrevention:
    def __init__(self) -> None:
        self._locks: dict[str, asyncio.Lock] = {}
        self._global_lock = asyncio.Lock()

    async def _get_lock(self, key: str) -> asyncio.Lock:
        async with self._global_lock:
            if key not in self._locks:
                self._locks[key] = asyncio.Lock()
            return self._locks[key]

    async def get_or_set(
        self,
        key: str,
        factory: Callable[[], Awaitable[Any]],
        ttl: int = 300,
        stale_ttl: int = 600,
        cache_manager: CacheManager | None = None,
    ) -> Any:
        cm = cache_manager or get_cache_manager()
        value = await cm.get(key)
        if value is not None:
            return value

        lock = await self._get_lock(key)
        async with lock:
            value = await cm.get(key)
            if value is not None:
                return value

            stale_key = f"{key}:stale"
            stale_value = await cm.get(stale_key)
            if stale_value is not None:
                asyncio.create_task(self._recompute_and_cache(cm, key, stale_key, factory, ttl, stale_ttl))
                return stale_value

            value = await factory()
            await cm.set(key, value, ttl=ttl)
            await cm.set(stale_key, value, ttl=stale_ttl)
            return value

    async def _recompute_and_cache(
        self,
        cm: CacheManager,
        key: str,
        stale_key: str,
        factory: Callable[[], Awaitable[Any]],
        ttl: int,
        stale_ttl: int,
    ) -> None:
        try:
            value = await factory()
            await cm.set(key, value, ttl=ttl)
            await cm.set(stale_key, value, ttl=stale_ttl)
        except Exception as exc:
            logger.error("StampedePrevention recompute failed for %s: %s", key, exc)

    def clear_locks(self) -> None:
        self._locks.clear()
