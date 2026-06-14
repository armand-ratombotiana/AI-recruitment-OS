"""Region-aware request routing — geo, latency, health, and failover.

The :class:`RegionRouter` is consulted on every inbound request (or can be
called explicitly) to decide which region should serve the request.  It
combines three signals:

1. **Geo-routing** — pick the region closest to the client by Haversine
   distance from the client's latitude/longitude.
2. **Latency-based routing** — pick the region with the lowest observed
   latency from the health store.
3. **Health-based routing** — exclude regions that are unhealthy or in
   maintenance before making a selection.

When the preferred region is unhealthy the router transparently fails over
to the next-best healthy region.
"""
from __future__ import annotations

import logging
from typing import Any

from shared.regions.manager import (
    RegionManager,
    RegionStatus,
    region_manager as _default_manager,
)

logger = logging.getLogger("shared.regions.routing")


class RegionRouter:
    """Deterministic region selection with failover."""

    def __init__(self, manager: RegionManager | None = None) -> None:
        self._mgr = manager or _default_manager

    def geo_route(
        self,
        latitude: float,
        longitude: float,
        *,
        zone: str | None = None,
    ) -> dict[str, Any]:
        candidates = (
            self._mgr.get_compliant_regions(zone)
            if zone
            else list(self._mgr.list_regions())
        )
        candidate_ids = (
            [c["id"] if isinstance(c, dict) else c for c in candidates]
        )
        healthy = set(self._mgr.get_healthy_regions())
        viable = [rid for rid in candidate_ids if rid in healthy]
        if not viable:
            viable = candidate_ids

        best_id = None
        best_dist = float("inf")
        for rid in viable:
            region = self._mgr.get_region(rid)
            if not region:
                continue
            dist = self._mgr.haversine_km(
                latitude, longitude, region.latitude, region.longitude,
            )
            if dist < best_dist:
                best_dist = dist
                best_id = rid

        return {
            "selected_region": best_id,
            "distance_km": round(best_dist, 2) if best_id else None,
            "strategy": "geo",
            "failover": best_id not in healthy if best_id else False,
            "candidates_evaluated": len(viable),
        }

    def latency_route(
        self,
        *,
        zone: str | None = None,
    ) -> dict[str, Any]:
        candidates = (
            self._mgr.get_compliant_regions(zone)
            if zone
            else [r["id"] for r in self._mgr.list_regions()]
        )
        healthy = set(self._mgr.get_healthy_regions())
        viable = [rid for rid in candidates if rid in healthy]
        if not viable:
            viable = candidates

        best_id = None
        best_latency = float("inf")
        all_latencies: dict[str, float] = {}
        for rid in viable:
            h = self._mgr.get_health(rid)
            if isinstance(h, dict):
                raw = h.get("latency_ms")
                lat = raw if raw is not None else float("inf")
            else:
                lat = float("inf")
            all_latencies[rid] = lat
            if lat < best_latency:
                best_latency = lat
                best_id = rid

        return {
            "selected_region": best_id,
            "latency_ms": best_latency if best_id and best_latency < float("inf") else None,
            "strategy": "latency",
            "failover": best_id not in healthy if best_id else False,
            "all_latencies": {k: v for k, v in all_latencies.items() if v < float("inf")},
        }

    def health_route(
        self,
        *,
        zone: str | None = None,
    ) -> dict[str, Any]:
        candidates = (
            self._mgr.get_compliant_regions(zone)
            if zone
            else [r["id"] for r in self._mgr.list_regions()]
        )
        healthy_only = [
            rid for rid in candidates
            if rid in set(self._mgr.get_healthy_regions())
        ]
        if not healthy_only:
            return {
                "selected_region": None,
                "strategy": "health",
                "healthy_regions": [],
                "all_unhealthy": True,
            }

        best_id = None
        best_uptime = -1.0
        for rid in healthy_only:
            h = self._mgr.get_health(rid)
            if isinstance(h, dict):
                up = h.get("uptime_pct", 0.0)
            else:
                up = 0.0
            if up > best_uptime:
                best_uptime = up
                best_id = rid

        return {
            "selected_region": best_id,
            "strategy": "health",
            "healthy_regions": healthy_only,
            "uptime_pct": best_uptime,
        }

    def route_with_failover(
        self,
        preferred_region: str,
        *,
        zone: str | None = None,
    ) -> dict[str, Any]:
        healthy = set(self._mgr.get_healthy_regions())
        candidates = (
            self._mgr.get_compliant_regions(zone)
            if zone
            else [r["id"] for r in self._mgr.list_regions()]
        )

        if preferred_region in healthy and preferred_region in candidates:
            return {
                "selected_region": preferred_region,
                "strategy": "preferred",
                "failover": False,
                "reason": None,
            }

        failover_order = self._build_failover_order(preferred_region, candidates, healthy)
        selected = failover_order[0] if failover_order else None
        return {
            "selected_region": selected,
            "strategy": "failover",
            "failover": True,
            "reason": f"Region '{preferred_region}' is unhealthy or unavailable",
            "failover_candidates": failover_order,
        }

    def _build_failover_order(
        self,
        preferred: str,
        candidates: list[str],
        healthy: set[str],
    ) -> list[str]:
        preferred_region = self._mgr.get_region(preferred)
        scored: list[tuple[float, str]] = []
        for rid in candidates:
            if rid == preferred or rid not in healthy:
                continue
            region = self._mgr.get_region(rid)
            if not region or not preferred_region:
                scored.append((999999.0, rid))
                continue
            dist = self._mgr.haversine_km(
                preferred_region.latitude, preferred_region.longitude,
                region.latitude, region.longitude,
            )
            h = self._mgr.get_health(rid)
            lat = h.get("latency_ms", 100.0) if isinstance(h, dict) else 100.0
            score = dist * 0.3 + lat * 0.7
            scored.append((score, rid))
        scored.sort(key=lambda t: t[0])
        return [rid for _, rid in scored]

    def smart_route(
        self,
        *,
        tenant_id: str | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
        zone: str | None = None,
    ) -> dict[str, Any]:
        if tenant_id:
            pref = self._mgr.get_tenant_preference(tenant_id)
            if pref:
                result = self.route_with_failover(pref, zone=zone)
                if not result["failover"]:
                    return result

        if latitude is not None and longitude is not None:
            return self.geo_route(latitude, longitude, zone=zone)

        return self.latency_route(zone=zone)


region_router = RegionRouter()
