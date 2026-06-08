"""Candidate enrichment providers and engine."""
from __future__ import annotations

from shared.enrichment.providers import (
    EnrichmentProvider,
    LinkedInProvider,
    GitHubProvider,
    EmailProvider,
)
from shared.enrichment.engine import enrich_candidate, enrich_batch

__all__ = [
    "EnrichmentProvider",
    "LinkedInProvider",
    "GitHubProvider",
    "EmailProvider",
    "enrich_candidate",
    "enrich_batch",
]