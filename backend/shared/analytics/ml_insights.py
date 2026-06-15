"""ML-powered analytics insights for AI-ROS.

Provides predictive and analytical functions using simple statistical methods
(linear regression, weighted averages, z-score analysis) without heavy ML
dependencies.
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Optional


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _linear_regression(x: list[float], y: list[float]) -> tuple[float, float]:
    """Simple OLS linear regression. Returns (slope, intercept)."""
    n = len(x)
    if n < 2:
        if n == 1:
            return 0.0, y[0]
        return 0.0, 0.0
    x_mean = sum(x) / n
    y_mean = sum(y) / n
    num = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, y))
    den = sum((xi - x_mean) ** 2 for xi in x)
    if den == 0:
        return 0.0, y_mean
    slope = num / den
    intercept = y_mean - slope * x_mean
    return slope, intercept


def _median(values: list[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    if n % 2 == 1:
        return s[n // 2]
    return (s[n // 2 - 1] + s[n // 2]) / 2.0


def _std_dev(values: list[float], mean: float) -> float:
    if len(values) < 2:
        return 0.0
    variance = sum((v - mean) ** 2 for v in values) / (len(values) - 1)
    return math.sqrt(variance)


def predict_time_to_hire(
    job: dict[str, Any],
    historical_data: list[dict[str, Any]],
) -> dict[str, Any]:
    """Predict time-to-hire in days for a given job using historical data.

    Uses linear regression on applicant count vs days-to-hire when enough
    data exists, otherwise falls back to weighted average by department.

    Args:
        job: Dict with keys like ``department``, ``seniority_required``,
             ``applicants_count``, ``created_at``.
        historical_data: List of dicts, each representing a past hire with
            ``days_to_hire``, ``department``, ``seniority``, ``applicants``.

    Returns:
        Dict with ``predicted_days``, ``confidence``, ``method``, ``sample_size``.
    """
    if not historical_data:
        return {
            "predicted_days": 30.0,
            "confidence": 0.0,
            "method": "default",
            "sample_size": 0,
        }

    dept = (job.get("department") or "").lower().strip()
    seniority = (job.get("seniority_required") or "").lower().strip()
    applicants = job.get("applicants_count", 0)

    dept_matches = [h for h in historical_data if (h.get("department") or "").lower().strip() == dept and h.get("days_to_hire") is not None]
    seniority_matches = [h for h in historical_data if (h.get("seniority") or "").lower().strip() == seniority and h.get("days_to_hire") is not None]
    all_with_days = [h for h in historical_data if h.get("days_to_hire") is not None]

    if len(all_with_days) >= 5 and applicants > 0:
        x = [float(h.get("applicants", 0)) for h in all_with_days]
        y = [float(h["days_to_hire"]) for h in all_with_days]
        slope, intercept = _linear_regression(x, y)
        predicted = max(1.0, slope * float(applicants) + intercept)
        residuals = [y[i] - (slope * x[i] + intercept) for i in range(len(x))]
        rmse = math.sqrt(sum(r ** 2 for r in residuals) / len(residuals)) if residuals else 0.0
        mean_y = sum(y) / len(y)
        confidence = max(0.0, min(1.0, 1.0 - (rmse / mean_y if mean_y > 0 else 1.0)))
        return {
            "predicted_days": round(predicted, 1),
            "confidence": round(confidence, 3),
            "method": "linear_regression",
            "sample_size": len(all_with_days),
        }

    relevant = dept_matches if dept_matches else (seniority_matches if seniority_matches else all_with_days)
    if not relevant:
        return {
            "predicted_days": 30.0,
            "confidence": 0.0,
            "method": "default",
            "sample_size": 0,
        }

    days_values = [float(h["days_to_hire"]) for h in relevant]
    mean_days = sum(days_values) / len(days_values)
    std = _std_dev(days_values, mean_days)
    confidence = max(0.0, min(1.0, 1.0 - (std / mean_days if mean_days > 0 else 1.0)))

    return {
        "predicted_days": round(mean_days, 1),
        "confidence": round(confidence, 3),
        "method": "weighted_average",
        "sample_size": len(relevant),
    }


def predict_candidate_success(
    candidate: dict[str, Any],
    job: dict[str, Any],
    historical_hires: list[dict[str, Any]],
) -> dict[str, Any]:
    """Predict probability (0-1) that a candidate will succeed in a role.

    Uses a weighted scoring model based on similarity to past successful hires.

    Args:
        candidate: Dict with ``source``, ``location``, ``years_experience``,
                   ``seniority``, ``skills``.
        job: Dict with ``department``, ``seniority_required``, ``required_skills``,
             ``location``.
        historical_hires: List of dicts representing past hires with
            ``hired`` (bool), ``source``, ``location``, ``years_experience``,
            ``seniority``, ``skills``, ``department``, ``performed_well`` (bool).

    Returns:
        Dict with ``probability``, ``factors``, ``sample_size``.
    """
    if not historical_hires:
        return {
            "probability": 0.5,
            "factors": [],
            "sample_size": 0,
        }

    successful = [h for h in historical_hires if h.get("performed_well", h.get("hired", False))]
    if not successful:
        return {
            "probability": 0.3,
            "factors": ["no_successful_hires_in_history"],
            "sample_size": len(historical_hires),
        }

    factors: list[str] = []
    scores: list[float] = []

    cand_source = (candidate.get("source") or "").lower().strip()
    cand_location = (candidate.get("location") or "").lower().strip()
    cand_seniority = (candidate.get("seniority") or "").lower().strip()
    cand_skills = set(s.lower().strip() for s in (candidate.get("skills") or []))
    cand_exp = candidate.get("years_experience", 0) or 0

    job_dept = (job.get("department") or "").lower().strip()
    job_seniority = (job.get("seniority_required") or "").lower().strip()
    job_location = (job.get("location") or "").lower().strip()
    job_skills = set(s.lower().strip() for s in (job.get("required_skills") or []))

    source_success: dict[str, list[bool]] = defaultdict(list)
    for h in successful:
        src = (h.get("source") or "unknown").lower().strip()
        source_success[src].append(True)
    for h in historical_hires:
        if not h.get("performed_well", h.get("hired", False)):
            src = (h.get("source") or "unknown").lower().strip()
            source_success[src].append(False)

    if cand_source:
        src_records = source_success.get(cand_source, [])
        if src_records:
            src_rate = sum(src_records) / len(src_records)
            scores.append(src_rate)
            if src_rate > 0.7:
                factors.append(f"strong_source_{cand_source}")
            elif src_rate < 0.3:
                factors.append(f"weak_source_{cand_source}")

    location_matches = sum(
        1 for h in successful
        if (h.get("location") or "").lower().strip() == cand_location and cand_location
    )
    if cand_location and len(successful) > 0:
        loc_rate = location_matches / len(successful)
        scores.append(min(1.0, 0.5 + loc_rate))
        if loc_rate > 0:
            factors.append("location_match")

    seniority_matches = sum(
        1 for h in successful
        if (h.get("seniority") or "").lower().strip() == cand_seniority and cand_seniority
    )
    if cand_seniority and len(successful) > 0:
        sen_rate = seniority_matches / len(successful)
        scores.append(min(1.0, 0.4 + sen_rate * 0.6))
        if sen_rate > 0:
            factors.append("seniority_match")

    if cand_skills and job_skills:
        overlap = len(cand_skills & job_skills)
        total = len(job_skills)
        if total > 0:
            skill_rate = overlap / total
            scores.append(skill_rate)
            if skill_rate >= 0.7:
                factors.append("strong_skill_match")
            elif skill_rate < 0.3:
                factors.append("weak_skill_match")

    exp_scores = []
    for h in successful:
        h_exp = h.get("years_experience", 0) or 0
        if h_exp > 0 and cand_exp > 0:
            diff = abs(h_exp - cand_exp)
            exp_scores.append(max(0.0, 1.0 - diff / max(h_exp, 1)))
    if exp_scores:
        avg_exp_score = sum(exp_scores) / len(exp_scores)
        scores.append(avg_exp_score)
        if avg_exp_score > 0.7:
            factors.append("experience_alignment")

    if not scores:
        base_rate = len(successful) / len(historical_hires) if historical_hires else 0.5
        return {
            "probability": round(base_rate, 3),
            "factors": ["insufficient_data"],
            "sample_size": len(historical_hires),
        }

    probability = sum(scores) / len(scores)
    probability = max(0.01, min(0.99, probability))

    return {
        "probability": round(probability, 3),
        "factors": factors,
        "sample_size": len(historical_hires),
    }


def detect_hiring_bias(
    applications: list[dict[str, Any]],
    hires: list[dict[str, Any]],
) -> dict[str, Any]:
    """Detect potential hiring bias across demographic proxy dimensions.

    Analyzes selection rates across location-based groups and source-based
    groups, flagging statistically significant disparities.

    Args:
        applications: List of dicts with ``candidate_id``, ``location``,
                      ``source``, ``status``.
        hires: List of dicts with ``candidate_id``, ``location``, ``source``.

    Returns:
        Dict with ``biases`` (list of findings), ``summary``, ``risk_level``.
    """
    if not applications:
        return {
            "biases": [],
            "summary": "No application data available for bias analysis.",
            "risk_level": "none",
            "dimensions_analyzed": 0,
        }

    hired_ids = set(h.get("candidate_id") for h in hires)
    biases: list[dict[str, Any]] = []

    def _analyze_dimension(dim_name: str, get_group: callable) -> None:
        groups: dict[str, dict[str, int]] = defaultdict(lambda: {"applied": 0, "hired": 0})
        for app in applications:
            group = get_group(app) or "unknown"
            groups[group]["applied"] += 1
            if app.get("candidate_id") in hired_ids:
                groups[group]["hired"] += 1

        if len(groups) < 2:
            return

        rates: dict[str, float] = {}
        for group, counts in groups.items():
            if counts["applied"] > 0:
                rates[group] = counts["hired"] / counts["applied"]
            else:
                rates[group] = 0.0

        if not rates:
            return

        all_rates = list(rates.values())
        overall_rate = sum(all_rates) / len(all_rates) if all_rates else 0.0
        max_rate = max(all_rates)
        min_rate = min(all_rates)

        if overall_rate > 0 and (max_rate - min_rate) > 0.2:
            disadvantaged = [g for g, r in rates.items() if r < overall_rate * 0.7]
            advantaged = [g for g, r in rates.items() if r >= overall_rate * 1.3]
            if disadvantaged and advantaged:
                total_apps = sum(g["applied"] for g in groups.values())
                disparities = []
                for g in disadvantaged:
                    disparities.append({
                        "group": g,
                        "selection_rate": round(rates[g], 4),
                        "applications": groups[g]["applied"],
                    })
                effect_size = (max_rate - min_rate) / overall_rate if overall_rate > 0 else 0.0
                severity = "high" if effect_size > 1.0 else ("medium" if effect_size > 0.5 else "low")
                biases.append({
                    "dimension": dim_name,
                    "severity": severity,
                    "effect_size": round(effect_size, 3),
                    "disadvantaged_groups": disparities,
                    "advantaged_groups": [
                        {"group": g, "selection_rate": round(rates[g], 4)}
                        for g in advantaged
                    ],
                    "total_groups": len(groups),
                    "total_applications": total_apps,
                })

    _analyze_dimension("location", lambda app: (app.get("location") or "unknown").split(",")[0].strip() if app.get("location") else "unknown")
    _analyze_dimension("source", lambda app: app.get("source") or "unknown")

    seniority_groups: dict[str, dict[str, int]] = defaultdict(lambda: {"applied": 0, "hired": 0})
    for app in applications:
        sg = (app.get("seniority") or "unknown").lower().strip()
        seniority_groups[sg]["applied"] += 1
        if app.get("candidate_id") in hired_ids:
            seniority_groups[sg]["hired"] += 1
    if len(seniority_groups) >= 2:
        _analyze_dimension("seniority", lambda app: (app.get("seniority") or "unknown").lower().strip())

    risk_level = "none"
    if biases:
        severities = [b["severity"] for b in biases]
        if "high" in severities:
            risk_level = "high"
        elif "medium" in severities:
            risk_level = "medium"
        else:
            risk_level = "low"

    summary_parts = []
    if not biases:
        summary_parts.append("No significant bias detected across analyzed dimensions.")
    else:
        for b in biases:
            summary_parts.append(
                f"{b['severity'].upper()} bias detected in {b['dimension']} "
                f"(effect size: {b['effect_size']})"
            )

    return {
        "biases": biases,
        "summary": " ".join(summary_parts),
        "risk_level": risk_level,
        "dimensions_analyzed": 3,
        "generated_at": _now().isoformat(),
    }


def recommend_sourcing_channels(
    job: dict[str, Any],
    budget: float,
    historical_channels: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Recommend optimal sourcing channel allocation given a budget.

    Uses historical channel effectiveness data to allocate budget proportionally
    to cost-per-hire and conversion rates.

    Args:
        job: Dict with ``department``, ``seniority_required``, ``job_type``.
        budget: Total budget in currency units.
        historical_channels: List of dicts with ``channel``, ``cost_per_candidate``,
            ``conversion_rate``, ``avg_cost_per_hire``, ``candidates_sourced``.

    Returns:
        Dict with ``allocations`` (list of channel allocations), ``total_budget``,
        ``expected_hires``, ``method``.
    """
    default_channels = [
        {"channel": "linkedin", "cost_per_candidate": 50.0, "conversion_rate": 0.08, "avg_cost_per_hire": 625.0},
        {"channel": "indeed", "cost_per_candidate": 30.0, "conversion_rate": 0.06, "avg_cost_per_hire": 500.0},
        {"channel": "referral", "cost_per_candidate": 15.0, "conversion_rate": 0.15, "avg_cost_per_hire": 100.0},
        {"channel": "careers_site", "cost_per_candidate": 5.0, "conversion_rate": 0.05, "avg_cost_per_hire": 100.0},
        {"channel": "agency", "cost_per_candidate": 200.0, "conversion_rate": 0.20, "avg_cost_per_hire": 1000.0},
        {"channel": "job_board", "cost_per_candidate": 20.0, "conversion_rate": 0.04, "avg_cost_per_hire": 500.0},
    ]

    channels = historical_channels if historical_channels else default_channels

    if budget <= 0:
        return {
            "allocations": [],
            "total_budget": 0.0,
            "expected_hires": 0.0,
            "method": "none",
        }

    scored: list[dict[str, Any]] = []
    for ch in channels:
        cost_per_hire = ch.get("avg_cost_per_hire", 500.0)
        conv_rate = ch.get("conversion_rate", 0.05)
        cost_per_cand = ch.get("cost_per_candidate", 30.0)
        if cost_per_hire <= 0:
            continue
        efficiency = conv_rate / cost_per_cand if cost_per_cand > 0 else 0.0
        scored.append({
            "channel": ch.get("channel", "unknown"),
            "cost_per_hire": cost_per_hire,
            "conversion_rate": conv_rate,
            "cost_per_candidate": cost_per_cand,
            "efficiency": efficiency,
        })

    if not scored:
        return {
            "allocations": [],
            "total_budget": budget,
            "expected_hires": 0.0,
            "method": "no_data",
        }

    total_efficiency = sum(s["efficiency"] for s in scored)
    if total_efficiency <= 0:
        total_efficiency = 1.0

    dept = (job.get("department") or "").lower().strip()
    seniority = (job.get("seniority_required") or "").lower().strip()

    allocations: list[dict[str, Any]] = []
    total_expected_hires = 0.0

    for s in scored:
        weight = s["efficiency"] / total_efficiency
        channel_budget = budget * weight

        if dept in ("engineering", "data", "technology"):
            if s["channel"] == "linkedin":
                channel_budget *= 1.3
            elif s["channel"] == "indeed":
                channel_budget *= 0.8
        elif dept in ("sales", "marketing"):
            if s["channel"] == "referral":
                channel_budget *= 1.2
        elif dept in ("executive", "leadership"):
            if s["channel"] == "agency":
                channel_budget *= 1.5

        if seniority in ("senior", "staff", "principal", "director", "vp"):
            if s["channel"] == "linkedin":
                channel_budget *= 1.2
            elif s["channel"] == "agency":
                channel_budget *= 1.3

        candidates_reachable = int(channel_budget / s["cost_per_candidate"]) if s["cost_per_candidate"] > 0 else 0
        expected_hires = candidates_reachable * s["conversion_rate"]
        total_expected_hires += expected_hires

        allocations.append({
            "channel": s["channel"],
            "budget_allocated": round(channel_budget, 2),
            "budget_percentage": round(weight * 100, 1),
            "expected_candidates": candidates_reachable,
            "expected_hires": round(expected_hires, 2),
            "cost_per_hire": s["cost_per_hire"],
        })

    allocations.sort(key=lambda a: a["expected_hires"], reverse=True)

    return {
        "allocations": allocations,
        "total_budget": budget,
        "expected_hires": round(total_expected_hires, 2),
        "method": "efficiency_weighted",
        "generated_at": _now().isoformat(),
    }


def forecast_hiring_needs(
    tenant_id: str,
    months_ahead: int,
    historical_hiring_data: list[dict[str, Any]] | None = None,
    current_open_positions: int = 0,
    attrition_rate: float = 0.0,
) -> dict[str, Any]:
    """Forecast number of hires needed over the coming months.

    Uses trend analysis (linear regression on historical hiring rates) plus
    attrition adjustment.

    Args:
        tenant_id: The tenant identifier.
        months_ahead: Number of months to forecast.
        historical_hiring_data: List of dicts with ``month`` (YYYY-MM),
            ``hires_count``, ``open_jobs``.
        current_open_positions: Number of currently open positions.
        attrition_rate: Monthly attrition rate (0.0-1.0).

    Returns:
        Dict with ``forecast``, ``monthly_breakdown``, ``confidence``,
        ``trend``, ``method``.
    """
    if months_ahead <= 0:
        return {
            "tenant_id": tenant_id,
            "forecast": {"total_hires_needed": 0, "months": 0},
            "monthly_breakdown": [],
            "confidence": 0.0,
            "trend": "insufficient_data",
            "method": "none",
        }

    if not historical_hiring_data or len(historical_hiring_data) < 2:
        base_monthly = max(1, current_open_positions) if current_open_positions > 0 else 2
        monthly = []
        cumulative = 0
        for i in range(1, months_ahead + 1):
            attrition_adj = base_monthly * (1 + attrition_rate * i)
            monthly_hires = round(attrition_adj, 1)
            cumulative += monthly_hires
            monthly.append({
                "month": i,
                "predicted_hires": monthly_hires,
                "cumulative": round(cumulative, 1),
            })
        return {
            "tenant_id": tenant_id,
            "forecast": {
                "total_hires_needed": round(cumulative, 1),
                "months": months_ahead,
            },
            "monthly_breakdown": monthly,
            "confidence": 0.2,
            "trend": "default_estimate",
            "method": "default",
            "generated_at": _now().isoformat(),
        }

    sorted_data = sorted(historical_hiring_data, key=lambda d: d.get("month", ""))
    x = list(range(len(sorted_data)))
    y = [float(d.get("hires_count", 0)) for d in sorted_data]

    slope, intercept = _linear_regression(x, y)

    y_mean = sum(y) / len(y)
    residuals = [y[i] - (slope * x[i] + intercept) for i in range(len(x))]
    rmse = math.sqrt(sum(r ** 2 for r in residuals) / len(residuals)) if residuals else 0.0
    confidence = max(0.0, min(1.0, 1.0 - (rmse / y_mean if y_mean > 0 else 1.0)))

    if slope > 0.1:
        trend = "increasing"
    elif slope < -0.1:
        trend = "decreasing"
    else:
        trend = "stable"

    monthly: list[dict[str, Any]] = []
    cumulative = 0.0
    n = len(sorted_data)
    for i in range(1, months_ahead + 1):
        projected = max(0.0, slope * (n - 1 + i) + intercept)
        attrition_adj = projected * (1 + attrition_rate * i * 0.1)
        final = max(0.5, attrition_adj)
        cumulative += final
        monthly.append({
            "month": i,
            "predicted_hires": round(final, 1),
            "cumulative": round(cumulative, 1),
        })

    open_adj = current_open_positions * 0.5
    total_needed = round(cumulative + open_adj, 1)

    return {
        "tenant_id": tenant_id,
        "forecast": {
            "total_hires_needed": total_needed,
            "months": months_ahead,
        },
        "monthly_breakdown": monthly,
        "confidence": round(confidence, 3),
        "trend": trend,
        "slope_per_month": round(slope, 3),
        "method": "linear_regression",
        "generated_at": _now().isoformat(),
    }
