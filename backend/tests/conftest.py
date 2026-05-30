"""Shared pytest fixtures for AI-ROS backend tests."""

from __future__ import annotations

import asyncio
from typing import AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlmodel import SQLModel

from shared.core.config import Settings, get_settings
from shared.core.models.identity import User, UserRole, UserStatus
from shared.core.models.candidate import Candidate, CandidateStatus


TEST_TENANT_ID = str(uuid4())


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def db_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def client(db_engine) -> AsyncGenerator[AsyncClient, None]:
    from apps.api_gateway.main import create_app

    app = create_app()

    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def test_tenant_id() -> str:
    return TEST_TENANT_ID


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession, test_tenant_id: str) -> User:
    from shared.core.security import hash_password

    user = User(
        id=str(uuid4()),
        tenant_id=test_tenant_id,
        email="test@example.com",
        full_name="Test User",
        hashed_password=hash_password("TestPassword123!"),
        role=UserRole.RECRUITER,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_candidate(db_session: AsyncSession, test_tenant_id: str) -> Candidate:
    candidate = Candidate(
        id=str(uuid4()),
        tenant_id=test_tenant_id,
        email="candidate@example.com",
        full_name="Jane Doe",
        status=CandidateStatus.NEW,
    )
    db_session.add(candidate)
    await db_session.commit()
    await db_session.refresh(candidate)
    return candidate


@pytest.fixture
def mock_redis() -> MagicMock:
    redis_mock = MagicMock()
    redis_mock.get = AsyncMock(return_value=None)
    redis_mock.set = AsyncMock(return_value=True)
    redis_mock.delete = AsyncMock(return_value=True)
    redis_mock.exists = AsyncMock(return_value=False)
    redis_mock.expire = AsyncMock(return_value=True)
    redis_mock.ttl = AsyncMock(return_value=-1)
    return redis_mock


@pytest.fixture
def mock_kafka_producer() -> MagicMock:
    producer = MagicMock()
    producer.send = AsyncMock(return_value=MagicMock())
    producer.start = AsyncMock()
    producer.stop = AsyncMock()
    producer.flush = AsyncMock()
    return producer
