# AI-ROS — Backup & Recovery

The only stateful data AI-ROS owns is in **PostgreSQL**. Redis is used
only for ephemeral caches and the Celery broker; both can be wiped
without losing user-visible data. Object storage (S3) holds resume
files and exports — it is **not** backed up here, it is the backup
target.

This document covers:

- What is backed up, and what is not
- The backup schedule and retention policy
- Recovery objectives (RTO / RPO)
- Step-by-step restore procedures
- How to verify a backup is good
- Disaster-recovery drills

---

## 1. Scope

| Data | Backed up? | How |
|------|------------|-----|
| PostgreSQL (candidates, jobs, applications, interviews, PPE sessions, billing, audit log, …) | **Yes** | Daily `pg_dump` + WAL archiving |
| Redis cache / rate-limits | No (ephemeral) | n/a |
| Celery task queue | No (ephemeral) | n/a |
| Resume files / exports in S3 | Already durable | n/a (S3 is the backup) |
| Grafana dashboards | **Yes** | Daily sync to Git |
| Prometheus rules | **Yes** | Git |
| `.env` and secrets | **Yes** | Encrypted in 1Password / AWS Secrets Manager |
| Audit log | **Yes** (subset of PostgreSQL) | Same dump |

---

## 2. Recovery objectives

| Tier | RPO (max data loss) | RTO (max downtime) | Notes |
|------|---------------------|--------------------|-------|
| Production | **5 minutes** (point-in-time recovery) | **30 minutes** | WAL archiving + hot standby |
| Staging | 24 hours | 1 hour | Daily `pg_dump` only |
| Local dev | None | n/a | `docker compose down -v` is the reset |

> **RPO 5 min** assumes WAL archiving is enabled on the primary and the
> archive target is a separate bucket. Without WAL archiving the RPO
> degrades to the `pg_dump` interval (24 h).

---

## 3. Schedule

| Job | Cron | Command | Storage |
|-----|------|---------|---------|
| Nightly `pg_dump` | `0 2 * * *` | `scripts/backup.sh` | `s3://airos-backups/postgres/<date>.sql.gz` |
| WAL archive (continuous) | every 60 s | `archive_command` in `postgresql.conf` | `s3://airos-backups/postgres/wal/` |
| Hourly Redis snapshot | `0 * * * *` | `redis-cli BGSAVE` | `s3://airos-backups/redis/<date>.rdb` (informational only) |
| Grafana dashboard export | `30 2 * * *` | `scripts/backup.sh dashboards` | Git repo `airos-ops` |
| Verification | `0 4 * * 0` | `scripts/verify_backup.sh` | Reports to Slack |

The cron entries are defined in `infrastructure/cron/airos-backup.cron`.

---

## 4. Retention policy

| Tier | Retention |
|------|-----------|
| Daily `pg_dump` | 30 days |
| Weekly `pg_dump` | 12 weeks (Sunday's dump) |
| Monthly `pg_dump` | 12 months (1st of the month) |
| Yearly `pg_dump` | 7 years (1st of January) |
| WAL archives | Until the next full backup is verified (recycled) |
| Redis snapshots | 7 days |

Old backups are expired by a lifecycle policy on the S3 bucket:

```json
{
  "Rules": [
    { "ID": "expire-daily",   "Prefix": "postgres/daily/",   "Expiration": { "Days": 30 } },
    { "ID": "expire-weekly",  "Prefix": "postgres/weekly/",  "Expiration": { "Days": 84 } },
    { "ID": "expire-monthly", "Prefix": "postgres/monthly/", "Expiration": { "Days": 365 } },
    { "ID": "expire-yearly",  "Prefix": "postgres/yearly/",  "Expiration": { "Days": 2555 } }
  ]
}
```

---

## 5. Backup script (`scripts/backup.sh`)

Usage:
```bash
# Default — backup everything
./scripts/backup.sh

# Specific targets
./scripts/backup.sh postgres
./scripts/backup.sh redis
./scripts/backup.sh dashboards
./scripts/backup.sh upload-only
```

Environment variables:
- `BACKUP_DIR` — local staging directory (default `./backups`)
- `BACKUP_S3_BUCKET` — destination bucket (required in prod, e.g.
  `s3://airos-backups`)
- `BACKUP_RETENTION_DAYS` — local retention (default 7)
- `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — used by `pg_dump`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — used by `aws s3 cp`
- `SLACK_WEBHOOK_URL` — optional failure notification

Exit codes:
- `0` — success
- `1` — backup failed
- `2` — integrity check failed

---

## 6. Restore script (`scripts/restore.sh`)

Usage:
```bash
# Restore the most recent local dump into a new database
./scripts/restore.sh

# Restore a specific dump into a specific database
./scripts/restore.sh --from backups/2026-06-01/postgres.sql.gz \
                     --db-name airos_restore \
                     --confirm

# Pull the latest dump from S3
./scripts/restore.sh --from-s3 latest --confirm

# Point-in-time recovery (requires WAL archive)
./scripts/restore.sh --to "2026-06-01 12:30:00 UTC" --confirm
```

Safety:
- The script refuses to overwrite a database that has connections
  unless `--force` is passed.
- All restore operations are logged to `backups/restore.log`.
- A dry-run mode prints the plan without changing anything.

---

## 7. Step-by-step recovery

### 7.1 From a `pg_dump` backup

1. **Stop the application** (this prevents writes that could conflict
   with the restore):
   ```bash
   kubectl scale deploy/airos-api --replicas=0
   kubectl scale deploy/airos-celery --replicas=0
   ```
2. **Pick a target database name** — never restore over the live
   primary on a hunch. Use `airos_restore_<timestamp>`.
3. **Run the restore**:
   ```bash
   ./scripts/restore.sh --from-s3 latest \
                        --db-name airos_restore_$(date +%s) \
                        --confirm
   ```
4. **Verify** with the smoke tests in §9.
5. **If the data looks good**, swap the alias. The cleanest pattern is
   to:
   - Drop the bad database (after taking a final dump of it).
   - Rename the restored one: `ALTER DATABASE airos_restore_xxx RENAME TO airos;`
6. **Restart the application**:
   ```bash
   kubectl scale deploy/airos-api --replicas=3
   kubectl scale deploy/airos-celery --replicas=2
   ```

### 7.2 Point-in-time recovery (PITR)

1. Ensure WAL archiving is intact:
   ```bash
   aws s3 ls s3://airos-backups/postgres/wal/ | head
   ```
2. Stop the API.
3. Restore the most recent `pg_dump` taken **before** the incident
   time:
   ```bash
   ./scripts/restore.sh --from-s3 2026-06-01_pre-incident --confirm
   ```
4. Replace the `postgresql.conf` to point `restore_command` at the WAL
   archive bucket.
5. Start Postgres — it will replay WAL up to the target timestamp:
   ```bash
   ./scripts/restore.sh --to "2026-06-01 12:30:00 UTC" --confirm
   ```
6. Re-enable the application and re-run smoke tests.

### 7.3 Region failure (full DR)

In a multi-region setup the secondary region holds a hot standby that
can be promoted in < 5 minutes:

```bash
# On the secondary
pg_ctl promote -D /var/lib/postgresql/16/main
# Update the DNS / load balancer to point at the secondary
```

The application needs no code changes — it always connects via
`DATABASE_URL`, which the failover updates automatically through the
managed Postgres proxy.

---

## 8. Verifying a backup

A backup is only as good as its last successful restore. The script
`scripts/verify_backup.sh` (run weekly, on Sunday at 04:00) does this:

1. Spin up an ephemeral PostgreSQL container.
2. Restore the most recent daily dump into it.
3. Run a battery of smoke queries (see §9).
4. Compare the row counts against the live database.
5. Tear the ephemeral container down.
6. Report the result to Slack (`#ops-backups`).

If the script reports a failure, an on-call engineer is paged
automatically.

---

## 9. Smoke tests after a restore

The `tests/test_restore.py` suite is automatically invoked by the verify
script. It must pass before the restore is declared good:

```python
def test_candidate_count_close(restore_conn, live_conn):
    """The restored candidate count must be within 1% of the live count."""
    assert abs(restore_count - live_count) / live_count < 0.01

def test_recent_user_present(restore_conn, latest_user):
    """A user registered in the last 24h must be present in the restore."""
    assert restore_conn.execute(
        "SELECT 1 FROM users WHERE id = %s", [latest_user.id]
    ).fetchone() is not None

def test_no_orphan_records(restore_conn):
    """Foreign-key integrity check."""
    violations = restore_conn.execute("""
        SELECT count(*) FROM applications a
        LEFT JOIN candidates c ON c.id = a.candidate_id
        WHERE c.id IS NULL
    """).scalar()
    assert violations == 0
```

Manual smoke tests you can run from the API after a restore:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@airos.io","password":"demo1234"}' | jq -r .access_token)

# List endpoint returns data
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/candidates/?page=1&page_size=5" | jq '.total'

# Dashboard returns data
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/analytics/dashboard" | jq '.metrics.total_candidates'
```

---

## 10. Disaster-recovery drills

A drill is scheduled every quarter. The current calendar (subject to
adjustment):

| Quarter | Drill | Owner |
|---------|-------|-------|
| Q1 | Restore the most recent daily dump into a staging cluster | SRE |
| Q2 | PITR — replay WAL to a timestamp 6 hours before "now" | SRE |
| Q3 | Region failover to the secondary, run smoke tests, fail back | SRE + Eng |
| Q4 | Full table-top incident with on-call rotation | All |

The drill outcome (RTO achieved, RPO achieved, gaps) is documented in
`docs/runbooks/post-drills/`.

---

## 11. Related runbooks

- [`RUNBOOKS.md`](RUNBOOKS.md) — general on-call procedures
- [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) — symptom → fix catalog
- `docs/runbooks/restore-from-backup.md` — step-by-step playbook for
  the most common restore scenario (recreated from memory; see
  `RUNBOOKS.md` for the current authoritative version)
