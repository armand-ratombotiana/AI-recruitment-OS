#!/bin/bash
echo "Backing up AI-ROS data..."

BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup PostgreSQL
echo "Backing up PostgreSQL..."
docker exec airos-postgres pg_dump -U airos airos > "$BACKUP_DIR/postgres.sql"

# Backup Redis
echo "Backing up Redis..."
docker exec airos-redis redis-cli BGSAVE
docker cp airos-redis:/data/dump.rdb "$BACKUP_DIR/redis.rdb"

# Backup Grafana
echo "Backing up Grafana dashboards..."
docker cp airos-grafana:/var/lib/grafana/dashboards "$BACKUP_DIR/grafana-dashboards"

echo "Backup complete: $BACKUP_DIR"