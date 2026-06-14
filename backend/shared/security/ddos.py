"""DDoS protection: IP reputation, bot detection, challenge-response, auto-blocking.

Provides:

* :class:`IPReputation` — tracks per-IP request counts, violation scores,
  and block status.  IPs accumulate reputation penalties for suspicious
  behaviour and are auto-blocked when their score exceeds a threshold.
* :class:`BotDetector` — inspects User-Agent strings and request timing
  patterns to classify requests as human / suspicious / bot.
* :class:`ChallengeManager` — issues lightweight challenge tokens (a
  compute-based proof-of-work) for suspicious requests and validates
  responses.
* :class:`DDoSProtection` — orchestrator that combines all three.
* :class:`DDoSMiddleware` — Starlette/FastAPI middleware wrapper.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import secrets
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Awaitable, Callable, Deque, Optional

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response
from starlette.types import ASGIApp

logger = logging.getLogger("security.ddos")


# ── Enums & data classes ──────────────────────────────────────────────────────


class ThreatLevel(str, Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RequestVerdict(str, Enum):
    ALLOW = "allow"
    CHALLENGE = "challenge"
    BLOCK = "block"


@dataclass
class IPRecord:
    ip: str
    first_seen: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    request_count: int = 0
    violation_score: float = 0.0
    blocked: bool = False
    block_reason: str = ""
    blocked_at: float = 0.0
    block_expires_at: float = 0.0
    challenge_pending: bool = False
    challenge_passed: bool = False
    request_timestamps: Deque[float] = field(default_factory=deque)
    user_agents: set[str] = field(default_factory=set)
    endpoints_hit: set[str] = field(default_factory=set)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ip": self.ip,
            "first_seen": self.first_seen,
            "last_seen": self.last_seen,
            "request_count": self.request_count,
            "violation_score": round(self.violation_score, 2),
            "blocked": self.blocked,
            "block_reason": self.block_reason,
            "blocked_at": self.blocked_at,
            "block_expires_at": self.block_expires_at,
            "challenge_pending": self.challenge_pending,
            "challenge_passed": self.challenge_passed,
            "user_agents": list(self.user_agents),
            "endpoints_hit": list(self.endpoints_hit),
        }


@dataclass
class ChallengeToken:
    token: str
    ip: str
    issued_at: float
    expires_at: float
    difficulty: int
    nonce: str
    solved: bool = False


# ── Known bot User-Agent patterns ─────────────────────────────────────────────

_BOT_UA_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"bot",
        r"crawl",
        r"spider",
        r"scrape",
        r"headless",
        r"phantom",
        r"selenium",
        r"puppeteer",
        r"playwright",
        r"curl/",
        r"wget/",
        r"python-requests",
        r"go-http-client",
        r"java/",
        r"libwww-perl",
        r"lua-resty-http",
        r"ruby",
        r"node-fetch",
        r"axios/",
        r"httpie/",
        r"postmanruntime",
        r"insomnia",
        r"scrapy",
        r"masscan",
        r"nmap",
        r"zgrab",
        r"nikto",
        r"sqlmap",
        r"dirbuster",
        r"gobuster",
        r"wpscan",
        r"burpsuite",
    ]
]

_SUSPICIOUS_UA_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"^$",
        r"^-$",
        r"^null$",
        r"^test$",
        r"^unknown$",
    ]
]


# ── IP Reputation ─────────────────────────────────────────────────────────────


class IPReputation:
    """Track per-IP reputation with automatic blocking."""

    def __init__(
        self,
        block_threshold: float = 100.0,
        challenge_threshold: float = 50.0,
        max_block_duration: float = 86400.0,
        decay_rate: float = 0.01,
        max_tracked_ips: int = 10000,
    ) -> None:
        self.block_threshold = block_threshold
        self.challenge_threshold = challenge_threshold
        self.max_block_duration = max_block_duration
        self.decay_rate = decay_rate
        self.max_tracked_ips = max_tracked_ips
        self._records: dict[str, IPRecord] = {}
        self._manual_blocks: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    async def get_record(self, ip: str) -> IPRecord:
        async with self._lock:
            if ip not in self._records:
                if len(self._records) >= self.max_tracked_ips:
                    self._evict_oldest()
                self._records[ip] = IPRecord(ip=ip)
            return self._records[ip]

    async def record_request(self, ip: str, endpoint: str, user_agent: str) -> IPRecord:
        async with self._lock:
            if ip not in self._records:
                if len(self._records) >= self.max_tracked_ips:
                    self._evict_oldest()
                self._records[ip] = IPRecord(ip=ip)

            rec = self._records[ip]
            now = time.time()
            rec.last_seen = now
            rec.request_count += 1
            rec.request_timestamps.append(now)

            window = 60.0
            cutoff = now - window
            while rec.request_timestamps and rec.request_timestamps[0] < cutoff:
                rec.request_timestamps.popleft()

            if user_agent:
                rec.user_agents.add(user_agent)
            rec.endpoints_hit.add(endpoint)

            self._apply_decay(rec, now)
            return rec

    async def add_violation(self, ip: str, points: float, reason: str) -> IPRecord:
        async with self._lock:
            if ip not in self._records:
                self._records[ip] = IPRecord(ip=ip)
            rec = self._records[ip]
            rec.violation_score += points
            return rec

    async def block_ip(
        self,
        ip: str,
        reason: str = "manual",
        duration: float = 3600.0,
    ) -> IPRecord:
        async with self._lock:
            if ip not in self._records:
                self._records[ip] = IPRecord(ip=ip)
            rec = self._records[ip]
            now = time.time()
            rec.blocked = True
            rec.block_reason = reason
            rec.blocked_at = now
            rec.block_expires_at = now + min(duration, self.max_block_duration)
            return rec

    async def unblock_ip(self, ip: str) -> bool:
        async with self._lock:
            if ip in self._records:
                rec = self._records[ip]
                rec.blocked = False
                rec.block_reason = ""
                rec.blocked_at = 0.0
                rec.block_expires_at = 0.0
                rec.violation_score = 0.0
                return True
            if ip in self._manual_blocks:
                del self._manual_blocks[ip]
                return True
            return False

    async def is_blocked(self, ip: str) -> bool:
        async with self._lock:
            if ip in self._manual_blocks:
                entry = self._manual_blocks[ip]
                if entry.get("expires_at", 0) > time.time():
                    return True
                del self._manual_blocks[ip]

            rec = self._records.get(ip)
            if not rec:
                return False
            if rec.blocked:
                if rec.block_expires_at > 0 and time.time() > rec.block_expires_at:
                    rec.blocked = False
                    rec.block_reason = ""
                    rec.violation_score = max(0, rec.violation_score - 20)
                    return False
                return True
            return False

    async def get_all_blocked(self) -> list[dict[str, Any]]:
        async with self._lock:
            now = time.time()
            result = []
            for ip, rec in self._records.items():
                if rec.blocked:
                    if rec.block_expires_at > 0 and now > rec.block_expires_at:
                        continue
                    result.append(rec.to_dict())
            for ip, entry in self._manual_blocks.items():
                if entry.get("expires_at", 0) > now and ip not in self._records:
                    result.append({
                        "ip": ip,
                        "blocked": True,
                        "block_reason": entry.get("reason", "manual"),
                        "blocked_at": entry.get("blocked_at", 0),
                        "block_expires_at": entry.get("expires_at", 0),
                        "violation_score": 0,
                        "request_count": 0,
                    })
            return result

    async def get_all_records(self) -> list[dict[str, Any]]:
        async with self._lock:
            return [rec.to_dict() for rec in self._records.values()]

    async def check_auto_block(self, ip: str, threshold: float) -> Optional[IPRecord]:
        async with self._lock:
            rec = self._records.get(ip)
            if not rec or rec.blocked:
                return None
            if rec.violation_score >= threshold:
                now = time.time()
                duration = min(
                    self.max_block_duration,
                    300 * (rec.violation_score / threshold),
                )
                rec.blocked = True
                rec.block_reason = f"auto: score {rec.violation_score:.1f} >= {threshold}"
                rec.blocked_at = now
                rec.block_expires_at = now + duration
                return rec
            return None

    def _apply_decay(self, rec: IPRecord, now: float) -> None:
        elapsed = now - rec.last_seen
        if elapsed > 0 and rec.violation_score > 0:
            decay = self.decay_rate * elapsed
            rec.violation_score = max(0, rec.violation_score - decay)

    def _evict_oldest(self) -> None:
        if not self._records:
            return
        oldest_ip = min(
            self._records,
            key=lambda ip: self._records[ip].last_seen,
        )
        del self._records[oldest_ip]


# ── Bot Detector ──────────────────────────────────────────────────────────────


class BotDetector:
    """Detect bots via User-Agent analysis and behavioural heuristics."""

    def __init__(
        self,
        rapid_request_threshold: int = 20,
        rapid_window_seconds: float = 10.0,
        ua_rotation_threshold: int = 5,
        no_ua_violation_points: float = 10.0,
        bot_ua_violation_points: float = 15.0,
        rapid_violation_points: float = 20.0,
        ua_rotation_violation_points: float = 25.0,
    ) -> None:
        self.rapid_request_threshold = rapid_request_threshold
        self.rapid_window_seconds = rapid_window_seconds
        self.ua_rotation_threshold = ua_rotation_threshold
        self.no_ua_violation_points = no_ua_violation_points
        self.bot_ua_violation_points = bot_ua_violation_points
        self.rapid_violation_points = rapid_violation_points
        self.ua_rotation_violation_points = ua_rotation_violation_points

    def analyze_user_agent(self, user_agent: str) -> tuple[ThreatLevel, str]:
        if not user_agent or not user_agent.strip():
            return ThreatLevel.HIGH, "empty_user_agent"

        for pattern in _SUSPICIOUS_UA_PATTERNS:
            if pattern.match(user_agent):
                return ThreatLevel.HIGH, "suspicious_user_agent"

        for pattern in _BOT_UA_PATTERNS:
            if pattern.search(user_agent):
                return ThreatLevel.MEDIUM, f"known_bot_pattern:{pattern.pattern}"

        return ThreatLevel.NONE, ""

    def analyze_behavior(self, record: IPRecord) -> tuple[ThreatLevel, list[str]]:
        threats: list[str] = []
        max_level = ThreatLevel.NONE

        now = time.time()
        cutoff = now - self.rapid_window_seconds
        recent = sum(1 for ts in record.request_timestamps if ts >= cutoff)
        if recent >= self.rapid_request_threshold:
            threats.append(f"rapid_requests:{recent}/{self.rapid_window_seconds}s")
            max_level = ThreatLevel.HIGH

        if len(record.user_agents) >= self.ua_rotation_threshold:
            threats.append(f"ua_rotation:{len(record.user_agents)}_agents")
            if max_level.value not in ("high", "critical"):
                max_level = ThreatLevel.MEDIUM

        return max_level, threats

    def get_violations(
        self,
        user_agent: str,
        record: IPRecord,
    ) -> list[tuple[float, str]]:
        violations: list[tuple[float, str]] = []

        ua_level, ua_reason = self.analyze_user_agent(user_agent)
        if ua_level == ThreatLevel.HIGH:
            violations.append((self.no_ua_violation_points, ua_reason))
        elif ua_level == ThreatLevel.MEDIUM:
            violations.append((self.bot_ua_violation_points, ua_reason))

        behavior_level, behavior_threats = self.analyze_behavior(record)
        if any(t.startswith("rapid_requests") for t in behavior_threats):
            violations.append((self.rapid_violation_points, "rapid_requests"))
        if any(t.startswith("ua_rotation") for t in behavior_threats):
            violations.append((self.ua_rotation_violation_points, "ua_rotation"))

        return violations


# ── Challenge Manager ─────────────────────────────────────────────────────────


class ChallengeManager:
    """Issue and validate proof-of-work challenges for suspicious requests."""

    def __init__(
        self,
        challenge_ttl: float = 300.0,
        default_difficulty: int = 4,
    ) -> None:
        self.challenge_ttl = challenge_ttl
        self.default_difficulty = default_difficulty
        self._challenges: dict[str, ChallengeToken] = {}
        self._lock = asyncio.Lock()

    async def issue_challenge(self, ip: str, difficulty: int | None = None) -> ChallengeToken:
        async with self._lock:
            self._cleanup_expired()
            diff = difficulty or self.default_difficulty
            nonce = secrets.token_urlsafe(16)
            token_str = secrets.token_urlsafe(32)
            now = time.time()
            challenge = ChallengeToken(
                token=token_str,
                ip=ip,
                issued_at=now,
                expires_at=now + self.challenge_ttl,
                difficulty=diff,
                nonce=nonce,
            )
            self._challenges[token_str] = challenge
            return challenge

    async def validate_response(
        self,
        token: str,
        answer: str,
    ) -> bool:
        async with self._lock:
            challenge = self._challenges.get(token)
            if not challenge:
                return False
            if time.time() > challenge.expires_at:
                del self._challenges[token]
                return False

            expected_prefix = "0" * challenge.difficulty
            h = hashlib.sha256(f"{challenge.nonce}:{answer}".encode()).hexdigest()
            if h.startswith(expected_prefix):
                challenge.solved = True
                return True
            return False

    async def is_solved(self, ip: str) -> bool:
        async with self._lock:
            now = time.time()
            for ch in self._challenges.values():
                if ch.ip == ip and ch.solved and now <= ch.expires_at:
                    return True
            return False

    async def get_challenge_info(self, token: str) -> dict[str, Any] | None:
        async with self._lock:
            ch = self._challenges.get(token)
            if not ch:
                return None
            return {
                "token": ch.token,
                "nonce": ch.nonce,
                "difficulty": ch.difficulty,
                "expires_at": ch.expires_at,
                "ip": ch.ip,
            }

    def _cleanup_expired(self) -> None:
        now = time.time()
        expired = [k for k, v in self._challenges.items() if now > v.expires_at]
        for k in expired:
            del self._challenges[k]


# ── DDoS Protection orchestrator ──────────────────────────────────────────────


class DDoSProtection:
    """Orchestrates IP reputation, bot detection, and challenge-response."""

    def __init__(
        self,
        reputation: IPReputation | None = None,
        bot_detector: BotDetector | None = None,
        challenge_manager: ChallengeManager | None = None,
    ) -> None:
        self.reputation = reputation or IPReputation()
        self.bot_detector = bot_detector or BotDetector()
        self.challenges = challenge_manager or ChallengeManager()

    async def evaluate_request(
        self,
        ip: str,
        endpoint: str,
        user_agent: str,
    ) -> tuple[RequestVerdict, dict[str, Any]]:
        if await self.reputation.is_blocked(ip):
            return RequestVerdict.BLOCK, {"reason": "ip_blocked"}

        record = await self.reputation.record_request(ip, endpoint, user_agent)

        violations = self.bot_detector.get_violations(user_agent, record)
        for points, reason in violations:
            await self.reputation.add_violation(ip, points, reason)

        rec = await self.reputation.get_record(ip)

        blocked = await self.reputation.check_auto_block(
            ip, self.reputation.block_threshold
        )
        if blocked:
            return RequestVerdict.BLOCK, {
                "reason": blocked.block_reason,
                "score": rec.violation_score,
            }

        if rec.violation_score >= self.reputation.challenge_threshold:
            if not await self.challenges.is_solved(ip):
                challenge = await self.challenges.issue_challenge(ip)
                rec.challenge_pending = True
                return RequestVerdict.CHALLENGE, {
                    "challenge_token": challenge.token,
                    "nonce": challenge.nonce,
                    "difficulty": challenge.difficulty,
                    "expires_at": challenge.expires_at,
                }

        return RequestVerdict.ALLOW, {
            "score": rec.violation_score,
            "request_count": rec.request_count,
        }

    async def solve_challenge(self, token: str, answer: str, ip: str) -> bool:
        solved = await self.challenges.validate_response(token, answer)
        if solved:
            rec = await self.reputation.get_record(ip)
            rec.challenge_passed = True
            rec.challenge_pending = False
            rec.violation_score = max(0, rec.violation_score - 20)
        return solved

    async def block_ip(self, ip: str, reason: str = "manual", duration: float = 3600.0) -> dict[str, Any]:
        rec = await self.reputation.block_ip(ip, reason, duration)
        return rec.to_dict()

    async def unblock_ip(self, ip: str) -> bool:
        return await self.reputation.unblock_ip(ip)

    async def get_blocked_ips(self) -> list[dict[str, Any]]:
        return await self.reputation.get_all_blocked()

    async def get_ip_info(self, ip: str) -> dict[str, Any]:
        rec = await self.reputation.get_record(ip)
        return rec.to_dict()


# ── Singleton ─────────────────────────────────────────────────────────────────

ddos_protection = DDoSProtection()


# ── Middleware ────────────────────────────────────────────────────────────────


_SKIP_PATHS = {"/", "/favicon.ico", "/docs", "/redoc", "/openapi.json"}


class DDoSMiddleware(BaseHTTPMiddleware):
    """Apply DDoS protection checks to every incoming request."""

    def __init__(self, app: ASGIApp, protection: DDoSProtection | None = None) -> None:
        super().__init__(app)
        self.protection = protection or ddos_protection

    async def dispatch(
        self,
        request: StarletteRequest,
        call_next: Callable[[StarletteRequest], Awaitable[Response]],
    ) -> Response:
        path = request.url.path
        if path in _SKIP_PATHS or path.startswith(("/docs", "/redoc")):
            return await call_next(request)

        ip = _client_ip(request)
        user_agent = request.headers.get("user-agent", "")

        verdict, info = await self.protection.evaluate_request(ip, path, user_agent)

        if verdict == RequestVerdict.BLOCK:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={
                    "error": {
                        "code": "ddos_blocked",
                        "message": "Your IP has been blocked due to suspicious activity.",
                        "detail": info,
                    }
                },
                headers={"Retry-After": "3600"},
            )

        if verdict == RequestVerdict.CHALLENGE:
            challenge_answer = request.headers.get("X-Challenge-Answer")
            challenge_token = info.get("challenge_token", "")
            if challenge_answer and challenge_token:
                solved = await self.protection.solve_challenge(
                    challenge_token, challenge_answer, ip
                )
                if solved:
                    response = await call_next(request)
                    response.headers["X-Challenge-Status"] = "solved"
                    return response

            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": {
                        "code": "challenge_required",
                        "message": "Complete the challenge to continue.",
                        "challenge_token": info.get("challenge_token"),
                        "nonce": info.get("nonce"),
                        "difficulty": info.get("difficulty"),
                    }
                },
                headers={
                    "X-Challenge-Token": info.get("challenge_token", ""),
                    "X-Challenge-Nonce": info.get("nonce", ""),
                    "X-Challenge-Difficulty": str(info.get("difficulty", 4)),
                },
            )

        response = await call_next(request)
        response.headers["X-DDoS-Score"] = str(int(info.get("score", 0)))
        return response


# ── Helpers ───────────────────────────────────────────────────────────────────


def _client_ip(request: StarletteRequest | Request) -> str:
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


__all__ = [
    "BotDetector",
    "ChallengeManager",
    "ChallengeToken",
    "DDoSMiddleware",
    "DDoSProtection",
    "IPRecord",
    "IPReputation",
    "RequestVerdict",
    "ThreatLevel",
    "ddos_protection",
]
