"""Enhanced OpenAPI schema generation for AI-ROS API.

Provides helpers to enrich the auto-generated OpenAPI 3.1 schema with
per-endpoint examples, authentication documentation, and structured
metadata that makes the API easier to consume from Postman, Insomnia,
and generated SDKs.
"""
from __future__ import annotations

import copy
from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from shared.docs.examples import (
    get_all_examples,
    get_error_examples,
    get_example_by_tag,
)


_SECURITY_SCHEMES: dict[str, Any] = {
    "BearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": (
            "JWT access token obtained from `POST /api/v1/auth/login`. "
            "Include as `Authorization: Bearer <token>`."
        ),
    },
    "ApiKeyAuth": {
        "type": "apiKey",
        "in": "header",
        "name": "X-API-Key",
        "description": (
            "Service-to-service API key issued via "
            "`POST /api/v1/auth/api-keys`. Use as `X-API-Key: <key>` "
            "or `Authorization: Bearer <key>`."
        ),
    },
}

_SERVERS: list[dict[str, str]] = [
    {"url": "http://localhost:8000", "description": "Local development"},
    {"url": "https://api.ai-ros.io", "description": "Production"},
    {"url": "https://staging.api.ai-ros.io", "description": "Staging"},
]

_CONTACT: dict[str, str] = {
    "name": "AI-ROS Engineering",
    "email": "engineering@ai-ros.io",
    "url": "https://github.com/ai-ros/ai-ros",
}

_LICENSE: dict[str, str] = {
    "name": "Proprietary",
    "url": "https://ai-ros.io/license",
}


def build_enhanced_openapi(app: FastAPI) -> dict[str, Any]:
    """Build a fully-enhanced OpenAPI 3.1 schema for *app*.

    Enrichments applied on top of the standard FastAPI schema:
    * Contact / license metadata
    * Multiple server entries (dev, staging, prod)
    * Security schemes (Bearer JWT + API key)
    * Per-endpoint ``x-codeSamples`` and ``x-examples`` extensions
    * Common error response schemas injected into every operation
    """
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        tags=app.openapi_tags,
    )

    schema["info"]["contact"] = _CONTACT
    schema["info"]["license"] = _LICENSE
    schema["info"]["x-api-family"] = "AI-ROS Recruitment OS"
    schema["servers"] = _SERVERS

    schema.setdefault("components", {})
    schema["components"]["securitySchemes"] = copy.deepcopy(_SECURITY_SCHEMES)
    schema["security"] = [{"BearerAuth": []}, {"ApiKeyAuth": []}]

    _inject_common_error_schemas(schema)
    _enrich_paths_with_examples(schema)

    return schema


def _inject_common_error_schemas(schema: dict[str, Any]) -> None:
    """Add reusable error response components."""
    components = schema.setdefault("components", {})
    schemas = components.setdefault("schemas", {})

    error_examples = get_error_examples()
    for name, example in error_examples.items():
        schemas[f"Error{name}"] = {
            "type": "object",
            "properties": {
                "error": {
                    "type": "object",
                    "properties": {
                        "code": {"type": "string", "example": example["error"]["code"]},
                        "message": {"type": "string", "example": example["error"]["message"]},
                    },
                    "required": ["code", "message"],
                },
            },
            "required": ["error"],
            "x-example": example,
        }

    common_responses = {
        "401": {
            "description": "Missing or invalid authentication",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/ErrorUnauthorized"},
                },
            },
        },
        "403": {
            "description": "Authenticated but insufficient permissions",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/ErrorForbidden"},
                },
            },
        },
        "404": {
            "description": "Requested resource not found",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/ErrorNotFound"},
                },
            },
        },
        "422": {
            "description": "Validation error",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/ErrorValidation"},
                },
            },
        },
        "429": {
            "description": "Rate limit exceeded",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/ErrorRateLimit"},
                },
            },
        },
    }

    schema["x-common-responses"] = common_responses


def _enrich_paths_with_examples(schema: dict[str, Any]) -> None:
    """Inject ``x-examples`` into each operation from the examples registry."""
    all_examples = get_all_examples()
    paths: dict[str, Any] = schema.get("paths", {})

    for path, methods in paths.items():
        for method, operation in methods.items():
            if not isinstance(operation, dict):
                continue
            tags = operation.get("tags", [])
            operation_id = operation.get("operationId", "")

            matched = _match_examples(all_examples, path, method, tags, operation_id)
            if matched:
                operation["x-examples"] = matched


def _match_examples(
    all_examples: dict[str, Any],
    path: str,
    method: str,
    tags: list[str],
    operation_id: str,
) -> list[dict[str, Any]]:
    """Return matching examples for a given endpoint."""
    matched: list[dict[str, Any]] = []
    key = f"{method.upper()} {path}"

    if key in all_examples:
        entry = all_examples[key]
        matched.append({
            "summary": entry.get("summary", key),
            "request": entry.get("request"),
            "response": entry.get("response"),
        })

    for tag in tags:
        tag_examples = get_example_by_tag(tag)
        for ex in tag_examples:
            matched.append({
                "summary": ex.get("summary", tag),
                "request": ex.get("request"),
                "response": ex.get("response"),
            })

    return matched


def get_endpoint_summary(schema: dict[str, Any]) -> list[dict[str, Any]]:
    """Return a flat list of all endpoints with their metadata."""
    endpoints: list[dict[str, Any]] = []
    for path, methods in schema.get("paths", {}).items():
        for method, operation in methods.items():
            if not isinstance(operation, dict):
                continue
            endpoints.append({
                "method": method.upper(),
                "path": path,
                "summary": operation.get("summary", ""),
                "description": operation.get("description", ""),
                "tags": operation.get("tags", []),
                "operationId": operation.get("operationId", ""),
                "deprecated": operation.get("deprecated", False),
                "security": operation.get("security", []),
            })
    return endpoints


def get_tag_summary(schema: dict[str, Any]) -> list[dict[str, Any]]:
    """Return tag-level summary with endpoint counts."""
    tag_counts: dict[str, int] = {}
    for methods in schema.get("paths", {}).values():
        for method, operation in methods.items():
            if not isinstance(operation, dict):
                continue
            for tag in operation.get("tags", []):
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

    tag_meta = {t["name"]: t for t in schema.get("tags", [])}
    result: list[dict[str, Any]] = []
    for name, count in sorted(tag_counts.items()):
        meta = tag_meta.get(name, {})
        result.append({
            "name": name,
            "description": meta.get("description", ""),
            "endpoint_count": count,
        })
    return result
