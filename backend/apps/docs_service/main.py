"""Documentation Service — enhanced API docs, examples, Postman, search, changelog.

Endpoints:

* ``GET /api/v1/docs``              — Enhanced OpenAPI documentation
* ``GET /api/v1/docs/examples``     — Example data for all entities
* ``GET /api/v1/docs/postman``      — Postman collection v2.1
* ``GET /api/v1/docs/search``       — Search endpoints by keyword
* ``GET /api/v1/docs/changelog``    — API changelog
* ``GET /api/v1/docs/sdk``          — SDK generation helpers
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from shared.auth import require_member, require_tenant_id
from shared.docs.examples import (
    get_all_examples,
    get_entity_examples,
    get_error_examples,
)
from shared.docs.openapi import (
    build_enhanced_openapi,
    get_endpoint_summary,
    get_tag_summary,
)


# ── Schemas ────────────────────────────────────────────────────────────────────


class SearchResult(BaseModel):
    method: str
    path: str
    summary: str
    tags: list[str]
    score: float = 0.0


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
    total: int


class ChangelogEntry(BaseModel):
    date: str
    version: str
    type: str = Field(..., pattern=r"^(breaking|feature|fix|deprecation)$")
    description: str
    endpoints: list[str] = Field(default_factory=list)


class ChangelogResponse(BaseModel):
    entries: list[ChangelogEntry]
    total: int


class SDKInfo(BaseModel):
    language: str
    package_name: str
    install_command: str
    base_url: str
    auth_type: str
    getting_started: str


class SDKResponse(BaseModel):
    sdks: list[SDKInfo]
    openapi_url: str


class DocsIndexResponse(BaseModel):
    info: dict[str, Any]
    servers: list[dict[str, str]]
    tags: list[dict[str, Any]]
    endpoints: list[dict[str, Any]]
    security: list[dict[str, Any]]
    common_errors: dict[str, Any]


# ── Changelog data ─────────────────────────────────────────────────────────────

_CHANGELOG: list[ChangelogEntry] = [
    ChangelogEntry(
        date="2025-06-10",
        version="1.0.0",
        type="feature",
        description="Enhanced API documentation with OpenAPI examples, Postman collection, and search.",
        endpoints=["/api/v1/docs", "/api/v1/docs/examples", "/api/v1/docs/postman"],
    ),
    ChangelogEntry(
        date="2025-06-01",
        version="1.0.0",
        type="feature",
        description="Initial release — full recruitment OS API with 30+ service modules.",
        endpoints=["/api/v1/auth", "/api/v1/candidates", "/api/v1/jobs", "/api/v1/interviews"],
    ),
    ChangelogEntry(
        date="2025-05-15",
        version="0.9.0",
        type="feature",
        description="Added PPE (Pair Programming Evaluation) service with live coding sessions.",
        endpoints=["/api/v1/ppe"],
    ),
    ChangelogEntry(
        date="2025-05-01",
        version="0.8.0",
        type="feature",
        description="Added workflow automation engine with triggers and actions.",
        endpoints=["/api/v1/workflows", "/api/v1/workflow-automation"],
    ),
    ChangelogEntry(
        date="2025-04-15",
        version="0.7.0",
        type="breaking",
        description="Unified authentication: all endpoints now require Bearer JWT. API key auth added for service-to-service.",
        endpoints=["/api/v1/auth"],
    ),
    ChangelogEntry(
        date="2025-04-01",
        version="0.6.0",
        type="feature",
        description="Added webhook subscriptions with HMAC signing and retry logic.",
        endpoints=["/api/v1/webhooks"],
    ),
    ChangelogEntry(
        date="2025-03-15",
        version="0.5.0",
        type="fix",
        description="Fixed candidate deduplication logic for fuzzy email matching.",
        endpoints=["/api/v1/candidates"],
    ),
    ChangelogEntry(
        date="2025-03-01",
        version="0.5.0",
        type="deprecation",
        description="Deprecated /api/v1/candidates/search in favor of /api/v1/search/candidates.",
        endpoints=["/api/v1/search/candidates"],
    ),
    ChangelogEntry(
        date="2025-02-15",
        version="0.4.0",
        type="feature",
        description="Added billing service with subscription management and usage tracking.",
        endpoints=["/api/v1/billing"],
    ),
    ChangelogEntry(
        date="2025-02-01",
        version="0.3.0",
        type="feature",
        description="Added semantic vector search for candidates and jobs.",
        endpoints=["/api/v1/search"],
    ),
]


# ── SDK data ───────────────────────────────────────────────────────────────────

_SDKS: list[SDKInfo] = [
    SDKInfo(
        language="python",
        package_name="airos-sdk",
        install_command="pip install airos-sdk",
        base_url="https://api.ai-ros.io",
        auth_type="bearer",
        getting_started=(
            "from airos import Client\n"
            "client = Client(api_key='your-api-key')\n"
            "candidates = client.candidates.list(limit=10)\n"
        ),
    ),
    SDKInfo(
        language="javascript",
        package_name="@airos/sdk",
        install_command="npm install @airos/sdk",
        base_url="https://api.ai-ros.io",
        auth_type="bearer",
        getting_started=(
            "import { AIROS } from '@airos/sdk';\n"
            "const client = new AIROS({ apiKey: 'your-api-key' });\n"
            "const candidates = await client.candidates.list({ limit: 10 });\n"
        ),
    ),
    SDKInfo(
        language="typescript",
        package_name="@airos/sdk",
        install_command="npm install @airos/sdk",
        base_url="https://api.ai-ros.io",
        auth_type="bearer",
        getting_started=(
            "import { AIROS } from '@airos/sdk';\n"
            "const client = new AIROS({ apiKey: 'your-api-key' });\n"
            "const candidates = await client.candidates.list({ limit: 10 });\n"
        ),
    ),
    SDKInfo(
        language="go",
        package_name="github.com/ai-ros/airos-go",
        install_command="go get github.com/ai-ros/airos-go",
        base_url="https://api.ai-ros.io",
        auth_type="bearer",
        getting_started=(
            'client := airos.NewClient("your-api-key")\n'
            "candidates, err := client.Candidates.List(ctx, &airos.ListParams{Limit: 10})\n"
        ),
    ),
    SDKInfo(
        language="curl",
        package_name="curl",
        install_command="# Built-in on most systems",
        base_url="https://api.ai-ros.io",
        auth_type="bearer",
        getting_started=(
            'curl -H "Authorization: Bearer <token>" \\\n'
            '     -H "X-Tenant-ID: <tenant-id>" \\\n'
            "     https://api.ai-ros.io/api/v1/candidates?limit=10\n"
        ),
    ),
]


# ── Router ─────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", tags=["Docs"])
async def health() -> dict[str, str]:
    return {"status": "healthy", "service": "docs"}


@router.get(
    "",
    response_model=DocsIndexResponse,
    tags=["Docs"],
    summary="Enhanced API documentation index",
)
async def get_docs(
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> DocsIndexResponse:
    from main import app as main_app

    schema = build_enhanced_openapi(main_app)
    return DocsIndexResponse(
        info=schema.get("info", {}),
        servers=schema.get("servers", []),
        tags=get_tag_summary(schema),
        endpoints=get_endpoint_summary(schema),
        security=schema.get("components", {}).get("securitySchemes", {}),
        common_errors=schema.get("x-common-responses", {}),
    )


@router.get(
    "/openapi",
    tags=["Docs"],
    summary="Full enhanced OpenAPI schema (JSON)",
)
async def get_openapi_schema(
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> dict[str, Any]:
    from main import app as main_app

    return build_enhanced_openapi(main_app)


@router.get(
    "/examples",
    tags=["Docs"],
    summary="Example data for all entities and endpoints",
)
async def get_examples(
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> dict[str, Any]:
    return {
        "entities": get_entity_examples(),
        "endpoints": get_all_examples(),
        "errors": get_error_examples(),
    }


@router.get(
    "/postman",
    tags=["Docs"],
    summary="Postman Collection v2.1",
)
async def get_postman_collection(
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> dict[str, Any]:
    from main import app as main_app

    schema = build_enhanced_openapi(main_app)
    return _build_postman_collection(schema)


@router.get(
    "/search",
    response_model=SearchResponse,
    tags=["Docs"],
    summary="Search API endpoints by keyword",
)
async def search_endpoints(
    q: str = Query(..., min_length=1, max_length=200, description="Search query"),
    limit: int = Query(default=20, ge=1, le=100),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> SearchResponse:
    from main import app as main_app

    schema = build_enhanced_openapi(main_app)
    endpoints = get_endpoint_summary(schema)
    results = _search_endpoints(endpoints, q, limit)
    return SearchResponse(query=q, results=results, total=len(results))


@router.get(
    "/changelog",
    response_model=ChangelogResponse,
    tags=["Docs"],
    summary="API changelog",
)
async def get_changelog(
    type: Optional[str] = Query(default=None, description="Filter by type: breaking, feature, fix, deprecation"),
    limit: int = Query(default=50, ge=1, le=200),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> ChangelogResponse:
    entries = _CHANGELOG
    if type:
        entries = [e for e in entries if e.type == type]
    entries = entries[:limit]
    return ChangelogResponse(entries=entries, total=len(entries))


@router.get(
    "/sdk",
    response_model=SDKResponse,
    tags=["Docs"],
    summary="SDK generation helpers and getting started guides",
)
async def get_sdk_info(
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> SDKResponse:
    return SDKResponse(
        sdks=_SDKS,
        openapi_url="/openapi.json",
    )


# ── Helpers ────────────────────────────────────────────────────────────────────


def _search_endpoints(
    endpoints: list[dict[str, Any]],
    query: str,
    limit: int,
) -> list[SearchResult]:
    """Simple keyword search across endpoint metadata."""
    q = query.lower()
    scored: list[SearchResult] = []

    for ep in endpoints:
        score = 0.0
        searchable = " ".join([
            ep.get("path", ""),
            ep.get("summary", ""),
            ep.get("description", ""),
            ep.get("operationId", ""),
            " ".join(ep.get("tags", [])),
        ]).lower()

        for term in q.split():
            if term in searchable:
                if term in ep.get("path", "").lower():
                    score += 3.0
                elif term in ep.get("summary", "").lower():
                    score += 2.0
                elif term in " ".join(ep.get("tags", [])).lower():
                    score += 1.5
                else:
                    score += 1.0

        if score > 0:
            scored.append(SearchResult(
                method=ep["method"],
                path=ep["path"],
                summary=ep.get("summary", ""),
                tags=ep.get("tags", []),
                score=score,
            ))

    scored.sort(key=lambda r: r.score, reverse=True)
    return scored[:limit]


def _build_postman_collection(schema: dict[str, Any]) -> dict[str, Any]:
    """Convert an OpenAPI schema into a Postman Collection v2.1."""
    items: list[dict[str, Any]] = []
    tag_folders: dict[str, list[dict[str, Any]]] = {}

    servers = schema.get("servers", [])
    base_url = servers[0]["url"] if servers else "http://localhost:8000"

    for path, methods in schema.get("paths", {}).items():
        for method, operation in methods.items():
            if not isinstance(operation, dict):
                continue

            tags = operation.get("tags", ["Untagged"])
            primary_tag = tags[0] if tags else "Untagged"

            request_item = _build_postman_item(
                method=method,
                path=path,
                operation=operation,
                base_url=base_url,
            )

            tag_folders.setdefault(primary_tag, []).append(request_item)

    for tag_name, tag_items in sorted(tag_folders.items()):
        items.append({
            "name": tag_name,
            "item": tag_items,
        })

    return {
        "info": {
            "name": schema.get("info", {}).get("title", "AI-ROS API"),
            "description": schema.get("info", {}).get("description", ""),
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
            "version": schema.get("info", {}).get("version", "1.0.0"),
        },
        "auth": {
            "type": "bearer",
            "bearer": [{"key": "token", "value": "{{access_token}}", "type": "string"}],
        },
        "variable": [
            {"key": "base_url", "value": base_url, "type": "string"},
            {"key": "access_token", "value": "", "type": "string"},
            {"key": "tenant_id", "value": "tenant_default", "type": "string"},
        ],
        "item": items,
    }


def _build_postman_item(
    method: str,
    path: str,
    operation: dict[str, Any],
    base_url: str,
) -> dict[str, Any]:
    """Build a single Postman request item."""
    path_segments = [s for s in path.split("/") if s]
    query_params: list[dict[str, Any]] = []

    for param in operation.get("parameters", []):
        if param.get("in") == "query":
            query_params.append({
                "key": param.get("name", ""),
                "value": "",
                "description": param.get("description", ""),
            })

    url_path = ":" + "/:".join(path_segments) if path_segments else ""

    request_body = None
    req_body_schema = operation.get("requestBody", {})
    if req_body_schema:
        content = req_body_schema.get("content", {})
        json_content = content.get("application/json", {})
        if json_content.get("schema", {}).get("$ref"):
            request_body = {
                "mode": "raw",
                "raw": "{}",
                "options": {"raw": {"language": "json"}},
            }

    item: dict[str, Any] = {
        "name": operation.get("summary", f"{method.upper()} {path}"),
        "request": {
            "method": method.upper(),
            "header": [
                {
                    "key": "X-Tenant-ID",
                    "value": "{{tenant_id}}",
                    "description": "Tenant identifier",
                },
            ],
            "url": {
                "raw": "{{base_url}}" + path,
                "host": ["{{base_url}}"],
                "path": path_segments,
                "query": query_params,
            },
        },
        "response": [],
    }

    if request_body:
        item["request"]["body"] = request_body

    return item
