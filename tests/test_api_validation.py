"""API Endpoint Validation Suite."""
import httpx

BASE = "http://localhost:8000"
RESULTS = []

def validate(name, method, url, expected_status=200, **kwargs):
    try:
        r = getattr(httpx, method)(f"{BASE}{url}", timeout=5.0, **kwargs)
        if r.status_code == expected_status:
            data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
            RESULTS.append({"endpoint": f"{method.upper()} {url}", "status": "PASS", "response_keys": list(data.keys()) if isinstance(data, dict) else "HTML"})
            print(f"✅ {method.upper()} {url} → {r.status_code}")
            return True
        else:
            RESULTS.append({"endpoint": f"{method.upper()} {url}", "status": "FAIL", "expected": expected_status, "got": r.status_code})
            print(f"❌ {method.upper()} {url} → {r.status_code} (expected {expected_status})")
            return False
    except httpx.ConnectError:
        RESULTS.append({"endpoint": f"{method.upper()} {url}", "status": "SKIP", "reason": "API not running"})
        print(f"⏭️ {method.upper()} {url} → SKIPPED (API not running)")
        return False
    except Exception as e:
        RESULTS.append({"endpoint": f"{method.upper()} {url}", "status": "FAIL", "error": str(e)})
        print(f"❌ {method.upper()} {url} → ERROR: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("AI-ROS API Endpoint Validation")
    print("=" * 60)
    print()

    endpoints = [
        ("Health Check", "get", "/health"),
        ("Root Page", "get", "/"),
        ("API Docs", "get", "/docs"),
        # Auth
        ("Auth Register", "post", "/api/v1/auth/register", 200, {"json": {"email": "t@t.com", "full_name": "T", "password": "p123"}}),
        ("Auth Login", "post", "/api/v1/auth/login", 200, {"json": {"email": "t@t.com", "password": "p123"}}),
        # SSO
        ("SSO Providers", "get", "/api/v1/sso/providers"),
        # Tenants
        ("List Tenants", "get", "/api/v1/tenants/"),
        ("Get Tenant", "get", "/api/v1/tenants/t1"),
        # Users
        ("List Users", "get", "/api/v1/users/"),
        ("Get User", "get", "/api/v1/users/u1"),
        # Candidates
        ("List Candidates", "get", "/api/v1/candidates/"),
        ("Get Candidate", "get", "/api/v1/candidates/c1"),
        # Jobs
        ("List Jobs", "get", "/api/v1/jobs/"),
        ("Get Job", "get", "/api/v1/jobs/j1"),
        # Interviews
        ("List Interviews", "get", "/api/v1/interviews/"),
        # PPE
        ("Create PPE Session", "post", "/api/v1/ppe/sessions"),
        ("Get PPE Session", "get", "/api/v1/ppe/sessions/ppe1"),
        ("List PPE Problems", "get", "/api/v1/ppe/problems"),
        # AI
        ("List AI Agents", "get", "/api/v1/ai/agents"),
        ("Orchestrate", "post", "/api/v1/ai/orchestrate"),
        # Analytics
        ("Dashboard", "get", "/api/v1/analytics/dashboard"),
        ("Pipeline", "get", "/api/v1/analytics/pipeline"),
        ("AI Performance", "get", "/api/v1/analytics/ai-performance"),
        # Workflows
        ("List Workflows", "get", "/api/v1/workflows/"),
        # Notifications
        ("List Notifications", "get", "/api/v1/notifications/"),
        # Compliance
        ("Compliance Status", "get", "/api/v1/compliance/status"),
        ("List Policies", "get", "/api/v1/compliance/policies"),
        # Billing
        ("Subscription", "get", "/api/v1/billing/subscription"),
        ("Invoices", "get", "/api/v1/billing/invoices"),
        # Search
        ("Search Candidates", "post", "/api/v1/search/candidates", 200, {"json": {"query": "python"}}),
        # Innovation
        ("Bias Detection", "post", "/api/v1/innovations/bias-detection", 200, {"json": {"text": "test"}}),
        ("Predict Success", "post", "/api/v1/innovations/predict-success", 200, {"json": {"candidate_id": "c1", "job_id": "j1"}}),
        ("Skills Gap", "post", "/api/v1/innovations/skills-gap", 200, {"json": {"candidate_id": "c1", "job_id": "j1"}}),
        ("Diversity Report", "get", "/api/v1/innovations/diversity-report"),
    ]

    for endpoint in endpoints:
        validate(*endpoint)

    print()
    print("=" * 60)
    passed = sum(1 for r in RESULTS if r["status"] == "PASS")
    failed = sum(1 for r in RESULTS if r["status"] == "FAIL")
    skipped = sum(1 for r in RESULTS if r["status"] == "SKIP")
    print(f"Results: {passed} passed, {failed} failed, {skipped} skipped")
    print(f"Total: {len(RESULTS)} endpoints validated")
    print("=" * 60)
