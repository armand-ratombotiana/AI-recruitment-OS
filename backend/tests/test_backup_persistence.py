"""Tests for file-based backup payload persistence."""
from __future__ import annotations

import os
import tempfile

import pytest

from shared.backup.engine import (
    BACKUP_DIR,
    _delete_backup_payload,
    _load_backup_payload,
    _save_backup_payload,
)


@pytest.fixture(autouse=True)
def _isolated_backup_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("shared.backup.engine.BACKUP_DIR", tmp_path)
    yield tmp_path


def test_save_and_load_backup():
    backup_id = "test-backup-123"
    payload = {"data": "test", "count": 42}

    filepath = _save_backup_payload(backup_id, payload)
    assert os.path.exists(filepath)

    loaded = _load_backup_payload(backup_id)
    assert loaded == payload

    _delete_backup_payload(backup_id)
    assert not os.path.exists(filepath)


def test_load_nonexistent_backup():
    with pytest.raises(FileNotFoundError):
        _load_backup_payload("nonexistent-backup")


def test_delete_nonexistent_backup_is_safe():
    _delete_backup_payload("does-not-exist")


def test_save_overwrites_existing():
    backup_id = "overwrite-test"
    _save_backup_payload(backup_id, {"v": 1})
    _save_backup_payload(backup_id, {"v": 2})
    assert _load_backup_payload(backup_id) == {"v": 2}
    _delete_backup_payload(backup_id)


def test_payload_with_nested_data():
    backup_id = "nested-test"
    payload = {
        "version": 1,
        "resources": {
            "candidates": [{"id": "c1", "name": "Alice"}],
            "jobs": [{"id": "j1", "title": "Engineer"}],
        },
        "meta": {"includes": ["candidates", "jobs"], "resource_counts": {"candidates": 1, "jobs": 1}},
    }
    _save_backup_payload(backup_id, payload)
    assert _load_backup_payload(backup_id) == payload
    _delete_backup_payload(backup_id)
