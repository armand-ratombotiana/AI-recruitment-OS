"""Tests for advanced rate limiting and DDoS protection.

Covers:

* Sliding window algorithm
* Token bucket algorithm
* Leaky bucket algorithm
* Burst protection
* Bot detection (User-Agent, behavior)
* IP reputation tracking
* Challenge-response mechanism
* IP blocking/unblocking
* Auto-blocking on threshold
* Rate limit config endpoints
* Blocked IP endpoints
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import sys
import time
from pathlib import Path
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.pop("REDIS_URL", None)

from shared.core.security import create_access_token  # noqa: E402
from shared.security.ddos import (  # noqa: E402
    BotDetector,
    ChallengeManager,
    DDoSProtection,
    IPRecord,
    IPReputation,
    RequestVerdict,
    ThreatLevel,
)
from shared.security.rate_limit_advanced import (  # noqa: E402
    AdvancedRateLimiter,
    BurstProtector,
    LeakyBucketLimiter,
    RateLimitConfig,
    SlidingWindowLimiter,
    TokenBucketLimiter,
    advanced_rate_limiter,
    security_router,
)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _admin_headers(sub: str = "admin-1", tenant: str = "tenant-a") -> dict:
    return {
        "Authorization": f"Bearer {create_access_token({'sub': sub, 'role': 'admin', 'tenant_id': tenant})}"
    }


def _super_admin_headers(sub: str = "super-1", tenant: str = "tenant-a") -> dict:
    return {
        "Authorization": f"Bearer {create_access_token({'sub': sub, 'role': 'super_admin', 'tenant_id': tenant})}"
    }


def _user_headers(sub: str = "user-1", tenant: str = "tenant-a") -> dict:
    return {
        "Authorization": f"Bearer {create_access_token({'sub': sub, 'role': 'recruiter', 'tenant_id': tenant})}"
    }


# ── Sliding Window Tests ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sliding_window_allows_under_limit():
    limiter = SlidingWindowLimiter(max_requests=5, window_seconds=60)
    for i in range(5):
        allowed, info = await limiter.allow("test_key")
        assert allowed, f"Request {i+1} should be allowed"
        assert info["algorithm"] == "sliding_window"
        assert info["remaining"] == 5 - (i + 1)


@pytest.mark.asyncio
async def test_sliding_window_blocks_over_limit():
    limiter = SlidingWindowLimiter(max_requests=3, window_seconds=60)
    for _ in range(3):
        allowed, _ = await limiter.allow("key")
        assert allowed
    allowed, info = await limiter.allow("key")
    assert not allowed
    assert info["remaining"] == 0
    assert info["retry_after"] > 0


@pytest.mark.asyncio
async def test_sliding_window_different_keys_independent():
    limiter = SlidingWindowLimiter(max_requests=2, window_seconds=60)
    a1, _ = await limiter.allow("alice")
    a2, _ = await limiter.allow("alice")
    a3, info = await limiter.allow("alice")
    assert not a3

    b1, _ = await limiter.allow("bob")
    assert b1


@pytest.mark.asyncio
async def test_sliding_window_status_does_not_consume():
    limiter = SlidingWindowLimiter(max_requests=5, window_seconds=60)
    await limiter.allow("k")
    s = await limiter.get_status("k")
    assert s["used"] == 1
    s2 = await limiter.get_status("k")
    assert s2["used"] == 1


@pytest.mark.asyncio
async def test_sliding_window_reset():
    limiter = SlidingWindowLimiter(max_requests=2, window_seconds=60)
    await limiter.allow("k")
    await limiter.allow("k")
    denied, _ = await limiter.allow("k")
    assert not denied
    await limiter.reset("k")
    allowed, _ = await limiter.allow("k")
    assert allowed


# ── Token Bucket Tests ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_token_bucket_allows_burst():
    bucket = TokenBucketLimiter(capacity=10, refill_rate=1.0)
    for i in range(10):
        allowed, info = await bucket.allow("key")
        assert allowed, f"Burst request {i+1} should be allowed"
    allowed, info = await bucket.allow("key")
    assert not allowed
    assert info["retry_after"] > 0


@pytest.mark.asyncio
async def test_token_bucket_refills_over_time():
    bucket = TokenBucketLimiter(capacity=5, refill_rate=100.0)
    for _ in range(5):
        await bucket.allow("key")
    denied, _ = await bucket.allow("key")
    assert not denied

    await asyncio.sleep(0.1)
    allowed, _ = await bucket.allow("key")
    assert allowed


@pytest.mark.asyncio
async def test_token_bucket_multi_token_request():
    bucket = TokenBucketLimiter(capacity=10, refill_rate=1.0)
    allowed, info = await bucket.allow("key", tokens=5)
    assert allowed
    assert info["tokens_remaining"] == 5.0

    allowed2, info2 = await bucket.allow("key", tokens=6)
    assert not allowed2


@pytest.mark.asyncio
async def test_token_bucket_status():
    bucket = TokenBucketLimiter(capacity=10, refill_rate=1.0)
    s = await bucket.get_status("new_key")
    assert s["tokens_remaining"] == 10.0


# ── Leaky Bucket Tests ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_leaky_bucket_allows_under_capacity():
    bucket = LeakyBucketLimiter(rate=1.0, capacity=5)
    for i in range(5):
        allowed, info = await bucket.allow("key")
        assert allowed, f"Request {i+1} should be allowed"
        assert info["algorithm"] == "leaky_bucket"


@pytest.mark.asyncio
async def test_leaky_bucket_rejects_overflow():
    bucket = LeakyBucketLimiter(rate=0.1, capacity=3)
    for _ in range(3):
        allowed, _ = await bucket.allow("key")
        assert allowed
    allowed, info = await bucket.allow("key")
    assert not allowed
    assert info["retry_after"] > 0


@pytest.mark.asyncio
async def test_leaky_bucket_drains_over_time():
    bucket = LeakyBucketLimiter(rate=100.0, capacity=3)
    for _ in range(3):
        await bucket.allow("key")
    denied, _ = await bucket.allow("key")
    assert not denied

    await asyncio.sleep(0.1)
    allowed, _ = await bucket.allow("key")
    assert allowed


# ── Burst Protection Tests ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_burst_protector_allows_normal_traffic():
    bp = BurstProtector(burst_threshold=10, burst_window=5.0, cooldown_seconds=30.0)
    for _ in range(9):
        ok, info = await bp.check("key")
        assert ok
        assert not info["burst_detected"]


@pytest.mark.asyncio
async def test_burst_protector_blocks_burst():
    bp = BurstProtector(burst_threshold=5, burst_window=5.0, cooldown_seconds=30.0)
    for _ in range(4):
        ok, _ = await bp.check("key")
        assert ok
    ok, info = await bp.check("key")
    assert not ok
    assert info["burst_detected"]
    assert info["cooldown_seconds"] == 30.0


@pytest.mark.asyncio
async def test_burst_protector_cooldown_enforced():
    bp = BurstProtector(burst_threshold=3, burst_window=5.0, cooldown_seconds=60.0)
    for _ in range(3):
        await bp.check("key")
    ok1, _ = await bp.check("key")
    assert not ok1
    ok2, info2 = await bp.check("key")
    assert not ok2
    assert info2["cooldown_remaining"] > 0


# ── Bot Detection Tests ──────────────────────────────────────────────────────


def test_bot_detector_known_bot_ua():
    detector = BotDetector()
    level, reason = detector.analyze_user_agent("python-requests/2.28.0")
    assert level == ThreatLevel.MEDIUM
    assert "known_bot_pattern" in reason


def test_bot_detector_empty_ua():
    detector = BotDetector()
    level, reason = detector.analyze_user_agent("")
    assert level == ThreatLevel.HIGH
    assert reason == "empty_user_agent"


def test_bot_detector_suspicious_ua():
    detector = BotDetector()
    level, reason = detector.analyze_user_agent("null")
    assert level == ThreatLevel.HIGH


def test_bot_detector_normal_ua():
    detector = BotDetector()
    level, reason = detector.analyze_user_agent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    )
    assert level == ThreatLevel.NONE


def test_bot_detector_behavior_rapid_requests():
    detector = BotDetector(rapid_request_threshold=5, rapid_window_seconds=10.0)
    rec = IPRecord(ip="1.2.3.4")
    now = time.time()
    for i in range(10):
        rec.request_timestamps.append(now - i * 0.1)
    level, threats = detector.analyze_behavior(rec)
    assert level == ThreatLevel.HIGH
    assert any("rapid_requests" in t for t in threats)


def test_bot_detector_violations_combined():
    detector = BotDetector()
    rec = IPRecord(ip="1.2.3.4")
    now = time.time()
    for i in range(30):
        rec.request_timestamps.append(now - i * 0.1)
    rec.user_agents = {f"agent-{i}" for i in range(6)}

    violations = detector.get_violations("python-requests/2.28", rec)
    assert len(violations) >= 2
    reasons = [r for _, r in violations]
    assert any("known_bot_pattern" in r for r in reasons)
    assert any("rapid_requests" in r for r in reasons)


# ── IP Reputation Tests ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ip_reputation_record_request():
    rep = IPReputation()
    rec = await rep.record_request("1.2.3.4", "/api/test", "Mozilla/5.0")
    assert rec.request_count == 1
    assert rec.ip == "1.2.3.4"
    assert "Mozilla/5.0" in rec.user_agents


@pytest.mark.asyncio
async def test_ip_reputation_add_violation():
    rep = IPReputation()
    await rep.add_violation("1.2.3.4", 25.0, "test_violation")
    rec = await rep.get_record("1.2.3.4")
    assert rec.violation_score == 25.0


@pytest.mark.asyncio
async def test_ip_reputation_auto_block():
    rep = IPReputation(block_threshold=50.0)
    await rep.add_violation("1.2.3.4", 60.0, "heavy_violation")
    blocked = await rep.check_auto_block("1.2.3.4", 50.0)
    assert blocked is not None
    assert blocked.blocked
    assert await rep.is_blocked("1.2.3.4")


@pytest.mark.asyncio
async def test_ip_reputation_manual_block_unblock():
    rep = IPReputation()
    await rep.block_ip("10.0.0.1", reason="manual_test", duration=3600)
    assert await rep.is_blocked("10.0.0.1")

    blocked_list = await rep.get_all_blocked()
    assert any(b["ip"] == "10.0.0.1" for b in blocked_list)

    success = await rep.unblock_ip("10.0.0.1")
    assert success
    assert not await rep.is_blocked("10.0.0.1")


@pytest.mark.asyncio
async def test_ip_reputation_unblock_nonexistent():
    rep = IPReputation()
    success = await rep.unblock_ip("99.99.99.99")
    assert not success


# ── Challenge-Response Tests ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_challenge_issue_and_solve():
    cm = ChallengeManager(challenge_ttl=300, default_difficulty=1)
    challenge = await cm.issue_challenge("1.2.3.4")
    assert challenge.token
    assert challenge.nonce
    assert challenge.difficulty == 1

    for answer in range(1000):
        h = hashlib.sha256(f"{challenge.nonce}:{answer}".encode()).hexdigest()
        if h.startswith("0" * challenge.difficulty):
            solved = await cm.validate_response(challenge.token, str(answer))
            assert solved
            assert await cm.is_solved("1.2.3.4")
            return

    pytest.fail("Could not find valid challenge answer")


@pytest.mark.asyncio
async def test_challenge_wrong_answer_rejected():
    cm = ChallengeManager(default_difficulty=4)
    challenge = await cm.issue_challenge("1.2.3.4")
    result = await cm.validate_response(challenge.token, "wrong_answer")
    assert not result


@pytest.mark.asyncio
async def test_challenge_expired():
    cm = ChallengeManager(challenge_ttl=0.01, default_difficulty=1)
    challenge = await cm.issue_challenge("1.2.3.4")
    await asyncio.sleep(0.05)
    result = await cm.validate_response(challenge.token, "any")
    assert not result


@pytest.mark.asyncio
async def test_challenge_nonexistent_token():
    cm = ChallengeManager()
    result = await cm.validate_response("nonexistent", "answer")
    assert not result


# ── DDoS Protection Integration Tests ────────────────────────────────────────


@pytest.mark.asyncio
async def test_ddos_allows_normal_request():
    ddos = DDoSProtection()
    verdict, info = await ddos.evaluate_request(
        "1.2.3.4", "/api/test", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    )
    assert verdict == RequestVerdict.ALLOW


@pytest.mark.asyncio
async def test_ddos_blocks_already_blocked_ip():
    ddos = DDoSProtection()
    await ddos.block_ip("10.0.0.1", reason="test", duration=3600)
    verdict, info = await ddos.evaluate_request(
        "10.0.0.1", "/api/test", "Mozilla/5.0"
    )
    assert verdict == RequestVerdict.BLOCK
    assert info["reason"] == "ip_blocked"


@pytest.mark.asyncio
async def test_ddos_challenges_suspicious_ua():
    rep = IPReputation(challenge_threshold=5.0, block_threshold=100.0)
    ddos = DDoSProtection(reputation=rep)

    await rep.add_violation("1.2.3.4", 10.0, "pre_scored")

    verdict, info = await ddos.evaluate_request(
        "1.2.3.4", "/api/test", "Mozilla/5.0"
    )
    assert verdict == RequestVerdict.CHALLENGE
    assert "challenge_token" in info
    assert "nonce" in info
    assert "difficulty" in info


@pytest.mark.asyncio
async def test_ddos_block_unblock_flow():
    ddos = DDoSProtection()
    result = await ddos.block_ip("5.5.5.5", reason="test_block", duration=3600)
    assert result["blocked"]

    blocked = await ddos.get_blocked_ips()
    assert any(b["ip"] == "5.5.5.5" for b in blocked)

    success = await ddos.unblock_ip("5.5.5.5")
    assert success
    blocked2 = await ddos.get_blocked_ips()
    assert not any(b["ip"] == "5.5.5.5" for b in blocked2)


# ── Advanced Rate Limiter Composite Tests ─────────────────────────────────────


@pytest.mark.asyncio
async def test_advanced_limiter_default_configs():
    limiter = AdvancedRateLimiter()
    configs = limiter.get_configs()
    assert len(configs) >= 6
    names = {c["name"] for c in configs}
    assert "auth_ip" in names
    assert "ai_user" in names
    assert "default_user" in names


@pytest.mark.asyncio
async def test_advanced_limiter_check_sliding_window():
    limiter = AdvancedRateLimiter()
    for i in range(5):
        ok, info = await limiter.check("auth_ip", "ip:1.2.3.4")
        assert ok, f"Request {i+1} should pass"
    ok, info = await limiter.check("auth_ip", "ip:1.2.3.4")
    assert not ok


@pytest.mark.asyncio
async def test_advanced_limiter_update_config():
    limiter = AdvancedRateLimiter()
    result = await limiter.update_config("auth_ip", {"max_requests": 100})
    assert result is not None
    assert result["max_requests"] == 100


@pytest.mark.asyncio
async def test_advanced_limiter_add_config():
    limiter = AdvancedRateLimiter()
    cfg = RateLimitConfig(
        name="custom_test",
        scope="user",
        algorithm="token_bucket",
        max_requests=50,
        window_seconds=120,
    )
    result = await limiter.add_config(cfg)
    assert result["name"] == "custom_test"

    configs = limiter.get_configs()
    assert any(c["name"] == "custom_test" for c in configs)


@pytest.mark.asyncio
async def test_advanced_limiter_remove_config():
    limiter = AdvancedRateLimiter()
    success = await limiter.remove_config("auth_ip")
    assert success
    configs = limiter.get_configs()
    assert not any(c["name"] == "auth_ip" for c in configs)


@pytest.mark.asyncio
async def test_advanced_limiter_remove_nonexistent():
    limiter = AdvancedRateLimiter()
    success = await limiter.remove_config("nonexistent")
    assert not success


# ── Security Router Endpoint Tests ───────────────────────────────────────────


@pytest_asyncio.fixture
async def security_client() -> AsyncGenerator[AsyncClient, None]:
    app = FastAPI()
    app.include_router(security_router)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_list_rate_limits_requires_auth(security_client: AsyncClient):
    r = await security_client.get("/api/v1/security/rate-limits")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_list_rate_limits_requires_admin(security_client: AsyncClient):
    r = await security_client.get(
        "/api/v1/security/rate-limits", headers=_user_headers()
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_list_rate_limits_admin_success(security_client: AsyncClient):
    r = await security_client.get(
        "/api/v1/security/rate-limits", headers=_admin_headers()
    )
    assert r.status_code == 200
    body = r.json()
    assert "configs" in body
    assert body["total"] >= 6


@pytest.mark.asyncio
async def test_create_rate_limit_config(security_client: AsyncClient):
    r = await security_client.post(
        "/api/v1/security/rate-limits",
        headers=_admin_headers(),
        json={
            "name": "test_endpoint",
            "scope": "user",
            "algorithm": "sliding_window",
            "max_requests": 25,
            "window_seconds": 60,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["action"] == "created"
    assert body["config"]["name"] == "test_endpoint"


@pytest.mark.asyncio
async def test_update_rate_limit_config(security_client: AsyncClient):
    r = await security_client.post(
        "/api/v1/security/rate-limits",
        headers=_admin_headers(),
        json={
            "name": "auth_ip",
            "max_requests": 200,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["action"] == "updated"


@pytest.mark.asyncio
async def test_list_blocked_ips_admin(security_client: AsyncClient):
    r = await security_client.get(
        "/api/v1/security/blocked-ips", headers=_admin_headers()
    )
    assert r.status_code == 200
    body = r.json()
    assert "blocked_ips" in body
    assert "total" in body


@pytest.mark.asyncio
async def test_block_ip_endpoint(security_client: AsyncClient):
    r = await security_client.post(
        "/api/v1/security/blocked-ips",
        headers=_admin_headers(),
        json={"ip": "192.168.1.100", "action": "block", "reason": "test", "duration": 3600},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["action"] == "blocked"


@pytest.mark.asyncio
async def test_unblock_ip_endpoint(security_client: AsyncClient):
    await security_client.post(
        "/api/v1/security/blocked-ips",
        headers=_admin_headers(),
        json={"ip": "192.168.1.200", "action": "block", "duration": 3600},
    )
    r = await security_client.post(
        "/api/v1/security/blocked-ips",
        headers=_admin_headers(),
        json={"ip": "192.168.1.200", "action": "unblock"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["action"] == "unblocked"


@pytest.mark.asyncio
async def test_block_ip_missing_ip(security_client: AsyncClient):
    r = await security_client.post(
        "/api/v1/security/blocked-ips",
        headers=_admin_headers(),
        json={"action": "block"},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_block_ip_invalid_action(security_client: AsyncClient):
    r = await security_client.post(
        "/api/v1/security/blocked-ips",
        headers=_admin_headers(),
        json={"ip": "1.2.3.4", "action": "invalid"},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_super_admin_can_access_security_endpoints(security_client: AsyncClient):
    r = await security_client.get(
        "/api/v1/security/rate-limits", headers=_super_admin_headers()
    )
    assert r.status_code == 200
