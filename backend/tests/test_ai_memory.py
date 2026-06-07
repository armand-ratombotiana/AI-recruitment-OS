"""Tests for AI agent memory + conversation history endpoints.

Covers:

1.  ``AgentMemory``: add / get_recent / get_summary / clear
2.  Truncation strategy keeps the first system message and drops the
    oldest user/assistant turns
3.  ``MemoryEntry`` round-trips through ``to_dict`` cleanly
4.  Creating a conversation via the API
5.  Adding a message and receiving a contextual AI response
6.  Listing the current user's conversations
7.  Getting a conversation with all of its messages in order
8.  Deleting a conversation removes its messages too
9.  Tenant isolation: tenant A cannot see / modify tenant B's threads
10. Unauthenticated callers cannot list, create, or modify conversations
11. Creating a conversation with an unsupported agent type returns 404
12. The agent receives the full prior message window as context
13. Persisted message metadata round-trips through the database
14. ``updated_at`` advances after a new message is posted
15. Context window size is honoured when feeding the agent
"""
from __future__ import annotations

import asyncio
import os
import sys
from typing import AsyncGenerator
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, select

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.ai.memory import AgentMemory, MemoryEntry
from shared.core.database import get_db_dependency
from shared.core.models.conversation import Conversation, ConversationMessage
from shared.core.security import create_access_token


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_token(tenant_id: str, sub: str = "user", role: str = "admin") -> str:
    return create_access_token(
        {
            "sub": sub,
            "email": f"{sub}@{tenant_id}.test",
            "role": role,
            "tenant_id": tenant_id,
        }
    )


def _auth(tenant_id: str, sub: str = "user", role: str = "admin") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def ai_client(engine) -> AsyncGenerator[AsyncClient, None]:
    """Spin up the AI orchestrator router with an in-memory DB."""
    from apps.ai_orchestrator.main import router

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/ai")

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override_db():
        async with factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_db_dependency] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ─────────────────────────────────────────────────────────────────────────────
# Group 1 — AgentMemory unit tests
# ─────────────────────────────────────────────────────────────────────────────


def test_agent_memory_add_and_get_recent():
    mem = AgentMemory(max_entries=10)
    mem.add("system", "You are a helpful recruiter assistant.")
    mem.add("user", "Find me a senior Python engineer.")
    mem.add("assistant", "Here are some candidates.")
    assert len(mem) == 3
    recent = mem.get_recent(2)
    # System is always pinned, so the slice includes it + the last 2.
    assert recent[0].role == "system"
    assert recent[-1].role == "assistant"
    assert recent[-2].role == "user"


def test_agent_memory_get_summary_counts_roles():
    mem = AgentMemory(max_entries=10)
    mem.add("system", "Prompt")
    for i in range(3):
        mem.add("user", f"u{i}")
        mem.add("assistant", f"a{i}")
    summary = mem.get_summary()
    assert summary["total_entries"] == 7
    assert summary["counts"]["system"] == 1
    assert summary["counts"]["user"] == 3
    assert summary["counts"]["assistant"] == 3
    assert summary["total_chars"] > 0
    assert summary["first_at"] is not None
    assert summary["last_at"] is not None


def test_agent_memory_clear_drops_everything():
    mem = AgentMemory()
    mem.add("system", "p")
    mem.add("user", "hello")
    mem.clear()
    assert len(mem) == 0
    assert mem.get_recent(5) == []


def test_agent_memory_truncation_keeps_system_and_last_n():
    mem = AgentMemory(max_entries=3)
    mem.add("system", "SYSTEM-PROMPT")
    for i in range(10):
        mem.add("user", f"u{i}")
    # After truncation: system + last 3 user messages
    entries = mem.entries
    assert len(entries) == 4
    assert entries[0].role == "system"
    assert entries[0].content == "SYSTEM-PROMPT"
    assert [e.content for e in entries[1:]] == ["u7", "u8", "u9"]


def test_agent_memory_rejects_invalid_role():
    mem = AgentMemory()
    with pytest.raises(ValueError):
        mem.add("not-a-role", "hi")  # type: ignore[arg-type]


def test_memory_entry_to_dict_roundtrip():
    entry = MemoryEntry(role="user", content="hello", metadata={"k": "v"})
    d = entry.to_dict()
    assert d["role"] == "user"
    assert d["content"] == "hello"
    assert d["metadata"] == {"k": "v"}
    assert d["timestamp"] is not None
    # The "messages" projection is what we feed to LLM SDKs.
    msg = entry.to_message()
    assert msg == {"role": "user", "content": "hello"}


# ─────────────────────────────────────────────────────────────────────────────
# Group 2 — Conversation HTTP endpoints
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_conversation_returns_201_with_metadata(ai_client):
    r = await ai_client.post(
        "/api/v1/ai/conversations",
        json={"agent_type": "recruiting_copilot", "title": "Sourcing plan"},
        headers=_auth("tenant-A", "alice", "admin"),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["agent_type"] == "recruiting_copilot"
    assert body["title"] == "Sourcing plan"
    assert body["tenant_id"] == "tenant-A"
    assert body["user_id"] == "alice"
    assert body["message_count"] == 0
    assert body["id"]


@pytest.mark.asyncio
async def test_create_conversation_unknown_agent_returns_404(ai_client):
    r = await ai_client.post(
        "/api/v1/ai/conversations",
        json={"agent_type": "nonexistent_agent"},
        headers=_auth("tenant-A", "alice"),
    )
    assert r.status_code == 404
    assert "nonexistent_agent" in r.json()["detail"]


@pytest.mark.asyncio
async def test_create_conversation_requires_auth(ai_client):
    r = await ai_client.post(
        "/api/v1/ai/conversations",
        json={"agent_type": "recruiting_copilot"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_add_message_creates_user_and_assistant_messages(ai_client, db_session_factory):
    create = await ai_client.post(
        "/api/v1/ai/conversations",
        json={"agent_type": "recruiting_copilot"},
        headers=_auth("tenant-A", "alice"),
    )
    assert create.status_code == 201
    conv_id = create.json()["id"]

    r = await ai_client.post(
        f"/api/v1/ai/conversations/{conv_id}/messages",
        json={"content": "Draft me an outreach email", "metadata": {"job_id": "j1"}},
        headers=_auth("tenant-A", "alice"),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["conversation_id"] == conv_id
    assert body["user_message"]["role"] == "user"
    assert body["user_message"]["content"] == "Draft me an outreach email"
    assert body["user_message"]["metadata"]["job_id"] == "j1"
    assert body["assistant_message"]["role"] == "assistant"
    assert body["assistant_message"]["content"]

    # Both rows should be in the database.
    async with db_session_factory() as session:
        rows = (
            await session.execute(
                select(ConversationMessage)
                .where(ConversationMessage.conversation_id == conv_id)
                .order_by(ConversationMessage.created_at.asc())
            )
        ).scalars().all()
    assert [r.role for r in rows] == ["user", "assistant"]
    assert rows[0].meta.get("job_id") == "j1"


@pytest.mark.asyncio
async def test_get_conversation_returns_messages_in_order(ai_client):
    headers = _auth("tenant-A", "alice")
    create = await ai_client.post(
        "/api/v1/ai/conversations",
        json={"agent_type": "recruiting_copilot"},
        headers=headers,
    )
    conv_id = create.json()["id"]
    for i in range(3):
        # Make sure created_at strictly increases so ordering is unambiguous.
        await asyncio.sleep(0.01)
        await ai_client.post(
            f"/api/v1/ai/conversations/{conv_id}/messages",
            json={"content": f"Message {i}"},
            headers=headers,
        )

    r = await ai_client.get(
        f"/api/v1/ai/conversations/{conv_id}", headers=headers
    )
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == conv_id
    assert body["message_count"] == 6  # 3 user + 3 assistant
    contents = [m["content"] for m in body["messages"] if m["role"] == "user"]
    assert contents == ["Message 0", "Message 1", "Message 2"]


@pytest.mark.asyncio
async def test_list_conversations_returns_only_caller_threads(ai_client):
    a = _auth("tenant-A", "alice")
    b_same_tenant = _auth("tenant-A", "bob")  # different user, same tenant

    for _ in range(2):
        await ai_client.post(
            "/api/v1/ai/conversations",
            json={"agent_type": "recruiting_copilot"},
            headers=a,
        )
    await ai_client.post(
        "/api/v1/ai/conversations",
        json={"agent_type": "recruiting_copilot"},
        headers=b_same_tenant,
    )

    r_alice = await ai_client.get("/api/v1/ai/conversations", headers=a)
    r_bob = await ai_client.get("/api/v1/ai/conversations", headers=b_same_tenant)
    assert r_alice.json()["total"] == 2
    assert r_bob.json()["total"] == 1
    for row in r_alice.json()["data"]:
        assert row["user_id"] == "alice"


@pytest.mark.asyncio
async def test_delete_conversation_removes_messages_too(ai_client, db_session_factory):
    headers = _auth("tenant-A", "alice")
    create = await ai_client.post(
        "/api/v1/ai/conversations",
        json={"agent_type": "recruiting_copilot"},
        headers=headers,
    )
    conv_id = create.json()["id"]
    await ai_client.post(
        f"/api/v1/ai/conversations/{conv_id}/messages",
        json={"content": "hello"},
        headers=headers,
    )

    r = await ai_client.delete(
        f"/api/v1/ai/conversations/{conv_id}", headers=headers
    )
    assert r.status_code == 200
    assert r.json()["deleted"] is True
    assert r.json()["messages_deleted"] == 2

    async with db_session_factory() as session:
        conv = (
            await session.execute(
                select(Conversation).where(Conversation.id == conv_id)
            )
        ).scalar_one_or_none()
        msgs = (
            await session.execute(
                select(ConversationMessage).where(
                    ConversationMessage.conversation_id == conv_id
                )
            )
        ).scalars().all()
    assert conv is None
    assert msgs == []


@pytest.mark.asyncio
async def test_tenant_isolation_get_and_delete(ai_client):
    a = _auth("tenant-A", "alice")
    b = _auth("tenant-B", "bob")

    create = await ai_client.post(
        "/api/v1/ai/conversations",
        json={"agent_type": "recruiting_copilot"},
        headers=a,
    )
    conv_id = create.json()["id"]

    # Cross-tenant fetch must 404
    cross_get = await ai_client.get(
        f"/api/v1/ai/conversations/{conv_id}", headers=b
    )
    assert cross_get.status_code == 404

    # Cross-tenant delete must 404
    cross_del = await ai_client.delete(
        f"/api/v1/ai/conversations/{conv_id}", headers=b
    )
    assert cross_del.status_code == 404

    # Cross-tenant message add must 404
    cross_msg = await ai_client.post(
        f"/api/v1/ai/conversations/{conv_id}/messages",
        json={"content": "hi"},
        headers=b,
    )
    assert cross_msg.status_code == 404

    # Owner can still see / modify it
    own = await ai_client.get(f"/api/v1/ai/conversations/{conv_id}", headers=a)
    assert own.status_code == 200


@pytest.mark.asyncio
async def test_agent_receives_prior_context_window(ai_client):
    """The assistant's metadata should reflect the number of prior turns it saw."""
    headers = _auth("tenant-A", "alice")
    create = await ai_client.post(
        "/api/v1/ai/conversations",
        json={"agent_type": "recruiting_copilot"},
        headers=headers,
    )
    conv_id = create.json()["id"]

    # Send three turns; the third call should see 2 prior user + 2 prior assistant turns.
    for i in range(2):
        await ai_client.post(
            f"/api/v1/ai/conversations/{conv_id}/messages",
            json={"content": f"prior {i}"},
            headers=headers,
        )

    final = await ai_client.post(
        f"/api/v1/ai/conversations/{conv_id}/messages",
        json={"content": "final question", "context_window": 10},
        headers=headers,
    )
    assert final.status_code == 201
    body = final.json()
    # We fed back the prior 4 messages + the brand-new user message.
    assert body["context_used"] >= 4
    reply = body["assistant_message"]["content"]
    # Fallback embeds the prior counts directly; check they are non-zero.
    assert "prior user" in reply
    assert "0 prior user" not in reply


@pytest.mark.asyncio
async def test_message_metadata_persists(ai_client, db_session_factory):
    headers = _auth("tenant-A", "alice")
    create = await ai_client.post(
        "/api/v1/ai/conversations",
        json={"agent_type": "recruiting_copilot"},
        headers=headers,
    )
    conv_id = create.json()["id"]

    r = await ai_client.post(
        f"/api/v1/ai/conversations/{conv_id}/messages",
        json={
            "content": "Summarise this candidate",
            "metadata": {"candidate_id": "c-42", "intent": "summarise"},
        },
        headers=headers,
    )
    assert r.status_code == 201

    async with db_session_factory() as session:
        user_msg = (
            await session.execute(
                select(ConversationMessage)
                .where(ConversationMessage.conversation_id == conv_id)
                .where(ConversationMessage.role == "user")
            )
        ).scalar_one()
    assert user_msg.meta == {"candidate_id": "c-42", "intent": "summarise"}


@pytest.mark.asyncio
async def test_conversation_updated_at_advances_after_message(ai_client):
    headers = _auth("tenant-A", "alice")
    create = await ai_client.post(
        "/api/v1/ai/conversations",
        json={"agent_type": "recruiting_copilot"},
        headers=headers,
    )
    conv_id = create.json()["id"]
    initial_updated = create.json()["updated_at"]

    await asyncio.sleep(0.05)
    await ai_client.post(
        f"/api/v1/ai/conversations/{conv_id}/messages",
        json={"content": "hello again"},
        headers=headers,
    )
    after = await ai_client.get(
        f"/api/v1/ai/conversations/{conv_id}", headers=headers
    )
    assert after.json()["updated_at"] >= initial_updated
    assert after.json()["updated_at"] != initial_updated


@pytest.mark.asyncio
async def test_context_window_limit_is_honoured(ai_client):
    """When context_window=1 the agent should only see the new user turn (+ no prior pairs)."""
    headers = _auth("tenant-A", "alice")
    create = await ai_client.post(
        "/api/v1/ai/conversations",
        json={"agent_type": "recruiting_copilot"},
        headers=headers,
    )
    conv_id = create.json()["id"]
    for i in range(5):
        await ai_client.post(
            f"/api/v1/ai/conversations/{conv_id}/messages",
            json={"content": f"earlier {i}"},
            headers=headers,
        )

    final = await ai_client.post(
        f"/api/v1/ai/conversations/{conv_id}/messages",
        json={"content": "now", "context_window": 1},
        headers=headers,
    )
    assert final.status_code == 201
    # context_used reflects how many messages were passed to the agent —
    # the window of 1 should return at most a small slice.
    assert final.json()["context_used"] <= 2
