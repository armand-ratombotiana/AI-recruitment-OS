"""Concrete AI agents used by the AI-ROS orchestrator.

Each agent subclasses :class:`shared.ai.base_agent.BaseAgent`, owns a
``system_prompt``, and produces a structured JSON response via the LLM
router.  When the router is unavailable or the model output cannot be
parsed, the agent returns a deterministic fallback so downstream
services always see a valid schema.

The screening and matching agents here are the canonical implementation;
the orchestrator service delegates to them instead of returning hardcoded
dictionaries.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from shared.ai.base_agent import AgentStatus, AgentType, BaseAgent
from shared.ai.llm_router import LLMResponse, LLMUnavailable, get_llm_router
from shared.ai.prompts import (
    MATCHING_KEYS,
    SCREENING_KEYS,
    fallback_matching,
    fallback_screening,
    prompt_manager,
)

logger = logging.getLogger("ai.agents")


# ── Shared helpers ─────────────────────────────────────────────────────────────


def _coerce_number(value: Any, default: float = 0.0, *, lo: float = 0.0, hi: float = 1.0) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return default
    if n != n:  # NaN
        return default
    return max(lo, min(hi, n))


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "1", "y"}
    if isinstance(value, (int, float)):
        return bool(value)
    return default


def _coerce_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return [value]
    return []


_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)


def _parse_json_payload(content: str) -> dict[str, Any] | None:
    """Best-effort JSON extraction from an LLM response.

    Handles three common cases:
    1. Clean JSON
    2. JSON wrapped in ```json ... ``` fences
    3. JSON embedded in surrounding prose
    """
    if not content:
        return None
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = _JSON_BLOCK_RE.search(text)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    return data if isinstance(data, dict) else None


def _build_user_message(candidate: dict[str, Any], job: dict[str, Any]) -> str:
    candidate_block = json.dumps(candidate, indent=2, default=str)
    job_block = json.dumps(job, indent=2, default=str)
    return (
        "## Job description\n"
        f"{job_block}\n\n"
        "## Candidate profile\n"
        f"{candidate_block}\n\n"
        "Return only the JSON object described in the system prompt."
    )


# ── Screening agent ────────────────────────────────────────────────────────────


class ScreeningAgent(BaseAgent):
    """Pre-screens a candidate against a job description."""

    agent_type = AgentType.RESUME_PARSING  # reused enum for the screening role
    default_model = "gpt-4o-mini"
    prompt_name = "screening_agent"

    def __init__(self, tenant_id: str, *, model: str | None = None) -> None:
        super().__init__(agent_type=self.agent_type, tenant_id=tenant_id)
        self._model = model or self.default_model

    def get_system_prompt(self) -> str:
        return prompt_manager.render(
            self.prompt_name,
            {"tenant_id": self.state.tenant_id},
        )

    async def process_task(self, task_data: dict[str, Any]) -> dict[str, Any]:
        candidate = task_data.get("candidate") or {}
        job = task_data.get("job") or {}
        if not candidate or not job:
            self.state.total_errors += 1
            self.state.status = AgentStatus.ERROR
            raise ValueError("screening_agent requires 'candidate' and 'job' in task_data")

        self.state.status = AgentStatus.PROCESSING
        messages = [
            {"role": "system", "content": self.get_system_prompt()},
            {"role": "user", "content": _build_user_message(candidate, job)},
        ]

        try:
            response = await get_llm_router().complete(
                messages,
                model=self._model,
                temperature=0.2,
                max_tokens=1500,
                response_format={"type": "json_object"},
                tenant_id=self.state.tenant_id,
            )
        except LLMUnavailable as exc:
            logger.warning(
                "screening_agent.llm_unavailable tenant=%s err=%s",
                self.state.tenant_id,
                exc,
            )
            return self._with_meta(fallback_screening(self.state.tenant_id, str(exc)))

        result = self._parse_response(response)
        self.state.total_tokens_consumed += response.total_tokens
        self.state.total_tasks_completed += 1
        self.state.status = AgentStatus.IDLE
        return result

    def _parse_response(self, response: LLMResponse) -> dict[str, Any]:
        data = _parse_json_payload(response.content)
        if not data:
            logger.warning(
                "screening_agent.parse_failed tenant=%s model=%s",
                self.state.tenant_id,
                response.model,
            )
            self.state.total_errors += 1
            return self._with_meta(
                fallback_screening(self.state.tenant_id, "json_parse_failed")
            )

        missing = SCREENING_KEYS - set(data.keys())
        if missing:
            logger.info(
                "screening_agent.missing_keys tenant=%s missing=%s",
                self.state.tenant_id,
                sorted(missing),
            )
            # Repair shallowly — fill missing keys with safe defaults.
            data.setdefault("qualified", False)
            data.setdefault("match_score", 0.0)
            data.setdefault("passed_requirements", [])
            data.setdefault("missing_requirements", [])
            data.setdefault("red_flags", [])
            data.setdefault("reasons", [])
            data.setdefault("confidence_score", 0.0)
            data.setdefault("summary", "")

        cleaned = {
            "qualified": _coerce_bool(data.get("qualified")),
            "match_score": _coerce_number(data.get("match_score")),
            "passed_requirements": [str(s) for s in _coerce_list(data.get("passed_requirements"))],
            "missing_requirements": [str(s) for s in _coerce_list(data.get("missing_requirements"))],
            "red_flags": [str(s) for s in _coerce_list(data.get("red_flags"))],
            "reasons": [str(s) for s in _coerce_list(data.get("reasons"))],
            "confidence_score": _coerce_number(data.get("confidence_score")),
            "summary": str(data.get("summary") or ""),
        }
        return self._with_meta(cleaned, response=response)

    def _with_meta(
        self,
        payload: dict[str, Any],
        *,
        response: LLMResponse | None = None,
    ) -> dict[str, Any]:
        payload = dict(payload)
        payload["agent_type"] = "resume_screener"
        payload["tenant_id"] = self.state.tenant_id
        if response is not None:
            payload["model_used"] = response.model
            payload["provider"] = response.provider
            payload["latency_ms"] = round(response.latency_ms, 3)
            payload["cached"] = response.cached
        return payload


# ── Matching agent ─────────────────────────────────────────────────────────────


class MatchingAgent(BaseAgent):
    """Computes a structured candidate-to-job match score."""

    agent_type = AgentType.SEMANTIC_MATCHING
    default_model = "gpt-4o"
    prompt_name = "matching_agent"

    def __init__(self, tenant_id: str, *, model: str | None = None) -> None:
        super().__init__(agent_type=self.agent_type, tenant_id=tenant_id)
        self._model = model or self.default_model

    def get_system_prompt(self) -> str:
        return prompt_manager.render(
            self.prompt_name,
            {"tenant_id": self.state.tenant_id},
        )

    async def process_task(self, task_data: dict[str, Any]) -> dict[str, Any]:
        candidate = task_data.get("candidate") or {}
        job = task_data.get("job") or {}
        if not candidate or not job:
            self.state.total_errors += 1
            self.state.status = AgentStatus.ERROR
            raise ValueError("matching_agent requires 'candidate' and 'job' in task_data")

        self.state.status = AgentStatus.PROCESSING
        messages = [
            {"role": "system", "content": self.get_system_prompt()},
            {"role": "user", "content": _build_user_message(candidate, job)},
        ]

        try:
            response = await get_llm_router().complete(
                messages,
                model=self._model,
                temperature=0.2,
                max_tokens=1500,
                response_format={"type": "json_object"},
                tenant_id=self.state.tenant_id,
            )
        except LLMUnavailable as exc:
            logger.warning(
                "matching_agent.llm_unavailable tenant=%s err=%s",
                self.state.tenant_id,
                exc,
            )
            return self._with_meta(fallback_matching(self.state.tenant_id, str(exc)))

        result = self._parse_response(response)
        self.state.total_tokens_consumed += response.total_tokens
        self.state.total_tasks_completed += 1
        self.state.status = AgentStatus.IDLE
        return result

    def _parse_response(self, response: LLMResponse) -> dict[str, Any]:
        data = _parse_json_payload(response.content)
        if not data:
            logger.warning(
                "matching_agent.parse_failed tenant=%s model=%s",
                self.state.tenant_id,
                response.model,
            )
            self.state.total_errors += 1
            return self._with_meta(
                fallback_matching(self.state.tenant_id, "json_parse_failed")
            )

        factors_raw = data.get("factors") or {}
        factors = {
            "skill_alignment": _coerce_number(factors_raw.get("skill_alignment")),
            "experience_fit": _coerce_number(factors_raw.get("experience_fit")),
            "seniority_match": _coerce_number(factors_raw.get("seniority_match")),
            "domain_relevance": _coerce_number(factors_raw.get("domain_relevance")),
        }
        match_score = _coerce_number(data.get("match_score"))
        # Recompute from factors if the model returned a wildly different
        # overall score — this guards against off-policy outputs.
        weighted = (
            0.40 * factors["skill_alignment"]
            + 0.25 * factors["experience_fit"]
            + 0.20 * factors["seniority_match"]
            + 0.15 * factors["domain_relevance"]
        )
        if abs(match_score - weighted) > 0.15:
            logger.debug(
                "matching_agent.score_recomputed tenant=%s model=%s old=%.3f new=%.3f",
                self.state.tenant_id,
                response.model,
                match_score,
                weighted,
            )
            match_score = round(weighted, 3)

        cleaned = {
            "match_score": round(match_score, 3),
            "factors": {k: round(v, 3) for k, v in factors.items()},
            "matching_skills": [str(s) for s in _coerce_list(data.get("matching_skills"))],
            "missing_skills": [str(s) for s in _coerce_list(data.get("missing_skills"))],
            "recommendation": str(data.get("recommendation") or ""),
            "confidence_score": _coerce_number(data.get("confidence_score")),
            "summary": str(data.get("summary") or ""),
        }
        return self._with_meta(cleaned, response=response)

    def _with_meta(
        self,
        payload: dict[str, Any],
        *,
        response: LLMResponse | None = None,
    ) -> dict[str, Any]:
        payload = dict(payload)
        payload["agent_type"] = "candidate_matcher"
        payload["tenant_id"] = self.state.tenant_id
        if response is not None:
            payload["model_used"] = response.model
            payload["provider"] = response.provider
            payload["latency_ms"] = round(response.latency_ms, 3)
            payload["cached"] = response.cached
        return payload


# ── Registry used by the orchestrator ──────────────────────────────────────────


AGENT_REGISTRY: dict[str, tuple[type[BaseAgent], AgentType]] = {
    "resume_screener": (ScreeningAgent, AgentType.RESUME_PARSING),
    "candidate_matcher": (MatchingAgent, AgentType.SEMANTIC_MATCHING),
}


def build_agent(agent_type: str, tenant_id: str) -> BaseAgent:
    """Factory used by the orchestrator endpoint.

    Raises ``KeyError`` if ``agent_type`` is not in :data:`AGENT_REGISTRY`
    so the caller can return a clean 404.
    """
    if agent_type not in AGENT_REGISTRY:
        raise KeyError(agent_type)
    cls, _ = AGENT_REGISTRY[agent_type]
    return cls(tenant_id=tenant_id)
