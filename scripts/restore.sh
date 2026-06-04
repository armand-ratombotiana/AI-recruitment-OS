#!/usr/bin/env bash
# =============================================================================
# AI-ROS — Restore script
# =============================================================================
# Restores a PostgreSQL backup produced by scripts/backup.sh.
#
# Usage:
#   ./scripts/restore.sh                              # restore the most recent local dump
#   ./scripts/restore.sh --from <path>                # restore a specific file
#   ./scripts/restore.sh --from-s3 <date|latest>      # pull a specific dump from S3
#   ./scripts/restore.sh --to "<YYYY-MM-DD HH:MM:SS UTC>"   # PITR
#   ./scripts/restore.sh --db-name <name>             # target DB (default: airos_restore)
#   ./scripts/restore.sh --confirm                    # actually do it
#   ./scripts/restore.sh --dry-run                    # only print the plan
#
# Safety:
#   - Refuses to overwrite a non-empty database unless --force is passed
#   - Refuses to run without --confirm unless --dry-run is set
#   - Always logs to backups/restore.log
# =============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-}"
LOG_FILE="$BACKUP_DIR/restore.log"

# Defaults
SRC=""
SRC_MODE="local"        # local | s3
S3_KEY=""
TARGET_DB="airos_restore"
CONFIRM=0
DRY_RUN=0
FORCE=0
PITR_TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)        SRC="$2"; shift 2 ;;
    --from-s3)     SRC_MODE="s3"; S3_KEY="$2"; shift 2 ;;
    --to)          PITR_TARGET="$2"; shift 2 ;;
    --db-name)     TARGET_DB="$2"; shift 2 ;;
    --confirm)     CONFIRM=1; shift ;;
    --dry-run)     DRY_RUN=1; shift ;;
    --force)       FORCE=1; shift ;;
    -h|--help)
      sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

mkdir -p "$BACKUP_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-airos}"
export PGPASSWORD="${PGPASSWORD:-airos_dev_password}"

# ── Helpers ──────────────────────────────────────────────────────────────────

log()      { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
require()  { command -v "$1" >/dev/null 2>&1 || { echo "FATAL: $1 not found" >&2; exit 1; }; }
die()      { log "FATAL: $*"; exit 1; }

PSQL() {
  if command -v psql >/dev/null 2>&1; then
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"
  elif command -v docker >/dev/null 2>&1; then
    docker exec -e PGPASSWORD airos-postgres psql -U "$PGUSER" "$@"
  else
    die "neither psql nor docker found"
  fi
}

# ── Resolve source dump ─────────────────────────────────────────────────────

resolve_source() {
  if [[ -n "$SRC" ]]; then
    if [[ ! -f "$SRC" ]]; then die "Source file not found: $SRC"; fi
    SRC_FILE="$SRC"
    log "Source (local): $SRC_FILE"
    return
  fi

  if [[ "$SRC_MODE" == "s3" ]]; then
    [[ -z "$BACKUP_S3_BUCKET" ]] && die "BACKUP_S3_BUCKET not set"
    require aws
    if [[ "$S3_KEY" == "latest" ]]; then
      S3_KEY="postgres/latest/postgres.sql.gz"
    elif [[ "$S3_KEY" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
      S3_KEY="postgres/daily/${S3_KEY}/postgres.sql.gz"
    elif [[ "$S3_KEY" != *"/"* ]]; then
      S3_KEY="postgres/daily/${S3_KEY}/postgres.sql.gz"
    fi
    SRC_FILE="$BACKUP_DIR/$(basename "$S3_KEY")"
    log "Source (s3):   s3://${BACKUP_S3_BUCKET}/${S3_KEY}"
    aws s3 cp "s3://${BACKUP_S3_BUCKET}/${S3_KEY}" "$SRC_FILE" --only-show-errors \
      || die "S3 download failed"
  else
    # Default: most recent local dump
    SRC_FILE="$(ls -1t "$BACKUP_DIR"/daily/*/postgres.sql.gz 2>/dev/null | head -1 || true)"
    [[ -z "$SRC_FILE" ]] && SRC_FILE="$BACKUP_DIR/latest/postgres.sql.gz"
    [[ -f "$SRC_FILE" ]] || die "No local backup found in $BACKUP_DIR"
    log "Source (auto): $SRC_FILE"
  fi
}

# ── Pre-flight checks ────────────────────────────────────────────────────────

preflight() {
  [[ -f "$SRC_FILE" ]] || die "Source file does not exist: $SRC_FILE"
  if ! gzip -t "$SRC_FILE" 2>/dev/null; then
    die "Source file failed gzip integrity check — refusing to restore"
  fi
  if ! zcat "$SRC_FILE" | head -c 4KB | grep -q "PostgreSQL database dump"; then
    die "Source file is not a pg_dump — refusing to restore"
  fi

  # Make sure the target database exists, is empty, and we can write to it
  local existing
  existing="$(PSQL -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${TARGET_DB}'" 2>/dev/null || true)"
  if [[ "$existing" == "1" ]]; then
    local count
    count="$(PSQL -d "$TARGET_DB" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null || echo 0)"
    if [[ "$count" -gt 0 ]] && [[ "$FORCE" -ne 1 ]]; then
      die "Target database '$TARGET_DB' has $count tables. Use --force to overwrite or pick a different --db-name."
    fi
  else
    log "Creating database: $TARGET_DB"
    [[ "$DRY_RUN" -eq 0 ]] && PSQL -d postgres -c "CREATE DATABASE \"${TARGET_DB}\""
  fi

  # Ensure pgvector is present
  [[ "$DRY_RUN" -eq 0 ]] && PSQL -d "$TARGET_DB" -c "CREATE EXTENSION IF NOT EXISTS vector" >/dev/null
}

# ── Restore ──────────────────────────────────────────────────────────────────

restore() {
  log "Restoring $(du -h "$SRC_FILE" | cut -f1) into $TARGET_DB …"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "(dry-run) would have restored $SRC_FILE into $TARGET_DB"
    return 0
  fi

  # Drop + recreate to be safe
  PSQL -d postgres -c "DROP DATABASE IF EXISTS \"${TARGET_DB}\"" >/dev/null
  PSQL -d postgres -c "CREATE DATABASE \"${TARGET_DB}\"" >/dev/null
  PSQL -d "$TARGET_DB" -c "CREATE EXTENSION IF NOT EXISTS vector" >/dev/null

  if command -v gunzip >/dev/null 2>&1; then
    gunzip -c "$SRC_FILE" | PSQL -d "$TARGET_DB" -v ON_ERROR_STOP=1 -q
  else
    zcat "$SRC_FILE" | PSQL -d "$TARGET_DB" -v ON_ERROR_STOP=1 -q
  fi

  log "Restore complete"
}

# ── Post-restore smoke test ─────────────────────────────────────────────────

verify() {
  log "Running smoke tests against $TARGET_DB"
  local queries=(
    "SELECT count(*) FROM users"
    "SELECT count(*) FROM candidates"
    "SELECT count(*) FROM jobs"
  )
  for q in "${queries[@]}"; do
    local r
    r="$(PSQL -d "$TARGET_DB" -tAc "$q" 2>/dev/null || echo "ERR")"
    log "  $q → $r"
  done
}

# ── Main ─────────────────────────────────────────────────────────────────────

log "Restore started — target DB: $TARGET_DB"

resolve_source
preflight

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "Plan:"
  log "  source: $SRC_FILE"
  log "  target: $TARGET_DB"
  log "  PITR:  ${PITR_TARGET:-(none)}"
  log "Use --confirm to execute."
  exit 0
fi

if [[ "$CONFIRM" -ne 1 ]]; then
  die "Refusing to run without --confirm (use --dry-run to preview)"
fi

restore
verify

if [[ -n "$PITR_TARGET" ]]; then
  log "⚠️  PITR requested ($PITR_TARGET) — manual step required:"
  log "  1. Restore the most recent base backup (this script just did it)"
  log "  2. Configure postgresql.conf with:  restore_command = 'aws s3 cp s3://${BACKUP_S3_BUCKET}/postgres/wal/%f %p'"
  log "  3. Set recovery_target_time = '$PITR_TARGET'"
  log "  4. Start Postgres — it will replay WAL to the target timestamp"
fi

log "Restore done. To switch the application to the restored DB:"
log "  ALTER DATABASE \"$TARGET_DB\" RENAME TO airos;   -- only if you're sure"
exit 0
