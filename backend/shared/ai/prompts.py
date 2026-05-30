from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class PromptVersion:
    version: int
    template: str
    variables: list[str]
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    performance_score: float | None = None
    usage_count: int = 0
    avg_tokens: float = 0.0


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

    def set_active(self, name: str, version: int) -> None:
        self._active[name] = version

    def record_usage(self, name: str, tokens: int) -> None:
        pv = self.get(name)
        if pv:
            pv.usage_count += 1
            pv.avg_tokens = (pv.avg_tokens * (pv.usage_count - 1) + tokens) / pv.usage_count


DEFAULT_PROMPTS = {
    "resume_parsing": (
        "Extract structured data from this resume text. Return JSON with: "
        "contact (email, phone, location), summary, experience (array of "
        "{title, company, start_date, end_date, description, skills_used}), "
        "education (array of {degree, institution, year}), skills (array of names). "
        "Resume text:\n{resume_text}"
    ),
    "skill_extraction": (
        "Extract technical and soft skills from the following text. "
        "For each skill provide: name, category (programming_language/framework/tool/soft_skill), "
        "confidence (0.0-1.0). Text:\n{text}"
    ),
    "seniority_estimation": (
        "Estimate seniority level for this candidate profile. "
        "Consider: years of experience, role progression, technical depth, leadership indicators. "
        "Output JSON: {seniority_level, confidence, reasoning, key_indicators}. "
        "Profile:\n{profile}"
    ),
    "hiring_recommendation": (
        "Based on all evaluations, generate a hiring recommendation. "
        "Candidate: {candidate_name}, Role: {job_title}. "
        "Evaluations: {evaluations_json}. "
        "Output JSON: {recommendation, confidence, summary, strengths, concerns, reasoning}."
    ),
}
