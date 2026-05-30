"""AI Prompt management system — versioning, A/B testing, optimization."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class PromptStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


@dataclass
class PromptVersion:
    version: int
    template: str
    variables: list[str]
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    performance_score: float | None = None
    usage_count: int = 0
    avg_tokens: float = 0.0
    avg_latency_ms: float = 0.0


class PromptManager:
    """
    Manages prompt templates with versioning, A/B testing,
    and performance tracking.
    """

    def __init__(self) -> None:
        self._prompts: dict[str, list[PromptVersion]] = {}
        self._active_versions: dict[str, int] = {}

    def register_prompt(
        self,
        name: str,
        template: str,
        variables: list[str],
    ) -> int:
        versions = self._prompts.get(name, [])
        new_version = len(versions) + 1
        pv = PromptVersion(version=new_version, template=template, variables=variables)
        versions.append(pv)
        self._prompts[name] = versions
        self._active_versions[name] = new_version
        return new_version

    def get_prompt(self, name: str, version: int | None = None) -> PromptVersion | None:
        versions = self._prompts.get(name, [])
        if not versions:
            return None
        v = version or self._active_versions.get(name, len(versions))
        for pv in versions:
            if pv.version == v:
                return pv
        return None

    def render(self, name: str, variables: dict[str, str]) -> str:
        pv = self.get_prompt(name)
        if not pv:
            raise ValueError(f"Prompt not found: {name}")
        template = pv.template
        for key, value in variables.items():
            template = template.replace(f"{{{key}}}", value)
        return template

    def set_active_version(self, name: str, version: int) -> None:
        self._active_versions[name] = version

    def record_usage(
        self,
        name: str,
        tokens: int,
        latency_ms: float,
        quality_score: float | None = None,
    ) -> None:
        pv = self.get_prompt(name)
        if pv:
            pv.usage_count += 1
            pv.avg_tokens = (pv.avg_tokens * (pv.usage_count - 1) + tokens) / pv.usage_count
            pv.avg_latency_ms = (pv.avg_latency_ms * (pv.usage_count - 1) + latency_ms) / pv.usage_count
            if quality_score is not None:
                if pv.performance_score is None:
                    pv.performance_score = quality_score
                else:
                    pv.performance_score = (pv.performance_score * 0.9 + quality_score * 0.1)


# --- Default Prompt Templates ---

DEFAULT_PROMPTS = {
    "resume_parsing": {
        "template": """You are an expert resume parser. Extract structured data from the following resume text.

Resume Text:
{resume_text}

Extract the following in JSON format:
- contact: email, phone, location, linkedin_url
- summary: professional summary
- experience: array of {title, company, start_date, end_date, description, skills_used}
- education: array of {degree, institution, year, gpa}
- skills: array of skill names
- certifications: array of certification names
- languages: array of language names

Output valid JSON only.""",
        "variables": ["resume_text"],
    },
    "skill_extraction": {
        "template": """Extract technical and soft skills from the following text. 
For each skill, provide: name, category (programming_language/framework/tool/soft_skill/domain_knowledge), 
and confidence level (0.0-1.0).

Text:
{text}

Output as JSON array.""",
        "variables": ["text"],
    },
    "seniority_estimation": {
        "template": """Estimate the seniority level of a candidate based on their profile.

Candidate Profile:
{profile}

Consider: years of experience, role progression, technical depth, leadership indicators, 
system design capability, and domain expertise.

Output JSON:
{{
  "seniority_level": "junior|mid|senior|staff|principal",
  "confidence": 0.0-1.0,
  "reasoning": "explanation",
  "key_indicators": ["indicator1", "indicator2"]
}}""",
        "variables": ["profile"],
    },
    "ppe_system_prompt": {
        "template": """You are a senior FAANG engineer conducting a pair programming interview.

## Your Role
- Experienced, fair, and thorough
- Simulate a real pair programming partner
- Provide progressive hints when candidate is stuck
- Ask follow-up questions to probe depth
- Evaluate both code and thinking process

## Evaluation Dimensions
1. Technical Skills (30%): correctness, efficiency, algorithm quality, edge cases
2. CS Fundamentals (20%): Big-O, tradeoffs, scalability, data structures
3. Code Quality (15%): readability, maintainability, modularity, naming
4. Problem Solving (20%): decomposition, reasoning, debugging, optimization
5. Communication (15%): clarity, collaboration, transparency

## Rules
- Start with greeting and problem presentation
- Provide LEAST specific hint first
- Gently redirect if going wrong direction
- Ask 1-2 follow-ups after solution
- Explain reasoning for all decisions""",
        "variables": [],
    },
    "hiring_recommendation": {
        "template": """Based on all evaluations and interviews, generate a hiring recommendation for:

Candidate: {candidate_name}
Role: {job_title}

Evaluations:
{evaluations_json}

Generate:
{{
  "recommendation": "strong_hire|hire|neutral|no_hire|strong_no_hire",
  "confidence": 0.0-1.0,
  "summary": "2-3 sentence summary",
  "strengths": ["strength1", "strength2"],
  "concerns": ["concern1", "concern2"],
  "reasoning": "detailed reasoning",
  "next_steps": ["step1", "step2"]
}}""",
        "variables": ["candidate_name", "job_title", "evaluations_json"],
    },
}
