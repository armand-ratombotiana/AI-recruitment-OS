"""Workflow Engine — Full CRUD automation workflows backed by the database.

Persistence: ``Workflow`` and ``WorkflowRun`` records are stored in the
database (see ``shared.core.models.workflow``).  The previous module-level
``WORKFLOWS_DB`` and ``EXECUTIONS_DB`` dicts have been removed.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import require_admin, require_authenticated_user, require_tenant_id
from shared.core.database import get_db_dependency
from shared.core.models.workflow import Workflow, WorkflowRun


class WorkflowCreate(BaseModel):
    name: str
    description: Optional[str] = None
    steps: list[dict] = Field(default_factory=list)
    is_active: bool = False


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    steps: Optional[list[dict]] = None
    is_active: Optional[bool] = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _to_dict(w: Workflow) -> dict[str, Any]:
    return {
        "id": w.id,
        "tenant_id": w.tenant_id,
        "name": w.name,
        "description": w.description,
        "steps": w.steps or [],
        "is_active": w.is_active,
        "runs": w.runs,
        "success_rate": w.success_rate,
        "last_run": w.last_run.isoformat() if w.last_run else None,
        "created_at": w.created_at.isoformat() if w.created_at else None,
    }


def _to_run_dict(r: WorkflowRun) -> dict[str, Any]:
    return {
        "id": r.id,
        "workflow_id": r.workflow_id,
        "status": r.status,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        "result": r.result,
    }


router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "healthy", "service": "workflow-engine"}


@router.get("/")
async def list_workflows(
    is_active: Optional[bool] = None,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    stmt = select(Workflow).where(Workflow.tenant_id == tenant_id)
    if is_active is not None:
        stmt = stmt.where(Workflow.is_active == is_active)
    rows = (await db.execute(stmt)).scalars().all()
    workflows = [
        {
            "id": w.id,
            "name": w.name,
            "description": w.description,
            "is_active": w.is_active,
            "runs": w.runs,
            "success_rate": w.success_rate,
            "last_run": w.last_run.isoformat() if w.last_run else None,
            "steps_count": len(w.steps or []),
        }
        for w in rows
    ]
    return {"workflows": workflows, "total": len(workflows)}


@router.get("/{workflow_id}")
async def get_workflow(
    workflow_id: str,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    row = (
        await db.execute(
            select(Workflow).where(
                Workflow.id == workflow_id,
                Workflow.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    return _to_dict(row)


@router.post("/")
async def create_workflow(
    data: WorkflowCreate,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
):
    row = Workflow(
        tenant_id=tenant_id,
        name=data.name,
        description=data.description,
        steps=data.steps,
        is_active=data.is_active,
        runs=0,
        success_rate=0.0,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_dict(row)


@router.put("/{workflow_id}")
async def update_workflow(
    workflow_id: str,
    data: WorkflowUpdate,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
):
    row = (
        await db.execute(
            select(Workflow).where(
                Workflow.id == workflow_id,
                Workflow.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")

    if data.name is not None:
        row.name = data.name
    if data.description is not None:
        row.description = data.description
    if data.steps is not None:
        row.steps = data.steps
    if data.is_active is not None:
        row.is_active = data.is_active

    await db.commit()
    await db.refresh(row)
    return _to_dict(row)


@router.delete("/{workflow_id}")
async def delete_workflow(
    workflow_id: str,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
):
    row = (
        await db.execute(
            select(Workflow).where(
                Workflow.id == workflow_id,
                Workflow.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    await db.delete(row)
    await db.commit()
    return {"deleted": True, "workflow_id": workflow_id}


@router.post("/{workflow_id}/trigger")
async def trigger_workflow(
    workflow_id: str,
    context: Optional[dict] = None,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _user: dict = Depends(require_authenticated_user),
):
    row = (
        await db.execute(
            select(Workflow).where(
                Workflow.id == workflow_id,
                Workflow.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    if not row.is_active:
        raise HTTPException(status_code=400, detail="Workflow must be active to trigger")

    started = _utcnow()
    step_results = [
        {"step": step.get("name", f"step_{i}"), "status": "completed"}
        for i, step in enumerate(row.steps or [])
    ]
    finished = _utcnow()

    run = WorkflowRun(
        workflow_id=row.id,
        status="completed",
        started_at=started,
        finished_at=finished,
        result={"steps": step_results, "context": context or {}},
    )
    db.add(run)

    row.runs = (row.runs or 0) + 1
    row.last_run = finished

    await db.commit()
    await db.refresh(run)

    return {
        "execution_id": run.id,
        "workflow_id": row.id,
        "status": run.status,
        "steps_executed": len(step_results),
    }


@router.post("/{workflow_id}/activate")
async def activate_workflow(
    workflow_id: str,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
):
    row = (
        await db.execute(
            select(Workflow).where(
                Workflow.id == workflow_id,
                Workflow.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    row.is_active = True
    await db.commit()
    return {"workflow_id": row.id, "is_active": True}


@router.post("/{workflow_id}/deactivate")
async def deactivate_workflow(
    workflow_id: str,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
):
    row = (
        await db.execute(
            select(Workflow).where(
                Workflow.id == workflow_id,
                Workflow.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    row.is_active = False
    await db.commit()
    return {"workflow_id": row.id, "is_active": False}


@router.get("/{workflow_id}/executions")
async def list_executions(
    workflow_id: str,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _user: dict = Depends(require_authenticated_user),
):
    # Verify workflow exists for this tenant first.
    wf = (
        await db.execute(
            select(Workflow).where(
                Workflow.id == workflow_id,
                Workflow.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")

    rows = (
        await db.execute(
            select(WorkflowRun)
            .where(WorkflowRun.workflow_id == workflow_id)
            .order_by(WorkflowRun.started_at.desc())
        )
    ).scalars().all()
    executions = [
        {
            "id": r.id,
            "status": r.status,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        }
        for r in rows
    ]
    return {"executions": executions, "total": len(executions)}
