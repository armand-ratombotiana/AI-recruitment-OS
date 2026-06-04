#!/usr/bin/env bash
# =============================================================================
# AI-ROS — Backup script
# =============================================================================
# Performs a consistent backup of the AI-ROS data tier.
#
# Targets (selectable via the first positional argument, default "all"):
#   all         — postgres + redis + dashboards
#   postgres    — pg_dump of the primary database, compressed, uploaded
#   redis       — BGSAVE snapshot (informational; redis is ephemeral)
#   dashboards  — exports Grafana dashboards as JSON to a Git-tracked dir
#   upload-only — sync already-existing local backups to S3
#
# Environment variables:
#   BACKUP_DIR              Local staging directory (default ./backups)
#   BACKUP_S3_BUCKET        Destination bucket (e.g. s3://airos-backups)
#   BACKUP_RETENTION_DAYS   Local retention (default 7)
#   BACKUP_PG_DUMP_PATH     Path to pg_dump (default: auto-detect)
#   BACKUP_NOTIFY_SLACK     Webhook URL for failure notifications
#   AWS_ACCESS_KEY_ID       Credentials for the upload (use IAM role in prod)
#   AWS_SECRET_ACCESS_KEY   "
#   AWS_DEFAULT_REGION      "
#
# Exit codes:
#   0  success
#   1  backup failed
#   2  integrity check failed
# =============================================================================
set -euo pipefail

TARGET="${1:-all}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STAGE_DIR="${BACKUP_DIR}/${TIMESTAMP}"

# PostgreSQL connection (prefer env, fall back to defaults baked into the image)
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-airos}"
PGPASSWORD="${PGPASSWORD:-airos_dev_password}"
PGDATABASE="${PGDATABASE:-airos}"
export PGPASSWORD

# Resolve pg_dump / aws binaries
if [[ -n "${BACKUP_PG_DUMP_PATH:-}" ]]; then
  PG_DUMP="$BACKUP_PG_DUMP_PATH"
elif command -v pg_dump >/dev/null 2>&1; then
  PG_DUMP="$(command -v pg_dump)"
elif command -v docker >/dev/null 2>&1; then
  PG_DUMP="docker exec airos-postgres pg_dump"
else
  echo "FATAL: neither pg_dump nor docker found" >&2
  exit 1
fi

if [[ -n "$BACKUP_S3_BUCKET" ]] && ! command -v aws >/dev/null 2>&1; then
  echo "FATAL: BACKUP_S3_BUCKET set but aws CLI not found" >&2
  exit 1
fi

# ── Helpers ──────────────────────────────────────────────────────────────────

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { log "ERROR: $*"; notify_slack "❌ Backup FAILED: $*"; exit 1; }

notify_slack() {
  if [[ -n "${BACKUP_NOTIFY_SLACK:-}" ]]; then
    curl -fsS -X POST -H 'Content-Type: application/json' \
      -d "{\"text\": \"$1\"}" \
      "$BACKUP_NOTIFY_SLACK" >/dev/null || true
  fi
}

verify_pg_dump() {
  local file="$1"
  if [[ ! -s "$file" ]]; then
    fail "Backup file $file is empty"
  fi
  if ! gzip -t "$file" 2>/dev/null; then
    fail "Backup file $file failed gzip integrity check"
  fi
  # Sniff for pg_dump markers
  if ! zcat "$file" | head -c 4KB | grep -q "PostgreSQL database dump"; then
    fail "Backup file $file is not a pg_dump"
  fi
}

upload() {
  local src="$1"
  local dest="$2"
  if [[ -z "$BACKUP_S3_BUCKET" ]]; then
    log "  upload: skipped (BACKUP_S3_BUCKET not set)"
    return 0
  fi
  aws s3 cp "$src" "${BACKUP_S3_BUCKET}/${dest}" \
    --only-show-errors \
    --storage-class STANDARD_IA || fail "S3 upload failed for $src"
  log "  upload: s3://${dest}"
}

# ── Per-target backup routines ───────────────────────────────────────────────

backup_postgres() {
  log "PostgreSQL → $STAGE_DIR/postgres.sql.gz"
  mkdir -p "$STAGE_DIR"

  # -Fc would be faster to restore, but plain SQL is the most portable.
  # Pipe via gzip with -9 for max compression.
  if command -v gzip >/dev/null 2>&1; then
    $PG_DUMP -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
      --no-owner --no-privileges --quote-all-identifiers \
      | gzip -9 > "$STAGE_DIR/postgres.sql.gz"
  else
    $PG_DUMP -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
      --no-owner --no-privileges --quote-all-identifiers \
      > "$STAGE_DIR/postgres.sql"
  fi

  verify_pg_dump "$STAGE_DIR/postgres.sql.gz"

  local size; size=$(du -h "$STAGE_DIR/postgres.sql.gz" | cut -f1)
  log "  size: $size"

  # Mirror to dated folders for retention
  mkdir -p "$BACKUP_DIR/daily/$TIMESTAMP" "$BACKUP_DIR/latest"
  cp "$STAGE_DIR/postgres.sql.gz" "$BACKUP_DIR/daily/$TIMESTAMP/postgres.sql.gz"
  cp "$STAGE_DIR/postgres.sql.gz" "$BACKUP_DIR/latest/postgres.sql.gz"

  upload "$STAGE_DIR/postgres.sql.gz" "postgres/daily/${TIMESTAMP}/postgres.sql.gz"
  upload "$STAGE_DIR/postgres.sql.gz" "postgres/latest/postgres.sql.gz"
}

backup_redis() {
  log "Redis → $STAGE_DIR/redis.rdb"
  mkdir -p "$STAGE_DIR"
  if command -v docker >/dev/null 2>&1; then
    docker exec airos-redis sh -c 'redis-cli BGSAVE && sleep 1' \
      || log "  redis: BGSAVE failed (non-fatal)"
    docker cp airos-redis:/data/dump.rdb "$STAGE_DIR/redis.rdb" \
      || log "  redis: copy failed (non-fatal — redis is ephemeral)"
  fi
  upload "$STAGE_DIR/redis.rdb" "redis/${TIMESTAMP}/redis.rdb" || true
}

backup_dashboards() {
  log "Grafana dashboards → $STAGE_DIR/dashboards/"
  mkdir -p "$STAGE_DIR/dashboards"
  if command -v curl >/dev/null 2>&1; then
    local grafana="${GRAFANA_URL:-http://localhost:3001}"
    local auth="${GRAFANA_AUTH:-admin:admin}"
    # Hit the /api/search endpoint
    curl -fsS -u "$auth" "$grafana/api/search?type=dash-db" \
      | python3 -c '
import json, sys, urllib.parse
data = json.load(sys.stdin)
for d in data:
    print(d.get("uid", ""))
' | while read -r uid; do
      [[ -z "$uid" ]] && continue
      curl -fsS -u "$auth" "$grafana/api/dashboards/uid/$uid" \
        > "$STAGE_DIR/dashboards/${uid}.json"
    done || log "  grafana: some dashboard exports failed (non-fatal)"
  fi
  upload "$STAGE_DIR/dashboards" "dashboards/${TIMESTAMP}/" || true
}

prune_local() {
  log "Pruning local backups older than ${BACKUP_RETENTION_DAYS} days"
  find "$BACKUP_DIR/daily" -mindepth 1 -maxdepth 1 -type d \
    -mtime "+${BACKUP_RETENTION_DAYS}" -exec rm -rf {} \; || true
}

# ── Main ─────────────────────────────────────────────────────────────────────

log "Backup starting — target=$TARGET stage=$STAGE_DIR"

case "$TARGET" in
  all)
    backup_postgres
    backup_redis
    backup_dashboards
    prune_local
    ;;
  postgres) backup_postgres ;;
  redis)    backup_redis ;;
  dashboards) backup_dashboards ;;
  upload-only) upload "$BACKUP_DIR/latest/postgres.sql.gz" "postgres/latest/postgres.sql.gz" ;;
  *) fail "Unknown target '$TARGET' (use: all|postgres|redis|dashboards|upload-only)" ;;
esac

log "Backup complete: $STAGE_DIR"
notify_slack "✅ Backup complete — target=$TARGET"
exit 0
