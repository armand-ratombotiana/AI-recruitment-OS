"""Tests for the migration manager — runner, rollback, history."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy import text

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.migrations.manager import MigrationManager, MigrationResult


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def migrations_dir(tmp_path):
    return tmp_path


@pytest_asyncio.fixture
async def manager(engine, migrations_dir):
    return MigrationManager(engine, migrations_dir=migrations_dir)


def _write_migration(directory: Path, version: str, description: str, upgrade_sql: str, downgrade_sql: str | None = None):
    content = f'''"""Migration {version}."""
from sqlalchemy import text

description = "{description}"

async def upgrade(conn):
    await conn.execute(text("""{upgrade_sql}"""))

async def downgrade(conn):
    {f'await conn.execute(text("""{downgrade_sql}"""))' if downgrade_sql else "pass"}
'''
    path = directory / f"{version}_{description.replace(' ', '_').lower()}.py"
    path.write_text(content)
    return path


# ── Discovery ─────────────────────────────────────────────────────────────────


class TestDiscovery:
    def test_discover_empty_dir(self, manager):
        assert manager.discover() == []

    def test_discover_single_migration(self, manager, migrations_dir):
        _write_migration(migrations_dir, "001", "create users", "SELECT 1")
        found = manager.discover()
        assert len(found) == 1
        assert found[0].version == "001"
        assert found[0].description == "create users"

    def test_discover_multiple_sorted(self, manager, migrations_dir):
        _write_migration(migrations_dir, "002", "add jobs", "SELECT 1")
        _write_migration(migrations_dir, "001", "create users", "SELECT 1")
        _write_migration(migrations_dir, "003", "add apps", "SELECT 1")
        found = manager.discover()
        assert [m.version for m in found] == ["001", "002", "003"]

    def test_discover_skips_underscored(self, manager, migrations_dir):
        _write_migration(migrations_dir, "001", "real", "SELECT 1")
        (migrations_dir / "_helper.py").write_text("# helper")
        found = manager.discover()
        assert len(found) == 1

    def test_discover_skips_non_python(self, manager, migrations_dir):
        (migrations_dir / "readme.txt").write_text("not a migration")
        found = manager.discover()
        assert len(found) == 0


# ── Apply ─────────────────────────────────────────────────────────────────────


class TestApply:
    @pytest.mark.asyncio
    async def test_run_pending_applies_migration(self, manager, migrations_dir, engine):
        _write_migration(
            migrations_dir, "001", "create test table",
            "CREATE TABLE test_tbl (id TEXT PRIMARY KEY, val TEXT)"
        )
        results = await manager.run_pending()
        assert len(results) == 1
        assert results[0].success is True
        assert results[0].version == "001"

        async with engine.connect() as conn:
            r = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='test_tbl'"))
            assert r.fetchone() is not None

    @pytest.mark.asyncio
    async def test_run_pending_records_history(self, manager, migrations_dir):
        _write_migration(migrations_dir, "001", "create t", "CREATE TABLE hist_test (id TEXT PRIMARY KEY)")
        await manager.run_pending()
        applied = await manager.get_applied()
        assert len(applied) == 1
        assert applied[0].version == "001"

    @pytest.mark.asyncio
    async def test_run_pending_idempotent(self, manager, migrations_dir):
        _write_migration(migrations_dir, "001", "create t2", "CREATE TABLE t2 (id TEXT PRIMARY KEY)")
        r1 = await manager.run_pending()
        assert len(r1) == 1
        r2 = await manager.run_pending()
        assert len(r2) == 0

    @pytest.mark.asyncio
    async def test_run_multiple_sequential(self, manager, migrations_dir):
        _write_migration(migrations_dir, "001", "t3", "CREATE TABLE t3 (id TEXT PRIMARY KEY)")
        _write_migration(migrations_dir, "002", "t4", "CREATE TABLE t4 (id TEXT PRIMARY KEY)")
        results = await manager.run_pending()
        assert len(results) == 2
        assert all(r.success for r in results)

    @pytest.mark.asyncio
    async def test_failed_migration_stops_chain(self, manager, migrations_dir):
        _write_migration(migrations_dir, "001", "good", "CREATE TABLE t5 (id TEXT PRIMARY KEY)")
        bad_path = migrations_dir / "002_bad.py"
        bad_path.write_text('''
description = "bad"
async def upgrade(conn):
    raise RuntimeError("intentional failure")
async def downgrade(conn):
    pass
''')
        _write_migration(migrations_dir, "003", "after_bad", "CREATE TABLE t6 (id TEXT PRIMARY KEY)")
        results = await manager.run_pending()
        assert len(results) == 2
        assert results[0].success is True
        assert results[1].success is False

    @pytest.mark.asyncio
    async def test_get_status(self, manager, migrations_dir):
        _write_migration(migrations_dir, "001", "t7", "CREATE TABLE t7 (id TEXT PRIMARY KEY)")
        _write_migration(migrations_dir, "002", "t8", "CREATE TABLE t8 (id TEXT PRIMARY KEY)")
        await manager.run_pending()
        _write_migration(migrations_dir, "003", "t9", "CREATE TABLE t9 (id TEXT PRIMARY KEY)")
        status = await manager.get_status()
        assert status["total_applied"] == 2
        assert status["total_pending"] == 1


# ── Rollback ──────────────────────────────────────────────────────────────────


class TestRollback:
    @pytest.mark.asyncio
    async def test_rollback_last(self, manager, migrations_dir, engine):
        _write_migration(
            migrations_dir, "001", "create rb1",
            "CREATE TABLE rb1 (id TEXT PRIMARY KEY)",
            "DROP TABLE rb1",
        )
        _write_migration(
            migrations_dir, "002", "create rb2",
            "CREATE TABLE rb2 (id TEXT PRIMARY KEY)",
            "DROP TABLE rb2",
        )
        await manager.run_pending()

        results = await manager.rollback()
        assert len(results) == 1
        assert results[0].version == "002"
        assert results[0].success is True

        applied = await manager.get_applied()
        assert len(applied) == 1
        assert applied[0].version == "001"

    @pytest.mark.asyncio
    async def test_rollback_to_target(self, manager, migrations_dir):
        _write_migration(migrations_dir, "001", "r1", "CREATE TABLE r1 (id TEXT PRIMARY KEY)", "DROP TABLE r1")
        _write_migration(migrations_dir, "002", "r2", "CREATE TABLE r2 (id TEXT PRIMARY KEY)", "DROP TABLE r2")
        _write_migration(migrations_dir, "003", "r3", "CREATE TABLE r3 (id TEXT PRIMARY KEY)", "DROP TABLE r3")
        await manager.run_pending()

        results = await manager.rollback(target_version="001")
        assert len(results) == 2
        assert all(r.success for r in results)

        applied = await manager.get_applied()
        assert len(applied) == 1
        assert applied[0].version == "001"

    @pytest.mark.asyncio
    async def test_rollback_empty_history(self, manager):
        results = await manager.rollback()
        assert results == []

    @pytest.mark.asyncio
    async def test_rollback_missing_file(self, manager, migrations_dir):
        _write_migration(migrations_dir, "001", "orphan", "CREATE TABLE orphan (id TEXT PRIMARY KEY)")
        await manager.run_pending()
        for f in migrations_dir.glob("001_*"):
            f.unlink()
        results = await manager.rollback()
        assert len(results) == 1
        assert results[0].success is False


# ── History ───────────────────────────────────────────────────────────────────


class TestHistory:
    @pytest.mark.asyncio
    async def test_get_applied_empty(self, manager):
        applied = await manager.get_applied()
        assert applied == []

    @pytest.mark.asyncio
    async def test_get_pending_all(self, manager, migrations_dir):
        _write_migration(migrations_dir, "001", "p1", "CREATE TABLE p1 (id TEXT PRIMARY KEY)")
        _write_migration(migrations_dir, "002", "p2", "CREATE TABLE p2 (id TEXT PRIMARY KEY)")
        pending = await manager.get_pending()
        assert len(pending) == 2

    @pytest.mark.asyncio
    async def test_get_pending_after_partial_apply(self, manager, migrations_dir):
        _write_migration(migrations_dir, "001", "pa1", "CREATE TABLE pa1 (id TEXT PRIMARY KEY)")
        _write_migration(migrations_dir, "002", "pa2", "CREATE TABLE pa2 (id TEXT PRIMARY KEY)")
        await manager._apply_one(manager.discover()[0])
        pending = await manager.get_pending()
        assert len(pending) == 1
        assert pending[0].version == "002"


# ── Initial migration (real file) ────────────────────────────────────────────


class TestInitialMigration:
    @pytest.mark.asyncio
    async def test_initial_migration_applies(self, engine):
        real_migrations_dir = Path(BACKEND_DIR) / "migrations"
        mgr = MigrationManager(engine, migrations_dir=real_migrations_dir)
        results = await mgr.run_pending()
        assert len(results) >= 1
        assert all(r.success for r in results)

        async with engine.connect() as conn:
            for table in ["users", "candidates", "jobs", "applications", "interviews"]:
                r = await conn.execute(
                    text(f"SELECT name FROM sqlite_master WHERE type='table' AND name=:t"),
                    {"t": table},
                )
                assert r.fetchone() is not None, f"Table {table} should exist"

    @pytest.mark.asyncio
    async def test_initial_migration_rollback(self, engine):
        real_migrations_dir = Path(BACKEND_DIR) / "migrations"
        mgr = MigrationManager(engine, migrations_dir=real_migrations_dir)
        await mgr.run_pending()
        results = await mgr.rollback()
        assert len(results) == 1
        assert results[0].success is True

        async with engine.connect() as conn:
            r = await conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
            )
            assert r.fetchone() is None
