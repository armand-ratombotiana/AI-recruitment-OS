"""Skills Gap Analysis Engine for AI-ROS.

Provides:
- Gap analysis between candidate skills and job requirements
- Skill adjacency / similarity scoring
- Learning recommendations based on identified gaps
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


SKILL_TAXONOMY: dict[str, list[str]] = {
    "programming_languages": [
        "python", "javascript", "typescript", "java", "c++", "c#", "go",
        "rust", "ruby", "php", "swift", "kotlin", "scala", "r", "sql",
    ],
    "frontend": [
        "react", "vue", "angular", "svelte", "html", "css", "tailwind",
        "next.js", "nuxt", "webpack", "vite", "sass",
    ],
    "backend": [
        "fastapi", "django", "flask", "express", "spring boot", "node.js",
        "nestjs", "rails", "asp.net", "gin", "actix",
    ],
    "databases": [
        "postgresql", "mysql", "mongodb", "redis", "elasticsearch",
        "dynamodb", "cassandra", "sqlite", "cockroachdb", "neo4j",
    ],
    "cloud_devops": [
        "aws", "gcp", "azure", "docker", "kubernetes", "terraform",
        "ci/cd", "jenkins", "github actions", "ansible", "linux",
    ],
    "data_science": [
        "machine learning", "deep learning", "tensorflow", "pytorch",
        "pandas", "numpy", "scikit-learn", "nlp", "computer vision",
        "data engineering", "spark", "airflow",
    ],
    "soft_skills": [
        "communication", "leadership", "teamwork", "problem solving",
        "project management", "agile", "scrum", "mentoring",
    ],
    "security": [
        "cybersecurity", "oauth", "jwt", "encryption", "penetration testing",
        "owasp", "zero trust", "iam",
    ],
}

_SKILL_TO_CATEGORY: dict[str, str] = {}
for _cat, _skills in SKILL_TAXONOMY.items():
    for _s in _skills:
        _SKILL_TO_CATEGORY[_s] = _cat


@dataclass
class GapAnalysis:
    matched_skills: list[str] = field(default_factory=list)
    missing_required: list[str] = field(default_factory=list)
    missing_preferred: list[str] = field(default_factory=list)
    gap_score: float = 0.0
    coverage_pct: float = 0.0
    recommendations: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "matched_skills": self.matched_skills,
            "missing_required": self.missing_required,
            "missing_preferred": self.missing_preferred,
            "gap_score": round(self.gap_score, 4),
            "coverage_pct": round(self.coverage_pct, 2),
            "recommendations": self.recommendations,
        }


class SkillsGapAnalyzer:

    def analyze(
        self,
        candidate_skills: list[str],
        job_required_skills: list[str],
        job_preferred_skills: Optional[list[str]] = None,
    ) -> GapAnalysis:
        cand = {s.lower().strip() for s in (candidate_skills or [])}
        required = {s.lower().strip() for s in (job_required_skills or [])}
        preferred = {s.lower().strip() for s in (job_preferred_skills or [])}

        matched = sorted(cand & required)
        missing_req = sorted(required - cand)
        missing_pref = sorted(preferred - cand)

        all_target = required | preferred
        if all_target:
            coverage = len(cand & all_target) / len(all_target)
        else:
            coverage = 1.0

        req_coverage = len(matched) / len(required) if required else 1.0
        if preferred:
            pref_matched = len(cand & preferred)
            pref_coverage = pref_matched / len(preferred)
            gap_score = 0.85 * req_coverage + 0.15 * pref_coverage
        else:
            gap_score = req_coverage
        gap_score = min(gap_score, 1.0)

        recommendations = self._build_recommendations(missing_req, missing_pref, cand)

        return GapAnalysis(
            matched_skills=matched,
            missing_required=missing_req,
            missing_preferred=missing_pref,
            gap_score=gap_score,
            coverage_pct=coverage * 100,
            recommendations=recommendations,
        )

    def recommend_learning(
        self,
        candidate_skills: list[str],
        target_role: str,
    ) -> list[dict]:
        cand = {s.lower().strip() for s in (candidate_skills or [])}
        role_lower = target_role.lower().strip()

        role_skill_map: dict[str, list[str]] = {
            "backend engineer": ["python", "fastapi", "postgresql", "docker", "aws"],
            "frontend engineer": ["javascript", "react", "typescript", "css", "html"],
            "full stack developer": ["python", "javascript", "react", "postgresql", "docker"],
            "data scientist": ["python", "pandas", "numpy", "scikit-learn", "machine learning"],
            "devops engineer": ["docker", "kubernetes", "aws", "terraform", "ci/cd"],
            "ml engineer": ["python", "pytorch", "tensorflow", "machine learning", "deep learning"],
            "security engineer": ["cybersecurity", "python", "linux", "owasp", "iam"],
        }

        target_skills = []
        for role_key, skills in role_skill_map.items():
            if role_key in role_lower or role_lower in role_key:
                target_skills = skills
                break

        if not target_skills:
            target_skills = ["python", "communication", "problem solving"]

        gaps = [s for s in target_skills if s not in cand]
        recommendations = []
        for skill in gaps:
            adj = self._find_closest_known_skill(skill, cand)
            difficulty = "easy" if adj and adj[1] > 0.7 else ("medium" if adj and adj[1] > 0.4 else "hard")
            recommendations.append({
                "skill": skill,
                "priority": "high" if skill in _SKILL_TO_CATEGORY.get("programming_languages", []) else "medium",
                "difficulty": difficulty,
                "bridge_from": adj[0] if adj else None,
                "estimated_hours": self._estimate_hours(skill, adj),
            })

        recommendations.sort(key=lambda r: (0 if r["priority"] == "high" else 1, r["estimated_hours"]))
        return recommendations

    def skill_adjacency(self, skill_a: str, skill_b: str) -> float:
        a = skill_a.lower().strip()
        b = skill_b.lower().strip()
        if a == b:
            return 1.0

        cat_a = _SKILL_TO_CATEGORY.get(a)
        cat_b = _SKILL_TO_CATEGORY.get(b)
        if cat_a and cat_b:
            if cat_a == cat_b:
                return 0.85
            related_groups = [
                ({"frontend", "backend"}, 0.6),
                ({"backend", "databases"}, 0.55),
                ({"backend", "cloud_devops"}, 0.5),
                ({"frontend", "backend"}, 0.6),
                ({"data_science", "programming_languages"}, 0.5),
                ({"cloud_devops", "security"}, 0.45),
                ({"databases", "data_science"}, 0.4),
            ]
            pair = {cat_a, cat_b}
            for group_pair, score in related_groups:
                if pair == group_pair:
                    return score
            return 0.2

        if cat_a or cat_b:
            return 0.1

        return 0.05

    def find_skill_alternatives(self, skill: str) -> list[str]:
        s = skill.lower().strip()
        cat = _SKILL_TO_CATEGORY.get(s)
        if not cat:
            return []
        siblings = [sk for sk in SKILL_TAXONOMY[cat] if sk != s]
        scored = [(sk, self.skill_adjacency(s, sk)) for sk in siblings]
        scored.sort(key=lambda x: x[1], reverse=True)
        return [sk for sk, _ in scored[:5]]

    def _find_closest_known_skill(
        self, target: str, known: set[str]
    ) -> Optional[tuple[str, float]]:
        if not known:
            return None
        best = None
        best_score = -1.0
        for k in known:
            score = self.skill_adjacency(target, k)
            if score > best_score:
                best_score = score
                best = k
        return (best, best_score) if best else None

    def _estimate_hours(self, skill: str, adj: Optional[tuple[str, float]]) -> int:
        base = 40
        if adj:
            reduction = adj[1] * 20
            base = max(10, int(base - reduction))
        cat = _SKILL_TO_CATEGORY.get(skill)
        if cat == "soft_skills":
            base = max(10, base - 15)
        return base

    def _build_recommendations(
        self,
        missing_req: list[str],
        missing_pref: list[str],
        candidate_set: set[str],
    ) -> list[str]:
        recs = []
        for skill in missing_req:
            alternatives = self.find_skill_alternatives(skill)
            known_alt = [a for a in alternatives if a in candidate_set]
            if known_alt:
                recs.append(
                    f"Required skill '{skill}' is missing. "
                    f"Your '{known_alt[0]}' is related — consider upskilling."
                )
            else:
                recs.append(f"Required skill '{skill}' is missing. Priority learning recommended.")

        for skill in missing_pref:
            recs.append(f"Preferred skill '{skill}' would strengthen your profile.")

        return recs
