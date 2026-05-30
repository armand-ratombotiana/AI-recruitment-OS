"""Candidate API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.session import get_db_dependency
from src.domain.candidate.models import CandidateCreate, CandidateRead

router = APIRouter(prefix="/candidates")


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_candidate(data: CandidateCreate, db: AsyncSession = Depends(get_db_dependency)):
    """Create a new candidate."""
    # Validate input
    # Check for duplicates
    # Create candidate record
    # Emit CandidateCreated event
    # Trigger async enrichment
    pass


@router.get("/")
async def list_candidates(
    cursor: str | None = None,
    limit: int = Query(default=20, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    seniority: str | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db_dependency),
):
    """List candidates with pagination and filtering."""
    # Query with filters
    # Apply cursor-based pagination
    # Return candidates with metadata
    pass


@router.get("/{candidate_id}")
async def get_candidate(candidate_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Get candidate details with profile, evaluations, and timeline."""
    # Fetch candidate with relations
    # Include profile, skills, evaluations
    pass


@router.put("/{candidate_id}")
async def update_candidate(candidate_id: str, data: dict, db: AsyncSession = Depends(get_db_dependency)):
    """Update candidate information."""
    # Validate updates
    # Apply changes
    # Emit CandidateUpdated event
    pass


@router.post("/{candidate_id}/enrich")
async def enrich_candidate(candidate_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Trigger AI-powered candidate enrichment."""
    # Create async task
    # Return task ID for polling
    pass


@router.get("/{candidate_id}/skills")
async def get_candidate_skills(candidate_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Get candidate skill graph."""
    # Fetch skills with proficiency levels
    pass
