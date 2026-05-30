from __future__ import annotations
from typing import Any

def paginate(items: list, cursor: str | None = None, limit: int = 20) -> dict[str, Any]:
    start = 0
    if cursor:
        for i, item in enumerate(items):
            if getattr(item, 'id', None) == cursor:
                start = i + 1
                break
    page = items[start:start + limit]
    has_more = start + limit < len(items)
    next_cursor = page[-1].id if page and has_more else None
    return {"data": page, "pagination": {"cursor": next_cursor, "has_more": has_more, "total_count": len(items)}}
