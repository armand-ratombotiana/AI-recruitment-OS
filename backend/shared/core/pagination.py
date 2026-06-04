"""Standardized pagination helpers for list endpoints.

The shape we promise clients::

    {
        "data": [ ... ],
        "total": 1234,
        "limit": 50,
        "offset": 0,
        "has_more": true
    }

We also emit a `Link` header (HATEOAS)::

    Link: <https://api/x?limit=50&offset=0>; rel="first",
          <https://api/x?limit=50&offset=50>; rel="next",
          <https://api/x?limit=50&offset=1200>; rel="last"

Callers typically do::

    page = PaginationParams(limit=req.query_params.get("limit"),
                            offset=req.query_params.get("offset"),
                            cursor=req.query_params.get("cursor"))
    items, total = await fetch_items(page, ...)
    return page.build_response(items, total, request=request)
"""
from __future__ import annotations

import base64
import json
import logging
import math
from dataclasses import dataclass
from typing import Any, Sequence
from urllib.parse import urlencode

from fastapi import Query, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("pagination")


DEFAULT_LIMIT = 20
MAX_LIMIT = 100


@dataclass
class PaginationParams:
    limit: int = DEFAULT_LIMIT
    offset: int = 0
    cursor: str | None = None

    @classmethod
    def from_query(
        cls,
        limit: int | None = Query(default=None, ge=1, le=MAX_LIMIT),
        offset: int | None = Query(default=None, ge=0),
        cursor: str | None = Query(default=None),
    ) -> "PaginationParams":
        l = min(limit or DEFAULT_LIMIT, MAX_LIMIT)
        o = max(offset or 0, 0)
        return cls(limit=l, offset=o, cursor=cursor)

    @property
    def has_more(self) -> bool:
        return self.cursor is not None

    def cursor_decode(self) -> dict[str, Any] | None:
        if not self.cursor:
            return None
        try:
            pad = "=" * (-len(self.cursor) % 4)
            data = base64.urlsafe_b64decode(self.cursor + pad)
            return json.loads(data)
        except Exception:
            return None

    @staticmethod
    def cursor_encode(payload: dict[str, Any]) -> str:
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    def build_response(
        self,
        data: Sequence[Any],
        total: int,
        *,
        request: Request | None = None,
        next_cursor: str | None = None,
        include_pagination_headers: bool = True,
    ) -> JSONResponse:
        has_more = bool(next_cursor) or (self.offset + len(data) < total)
        body = {
            "data": list(data),
            "total": total,
            "limit": self.limit,
            "offset": self.offset,
            "has_more": has_more,
        }
        if next_cursor:
            body["next_cursor"] = next_cursor
        resp = JSONResponse(content=body)
        if include_pagination_headers and request is not None:
            link = _build_link_header(request, self, total=total, next_cursor=next_cursor)
            if link:
                resp.headers["Link"] = link
            resp.headers["X-Total-Count"] = str(total)
            resp.headers["X-Limit"] = str(self.limit)
            resp.headers["X-Offset"] = str(self.offset)
        return resp


def _build_link_header(
    request: Request, page: PaginationParams, *, total: int, next_cursor: str | None
) -> str:
    try:
        base = str(request.url).split("?", 1)[0]
    except Exception:
        return ""

    def _q(extra: dict[str, Any]) -> str:
        params: dict[str, Any] = dict(request.query_params)
        params.update(extra)
        params.pop("cursor", None)
        return f"{base}?{urlencode(params)}"

    links: list[str] = []
    # first
    links.append(f'<{_q({"limit": page.limit, "offset": 0})}>; rel="first"')
    # last
    if page.limit > 0 and total > 0:
        last_offset = max(0, (math.ceil(total / page.limit) - 1) * page.limit)
        links.append(f'<{_q({"limit": page.limit, "offset": last_offset})}>; rel="last"')
    # prev
    if page.offset > 0:
        prev_offset = max(0, page.offset - page.limit)
        links.append(f'<{_q({"limit": page.limit, "offset": prev_offset})}>; rel="prev"')
    # next
    if next_cursor:
        links.append(f'<{_q({"limit": page.limit, "offset": page.offset + page.limit, "cursor": next_cursor})}>; rel="next"')
    elif page.offset + page.limit < total:
        links.append(f'<{_q({"limit": page.limit, "offset": page.offset + page.limit})}>; rel="next"')
    return ", ".join(links)
