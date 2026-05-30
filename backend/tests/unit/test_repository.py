"""Unit tests for shared.core.repository — BaseRepository CRUD operations."""

from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel, Field

from shared.core.repository import BaseRepository


pytestmark = [pytest.mark.unit, pytest.mark.repository]


class DummyModel(SQLModel, table=True):
    __tablename__ = "test_dummy"

    id: str = Field(primary_key=True, default_factory=lambda: str(uuid4()))
    tenant_id: str = Field(index=True)
    name: str
    value: int = 0


@pytest_asyncio.fixture
async def repo(db_session: AsyncSession) -> BaseRepository[DummyModel]:
    return BaseRepository(DummyModel, db_session)


@pytest.mark.asyncio
async def test_create(repo: BaseRepository[DummyModel], test_tenant_id: str):
    obj = await repo.create({"tenant_id": test_tenant_id, "name": "test", "value": 42})
    assert obj.id is not None
    assert obj.name == "test"
    assert obj.value == 42
    assert obj.tenant_id == test_tenant_id


@pytest.mark.asyncio
async def test_get_by_id(repo: BaseRepository[DummyModel], test_tenant_id: str):
    created = await repo.create({"tenant_id": test_tenant_id, "name": "fetch-me", "value": 1})
    fetched = await repo.get(created.id)
    assert fetched is not None
    assert fetched.name == "fetch-me"


@pytest.mark.asyncio
async def test_get_with_tenant_filter(repo: BaseRepository[DummyModel], test_tenant_id: str):
    created = await repo.create({"tenant_id": test_tenant_id, "name": "scoped", "value": 5})
    fetched = await repo.get(created.id, tenant_id=test_tenant_id)
    assert fetched is not None
    assert fetched.tenant_id == test_tenant_id


@pytest.mark.asyncio
async def test_get_returns_none_for_missing(repo: BaseRepository[DummyModel]):
    result = await repo.get("nonexistent-id")
    assert result is None


@pytest.mark.asyncio
async def test_get_multi(repo: BaseRepository[DummyModel], test_tenant_id: str):
    for i in range(5):
        await repo.create({"tenant_id": test_tenant_id, "name": f"item-{i}", "value": i})
    items = await repo.get_multi(tenant_id=test_tenant_id)
    assert len(items) == 5


@pytest.mark.asyncio
async def test_get_multi_pagination(repo: BaseRepository[DummyModel], test_tenant_id: str):
    for i in range(10):
        await repo.create({"tenant_id": test_tenant_id, "name": f"item-{i}", "value": i})
    page1 = await repo.get_multi(tenant_id=test_tenant_id, skip=0, limit=3)
    page2 = await repo.get_multi(tenant_id=test_tenant_id, skip=3, limit=3)
    assert len(page1) == 3
    assert len(page2) == 3
    assert page1[0].id != page2[0].id


@pytest.mark.asyncio
async def test_get_multi_with_filters(repo: BaseRepository[DummyModel], test_tenant_id: str):
    await repo.create({"tenant_id": test_tenant_id, "name": "alpha", "value": 10})
    await repo.create({"tenant_id": test_tenant_id, "name": "beta", "value": 20})
    filtered = await repo.get_multi(tenant_id=test_tenant_id, filters={"value": 10})
    assert len(filtered) == 1
    assert filtered[0].name == "alpha"


@pytest.mark.asyncio
async def test_count(repo: BaseRepository[DummyModel], test_tenant_id: str):
    for i in range(3):
        await repo.create({"tenant_id": test_tenant_id, "name": f"item-{i}", "value": i})
    total = await repo.count(tenant_id=test_tenant_id)
    assert total == 3


@pytest.mark.asyncio
async def test_count_with_filters(repo: BaseRepository[DummyModel], test_tenant_id: str):
    await repo.create({"tenant_id": test_tenant_id, "name": "a", "value": 1})
    await repo.create({"tenant_id": test_tenant_id, "name": "b", "value": 2})
    count = await repo.count(tenant_id=test_tenant_id, filters={"value": 1})
    assert count == 1


@pytest.mark.asyncio
async def test_update(repo: BaseRepository[DummyModel], test_tenant_id: str):
    created = await repo.create({"tenant_id": test_tenant_id, "name": "old", "value": 0})
    updated = await repo.update(created.id, {"name": "new", "value": 99})
    assert updated is not None
    assert updated.name == "new"
    assert updated.value == 99


@pytest.mark.asyncio
async def test_update_nonexistent(repo: BaseRepository[DummyModel]):
    result = await repo.update("nonexistent-id", {"name": "nope"})
    assert result is None


@pytest.mark.asyncio
async def test_delete(repo: BaseRepository[DummyModel], test_tenant_id: str):
    created = await repo.create({"tenant_id": test_tenant_id, "name": "delete-me", "value": 0})
    deleted = await repo.delete(created.id)
    assert deleted is True
    fetched = await repo.get(created.id)
    assert fetched is None


@pytest.mark.asyncio
async def test_delete_nonexistent(repo: BaseRepository[DummyModel]):
    result = await repo.delete("nonexistent-id")
    assert result is False


@pytest.mark.asyncio
async def test_create_multiple(repo: BaseRepository[DummyModel], test_tenant_id: str):
    objects = []
    for i in range(5):
        obj = await repo.create({"tenant_id": test_tenant_id, "name": f"batch-{i}", "value": i})
        objects.append(obj)
    assert len(objects) == 5
    assert all(obj.id is not None for obj in objects)
