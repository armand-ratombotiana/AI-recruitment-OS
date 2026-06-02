"""AI-ROS Comprehensive Infrastructure Monitor.

Checks all service health endpoints, database connectivity, Redis,
frontend accessibility, and logs results to file.

Usage:
    python scripts/monitor.py [OPTIONS]

    --backend URL          Backend URL (default: http://localhost:8000)
    --frontend URL         Frontend URL (default: http://localhost:3000)
    --json                 Output JSON to stdout
    --log-file PATH        Log results to file (default: logs/monitor.log)
    --quiet                Suppress console output
    --timeout SECONDS      HTTP timeout (default: 10)
    --continuous           Run continuously at intervals
    --interval SECONDS     Interval for continuous mode (default: 60)
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

try:
    import httpx

    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

try:
    import psycopg2

    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

try:
    import redis

    HAS_REDIS = True
except ImportError:
    HAS_REDIS = False


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
    hostname: str = ""
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
            "hostname": self.hostname,
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
                "skipped": sum(1 for c in self.checks if c.status == Status.SKIP),
            },
        }


def _setup_logger(log_file: str | None, quiet: bool) -> logging.Logger:
    logger = logging.getLogger("airos-monitor")
    logger.setLevel(logging.DEBUG)

    if not quiet:
        console = logging.StreamHandler(sys.stdout)
        console.setLevel(logging.INFO)
        logger.addHandler(console)

    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
        )
        logger.addHandler(file_handler)

    return logger


def _timed_get(url: str, timeout: float = 10.0, **kwargs) -> tuple[Any, float]:
    start = time.time()
    try:
        if HAS_HTTPX:
            resp = httpx.get(url, timeout=timeout, follow_redirects=True, **kwargs)
        else:
            import urllib.request

            req = urllib.request.Request(url, **kwargs)
            resp_raw = urllib.request.urlopen(req, timeout=timeout)
            elapsed = (time.time() - start) * 1000

            class SimpleResponse:
                status_code = resp_raw.getcode()
                text = resp_raw.read().decode()
                headers = dict(resp_raw.headers)

                def json(self):
                    return json.loads(self.text)

            return SimpleResponse(), elapsed
        elapsed = (time.time() - start) * 1000
        return resp, elapsed
    except Exception:
        elapsed = (time.time() - start) * 1000
        return None, elapsed


def _timed_post(
    url: str, json_data: dict | None = None, timeout: float = 10.0, **kwargs
) -> tuple[Any, float]:
    start = time.time()
    try:
        if HAS_HTTPX:
            resp = httpx.post(url, json=json_data, timeout=timeout, **kwargs)
        else:
            import urllib.request

            data = json.dumps(json_data).encode() if json_data else None
            req = urllib.request.Request(
                url, data=data, headers={"Content-Type": "application/json"}
            )
            resp_raw = urllib.request.urlopen(req, timeout=timeout)
            elapsed = (time.time() - start) * 1000

            class SimpleResponse:
                status_code = resp_raw.getcode()
                text = resp_raw.read().decode()

                def json(self):
                    return json.loads(self.text)

            return SimpleResponse(), elapsed
        elapsed = (time.time() - start) * 1000
        return resp, elapsed
    except Exception:
        elapsed = (time.time() - start) * 1000
        return None, elapsed


def check_backend_health(base_url: str, timeout: float = 10.0) -> CheckResult:
    resp, latency = _timed_get(f"{base_url}/health", timeout=timeout)
    if resp is None:
        return CheckResult(
            name="Backend Health",
            status=Status.FAIL,
            details="Connection refused",
            latency_ms=latency,
        )
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
    return CheckResult(
        name="Backend Health",
        status=Status.FAIL,
        details=f"HTTP {resp.status_code}",
        latency_ms=latency,
    )


def check_backend_readiness(base_url: str, timeout: float = 10.0) -> CheckResult:
    resp, latency = _timed_get(f"{base_url}/ready", timeout=timeout)
    if resp is None:
        return CheckResult(
            name="Backend Readiness",
            status=Status.FAIL,
            details="Connection refused",
            latency_ms=latency,
        )
    if resp.status_code == 200:
        return CheckResult(
            name="Backend Readiness",
            status=Status.OK,
            details="Ready to accept traffic",
            latency_ms=latency,
        )
    return CheckResult(
        name="Backend Readiness",
        status=Status.WARN,
        details=f"HTTP {resp.status_code}",
        latency_ms=latency,
    )


def check_frontend(base_url: str, timeout: float = 15.0) -> CheckResult:
    resp, latency = _timed_get(base_url, timeout=timeout)
    if resp is None:
        return CheckResult(
            name="Frontend",
            status=Status.FAIL,
            details="Connection refused",
            latency_ms=latency,
        )
    if resp.status_code == 200:
        has_title = "airos" in resp.text.lower()
        return CheckResult(
            name="Frontend",
            status=Status.OK if has_title else Status.WARN,
            details=f"HTTP 200 - {'Title found' if has_title else 'Missing AI-ROS title'}",
            latency_ms=latency,
        )
    return CheckResult(
        name="Frontend",
        status=Status.FAIL,
        details=f"HTTP {resp.status_code}",
        latency_ms=latency,
    )


def check_database_direct(
    host: str, port: int, user: str, password: str, dbname: str, timeout: float = 5.0
) -> CheckResult:
    if not HAS_PSYCOPG2:
        return CheckResult(
            name="Database (Direct)",
            status=Status.SKIP,
            details="psycopg2 not installed",
        )
    start = time.time()
    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            dbname=dbname,
            connect_timeout=int(timeout),
        )
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        latency = (time.time() - start) * 1000
        return CheckResult(
            name="Database (Direct)",
            status=Status.OK,
            details=f"PostgreSQL connected - query returned {result[0]}",
            latency_ms=latency,
        )
    except Exception as e:
        latency = (time.time() - start) * 1000
        return CheckResult(
            name="Database (Direct)",
            status=Status.FAIL,
            details=str(e)[:200],
            latency_ms=latency,
        )


def check_database(base_url: str, timeout: float = 10.0) -> CheckResult:
    resp, latency = _timed_get(f"{base_url}/health", timeout=timeout)
    if resp is None:
        return CheckResult(
            name="Database",
            status=Status.FAIL,
            details="Cannot reach backend",
            latency_ms=latency,
        )
    data = resp.json()
    db_check = data.get("checks", {}).get("database", {})
    if db_check.get("status") == "healthy":
        return CheckResult(
            name="Database",
            status=Status.OK,
            details="PostgreSQL connected",
            latency_ms=latency,
            data=db_check,
        )
    return CheckResult(
        name="Database",
        status=Status.WARN,
        details=db_check.get("error", "Unknown")[:200],
        latency_ms=latency,
    )


def check_redis_direct(
    host: str, port: int, password: str | None = None, timeout: float = 5.0
) -> CheckResult:
    if not HAS_REDIS:
        return CheckResult(
            name="Redis (Direct)",
            status=Status.SKIP,
            details="redis package not installed",
        )
    start = time.time()
    try:
        client = redis.Redis(
            host=host,
            port=port,
            password=password,
            socket_timeout=int(timeout),
            decode_responses=True,
        )
        client.ping()
        info = client.info("memory")
        latency = (time.time() - start) * 1000
        used_memory = info.get("used_memory_human", "unknown")
        return CheckResult(
            name="Redis (Direct)",
            status=Status.OK,
            details=f"Redis connected - memory: {used_memory}",
            latency_ms=latency,
            data={"used_memory": used_memory},
        )
    except Exception as e:
        latency = (time.time() - start) * 1000
        return CheckResult(
            name="Redis (Direct)",
            status=Status.FAIL,
            details=str(e)[:200],
            latency_ms=latency,
        )


def check_redis(base_url: str, timeout: float = 10.0) -> CheckResult:
    resp, latency = _timed_get(f"{base_url}/health", timeout=timeout)
    if resp is None:
        return CheckResult(
            name="Redis",
            status=Status.FAIL,
            details="Cannot reach backend",
            latency_ms=latency,
        )
    data = resp.json()
    redis_check = data.get("checks", {}).get("redis", {})
    if redis_check.get("status") == "healthy":
        return CheckResult(
            name="Redis",
            status=Status.OK,
            details="Redis connected",
            latency_ms=latency,
            data=redis_check,
        )
    return CheckResult(
        name="Redis",
        status=Status.WARN,
        details=redis_check.get("error", "Unknown")[:200],
        latency_ms=latency,
    )


def check_api_endpoint(
    base_url: str,
    method: str,
    path: str,
    name: str,
    json_data: dict | None = None,
    timeout: float = 10.0,
) -> CheckResult:
    url = f"{base_url}{path}"
    if method.upper() == "GET":
        resp, latency = _timed_get(url, timeout=timeout)
    else:
        resp, latency = _timed_post(url, json_data=json_data, timeout=timeout)

    if resp is None:
        return CheckResult(
            name=name,
            status=Status.FAIL,
            details="Connection refused",
            latency_ms=latency,
        )
    if resp.status_code in (200, 201, 204):
        return CheckResult(
            name=name,
            status=Status.OK,
            details=f"HTTP {resp.status_code}",
            latency_ms=latency,
        )
    if resp.status_code in (401, 403):
        return CheckResult(
            name=name,
            status=Status.WARN,
            details=f"HTTP {resp.status_code} (auth required)",
            latency_ms=latency,
        )
    return CheckResult(
        name=name,
        status=Status.FAIL,
        details=f"HTTP {resp.status_code}",
        latency_ms=latency,
    )


def check_auth_flow(base_url: str, timeout: float = 10.0) -> CheckResult:
    resp, latency = _timed_post(
        f"{base_url}/api/v1/auth/login",
        json_data={"email": "test@acme.com", "password": "test1234"},
        timeout=timeout,
    )
    if resp is None:
        return CheckResult(
            name="Auth Login Flow",
            status=Status.FAIL,
            details="Connection refused",
            latency_ms=latency,
        )
    if resp.status_code == 200:
        data = resp.json()
        has_token = "access_token" in data
        return CheckResult(
            name="Auth Login Flow",
            status=Status.OK if has_token else Status.WARN,
            details=f"HTTP 200 - token: {'present' if has_token else 'missing'}",
            latency_ms=latency,
        )
    if resp.status_code in (401, 422):
        return CheckResult(
            name="Auth Login Flow",
            status=Status.WARN,
            details=f"HTTP {resp.status_code} (expected with test creds)",
            latency_ms=latency,
        )
    return CheckResult(
        name="Auth Login Flow",
        status=Status.FAIL,
        details=f"HTTP {resp.status_code}",
        latency_ms=latency,
    )


def check_docker_containers() -> CheckResult:
    """Check if Docker containers are running."""
    import subprocess

    try:
        result = subprocess.run(
            ["docker", "compose", "ps", "--format", "json"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return CheckResult(
                name="Docker Containers",
                status=Status.WARN,
                details=f"docker compose ps failed: {result.stderr[:200]}",
            )

        containers = []
        for line in result.stdout.strip().split("\n"):
            if line.strip():
                try:
                    containers.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

        running = sum(
            1 for c in containers if c.get("State") == "running"
        )
        total = len(containers)

        if running == total and total > 0:
            return CheckResult(
                name="Docker Containers",
                status=Status.OK,
                details=f"{running}/{total} containers running",
                data={"running": running, "total": total},
            )
        elif total == 0:
            return CheckResult(
                name="Docker Containers",
                status=Status.WARN,
                details="No containers found",
            )
        else:
            return CheckResult(
                name="Docker Containers",
                status=Status.FAIL,
                details=f"{running}/{total} containers running",
                data={"running": running, "total": total},
            )
    except FileNotFoundError:
        return CheckResult(
            name="Docker Containers",
            status=Status.SKIP,
            details="Docker not available",
        )
    except subprocess.TimeoutExpired:
        return CheckResult(
            name="Docker Containers",
            status=Status.FAIL,
            details="Docker command timed out",
        )


def check_disk_usage(threshold_percent: float = 85.0) -> CheckResult:
    """Check disk usage against threshold."""
    import shutil

    total, used, free = shutil.disk_usage("/")
    used_pct = (used / total) * 100
    free_gb = free / (1024**3)
    total_gb = total / (1024**3)

    if used_pct >= 95:
        status = Status.FAIL
    elif used_pct >= threshold_percent:
        status = Status.WARN
    else:
        status = Status.OK

    return CheckResult(
        name="Disk Usage",
        status=status,
        details=f"{used_pct:.1f}% used - {free_gb:.1f}GB free / {total_gb:.1f}GB total",
        data={
            "used_percent": round(used_pct, 1),
            "free_gb": round(free_gb, 1),
            "total_gb": round(total_gb, 1),
        },
    )


def check_http_service(name: str, url: str, timeout: float = 5.0) -> CheckResult:
    resp, latency = _timed_get(url, timeout=timeout)
    if resp is None:
        return CheckResult(
            name=name, status=Status.FAIL, details="Connection refused", latency_ms=latency
        )
    if resp.status_code == 200:
        return CheckResult(
            name=name, status=Status.OK, details=f"HTTP {resp.status_code}", latency_ms=latency
        )
    return CheckResult(
        name=name, status=Status.WARN, details=f"HTTP {resp.status_code}", latency_ms=latency
    )


def run_monitor(
    backend_url: str,
    frontend_url: str,
    timeout: float = 10.0,
    include_direct_checks: bool = False,
) -> MonitorReport:
    import socket

    report = MonitorReport(backend_url=backend_url, frontend_url=frontend_url)
    report.timestamp = datetime.now(timezone.utc).isoformat()
    report.hostname = socket.gethostname()

    backend_health_url = backend_url.rstrip("/")
    frontend_health_url = frontend_url.rstrip("/")

    checks = [
        ("Backend Health", lambda: check_backend_health(backend_health_url, timeout)),
        ("Backend Readiness", lambda: check_backend_readiness(backend_health_url, timeout)),
        ("Frontend", lambda: check_frontend(frontend_health_url, timeout)),
        ("Database", lambda: check_database(backend_health_url, timeout)),
        ("Redis", lambda: check_redis(backend_health_url, timeout)),
        ("Auth Login", lambda: check_auth_flow(backend_health_url, timeout)),
        (
            "GET /candidates",
            lambda: check_api_endpoint(
                backend_health_url, "GET", "/api/v1/candidates/", "Candidates API", timeout=timeout
            ),
        ),
        (
            "GET /jobs",
            lambda: check_api_endpoint(
                backend_health_url, "GET", "/api/v1/jobs/", "Jobs API", timeout=timeout
            ),
        ),
        (
            "GET /interviews",
            lambda: check_api_endpoint(
                backend_health_url, "GET", "/api/v1/interviews/", "Interviews API", timeout=timeout
            ),
        ),
        (
            "GET /ppe/problems",
            lambda: check_api_endpoint(
                backend_health_url, "GET", "/api/v1/ppe/problems", "PPE API", timeout=timeout
            ),
        ),
        (
            "GET /ai/agents",
            lambda: check_api_endpoint(
                backend_health_url, "GET", "/api/v1/ai/agents", "AI Agents API", timeout=timeout
            ),
        ),
        (
            "GET /analytics/dashboard",
            lambda: check_api_endpoint(
                backend_health_url, "GET", "/api/v1/analytics/dashboard", "Analytics API", timeout=timeout
            ),
        ),
        (
            "GET /workflows",
            lambda: check_api_endpoint(
                backend_health_url, "GET", "/api/v1/workflows/", "Workflows API", timeout=timeout
            ),
        ),
        (
            "GET /notifications",
            lambda: check_api_endpoint(
                backend_health_url, "GET", "/api/v1/notifications/", "Notifications API", timeout=timeout
            ),
        ),
        (
            "GET /compliance/status",
            lambda: check_api_endpoint(
                backend_health_url, "GET", "/api/v1/compliance/status", "Compliance API", timeout=timeout
            ),
        ),
        (
            "GET /billing/subscription",
            lambda: check_api_endpoint(
                backend_health_url, "GET", "/api/v1/billing/subscription", "Billing API", timeout=timeout
            ),
        ),
        (
            "POST /search/candidates",
            lambda: check_api_endpoint(
                backend_health_url,
                "POST",
                "/api/v1/search/candidates",
                "Search API",
                json_data={"query": "python"},
                timeout=timeout,
            ),
        ),
        (
            "GET /tenants",
            lambda: check_api_endpoint(
                backend_health_url, "GET", "/api/v1/tenants/", "Tenants API", timeout=timeout
            ),
        ),
        (
            "GET /users",
            lambda: check_api_endpoint(
                backend_health_url, "GET", "/api/v1/users/", "Users API", timeout=timeout
            ),
        ),
        (
            "GET /resumes",
            lambda: check_api_endpoint(
                backend_health_url, "GET", "/api/v1/resumes/", "Resumes API", timeout=timeout
            ),
        ),
        (
            "GET /ws/health",
            lambda: check_api_endpoint(
                backend_health_url, "GET", "/api/v1/ws/health", "WebSocket API", timeout=timeout
            ),
        ),
        ("Docker Containers", lambda: check_docker_containers()),
        ("Disk Usage", lambda: check_disk_usage()),
    ]

    for name, check_fn in checks:
        result = check_fn()
        report.checks.append(result)

    return report


def print_report(report: MonitorReport, logger: logging.Logger) -> None:
    logger.info("=" * 70)
    logger.info("  AI-ROS Infrastructure Monitor")
    logger.info(f"  Hostname:  {report.hostname}")
    logger.info(f"  Backend:   {report.backend_url}")
    logger.info(f"  Frontend:  {report.frontend_url}")
    logger.info(f"  Time:      {report.timestamp}")
    logger.info("=" * 70)
    logger.info("")

    icons = {
        Status.OK: "[OK]  ",
        Status.FAIL: "[FAIL]",
        Status.WARN: "[WARN]",
        Status.SKIP: "[SKIP]",
    }

    for result in report.checks:
        icon = icons.get(result.status, "?    ")
        latency_str = f"{result.latency_ms:.0f}ms" if result.latency_ms > 0 else "N/A"
        logger.info(
            f"  {icon} [{result.status.value:4s}] {result.name:30s} {latency_str:>8s}  {result.details}"
        )

    logger.info("")
    logger.info("=" * 70)
    s = report.to_dict()["summary"]
    overall_icon = icons.get(report.overall_status, "?    ")
    logger.info(f"  Overall: {overall_icon} {report.overall_status.value}")
    logger.info(
        f"  Passed: {s['passed']}/{s['total']}  Failed: {s['failed']}  Warnings: {s['warnings']}  Skipped: {s['skipped']}"
    )
    logger.info("=" * 70)
    logger.info("")


def write_report_file(report: MonitorReport, log_file: str) -> None:
    """Append report summary to log file."""
    log_path = Path(log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    with open(log_path, "a") as f:
        entry = {
            "timestamp": report.timestamp,
            "hostname": report.hostname,
            "overall_status": report.overall_status.value,
            "summary": report.to_dict()["summary"],
            "failed_checks": [
                {
                    "name": c.name,
                    "status": c.status.value,
                    "details": c.details,
                }
                for c in report.checks
                if c.status in (Status.FAIL, Status.WARN)
            ],
        }
        f.write(json.dumps(entry) + "\n")


def main():
    parser = argparse.ArgumentParser(
        description="AI-ROS Comprehensive Infrastructure Monitor",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--backend", default="http://localhost:8000", help="Backend URL"
    )
    parser.add_argument(
        "--frontend", default="http://localhost:3000", help="Frontend URL"
    )
    parser.add_argument("--json", action="store_true", help="Output JSON to stdout")
    parser.add_argument(
        "--log-file", default="logs/monitor.log", help="Log file path"
    )
    parser.add_argument(
        "--quiet", action="store_true", help="Suppress console output"
    )
    parser.add_argument(
        "--timeout", type=float, default=10.0, help="HTTP timeout in seconds"
    )
    parser.add_argument(
        "--continuous",
        action="store_true",
        help="Run continuously at intervals",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=60,
        help="Interval in seconds for continuous mode",
    )
    args = parser.parse_args()

    logger = _setup_logger(args.log_file if not args.json else None, args.quiet)

    if args.continuous:
        logger.info(f"Starting continuous monitoring (interval: {args.interval}s)")
        while True:
            report = run_monitor(args.backend, args.frontend, timeout=args.timeout)
            print_report(report, logger)
            write_report_file(report, args.log_file)

            if args.json:
                print(json.dumps(report.to_dict(), indent=2))

            logger.info(f"Next check in {args.interval}s...\n")
            time.sleep(args.interval)
    else:
        report = run_monitor(args.backend, args.frontend, timeout=args.timeout)
        print_report(report, logger)
        write_report_file(report, args.log_file)

        if args.json:
            print(json.dumps(report.to_dict(), indent=2))

        sys.exit(0 if report.overall_status == Status.OK else 1)


if __name__ == "__main__":
    main()
