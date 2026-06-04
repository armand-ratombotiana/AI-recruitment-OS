"""Support Service — lightweight in-app ticket system."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field


# ── In-Memory Store ────────────────────────────────────────────────────────────

_tickets: dict[str, dict[str, Any]] = {}
_messages: dict[str, list[dict[str, Any]]] = {}


# ── Models ─────────────────────────────────────────────────────────────────────

TicketPriority = Literal["low", "normal", "high", "urgent"]
TicketStatus = Literal["open", "in_progress", "waiting_customer", "closed", "resolved"]
TicketCategory = Literal["bug", "feature_request", "billing", "account", "integration", "general"]


class TicketCreate(BaseModel):
    subject: str = Field(..., min_length=2, max_length=200)
    description: str = Field(..., min_length=1, max_length=5000)
    category: TicketCategory = "general"
    priority: TicketPriority = "normal"
    metadata: Optional[dict[str, Any]] = None


class TicketUpdate(BaseModel):
    subject: Optional[str] = None
    status: Optional[TicketStatus] = None
    priority: Optional[TicketPriority] = None
    category: Optional[TicketCategory] = None
    assigned_to: Optional[str] = None


class MessageCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)
    is_staff: bool = False
    attachments: Optional[list[str]] = None


class TicketMessage(BaseModel):
    id: str
    ticket_id: str
    author: str
    is_staff: bool
    body: str
    attachments: list[str] = []
    created_at: str


class Ticket(BaseModel):
    id: str
    subject: str
    description: str
    status: str
    priority: str
    category: str
    created_by: str
    assigned_to: Optional[str] = None
    created_at: str
    updated_at: str
    closed_at: Optional[str] = None
    message_count: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class TicketDetail(Ticket):
    messages: list[TicketMessage] = []


class TicketListResponse(BaseModel):
    data: list[Ticket]
    total: int


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "support"


# ── Helpers ────────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _user_key(authorization: Optional[str], x_user_id: Optional[str]) -> str:
    if x_user_id:
        return x_user_id
    if authorization:
        return f"auth_{hash(authorization) & 0xffff:04x}"
    return "anonymous"


def _to_ticket(t: dict[str, Any]) -> Ticket:
    return Ticket(
        id=t["id"],
        subject=t["subject"],
        description=t["description"],
        status=t["status"],
        priority=t["priority"],
        category=t["category"],
        created_by=t["created_by"],
        assigned_to=t.get("assigned_to"),
        created_at=t["created_at"],
        updated_at=t["updated_at"],
        closed_at=t.get("closed_at"),
        message_count=len(_messages.get(t["id"], [])),
        metadata=t.get("metadata", {}),
    )


# ── Router ─────────────────────────────────────────────────────────────────────


router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Support"])
async def health() -> HealthResponse:
    return HealthResponse()


@router.post("/tickets", response_model=Ticket, tags=["Support"])
async def create_ticket(
    data: TicketCreate,
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    ticket_id = f"tkt_{uuid.uuid4().hex[:14]}"
    now = _now().isoformat()
    user_key = _user_key(authorization, x_user_id)
    ticket = {
        "id": ticket_id,
        "subject": data.subject,
        "description": data.description,
        "status": "open",
        "priority": data.priority,
        "category": data.category,
        "created_by": user_key,
        "assigned_to": None,
        "created_at": now,
        "updated_at": now,
        "closed_at": None,
        "metadata": data.metadata or {},
    }
    _tickets[ticket_id] = ticket
    _messages[ticket_id] = [{
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "ticket_id": ticket_id,
        "author": user_key,
        "is_staff": False,
        "body": data.description,
        "attachments": [],
        "created_at": now,
    }]
    return _to_ticket(ticket)


@router.get("/tickets", response_model=TicketListResponse, tags=["Support"])
async def list_tickets(
    status_filter: Optional[TicketStatus] = Query(None, alias="status"),
    priority: Optional[TicketPriority] = Query(None),
    mine_only: bool = Query(True),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    user_key = _user_key(authorization, x_user_id)
    items = list(_tickets.values())
    if mine_only:
        items = [t for t in items if t["created_by"] == user_key]
    if status_filter:
        items = [t for t in items if t["status"] == status_filter]
    if priority:
        items = [t for t in items if t["priority"] == priority]
    items.sort(key=lambda t: t["updated_at"], reverse=True)
    return TicketListResponse(
        data=[_to_ticket(t) for t in items[offset : offset + limit]],
        total=len(items),
    )


@router.get("/tickets/{ticket_id}", response_model=TicketDetail, tags=["Support"])
async def get_ticket(ticket_id: str):
    if ticket_id not in _tickets:
        raise HTTPException(status_code=404, detail="Ticket not found")
    t = _tickets[ticket_id]
    messages = [TicketMessage(**m) for m in _messages.get(ticket_id, [])]
    base = _to_ticket(t).model_dump()
    return TicketDetail(**base, messages=messages)


@router.put("/tickets/{ticket_id}", response_model=Ticket, tags=["Support"])
async def update_ticket(ticket_id: str, data: TicketUpdate):
    if ticket_id not in _tickets:
        raise HTTPException(status_code=404, detail="Ticket not found")
    t = _tickets[ticket_id]
    updates = data.model_dump(exclude_unset=True)
    for k, v in updates.items():
        t[k] = v
    if data.status in ("closed", "resolved"):
        t["closed_at"] = _now().isoformat()
    t["updated_at"] = _now().isoformat()
    return _to_ticket(t)


@router.post("/tickets/{ticket_id}/messages", response_model=TicketMessage, tags=["Support"])
async def add_message(
    ticket_id: str,
    data: MessageCreate,
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    if ticket_id not in _tickets:
        raise HTTPException(status_code=404, detail="Ticket not found")
    msg = {
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "ticket_id": ticket_id,
        "author": "support_staff" if data.is_staff else _user_key(authorization, x_user_id),
        "is_staff": data.is_staff,
        "body": data.body,
        "attachments": data.attachments or [],
        "created_at": _now().isoformat(),
    }
    _messages.setdefault(ticket_id, []).append(msg)
    t = _tickets[ticket_id]
    t["updated_at"] = msg["created_at"]
    if data.is_staff and t["status"] == "open":
        t["status"] = "in_progress"
    return TicketMessage(**msg)


@router.post("/tickets/{ticket_id}/close", response_model=Ticket, tags=["Support"])
async def close_ticket(ticket_id: str, resolution: Optional[str] = Query(None)):
    if ticket_id not in _tickets:
        raise HTTPException(status_code=404, detail="Ticket not found")
    t = _tickets[ticket_id]
    t["status"] = "closed"
    now = _now().isoformat()
    t["closed_at"] = now
    t["updated_at"] = now
    if resolution:
        _messages.setdefault(ticket_id, []).append({
            "id": f"msg_{uuid.uuid4().hex[:12]}",
            "ticket_id": ticket_id,
            "author": "support_staff",
            "is_staff": True,
            "body": f"[Resolution] {resolution}",
            "attachments": [],
            "created_at": now,
        })
    return _to_ticket(t)


@router.post("/tickets/{ticket_id}/reopen", response_model=Ticket, tags=["Support"])
async def reopen_ticket(ticket_id: str):
    if ticket_id not in _tickets:
        raise HTTPException(status_code=404, detail="Ticket not found")
    t = _tickets[ticket_id]
    t["status"] = "open"
    t["closed_at"] = None
    t["updated_at"] = _now().isoformat()
    return _to_ticket(t)


@router.delete("/tickets/{ticket_id}", tags=["Support"])
async def delete_ticket(ticket_id: str):
    if ticket_id not in _tickets:
        raise HTTPException(status_code=404, detail="Ticket not found")
    _tickets.pop(ticket_id)
    _messages.pop(ticket_id, None)
    return {"id": ticket_id, "deleted": True}


@router.get("/stats", tags=["Support"])
async def get_stats(
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    user_key = _user_key(authorization, x_user_id)
    mine = [t for t in _tickets.values() if t["created_by"] == user_key]
    by_status = {}
    for t in mine:
        by_status[t["status"]] = by_status.get(t["status"], 0) + 1
    return {
        "total": len(mine),
        "by_status": by_status,
        "open": by_status.get("open", 0) + by_status.get("in_progress", 0),
    }
