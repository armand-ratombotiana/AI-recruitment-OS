"""Backup engine — tenant-scoped backup and restore operations.

Backups are stored as JSON-serialisable dictionaries in a process-level
in-memory store keyed by ``backup_id``.  The store is intentionally
simple: it gives the API a stable, isolated place to put snapshot
payloads while the persistent :class:`~shared.core.models.backup.Backup`
row carries the metadata that drives the UI and audit trail.
"""
