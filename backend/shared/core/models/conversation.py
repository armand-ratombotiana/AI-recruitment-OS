"""Conversation domain — persistent chat history between users and AI agents.

A :class:`Conversation` is a tenant-scoped, user-owned thread tied to a
particular agent type (e.g. ``recruiting_copilot``, ``resume_screener``).
Each turn in the thread is stored as a :class:`ConversationMessage` row
with a role (``system | user | assistant``), the textual content, and a
free-form ``metadata`` JSON column for things like token counts, model
identifiers, latency, etc.

Both tables carry a ``tenant_id`` so list/get queries can be safely
scoped — see :mod:`apps.ai_orchestrator.main` for the HTTP endpoints
that exercise these models.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field as SQLField


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _new_id() -> str:
    return str(uuid.uuid4())


class Conversation(SQLModel, table=True):
    """A chat thread between a user and a specific AI agent.

    The ``agent_type`` matches one of the keys registered in
    :data:`apps.ai_orchestrator.agents.AGENT_REGISTRY` (or any of the
    deterministic-mock agent types declared in
    :data:`apps.ai_orchestrator.main.AGENTS_DB`).  Messages are stored
    in :class:`ConversationMessage` rather than as an embedded array so
    they can be paged and updated cheaply.
    """

    __tablename__ = "ai_conversations"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    user_id: Optional[str] = SQLField(default=None, index=True)
    agent_type: str = SQLField(index=True, nullable=False)
    title: str = SQLField(default="New conversation", nullable=False)
    created_at: datetime = SQLField(
        default_factory=_utcnow, nullable=False, index=True
    )
    updated_at: datetime = SQLField(default_factory=_utcnow, nullable=False)


class ConversationMessage(SQLModel, table=True):
    """One message inside a :class:`Conversation`.

    The Python attribute is named ``meta`` to avoid clashing with
    SQLAlchemy's reserved ``metadata`` declarative attribute — the
    underlying SQL column is still ``metadata`` to match the public
    contract documented in the orchestrator API.
    """

    __tablename__ = "ai_conversation_messages"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    conversation_id: str = SQLField(index=True, nullable=False)
    role: str = SQLField(index=True, nullable=False)
    content: str = SQLField(nullable=False)
    meta: dict[str, Any] = SQLField(
        default_factory=dict,
        sa_column=Column("metadata", JSON, nullable=False, default=dict),
        description="Free-form context: token counts, model id, latency, …",
    )
    created_at: datetime = SQLField(
        default_factory=_utcnow, nullable=False, index=True
    )


__all__ = ["Conversation", "ConversationMessage"]
