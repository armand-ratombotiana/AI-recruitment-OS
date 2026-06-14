"""Tests for the enhanced API documentation system.

Covers:
* shared/docs/examples.py — entity, endpoint, and error examples
* shared/docs/openapi.py — OpenAPI enrichment helpers
* apps/docs_service/main.py — documentation endpoints (search, changelog, SDK, Postman)
"""
from __future__ import annotations

import os
import sys
from typing import Any
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from shared.docs.examples import (
    candidate_example,
    get_all_examples,
    get_entity_examples,
    get_error_examples,
    get_example_by_tag,
    job_example,
    interview_example,
    tenant_example,
    user_example,
    offer_example,
    workflow_example,
    webhook_example,
    billing_example,
    analytics_example,
)
from shared.docs.openapi import (
    build_enhanced_openapi,
    get_endpoint_summary,
    get_tag_summary,
)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_bare_app() -> FastAPI:
    """Minimal FastAPI app for OpenAPI tests (no DB, no middleware)."""
    app = FastAPI(
        title="AI-ROS Test API",
        version="1.0.0",
        description="Test API for documentation",
        openapi_tags=[
            {"name": "Auth", "description": "Authentication"},
            {"name": "Candidates", "description": "Candidates"},
        ],
    )

    @app.get("/api/v1/auth/login", tags=["Auth"], summary="Login")
    async def login():
        return {"access_token": "test"}

    @app.get("/api/v1/candidates", tags=["Candidates"], summary="List candidates")
    async def list_candidates():
        return {"data": []}

    @app.post("/api/v1/candidates", tags=["Candidates"], summary="Create candidate")
    async def create_candidate():
        return {"id": "test"}

    return app


def _make_test_token(role: str = "recruiter", tenant_id: str = "test-tenant") -> str:
    from shared.core.security import create_access_token
    return create_access_token({
        "sub": str(uuid4()),
        "email": "test@example.com",
        "role": role,
        "tenant_id": tenant_id,
    })


def _make_docs_client() -> tuple[AsyncClient, FastAPI]:
    from apps.docs_service.main import router as docs_router

    app = FastAPI(title="AI-ROS Test", version="1.0.0")
    app.include_router(docs_router, prefix="/api/v1/docs")

    transport = ASGITransport(app=app)
    client = AsyncClient(transport=transport, base_url="http://test")
    return client, app


# ── Tests: examples.py ────────────────────────────────────────────────────────


class TestEntityExamples:
    def test_candidate_example_has_required_fields(self):
        ex = candidate_example()
        assert "id" in ex
        assert "email" in ex
        assert "full_name" in ex
        assert "skills" in ex
        assert isinstance(ex["skills"], list)

    def test_job_example_has_required_fields(self):
        ex = job_example()
        assert "id" in ex
        assert "title" in ex
        assert "skills_required" in ex

    def test_interview_example_has_required_fields(self):
        ex = interview_example()
        assert "id" in ex
        assert "candidate_id" in ex
        assert "job_id" in ex
        assert "scheduled_at" in ex

    def test_tenant_example_has_required_fields(self):
        ex = tenant_example()
        assert "id" in ex
        assert "name" in ex
        assert "plan" in ex

    def test_user_example_has_required_fields(self):
        ex = user_example()
        assert "id" in ex
        assert "email" in ex
        assert "role" in ex

    def test_offer_example_has_required_fields(self):
        ex = offer_example()
        assert "id" in ex
        assert "candidate_id" in ex
        assert "salary" in ex

    def test_workflow_example_has_required_fields(self):
        ex = workflow_example()
        assert "id" in ex
        assert "trigger" in ex
        assert "actions" in ex

    def test_webhook_example_has_required_fields(self):
        ex = webhook_example()
        assert "id" in ex
        assert "url" in ex
        assert "events" in ex

    def test_billing_example_has_required_fields(self):
        ex = billing_example()
        assert "plan" in ex
        assert "usage" in ex

    def test_analytics_example_has_required_fields(self):
        ex = analytics_example()
        assert "period" in ex
        assert "pipeline" in ex
        assert "metrics" in ex


class TestErrorExamples:
    def test_error_examples_returns_dict(self):
        errors = get_error_examples()
        assert isinstance(errors, dict)
        assert len(errors) >= 5

    def test_error_examples_have_code_and_message(self):
        errors = get_error_examples()
        for name, example in errors.items():
            assert "error" in example
            assert "code" in example["error"]
            assert "message" in example["error"]

    def test_unauthorized_error_exists(self):
        errors = get_error_examples()
        assert "Unauthorized" in errors
        assert errors["Unauthorized"]["error"]["code"] == "UNAUTHORIZED"


class TestEndpointExamples:
    def test_all_examples_returns_dict(self):
        examples = get_all_examples()
        assert isinstance(examples, dict)
        assert len(examples) >= 5

    def test_all_examples_keys_have_method_path_format(self):
        examples = get_all_examples()
        for key in examples:
            parts = key.split(" ", 1)
            assert len(parts) == 2
            assert parts[0] in ("GET", "POST", "PUT", "PATCH", "DELETE")

    def test_all_examples_have_summary(self):
        examples = get_all_examples()
        for key, ex in examples.items():
            assert "summary" in ex
            assert len(ex["summary"]) > 0

    def test_entity_examples_returns_all_types(self):
        entities = get_entity_examples()
        expected = {"candidate", "job", "interview", "tenant", "user", "offer", "workflow", "webhook", "billing", "analytics"}
        assert expected.issubset(set(entities.keys()))


class TestTagExamples:
    def test_known_tag_returns_examples(self):
        examples = get_example_by_tag("Auth")
        assert len(examples) > 0

    def test_candidates_tag_returns_examples(self):
        examples = get_example_by_tag("Candidates")
        assert len(examples) > 0

    def test_unknown_tag_returns_empty(self):
        examples = get_example_by_tag("NonExistentTag")
        assert examples == []


# ── Tests: openapi.py ─────────────────────────────────────────────────────────


class TestBuildEnhancedOpenAPI:
    def test_schema_has_contact(self):
        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        assert "contact" in schema["info"]
        assert schema["info"]["contact"]["name"] == "AI-ROS Engineering"

    def test_schema_has_license(self):
        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        assert "license" in schema["info"]

    def test_schema_has_servers(self):
        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        assert len(schema["servers"]) >= 2

    def test_schema_has_security_schemes(self):
        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        schemes = schema["components"]["securitySchemes"]
        assert "BearerAuth" in schemes
        assert "ApiKeyAuth" in schemes

    def test_schema_has_global_security(self):
        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        assert len(schema["security"]) >= 1

    def test_schema_has_error_schemas(self):
        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        component_schemas = schema["components"]["schemas"]
        assert "ErrorUnauthorized" in component_schemas
        assert "ErrorNotFound" in component_schemas
        assert "ErrorValidation" in component_schemas

    def test_schema_has_common_responses(self):
        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        assert "x-common-responses" in schema
        common = schema["x-common-responses"]
        assert "401" in common
        assert "403" in common
        assert "404" in common
        assert "422" in common
        assert "429" in common

    def test_schema_has_paths(self):
        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        assert "/api/v1/auth/login" in schema["paths"]
        assert "/api/v1/candidates" in schema["paths"]


class TestEndpointSummary:
    def test_returns_list(self):
        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        endpoints = get_endpoint_summary(schema)
        assert isinstance(endpoints, list)
        assert len(endpoints) >= 3

    def test_endpoint_has_required_fields(self):
        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        endpoints = get_endpoint_summary(schema)
        for ep in endpoints:
            assert "method" in ep
            assert "path" in ep
            assert "tags" in ep

    def test_endpoint_methods_are_uppercase(self):
        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        endpoints = get_endpoint_summary(schema)
        for ep in endpoints:
            assert ep["method"] == ep["method"].upper()


class TestTagSummary:
    def test_returns_list(self):
        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        tags = get_tag_summary(schema)
        assert isinstance(tags, list)
        assert len(tags) >= 1

    def test_tag_has_endpoint_count(self):
        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        tags = get_tag_summary(schema)
        for tag in tags:
            assert "name" in tag
            assert "endpoint_count" in tag
            assert tag["endpoint_count"] >= 1

    def test_candidates_tag_count(self):
        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        tags = get_tag_summary(schema)
        candidates_tag = next((t for t in tags if t["name"] == "Candidates"), None)
        assert candidates_tag is not None
        assert candidates_tag["endpoint_count"] == 2


# ── Tests: docs_service endpoints ─────────────────────────────────────────────


@pytest.mark.asyncio
class TestDocsEndpoints:
    async def test_docs_requires_auth(self):
        async with AsyncClient(
            transport=ASGITransport(app=_make_docs_client()[0] if False else self._app()),
            base_url="http://test",
        ) as client:
            resp = await client.get("/api/v1/docs")
            assert resp.status_code == 401

    async def test_examples_requires_auth(self):
        client, app = _make_docs_client()
        async with client:
            resp = await client.get("/api/v1/docs/examples")
            assert resp.status_code == 401

    async def test_docs_with_valid_token(self):
        client, app = _make_docs_client()
        token = _make_test_token()
        async with client:
            resp = await client.get(
                "/api/v1/docs",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert "info" in data
            assert "tags" in data
            assert "endpoints" in data

    async def test_examples_with_valid_token(self):
        client, app = _make_docs_client()
        token = _make_test_token()
        async with client:
            resp = await client.get(
                "/api/v1/docs/examples",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert "entities" in data
            assert "endpoints" in data
            assert "errors" in data

    async def test_openapi_schema_endpoint(self):
        client, app = _make_docs_client()
        token = _make_test_token()
        async with client:
            resp = await client.get(
                "/api/v1/docs/openapi",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert "info" in data
            assert "paths" in data
            assert "components" in data

    async def test_postman_collection_endpoint(self):
        client, app = _make_docs_client()
        token = _make_test_token()
        async with client:
            resp = await client.get(
                "/api/v1/docs/postman",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert "info" in data
            assert data["info"]["schema"].endswith("collection.json")
            assert "item" in data
            assert "auth" in data

    async def test_changelog_endpoint(self):
        client, app = _make_docs_client()
        token = _make_test_token()
        async with client:
            resp = await client.get(
                "/api/v1/docs/changelog",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert "entries" in data
            assert len(data["entries"]) > 0

    async def test_changelog_filter_by_type(self):
        client, app = _make_docs_client()
        token = _make_test_token()
        async with client:
            resp = await client.get(
                "/api/v1/docs/changelog?type=breaking",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200
            data = resp.json()
            for entry in data["entries"]:
                assert entry["type"] == "breaking"

    async def test_sdk_endpoint(self):
        client, app = _make_docs_client()
        token = _make_test_token()
        async with client:
            resp = await client.get(
                "/api/v1/docs/sdk",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert "sdks" in data
            assert len(data["sdks"]) >= 3
            languages = {s["language"] for s in data["sdks"]}
            assert "python" in languages
            assert "javascript" in languages

    async def test_search_endpoint(self):
        client, app = _make_docs_client()
        token = _make_test_token()
        async with client:
            resp = await client.get(
                "/api/v1/docs/search?q=health",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert "results" in data
            assert data["query"] == "health"

    async def test_search_requires_query(self):
        client, app = _make_docs_client()
        token = _make_test_token()
        async with client:
            resp = await client.get(
                "/api/v1/docs/search",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 422

    async def test_viewer_role_gets_403(self):
        client, app = _make_docs_client()
        token = _make_test_token(role="viewer")
        async with client:
            resp = await client.get(
                "/api/v1/docs",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 403

    async def test_health_endpoint_no_auth(self):
        client, app = _make_docs_client()
        async with client:
            resp = await client.get("/api/v1/docs/health")
            assert resp.status_code == 200
            assert resp.json()["status"] == "healthy"

    async def test_postman_has_variables(self):
        client, app = _make_docs_client()
        token = _make_test_token()
        async with client:
            resp = await client.get(
                "/api/v1/docs/postman",
                headers={"Authorization": f"Bearer {token}"},
            )
            data = resp.json()
            assert "variable" in data
            var_keys = {v["key"] for v in data["variable"]}
            assert "base_url" in var_keys
            assert "access_token" in var_keys
            assert "tenant_id" in var_keys

    async def test_search_returns_scored_results(self):
        client, app = _make_docs_client()
        token = _make_test_token()
        async with client:
            resp = await client.get(
                "/api/v1/docs/search?q=docs",
                headers={"Authorization": f"Bearer {token}"},
            )
            data = resp.json()
            assert data["total"] >= 0
            for result in data["results"]:
                assert result["score"] > 0
                assert "method" in result
                assert "path" in result


# ── Tests: Postman builder internals ──────────────────────────────────────────


class TestPostmanBuilder:
    def test_postman_collection_structure(self):
        from apps.docs_service.main import _build_postman_collection

        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        collection = _build_postman_collection(schema)

        assert collection["info"]["schema"].endswith("collection.json")
        assert "item" in collection
        assert "auth" in collection
        assert collection["auth"]["type"] == "bearer"

    def test_postman_items_grouped_by_tag(self):
        from apps.docs_service.main import _build_postman_collection

        app = _make_bare_app()
        schema = build_enhanced_openapi(app)
        collection = _build_postman_collection(schema)

        folder_names = {item["name"] for item in collection["item"]}
        assert "Auth" in folder_names or "Candidates" in folder_names

    def test_postman_item_has_request(self):
        from apps.docs_service.main import _build_postman_item

        item = _build_postman_item(
            method="get",
            path="/api/v1/candidates",
            operation={"summary": "List candidates", "parameters": []},
            base_url="http://localhost:8000",
        )
        assert item["request"]["method"] == "GET"
        assert "url" in item["request"]


# ── Tests: Search internals ───────────────────────────────────────────────────


class TestSearchInternals:
    def test_search_finds_path_match(self):
        from apps.docs_service.main import _search_endpoints

        endpoints = [
            {"method": "GET", "path": "/api/v1/candidates", "summary": "List candidates", "tags": ["Candidates"], "operationId": ""},
            {"method": "POST", "path": "/api/v1/jobs", "summary": "Create job", "tags": ["Jobs"], "operationId": ""},
        ]
        results = _search_endpoints(endpoints, "candidates", 10)
        assert len(results) >= 1
        assert results[0].path == "/api/v1/candidates"

    def test_search_finds_tag_match(self):
        from apps.docs_service.main import _search_endpoints

        endpoints = [
            {"method": "GET", "path": "/api/v1/candidates", "summary": "List candidates", "tags": ["Candidates"], "operationId": ""},
        ]
        results = _search_endpoints(endpoints, "Candidates", 10)
        assert len(results) >= 1

    def test_search_no_match_returns_empty(self):
        from apps.docs_service.main import _search_endpoints

        endpoints = [
            {"method": "GET", "path": "/api/v1/candidates", "summary": "List candidates", "tags": ["Candidates"], "operationId": ""},
        ]
        results = _search_endpoints(endpoints, "zzzznonexistent", 10)
        assert len(results) == 0

    def test_search_respects_limit(self):
        from apps.docs_service.main import _search_endpoints

        endpoints = [
            {"method": "GET", "path": f"/api/v1/ep{i}", "summary": f"endpoint {i}", "tags": ["Test"], "operationId": ""}
            for i in range(50)
        ]
        results = _search_endpoints(endpoints, "endpoint", 5)
        assert len(results) <= 5

    def test_search_path_match_scores_higher(self):
        from apps.docs_service.main import _search_endpoints

        endpoints = [
            {"method": "GET", "path": "/api/v1/candidates", "summary": "Something else", "tags": ["Other"], "operationId": ""},
            {"method": "GET", "path": "/api/v1/other", "summary": "candidates endpoint", "tags": ["Candidates"], "operationId": ""},
        ]
        results = _search_endpoints(endpoints, "candidates", 10)
        assert len(results) == 2
        assert results[0].path == "/api/v1/candidates"
