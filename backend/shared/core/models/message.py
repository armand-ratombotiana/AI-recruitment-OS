"""Candidate Messaging domain — Conversations and Messages between recruiters and candidates."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import SQLModel, Field as SQLField


class ConversationStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    CLOSED = "closed"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _new_id() -> str:
    return str(uuid.uuid4())


class Conversation(SQLModel, table=True):
    """A conversation thread between a recruiter (user) and a candidate."""

    __tablename__ = "conversations"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    candidate_id: str = SQLField(index=True, nullable=False)
    user_id: str = SQLField(index=True, nullable=False)
    subject: str = SQLField(default="", nullable=False)
    status: ConversationStatus = SQLField(
        default=ConversationStatus.ACTIVE, index=True, nullable=False
    )
    created_at: datetime = SQLField(
        default_factory=_utcnow, nullable=False, index=True
    )
    last_message_at: datetime = SQLField(
        default_factory=_utcnow, nullable=False, index=True
    )


class Message(SQLModel, table=True):
    """A single message within a conversation."""

    __tablename__ = "messages"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    conversation_id: str = SQLField(index=True, nullable=False)
    sender_id: str = SQLField(index=True, nullable=False)
    recipient_id: str = SQLField(index=True, nullable=False)
    content: str = SQLField(nullable=False)
    read: bool = SQLField(default=False, index=True, nullable=False)
    created_at: datetime = SQLField(
        default_factory=_utcnow, nullable=False, index=True
    )


# --- API Schemas ---


class ConversationCreate(SQLModel):
    candidate_id: str
    subject: str = ""
    initial_message: str = ""


class ConversationRead(SQLModel):
    id: str
    tenant_id: str
    candidate_id: str
    user_id: str
    subject: str
    status: ConversationStatus
    created_at: datetime
    last_message_at: datetime
    last_message_content: str | None = None
    unread_count: int = 0

    model_config = {"from_attributes": True}


class ConversationDetail(ConversationRead):
    messages: list["MessageRead"] = []


class MessageCreate(SQLModel):
    content: str


class MessageRead(SQLModel):
    id: str
    tenant_id: str
    conversation_id: str
    sender_id: str
    recipient_id: str
    content: str
    read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MarkReadRequest(SQLModel):
    pass  # No body needed


__all__ = [
    "Conversation",
    "Message",
    "ConversationStatus",
    "ConversationCreate",
    "ConversationRead",
    "ConversationDetail",
    "MessageCreate",
    "MessageRead",
    "MarkReadRequest",
]
