"""Lightweight database migration runner.

Migrations live in ``backend/migrations/`` as numbered Python files
(``001_initial.py``, ``002_add_foo.py``, …).  Each file exposes:

* ``description: str``
* ``async def upgrade(engine)`` — apply the migration
* ``async def downgrade(engine)`` — reverse the migration

The :class:`MigrationManager` tracks which migrations have been applied in
a ``_migration_history`` table and supports both forward and rollback runs.
"""
from __future__ import annotations

import importlib
import importlib.util
import logging
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger("migrations")

DEFAULT_MIGRATIONS_DIR = Path(__file__).resolve().parent.parent.parent / "migrations"


@dataclass
class MigrationRecord:
    version: str
    description: str
    applied_at: str
    checksum: str = ""


@dataclass
class MigrationFile:
    version: str
    description: str
    path: Path
    module: Any = None


@dataclass
class MigrationResult:
    version: str
    action: str
    success: bool
    message: str = ""
    duration_ms: float = 0.0


class MigrationManager:
    """Discover, apply, and roll back migrations."""

    def __init__(
        self,
        engine: AsyncEngine,
        migrations_dir: Path | str | None = None,
    ) -> None:
        self._engine = engine
        self._migrations_dir = Path(migrations_dir) if migrations_dir else DEFAULT_MIGRATIONS_DIR

    @property
    def migrations_dir(self) -> Path:
        return self._migrations_dir

    async def _ensure_history_table(self) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS _migration_history (
                    version       TEXT PRIMARY KEY,
                    description   TEXT NOT NULL DEFAULT '',
                    applied_at    TEXT NOT NULL,
                    checksum      TEXT NOT NULL DEFAULT ''
                )
            """))

    def discover(self) -> list[MigrationFile]:
        if not self._migrations_dir.is_dir():
            return []
        files: list[MigrationFile] = []
        for entry in sorted(self._migrations_dir.iterdir()):
            if not entry.is_file() or not entry.suffix == ".py":
                continue
            if entry.name.startswith("_"):
                continue
            stem = entry.stem
            parts = stem.split("_", 1)
            version = parts[0]
            if not version.isdigit():
                continue
            mod = self._load_module(entry)
            desc = getattr(mod, "description", stem)
            files.append(MigrationFile(
                version=version,
                description=desc,
                path=entry,
                module=mod,
            ))
        return files

    @staticmethod
    def _load_module(path: Path) -> Any:
        mod_name = f"_migration_{path.stem}"
        spec = importlib.util.spec_from_file_location(mod_name, str(path))
        if spec is None or spec.loader is None:
            raise ImportError(f"Cannot load migration from {path}")
        mod = importlib.util.module_from_spec(spec)
        sys.modules[mod_name] = mod
        spec.loader.exec_module(mod)
        return mod

    async def get_applied(self) -> list[MigrationRecord]:
        await self._ensure_history_table()
        async with self._engine.execute(text(
            "SELECT version, description, applied_at, checksum FROM _migration_history ORDER BY version"
        )) if False else self._engine.connect() as conn:
            result = await conn.execute(text(
                "SELECT version, description, applied_at, checksum FROM _migration_history ORDER BY version"
            ))
            rows = result.fetchall()
        return [
            MigrationRecord(version=r[0], description=r[1], applied_at=r[2], checksum=r[3])
            for r in rows
        ]

    async def get_pending(self) -> list[MigrationFile]:
        applied = {r.version for r in await self.get_applied()}
        return [m for m in self.discover() if m.version not in applied]

    async def run_pending(self) -> list[MigrationResult]:
        results: list[MigrationResult] = []
        for mf in await self.get_pending():
            result = await self._apply_one(mf)
            results.append(result)
            if not result.success:
                break
        return results

    async def _apply_one(self, mf: MigrationFile) -> MigrationResult:
        import time
        await self._ensure_history_table()
        t0 = time.monotonic()
        try:
            upgrade_fn = getattr(mf.module, "upgrade", None)
            if upgrade_fn is None:
                raise AttributeError(f"Migration {mf.path.name} has no upgrade() function")
            async with self._engine.begin() as conn:
                await upgrade_fn(conn)
                now = datetime.now(timezone.utc).isoformat()
                await conn.execute(
                    text("INSERT INTO _migration_history (version, description, applied_at, checksum) VALUES (:v, :d, :a, :c)"),
                    {"v": mf.version, "d": mf.description, "a": now, "c": ""},
                )
            elapsed = (time.monotonic() - t0) * 1000
            logger.info("Applied migration %s (%s) in %.1fms", mf.version, mf.description, elapsed)
            return MigrationResult(version=mf.version, action="apply", success=True, message=mf.description, duration_ms=elapsed)
        except Exception as exc:
            elapsed = (time.monotonic() - t0) * 1000
            logger.error("Migration %s failed: %s", mf.version, exc)
            return MigrationResult(version=mf.version, action="apply", success=False, message=str(exc), duration_ms=elapsed)

    async def rollback(self, target_version: str | None = None) -> list[MigrationResult]:
        applied = await self.get_applied()
        if not applied:
            return []
        results: list[MigrationResult] = []
        to_rollback = list(reversed(applied))
        if target_version is not None:
            to_rollback = [r for r in to_rollback if int(r.version) > int(target_version)]
        else:
            to_rollback = [to_rollback[0]] if to_rollback else []

        for rec in to_rollback:
            result = await self._rollback_one(rec)
            results.append(result)
            if not result.success:
                break
        return results

    async def _rollback_one(self, rec: MigrationRecord) -> MigrationResult:
        import time
        t0 = time.monotonic()
        discovered = {m.version: m for m in self.discover()}
        mf = discovered.get(rec.version)
        if mf is None:
            return MigrationResult(
                version=rec.version, action="rollback", success=False,
                message=f"Migration file for version {rec.version} not found",
            )
        try:
            downgrade_fn = getattr(mf.module, "downgrade", None)
            if downgrade_fn is None:
                raise AttributeError(f"Migration {mf.path.name} has no downgrade() function")
            async with self._engine.begin() as conn:
                await downgrade_fn(conn)
                await conn.execute(
                    text("DELETE FROM _migration_history WHERE version = :v"),
                    {"v": rec.version},
                )
            elapsed = (time.monotonic() - t0) * 1000
            logger.info("Rolled back migration %s in %.1fms", rec.version, elapsed)
            return MigrationResult(version=rec.version, action="rollback", success=True, message=rec.description, duration_ms=elapsed)
        except Exception as exc:
            elapsed = (time.monotonic() - t0) * 1000
            logger.error("Rollback %s failed: %s", rec.version, exc)
            return MigrationResult(version=rec.version, action="rollback", success=False, message=str(exc), duration_ms=elapsed)

    async def get_status(self) -> dict[str, Any]:
        applied = await self.get_applied()
        pending = await self.get_pending()
        return {
            "applied": [
                {"version": r.version, "description": r.description, "applied_at": r.applied_at}
                for r in applied
            ],
            "pending": [
                {"version": m.version, "description": m.description}
                for m in pending
            ],
            "total_applied": len(applied),
            "total_pending": len(pending),
        }
