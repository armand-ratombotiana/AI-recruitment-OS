"""Audit helpers — both legacy GDPR entries and the new operational audit log.

This package replaces the previous ``shared/audit.py`` module.  Existing
callers that did ``from shared.audit import audit`` keep working via the
re-export below, and the new operational helpers live in
:mod:`shared.audit.logger`.
"""
from shared.audit.legacy import audit

__all__ = ["audit"]
