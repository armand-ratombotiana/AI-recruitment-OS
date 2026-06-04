"""AI-ROS performance benchmark.

Measures latency (p50, p95, p99) for the core hot-path endpoints at
several concurrency levels and prints a pretty table + writes a JSON
report.

Usage::

    python scripts/benchmark.py                     # defaults
    python scripts/benchmark.py --base http://localhost:8000
    python scripts/benchmark.py --concurrency 1 10 50 100
    python scripts/benchmark.py --iterations 200

What gets measured (all are real endpoints):

    GET  /api/v1/candidates/?page=1&page_size=20          list candidates
    GET  /api/v1/jobs/?page=1&page_size=20                 list jobs
    GET  /api/v1/analytics/dashboard                      analytics dashboard
    GET  /api/v1/ai/agents                                 list AI agents
    POST /api/v1/ai/orchestrate                           AI orchestrate
    GET  /api/v1/auth/me                                   /me (warm)
    GET  /api/v1/ppe/problems                              PPE problems list

The benchmark uses the demo account (``demo@airos.io`` / ``demo1234``)
by default. Override with ``--email`` and ``--password``.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

import httpx


# ── Defaults ────────────────────────────────────────────────────────────────


DEFAULT_BASE = "http://localhost:8000"
DEFAULT_EMAIL = "demo@airos.io"
DEFAULT_PASSWORD = "demo1234"
DEFAULT_ITER = 50
DEFAULT_CONCURRENCY = (1, 10, 50, 100)

# (name, method, path, body, weight)
# weight is a relative frequency — keep list/search > orchestrate
ENDPOINTS: list[tuple[str, str, str, dict | None, int]] = [
    ("list_candidates", "GET",  "/api/v1/candidates/?page=1&page_size=20", None, 4),
    ("list_jobs",        "GET",  "/api/v1/jobs/?page=1&page_size=20",        None, 4),
    ("dashboard",        "GET",  "/api/v1/analytics/dashboard",              None, 3),
    ("ai_agents",        "GET",  "/api/v1/ai/agents",                        None, 3),
    ("ppe_problems",     "GET",  "/api/v1/ppe/problems",                     None, 2),
    ("me",               "GET",  "/api/v1/auth/me",                          None, 2),
    ("orchestrate",      "POST", "/api/v1/ai/orchestrate",
     {"agent_type": "candidate_matcher", "input": {"candidate_id": "c1", "job_id": "j1"}}, 1),
]


# ── Latency / error tracking ────────────────────────────────────────────────


@dataclass
class Sample:
    endpoint: str
    status: int
    duration_ms: float
    error: str | None = None


@dataclass
class EndpointResult:
    name: str
    samples: list[float] = field(default_factory=list)  # ms
    errors: int = 0
    statuses: dict[int, int] = field(default_factory=lambda: defaultdict(int))

    def add(self, s: Sample) -> None:
        if s.error or s.status >= 400:
            self.errors += 1
        else:
            self.samples.append(s.duration_ms)
        self.statuses[s.status] += 1

    def summary(self) -> dict[str, Any]:
        if not self.samples:
            return {
                "name": self.name,
                "count": 0,
                "errors": self.errors,
                "p50_ms": None,
                "p95_ms": None,
                "p99_ms": None,
                "min_ms": None,
                "max_ms": None,
                "statuses": dict(self.statuses),
            }
        s = sorted(self.samples)
        n = len(s)
        return {
            "name": self.name,
            "count": n,
            "errors": self.errors,
            "p50_ms": round(s[int(0.50 * (n - 1))], 2),
            "p95_ms": round(s[int(0.95 * (n - 1))], 2),
            "p99_ms": round(s[min(int(0.99 * (n - 1)), n - 1)], 2),
            "min_ms": round(s[0], 2),
            "max_ms": round(s[-1], 2),
            "mean_ms": round(sum(s) / n, 2),
            "rps": round(1000.0 / (sum(s) / n), 2) if n else 0,
            "statuses": dict(self.statuses),
        }


def _percentile(sorted_values: list[float], p: float) -> float:
    if not sorted_values:
        return 0.0
    k = (len(sorted_values) - 1) * p
    f = int(k)
    c = min(f + 1, len(sorted_values) - 1)
    if f == c:
        return sorted_values[f]
    return sorted_values[f] * (c - k) + sorted_values[c] * (k - f)


# ── Auth helper ─────────────────────────────────────────────────────────────


async def login(client: httpx.AsyncClient, base: str, email: str, password: str) -> str:
    r = await client.post(f"{base}/api/v1/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        sys.exit(f"Login failed ({r.status_code}): {r.text}")
    return r.json()["access_token"]


# ── One concurrency level ──────────────────────────────────────────────────


async def run_level(
    base: str,
    token: str,
    concurrency: int,
    iterations: int,
    results: dict[str, EndpointResult],
) -> None:
    headers = {"Authorization": f"Bearer {token}"}
    sem = asyncio.Semaphore(concurrency)
    completed = 0

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
        async def call(ep_name: str, method: str, path: str, body: dict | None) -> None:
            nonlocal completed
            async with sem:
                url = f"{base}{path}"
                start = time.perf_counter()
                try:
                    if method == "GET":
                        r = await client.get(url, headers=headers)
                    else:
                        r = await client.post(url, headers=headers, json=body)
                    elapsed_ms = (time.perf_counter() - start) * 1000
                    results[ep_name].add(Sample(ep_name, r.status_code, elapsed_ms))
                except Exception as e:
                    elapsed_ms = (time.perf_counter() - start) * 1000
                    results[ep_name].add(Sample(ep_name, 0, elapsed_ms, error=str(e)))
                finally:
                    completed += 1

        # Build a weighted call list
        weighted: list[tuple[str, str, str, dict | None]] = []
        for name, method, path, body, weight in ENDPOINTS:
            for _ in range(weight):
                weighted.append((name, method, path, body))
        # Total number of tasks is the number of calls we want — distributed
        # across the weighted mix.
        total = iterations
        tasks = []
        for i in range(total):
            ep_name, method, path, body = weighted[i % len(weighted)]
            tasks.append(asyncio.create_task(call(ep_name, method, path, body)))

        started = time.perf_counter()
        await asyncio.gather(*tasks)
        wall_s = time.perf_counter() - started

    sys.stdout.write(f"\n  concurrency={concurrency:>4}  calls={completed:>5}  wall={wall_s:5.2f}s  rps={completed / wall_s:6.1f}\n")
    sys.stdout.flush()


# ── Pretty printing ────────────────────────────────────────────────────────


def print_table(label: str, summaries: list[dict[str, Any]]) -> None:
    sys.stdout.write(f"\n── {label} ──\n")
    headers = ("endpoint", "count", "errors", "p50", "p95", "p99", "max", "rps")
    rows = [
        (
            s["name"],
            s["count"],
            s["errors"],
            f"{s['p50_ms']}ms" if s["p50_ms"] is not None else "-",
            f"{s['p95_ms']}ms" if s["p95_ms"] is not None else "-",
            f"{s['p99_ms']}ms" if s["p99_ms"] is not None else "-",
            f"{s['max_ms']}ms" if s["max_ms"] is not None else "-",
            s.get("rps", 0),
        )
        for s in summaries
    ]
    widths = [max(len(str(x)) for x in col) for col in zip(headers, *rows)]
    fmt = "  ".join("{:<%d}" % w for w in widths)
    sys.stdout.write(fmt.format(*headers) + "\n")
    sys.stdout.write("  ".join("-" * w for w in widths) + "\n")
    for r in rows:
        sys.stdout.write(fmt.format(*r) + "\n")


# ── Main ────────────────────────────────────────────────────────────────────


async def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--base", default=DEFAULT_BASE, help="API base URL")
    p.add_argument("--email", default=DEFAULT_EMAIL, help="Login email")
    p.add_argument("--password", default=DEFAULT_PASSWORD, help="Login password")
    p.add_argument("--iterations", "-n", type=int, default=DEFAULT_ITER,
                   help="Total requests per concurrency level")
    p.add_argument("--concurrency", "-c", type=int, nargs="+", default=list(DEFAULT_CONCURRENCY),
                   help="Concurrency levels (space-separated)")
    p.add_argument("--output", "-o", default="benchmark-results.json",
                   help="Output JSON path")
    args = p.parse_args()

    sys.stdout.write("\nAI-ROS benchmark\n")
    sys.stdout.write(f"  base:        {args.base}\n")
    sys.stdout.write(f"  user:        {args.email}\n")
    sys.stdout.write(f"  iterations:  {args.iterations} per level\n")
    sys.stdout.write(f"  concurrency: {args.concurrency}\n\n")

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
        sys.stdout.write("  logging in... ")
        token = await login(client, args.base, args.email, args.password)
        sys.stdout.write("ok\n")

    # Warm-up — prime the caches, JIT the routers
    sys.stdout.write("  warm-up:    10 calls\n")
    results_warm: dict[str, EndpointResult] = {ep[0]: EndpointResult(ep[0]) for ep in ENDPOINTS}
    await run_level(args.base, token, concurrency=1, iterations=10, results=results_warm)

    all_levels: dict[int, list[dict[str, Any]]] = {}
    for c in args.concurrency:
        sys.stdout.write(f"\n  level: concurrency={c}\n")
        results: dict[str, EndpointResult] = {ep[0]: EndpointResult(ep[0]) for ep in ENDPOINTS}
        await run_level(args.base, token, c, args.iterations, results)
        summaries = [r.summary() for r in results.values()]
        all_levels[c] = summaries
        print_table(f"concurrency = {c}", summaries)

    # JSON output
    report = {
        "base": args.base,
        "user": args.email,
        "iterations_per_level": args.iterations,
        "concurrency_levels": args.concurrency,
        "by_level": {str(c): s for c, s in all_levels.items()},
    }
    with open(args.output, "w") as f:
        json.dump(report, f, indent=2)
    sys.stdout.write(f"\nReport written to: {args.output}\n")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit("interrupted")
