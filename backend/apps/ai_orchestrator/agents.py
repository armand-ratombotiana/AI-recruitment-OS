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


# ── Outreach agent ─────────────────────────────────────────────────────────────


OUTREACH_SYSTEM_PROMPT = """You are a recruiting copywriter drafting a personalised
cold outreach email to a candidate on behalf of a recruiter.

You must respond with a single JSON object — no prose, no markdown fences.

You will be given structured information about the candidate and the job.
Use it to write a short, warm, specific email. Avoid clichés ("rockstar",
"ninja", "world-class"). Be honest about why the candidate is a fit and
why this role might be interesting for them.

Output schema (return exactly this shape):
{{
  "subject": string,                    // 6–10 word subject line, no "Re:" or "Fwd:"
  "body": string,                       // plain-text email body, 120–220 words
  "highlights": [string, ...],          // 2-4 short bullets that justify the match
  "next_step": string,                  // the concrete CTA (e.g. "free for a 20-min chat?")
  "tone": string,                       // one of: friendly | formal | direct
  "confidence_score": number            // 0.0 .. 1.0
}}

Tenant context (for compliance): {tenant_id}
"""


class OutreachAgent(BaseAgent):
    """Generates a personalised outreach email to a candidate."""

    agent_type = AgentType.RECRUITER_COPILOT
    default_model = "gpt-4o-mini"
    prompt_name = "outreach_agent"

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
            raise ValueError("outreach_agent requires 'candidate' and 'job' in task_data")

        self.state.status = AgentStatus.PROCESSING
        messages = [
            {"role": "system", "content": self.get_system_prompt()},
            {"role": "user", "content": _build_user_message(candidate, job)},
        ]
        try:
            response = await get_llm_router().complete(
                messages,
                model=self._model,
                temperature=0.7,
                max_tokens=1200,
                response_format={"type": "json_object"},
                tenant_id=self.state.tenant_id,
            )
        except LLMUnavailable as exc:
            logger.warning(
                "outreach_agent.llm_unavailable tenant=%s err=%s",
                self.state.tenant_id, exc,
            )
            return self._with_meta(_fallback_outreach(candidate, job, self.state.tenant_id, str(exc)))

        result = self._parse_response(response)
        self.state.total_tokens_consumed += response.total_tokens
        self.state.total_tasks_completed += 1
        self.state.status = AgentStatus.IDLE
        return result

    def _parse_response(self, response: LLMResponse) -> dict[str, Any]:
        data = _parse_json_payload(response.content) or {}
        cleaned = {
            "subject": str(data.get("subject") or "Quick question about your background"),
            "body": str(data.get("body") or ""),
            "highlights": [str(s) for s in _coerce_list(data.get("highlights"))],
            "next_step": str(data.get("next_step") or ""),
            "tone": str(data.get("tone") or "friendly"),
            "confidence_score": _coerce_number(data.get("confidence_score")),
        }
        return self._with_meta(cleaned, response=response)

    def _with_meta(
        self,
        payload: dict[str, Any],
        *,
        response: LLMResponse | None = None,
    ) -> dict[str, Any]:
        payload = dict(payload)
        payload["agent_type"] = "outreach"
        payload["tenant_id"] = self.state.tenant_id
        if response is not None:
            payload["model_used"] = response.model
            payload["provider"] = response.provider
            payload["latency_ms"] = round(response.latency_ms, 3)
            payload["cached"] = response.cached
        return payload


def _fallback_outreach(
    candidate: dict[str, Any],
    job: dict[str, Any],
    tenant_id: str,
    reason: str,
) -> dict[str, Any]:
    """Deterministic fallback used when the LLM is unavailable."""
    name = candidate.get("name") or candidate.get("full_name") or "there"
    title = job.get("title") or "an open role"
    company = job.get("company") or "our client"
    return {
        "subject": f"Quick thought on the {title} role at {company}",
        "body": (
            f"Hi {name},\n\n"
            f"I came across your background and thought you'd be a strong match for "
            f"the {title} role at {company}. Would you be open to a 20-minute chat "
            f"this week to learn more?\n\nBest,\nThe Recruiting Team"
        ),
        "highlights": [
            f"Role: {title}",
            f"Candidate: {name}",
        ],
        "next_step": "20-minute intro chat this week",
        "tone": "friendly",
        "confidence_score": 0.0,
        "tenant_id": tenant_id,
        "fallback": True,
        "reason": reason,
    }


# ── Evaluation agent ───────────────────────────────────────────────────────────


EVALUATION_SYSTEM_PROMPT = """You are a senior recruiter scoring a candidate
against a specific job description. You must respond with a single JSON
object — no prose, no markdown fences.

Score the candidate on five dimensions (0.0 .. 1.0 each) and combine them
into a single overall fit score using the weights shown.

Output schema (return exactly this shape):
{{
  "overall_score": number,              // 0.0 .. 1.0 weighted fit
  "breakdown": {{
    "skills_match": number,             // 0.0 .. 1.0
    "experience_relevance": number,     // 0.0 .. 1.0
    "seniority_fit": number,            // 0.0 .. 1.0
    "domain_relevance": number,         // 0.0 .. 1.0
    "communication_signals": number     // 0.0 .. 1.0
  }},
  "strengths": [string, ...],            // 3-5 short bullets
  "gaps": [string, ...],                 // 0-3 short bullets
  "recommendation": string,             // "strong_hire" | "hire" | "lean_hire" | "no_hire" | "strong_no_hire"
  "confidence_score": number,           // 0.0 .. 1.0
  "summary": string                     // one-sentence rationale
}}

Scoring weights:
- skills_match 0.30
- experience_relevance 0.25
- seniority_fit 0.20
- domain_relevance 0.15
- communication_signals 0.10

Tenant context (for fairness / compliance): {tenant_id}
"""


class EvaluationAgent(BaseAgent):
    """Scores a candidate against a job description."""

    agent_type = AgentType.CANDIDATE_RANKING
    default_model = "gpt-4o"
    prompt_name = "evaluation_agent"

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
            raise ValueError("evaluation_agent requires 'candidate' and 'job' in task_data")

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
                "evaluation_agent.llm_unavailable tenant=%s err=%s",
                self.state.tenant_id, exc,
            )
            return self._with_meta(_fallback_evaluation(self.state.tenant_id, str(exc)))

        result = self._parse_response(response)
        self.state.total_tokens_consumed += response.total_tokens
        self.state.total_tasks_completed += 1
        self.state.status = AgentStatus.IDLE
        return result

    def _parse_response(self, response: LLMResponse) -> dict[str, Any]:
        data = _parse_json_payload(response.content) or {}
        breakdown_raw = data.get("breakdown") or {}
        breakdown = {
            "skills_match": _coerce_number(breakdown_raw.get("skills_match")),
            "experience_relevance": _coerce_number(breakdown_raw.get("experience_relevance")),
            "seniority_fit": _coerce_number(breakdown_raw.get("seniority_fit")),
            "domain_relevance": _coerce_number(breakdown_raw.get("domain_relevance")),
            "communication_signals": _coerce_number(breakdown_raw.get("communication_signals")),
        }
        overall = (
            0.30 * breakdown["skills_match"]
            + 0.25 * breakdown["experience_relevance"]
            + 0.20 * breakdown["seniority_fit"]
            + 0.15 * breakdown["domain_relevance"]
            + 0.10 * breakdown["communication_signals"]
        )
        model_score = _coerce_number(data.get("overall_score"))
        if abs(model_score - overall) > 0.15:
            overall = round(overall, 3)
        else:
            overall = round(model_score, 3)

        recommendation = str(data.get("recommendation") or "no_hire")
        cleaned = {
            "overall_score": overall,
            "breakdown": {k: round(v, 3) for k, v in breakdown.items()},
            "strengths": [str(s) for s in _coerce_list(data.get("strengths"))],
            "gaps": [str(s) for s in _coerce_list(data.get("gaps"))],
            "recommendation": recommendation,
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
        payload["agent_type"] = "evaluation"
        payload["tenant_id"] = self.state.tenant_id
        if response is not None:
            payload["model_used"] = response.model
            payload["provider"] = response.provider
            payload["latency_ms"] = round(response.latency_ms, 3)
            payload["cached"] = response.cached
        return payload


def _fallback_evaluation(tenant_id: str, reason: str) -> dict[str, Any]:
    return {
        "overall_score": 0.0,
        "breakdown": {
            "skills_match": 0.0,
            "experience_relevance": 0.0,
            "seniority_fit": 0.0,
            "domain_relevance": 0.0,
            "communication_signals": 0.0,
        },
        "strengths": [],
        "gaps": ["Manual evaluation required — LLM scoring unavailable."],
        "recommendation": "no_hire",
        "confidence_score": 0.0,
        "summary": "Evaluation unavailable; manual review required.",
        "tenant_id": tenant_id,
        "fallback": True,
        "reason": reason,
    }


# ── Interview questions agent ──────────────────────────────────────────────────


INTERVIEW_QUESTIONS_SYSTEM_PROMPT = """You are a senior interviewer designing a
structured interview script for a specific job. You must respond with a
single JSON object — no prose, no markdown fences.

Generate a mix of behavioural, technical, and situational questions tailored
to the role's seniority. For each question, include a short note on what
a strong answer looks like.

Output schema (return exactly this shape):
{{
  "role_summary": string,               // 1-sentence description of the role
  "questions": [
    {{
      "id": string,                     // "q1", "q2", ...
      "category": string,               // "behavioural" | "technical" | "situational" | "culture"
      "question": string,               // the actual question
      "rationale": string,              // why this question is relevant
      "strong_answer_signals": [string, ...]  // 2-4 short bullets
    }}
  ],
  "duration_minutes": number,           // total expected interview duration
  "confidence_score": number            // 0.0 .. 1.0
}}

Constraints:
- 8 to 12 questions total
- at least 2 behavioural, 2 technical, 1 situational, 1 culture
- questions should be ordered from warm-up to deep
Tenant context (for fairness / compliance): {tenant_id}
"""


class InterviewQuestionsAgent(BaseAgent):
    """Generates a structured interview question set for a job."""

    agent_type = AgentType.SENIORITY_EVALUATION
    default_model = "gpt-4o-mini"
    prompt_name = "interview_questions_agent"

    def __init__(self, tenant_id: str, *, model: str | None = None) -> None:
        super().__init__(agent_type=self.agent_type, tenant_id=tenant_id)
        self._model = model or self.default_model

    def get_system_prompt(self) -> str:
        return prompt_manager.render(
            self.prompt_name,
            {"tenant_id": self.state.tenant_id},
        )

    async def process_task(self, task_data: dict[str, Any]) -> dict[str, Any]:
        job = task_data.get("job") or {}
        if not job:
            self.state.total_errors += 1
            self.state.status = AgentStatus.ERROR
            raise ValueError("interview_questions_agent requires 'job' in task_data")

        self.state.status = AgentStatus.PROCESSING
        job_block = json.dumps(job, indent=2, default=str)
        user_msg = (
            "## Job description\n"
            f"{job_block}\n\n"
            "Return only the JSON object described in the system prompt."
        )
        messages = [
            {"role": "system", "content": self.get_system_prompt()},
            {"role": "user", "content": user_msg},
        ]
        try:
            response = await get_llm_router().complete(
                messages,
                model=self._model,
                temperature=0.4,
                max_tokens=2200,
                response_format={"type": "json_object"},
                tenant_id=self.state.tenant_id,
            )
        except LLMUnavailable as exc:
            logger.warning(
                "interview_questions_agent.llm_unavailable tenant=%s err=%s",
                self.state.tenant_id, exc,
            )
            return self._with_meta(_fallback_interview_questions(job, self.state.tenant_id, str(exc)))

        result = self._parse_response(response)
        self.state.total_tokens_consumed += response.total_tokens
        self.state.total_tasks_completed += 1
        self.state.status = AgentStatus.IDLE
        return result

    def _parse_response(self, response: LLMResponse) -> dict[str, Any]:
        data = _parse_json_payload(response.content) or {}
        raw_questions = _coerce_list(data.get("questions"))
        questions: list[dict[str, Any]] = []
        for idx, q in enumerate(raw_questions, start=1):
            if not isinstance(q, dict):
                continue
            questions.append({
                "id": str(q.get("id") or f"q{idx}"),
                "category": str(q.get("category") or "behavioural"),
                "question": str(q.get("question") or "").strip(),
                "rationale": str(q.get("rationale") or "").strip(),
                "strong_answer_signals": [str(s) for s in _coerce_list(q.get("strong_answer_signals"))],
            })
        if not questions:
            questions = _fallback_questions()

        cleaned = {
            "role_summary": str(data.get("role_summary") or ""),
            "questions": questions,
            "duration_minutes": int(_coerce_number(data.get("duration_minutes"), default=45.0) or 45),
            "confidence_score": _coerce_number(data.get("confidence_score")),
        }
        return self._with_meta(cleaned, response=response)

    def _with_meta(
        self,
        payload: dict[str, Any],
        *,
        response: LLMResponse | None = None,
    ) -> dict[str, Any]:
        payload = dict(payload)
        payload["agent_type"] = "interview_questions"
        payload["tenant_id"] = self.state.tenant_id
        if response is not None:
            payload["model_used"] = response.model
            payload["provider"] = response.provider
            payload["latency_ms"] = round(response.latency_ms, 3)
            payload["cached"] = response.cached
        return payload


def _fallback_questions() -> list[dict[str, Any]]:
    return [
        {
            "id": "q1",
            "category": "behavioural",
            "question": "Tell me about a project you led end-to-end and what you learned from it.",
            "rationale": "Reveals ownership, scope, and self-awareness.",
            "strong_answer_signals": ["Specific outcome", "Concrete lessons learned"],
        },
        {
            "id": "q2",
            "category": "technical",
            "question": "Walk me through how you would design this system from scratch.",
            "rationale": "Tests depth of technical reasoning.",
            "strong_answer_signals": ["States tradeoffs", "Identifies failure modes"],
        },
        {
            "id": "q3",
            "category": "situational",
            "question": "Your team's roadmap is at risk. How do you decide what to cut?",
            "rationale": "Tests prioritisation and stakeholder empathy.",
            "strong_answer_signals": ["Explicit framework", "Considers impact"],
        },
    ]


def _fallback_interview_questions(
    job: dict[str, Any],
    tenant_id: str,
    reason: str,
) -> dict[str, Any]:
    title = job.get("title") or "this role"
    return {
        "role_summary": f"Interview script for the {title} position.",
        "questions": _fallback_questions(),
        "duration_minutes": 45,
        "confidence_score": 0.0,
        "tenant_id": tenant_id,
        "fallback": True,
        "reason": reason,
    }


# ── Registry used by the orchestrator ──────────────────────────────────────────


AGENT_REGISTRY: dict[str, tuple[type[BaseAgent], AgentType]] = {
    "resume_screener": (ScreeningAgent, AgentType.RESUME_PARSING),
    "candidate_matcher": (MatchingAgent, AgentType.SEMANTIC_MATCHING),
    "outreach": (OutreachAgent, AgentType.RECRUITER_COPILOT),
    "evaluation": (EvaluationAgent, AgentType.CANDIDATE_RANKING),
    "interview_questions": (InterviewQuestionsAgent, AgentType.SENIORITY_EVALUATION),
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
