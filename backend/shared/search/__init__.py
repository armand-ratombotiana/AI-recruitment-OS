"""Shared search module — advanced search with filters, facets, and suggestions."""
from .advanced import (
    SearchQuery,
    SearchResult,
    SearchType,
    SortField,
    SortOrder,
    FilterOperator,
    FacetConfig,
    apply_filters,
    apply_sort,
    compute_facets,
    get_facet_values,
)

__all__ = [
    "SearchQuery",
    "SearchResult",
    "SearchType",
    "SortField",
    "SortOrder",
    "FilterOperator",
    "FacetConfig",
    "apply_filters",
    "apply_sort",
    "compute_facets",
    "get_facet_values",
]