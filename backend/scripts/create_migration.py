"""Helper script to create Alembic migrations for AI-ROS."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).parent.parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


def create_migration(message: str, autogenerate: bool = True):
    cmd = ["alembic", "-c", str(ALEMBIC_INI), "revision"]
    if autogenerate:
        cmd.append("--autogenerate")
    cmd.extend(["-m", message])

    print(f"[~] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(BACKEND_DIR), capture_output=True, text=True)

    if result.returncode == 0:
        print(f"[OK] Migration created: {message}")
        if result.stdout:
            print(result.stdout)
    else:
        print(f"[FAIL] Migration creation failed:")
        print(result.stderr)
        sys.exit(1)


def upgrade_database(revision: str = "head"):
    cmd = ["alembic", "-c", str(ALEMBIC_INI), "upgrade", revision]
    print(f"[~] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(BACKEND_DIR), capture_output=True, text=True)

    if result.returncode == 0:
        print(f"[OK] Database upgraded to {revision}")
    else:
        print(f"[FAIL] Upgrade failed:")
        print(result.stderr)
        sys.exit(1)


def downgrade_database(revision: str = "-1"):
    cmd = ["alembic", "-c", str(ALEMBIC_INI), "downgrade", revision]
    print(f"[~] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(BACKEND_DIR), capture_output=True, text=True)

    if result.returncode == 0:
        print(f"[OK] Database downgraded to {revision}")
    else:
        print(f"[FAIL] Downgrade failed:")
        print(result.stderr)
        sys.exit(1)


def show_history():
    cmd = ["alembic", "-c", str(ALEMBIC_INI), "history", "--verbose"]
    result = subprocess.run(cmd, cwd=str(BACKEND_DIR), capture_output=True, text=True)
    print(result.stdout)
    if result.stderr:
        print(result.stderr)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="AI-ROS Migration Helper")
    subparsers = parser.add_subparsers(dest="command", help="Migration command")

    migrate_parser = subparsers.add_parser("create", help="Create a new migration")
    migrate_parser.add_argument("message", help="Migration message")

    upgrade_parser = subparsers.add_parser("upgrade", help="Upgrade database")
    upgrade_parser.add_argument("--revision", default="head", help="Target revision (default: head)")

    downgrade_parser = subparsers.add_parser("downgrade", help="Downgrade database")
    downgrade_parser.add_argument("--revision", default="-1", help="Target revision (default: -1)")

    subparsers.add_parser("history", help="Show migration history")

    args = parser.parse_args()

    if args.command == "create":
        create_migration(args.message)
    elif args.command == "upgrade":
        upgrade_database(args.revision)
    elif args.command == "downgrade":
        downgrade_database(args.revision)
    elif args.command == "history":
        show_history()
    else:
        parser.print_help()
