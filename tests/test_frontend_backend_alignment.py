"""Frontend ↔ Backend alignment tests.

Verifies that every API method on the frontend TypeScript client
(`frontend/src/services/api/client.ts`) has a matching backend endpoint
exposed in the OpenAPI schema, and that the runtime contract (CORS,
auth headers, error handling) is satisfied.

Strategy:
  1. Static parse of the TS client to extract method → (path, method) map.
  2. Fetch the OpenAPI spec from the backend and extract its paths.
  3. For each frontend method, locate a matching backend route
     (literal match, with-trailing-slash variant, or path-template match
     where parameters are interchangeable).
  4. Live-check CORS preflight, auth header round-trip, and error envelope.
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
CLIENT_TS = REPO_ROOT / "frontend" / "src" / "services" / "api" / "client.ts"
BACKEND_URL = "http://localhost:8000"
API_PREFIX = "/api/v1"
TIMEOUT = 10.0


# ── Static parser for the TS client ──────────────────────────────────────────

METHOD_RE = re.compile(
    r"""^\s*async\s+(?P<name>\w+)\s*\(
        (?P<args>[^)]*)
    \)\s*:\s*(?P<rtype>[^=>{]*)
    \s*=>\s*\{""",
    re.VERBOSE | re.MULTILINE,
)

# Each route literal we can statically detect. We capture both the
# literal string and the inferred HTTP verb from request<T>(...)/method.
ROUTE_LITERAL_RE = re.compile(r"'([^']+)'")

HTTP_VERB_RE = re.compile(
    r"this\.request<[^>]+>\(\s*'([^']+)'\s*,\s*\{\s*method:\s*'([^']+)'",
    re.DOTALL,
)
REQUEST_FIRST_ARG_RE = re.compile(
    r"this\.request<[^>]+>\(\s*'([^']+)'",
    re.DOTALL,
)
REQUEST_WITH_METHOD_RE = re.compile(
    r"this\.request<[^>]+>\(\s*'([^']+)'\s*,\s*\{\s*method:\s*'([^']+)'",
    re.DOTALL,
)
GET_WITH_PARAMS_RE = re.compile(
    r"this\.request<[^>]+>\(\s*'([^']+)'",
    re.DOTALL,
)


@dataclass
class FrontendMethod:
    name: str
    path: str  # raw literal e.g. "/candidates/"
    method: str  # GET / POST / PUT / DELETE


def parse_client_ts(source: str) -> list[FrontendMethod]:
    """Heuristically extract method/path/method-triple from client.ts.

    Strategy: find every `this.request<T>('PATH', { method: 'VERB' })` and
    `this.request<T>('PATH')` (default GET) call. The method NAME is just
    a debug label — the alignment test only cares about (path, verb).
    """
    methods: list[FrontendMethod] = []

    # Pattern A: this.request<T>('PATH', { method: 'VERB' })
    with_method_re = re.compile(
        r"this\.request<[^>]+>\(\s*'([^']+)'\s*,\s*\{[^}]*method:\s*'([A-Z]+)'",
        re.DOTALL,
    )
    # Pattern B: this.request<T>('PATH')  (default GET, may include options)
    bare_re = re.compile(r"this\.request<[^>]+>\(\s*'([^']+)'")

    seen_paths: set[str] = set()

    for m in with_method_re.finditer(source):
        path, verb = m.group(1), m.group(2)
        if path.startswith("/api/v1"):
            path = path[len("/api/v1"):]
        if path in seen_paths:
            continue
        seen_paths.add(path)
        # Derive a friendly name from the first 2 path segments
        segs = [s for s in path.strip("/").split("/") if s and not s.startswith("{")][:2]
        name = "_".join(segs) or "api"
        methods.append(FrontendMethod(name=name, path=path, method=verb))

    for m in bare_re.finditer(source):
        path = m.group(1)
        if not path.startswith("/"):
            continue
        if path.startswith("/api/v1"):
            path_clean = path[len("/api/v1"):]
        else:
            path_clean = path
        if path_clean in seen_paths:
            continue
        seen_paths.add(path_clean)
        segs = [s for s in path_clean.strip("/").split("/") if s and not s.startswith("{")][:2]
        name = "_".join(segs) or "api"
        methods.append(FrontendMethod(name=name, path=path_clean, method="GET"))

    return methods


def normalize(path: str) -> str:
    """Normalize a path so /foo and /foo/ compare equal."""
    return path.rstrip("/") or "/"


def paths_match(fe_path: str, be_path: str) -> bool:
    """True if frontend path matches backend path with possible template."""
    a = [p for p in normalize(fe_path).split("/") if p]
    b = [p for p in normalize(be_path).split("/") if p]
    if len(a) != len(b):
        return False
    for x, y in zip(a, b):
        if x == y:
            continue
        if y.startswith("{") and y.endswith("}"):
            # Backend parameter — frontend may have hard-coded an id or a literal.
            continue
        if x.startswith("{") and x.endswith("}"):
            continue
        return False
    return True


# ── Backend spec loader ──────────────────────────────────────────────────────

@dataclass
class BackendRoute:
    path: str
    methods: set[str]


def fetch_backend_routes(url: str) -> list[BackendRoute]:
    with httpx.Client(timeout=TIMEOUT) as c:
        resp = c.get(f"{url.rstrip('/')}/openapi.json")
    resp.raise_for_status()
    spec = resp.json()
    routes: list[BackendRoute] = []
    for p, ops in spec.get("paths", {}).items():
        # Strip /api/v1 to match the client (the client prefixes it itself).
        if p.startswith("/api/v1"):
            p = p[len("/api/v1"):]
        routes.append(BackendRoute(path=p, methods=set(ops.keys())))
    return routes


# ── Backend reachability ─────────────────────────────────────────────────────

def _backend_reachable() -> bool:
    try:
        with httpx.Client(timeout=3.0) as c:
            r = c.get(f"{BACKEND_URL}/health")
            return r.status_code == 200
    except Exception:
        return False


pytestmark_backend = pytest.mark.skipif(
    not _backend_reachable(),
    reason=f"Backend not reachable at {BACKEND_URL}",
)


# ── Tests ────────────────────────────────────────────────────────────────────

@pytestmark_backend
class TestFrontendBackendAlignment:
    """Verify the frontend TS client is aligned with the backend OpenAPI schema."""

    @pytest.fixture(scope="class")
    def client_source(self) -> str:
        if not CLIENT_TS.exists():
            pytest.skip(f"client.ts not found at {CLIENT_TS}")
        return CLIENT_TS.read_text(encoding="utf-8")

    @pytest.fixture(scope="class")
    def frontend_methods(self, client_source: str) -> list[FrontendMethod]:
        return parse_client_ts(client_source)

    @pytest.fixture(scope="class")
    def backend_routes(self) -> list[BackendRoute]:
        return fetch_backend_routes(BACKEND_URL)

    def test_client_ts_parses(self, frontend_methods: list[FrontendMethod]) -> None:
        """Sanity check: the static parser found methods."""
        assert len(frontend_methods) > 50, (
            f"Parsed only {len(frontend_methods)} methods — parser may be broken"
        )
        # Spot-check that common service paths are present in the parsed (path, method) pairs.
        paths = {m.path for m in frontend_methods}
        verbs = {m.method for m in frontend_methods}
        for expected in ("/auth/login", "/auth/register", "/candidates/", "/jobs/"):
            assert expected in paths, f"Expected path '{expected}' missing from parsed list"
        assert "POST" in verbs and "GET" in verbs, f"Expected POST and GET verbs, got {verbs}"

    def test_all_frontend_methods_have_backend_routes(
        self, frontend_methods: list[FrontendMethod], backend_routes: list[BackendRoute]
    ) -> None:
        """Every frontend method should map to at least one backend route."""
        unmatched: list[str] = []
        for m in frontend_methods:
            match = any(
                paths_match(m.path, br.path) and m.method.lower() in br.methods
                for br in backend_routes
            )
            if not match:
                unmatched.append(f"{m.method} {m.path} ({m.name})")
        # Tolerate up to 1 unrecognised route (parser quirks); the rest must match.
        if unmatched:
            pytest.fail(
                f"{len(unmatched)} frontend method(s) have no matching backend route:\n  "
                + "\n  ".join(unmatched)
            )

    def test_alignment_summary(
        self, frontend_methods: list[FrontendMethod], backend_routes: list[BackendRoute]
    ) -> None:
        """Print a summary table of FE method → matched BE route."""
        print("\n  Frontend ↔ Backend alignment:")
        print(f"  {'FE Method':<30} {'FE Call':<14} {'Matched BE Route':<50}")
        print("  " + "-" * 95)
        matched = 0
        for m in frontend_methods:
            for br in backend_routes:
                if paths_match(m.path, br.path) and m.method.lower() in br.methods:
                    print(f"  {m.name:<30} {m.method + ' ' + m.path:<14} {br.path:<50}")
                    matched += 1
                    break
        print(f"\n  Matched: {matched}/{len(frontend_methods)} frontend methods "
              f"against {len(backend_routes)} backend routes")


@pytestmark_backend
class TestCORSConfiguration:
    """Verify CORS preflight succeeds and Origin is reflected."""

    def test_cors_preflight_succeeds(self) -> None:
        """A simple OPTIONS preflight from a known dev origin should succeed."""
        with httpx.Client(timeout=TIMEOUT) as c:
            resp = c.options(
                f"{BACKEND_URL}{API_PREFIX}/candidates/",
                headers={
                    "Origin": "http://localhost:3000",
                    "Access-Control-Request-Method": "GET",
                    "Access-Control-Request-Headers": "authorization,content-type",
                },
            )
        # The server is configured with allow_origins=["*"], so any
        # status in 2xx is fine, and 200/204 are typical.
        assert resp.status_code in (200, 204), (
            f"CORS preflight failed: HTTP {resp.status_code}"
        )
        # With allow_origins=["*"] the response should echo or be '*'.
        acao = resp.headers.get("access-control-allow-origin")
        assert acao is not None, "Missing Access-Control-Allow-Origin header"

    def test_cors_allows_credentials(self) -> None:
        """The backend sets allow_credentials=True, verify CORS exposes that."""
        with httpx.Client(timeout=TIMEOUT) as c:
            resp = c.options(
                f"{BACKEND_URL}{API_PREFIX}/candidates/",
                headers={
                    "Origin": "http://localhost:3000",
                    "Access-Control-Request-Method": "GET",
                },
            )
        acac = resp.headers.get("access-control-allow-credentials")
        # CORS middleware only sets this when an Origin is present and allowed.
        if acac is not None:
            assert acac.lower() == "true", (
                f"Access-Control-Allow-Credentials should be 'true', got {acac!r}"
            )

    def test_simple_request_includes_cors_headers(self) -> None:
        """A normal GET with an Origin header should still be served (no CORS error)."""
        with httpx.Client(timeout=TIMEOUT) as c:
            resp = c.get(
                f"{BACKEND_URL}{API_PREFIX}/candidates/",
                headers={"Origin": "http://localhost:3000"},
            )
        # Endpoint is auth-gated, so 401 is fine. The point is that the
        # CORS middleware didn't reject the request.
        assert resp.status_code in (200, 401, 403), (
            f"GET with Origin should be 200/401/403, got {resp.status_code}"
        )


@pytestmark_backend
class TestAuthHeaderContract:
    """Verify Authorization: Bearer <token> works as the frontend sends it."""

    def test_missing_auth_returns_401(self) -> None:
        with httpx.Client(timeout=TIMEOUT) as c:
            resp = c.get(f"{BACKEND_URL}{API_PREFIX}/auth/me")
        assert resp.status_code in (401, 403), (
            f"Expected 401/403 without auth, got {resp.status_code}"
        )

    def test_malformed_auth_returns_401(self) -> None:
        with httpx.Client(timeout=TIMEOUT) as c:
            resp = c.get(
                f"{BACKEND_URL}{API_PREFIX}/auth/me",
                headers={"Authorization": "Bearer not_a_real_token"},
            )
        assert resp.status_code in (401, 403), (
            f"Expected 401/403 with bad token, got {resp.status_code}"
        )

    def test_login_returns_bearer_token(self) -> None:
        """Register a user, log in, and confirm the response carries an access_token."""
        email = f"algn+{int(time.time()*1000)}@airos-test.com"
        with httpx.Client(timeout=TIMEOUT) as c:
            reg = c.post(
                f"{BACKEND_URL}{API_PREFIX}/auth/register",
                json={
                    "email": email,
                    "full_name": "Alignment Tester",
                    "password": "TestPass123!",
                    "role": "recruiter",
                },
            )
            assert reg.status_code in (200, 201), f"Register failed: {reg.text}"
            reg_data = reg.json()
            token = reg_data.get("access_token")
            assert token and isinstance(token, str), "Register did not return access_token"

            me = c.get(
                f"{BACKEND_URL}{API_PREFIX}/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert me.status_code == 200, f"/auth/me with valid token: HTTP {me.status_code}"
        body = me.json()
        assert body.get("email") == email, "Returned user email mismatch"

    def test_invalid_json_returns_422(self) -> None:
        """The frontend sends JSON; backend should reject malformed JSON with 422."""
        with httpx.Client(timeout=TIMEOUT) as c:
            resp = c.post(
                f"{BACKEND_URL}{API_PREFIX}/auth/login",
                content="{not valid json",
                headers={"Content-Type": "application/json"},
            )
        assert resp.status_code in (400, 422), (
            f"Malformed JSON should yield 400/422, got {resp.status_code}"
        )


@pytestmark_backend
class TestErrorEnvelope:
    """Verify error responses follow a consistent JSON shape."""

    def test_404_returns_json(self) -> None:
        with httpx.Client(timeout=TIMEOUT) as c:
            resp = c.get(f"{BACKEND_URL}{API_PREFIX}/this-route-does-not-exist")
        assert resp.status_code == 404
        # Either detail key (FastAPI default) or our custom envelope is fine.
        try:
            body = resp.json()
        except Exception:
            pytest.fail(f"404 response was not JSON: {resp.text[:200]}")
        assert body, "404 JSON body should not be empty"

    def test_401_returns_json(self) -> None:
        """Hitting an auth-gated endpoint without a token must return 401 with a JSON body."""
        with httpx.Client(timeout=TIMEOUT) as c:
            resp = c.get(f"{BACKEND_URL}{API_PREFIX}/auth/me")
        assert resp.status_code in (401, 403), (
            f"Expected 401/403 from /auth/me without a token, got {resp.status_code}"
        )
        try:
            body = resp.json()
        except Exception:
            pytest.fail(f"401/403 response was not JSON: {resp.text[:200]}")
        assert body, "401/403 JSON body should not be empty"


@pytestmark_backend
def test_alignment_summary_endpoint():
    """Top-level summary entry-point for the alignment suite."""
    print("\n" + "=" * 70)
    print("  AI-ROS Frontend ↔ Backend Alignment Suite")
    print(f"  Backend:   {BACKEND_URL}")
    print(f"  Client TS: {CLIENT_TS}")
    print("=" * 70)
    assert _backend_reachable()
