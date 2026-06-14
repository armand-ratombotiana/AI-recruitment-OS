"""Multi-region deployment manager — definitions, residency rules, replication.

Provides the canonical registry of deployment regions, data-residency
constraints, per-tenant region preferences, and cross-region replication
state.  All other services should consult :class:`RegionManager` rather than
hard-coding region logic.
"""
from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

logger = logging.getLogger("shared.regions")


class RegionStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    MAINTENANCE = "maintenance"


class DataClassification(str, Enum):
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    country: str
    continent: str
    city: str
    latitude: float
    longitude: float
    status: RegionStatus = RegionStatus.HEALTHY
    data_residency_zones: tuple[str, ...] = ()
    capabilities: tuple[str, ...] = ()
    weight: int = 100

    def supports_zone(self, zone: str) -> bool:
        return zone in self.data_residency_zones


@dataclass
class RegionHealth:
    region_id: str
    status: RegionStatus
    latency_ms: float
    uptime_pct: float
    last_check: float
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class ReplicationState:
    source_region: str
    target_region: str
    lag_seconds: float
    last_sync: float
    status: str
    records_pending: int = 0


EU_ZONE = "eu"
US_ZONE = "us"
APAC_ZONE = "apac"
SA_ZONE = "sa"

REGIONS: dict[str, Region] = {
    "us-east-1": Region(
        id="us-east-1",
        name="US East (N. Virginia)",
        country="US",
        continent="North America",
        city="Ashburn",
        latitude=39.0438,
        longitude=-77.4874,
        data_residency_zones=(US_ZONE,),
        capabilities=("full", "ai-inference", "video-processing"),
        weight=100,
    ),
    "us-west-2": Region(
        id="us-west-2",
        name="US West (Oregon)",
        country="US",
        continent="North America",
        city="Boardman",
        latitude=45.8399,
        longitude=-119.7006,
        data_residency_zones=(US_ZONE,),
        capabilities=("full", "ai-inference"),
        weight=100,
    ),
    "eu-west-1": Region(
        id="eu-west-1",
        name="EU West (Ireland)",
        country="IE",
        continent="Europe",
        city="Dublin",
        latitude=53.3498,
        longitude=-6.2603,
        data_residency_zones=(EU_ZONE, "eea"),
        capabilities=("full", "ai-inference", "gdpr-native"),
        weight=100,
    ),
    "eu-central-1": Region(
        id="eu-central-1",
        name="EU Central (Frankfurt)",
        country="DE",
        continent="Europe",
        city="Frankfurt",
        latitude=50.1109,
        longitude=8.6821,
        data_residency_zones=(EU_ZONE, "eea"),
        capabilities=("full", "ai-inference", "gdpr-native"),
        weight=100,
    ),
    "ap-south-1": Region(
        id="ap-south-1",
        name="APAC South (Mumbai)",
        country="IN",
        continent="Asia",
        city="Mumbai",
        latitude=19.0760,
        longitude=72.8777,
        data_residency_zones=(APAC_ZONE,),
        capabilities=("full", "ai-inference"),
        weight=80,
    ),
    "ap-northeast-1": Region(
        id="ap-northeast-1",
        name="APAC Northeast (Tokyo)",
        country="JP",
        continent="Asia",
        city="Tokyo",
        latitude=35.6762,
        longitude=139.6503,
        data_residency_zones=(APAC_ZONE,),
        capabilities=("full", "ai-inference", "video-processing"),
        weight=100,
    ),
    "ap-southeast-1": Region(
        id="ap-southeast-1",
        name="APAC Southeast (Singapore)",
        country="SG",
        continent="Asia",
        city="Singapore",
        latitude=1.3521,
        longitude=103.8198,
        data_residency_zones=(APAC_ZONE,),
        capabilities=("full", "ai-inference"),
        weight=90,
    ),
    "sa-east-1": Region(
        id="sa-east-1",
        name="SA East (Sao Paulo)",
        country="BR",
        continent="South America",
        city="Sao Paulo",
        latitude=-23.5505,
        longitude=-46.6333,
        data_residency_zones=(SA_ZONE,),
        capabilities=("full",),
        weight=70,
    ),
}

RESIDENCY_RULES: dict[str, dict[str, Any]] = {
    EU_ZONE: {
        "required_zones": (EU_ZONE,),
        "allowed_regions": [r.id for r in REGIONS.values() if r.supports_zone(EU_ZONE)],
        "description": "GDPR: personal data of EU residents must remain in EU/EEA regions",
        "enforcement": "strict",
    },
    US_ZONE: {
        "required_zones": (US_ZONE,),
        "allowed_regions": [r.id for r in REGIONS.values() if r.supports_zone(US_ZONE)],
        "description": "US data residency for federal and regulated workloads",
        "enforcement": "strict",
    },
    APAC_ZONE: {
        "required_zones": (APAC_ZONE,),
        "allowed_regions": [r.id for r in REGIONS.values() if r.supports_zone(APAC_ZONE)],
        "description": "APAC data sovereignty for regional compliance",
        "enforcement": "preferred",
    },
    SA_ZONE: {
        "required_zones": (SA_ZONE,),
        "allowed_regions": [r.id for r in REGIONS.values() if r.supports_zone(SA_ZONE)],
        "description": "Brazilian LGPD data residency",
        "enforcement": "preferred",
    },
}

COUNTRY_TO_ZONE: dict[str, str] = {
    "AT": EU_ZONE, "BE": EU_ZONE, "BG": EU_ZONE, "HR": EU_ZONE, "CY": EU_ZONE,
    "CZ": EU_ZONE, "DK": EU_ZONE, "EE": EU_ZONE, "FI": EU_ZONE, "FR": EU_ZONE,
    "DE": EU_ZONE, "GR": EU_ZONE, "HU": EU_ZONE, "IE": EU_ZONE, "IT": EU_ZONE,
    "LV": EU_ZONE, "LT": EU_ZONE, "LU": EU_ZONE, "MT": EU_ZONE, "NL": EU_ZONE,
    "PL": EU_ZONE, "PT": EU_ZONE, "RO": EU_ZONE, "SK": EU_ZONE, "SI": EU_ZONE,
    "ES": EU_ZONE, "SE": EU_ZONE, "GB": EU_ZONE, "IS": EU_ZONE, "LI": EU_ZONE,
    "NO": EU_ZONE, "CH": EU_ZONE,
    "US": US_ZONE, "CA": US_ZONE, "MX": US_ZONE,
    "IN": APAC_ZONE, "JP": APAC_ZONE, "SG": APAC_ZONE, "AU": APAC_ZONE,
    "KR": APAC_ZONE, "NZ": APAC_ZONE, "TH": APAC_ZONE, "ID": APAC_ZONE,
    "BR": SA_ZONE, "AR": SA_ZONE, "CL": SA_ZONE, "CO": SA_ZONE, "PE": SA_ZONE,
}


class RegionManager:
    """Central registry for region state, residency, and replication."""

    def __init__(self) -> None:
        self._regions: dict[str, Region] = dict(REGIONS)
        self._health: dict[str, RegionHealth] = {}
        self._tenant_preferences: dict[str, str] = {}
        self._replication: dict[str, ReplicationState] = {}
        self._now = time.time()
        self._seed_health()
        self._seed_replication()

    def _seed_health(self) -> None:
        for rid, region in self._regions.items():
            self._health[rid] = RegionHealth(
                region_id=rid,
                status=region.status,
                latency_ms=0.0,
                uptime_pct=99.99,
                last_check=self._now,
            )

    def _seed_replication(self) -> None:
        pairs = [
            ("us-east-1", "eu-west-1"),
            ("us-east-1", "ap-northeast-1"),
            ("eu-west-1", "us-east-1"),
            ("eu-central-1", "eu-west-1"),
            ("ap-northeast-1", "ap-southeast-1"),
        ]
        for src, tgt in pairs:
            key = f"{src}->{tgt}"
            self._replication[key] = ReplicationState(
                source_region=src,
                target_region=tgt,
                lag_seconds=0.5,
                last_sync=self._now,
                status="active",
                records_pending=0,
            )

    def list_regions(self) -> list[dict[str, Any]]:
        return [
            {
                "id": r.id,
                "name": r.name,
                "country": r.country,
                "continent": r.continent,
                "city": r.city,
                "latitude": r.latitude,
                "longitude": r.longitude,
                "status": self._health[r.id].status.value if r.id in self._health else r.status.value,
                "data_residency_zones": list(r.data_residency_zones),
                "capabilities": list(r.capabilities),
                "weight": r.weight,
            }
            for r in self._regions.values()
        ]

    def get_region(self, region_id: str) -> Region | None:
        return self._regions.get(region_id)

    def get_current_region(self) -> str:
        import os
        return os.environ.get("AIROS_REGION", "us-east-1")

    def set_tenant_preference(self, tenant_id: str, region_id: str) -> dict[str, str]:
        if region_id not in self._regions:
            raise ValueError(f"Unknown region: {region_id}")
        self._tenant_preferences[tenant_id] = region_id
        return {"tenant_id": tenant_id, "preferred_region": region_id}

    def get_tenant_preference(self, tenant_id: str) -> str | None:
        return self._tenant_preferences.get(tenant_id)

    def resolve_tenant_region(self, tenant_id: str) -> str:
        pref = self._tenant_preferences.get(tenant_id)
        if pref and pref in self._regions:
            h = self._health.get(pref)
            if h and h.status not in (RegionStatus.UNHEALTHY, RegionStatus.MAINTENANCE):
                return pref
        healthy = self.get_healthy_regions()
        if healthy:
            return healthy[0]
        return self.get_current_region()

    def check_residency(self, zone: str, region_id: str) -> dict[str, Any]:
        rule = RESIDENCY_RULES.get(zone)
        if not rule:
            return {
                "zone": zone,
                "region_id": region_id,
                "compliant": True,
                "reason": f"No residency rule for zone '{zone}'",
            }
        region = self._regions.get(region_id)
        if not region:
            return {
                "zone": zone,
                "region_id": region_id,
                "compliant": False,
                "reason": f"Unknown region '{region_id}'",
            }
        allowed = rule["allowed_regions"]
        compliant = region_id in allowed
        return {
            "zone": zone,
            "region_id": region_id,
            "compliant": compliant,
            "enforcement": rule["enforcement"],
            "allowed_regions": allowed,
            "reason": None if compliant else (
                f"Region '{region_id}' is not in allowed regions for zone '{zone}': {allowed}"
            ),
        }

    def get_residency_zone_for_country(self, country_code: str) -> str | None:
        return COUNTRY_TO_ZONE.get(country_code.upper())

    def get_compliant_regions(self, zone: str) -> list[str]:
        rule = RESIDENCY_RULES.get(zone)
        if not rule:
            return list(self._regions.keys())
        return list(rule["allowed_regions"])

    def get_health(self, region_id: str | None = None) -> dict[str, Any] | list[dict[str, Any]]:
        if region_id:
            h = self._health.get(region_id)
            if not h:
                return {"region_id": region_id, "status": "unknown", "latency_ms": None}
            return {
                "region_id": h.region_id,
                "status": h.status.value,
                "latency_ms": h.latency_ms,
                "uptime_pct": h.uptime_pct,
                "last_check": h.last_check,
                "details": h.details,
            }
        return [
            {
                "region_id": h.region_id,
                "status": h.status.value,
                "latency_ms": h.latency_ms,
                "uptime_pct": h.uptime_pct,
                "last_check": h.last_check,
            }
            for h in self._health.values()
        ]

    def update_health(
        self,
        region_id: str,
        *,
        status: RegionStatus | None = None,
        latency_ms: float | None = None,
        uptime_pct: float | None = None,
        details: dict[str, Any] | None = None,
    ) -> RegionHealth:
        h = self._health.get(region_id)
        if not h:
            h = RegionHealth(
                region_id=region_id,
                status=status or RegionStatus.HEALTHY,
                latency_ms=latency_ms or 0.0,
                uptime_pct=uptime_pct or 99.99,
                last_check=time.time(),
            )
            self._health[region_id] = h
            return h
        if status is not None:
            h.status = status
        if latency_ms is not None:
            h.latency_ms = latency_ms
        if uptime_pct is not None:
            h.uptime_pct = uptime_pct
        if details is not None:
            h.details = details
        h.last_check = time.time()
        return h

    def get_healthy_regions(self) -> list[str]:
        return [
            rid for rid, h in self._health.items()
            if h.status in (RegionStatus.HEALTHY, RegionStatus.DEGRADED)
        ]

    def get_replication_state(self) -> list[dict[str, Any]]:
        return [
            {
                "source_region": r.source_region,
                "target_region": r.target_region,
                "lag_seconds": r.lag_seconds,
                "last_sync": r.last_sync,
                "status": r.status,
                "records_pending": r.records_pending,
            }
            for r in self._replication.values()
        ]

    def get_replication_pair(self, source: str, target: str) -> dict[str, Any] | None:
        key = f"{source}->{target}"
        r = self._replication.get(key)
        if not r:
            return None
        return {
            "source_region": r.source_region,
            "target_region": r.target_region,
            "lag_seconds": r.lag_seconds,
            "last_sync": r.last_sync,
            "status": r.status,
            "records_pending": r.records_pending,
        }

    @staticmethod
    def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        R = 6371.0
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlam = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


region_manager = RegionManager()
