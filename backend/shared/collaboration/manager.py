"""Real-time collaboration manager for shared editing sessions."""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class UserState:
    """State of a user in a collaboration room."""
    user_id: str
    user_info: dict[str, Any]
    joined_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    cursor: dict[str, Any] | None = None
    selection: dict[str, Any] | None = None
    last_active: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class CollaborationRoom:
    """A collaboration room for real-time co-editing with cursors and presence."""
    room_id: str
    tenant_id: str
    users: dict[str, UserState] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    content_version: int = 0
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def add_user(self, user_id: str, user_info: dict[str, Any]) -> UserState:
        """Add a user to the room."""
        async with self._lock:
            user_state = UserState(user_id=user_id, user_info=user_info)
            self.users[user_id] = user_state
            return user_state

    async def remove_user(self, user_id: str) -> bool:
        """Remove a user from the room."""
        async with self._lock:
            if user_id in self.users:
                del self.users[user_id]
                return True
            return False

    async def update_cursor(self, user_id: str, cursor_data: dict[str, Any]) -> bool:
        """Update user's cursor position."""
        async with self._lock:
            if user_id in self.users:
                self.users[user_id].cursor = cursor_data
                self.users[user_id].last_active = datetime.now(timezone.utc)
                return True
            return False

    async def update_selection(self, user_id: str, selection: dict[str, Any]) -> bool:
        """Update user's text selection."""
        async with self._lock:
            if user_id in self.users:
                self.users[user_id].selection = selection
                self.users[user_id].last_active = datetime.now(timezone.utc)
                return True
            return False

    async def get_state(self) -> dict[str, Any]:
        """Get the current room state."""
        async with self._lock:
            return {
                "room_id": self.room_id,
                "tenant_id": self.tenant_id,
                "content_version": self.content_version,
                "created_at": self.created_at.isoformat(),
                "users": {
                    uid: {
                        "user_id": state.user_id,
                        "user_info": state.user_info,
                        "joined_at": state.joined_at.isoformat(),
                        "cursor": state.cursor,
                        "selection": state.selection,
                        "last_active": state.last_active.isoformat(),
                    }
                    for uid, state in self.users.items()
                },
                "user_count": len(self.users),
            }

    async def increment_version(self) -> int:
        """Increment and return the content version."""
        async with self._lock:
            self.content_version += 1
            return self.content_version

    def is_empty(self) -> bool:
        """Check if room has no users."""
        return len(self.users) == 0


class CollaborationManager:
    """Manages collaboration rooms with tenant isolation."""

    def __init__(self) -> None:
        self._rooms: dict[str, CollaborationRoom] = {}
        self._lock = asyncio.Lock()

    def _room_key(self, tenant_id: str, room_id: str) -> str:
        return f"tenant:{tenant_id}:room:{room_id}"

    async def create_room(self, room_id: str, tenant_id: str) -> CollaborationRoom:
        """Create a new collaboration room."""
        async with self._lock:
            key = self._room_key(tenant_id, room_id)
            if key in self._rooms:
                raise ValueError(f"Room {room_id} already exists for tenant {tenant_id}")
            room = CollaborationRoom(room_id=room_id, tenant_id=tenant_id)
            self._rooms[key] = room
            return room

    async def get_room(self, room_id: str, tenant_id: str) -> CollaborationRoom | None:
        """Get a collaboration room by ID."""
        async with self._lock:
            return self._rooms.get(self._room_key(tenant_id, room_id))

    async def delete_room(self, room_id: str, tenant_id: str) -> bool:
        """Delete a collaboration room."""
        async with self._lock:
            key = self._room_key(tenant_id, room_id)
            if key in self._rooms:
                del self._rooms[key]
                return True
            return False

    async def join_room(
        self, room_id: str, user_id: str, user_info: dict[str, Any], tenant_id: str
    ) -> UserState:
        """Join a collaboration room."""
        room = await self.get_room(room_id, tenant_id)
        if not room:
            raise ValueError(f"Room {room_id} not found for tenant {tenant_id}")
        return await room.add_user(user_id, user_info)

    async def leave_room(self, room_id: str, user_id: str, tenant_id: str) -> None:
        """Leave a collaboration room."""
        room = await self.get_room(room_id, tenant_id)
        if room:
            await room.remove_user(user_id)
            if room.is_empty():
                await self.delete_room(room_id, tenant_id)

    async def broadcast_cursor(
        self, room_id: str, user_id: str, cursor_data: dict[str, Any], tenant_id: str
    ) -> None:
        """Broadcast cursor position to room participants."""
        room = await self.get_room(room_id, tenant_id)
        if room:
            await room.update_cursor(user_id, cursor_data)

    async def broadcast_selection(
        self, room_id: str, user_id: str, selection: dict[str, Any], tenant_id: str
    ) -> None:
        """Broadcast text selection to room participants."""
        room = await self.get_room(room_id, tenant_id)
        if room:
            await room.update_selection(user_id, selection)

    async def get_room_state(self, room_id: str, tenant_id: str) -> dict[str, Any] | None:
        """Get the current state of a collaboration room."""
        room = await self.get_room(room_id, tenant_id)
        if room:
            return await room.get_state()
        return None

    async def list_rooms(self, tenant_id: str) -> list[dict[str, Any]]:
        """List all rooms for a tenant."""
        async with self._lock:
            prefix = f"tenant:{tenant_id}:room:"
            return [
                await room.get_state()
                for key, room in self._rooms.items()
                if key.startswith(prefix)
            ]

    async def reset(self) -> None:
        """Clear all rooms (for testing)."""
        async with self._lock:
            self._rooms.clear()


collaboration_manager = CollaborationManager()
