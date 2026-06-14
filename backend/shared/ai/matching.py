"""AI-powered candidate-job matching with semantic similarity.

Combines TF-IDF cosine similarity (semantic) with the structured scoring
engine for a hybrid match score.  Works fully offline — no external API
keys required — while remaining extensible for real embedding providers.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

from shared.scoring.engine import score_candidate, ScoreBreakdown


# ── Text vectorisation (pure-Python TF-IDF) ──────────────────────────────────

_STOP_WORDS = frozenset({
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "this", "that",
    "these", "those", "it", "its", "we", "our", "you", "your", "as",
})

_WORD_RE = re.compile(r"[a-z0-9+#.]+")


def _tokenize(text: str) -> list[str]:
    return [
        t for t in _WORD_RE.findall(text.lower())
        if t not in _STOP_WORDS and len(t) > 1
    ]


def _build_text(candidate: Dict[str, Any]) -> str:
    parts: list[str] = []
    skills = candidate.get("skills") or []
    if isinstance(skills, list):
        parts.extend(str(s) for s in skills)
    if candidate.get("experience_years") is not None:
        parts.append(f"{candidate['experience_years']} years experience")
    if candidate.get("title"):
        parts.append(str(candidate["title"]))
    if candidate.get("description"):
        parts.append(str(candidate["description"]))
    if candidate.get("location"):
        parts.append(str(candidate["location"]))
    bio = candidate.get("bio") or candidate.get("summary")
    if bio:
        parts.append(str(bio))
    return " ".join(parts)


def _build_job_text(job: Dict[str, Any]) -> str:
    parts: list[str] = []
    for key in ("required_skills", "preferred_skills"):
        skills = job.get(key) or []
        if isinstance(skills, list):
            parts.extend(str(s) for s in skills)
    if job.get("title"):
        parts.append(str(job["title"]))
    if job.get("description"):
        parts.append(str(job["description"]))
    if job.get("location"):
        parts.append(str(job["location"]))
    if job.get("required_experience_years"):
        parts.append(f"{job['required_experience_years']} years experience")
    return " ".join(parts)


def _tf(tokens: list[str]) -> dict[str, float]:
    counts = Counter(tokens)
    total = len(tokens) or 1
    return {t: c / total for t, c in counts.items()}


def _idf(corpus_tokens: list[list[str]]) -> dict[str, float]:
    n = len(corpus_tokens)
    if n == 0:
        return {}
    df: Counter[str] = Counter()
    for tokens in corpus_tokens:
        df.update(set(tokens))
    return {t: math.log((n + 1) / (c + 1)) + 1 for t, c in df.items()}


def _tfidf_vector(tokens: list[str], idf: dict[str, float]) -> dict[str, float]:
    tf = _tf(tokens)
    return {t: tf.get(t, 0.0) * idf.get(t, 1.0) for t in set(tokens) | set(idf)}


def _cosine(a: dict[str, float], b: dict[str, float]) -> float:
    keys = set(a) | set(b)
    if not keys:
        return 0.0
    dot = sum(a.get(k, 0.0) * b.get(k, 0.0) for k in keys)
    mag_a = math.sqrt(sum(v * v for v in a.values()))
    mag_b = math.sqrt(sum(v * v for v in b.values()))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


# ── Public API ────────────────────────────────────────────────────────────────


SEMANTIC_WEIGHT = 0.40
STRUCTURED_WEIGHT = 0.60


@dataclass
class MatchResult:
    candidate_id: Optional[str]
    job_id: Optional[str]
    semantic_score: float
    structured_score: float
    hybrid_score: float
    breakdown: Optional[ScoreBreakdown] = None
    recommendation: str = ""

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "semantic_score": round(self.semantic_score, 4),
            "structured_score": round(self.structured_score, 4),
            "hybrid_score": round(self.hybrid_score, 4),
            "recommendation": self.recommendation,
        }
        if self.candidate_id is not None:
            d["candidate_id"] = self.candidate_id
        if self.job_id is not None:
            d["job_id"] = self.job_id
        if self.breakdown is not None:
            d["breakdown"] = {
                "skills_score": self.breakdown.skills_score,
                "experience_score": self.breakdown.experience_score,
                "location_score": self.breakdown.location_score,
                "salary_score": self.breakdown.salary_score,
                "culture_score": self.breakdown.culture_score,
                "total_score": self.breakdown.total_score,
            }
        return d


def semantic_match(candidate: Dict[str, Any], job: Dict[str, Any]) -> float:
    """Return a 0-1 cosine similarity between candidate and job text profiles."""
    cand_tokens = _tokenize(_build_text(candidate))
    job_tokens = _tokenize(_build_job_text(job))
    corpus = [cand_tokens, job_tokens]
    idf = _idf(corpus)
    v_cand = _tfidf_vector(cand_tokens, idf)
    v_job = _tfidf_vector(job_tokens, idf)
    return round(_cosine(v_cand, v_job), 4)


def _hybrid(
    candidate: Dict[str, Any],
    job: Dict[str, Any],
    *,
    semantic_w: float = SEMANTIC_WEIGHT,
    structured_w: float = STRUCTURED_WEIGHT,
) -> MatchResult:
    sem = semantic_match(candidate, job)
    breakdown = score_candidate(candidate, job)
    struct = breakdown.total_score
    total_w = semantic_w + structured_w or 1.0
    hybrid = (sem * semantic_w + struct * structured_w) / total_w
    rec = breakdown.recommendation
    if hybrid >= 0.85:
        rec = "STRONG_MATCH"
    elif hybrid >= 0.7:
        rec = "MATCH"
    elif hybrid >= 0.5:
        rec = "POSSIBLE"
    elif hybrid >= 0.3:
        rec = "WEAK"
    else:
        rec = "NO_MATCH"
    return MatchResult(
        candidate_id=candidate.get("id"),
        job_id=job.get("id"),
        semantic_score=sem,
        structured_score=struct,
        hybrid_score=round(hybrid, 4),
        breakdown=breakdown,
        recommendation=rec,
    )


def match_candidates_to_job(
    job: Dict[str, Any],
    candidates: Sequence[Dict[str, Any]],
    *,
    top_n: int = 20,
) -> list[MatchResult]:
    """Rank candidates against a single job, returning the top_n best matches."""
    results = [_hybrid(c, job) for c in candidates]
    results.sort(key=lambda r: r.hybrid_score, reverse=True)
    return results[:top_n]


def match_job_to_candidates(
    candidate: Dict[str, Any],
    jobs: Sequence[Dict[str, Any]],
    *,
    top_n: int = 10,
) -> list[MatchResult]:
    """Rank jobs for a single candidate, returning the top_n best matches."""
    results = [_hybrid(candidate, j) for j in jobs]
    results.sort(key=lambda r: r.hybrid_score, reverse=True)
    return results[:top_n]


# ── Stats ─────────────────────────────────────────────────────────────────────


def compute_match_stats(matches: Sequence[MatchResult]) -> dict[str, Any]:
    if not matches:
        return {
            "total": 0,
            "avg_hybrid_score": 0.0,
            "avg_semantic_score": 0.0,
            "avg_structured_score": 0.0,
            "strong_matches": 0,
            "matches": 0,
            "possible": 0,
            "weak": 0,
            "no_match": 0,
        }
    scores = [m.hybrid_score for m in matches]
    sem_scores = [m.semantic_score for m in matches]
    struct_scores = [m.structured_score for m in matches]
    recs = [m.recommendation for m in matches]
    return {
        "total": len(matches),
        "avg_hybrid_score": round(sum(scores) / len(scores), 4),
        "avg_semantic_score": round(sum(sem_scores) / len(sem_scores), 4),
        "avg_structured_score": round(sum(struct_scores) / len(struct_scores), 4),
        "strong_matches": recs.count("STRONG_MATCH"),
        "matches": recs.count("MATCH"),
        "possible": recs.count("POSSIBLE"),
        "weak": recs.count("WEAK"),
        "no_match": recs.count("NO_MATCH"),
    }


# ── CandidateJobMatcher class ─────────────────────────────────────────────────


@dataclass
class MatchReason:
    dimension: str
    description: str
    impact: float


class CandidateJobMatcher:
    """High-level matcher combining scoring engine + semantic similarity.

    Wraps the lower-level functions in this module and adds human-readable
    match reasons and a 0-100 score scale.
    """

    def __init__(
        self,
        *,
        semantic_weight: float = SEMANTIC_WEIGHT,
        structured_weight: float = STRUCTURED_WEIGHT,
        use_llm: bool = False,
    ) -> None:
        self.semantic_weight = semantic_weight
        self.structured_weight = structured_weight
        self.use_llm = use_llm

    def calculate_match_score(self, candidate: Dict[str, Any], job: Dict[str, Any]) -> float:
        """Return a 0-100 match score between candidate and job."""
        result = _hybrid(
            candidate,
            job,
            semantic_w=self.semantic_weight,
            structured_w=self.structured_weight,
        )
        return round(result.hybrid_score * 100, 2)

    def generate_match_reasons(
        self, candidate: Dict[str, Any], job: Dict[str, Any]
    ) -> list[str]:
        """Generate human-readable reasons explaining the match quality."""
        reasons: list[str] = []
        breakdown = score_candidate(candidate, job)

        cand_skills = set(s.lower().strip() for s in (candidate.get("skills") or []))
        req_skills = set(s.lower().strip() for s in (job.get("required_skills") or []))
        pref_skills = set(s.lower().strip() for s in (job.get("preferred_skills") or []))

        matched_req = cand_skills & req_skills
        matched_pref = cand_skills & pref_skills
        missing_req = req_skills - cand_skills

        if matched_req:
            reasons.append(
                f"Matches required skills: {', '.join(sorted(matched_req))}"
            )
        if matched_pref:
            reasons.append(
                f"Has preferred skills: {', '.join(sorted(matched_pref))}"
            )
        if missing_req:
            reasons.append(
                f"Missing required skills: {', '.join(sorted(missing_req))}"
            )

        exp_years = candidate.get("experience_years")
        req_years = job.get("required_experience_years") or job.get("min_experience_years")
        if exp_years is not None and req_years:
            if exp_years >= req_years:
                reasons.append(
                    f"Experience ({exp_years}yr) meets requirement ({req_years}yr)"
                )
            else:
                reasons.append(
                    f"Experience ({exp_years}yr) below requirement ({req_years}yr)"
                )

        if breakdown.skills_score >= 0.8:
            reasons.append("Strong technical skill alignment")
        elif breakdown.skills_score < 0.3:
            reasons.append("Weak skill overlap with job requirements")

        if breakdown.experience_score >= 0.8:
            reasons.append("Experience level well-suited for the role")

        if breakdown.location_score >= 0.7:
            reasons.append("Location compatible with job location")
        elif breakdown.location_score == 0.0 and not job.get("remote_ok"):
            reasons.append("Location mismatch with job location")

        if job.get("remote_ok"):
            reasons.append("Remote-friendly position")

        if breakdown.salary_score >= 0.8:
            reasons.append("Salary expectations within job range")
        elif breakdown.salary_score < 0.3:
            reasons.append("Salary expectations may exceed job budget")

        if breakdown.culture_score >= 0.7:
            reasons.append("Good cultural fit signal")

        sem = semantic_match(candidate, job)
        if sem >= 0.5:
            reasons.append("High semantic similarity between profiles")
        elif sem < 0.1:
            reasons.append("Low semantic similarity between profiles")

        return reasons

    def match_candidate_to_jobs(
        self,
        candidate_id: str,
        candidate: Dict[str, Any],
        jobs: Sequence[Dict[str, Any]],
        top_n: int = 10,
    ) -> list[dict[str, Any]]:
        """Match a candidate against multiple jobs, returning ranked results."""
        results: list[dict[str, Any]] = []
        for job in jobs:
            score = self.calculate_match_score(candidate, job)
            reasons = self.generate_match_reasons(candidate, job)
            results.append({
                "job_id": job.get("id"),
                "score": score,
                "reasons": reasons,
            })
        results.sort(key=lambda r: r["score"], reverse=True)
        return results[:top_n]

    def match_job_to_candidates(
        self,
        job_id: str,
        job: Dict[str, Any],
        candidates: Sequence[Dict[str, Any]],
        top_n: int = 20,
    ) -> list[dict[str, Any]]:
        """Match a job against multiple candidates, returning ranked results."""
        results: list[dict[str, Any]] = []
        for candidate in candidates:
            score = self.calculate_match_score(candidate, job)
            reasons = self.generate_match_reasons(candidate, job)
            results.append({
                "candidate_id": candidate.get("id"),
                "score": score,
                "reasons": reasons,
            })
        results.sort(key=lambda r: r["score"], reverse=True)
        return results[:top_n]
