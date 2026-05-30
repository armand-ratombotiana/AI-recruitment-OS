"""User Service — User account management and activity tracking."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "user"


class UserSummary(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    status: str


class UserListResponse(BaseModel):
    data: list[UserSummary]
    total: int


class UserDetailResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    status: str


class UserUpdateResponse(BaseModel):
    id: str
    updated: bool = True


class UserDeleteResponse(BaseModel):
    id: str
    deleted: bool = True


class ActivityEntry(BaseModel):
    action: str
    timestamp: str


class UserActivityResponse(BaseModel):
    user_id: str
    activity: list[ActivityEntry]


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Users"], summary="User service health check")
async def health():
    return HealthResponse()


@router.get("/", response_model=UserListResponse, tags=["Users"], summary="List all users",
            description="Retrieve a paginated list of users for the current tenant.")
async def list_users():
    return UserListResponse(data=[
        UserSummary(id="u1", email="admin@acme.com", full_name="Admin User", role="tenant_admin", status="active"),
        UserSummary(id="u2", email="recruiter@acme.com", full_name="Jane Recruiter", role="recruiter", status="active"),
    ], total=2)


@router.get("/{user_id}", response_model=UserDetailResponse, tags=["Users"], summary="Get user by ID")
async def get_user(user_id: str):
    return UserDetailResponse(id=user_id, email="user@acme.com", full_name="User Name", role="recruiter", status="active")


@router.put("/{user_id}", response_model=UserUpdateResponse, tags=["Users"], summary="Update user")
async def update_user(user_id: str):
    return UserUpdateResponse(id=user_id)


@router.delete("/{user_id}", response_model=UserDeleteResponse, tags=["Users"], summary="Delete user")
async def delete_user(user_id: str):
    return UserDeleteResponse(id=user_id)


@router.get("/{user_id}/activity", response_model=UserActivityResponse, tags=["Users"], summary="Get user activity log",
            description="Retrieve recent activity events for a user.")
async def get_user_activity(user_id: str):
    return UserActivityResponse(user_id=user_id, activity=[
        ActivityEntry(action="login", timestamp="2025-01-20T10:00:00Z"),
        ActivityEntry(action="viewed_candidate", timestamp="2025-01-20T10:05:00Z"),
    ])
