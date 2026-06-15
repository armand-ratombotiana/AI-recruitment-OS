"""GraphQL API router — Strawberry GraphQL endpoint for AI-ROS."""

from __future__ import annotations

from typing import Any, Callable

import strawberry
from fastapi import Request
from strawberry.fastapi import GraphQLRouter

from apps.graphql_api.queries import Query
from apps.graphql_api.mutations import Mutation
from shared.core.database import async_session_factory
from shared.core.security import decode_token

schema = strawberry.Schema(query=Query, mutation=Mutation)


def _extract_auth(request: Request) -> tuple[str | None, str]:
    authorization = request.headers.get("authorization", "")
    payload = decode_token(authorization[7:]) if authorization.startswith("Bearer ") else None

    user_id = payload.get("sub") if payload else None
    tenant_id = payload.get("tenant_id", "default") if payload else "default"

    x_tenant = request.headers.get("x-tenant-id")
    if x_tenant:
        tenant_id = x_tenant

    return user_id, tenant_id


async def _make_context(
    request: Request,
    session_factory: Callable | None = None,
) -> dict[str, Any]:
    user_id, tenant_id = _extract_auth(request)

    factory = session_factory or async_session_factory
    db = factory()

    async def _cleanup():
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        finally:
            await db.close()

    return {
        "db": db,
        "tenant_id": tenant_id,
        "user_id": user_id,
        "request": request,
        "cleanup": _cleanup,
    }


def make_context_getter(session_factory: Callable | None = None):
    async def context_getter(request: Request) -> dict[str, Any]:
        return await _make_context(request, session_factory=session_factory)
    return context_getter


router = GraphQLRouter(
    schema,
    path="/graphql",
    context_getter=make_context_getter(),
)
