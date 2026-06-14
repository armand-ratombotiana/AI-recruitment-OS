"""CDN integration for CloudFront and Cloudflare.

Provides:
- Cache invalidation via provider APIs
- Cache warming for hot paths
- Edge caching header generation
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import httpx

logger = logging.getLogger("cache.cdn")


class CDNProvider(str, Enum):
    CLOUDFRONT = "cloudfront"
    CLOUDFLARE = "cloudflare"


@dataclass
class CDNConfig:
    provider: CDNProvider = CDNProvider.CLOUDFRONT
    distribution_id: str = ""
    api_token: str = ""
    zone_id: str = ""
    base_url: str = ""
    enabled: bool = False


@dataclass
class InvalidationResult:
    success: bool
    provider: CDNProvider
    invalidated_paths: list[str] = field(default_factory=list)
    invalidation_id: str = ""
    error: str | None = None
    timestamp: float = field(default_factory=time.time)


@dataclass
class WarmResult:
    success: bool
    warmed_paths: list[str] = field(default_factory=list)
    errors: dict[str, str] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)


class CDNClient:
    def __init__(self, config: CDNConfig | None = None, http_client: httpx.AsyncClient | None = None) -> None:
        self._config = config or CDNConfig()
        self._http = http_client
        self._owns_client = http_client is None
        self._invalidation_log: list[InvalidationResult] = []

    @property
    def config(self) -> CDNConfig:
        return self._config

    @property
    def invalidation_log(self) -> list[InvalidationResult]:
        return list(self._invalidation_log)

    async def _get_client(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=30.0)
            self._owns_client = True
        return self._http

    async def close(self) -> None:
        if self._owns_client and self._http is not None:
            await self._http.aclose()
            self._http = None

    async def invalidate_paths(self, paths: list[str]) -> InvalidationResult:
        if not paths:
            return InvalidationResult(
                success=True,
                provider=self._config.provider,
                invalidated_paths=[],
            )

        if not self._config.enabled:
            result = InvalidationResult(
                success=True,
                provider=self._config.provider,
                invalidated_paths=paths,
                invalidation_id=f"local-{int(time.time())}",
            )
            self._invalidation_log.append(result)
            return result

        try:
            if self._config.provider == CDNProvider.CLOUDFRONT:
                result = await self._invalidate_cloudfront(paths)
            elif self._config.provider == CDNProvider.CLOUDFLARE:
                result = await self._invalidate_cloudflare(paths)
            else:
                result = InvalidationResult(
                    success=False,
                    provider=self._config.provider,
                    error=f"Unknown provider: {self._config.provider}",
                )
        except Exception as exc:
            logger.error("CDN invalidation failed: %s", exc)
            result = InvalidationResult(
                success=False,
                provider=self._config.provider,
                invalidated_paths=paths,
                error=str(exc),
            )

        self._invalidation_log.append(result)
        return result

    async def _invalidate_cloudfront(self, paths: list[str]) -> InvalidationResult:
        client = await self._get_client()
        invalidation_id = f"INV-{int(time.time() * 1000)}"

        headers = {
            "Content-Type": "text/xml",
            "Authorization": f"AWS4-HMAC-SHA256 Credential={self._config.api_token}",
        }
        xml_body = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            "<InvalidationBatch xmlns=\"http://cloudfront.amazonaws.com/doc/2020-05-31/\">"
            "<Paths><Quantity>{qty}</Quantity><Items>"
            "{items}"
            "</Items></Paths>"
            "<CallerReference>{ref}</CallerReference>"
            "</InvalidationBatch>"
        ).format(
            qty=len(paths),
            items="".join(f"<Path>{p}</Path>" for p in paths),
            ref=invalidation_id,
        )

        url = f"https://cloudfront.amazonaws.com/2020-05-31/distribution/{self._config.distribution_id}/invalidation"
        resp = await client.post(url, content=xml_body, headers=headers)

        if resp.status_code in (200, 201, 202):
            return InvalidationResult(
                success=True,
                provider=CDNProvider.CLOUDFRONT,
                invalidated_paths=paths,
                invalidation_id=invalidation_id,
            )
        return InvalidationResult(
            success=False,
            provider=CDNProvider.CLOUDFRONT,
            invalidated_paths=paths,
            error=f"HTTP {resp.status_code}: {resp.text}",
        )

    async def _invalidate_cloudflare(self, paths: list[str]) -> InvalidationResult:
        client = await self._get_client()
        invalidation_id = f"CF-{int(time.time() * 1000)}"

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._config.api_token}",
        }
        payload = {"files": paths}
        url = f"https://api.cloudflare.com/client/v4/zones/{self._config.zone_id}/purge_cache"
        resp = await client.post(url, json=payload, headers=headers)

        if resp.status_code == 200:
            return InvalidationResult(
                success=True,
                provider=CDNProvider.CLOUDFLARE,
                invalidated_paths=paths,
                invalidation_id=invalidation_id,
            )
        return InvalidationResult(
            success=False,
            provider=CDNProvider.CLOUDFLARE,
            invalidated_paths=paths,
            error=f"HTTP {resp.status_code}: {resp.text}",
        )

    async def warm_paths(
        self,
        paths: list[str],
        base_url: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> WarmResult:
        effective_base = base_url or self._config.base_url or "http://localhost:8000"
        effective_base = effective_base.rstrip("/")
        client = await self._get_client()
        warmed: list[str] = []
        errors: dict[str, str] = {}

        for path in paths:
            url = f"{effective_base}{path}" if path.startswith("/") else f"{effective_base}/{path}"
            try:
                resp = await client.get(url, headers=headers or {})
                if resp.status_code < 400:
                    warmed.append(path)
                else:
                    errors[path] = f"HTTP {resp.status_code}"
            except Exception as exc:
                errors[path] = str(exc)

        return WarmResult(
            success=len(errors) == 0,
            warmed_paths=warmed,
            errors=errors,
        )


def generate_edge_headers(
    ttl: int = 300,
    stale_while_revalidate: int = 60,
    stale_if_error: int = 3600,
    cache_control: str | None = None,
    vary: list[str] | None = None,
    surrogate_key: str | None = None,
    is_public: bool = True,
) -> dict[str, str]:
    headers: dict[str, str] = {}

    if cache_control:
        headers["Cache-Control"] = cache_control
    else:
        visibility = "public" if is_public else "private"
        parts = [
            f"{visibility}",
            f"max-age={ttl}",
            f"stale-while-revalidate={stale_while_revalidate}",
            f"stale-if-error={stale_if_error}",
        ]
        headers["Cache-Control"] = ", ".join(parts)

    vary_fields = vary or ["Accept", "Accept-Encoding", "Authorization"]
    headers["Vary"] = ", ".join(vary_fields)

    if surrogate_key:
        headers["Surrogate-Key"] = surrogate_key
        headers["Surrogate-Control"] = f"max-age={ttl}"

    headers["CDN-Cache-Control"] = f"max-age={ttl}"
    headers["X-Cache-Status"] = "MISS"

    return headers


def generate_tenant_cache_key(tenant_id: str, path: str, params: dict[str, str] | None = None) -> str:
    parts = [f"tenant:{tenant_id}", path.lstrip("/")]
    if params:
        sorted_params = sorted(params.items())
        parts.append("?".join(f"{k}={v}" for k, v in sorted_params))
    return ":".join(parts)


_cdn_client: CDNClient | None = None


def get_cdn_client(config: CDNConfig | None = None) -> CDNClient:
    global _cdn_client
    if _cdn_client is None:
        _cdn_client = CDNClient(config)
    return _cdn_client


def reset_cdn_client() -> None:
    global _cdn_client
    _cdn_client = None
