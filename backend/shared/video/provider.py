"""Video provider abstraction and mock implementation."""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from typing import Any


class VideoProvider(ABC):
    @abstractmethod
    async def create_room(self, participants: list[str], options: dict[str, Any] | None = None) -> str:
        ...

    @abstractmethod
    async def start_recording(self, room_id: str) -> str:
        ...

    @abstractmethod
    async def stop_recording(self, room_id: str) -> str:
        ...


class MockVideoProvider(VideoProvider):
    def __init__(self) -> None:
        self._rooms: dict[str, str] = {}
        self._recordings: dict[str, str] = {}

    async def create_room(self, participants: list[str], options: dict[str, Any] | None = None) -> str:
        room_id = str(uuid.uuid4())
        room_url = f"https://mock-video.test/rooms/{room_id}"
        self._rooms[room_id] = room_url
        return room_url

    async def start_recording(self, room_id: str) -> str:
        recording_id = str(uuid.uuid4())
        self._recordings[room_id] = recording_id
        return recording_id

    async def stop_recording(self, room_id: str) -> str:
        recording_id = self._recordings.pop(room_id, str(uuid.uuid4()))
        return f"https://mock-video.test/recordings/{recording_id}"
