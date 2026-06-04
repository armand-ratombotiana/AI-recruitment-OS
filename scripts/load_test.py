"""AI-ROS load test.

Simulates a sustained load against the live API. Reports:

  - Total requests
  - Requests per second
  - Error rate (4xx + 5xx)
  - Latency: p50, p95, p99
  - Throughput over time (per second buckets)

Usage::

    # Default: 100 concurrent users for 60 s
    python scripts/load_test.py

    # 50 users for 30 seconds
    python scripts/load_test.py --users 50 --duration 30

    # Against a remote environment
    python scripts/load_test.py --base https://staging.your-domain.com

The test mixes a realistic workload (mostly reads, occasional AI calls).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any

import httpx


DEFAULT_BASE = "http://localhost:8000"
DEFAULT_EMAIL = "demo@airos.io"
DEFAULT_PASSWORD = "demo1234"
DEFAULT_USERS = 100
DEFAULT_DURATION = 60  # seconds

# (name, method, path, body, weight) — same mix as benchmark.py
ENDPOINTS: list[tuple[str, str, str, dict | None, int]] = [
    ("list_candidates", "GET",  "/api/v1/candidates/?page=1&page_size=20", None, 5),
    ("list_jobs",        "GET",  "/api/v1/jobs/?page=1&page_size=20",        None, 4),
    ("dashboard",        "GET",  "/api/v1/analytics/dashboard",              None, 3),
    ("ai_agents",        "GET",  "/api/v1/ai/agents",                        None, 2),
    ("ppe_problems",     "GET",  "/api/v1/ppe/problems",                     None, 2),
    ("me",               "GET",  "/api/v1/auth/me",                          None, 2),
    ("orchestrate",      "POST", "/api/v1/ai/orchestrate",
     {"agent_type": "candidate_matcher", "input": {"candidate_id": "c1", "job_id": "j1"}}, 1),
    ("bias_detect",      "POST", "/api/v1/ai/orchestrate",
     {"agent_type": "bias_detector", "input": {"text": "test"}}, 1),
]


@dataclass
class RequestRecord:
    endpoint: str
    status: int
    duration_ms: float
    error: str | None = None


def _percentile(sorted_values: list[float], p: float) -> float:
    if not sorted_values:
        return 0.0
    k = (len(sorted_values) - 1) * p
    f = int(k)
    c = min(f + 1, len(sorted_values) - 1)
    if f == c:
        return sorted_values[f]
    return sorted_values[f] * (c - k) + sorted_values[c] * (k - f)


async def login(client: httpx.AsyncClient, base: str, email: str, password: str) -> str:
    r = await client.post(f"{base}/api/v1/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        sys.exit(f"Login failed ({r.status_code}): {r.text}")
    return r.json()["access_token"]


def build_weighted_mix() -> list[tuple[str, str, str, dict | None]]:
    mix: list[tuple[str, str, str, dict | None]] = []
    for name, method, path, body, weight in ENDPOINTS:
        for _ in range(weight):
            mix.append((name, method, path, body))
    return mix


async def worker(
    worker_id: int,
    base: str,
    token: str,
    deadline: float,
    mix: list[tuple[str, str, str, dict | None]],
    records: list[RequestRecord],
    bucket_lock: asyncio.Lock,
    per_second: dict[int, int],
) -> None:
    """One virtual user: fires requests until the deadline."""
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
        i = 0
        while time.perf_counter() < deadline:
            ep_name, method, path, body = mix[i % len(mix)]
            i += 1
            url = f"{base}{path}"
            start = time.perf_counter()
            try:
                if method == "GET":
                    r = await client.get(url, headers=headers)
                else:
                    r = await client.post(url, headers=headers, json=body)
                elapsed_ms = (time.perf_counter() - start) * 1000
                records.append(RequestRecord(ep_name, r.status_code, elapsed_ms))
            except Exception as e:
                elapsed_ms = (time.perf_counter() - start) * 1000
                records.append(RequestRecord(ep_name, 0, elapsed_ms, error=str(e)))
            # Per-second bucket
            sec = int(time.perf_counter())
            async with bucket_lock:
                per_second[sec] += 1


async def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--base", default=DEFAULT_BASE)
    p.add_argument("--email", default=DEFAULT_EMAIL)
    p.add_argument("--password", default=DEFAULT_PASSWORD)
    p.add_argument("--users", "-u", type=int, default=DEFAULT_USERS,
                   help="Number of concurrent virtual users")
    p.add_argument("--duration", "-d", type=int, default=DEFAULT_DURATION,
                   help="Test duration in seconds")
    p.add_argument("--output", "-o", default="load-test-results.json")
    args = p.parse_args()

    sys.stdout.write("\nAI-ROS load test\n")
    sys.stdout.write(f"  base:      {args.base}\n")
    sys.stdout.write(f"  user:      {args.email}\n")
    sys.stdout.write(f"  users:     {args.users}\n")
    sys.stdout.write(f"  duration:  {args.duration}s\n\n")

    # 1. Get a token
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
        sys.stdout.write("  logging in... ")
        token = await login(client, args.base, args.email, args.password)
        sys.stdout.write("ok\n")

    # 2. Warm-up (1 user, 5 seconds) — flush connection pools, caches
    sys.stdout.write("  warm-up (5s)...")
    records: list[RequestRecord] = []
    per_second: dict[int, int] = {}
    bucket_lock = asyncio.Lock()
    deadline = time.perf_counter() + 5
    mix = build_weighted_mix()
    await worker(0, args.base, token, deadline, mix, records, bucket_lock, per_second)
    records.clear()
    per_second.clear()
    sys.stdout.write("  done\n")

    # 3. Main run
    sys.stdout.write(f"\n  running: {args.users} users for {args.duration}s ...\n")
    deadline = time.perf_counter() + args.duration
    workers = [
        asyncio.create_task(worker(i, args.base, token, deadline, mix, records, bucket_lock, per_second))
        for i in range(args.users)
    ]
    started = time.perf_counter()
    # Live progress every 5 s
    next_report = started + 5
    try:
        while any(not w.done() for w in workers):
            await asyncio.sleep(0.5)
            now = time.perf_counter()
            if now >= next_report:
                elapsed = now - started
                rate = len(records) / elapsed
                sys.stdout.write(f"\r  t={elapsed:5.1f}s  requests={len(records):>6}  rate={rate:5.1f} rps  ")
                sys.stdout.flush()
                next_report = now + 5
    except KeyboardInterrupt:
        sys.exit("interrupted")
    await asyncio.gather(*workers)
    wall_s = time.perf_counter() - started
    sys.stdout.write("\n")

    # 4. Aggregate
    n = len(records)
    if not n:
        sys.exit("No requests were completed")

    durations = sorted(r.duration_ms for r in records if r.error is None and r.status < 500)
    errors_5xx = sum(1 for r in records if r.status >= 500 or r.error is not None)
    errors_4xx = sum(1 for r in records if 400 <= r.status < 500)
    by_status: Counter[int] = Counter(r.status for r in records)
    by_endpoint: dict[str, list[float]] = defaultdict(list)
    for r in records:
        if r.error is None and r.status < 500:
            by_endpoint[r.endpoint].append(r.duration_ms)

    overall = {
        "total_requests": n,
        "wall_seconds": round(wall_s, 2),
        "rps": round(n / wall_s, 2),
        "errors_5xx": errors_5xx,
        "errors_4xx": errors_4xx,
        "error_rate": round((errors_5xx + errors_4xx) / n, 4),
        "latency_ms": {
            "p50": round(_percentile(durations, 0.50), 2),
            "p95": round(_percentile(durations, 0.95), 2),
            "p99": round(_percentile(durations, 0.99), 2),
            "max": round(durations[-1], 2) if durations else None,
            "mean": round(sum(durations) / len(durations), 2) if durations else None,
        },
        "by_status": dict(by_status.most_common()),
    }

    sys.stdout.write("\n──────────── OVERALL ────────────\n")
    sys.stdout.write(f"  total requests:   {overall['total_requests']}\n")
    sys.stdout.write(f"  wall time:        {overall['wall_seconds']}s\n")
    sys.stdout.write(f"  rps:              {overall['rps']}\n")
    sys.stdout.write(f"  error rate:       {overall['error_rate'] * 100:.2f}%  "
                     f"(4xx={errors_4xx}  5xx/errors={errors_5xx})\n")
    sys.stdout.write(f"  latency p50/p95/p99:  "
                     f"{overall['latency_ms']['p50']} / "
                     f"{overall['latency_ms']['p95']} / "
                     f"{overall['latency_ms']['p99']} ms\n")
    sys.stdout.write(f"  by status:        {dict(by_status.most_common())}\n")

    sys.stdout.write("\n──────────── BY ENDPOINT ────────────\n")
    sys.stdout.write(f"  {'endpoint':<22} {'count':>6} {'p50':>8} {'p95':>8} {'p99':>8} {'max':>8}\n")
    for name, vals in sorted(by_endpoint.items()):
        if not vals:
            continue
        vals.sort()
        sys.stdout.write(
            f"  {name:<22} {len(vals):>6} "
            f"{_percentile(vals, 0.50):>7.1f}ms "
            f"{_percentile(vals, 0.95):>7.1f}ms "
            f"{_percentile(vals, 0.99):>7.1f}ms "
            f"{vals[-1]:>7.1f}ms\n"
        )

    # Per-second timeline
    if per_second:
        sys.stdout.write("\n──────────── RPS TIMELINE ────────────\n")
        sec0 = min(per_second)
        sec1 = max(per_second)
        peak = max(per_second.values())
        for s in range(sec0, sec1 + 1):
            v = per_second.get(s, 0)
            bar = "█" * int(40 * v / max(1, peak))
            sys.stdout.write(f"  t+{s - sec0:>3}s  {v:>5}  {bar}\n")

    # JSON output
    report = {
        "base": args.base,
        "users": args.users,
        "duration_seconds": args.duration,
        "overall": overall,
        "by_endpoint": {
            name: {
                "count": len(vals),
                "p50_ms": round(_percentile(sorted(vals), 0.50), 2),
                "p95_ms": round(_percentile(sorted(vals), 0.95), 2),
                "p99_ms": round(_percentile(sorted(vals), 0.99), 2),
                "max_ms": round(max(vals), 2),
            }
            for name, vals in by_endpoint.items()
        },
        "rps_timeline": {f"t+{s - sec0}s": per_second.get(s, 0) for s in range(sec0, sec1 + 1)},
    }
    with open(args.output, "w") as f:
        json.dump(report, f, indent=2)
    sys.stdout.write(f"\nReport written to: {args.output}\n")


if __name__ == "__main__":
    asyncio.run(main())
