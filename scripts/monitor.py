"""AI-ROS Infrastructure Monitor Script.

Checks backend health, frontend availability, API endpoint status,
and reports overall infrastructure health.

Usage:
    python scripts/monitor.py [--json] [--backend URL] [--frontend URL]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import httpx


class Status(str, Enum):
    OK = "OK"
    FAIL = "FAIL"
    WARN = "WARN"
    SKIP = "SKIP"


@dataclass
class CheckResult:
    name: str
    status: Status
    details: str = ""
    latency_ms: float = 0.0
    data: Any = None


@dataclass
class MonitorReport:
    backend_url: str
    frontend_url: str
    timestamp: str = ""
    checks: list[CheckResult] = field(default_factory=list)

    @property
    def overall_status(self) -> Status:
        statuses = [c.status for c in self.checks]
        if Status.FAIL in statuses:
            return Status.FAIL
        if Status.WARN in statuses:
            return Status.WARN
        return Status.OK

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "backend_url": self.backend_url,
            "frontend_url": self.frontend_url,
            "overall_status": self.overall_status.value,
            "checks": [
                {
                    "name": c.name,
                    "status": c.status.value,
                    "details": c.details,
                    "latency_ms": round(c.latency_ms, 2),
                    "data": c.data,
                }
                for c in self.checks
            ],
            "summary": {
                "total": len(self.checks),
                "passed": sum(1 for c in self.checks if c.status == Status.OK),
                "failed": sum(1 for c in self.checks if c.status == Status.FAIL),
                "warnings": sum(1 for c in self.checks if c.status == Status.WARN),
            },
        }


def _timed_get(url: str, timeout: float = 10.0, **kwargs) -> tuple[httpx.Response | None, float]:
    start = time.time()
    try:
        resp = httpx.get(url, timeout=timeout, **kwargs)
        elapsed = (time.time() - start) * 1000
        return resp, elapsed
    except Exception:
        elapsed = (time.time() - start) * 1000
        return None, elapsed


def _timed_post(url: str, json_data: dict | None = None, timeout: float = 10.0, **kwargs) -> tuple[httpx.Response | None, float]:
    start = time.time()
    try:
        resp = httpx.post(url, json=json_data, timeout=timeout, **kwargs)
        elapsed = (time.time() - start) * 1000
        return resp, elapsed
    except Exception:
        elapsed = (time.time() - start) * 1000
        return None, elapsed


def check_backend_health(base_url: str) -> CheckResult:
    resp, latency = _timed_get(f"{base_url}/health")
    if resp is None:
        return CheckResult(name="Backend Health", status=Status.FAIL, details="Connection refused", latency_ms=latency)
    if resp.status_code == 200:
        data = resp.json()
        status = data.get("status", "unknown")
        return CheckResult(
            name="Backend Health",
            status=Status.OK if status == "healthy" else Status.WARN,
            details=f"HTTP 200 - status: {status}",
            latency_ms=latency,
            data=data,
        )
    return CheckResult(name="Backend Health", status=Status.FAIL, details=f"HTTP {resp.status_code}", latency_ms=latency)


def check_frontend(base_url: str) -> CheckResult:
    resp, latency = _timed_get(base_url, timeout=15.0)
    if resp is None:
        return CheckResult(name="Frontend", status=Status.FAIL, details="Connection refused", latency_ms=latency)
    if resp.status_code == 200:
        has_title = "AI-ROS" in resp.text or "airos" in resp.text.lower()
        return CheckResult(
            name="Frontend",
            status=Status.OK if has_title else Status.WARN,
            details=f"HTTP 200 - {'Title found' if has_title else 'Missing AI-ROS title'}",
            latency_ms=latency,
        )
    return CheckResult(name="Frontend", status=Status.FAIL, details=f"HTTP {resp.status_code}", latency_ms=latency)


def check_api_endpoint(base_url: str, method: str, path: str, name: str, json_data: dict | None = None) -> CheckResult:
    url = f"{base_url}{path}"
    if method.upper() == "GET":
        resp, latency = _timed_get(url)
    else:
        resp, latency = _timed_post(url, json_data=json_data)

    if resp is None:
        return CheckResult(name=name, status=Status.FAIL, details="Connection refused", latency_ms=latency)
    if resp.status_code in (200, 201):
        return CheckResult(name=name, status=Status.OK, details=f"HTTP {resp.status_code}", latency_ms=latency)
    return CheckResult(name=name, status=Status.FAIL, details=f"HTTP {resp.status_code}", latency_ms=latency)


def check_auth_flow(base_url: str) -> CheckResult:
    resp, latency = _timed_post(
        f"{base_url}/api/v1/auth/login",
        json_data={"email": "test@acme.com", "password": "test1234"},
    )
    if resp is None:
        return CheckResult(name="Auth Login Flow", status=Status.FAIL, details="Connection refused", latency_ms=latency)
    if resp.status_code == 200:
        data = resp.json()
        has_token = "access_token" in data
        return CheckResult(
            name="Auth Login Flow",
            status=Status.OK if has_token else Status.WARN,
            details=f"HTTP 200 - token: {'present' if has_token else 'missing'}",
            latency_ms=latency,
        )
    return CheckResult(name="Auth Login Flow", status=Status.FAIL, details=f"HTTP {resp.status_code}", latency_ms=latency)


def check_database(base_url: str) -> CheckResult:
    resp, latency = _timed_get(f"{base_url}/health")
    if resp is None:
        return CheckResult(name="Database", status=Status.FAIL, details="Cannot reach backend", latency_ms=latency)
    data = resp.json()
    db_check = data.get("checks", {}).get("database", {})
    if db_check.get("status") == "healthy":
        return CheckResult(name="Database", status=Status.OK, details="PostgreSQL connected", latency_ms=latency, data=db_check)
    return CheckResult(name="Database", status=Status.WARN, details=db_check.get("error", "Unknown"), latency_ms=latency)


def check_redis(base_url: str) -> CheckResult:
    resp, latency = _timed_get(f"{base_url}/health")
    if resp is None:
        return CheckResult(name="Redis", status=Status.FAIL, details="Cannot reach backend", latency_ms=latency)
    data = resp.json()
    redis_check = data.get("checks", {}).get("redis", {})
    if redis_check.get("status") == "healthy":
        return CheckResult(name="Redis", status=Status.OK, details="Redis connected", latency_ms=latency, data=redis_check)
    return CheckResult(name="Redis", status=Status.WARN, details=redis_check.get("error", "Unknown"), latency_ms=latency)


def run_monitor(backend_url: str, frontend_url: str) -> MonitorReport:
    report = MonitorReport(backend_url=backend_url, frontend_url=frontend_url)
    report.timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    print(f"\n{'='*60}")
    print(f"  AI-ROS Infrastructure Monitor")
    print(f"  Backend:  {backend_url}")
    print(f"  Frontend: {frontend_url}")
    print(f"  Time:     {report.timestamp}")
    print(f"{'='*60}\n")

    checks = [
        ("Backend Health", lambda: check_backend_health(backend_url)),
        ("Frontend", lambda: check_frontend(frontend_url)),
        ("Database", lambda: check_database(backend_url)),
        ("Redis", lambda: check_redis(base_url=backend_url)),
        ("Auth Login", lambda: check_auth_flow(backend_url)),
        ("GET /candidates", lambda: check_api_endpoint(backend_url, "GET", "/api/v1/candidates/", "Candidates API")),
        ("GET /jobs", lambda: check_api_endpoint(backend_url, "GET", "/api/v1/jobs/", "Jobs API")),
        ("GET /interviews", lambda: check_api_endpoint(backend_url, "GET", "/api/v1/interviews/", "Interviews API")),
        ("GET /ppe/problems", lambda: check_api_endpoint(backend_url, "GET", "/api/v1/ppe/problems", "PPE API")),
        ("GET /ai/agents", lambda: check_api_endpoint(backend_url, "GET", "/api/v1/ai/agents", "AI Agents API")),
        ("GET /analytics/dashboard", lambda: check_api_endpoint(backend_url, "GET", "/api/v1/analytics/dashboard", "Analytics API")),
        ("GET /workflows", lambda: check_api_endpoint(backend_url, "GET", "/api/v1/workflows/", "Workflows API")),
        ("GET /notifications", lambda: check_api_endpoint(backend_url, "GET", "/api/v1/notifications/", "Notifications API")),
        ("GET /compliance/status", lambda: check_api_endpoint(backend_url, "GET", "/api/v1/compliance/status", "Compliance API")),
        ("GET /billing/subscription", lambda: check_api_endpoint(backend_url, "GET", "/api/v1/billing/subscription", "Billing API")),
        ("POST /search/candidates", lambda: check_api_endpoint(backend_url, "POST", "/api/v1/search/candidates", "Search API", json_data={"query": "python"})),
    ]

    for name, check_fn in checks:
        result = check_fn()
        report.checks.append(result)
        icon = {"OK": "[OK]", "FAIL": "[FAIL]", "WARN": "[WARN]", "SKIP": "[SKIP]"}.get(result.status.value, "?")
        latency_str = f"{result.latency_ms:.0f}ms" if result.latency_ms > 0 else "N/A"
        print(f"  {icon} [{result.status.value:4s}] {result.name:30s} {latency_str:>8s}  {result.details}")

    print(f"\n{'='*60}")
    s = report.to_dict()["summary"]
    overall_icon = {"OK": "[OK]", "FAIL": "[FAIL]", "WARN": "[WARN]"}.get(report.overall_status.value, "?")
    print(f"  Overall: {overall_icon} {report.overall_status.value}")
    print(f"  Passed: {s['passed']}/{s['total']}  Failed: {s['failed']}  Warnings: {s['warnings']}")
    print(f"{'='*60}\n")

    return report


def main():
    parser = argparse.ArgumentParser(description="AI-ROS Infrastructure Monitor")
    parser.add_argument("--backend", default="http://localhost:8000", help="Backend URL")
    parser.add_argument("--frontend", default="http://localhost:3000", help="Frontend URL")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    args = parser.parse_args()

    report = run_monitor(args.backend, args.frontend)

    if args.json:
        print(json.dumps(report.to_dict(), indent=2))

    sys.exit(0 if report.overall_status == Status.OK else 1)


if __name__ == "__main__":
    main()
