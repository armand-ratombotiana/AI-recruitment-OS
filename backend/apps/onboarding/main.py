"""Onboarding Workflow Automation — candidate onboarding with task tracking."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import require_admin, require_member, require_tenant_id
from shared.core.database import get_db_dependency
from shared.core.models.onboarding import (
    AssignWorkflowRequest,
    CandidateOnboarding,
    CandidateOnboardingRead,
    CompleteTaskRequest,
    OnboardingStatus,
    OnboardingTask,
    OnboardingWorkflow,
    OnboardingWorkflowCreate,
    OnboardingWorkflowRead,
    OnboardingWorkflowUpdate,
    TaskStatus,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _to_workflow_dict(w: OnboardingWorkflow) -> dict[str, Any]:
    return {
        "id": w.id,
        "tenant_id": w.tenant_id,
        "name": w.name,
        "description": w.description,
        "steps": w.steps or [],
        "active": w.active,
        "created_at": w.created_at.isoformat() if w.created_at else None,
        "updated_at": w.updated_at.isoformat() if w.updated_at else None,
    }


def _to_onboarding_dict(o: CandidateOnboarding) -> dict[str, Any]:
    return {
        "id": o.id,
        "tenant_id": o.tenant_id,
        "candidate_id": o.candidate_id,
        "workflow_id": o.workflow_id,
        "current_step": o.current_step,
        "status": o.status,
        "progress_pct": o.progress_pct,
        "started_at": o.started_at.isoformat() if o.started_at else None,
        "completed_at": o.completed_at.isoformat() if o.completed_at else None,
    }


def _to_task_dict(t: OnboardingTask) -> dict[str, Any]:
    return {
        "id": t.id,
        "onboarding_id": t.onboarding_id,
        "step_id": t.step_id,
        "status": t.status,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "notes": t.notes,
    }


def _recalc_progress(session: AsyncSession, onboarding_id: str, steps: list[dict]) -> None:
    pass


router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "healthy", "service": "onboarding"}


@router.get("/workflows")
async def list_workflows(
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    stmt = select(OnboardingWorkflow).where(OnboardingWorkflow.tenant_id == tenant_id)
    rows = (await db.execute(stmt)).scalars().all()
    workflows = [_to_workflow_dict(w) for w in rows]
    return {"workflows": workflows, "total": len(workflows)}


@router.post("/workflows")
async def create_workflow(
    data: OnboardingWorkflowCreate,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
):
    now = _utcnow()
    row = OnboardingWorkflow(
        tenant_id=tenant_id,
        name=data.name,
        description=data.description,
        steps=[s.model_dump() for s in data.steps],
        active=data.active,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_workflow_dict(row)


@router.get("/workflows/{workflow_id}")
async def get_workflow(
    workflow_id: str,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    row = (
        await db.execute(
            select(OnboardingWorkflow).where(
                OnboardingWorkflow.id == workflow_id,
                OnboardingWorkflow.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    return _to_workflow_dict(row)


@router.put("/workflows/{workflow_id}")
async def update_workflow(
    workflow_id: str,
    data: OnboardingWorkflowUpdate,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
):
    row = (
        await db.execute(
            select(OnboardingWorkflow).where(
                OnboardingWorkflow.id == workflow_id,
                OnboardingWorkflow.tenant_id == tenant_id,
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
        row.steps = [s.model_dump() for s in data.steps]
    if data.active is not None:
        row.active = data.active
    row.updated_at = _utcnow()

    await db.commit()
    await db.refresh(row)
    return _to_workflow_dict(row)


@router.post("/workflows/{workflow_id}/assign")
async def assign_workflow(
    workflow_id: str,
    data: AssignWorkflowRequest,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _member: dict = Depends(require_member),
):
    wf = (
        await db.execute(
            select(OnboardingWorkflow).where(
                OnboardingWorkflow.id == workflow_id,
                OnboardingWorkflow.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")

    existing = (
        await db.execute(
            select(CandidateOnboarding).where(
                CandidateOnboarding.candidate_id == data.candidate_id,
                CandidateOnboarding.workflow_id == workflow_id,
                CandidateOnboarding.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Candidate already assigned to this workflow")

    now = _utcnow()
    onboarding = CandidateOnboarding(
        tenant_id=tenant_id,
        candidate_id=data.candidate_id,
        workflow_id=workflow_id,
        current_step=0,
        status=OnboardingStatus.IN_PROGRESS.value,
        progress_pct=0.0,
        started_at=now,
    )
    db.add(onboarding)
    await db.flush()

    for step in (wf.steps or []):
        task = OnboardingTask(
            onboarding_id=onboarding.id,
            step_id=step.get("id", str(uuid.uuid4())),
            status=TaskStatus.PENDING.value,
        )
        db.add(task)

    await db.commit()
    await db.refresh(onboarding)
    return _to_onboarding_dict(onboarding)


@router.get("/candidates/{candidate_id}/status")
async def get_candidate_status(
    candidate_id: str,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _member: dict = Depends(require_member),
):
    onboardings = (
        await db.execute(
            select(CandidateOnboarding).where(
                CandidateOnboarding.candidate_id == candidate_id,
                CandidateOnboarding.tenant_id == tenant_id,
            )
        )
    ).scalars().all()

    if not onboardings:
        raise HTTPException(status_code=404, detail=f"No onboarding found for candidate {candidate_id}")

    results = []
    for o in onboardings:
        tasks = (
            await db.execute(
                select(OnboardingTask).where(OnboardingTask.onboarding_id == o.id)
            )
        ).scalars().all()
        entry = _to_onboarding_dict(o)
        entry["tasks"] = [_to_task_dict(t) for t in tasks]
        results.append(entry)

    return {"candidate_id": candidate_id, "onboardings": results}


@router.post("/tasks/{task_id}/complete")
async def complete_task(
    task_id: str,
    data: CompleteTaskRequest | None = None,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _member: dict = Depends(require_member),
):
    task = (
        await db.execute(
            select(OnboardingTask).where(OnboardingTask.id == task_id)
        )
    ).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")

    onboarding = (
        await db.execute(
            select(CandidateOnboarding).where(
                CandidateOnboarding.id == task.onboarding_id,
                CandidateOnboarding.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not onboarding:
        raise HTTPException(status_code=404, detail="Onboarding not found for this tenant")

    if task.status == TaskStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="Task already completed")

    now = _utcnow()
    task.status = TaskStatus.COMPLETED.value
    task.completed_at = now
    if data and data.notes:
        task.notes = data.notes

    all_tasks = (
        await db.execute(
            select(OnboardingTask).where(OnboardingTask.onboarding_id == onboarding.id)
        )
    ).scalars().all()

    total = len(all_tasks)
    done = sum(1 for t in all_tasks if t.status == TaskStatus.COMPLETED.value)
    progress = round((done / total) * 100, 1) if total > 0 else 0.0

    onboarding.progress_pct = progress

    completed_step_ids = [t.step_id for t in all_tasks if t.status == TaskStatus.COMPLETED.value]
    wf = (
        await db.execute(
            select(OnboardingWorkflow).where(OnboardingWorkflow.id == onboarding.workflow_id)
        )
    ).scalar_one_or_none()
    if wf:
        step_orders = sorted(
            [(s.get("order", 0), s.get("id", "")) for s in (wf.steps or [])]
        )
        current = 0
        for order, sid in step_orders:
            if sid in completed_step_ids:
                current = order
            else:
                break
        onboarding.current_step = current

    if done == total and total > 0:
        onboarding.status = OnboardingStatus.COMPLETED.value
        onboarding.completed_at = now
    elif done > 0:
        onboarding.status = OnboardingStatus.IN_PROGRESS.value

    await db.commit()
    await db.refresh(task)
    await db.refresh(onboarding)

    return {
        "task": _to_task_dict(task),
        "onboarding": _to_onboarding_dict(onboarding),
    }


@router.get("/stats")
async def get_stats(
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _member: dict = Depends(require_member),
):
    wf_count = (
        await db.execute(
            select(func.count()).select_from(OnboardingWorkflow).where(
                OnboardingWorkflow.tenant_id == tenant_id
            )
        )
    ).scalar() or 0

    active_wf_count = (
        await db.execute(
            select(func.count()).select_from(OnboardingWorkflow).where(
                OnboardingWorkflow.tenant_id == tenant_id,
                OnboardingWorkflow.active == True,
            )
        )
    ).scalar() or 0

    total_onboardings = (
        await db.execute(
            select(func.count()).select_from(CandidateOnboarding).where(
                CandidateOnboarding.tenant_id == tenant_id
            )
        )
    ).scalar() or 0

    status_counts = {}
    for s in [OnboardingStatus.PENDING.value, OnboardingStatus.IN_PROGRESS.value, OnboardingStatus.COMPLETED.value]:
        cnt = (
            await db.execute(
                select(func.count()).select_from(CandidateOnboarding).where(
                    CandidateOnboarding.tenant_id == tenant_id,
                    CandidateOnboarding.status == s,
                )
            )
        ).scalar() or 0
        status_counts[s] = cnt

    avg_progress = (
        await db.execute(
            select(func.avg(CandidateOnboarding.progress_pct)).where(
                CandidateOnboarding.tenant_id == tenant_id
            )
        )
    ).scalar() or 0.0

    total_tasks = 0
    completed_tasks = 0
    onboardings = (
        await db.execute(
            select(CandidateOnboarding).where(
                CandidateOnboarding.tenant_id == tenant_id
            )
        )
    ).scalars().all()
    for o in onboardings:
        tasks = (
            await db.execute(
                select(OnboardingTask).where(OnboardingTask.onboarding_id == o.id)
            )
        ).scalars().all()
        total_tasks += len(tasks)
        completed_tasks += sum(1 for t in tasks if t.status == TaskStatus.COMPLETED.value)

    return {
        "total_workflows": wf_count,
        "active_workflows": active_wf_count,
        "total_onboardings": total_onboardings,
        "onboarding_by_status": status_counts,
        "average_progress_pct": round(avg_progress, 1),
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
    }
