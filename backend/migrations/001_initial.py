"""001 — Initial schema: core tables for AI-ROS."""

from sqlalchemy import text

description = "Create core tables: users, candidates, jobs, applications, interviews"


async def upgrade(conn) -> None:
    await conn.execute(text("""
        CREATE TABLE IF NOT EXISTS users (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            email           TEXT NOT NULL UNIQUE,
            full_name       TEXT NOT NULL,
            hashed_password TEXT NOT NULL,
            role            TEXT NOT NULL DEFAULT 'candidate',
            status          TEXT NOT NULL DEFAULT 'active',
            avatar_url      TEXT,
            phone           TEXT,
            mfa_enabled     INTEGER NOT NULL DEFAULT 0,
            mfa_secret      TEXT,
            last_login_at   TEXT,
            email_verified  INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """))

    await conn.execute(text("""
        CREATE TABLE IF NOT EXISTS candidates (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            email           TEXT NOT NULL,
            full_name       TEXT NOT NULL,
            phone           TEXT,
            location        TEXT,
            linkedin_url    TEXT,
            portfolio_url   TEXT,
            status          TEXT NOT NULL DEFAULT 'new',
            source          TEXT,
            tags            TEXT NOT NULL DEFAULT '[]',
            notes           TEXT,
            resume_file_id  TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """))

    await conn.execute(text("""
        CREATE TABLE IF NOT EXISTS jobs (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            title           TEXT NOT NULL,
            description     TEXT NOT NULL,
            department      TEXT,
            location        TEXT,
            status          TEXT NOT NULL DEFAULT 'draft',
            job_type        TEXT NOT NULL DEFAULT 'full_time',
            salary_min      INTEGER,
            salary_max      INTEGER,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """))

    await conn.execute(text("""
        CREATE TABLE IF NOT EXISTS applications (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            candidate_id    TEXT NOT NULL,
            job_id          TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'applied',
            stage           TEXT NOT NULL DEFAULT 'applied',
            applied_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (candidate_id) REFERENCES candidates(id),
            FOREIGN KEY (job_id) REFERENCES jobs(id)
        )
    """))

    await conn.execute(text("""
        CREATE TABLE IF NOT EXISTS interviews (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            application_id  TEXT NOT NULL,
            interview_type  TEXT NOT NULL DEFAULT 'phone',
            status          TEXT NOT NULL DEFAULT 'scheduled',
            scheduled_at    TEXT,
            duration_min    INTEGER,
            notes           TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (application_id) REFERENCES applications(id)
        )
    """))

    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_candidates_tenant ON candidates(tenant_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON jobs(tenant_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_applications_tenant ON applications(tenant_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_interviews_tenant ON interviews(tenant_id)"))


async def downgrade(conn) -> None:
    await conn.execute(text("DROP TABLE IF EXISTS interviews"))
    await conn.execute(text("DROP TABLE IF EXISTS applications"))
    await conn.execute(text("DROP TABLE IF EXISTS jobs"))
    await conn.execute(text("DROP TABLE IF EXISTS candidates"))
    await conn.execute(text("DROP TABLE IF EXISTS users"))
