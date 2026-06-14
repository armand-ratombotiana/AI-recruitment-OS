"""Tests for multi-region deployment, data residency, and geo-routing.

Covers:
* Region listing
* Current region resolution
* Tenant region preference
* Data residency compliance checks
* Geo-based routing
* Latency-based routing
* Health-based routing
* Region failover
* Cross-region replication state
* Smart routing with tenant preference
* Residency zone listing
* Region health endpoint
* Haversine distance calculation
* Unhealthy region exclusion
* Country-to-zone mapping
"""
from __future__ import annotations

import os
import sys
import math

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.security import create_access_token
from shared.regions.manager import (
    RegionManager,
    RegionStatus,
    REGIONS,
    RESIDENCY_RULES,
    COUNTRY_TO_ZONE,
    EU_ZONE,
    US_ZONE,
    APAC_ZONE,
)
from shared.regions.routing import RegionRouter


TENANT_ID = "test-tenant-regions"


def _make_token(tenant_id: str = TENANT_ID, sub: str = "user", role: str = "recruiter") -> str:
    return create_access_token({
        "sub": sub,
        "email": f"{sub}@test.com",
        "role": role,
        "tenant_id": tenant_id,
    })


def _auth(tenant_id: str = TENANT_ID, role: str = "recruiter") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, role=role)}"}


@pytest.fixture
def mgr() -> RegionManager:
    return RegionManager()


@pytest.fixture
def router_inst(mgr: RegionManager) -> RegionRouter:
    return RegionRouter(mgr)


@pytest_asyncio.fixture
async def region_client():
    from apps.region_service.main import router as region_router

    app = FastAPI()
    app.include_router(region_router, prefix="/api/v1/regions")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── Region Manager Unit Tests ─────────────────────────────────────────────


def test_list_regions_returns_all(mgr: RegionManager):
    regions = mgr.list_regions()
    assert len(regions) == len(REGIONS)
    ids = {r["id"] for r in regions}
    assert "us-east-1" in ids
    assert "eu-west-1" in ids
    assert "ap-northeast-1" in ids


def test_get_region_valid(mgr: RegionManager):
    r = mgr.get_region("eu-central-1")
    assert r is not None
    assert r.country == "DE"
    assert r.continent == "Europe"


def test_get_region_invalid(mgr: RegionManager):
    assert mgr.get_region("nonexistent-region") is None


def test_tenant_preference_set_and_get(mgr: RegionManager):
    result = mgr.set_tenant_preference("t1", "eu-west-1")
    assert result["preferred_region"] == "eu-west-1"
    assert mgr.get_tenant_preference("t1") == "eu-west-1"


def test_tenant_preference_invalid_region(mgr: RegionManager):
    with pytest.raises(ValueError, match="Unknown region"):
        mgr.set_tenant_preference("t1", "invalid-region")


def test_resolve_tenant_region_with_preference(mgr: RegionManager):
    mgr.set_tenant_preference("t1", "ap-northeast-1")
    assert mgr.resolve_tenant_region("t1") == "ap-northeast-1"


def test_resolve_tenant_region_no_preference(mgr: RegionManager):
    resolved = mgr.resolve_tenant_region("unknown-tenant")
    assert resolved == mgr.get_current_region()


def test_resolve_tenant_region_unhealthy_preference(mgr: RegionManager):
    mgr.set_tenant_preference("t1", "us-east-1")
    mgr.update_health("us-east-1", status=RegionStatus.UNHEALTHY)
    resolved = mgr.resolve_tenant_region("t1")
    assert resolved != "us-east-1"


# ── Data Residency Tests ──────────────────────────────────────────────────


def test_residency_eu_compliant(mgr: RegionManager):
    result = mgr.check_residency(EU_ZONE, "eu-west-1")
    assert result["compliant"] is True
    assert result["reason"] is None


def test_residency_eu_non_compliant(mgr: RegionManager):
    result = mgr.check_residency(EU_ZONE, "us-east-1")
    assert result["compliant"] is False
    assert result["reason"] is not None
    assert "not in allowed regions" in result["reason"]


def test_residency_us_compliant(mgr: RegionManager):
    result = mgr.check_residency(US_ZONE, "us-east-1")
    assert result["compliant"] is True


def test_residency_us_non_compliant(mgr: RegionManager):
    result = mgr.check_residency(US_ZONE, "eu-west-1")
    assert result["compliant"] is False


def test_residency_unknown_zone(mgr: RegionManager):
    result = mgr.check_residency("unknown-zone", "us-east-1")
    assert result["compliant"] is True


def test_residency_unknown_region(mgr: RegionManager):
    result = mgr.check_residency(EU_ZONE, "nonexistent")
    assert result["compliant"] is False


def test_country_to_zone_mapping(mgr: RegionManager):
    assert mgr.get_residency_zone_for_country("DE") == EU_ZONE
    assert mgr.get_residency_zone_for_country("US") == US_ZONE
    assert mgr.get_residency_zone_for_country("JP") == APAC_ZONE
    assert mgr.get_residency_zone_for_country("XX") is None


def test_get_compliant_regions(mgr: RegionManager):
    eu_regions = mgr.get_compliant_regions(EU_ZONE)
    assert "eu-west-1" in eu_regions
    assert "eu-central-1" in eu_regions
    assert "us-east-1" not in eu_regions


# ── Geo-Routing Tests ─────────────────────────────────────────────────────


def test_geo_route_paris_to_eu(router_inst: RegionRouter):
    result = router_inst.geo_route(48.8566, 2.3522)
    selected = result["selected_region"]
    assert selected in ("eu-west-1", "eu-central-1")
    assert result["strategy"] == "geo"
    assert result["distance_km"] is not None
    assert result["distance_km"] < 2000


def test_geo_route_new_york_to_us(router_inst: RegionRouter):
    result = router_inst.geo_route(40.7128, -74.0060)
    selected = result["selected_region"]
    assert selected in ("us-east-1", "us-west-2")
    assert result["strategy"] == "geo"


def test_geo_route_tokyo_to_apac(router_inst: RegionRouter):
    result = router_inst.geo_route(35.6762, 139.6503)
    assert result["selected_region"] == "ap-northeast-1"


def test_geo_route_with_zone_constraint(router_inst: RegionRouter):
    result = router_inst.geo_route(48.8566, 2.3522, zone=EU_ZONE)
    assert result["selected_region"] in ("eu-west-1", "eu-central-1")


def test_geo_route_zone_excludes_non_compliant(router_inst: RegionRouter):
    result = router_inst.geo_route(40.7128, -74.0060, zone=EU_ZONE)
    assert result["selected_region"] in ("eu-west-1", "eu-central-1")


# ── Latency Routing Tests ─────────────────────────────────────────────────


def test_latency_route_selects_lowest(router_inst: RegionRouter):
    for rid in REGIONS:
        router_inst._mgr.update_health(rid, latency_ms=500.0)
    router_inst._mgr.update_health("us-east-1", latency_ms=10.0)
    router_inst._mgr.update_health("eu-west-1", latency_ms=50.0)
    router_inst._mgr.update_health("ap-northeast-1", latency_ms=200.0)
    result = router_inst.latency_route()
    assert result["selected_region"] == "us-east-1"
    assert result["latency_ms"] == 10.0
    assert result["strategy"] == "latency"


def test_latency_route_with_zone(router_inst: RegionRouter):
    router_inst._mgr.update_health("eu-west-1", latency_ms=20.0)
    router_inst._mgr.update_health("eu-central-1", latency_ms=30.0)
    result = router_inst.latency_route(zone=EU_ZONE)
    assert result["selected_region"] == "eu-west-1"


# ── Health-Based Routing Tests ────────────────────────────────────────────


def test_health_route_selects_highest_uptime(router_inst: RegionRouter):
    for rid in REGIONS:
        router_inst._mgr.update_health(rid, uptime_pct=50.0)
    router_inst._mgr.update_health("us-east-1", uptime_pct=99.9)
    router_inst._mgr.update_health("eu-west-1", uptime_pct=99.99)
    router_inst._mgr.update_health("ap-northeast-1", uptime_pct=99.5)
    result = router_inst.health_route()
    assert result["selected_region"] == "eu-west-1"
    assert result["uptime_pct"] == 99.99


def test_health_route_excludes_unhealthy(router_inst: RegionRouter):
    router_inst._mgr.update_health("us-east-1", status=RegionStatus.UNHEALTHY)
    result = router_inst.health_route()
    assert result["selected_region"] != "us-east-1"
    assert "us-east-1" not in result["healthy_regions"]


def test_health_route_all_unhealthy(router_inst: RegionRouter):
    for rid in REGIONS:
        router_inst._mgr.update_health(rid, status=RegionStatus.UNHEALTHY)
    result = router_inst.health_route()
    assert result["selected_region"] is None
    assert result["all_unhealthy"] is True


# ── Failover Tests ────────────────────────────────────────────────────────


def test_failover_no_failover_needed(router_inst: RegionRouter):
    result = router_inst.route_with_failover("us-east-1")
    assert result["selected_region"] == "us-east-1"
    assert result["failover"] is False


def test_failover_when_primary_unhealthy(router_inst: RegionRouter):
    router_inst._mgr.update_health("us-east-1", status=RegionStatus.UNHEALTHY)
    result = router_inst.route_with_failover("us-east-1")
    assert result["selected_region"] != "us-east-1"
    assert result["failover"] is True
    assert len(result["failover_candidates"]) > 0


def test_failover_picks_nearest_healthy(router_inst: RegionRouter):
    router_inst._mgr.update_health("eu-west-1", status=RegionStatus.UNHEALTHY)
    result = router_inst.route_with_failover("eu-west-1")
    assert result["failover"] is True
    assert result["selected_region"] in ("eu-central-1", "us-east-1", "us-west-2")


def test_failover_with_zone_constraint(router_inst: RegionRouter):
    router_inst._mgr.update_health("eu-west-1", status=RegionStatus.UNHEALTHY)
    result = router_inst.route_with_failover("eu-west-1", zone=EU_ZONE)
    assert result["selected_region"] == "eu-central-1"


# ── Smart Routing Tests ───────────────────────────────────────────────────


def test_smart_route_uses_tenant_preference(router_inst: RegionRouter):
    router_inst._mgr.set_tenant_preference("t1", "ap-northeast-1")
    result = router_inst.smart_route(tenant_id="t1")
    assert result["selected_region"] == "ap-northeast-1"


def test_smart_route_falls_back_to_geo(router_inst: RegionRouter):
    result = router_inst.smart_route(latitude=35.6762, longitude=139.6503)
    assert result["selected_region"] == "ap-northeast-1"
    assert result["strategy"] == "geo"


def test_smart_route_falls_back_to_latency(router_inst: RegionRouter):
    result = router_inst.smart_route()
    assert result["strategy"] == "latency"
    assert result["selected_region"] is not None


# ── Haversine Distance Tests ──────────────────────────────────────────────


def test_haversine_same_point():
    d = RegionManager.haversine_km(0, 0, 0, 0)
    assert d == 0.0


def test_haversine_known_distance():
    d = RegionManager.haversine_km(48.8566, 2.3522, 51.5074, -0.1278)
    assert 330 < d < 350


# ── Replication Tests ─────────────────────────────────────────────────────


def test_replication_state_list(mgr: RegionManager):
    states = mgr.get_replication_state()
    assert len(states) > 0
    for s in states:
        assert "source_region" in s
        assert "target_region" in s
        assert "lag_seconds" in s
        assert s["status"] == "active"


def test_replication_pair(mgr: RegionManager):
    pair = mgr.get_replication_pair("us-east-1", "eu-west-1")
    assert pair is not None
    assert pair["source_region"] == "us-east-1"
    assert pair["target_region"] == "eu-west-1"


def test_replication_pair_nonexistent(mgr: RegionManager):
    assert mgr.get_replication_pair("xx-1", "yy-2") is None


# ── API Endpoint Tests ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_api_list_regions(region_client):
    resp = await region_client.get("/api/v1/regions", headers=_auth())
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == len(REGIONS)
    assert all("id" in r for r in data)


@pytest.mark.asyncio
async def test_api_list_regions_unauthorized(region_client):
    resp = await region_client.get("/api/v1/regions")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_api_current_region(region_client):
    resp = await region_client.get("/api/v1/regions/current", headers=_auth())
    assert resp.status_code == 200
    data = resp.json()
    assert "current_region" in data
    assert "tenant_id" in data
    assert data["tenant_id"] == TENANT_ID


@pytest.mark.asyncio
async def test_api_select_region(region_client):
    resp = await region_client.post(
        "/api/v1/regions/select",
        headers=_auth(),
        json={"region_id": "eu-central-1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["preferred_region"] == "eu-central-1"
    assert data["region_details"]["country"] == "DE"


@pytest.mark.asyncio
async def test_api_select_invalid_region(region_client):
    resp = await region_client.post(
        "/api/v1/regions/select",
        headers=_auth(),
        json={"region_id": "invalid-region"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_api_region_health(region_client):
    resp = await region_client.get("/api/v1/regions/health", headers=_auth())
    assert resp.status_code == 200
    data = resp.json()
    assert "regions" in data
    assert "overall_status" in data
    assert data["total_count"] == len(REGIONS)
    assert data["healthy_count"] > 0


@pytest.mark.asyncio
async def test_api_residency_check(region_client):
    resp = await region_client.post(
        "/api/v1/regions/residency/check",
        headers=_auth(),
        json={"zone": "eu", "region_id": "eu-west-1"},
    )
    assert resp.status_code == 200
    assert resp.json()["compliant"] is True


@pytest.mark.asyncio
async def test_api_residency_check_non_compliant(region_client):
    resp = await region_client.post(
        "/api/v1/regions/residency/check",
        headers=_auth(),
        json={"zone": "eu", "region_id": "us-east-1"},
    )
    assert resp.status_code == 200
    assert resp.json()["compliant"] is False


@pytest.mark.asyncio
async def test_api_residency_zones(region_client):
    resp = await region_client.get("/api/v1/regions/residency/zones", headers=_auth())
    assert resp.status_code == 200
    data = resp.json()
    assert "eu" in data
    assert "us" in data
    assert "apac" in data


@pytest.mark.asyncio
async def test_api_geo_route(region_client):
    resp = await region_client.post(
        "/api/v1/regions/route/geo",
        headers=_auth(),
        json={"latitude": 48.8566, "longitude": 2.3522},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["strategy"] == "geo"
    assert data["selected_region"] in ("eu-west-1", "eu-central-1")


@pytest.mark.asyncio
async def test_api_geo_route_missing_coords(region_client):
    resp = await region_client.post(
        "/api/v1/regions/route/geo",
        headers=_auth(),
        json={},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_api_latency_route(region_client):
    resp = await region_client.post(
        "/api/v1/regions/route/latency",
        headers=_auth(),
        json={},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["strategy"] == "latency"
    assert data["selected_region"] is not None


@pytest.mark.asyncio
async def test_api_failover_route(region_client):
    resp = await region_client.post(
        "/api/v1/regions/route/failover",
        headers=_auth(),
        json={"preferred_region": "us-east-1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["selected_region"] == "us-east-1"
    assert data["failover"] is False


@pytest.mark.asyncio
async def test_api_replication(region_client):
    resp = await region_client.get("/api/v1/regions/replication", headers=_auth())
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0


@pytest.mark.asyncio
async def test_api_viewer_role_forbidden(region_client):
    resp = await region_client.get(
        "/api/v1/regions",
        headers=_auth(role="viewer"),
    )
    assert resp.status_code == 403
