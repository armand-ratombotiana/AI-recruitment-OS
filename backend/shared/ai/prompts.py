"""Prompt management for AI-ROS."""
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
    def __init__(self):
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

DEFAULT_PROMPTS = {
    "resume_parsing": "Extract structured data from this resume text. Return JSON with contact, summary, experience, education, skills.",
    "skill_extraction": "Extract technical and soft skills from the following text.",
    "seniority_estimation": "Estimate seniority level for this candidate profile.",
    "hiring_recommendation": "Generate a hiring recommendation based on all evaluations.",
    "interview_question": "Generate interview questions for this role and candidate.",
}

prompt_manager = PromptManager()
for name, template in DEFAULT_PROMPTS.items():
    prompt_manager.register(name, template, [])
