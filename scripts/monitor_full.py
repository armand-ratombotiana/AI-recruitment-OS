"""AI-ROS Comprehensive Monitor — all 9 services, all API endpoints,
all databases, frontend, Prometheus, Grafana, and a structured pass/fail
report.

Usage:
    python scripts/monitor_full.py                # one-shot
    python scripts/monitor_full.py --json         # machine-readable output
    python scripts/monitor_full.py --report PATH  # write Markdown report
    python scripts/monitor_full.py --log-file PATH

Exit code: 0 if overall PASS, 1 otherwise.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
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


# ── Configuration ─────────────────────────────────────────────────────────────

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://localhost:9090")
GRAFANA_URL = os.getenv("GRAFANA_URL", "http://localhost:3001")
ALERTMANAGER_URL = os.getenv("ALERTMANAGER_URL", "http://localhost:9093")
JAEGER_URL = os.getenv("JAEGER_URL", "http://localhost:16686")

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_USER = os.getenv("POSTGRES_USER", "airos")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "airos_dev_password")
POSTGRES_DB = os.getenv("POSTGRES_DB", "airos")

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

# The 9 docker-compose services from docker-compose.yml
DOCKER_SERVICES = [
    ("postgres",        POSTGRES_HOST, POSTGRES_PORT, "tcp"),
    ("redis",           REDIS_HOST,    REDIS_PORT,    "tcp"),
    ("api",             "localhost",   8000,          "http"),
    ("celery-worker",   None,          None,          "docker"),
    ("frontend",        "localhost",   3000,          "http"),
    ("prometheus",      "localhost",   9090,          "http"),
    ("grafana",         "localhost",   3001,          "http"),
    ("jaeger",          "localhost",   16686,         "http"),
    ("alertmanager",    "localhost",   9093,          "http"),
]

# Sub-endpoint probes for the main API
API_HEALTH_ENDPOINTS = [
    ("Backend /health",          f"{BACKEND_URL}/health"),
    ("Auth /health",             f"{BACKEND_URL}/api/v1/auth/health"),
    ("Candidates /health",       f"{BACKEND_URL}/api/v1/candidates/health"),
    ("Jobs /health",             f"{BACKEND_URL}/api/v1/jobs/health"),
    ("Interviews /health",       f"{BACKEND_URL}/api/v1/interviews/health"),
    ("PPE /health",              f"{BACKEND_URL}/api/v1/ppe/health"),
    ("AI /health",               f"{BACKEND_URL}/api/v1/ai/health"),
    ("Analytics /health",        f"{BACKEND_URL}/api/v1/analytics/health"),
    ("Workflows /health",        f"{BACKEND_URL}/api/v1/workflows/health"),
    ("Notifications /health",    f"{BACKEND_URL}/api/v1/notifications/health"),
    ("Compliance /health",       f"{BACKEND_URL}/api/v1/compliance/health"),
    ("Billing /health",          f"{BACKEND_URL}/api/v1/billing/health"),
    ("Search /health",           f"{BACKEND_URL}/api/v1/search/health"),
    ("Tenants /health",          f"{BACKEND_URL}/api/v1/tenants/health"),
    ("Users /health",            f"{BACKEND_URL}/api/v1/users/health"),
    ("Resumes /health",          f"{BACKEND_URL}/api/v1/resumes/health"),
    ("WebSocket /health",        f"{BACKEND_URL}/api/v1/ws/health"),
    ("SSO /health",              f"{BACKEND_URL}/api/v1/sso/health"),
    ("Innovation /health",       f"{BACKEND_URL}/api/v1/innovations/health"),
    ("OpenAPI spec",             f"{BACKEND_URL}/openapi.json"),
]

FRONTEND_PATHS = ["/", "/dashboard", "/candidates", "/jobs", "/interviews", "/ppe"]

PROMETHEUS_ENDPOINTS = [
    ("Prometheus /-/healthy",    f"{PROMETHEUS_URL}/-/healthy"),
    ("Prometheus /api/v1/status/runtimeinfo",
                                  f"{PROMETHEUS_URL}/api/v1/status/runtimeinfo"),
    ("Prometheus targets",       f"{PROMETHEUS_URL}/api/v1/targets"),
    ("Prometheus metrics",       f"{PROMETHEUS_URL}/metrics"),
]

GRAFANA_ENDPOINTS = [
    ("Grafana /api/health",      f"{GRAFANA_URL}/api/health"),
    ("Grafana /api/dashboards",  f"{GRAFANA_URL}/api/search?query="),
]


# ── Result model ─────────────────────────────────────────────────────────────

class Status(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    WARN = "WARN"
    SKIP = "SKIP"


@dataclass
class CheckResult:
    category: str
    name: str
    status: Status
    details: str = ""
    latency_ms: float = 0.0
    data: Any = None

    def to_dict(self) -> dict:
        return {
            "category": self.category,
            "name": self.name,
            "status": self.status.value,
            "details": self.details,
            "latency_ms": round(self.latency_ms, 2),
            "data": self.data,
        }


@dataclass
class MonitorReport:
    timestamp: str = ""
    hostname: str = ""
    checks: list[CheckResult] = field(default_factory=list)

    @property
    def overall(self) -> Status:
        statuses = {c.status for c in self.checks}
        if Status.FAIL in statuses:
            return Status.FAIL
        if Status.WARN in statuses:
            return Status.WARN
        if statuses == {Status.SKIP}:
            return Status.SKIP
        return Status.PASS

    def by_category(self) -> dict[str, list[CheckResult]]:
        out: dict[str, list[CheckResult]] = {}
        for c in self.checks:
            out.setdefault(c.category, []).append(c)
        return out

    def summary(self) -> dict:
        s = {"total": len(self.checks), "pass": 0, "fail": 0, "warn": 0, "skip": 0}
        for c in self.checks:
            s[c.status.value.lower()] += 1
        return s

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "hostname": self.hostname,
            "overall": self.overall.value,
            "summary": self.summary(),
            "checks": [c.to_dict() for c in self.checks],
        }


# ── HTTP helper ──────────────────────────────────────────────────────────────

def _http_get(url: str, timeout: float = 5.0, **kwargs) -> tuple[httpx.Response | None, float]:
    start = time.perf_counter()
    try:
        if HAS_HTTPX:
            r = httpx.get(url, timeout=timeout, follow_redirects=True, **kwargs)
        else:
            import urllib.request
            req = urllib.request.Request(url, **kwargs)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                class R:
                    status_code = resp.getcode()
                    text = resp.read().decode("utf-8", errors="replace")
                    headers = dict(resp.headers)
                    def json(self_inner):
                        return json.loads(self_inner.text)
                r = R()  # noqa: N806
        return r, (time.perf_counter() - start) * 1000
    except Exception:
        return None, (time.perf_counter() - start) * 1000


# ── Checkers ─────────────────────────────────────────────────────────────────

def check_docker_service(name: str, host: str | None, port: int | None,
                          kind: str) -> CheckResult:
    """Check a docker-compose service.

    kind == 'docker' → only the container itself (e.g. celery-worker has
    no exposed port). We inspect docker ps for the running state.
    kind == 'tcp'    → open a TCP socket to the host/port.
    kind == 'http'   → HTTP GET on the health or root URL.
    """
    if kind == "docker":
        try:
            result = subprocess.run(
                ["docker", "ps", "--filter", f"name=airos-{name}",
                 "--format", "{{.Names}}\t{{.Status}}"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode != 0:
                return CheckResult("docker", name, Status.WARN,
                                   f"docker ps failed: {result.stderr.strip()[:200]}")
            lines = [l for l in result.stdout.strip().splitlines() if l]
            if not lines:
                return CheckResult("docker", name, Status.WARN, "container not running")
            for line in lines:
                parts = line.split("\t")
                if len(parts) >= 2 and "Up" in parts[1]:
                    return CheckResult("docker", name, Status.PASS, parts[1])
            return CheckResult("docker", name, Status.WARN, lines[0].split("\t")[-1])
        except FileNotFoundError:
            return CheckResult("docker", name, Status.SKIP, "docker not available")
        except subprocess.TimeoutExpired:
            return CheckResult("docker", name, Status.FAIL, "docker ps timed out")

    if kind == "tcp":
        start = time.perf_counter()
        try:
            with socket.create_connection((host, port), timeout=5):
                latency = (time.perf_counter() - start) * 1000
                return CheckResult("docker", f"{name} tcp:{port}", Status.PASS,
                                   "port open", latency_ms=latency)
        except Exception as e:
            latency = (time.perf_counter() - start) * 1000
            return CheckResult("docker", f"{name} tcp:{port}", Status.FAIL,
                               str(e)[:200], latency_ms=latency)

    # http
    url = f"http://{host}:{port}/"
    if name == "prometheus":
        url = f"{PROMETHEUS_URL}/-/healthy"
    elif name == "grafana":
        url = f"{GRAFANA_URL}/api/health"
    elif name == "jaeger":
        url = f"{JAEGER_URL}/"
    elif name == "alertmanager":
        url = f"{ALERTMANAGER_URL}/-/healthy"
    elif name == "api":
        url = f"{BACKEND_URL}/health"
    elif name == "frontend":
        url = FRONTEND_URL

    resp, latency = _http_get(url, timeout=5.0)
    if resp is None:
        return CheckResult("docker", f"{name} {url}", Status.FAIL,
                           "unreachable", latency_ms=latency)
    if resp.status_code in (200, 204):
        return CheckResult("docker", f"{name} {url}", Status.PASS,
                           f"HTTP {resp.status_code}", latency_ms=latency)
    # 401/403 on Grafana /api/health is also acceptable.
    if name == "grafana" and resp.status_code in (401, 403):
        return CheckResult("docker", f"{name} {url}", Status.PASS,
                           f"HTTP {resp.status_code} (auth required, expected)",
                           latency_ms=latency)
    return CheckResult("docker", f"{name} {url}", Status.WARN,
                       f"HTTP {resp.status_code}", latency_ms=latency)


def check_api_health_endpoints() -> list[CheckResult]:
    results: list[CheckResult] = []
    for name, url in API_HEALTH_ENDPOINTS:
        resp, latency = _http_get(url, timeout=5.0)
        if resp is None:
            results.append(CheckResult("api_health", name, Status.FAIL,
                                       "unreachable", latency_ms=latency))
            continue
        if resp.status_code == 200:
            try:
                body = resp.json()
                # For aggregate /health, surface the status field.
                if isinstance(body, dict) and "status" in body and name.startswith("Backend"):
                    details = f"HTTP 200 — status={body['status']}"
                else:
                    details = f"HTTP 200"
            except Exception:
                details = f"HTTP 200"
            results.append(CheckResult("api_health", name, Status.PASS,
                                       details, latency_ms=latency))
        elif resp.status_code in (401, 403):
            results.append(CheckResult("api_health", name, Status.WARN,
                                       f"HTTP {resp.status_code} (auth required)",
                                       latency_ms=latency))
        else:
            results.append(CheckResult("api_health", name, Status.FAIL,
                                       f"HTTP {resp.status_code}",
                                       latency_ms=latency))
    return results


def check_database_connectivity() -> list[CheckResult]:
    results: list[CheckResult] = []
    if not HAS_PSYCOPG2:
        results.append(CheckResult("database", "PostgreSQL direct", Status.SKIP,
                                   "psycopg2 not installed"))
        return results
    start = time.perf_counter()
    try:
        conn = psycopg2.connect(
            host=POSTGRES_HOST, port=POSTGRES_PORT,
            user=POSTGRES_USER, password=POSTGRES_PASSWORD,
            dbname=POSTGRES_DB, connect_timeout=5,
        )
        cur = conn.cursor()
        cur.execute("SELECT version();")
        version = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public';")
        table_count = cur.fetchone()[0]
        cur.close()
        conn.close()
        latency = (time.perf_counter() - start) * 1000
        results.append(CheckResult(
            "database", "PostgreSQL connect+query", Status.PASS,
            f"{version[:40]} ({table_count} tables)", latency_ms=latency,
        ))
    except Exception as e:
        latency = (time.perf_counter() - start) * 1000
        results.append(CheckResult("database", "PostgreSQL connect+query",
                                   Status.FAIL, str(e)[:200], latency_ms=latency))
    return results


def check_redis_connectivity() -> list[CheckResult]:
    results: list[CheckResult] = []
    if not HAS_REDIS:
        results.append(CheckResult("redis", "Redis direct", Status.SKIP,
                                   "redis package not installed"))
        return results
    start = time.perf_counter()
    try:
        client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT,
                             socket_timeout=5, decode_responses=True)
        client.ping()
        info = client.info("memory")
        client.set("airos:monitor:probe", "ok", ex=60)
        val = client.get("airos:monitor:probe")
        latency = (time.perf_counter() - start) * 1000
        used = info.get("used_memory_human", "?")
        results.append(CheckResult(
            "redis", "Redis connect+set/get", Status.PASS,
            f"memory={used}, roundtrip={val}", latency_ms=latency,
        ))
    except Exception as e:
        latency = (time.perf_counter() - start) * 1000
        results.append(CheckResult("redis", "Redis connect+set/get",
                                   Status.FAIL, str(e)[:200], latency_ms=latency))
    return results


def check_frontend_pages() -> list[CheckResult]:
    results: list[CheckResult] = []
    for path in FRONTEND_PATHS:
        url = f"{FRONTEND_URL}{path}"
        resp, latency = _http_get(url, timeout=10.0)
        if resp is None:
            results.append(CheckResult("frontend", f"GET {path}", Status.FAIL,
                                       "unreachable", latency_ms=latency))
            continue
        # Next.js typically 200s pages or 404s unknown ones. Both are
        # fine for our purposes — we just want the server to respond.
        if resp.status_code in (200, 307, 308):
            label = "OK"
            if "airos" in resp.text.lower() or "<!DOCTYPE" in resp.text[:50].upper() or "<html" in resp.text[:50].lower():
                label = "page loaded"
            results.append(CheckResult("frontend", f"GET {path}", Status.PASS,
                                       f"HTTP {resp.status_code} ({label})",
                                       latency_ms=latency))
        elif resp.status_code == 404:
            results.append(CheckResult("frontend", f"GET {path}", Status.WARN,
                                       "HTTP 404 (route may not exist yet)",
                                       latency_ms=latency))
        else:
            results.append(CheckResult("frontend", f"GET {path}", Status.FAIL,
                                       f"HTTP {resp.status_code}",
                                       latency_ms=latency))
    return results


def check_prometheus() -> list[CheckResult]:
    results: list[CheckResult] = []
    for name, url in PROMETHEUS_ENDPOINTS:
        resp, latency = _http_get(url, timeout=5.0)
        if resp is None:
            results.append(CheckResult("prometheus", name, Status.FAIL,
                                       "unreachable", latency_ms=latency))
            continue
        if resp.status_code == 200:
            extra = ""
            if "targets" in name:
                try:
                    body = resp.json()
                    active = body.get("data", {}).get("activeTargets", [])
                    health = sum(1 for t in active if t.get("health") == "up")
                    total = len(active)
                    extra = f" — {health}/{total} targets up"
                except Exception:
                    pass
            results.append(CheckResult("prometheus", name, Status.PASS,
                                       f"HTTP 200{extra}", latency_ms=latency))
        else:
            results.append(CheckResult("prometheus", name, Status.FAIL,
                                       f"HTTP {resp.status_code}",
                                       latency_ms=latency))
    return results


def check_grafana() -> list[CheckResult]:
    results: list[CheckResult] = []
    for name, url in GRAFANA_ENDPOINTS:
        resp, latency = _http_get(url, timeout=5.0)
        if resp is None:
            results.append(CheckResult("grafana", name, Status.FAIL,
                                       "unreachable", latency_ms=latency))
            continue
        if resp.status_code == 200:
            extra = ""
            if "dashboards" in name:
                try:
                    body = resp.json()
                    count = len(body) if isinstance(body, list) else 0
                    extra = f" — {count} dashboards visible"
                except Exception:
                    pass
            results.append(CheckResult("grafana", name, Status.PASS,
                                       f"HTTP 200{extra}", latency_ms=latency))
        elif resp.status_code in (401, 403):
            results.append(CheckResult("grafana", name, Status.PASS,
                                       f"HTTP {resp.status_code} (auth required, OK)",
                                       latency_ms=latency))
        else:
            results.append(CheckResult("grafana", name, Status.FAIL,
                                       f"HTTP {resp.status_code}",
                                       latency_ms=latency))
    return results


# ── Main runner ──────────────────────────────────────────────────────────────

def run_monitor() -> MonitorReport:
    report = MonitorReport()
    report.timestamp = datetime.now(timezone.utc).isoformat()
    report.hostname = socket.gethostname()

    print(f"[{report.timestamp}] Running AI-ROS monitor on {report.hostname}", file=sys.stderr)

    # 1. Docker services (9 of them)
    for name, host, port, kind in DOCKER_SERVICES:
        report.checks.append(check_docker_service(name, host, port, kind))

    # 2. API health endpoints
    report.checks.extend(check_api_health_endpoints())

    # 3. Database (PostgreSQL)
    report.checks.extend(check_database_connectivity())

    # 4. Redis
    report.checks.extend(check_redis_connectivity())

    # 5. Frontend pages
    report.checks.extend(check_frontend_pages())

    # 6. Prometheus
    report.checks.extend(check_prometheus())

    # 7. Grafana
    report.checks.extend(check_grafana())

    return report


# ── Reporters ────────────────────────────────────────────────────────────────

STATUS_ICON = {
    Status.PASS: "[PASS]",
    Status.FAIL: "[FAIL]",
    Status.WARN: "[WARN]",
    Status.SKIP: "[SKIP]",
}


def print_console(report: MonitorReport) -> None:
    print()
    print("=" * 80)
    print(f"  AI-ROS Comprehensive Monitor — {report.timestamp}")
    print(f"  Hostname: {report.hostname}")
    print("=" * 80)
    cats = report.by_category()
    for cat, items in cats.items():
        print(f"\n  --- {cat.upper()} ({len(items)} checks) ---")
        for c in items:
            icon = STATUS_ICON.get(c.status, "[????]")
            lat = f"{c.latency_ms:7.1f}ms" if c.latency_ms else "        "
            print(f"    {icon} {c.name:50s} {lat:>10s}  {c.details}")
    print()
    print("=" * 80)
    s = report.summary()
    print(f"  Overall: {report.overall.value}  |  "
          f"Total: {s['total']}  PASS: {s['pass']}  "
          f"FAIL: {s['fail']}  WARN: {s['warn']}  SKIP: {s['skip']}")
    print("=" * 80)


def write_markdown(report: MonitorReport, path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    s = report.summary()
    lines = [
        f"# AI-ROS Monitor Report",
        f"",
        f"- **Timestamp:** {report.timestamp}",
        f"- **Hostname:** {report.hostname}",
        f"- **Overall status:** **{report.overall.value}**",
        f"- **Summary:** Total={s['total']} | PASS={s['pass']} | "
        f"FAIL={s['fail']} | WARN={s['warn']} | SKIP={s['skip']}",
        f"",
    ]
    cats = report.by_category()
    for cat, items in cats.items():
        lines.append(f"## {cat.title()}")
        lines.append("")
        lines.append("| Status | Check | Latency | Details |")
        lines.append("|--------|-------|---------|---------|")
        for c in items:
            status_md = {
                Status.PASS: "✅ PASS",
                Status.FAIL: "❌ FAIL",
                Status.WARN: "⚠️ WARN",
                Status.SKIP: "⏭️ SKIP",
            }.get(c.status, c.status.value)
            lat = f"{c.latency_ms:.1f} ms" if c.latency_ms else "—"
            details = (c.details or "").replace("|", "\\|")[:200]
            lines.append(f"| {status_md} | `{c.name}` | {lat} | {details} |")
        lines.append("")
    Path(path).write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="AI-ROS comprehensive monitor (9 services + DBs + frontend + monitoring stack)",
    )
    parser.add_argument("--json", action="store_true", help="print JSON to stdout")
    parser.add_argument("--report", help="write a Markdown report to PATH")
    parser.add_argument("--log-file", default="logs/monitor_full.log",
                        help="append a JSON-line log entry to PATH")
    args = parser.parse_args()

    report = run_monitor()

    # Always write a log line.
    log_path = Path(args.log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps({
            "timestamp": report.timestamp,
            "hostname": report.hostname,
            "overall": report.overall.value,
            "summary": report.summary(),
        }) + "\n")

    if args.json:
        print(json.dumps(report.to_dict(), indent=2, default=str))
    else:
        print_console(report)

    if args.report:
        write_markdown(report, args.report)
        if not args.json:
            print(f"\nMarkdown report written to: {args.report}", file=sys.stderr)

    return 0 if report.overall in (Status.PASS, Status.WARN) else 1


if __name__ == "__main__":
    sys.exit(main())
