"""Backup engine — tenant-scoped backup and restore operations.

Backup payloads are persisted as JSON files on disk under ``BACKUP_DIR``
(default ``/tmp/airos-backups``, configurable via environment variable).
Each backup is stored as ``<backup_id>.json`` so payloads survive
process restarts.
"""
