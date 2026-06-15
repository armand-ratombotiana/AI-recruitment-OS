"""Push notification provider abstraction."""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)


class PushNotificationProvider(ABC):
    @abstractmethod
    async def send_push(
        self,
        device_token: str,
        title: str,
        body: str,
        data: dict[str, Any] | None = None,
    ) -> bool: ...

    async def send_push_to_user(
        self,
        user_id: str,
        title: str,
        body: str,
        data: dict[str, Any] | None = None,
    ) -> list[bool]:
        return []

    @abstractmethod
    async def register_device(
        self,
        user_id: str,
        device_token: str,
        platform: str,
    ) -> str: ...

    @abstractmethod
    async def unregister_device(self, device_token: str) -> bool: ...


class MockPushProvider(PushNotificationProvider):
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []
        self.devices: dict[str, dict[str, Any]] = {}
        self._counter = 0

    async def send_push(
        self,
        device_token: str,
        title: str,
        body: str,
        data: dict[str, Any] | None = None,
    ) -> bool:
        self.sent.append({
            "device_token": device_token,
            "title": title,
            "body": body,
            "data": data or {},
        })
        logger.info("MockPush: sent push to %s — %s", device_token, title)
        return True

    async def send_push_to_user(
        self,
        user_id: str,
        title: str,
        body: str,
        data: dict[str, Any] | None = None,
    ) -> list[bool]:
        tokens = [
            d["device_token"]
            for d in self.devices.values()
            if d["user_id"] == user_id
        ]
        results: list[bool] = []
        for token in tokens:
            ok = await self.send_push(token, title, body, data)
            results.append(ok)
        return results

    async def register_device(
        self,
        user_id: str,
        device_token: str,
        platform: str,
    ) -> str:
        self._counter += 1
        device_id = f"mock-device-{self._counter}"
        self.devices[device_token] = {
            "device_id": device_id,
            "user_id": user_id,
            "platform": platform,
        }
        return device_id

    async def unregister_device(self, device_token: str) -> bool:
        if device_token in self.devices:
            del self.devices[device_token]
            return True
        return False


_provider: PushNotificationProvider | None = None


def get_push_provider() -> PushNotificationProvider:
    global _provider
    if _provider is None:
        _provider = MockPushProvider()
    return _provider


def set_push_provider(provider: PushNotificationProvider) -> None:
    global _provider
    _provider = provider
