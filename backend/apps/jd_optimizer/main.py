"""JD Optimizer API endpoints for job description analysis and optimization."""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from shared.ai.llm_router import LLMUnavailable, get_llm_router
from shared.auth import require_member, require_tenant_id
from shared.core.database import get_db_dependency
from shared.jd_optimizer.engine import (
    analyze_jd,
    extract_keywords,
    get_templates,
    optimize_jd,
)

logger = logging.getLogger("jd_optimizer")


# ── Request Models ──────────────────────────────────────────────────────────────

class AnalyzeJDRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="Job title")
    description: str = Field(..., min_length=10, description="Job description text")
    requirements: str = Field(default="", description="Requirements section")
    responsibilities: str = Field(default="", description="Responsibilities section")


class OptimizeJDRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="Job title")
    description: str = Field(..., min_length=10, description="Job description text")
    requirements: str = Field(default="", description="Requirements section")
    responsibilities: str = Field(default="", description="Responsibilities section")
    target_role: str = Field(default="", description="Target role for optimization (e.g., 'senior_backend_engineer')")


class ExtractKeywordsRequest(BaseModel):
    text: str = Field(..., min_length=10, description="Text to extract keywords from")


# ── Response Models ─────────────────────────────────────────────────────────────

class JDAnalysisResponse(BaseModel):
    score: float = Field(..., ge=0.0, le=1.0, description="Overall quality score (0-1)")
    issues: list[dict[str, Any]] = Field(default_factory=list, description="Issues found in the JD")
    suggestions: list[dict[str, Any]] = Field(default_factory=list, description="Improvement suggestions")
    readability: dict[str, Any] = Field(default_factory=dict, description="Readability metrics")
    inclusivity: dict[str, Any] = Field(default_factory=dict, description="Inclusivity metrics")
    keywords: list[str] = Field(default_factory=list, description="Extracted keywords")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class JDOptimizeResponse(BaseModel):
    original: str = Field(..., description="Original job description")
    optimized: dict[str, str] = Field(default_factory=dict, description="Optimized versions by style")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class KeywordsResponse(BaseModel):
    keywords: list[str] = Field(default_factory=list, description="Extracted keywords")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class TemplatesResponse(BaseModel):
    templates: dict[str, dict[str, Any]] = Field(default_factory=dict, description="Available templates by role")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter(dependencies=[Depends(require_member)])


# ── Endpoints ───────────────────────────────────────────────────────────────────


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "healthy", "service": "jd-optimizer"}


@router.post(
    "/api/v1/jd-optimizer/analyze",
    response_model=JDAnalysisResponse,
    summary="Analyze a job description for quality, readability, and inclusivity",
)
async def analyze_job_description(
    data: AnalyzeJDRequest,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
) -> JDAnalysisResponse:
    """Analyze a job description and return quality metrics.

    Returns:
    - Overall quality score (0-1)
    - Issues found (missing sections, vague language, etc.)
    - Concrete improvement suggestions
    - Readability metrics (Flesch-Kincaid, sentence length, etc.)
    - Inclusivity metrics (gender bias, age bias, etc.)
    - Extracted keywords
    """
    try:
        result = await analyze_jd(
            title=data.title,
            description=data.description,
            requirements=data.requirements,
            responsibilities=data.responsibilities,
            tenant_id=tenant_id,
        )
        return JDAnalysisResponse(**result)
    except LLMUnavailable as exc:
        logger.warning("analyze_jd.llm_unavailable tenant=%s err=%s", tenant_id, exc)
        # Fallback to rule-based analysis
        result = await analyze_jd(
            title=data.title,
            description=data.description,
            requirements=data.requirements,
            responsibilities=data.responsibilities,
            tenant_id=tenant_id,
            use_fallback=True,
        )
        return JDAnalysisResponse(**result)
    except Exception as exc:
        logger.exception("analyze_jd.failed tenant=%s", tenant_id)
        raise HTTPException(status_code=500, detail=f"Job description analysis failed: {exc}") from exc


@router.post(
    "/api/v1/jd-optimizer/optimize",
    response_model=JDOptimizeResponse,
    summary="Optimize a job description into multiple styles",
)
async def optimize_job_description(
    data: OptimizeJDRequest,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
) -> JDOptimizeResponse:
    """Optimize a job description into multiple styles.

    Returns optimized versions:
    - standard: Balanced, professional rewrite
    - inclusive: Bias-free, inclusive language
    - concise: Shortened for quick scanning
    - detailed: Expanded with more context and detail
    """
    try:
        result = await optimize_jd(
            title=data.title,
            description=data.description,
            requirements=data.requirements,
            responsibilities=data.responsibilities,
            target_role=data.target_role,
            tenant_id=tenant_id,
        )
        return JDOptimizeResponse(**result)
    except LLMUnavailable as exc:
        logger.warning("optimize_jd.llm_unavailable tenant=%s err=%s", tenant_id, exc)
        result = await optimize_jd(
            title=data.title,
            description=data.description,
            requirements=data.requirements,
            responsibilities=data.responsibilities,
            target_role=data.target_role,
            tenant_id=tenant_id,
            use_fallback=True,
        )
        return JDOptimizeResponse(**result)
    except Exception as exc:
        logger.exception("optimize_jd.failed tenant=%s", tenant_id)
        raise HTTPException(status_code=500, detail=f"Job description optimization failed: {exc}") from exc


@router.post(
    "/api/v1/jd-optimizer/keywords",
    response_model=KeywordsResponse,
    summary="Extract keywords from a job description",
)
async def extract_jd_keywords(
    data: ExtractKeywordsRequest,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
) -> KeywordsResponse:
    """Extract relevant keywords from job description text for ATS optimization."""
    try:
        result = await extract_keywords(text=data.text, tenant_id=tenant_id)
        return KeywordsResponse(**result)
    except LLMUnavailable as exc:
        logger.warning("extract_keywords.llm_unavailable tenant=%s err=%s", tenant_id, exc)
        result = await extract_keywords(text=data.text, tenant_id=tenant_id, use_fallback=True)
        return KeywordsResponse(**result)
    except Exception as exc:
        logger.exception("extract_keywords.failed tenant=%s", tenant_id)
        raise HTTPException(status_code=500, detail=f"Keyword extraction failed: {exc}") from exc


@router.get(
    "/api/v1/jd-optimizer/templates",
    response_model=TemplatesResponse,
    summary="Get job description templates by role",
)
async def get_jd_templates(
    role: Optional[str] = None,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
) -> TemplatesResponse:
    """Get pre-built job description templates for common roles.

    Query parameter:
    - role: Optional filter by role (e.g., 'software_engineer', 'product_manager')
    """
    try:
        result = await get_templates(role=role, tenant_id=tenant_id)
        return TemplatesResponse(**result)
    except Exception as exc:
        logger.exception("get_templates.failed tenant=%s", tenant_id)
        raise HTTPException(status_code=500, detail=f"Template retrieval failed: {exc}") from exc
