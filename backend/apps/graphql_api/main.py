"""GraphQL API router — Strawberry GraphQL endpoint for AI-ROS."""

from __future__ import annotations

from typing import Any

import strawberry
from fastapi import APIRouter, Request
from strawberry.fastapi import GraphQLRouter

from apps.graphql_api.queries import Query
from apps.graphql_api.mutations import Mutation
from shared.core.database import get_db_session
from shared.core.security import decode_token

schema = strawberry.Schema(query=Query, mutation=Mutation)


async def get_context(request: Request) -> dict[str, Any]:
    authorization = request.headers.get("authorization", "")
    payload = decode_token(authorization[7:]) if authorization.startswith("Bearer ") else None

    user_id = payload.get("sub") if payload else None
    tenant_id = payload.get("tenant_id", "default") if payload else "default"

    x_tenant = request.headers.get("x-tenant-id")
    if x_tenant:
        tenant_id = x_tenant

    db_session_cm = get_db_session()
    db = await db_session_cm.__aenter__()

    return {
        "db": db,
        "tenant_id": tenant_id,
        "user_id": user_id,
        "_session_cm": db_session_cm,
        "request": request,
    }


class AuthenticatedGraphQLRouter(GraphQLRouter):
    async def get_context(self, request: Request) -> dict[str, Any]:
        return await get_context(request)


router = AuthenticatedGraphQLRouter(schema, path="/graphql")
