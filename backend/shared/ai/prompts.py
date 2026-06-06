"""Prompt management for AI-ROS.

Centralises every prompt template the agents use so they can be versioned,
A/B-tested, and rendered with a single helper.  Each prompt is registered
with the variables it expects so the renderer can validate input.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class PromptVersion:
    version: int
    template: str
    variables: list[str]
    performance_score: float | None = None
    usage_count: int = 0


class PromptManager:
    def __init__(self) -> None:
        self._prompts: dict[str, list[PromptVersion]] = {}
        self._active: dict[str, int] = {}

    def register(self, name: str, template: str, variables: list[str]) -> int:
        versions = self._prompts.get(name, [])
        v = len(versions) + 1
        versions.append(PromptVersion(version=v, template=template, variables=variables))
        self._prompts[name] = versions
        self._active[name] = v
        return v

    def get(self, name: str, version: int | None = None) -> PromptVersion | None:
        versions = self._prompts.get(name, [])
        if not versions:
            return None
        v = version or self._active.get(name, len(versions))
        return next((p for p in versions if p.version == v), None)

    def render(self, name: str, variables: dict[str, str]) -> str:
        pv = self.get(name)
        if not pv:
            raise ValueError(f"Prompt not found: {name}")
        template = pv.template
        for key, value in variables.items():
            template = template.replace(f"{{{key}}}", value)
        return template


# ── Built-in prompt templates ─────────────────────────────────────────────────

DEFAULT_PROMPTS: dict[str, str] = {
    "resume_parsing": "Extract structured data from this resume text. Return JSON with contact, summary, experience, education, skills.",
    "skill_extraction": "Extract technical and soft skills from the following text.",
    "seniority_estimation": "Estimate seniority level for this candidate profile.",
    "hiring_recommendation": "Generate a hiring recommendation based on all evaluations.",
    "interview_question": "Generate interview questions for this role and candidate.",
}

SCREENING_SYSTEM_PROMPT = """You are an expert technical recruiter conducting a resume screen.
You must respond with a single JSON object — no prose, no markdown fences.

You will be given a job description and a candidate profile.  Evaluate the
candidate against the job's must-have requirements and produce a structured
screening result.

Output schema (return exactly this shape):
{{
  "qualified": boolean,                // true if the candidate meets must-haves
  "match_score": number,               // 0.0 .. 1.0 overall match
  "passed_requirements": [string, ...], // requirements the candidate clearly meets
  "missing_requirements": [string, ...],// must-haves the candidate does not meet
  "red_flags": [string, ...],          // concerns (gaps, job-hopping, mismatches)
  "reasons": [string, ...],            // 2-4 short bullet reasons supporting the verdict
  "confidence_score": number,          // 0.0 .. 1.0 — your confidence in the screen
  "summary": string                    // one-sentence summary
}}

Scoring rules:
- match_score reflects overall fit including nice-to-haves
- qualified is true only if ALL must-have requirements are satisfied
- Be honest about red flags; do not invent experience the candidate lacks
- Confidence reflects how complete the candidate's profile information is
- Tenant context (for fairness / compliance): {tenant_id}
"""

MATCHING_SYSTEM_PROMPT = """You are an expert technical recruiter producing a candidate-to-job
match score.  You must respond with a single JSON object — no prose, no fences.

You will be given a candidate profile and a job description.  Score the fit
on multiple dimensions and produce an overall weighted match score.

Output schema (return exactly this shape):
{{
  "match_score": number,               // 0.0 .. 1.0 overall weighted match
  "factors": {{
    "skill_alignment": number,         // 0.0 .. 1.0
    "experience_fit": number,          // 0.0 .. 1.0
    "seniority_match": number,         // 0.0 .. 1.0
    "domain_relevance": number         // 0.0 .. 1.0
  }},
  "matching_skills": [string, ...],    // skills the candidate has that the job wants
  "missing_skills": [string, ...],     // important skills the candidate lacks
  "recommendation": string,            // one short sentence
  "confidence_score": number,          // 0.0 .. 1.0
  "summary": string                    // one-sentence rationale
}}

Scoring rules:
- skill_alignment: fraction of must-have + nice-to-have skills the candidate has
- experience_fit: years and depth relative to the role's expectation
- seniority_match: how close the candidate's level is to the role's level
- domain_relevance: overlap of industry / product domain
- match_score = 0.40*skill_alignment + 0.25*experience_fit
              + 0.20*seniority_match + 0.15*domain_relevance
- Confidence reflects profile completeness
- Tenant context (for fairness / compliance): {tenant_id}
"""

prompt_manager = PromptManager()
for name, template in DEFAULT_PROMPTS.items():
    prompt_manager.register(name, template, [])

prompt_manager.register(
    "screening_agent",
    SCREENING_SYSTEM_PROMPT,
    ["tenant_id"],
)
prompt_manager.register(
    "matching_agent",
    MATCHING_SYSTEM_PROMPT,
    ["tenant_id"],
)

OUTREACH_SYSTEM_PROMPT = """You are a recruiting copywriter drafting a personalised
cold outreach email to a candidate on behalf of a recruiter.

You must respond with a single JSON object — no prose, no markdown fences.

You will be given structured information about the candidate and the job.
Use it to write a short, warm, specific email. Avoid cliches ("rockstar",
"ninja", "world-class"). Be honest about why the candidate is a fit and
why this role might be interesting for them.

Output schema (return exactly this shape):
{{
  "subject": string,                    // 6-10 word subject line, no "Re:" or "Fwd:"
  "body": string,                       // plain-text email body, 120-220 words
  "highlights": [string, ...],          // 2-4 short bullets that justify the match
  "next_step": string,                  // the concrete CTA (e.g. "free for a 20-min chat?")
  "tone": string,                       // one of: friendly | formal | direct
  "confidence_score": number            // 0.0 .. 1.0
}}

Tenant context (for compliance): {tenant_id}
"""

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


prompt_manager.register("outreach_agent", OUTREACH_SYSTEM_PROMPT, ["tenant_id"])
prompt_manager.register("evaluation_agent", EVALUATION_SYSTEM_PROMPT, ["tenant_id"])
prompt_manager.register(
    "interview_questions_agent",
    INTERVIEW_QUESTIONS_SYSTEM_PROMPT,
    ["tenant_id"],
)


# ── Response validation helpers ────────────────────────────────────────────────


SCREENING_KEYS = {
    "qualified",
    "match_score",
    "passed_requirements",
    "missing_requirements",
    "red_flags",
    "reasons",
    "confidence_score",
    "summary",
}

MATCHING_KEYS = {
    "match_score",
    "factors",
    "matching_skills",
    "missing_skills",
    "recommendation",
    "confidence_score",
    "summary",
}


def fallback_screening(tenant_id: str, reason: str = "llm_unavailable") -> dict[str, Any]:
    """Deterministic fallback for the screening agent.

    Used when the LLM is unreachable, returns non-JSON, or fails validation.
    Conservative defaults: marks the candidate as not qualified with low
    confidence so a human recruiter must review.
    """
    return {
        "qualified": False,
        "match_score": 0.0,
        "passed_requirements": [],
        "missing_requirements": [],
        "red_flags": ["Automatic screening unavailable — manual review required."],
        "reasons": [
            "LLM screening could not complete; result is a safety fallback.",
            f"Reason: {reason}",
        ],
        "confidence_score": 0.0,
        "summary": "Screening unavailable; manual review required.",
        "tenant_id": tenant_id,
        "fallback": True,
    }


def fallback_matching(tenant_id: str, reason: str = "llm_unavailable") -> dict[str, Any]:
    """Deterministic fallback for the matching agent."""
    return {
        "match_score": 0.0,
        "factors": {
            "skill_alignment": 0.0,
            "experience_fit": 0.0,
            "seniority_match": 0.0,
            "domain_relevance": 0.0,
        },
        "matching_skills": [],
        "missing_skills": [],
        "recommendation": "Matching unavailable; manual review required.",
        "confidence_score": 0.0,
        "summary": "Matching unavailable; manual review required.",
        "tenant_id": tenant_id,
        "fallback": True,
    }
