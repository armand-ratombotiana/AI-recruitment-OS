"""Workflow API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.session import get_db_dependency
from src.domain.workflow.models import WorkflowCreate, WorkflowRead

router = APIRouter(prefix="/workflows")


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_workflow(data: WorkflowCreate, db: AsyncSession = Depends(get_db_dependency)):
    """Create a new automation workflow."""
    pass


@router.get("/")
async def list_workflows(
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db_dependency),
):
    """List workflows."""
    pass


@router.get("/{workflow_id}", response_model=WorkflowRead)
async def get_workflow(workflow_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Get workflow details with steps."""
    pass


@router.put("/{workflow_id}")
async def update_workflow(workflow_id: str, data: dict, db: AsyncSession = Depends(get_db_dependency)):
    """Update workflow configuration."""
    pass


@router.post("/{workflow_id}/activate")
async def activate_workflow(workflow_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Activate a workflow."""
    pass


@router.post("/{workflow_id}/trigger")
async def trigger_workflow(
    workflow_id: str,
    context_data: dict | None = None,
    db: AsyncSession = Depends(get_db_dependency),
):
    """Manually trigger a workflow."""
    pass


@router.get("/{workflow_id}/executions")
async def list_executions(workflow_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """List workflow executions."""
    pass


@router.post("/executions/{execution_id}/approve")
async def approve_execution(execution_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Approve a pending workflow step."""
    pass
