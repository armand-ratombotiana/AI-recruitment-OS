"""Tests for the real-time WebSocket broadcaster and dashboard endpoint.

These tests cover:
  1. JWT-authenticated WebSocket connection
  2. Connection rejection when the JWT is missing or invalid
  3. Event broadcasting via :class:`Broadcaster.broadcast` / :meth:`send_to_user`
  4. Per-channel subscribe / unsubscribe on the dashboard endpoint
  5. Tenant isolation across concurrent connections

Implementation notes
--------------------

The dashboard WebSocket lives inside a FastAPI :class:`TestClient`, which
drives the ASGI app on a dedicated event loop running in a worker thread.
All async work that has to share state with the open WebSocket
(``broadcaster.broadcast``, ``broadcaster.send_to_user`` …) is therefore
routed through ``client.portal`` so that the asyncio primitives inside the
broadcaster (notably :class:`asyncio.Lock`) stay bound to a single loop.
"""
from __future__ import annotations

import os
import sys
from typing import Iterator
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Ensure the backend directory is importable when pytest is run from the
# repository root with an explicit `tests/test_realtime.py` path.
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.dirname(_THIS_DIR)
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)


from shared.core.security import create_access_token  # noqa: E402
from shared.realtime.broadcaster import broadcaster  # noqa: E402


# ── Markers & shared fixtures ───────────────────────────────────────────────

pytestmark = [pytest.mark.integration, pytest.mark.realtime]


# ── App / client fixtures ──────────────────────────────────────────────────


@pytest.fixture
def app() -> FastAPI:
    """Minimal FastAPI app exposing only the websocket service router."""
    from apps.websocket_service.main import router

    application = FastAPI()
    application.include_router(router, prefix="/api/v1/ws")
    return application


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    """Synchronous TestClient — required for WebSocket support in starlette.

    Uses the client's own :class:`anyio.from_thread.BlockingPortal` to drive
    the broadcaster so all asyncio state stays on a single loop.
    """
    with TestClient(app) as c:
        c.portal.call(broadcaster.reset)
        yield c
        c.portal.call(broadcaster.reset)


# ── JWT helpers ─────────────────────────────────────────────────────────────


def _make_token(
    user_id: str | None = None,
    tenant_id: str = "tenant-test",
) -> str:
    sub = user_id or f"user-{uuid4().hex[:8]}"
    return create_access_token(
        {"sub": sub, "tenant_id": tenant_id, "email": f"{sub}@example.com", "role": "recruiter"}
    )


def _bad_token() -> str:
    """A syntactically valid JWT signed with the wrong key."""
    from jose import jwt

    return jwt.encode(
        {"sub": "u", "tenant_id": "t", "type": "access"},
        "this-is-the-wrong-secret-key-32-chars!!",
        algorithm="HS256",
    )


# ── 1. JWT-authenticated connection ────────────────────────────────────────


class TestDashboardConnectionAuth:
    def test_connection_accepted_with_valid_jwt(self, client: TestClient):
        token = _make_token(user_id="alice", tenant_id="acme")
        with client.websocket_connect(f"/api/v1/ws/dashboard?token={token}") as ws:
            welcome = ws.receive_json()
        assert welcome["type"] == "connected"
        assert welcome["user_id"] == "alice"
        assert welcome["tenant_id"] == "acme"
        assert "connection_id" in welcome and welcome["connection_id"]
        # The broadcaster should have cleaned up the connection on exit.
        assert client.portal.call(broadcaster.connection_count, "alice") == 0

    def test_connection_rejected_without_token(self, client: TestClient):
        with pytest.raises(Exception):
            with client.websocket_connect("/api/v1/ws/dashboard") as ws:
                ws.receive_json()

    def test_connection_rejected_with_invalid_token(self, client: TestClient):
        with pytest.raises(Exception):
            with client.websocket_connect(f"/api/v1/ws/dashboard?token={_bad_token()}") as ws:
                ws.receive_json()

    def test_connection_rejected_with_refresh_token(self, client: TestClient):
        # A refresh token must NOT be accepted as an access token.
        from shared.core.security import create_refresh_token

        refresh = create_refresh_token({"sub": "alice", "tenant_id": "acme"})
        with pytest.raises(Exception):
            with client.websocket_connect(f"/api/v1/ws/dashboard?token={refresh}") as ws:
                ws.receive_json()


# ── 2. Pure Broadcaster unit tests (in-process fake WebSockets) ───────────


class TestBroadcasterBroadcast:
    def test_broadcast_fan_out_to_all_tenants(self, client: TestClient):
        from starlette.websockets import WebSocketState

        class FakeWebSocket:
            def __init__(self) -> None:
                self.client_state = WebSocketState.CONNECTED
                self.sent: list[dict] = []

            async def accept(self) -> None:
                self.client_state = WebSocketState.CONNECTED

            async def send_json(self, data) -> None:
                self.sent.append(data)

        ws_a = FakeWebSocket()
        ws_b = FakeWebSocket()
        client.portal.call(broadcaster.connect, "alice", ws_a, tenant_id="t1")
        client.portal.call(broadcaster.connect, "bob", ws_b, tenant_id="t2")

        n = client.portal.call(broadcaster.broadcast, "candidate.created", {"id": "c1"})
        assert n == 2
        assert ws_a.sent == [{"event": "candidate.created", "data": {"id": "c1"}}]
        assert ws_b.sent == [{"event": "candidate.created", "data": {"id": "c1"}}]

    def test_broadcast_respects_tenant_filter(self, client: TestClient):
        from starlette.websockets import WebSocketState

        class FakeWebSocket:
            def __init__(self) -> None:
                self.client_state = WebSocketState.CONNECTED
                self.sent: list[dict] = []

            async def accept(self) -> None:
                self.client_state = WebSocketState.CONNECTED

            async def send_json(self, data) -> None:
                self.sent.append(data)

        ws_a = FakeWebSocket()
        ws_b = FakeWebSocket()
        client.portal.call(broadcaster.connect, "alice", ws_a, tenant_id="t1")
        client.portal.call(broadcaster.connect, "bob", ws_b, tenant_id="t2")

        n = client.portal.call(
            broadcaster.broadcast, "job.created", {"id": "j1"}, tenant_id="t1"
        )
        assert n == 1
        assert ws_a.sent == [{"event": "job.created", "data": {"id": "j1"}}]
        assert ws_b.sent == []

    def test_send_to_user_targets_only_specific_user(self, client: TestClient):
        from starlette.websockets import WebSocketState

        class FakeWebSocket:
            def __init__(self) -> None:
                self.client_state = WebSocketState.CONNECTED
                self.sent: list[dict] = []

            async def accept(self) -> None:
                self.client_state = WebSocketState.CONNECTED

            async def send_json(self, data) -> None:
                self.sent.append(data)

        ws_alice1 = FakeWebSocket()
        ws_alice2 = FakeWebSocket()
        ws_bob = FakeWebSocket()
        client.portal.call(broadcaster.connect, "alice", ws_alice1, tenant_id="t1")
        client.portal.call(broadcaster.connect, "alice", ws_alice2, tenant_id="t1")
        client.portal.call(broadcaster.connect, "bob", ws_bob, tenant_id="t1")

        n = client.portal.call(
            broadcaster.send_to_user,
            "alice", "notification.created", {"id": "n1"}, tenant_id="t1",
        )
        assert n == 2
        assert ws_alice1.sent == [
            {"event": "notification.created", "data": {"id": "n1"}}
        ]
        assert ws_alice2.sent == [
            {"event": "notification.created", "data": {"id": "n1"}}
        ]
        assert ws_bob.sent == []

    def test_send_to_user_isolated_by_tenant(self, client: TestClient):
        from starlette.websockets import WebSocketState

        class FakeWebSocket:
            def __init__(self) -> None:
                self.client_state = WebSocketState.CONNECTED
                self.sent: list[dict] = []

            async def accept(self) -> None:
                self.client_state = WebSocketState.CONNECTED

            async def send_json(self, data) -> None:
                self.sent.append(data)

        ws_t1 = FakeWebSocket()
        ws_t2 = FakeWebSocket()
        client.portal.call(broadcaster.connect, "alice", ws_t1, tenant_id="t1")
        client.portal.call(broadcaster.connect, "alice", ws_t2, tenant_id="t2")

        n = client.portal.call(
            broadcaster.send_to_user,
            "alice", "candidate.created", {"id": "c1"}, tenant_id="t1",
        )
        assert n == 1
        assert ws_t1.sent == [{"event": "candidate.created", "data": {"id": "c1"}}]
        assert ws_t2.sent == []

    def test_disconnect_removes_user(self, client: TestClient):
        from starlette.websockets import WebSocketState

        class FakeWebSocket:
            def __init__(self) -> None:
                self.client_state = WebSocketState.CONNECTED
                self.sent: list[dict] = []

            async def accept(self) -> None:
                self.client_state = WebSocketState.CONNECTED

            async def send_json(self, data) -> None:
                self.sent.append(data)

        ws = FakeWebSocket()
        client.portal.call(broadcaster.connect, "alice", ws, tenant_id="t1")
        assert client.portal.call(broadcaster.is_connected, "alice")

        removed = client.portal.call(broadcaster.disconnect, "alice", ws)
        assert removed == 1
        assert not client.portal.call(broadcaster.is_connected, "alice")

        n = client.portal.call(
            broadcaster.send_to_user, "alice", "x.y", {}, tenant_id="t1"
        )
        assert n == 0


# ── 3. Subscription / unsubscription on the live dashboard ────────────────


class TestDashboardSubscription:
    def test_subscribe_then_receive_event(self, client: TestClient):
        token = _make_token(user_id="alice", tenant_id="acme")
        with client.websocket_connect(f"/api/v1/ws/dashboard?token={token}") as ws:
            welcome = ws.receive_json()
            assert welcome["type"] == "connected"

            # Subscribe to the candidates channel.
            ws.send_json({"action": "subscribe", "channel": "candidates"})
            ack = ws.receive_json()
            assert ack["type"] == "subscribed"
            assert ack["channel"] == "candidates"
            assert "candidate.created" in ack["events"]

            # Server-side broadcaster emits the event to this user only.
            n = client.portal.call(
                broadcaster.broadcast,
                "candidate.created",
                {"id": "c-42", "name": "Ada"},
                tenant_id="acme",
            )
            assert n == 1

            event = ws.receive_json()
            assert event == {
                "event": "candidate.created",
                "data": {"id": "c-42", "name": "Ada"},
            }

    def test_unsubscribe_stops_receiving_events(self, client: TestClient):
        token = _make_token(user_id="alice", tenant_id="acme")
        with client.websocket_connect(f"/api/v1/ws/dashboard?token={token}") as ws:
            ws.receive_json()  # welcome

            ws.send_json({"action": "subscribe", "channel": "candidates"})
            ws.receive_json()  # subscribed ack

            ws.send_json({"action": "unsubscribe", "channel": "candidates"})
            ack = ws.receive_json()
            assert ack["type"] == "unsubscribed"
            assert ack["channel"] == "candidates"

            # After unsubscribing, the user has left the event room, so a
            # tenant-wide broadcast of an unrelated event should not deliver
            # the candidates event.  We instead broadcast a NON-candidate
            # event and verify it does NOT show up over this socket — the
            # user is still in the tenant room but not in
            # tenant:acme:event:candidate.created, so send_to_user is the
            # reliable check.
            ws.send_json({"action": "ping"})  # drain any pending frame
            pong = ws.receive_json()
            assert pong["type"] == "pong"

            n = client.portal.call(
                broadcaster.send_to_user,
                "alice", "candidate.created", {"id": "c-99"}, tenant_id="acme",
            )
            assert n == 0  # user is not subscribed to the event room

    def test_ping_pong_round_trip(self, client: TestClient):
        token = _make_token(user_id="alice", tenant_id="acme")
        with client.websocket_connect(f"/api/v1/ws/dashboard?token={token}") as ws:
            ws.receive_json()  # welcome
            ws.send_json({"action": "ping"})
            reply = ws.receive_json()
            assert reply["type"] == "pong"
            assert "ts" in reply

    def test_unknown_action_returns_error(self, client: TestClient):
        token = _make_token(user_id="alice", tenant_id="acme")
        with client.websocket_connect(f"/api/v1/ws/dashboard?token={token}") as ws:
            ws.receive_json()  # welcome
            ws.send_json({"action": "fly_to_mars"})
            err = ws.receive_json()
            assert err["type"] == "error"
            assert "fly_to_mars" in err["message"]


# ── 4. Tenant isolation across two live dashboard connections ────────────


class TestTenantIsolation:
    def test_event_only_delivered_to_target_tenant(self, client: TestClient):
        token_a = _make_token(user_id="alice", tenant_id="acme")
        token_b = _make_token(user_id="bob", tenant_id="umbrella")

        with client.websocket_connect(f"/api/v1/ws/dashboard?token={token_a}") as ws_a:
            ws_a.receive_json()  # welcome
            with client.websocket_connect(f"/api/v1/ws/dashboard?token={token_b}") as ws_b:
                ws_b.receive_json()  # welcome

                ws_a.send_json({"action": "subscribe", "channel": "candidates"})
                ws_a.receive_json()  # ack
                ws_b.send_json({"action": "subscribe", "channel": "candidates"})
                ws_b.receive_json()  # ack

                n = client.portal.call(
                    broadcaster.broadcast,
                    "candidate.created",
                    {"id": "c-7"},
                    tenant_id="acme",
                )
                assert n == 1

                msg_a = ws_a.receive_json()
                assert msg_a == {
                    "event": "candidate.created",
                    "data": {"id": "c-7"},
                }

                # Bob's socket is in tenant=umbrella so he must NOT see this.
                # Drain a ping/pong so any buffered frames are flushed, then
                # assert no candidate.created frame is queued.
                ws_b.send_json({"action": "ping"})
                pong = ws_b.receive_json()
                assert pong["type"] == "pong"
                # send_to_user with bob's user_id is the strictest check.
                assert (
                    client.portal.call(
                        broadcaster.send_to_user,
                        "bob",
                        "candidate.created",
                        {"id": "c-7"},
                        tenant_id="umbrella",
                    )
                    == 0
                )
