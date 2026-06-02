"""User Service — User account management and activity tracking."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


# ── In-Memory Store ─────────────────────────────────────────────────────────────

_users: dict[str, dict[str, Any]] = {}
_user_activity: dict[str, list[dict[str, Any]]] = {}


# ── Request Models ──────────────────────────────────────────────────────────────

class UserCreateRequest(BaseModel):
    email: str = Field(..., description="User email")
    full_name: str = Field(..., min_length=1, description="Full name")
    role: str = Field(default="recruiter", description="user | recruiter | tenant_admin | super_admin")
    password: str = Field(default="", description="Password (hashed in production)")


class UserUpdateRequest(BaseModel):
    email: str | None = Field(None, description="User email")
    full_name: str | None = Field(None, description="Full name")
    role: str | None = Field(None, description="User role")
    status: str | None = Field(None, description="active | suspended | deleted")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "user"


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Users"])
async def health():
    return HealthResponse()


@router.get("/", tags=["Users"], summary="List all users")
async def list_users():
    items = [
        {"id": u["id"], "email": u["email"], "full_name": u["full_name"], "role": u["role"], "status": u["status"]}
        for u in _users.values()
    ]
    return {"data": items, "total": len(items)}


@router.post("/", tags=["Users"], summary="Create user")
async def create_user(data: UserCreateRequest):
    user_id = f"u_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    user = {
        "id": user_id, "email": data.email, "full_name": data.full_name,
        "role": data.role, "status": "active", "created_at": now, "updated_at": now,
    }
    _users[user_id] = user
    _user_activity[user_id] = [{"action": "account_created", "timestamp": now}]
    return {"id": user_id, "email": data.email, "full_name": data.full_name, "role": data.role, "created": True}


@router.get("/{user_id}", tags=["Users"], summary="Get user by ID")
async def get_user(user_id: str):
    if user_id not in _users:
        raise HTTPException(status_code=404, detail="User not found")
    u = _users[user_id]
    return {"id": u["id"], "email": u["email"], "full_name": u["full_name"], "role": u["role"], "status": u["status"]}


@router.put("/{user_id}", tags=["Users"], summary="Update user")
async def update_user(user_id: str, data: UserUpdateRequest):
    if user_id not in _users:
        raise HTTPException(status_code=404, detail="User not found")
    now = datetime.now(timezone.utc).isoformat()
    if data.email is not None:
        _users[user_id]["email"] = data.email
    if data.full_name is not None:
        _users[user_id]["full_name"] = data.full_name
    if data.role is not None:
        _users[user_id]["role"] = data.role
    if data.status is not None:
        _users[user_id]["status"] = data.status
    _users[user_id]["updated_at"] = now
    _user_activity.setdefault(user_id, []).append({"action": "profile_updated", "timestamp": now})
    return {"id": user_id, "updated": True}


@router.delete("/{user_id}", tags=["Users"], summary="Delete user")
async def delete_user(user_id: str):
    if user_id not in _users:
        raise HTTPException(status_code=404, detail="User not found")
    del _users[user_id]
    _user_activity.pop(user_id, None)
    return {"id": user_id, "deleted": True}


@router.get("/{user_id}/activity", tags=["Users"], summary="Get user activity log")
async def get_user_activity(user_id: str):
    if user_id not in _users:
        raise HTTPException(status_code=404, detail="User not found")
    activity = _user_activity.get(user_id, [])
    return {"user_id": user_id, "activity": activity}
