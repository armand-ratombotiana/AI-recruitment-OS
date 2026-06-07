"""Memory store + per-agent conversation memory for AI-ROS.

This module provides two layers of memory:

* :class:`MemoryStore` — a legacy short-/long-term key-value store used
  by older agents.  Kept around for backwards compatibility.
* :class:`AgentMemory` — an in-memory rolling buffer used by an agent
  during a single invocation (or for the lifetime of a conversation).
  Each entry is a :class:`MemoryEntry` with a role, content, timestamp
  and free-form metadata dict.

``AgentMemory`` deliberately implements a simple truncation strategy:
the first ``system`` message (if any) is always kept, and the most
recent ``max_entries`` user/assistant turns are kept after it.  This is
the right default for chat-style agents that want to preserve the
instruction prompt across long conversations while still bounding token
usage.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable, Literal


# ── Legacy store (kept for backwards compatibility) ────────────────────────────


class MemoryStore:
    def __init__(self):
        self.short_term: dict[str, Any] = {}
        self.long_term: dict[str, Any] = {}

    async def store_short_term(self, key: str, value: Any, ttl: int = 3600) -> None:
        self.short_term[key] = value

    async def get_short_term(self, key: str) -> Any | None:
        return self.short_term.get(key)

    async def store_long_term(self, entity_id: str, content: str, metadata: dict[str, Any], tenant_id: str) -> str:
        memory_id = f"ltm_{entity_id}"
        self.long_term[memory_id] = {"content": content, "metadata": metadata, "tenant_id": tenant_id}
        return memory_id

    async def recall(self, query: str, tenant_id: str, limit: int = 10) -> list[dict[str, Any]]:
        return []

    async def store_interview_memory(self, interview_id: str, transcript: list[dict], summary: str, tenant_id: str) -> None:
        await self.store_long_term(f"interview_{interview_id}", summary, {"type": "interview"}, tenant_id)

    async def store_candidate_memory(self, candidate_id: str, event_type: str, data: dict[str, Any], tenant_id: str) -> None:
        await self.store_long_term(f"candidate_{candidate_id}", f"{event_type}: {data}", {"type": "candidate"}, tenant_id)


memory_store = MemoryStore()


# ── Conversation memory ───────────────────────────────────────────────────────


Role = Literal["system", "user", "assistant"]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class MemoryEntry:
    """One turn in an agent conversation.

    Attributes
    ----------
    role
        ``"system"``, ``"user"`` or ``"assistant"`` — matches the role
        names expected by the OpenAI / chat-completions style APIs.
    content
        The textual payload of the turn.
    timestamp
        UTC datetime at which the entry was added.
    metadata
        Free-form bag for caller-supplied annotations (e.g. token counts,
        model name, latency, tool calls, …).
    """

    role: Role
    content: str
    timestamp: datetime = field(default_factory=_utcnow)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "role": self.role,
            "content": self.content,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "metadata": dict(self.metadata),
        }

    def to_message(self) -> dict[str, str]:
        """Render in the ``{"role": ..., "content": ...}`` shape used by LLM SDKs."""
        return {"role": self.role, "content": self.content}


_VALID_ROLES: frozenset[str] = frozenset({"system", "user", "assistant"})


class AgentMemory:
    """In-memory conversation context for a single agent invocation.

    The buffer keeps the very first ``system`` entry pinned at the head
    (so the agent's instructions are never evicted) and rolls a sliding
    window of the most recent user/assistant turns.

    Parameters
    ----------
    max_entries
        Maximum number of *non-system* entries to retain.  Older entries
        are dropped (oldest-first) when the buffer is full.  Defaults to
        20 which gives ~10 turns of back-and-forth.
    seed
        Optional iterable of entries (or ``{role, content, ...}`` dicts)
        to pre-populate the buffer with.  Useful when rehydrating from
        the database.
    """

    def __init__(
        self,
        max_entries: int = 20,
        *,
        seed: Iterable[MemoryEntry | dict[str, Any]] | None = None,
    ) -> None:
        if max_entries < 1:
            raise ValueError("max_entries must be >= 1")
        self._max_entries = int(max_entries)
        self._entries: list[MemoryEntry] = []
        if seed:
            for item in seed:
                if isinstance(item, MemoryEntry):
                    self._entries.append(item)
                else:
                    self._entries.append(self._coerce(item))
            self._truncate()

    # ── Mutation ──────────────────────────────────────────────────────────

    def add(
        self,
        role: Role,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> MemoryEntry:
        """Append a new entry and (lazily) enforce the truncation policy.

        Returns the appended :class:`MemoryEntry` so callers can capture
        the timestamp.  Raises :class:`ValueError` on an unknown role or
        an empty content string.
        """
        if role not in _VALID_ROLES:
            raise ValueError(
                f"invalid role {role!r}; must be one of {sorted(_VALID_ROLES)}"
            )
        if content is None:
            raise ValueError("content must not be None")
        text = str(content)
        if not text.strip():
            raise ValueError("content must not be empty")

        entry = MemoryEntry(
            role=role,
            content=text,
            timestamp=_utcnow(),
            metadata=dict(metadata or {}),
        )
        self._entries.append(entry)
        self._truncate()
        return entry

    def clear(self) -> None:
        """Drop every entry — including any pinned system prompt."""
        self._entries.clear()

    # ── Read ──────────────────────────────────────────────────────────────

    def __len__(self) -> int:
        return len(self._entries)

    @property
    def max_entries(self) -> int:
        return self._max_entries

    @property
    def entries(self) -> list[MemoryEntry]:
        """A defensive copy of the current entries (oldest first)."""
        return list(self._entries)

    def get_recent(self, n: int = 10) -> list[MemoryEntry]:
        """Return up to ``n`` most-recent entries (oldest first within the slice).

        The very first system entry, if present, is always included even
        when it falls outside the ``n``-window — agents need their
        instructions to keep behaving consistently.
        """
        if n < 0:
            raise ValueError("n must be >= 0")
        if n == 0:
            return []
        recent = self._entries[-n:]
        head = self._first_system_entry()
        if head is not None and head not in recent:
            return [head, *recent]
        return list(recent)

    def get_messages(self, n: int | None = None) -> list[dict[str, str]]:
        """Return entries rendered as ``[{"role": ..., "content": ...}]`` for an LLM call."""
        if n is None:
            source = self._entries
        else:
            source = self.get_recent(n)
        return [e.to_message() for e in source]

    def get_summary(self) -> dict[str, Any]:
        """Return a small dict describing the buffer (used in logs / debug endpoints)."""
        counts: dict[str, int] = {"system": 0, "user": 0, "assistant": 0}
        for entry in self._entries:
            counts[entry.role] = counts.get(entry.role, 0) + 1
        total_chars = sum(len(e.content) for e in self._entries)
        first = self._entries[0] if self._entries else None
        last = self._entries[-1] if self._entries else None
        return {
            "total_entries": len(self._entries),
            "max_entries": self._max_entries,
            "counts": counts,
            "total_chars": total_chars,
            "first_at": first.timestamp.isoformat() if first else None,
            "last_at": last.timestamp.isoformat() if last else None,
        }

    def to_list(self) -> list[dict[str, Any]]:
        """Serialise the buffer to a list of JSON-safe dicts."""
        return [e.to_dict() for e in self._entries]

    # ── Internal helpers ──────────────────────────────────────────────────

    def _first_system_entry(self) -> MemoryEntry | None:
        for entry in self._entries:
            if entry.role == "system":
                return entry
        return None

    def _truncate(self) -> None:
        """Enforce: keep the first system entry + the last ``max_entries`` non-system entries."""
        head = self._first_system_entry()
        non_system = [e for e in self._entries if e is not head]
        if len(non_system) <= self._max_entries:
            return
        kept_tail = non_system[-self._max_entries:]
        self._entries = ([head] if head is not None else []) + kept_tail

    @staticmethod
    def _coerce(item: dict[str, Any]) -> MemoryEntry:
        role = item.get("role")
        if role not in _VALID_ROLES:
            raise ValueError(
                f"invalid seed entry role {role!r}; must be one of {sorted(_VALID_ROLES)}"
            )
        ts_raw = item.get("timestamp")
        if isinstance(ts_raw, datetime):
            ts = ts_raw
        elif isinstance(ts_raw, str) and ts_raw:
            try:
                ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
            except ValueError:
                ts = _utcnow()
        else:
            ts = _utcnow()
        return MemoryEntry(
            role=role,  # type: ignore[arg-type]
            content=str(item.get("content") or ""),
            timestamp=ts,
            metadata=dict(item.get("metadata") or {}),
        )


__all__ = [
    "AgentMemory",
    "MemoryEntry",
    "MemoryStore",
    "memory_store",
]
