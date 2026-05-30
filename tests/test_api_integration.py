"""AI-ROS API Integration Tests."""
import httpx
import sys

BASE = "http://localhost:8000"

def test_endpoint(name, method, url, expected_status=200, **kwargs):
    try:
        r = getattr(httpx, method)(f"{BASE}{url}", timeout=5.0, **kwargs)
        if r.status_code == expected_status:
            print(f"[OK] {name}")
            return True
        else:
            print(f"[FAIL] {name}: Expected {expected_status}, got {r.status_code}")
            return False
    except httpx.ConnectError:
        print(f"[SKIP] {name} (API not running)")
        return False
    except Exception as e:
        print(f"[FAIL] {name}: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("AI-ROS API Integration Tests")
    print("=" * 60)
    print(f"Testing API at: {BASE}")
    print()

    tests = [
        ("Health Check", "get", "/health"),
        ("Root Page", "get", "/"),
        ("Register User", "post", "/api/v1/auth/register", 200, {"json": {"email": "test@test.com", "full_name": "Test", "password": "pass123"}}),
        ("Login User", "post", "/api/v1/auth/login", 200, {"json": {"email": "test@test.com", "password": "pass123"}}),
        ("Refresh Token", "post", "/api/v1/auth/refresh", 200),
        ("Logout", "post", "/api/v1/auth/logout", 200),
        ("List Tenants", "get", "/api/v1/tenants/"),
        ("Get Tenant", "get", "/api/v1/tenants/t1"),
        ("Create Tenant", "post", "/api/v1/tenants/", 200),
        ("Update Tenant", "put", "/api/v1/tenants/t1", 200),
        ("Get Settings", "get", "/api/v1/tenants/t1/settings"),
        ("Update Settings", "put", "/api/v1/tenants/t1/settings", 200),
        ("List Users", "get", "/api/v1/users/"),
        ("Get User", "get", "/api/v1/users/u1"),
        ("Create User", "post", "/api/v1/users/", 200),
        ("Update User", "put", "/api/v1/users/u1", 200),
        ("List Candidates", "get", "/api/v1/candidates/"),
        ("Get Candidate", "get", "/api/v1/candidates/c1"),
        ("Create Candidate", "post", "/api/v1/candidates/", 200),
        ("Update Candidate", "put", "/api/v1/candidates/c1", 200),
        ("Enrich Candidate", "post", "/api/v1/candidates/c1/enrich", 200),
        ("Get Candidate Skills", "get", "/api/v1/candidates/c1/skills"),
        ("Upload Resume", "post", "/api/v1/resumes/upload", 200),
        ("Get Resume", "get", "/api/v1/resumes/r1"),
        ("Get Parsed Resume", "get", "/api/v1/resumes/r1/parsed"),
        ("List Jobs", "get", "/api/v1/jobs/"),
        ("Get Job", "get", "/api/v1/jobs/j1"),
        ("Create Job", "post", "/api/v1/jobs/", 200),
        ("Update Job", "put", "/api/v1/jobs/j1", 200),
        ("Get Matched Candidates", "get", "/api/v1/jobs/j1/candidates"),
        ("List Interviews", "get", "/api/v1/interviews/"),
        ("Get Interview", "get", "/api/v1/interviews/i1"),
        ("Create Interview", "post", "/api/v1/interviews/", 200),
        ("Start Interview", "post", "/api/v1/interviews/i1/start", 200),
        ("Complete Interview", "post", "/api/v1/interviews/i1/complete", 200),
        ("Submit Feedback", "post", "/api/v1/interviews/i1/feedback", 200),
        ("Create PPE Session", "post", "/api/v1/ppe/sessions", 200),
        ("Get PPE Session", "get", "/api/v1/ppe/sessions/ppe1"),
        ("Start PPE Session", "post", "/api/v1/ppe/sessions/ppe1/start", 200),
        ("Execute Code", "post", "/api/v1/ppe/sessions/ppe1/execute", 200),
        ("Get Hint", "post", "/api/v1/ppe/sessions/ppe1/hint", 200),
        ("Complete PPE", "post", "/api/v1/ppe/sessions/ppe1/complete", 200),
        ("Get Evaluation", "get", "/api/v1/ppe/sessions/ppe1/evaluation"),
        ("List AI Agents", "get", "/api/v1/ai/agents"),
        ("Get AI Agent", "get", "/api/v1/ai/agents/a1"),
        ("Orchestrate", "post", "/api/v1/ai/orchestrate", 200),
        ("Create Task", "post", "/api/v1/ai/tasks", 200),
        ("Get Task", "get", "/api/v1/ai/tasks/t1"),
        ("Get Dashboard", "get", "/api/v1/analytics/dashboard"),
        ("Get Metrics", "get", "/api/v1/analytics/metrics"),
        ("Get Pipeline", "get", "/api/v1/analytics/pipeline"),
        ("Get AI Performance", "get", "/api/v1/analytics/ai-performance"),
        ("Generate Report", "post", "/api/v1/analytics/reports", 200),
        ("List Workflows", "get", "/api/v1/workflows/"),
        ("Get Workflow", "get", "/api/v1/workflows/w1"),
        ("Create Workflow", "post", "/api/v1/workflows/", 200),
        ("Trigger Workflow", "post", "/api/v1/workflows/w1/trigger", 200),
        ("Activate Workflow", "post", "/api/v1/workflows/w1/activate", 200),
        ("List Notifications", "get", "/api/v1/notifications/"),
        ("Send Notification", "post", "/api/v1/notifications/", 200),
        ("Get Preferences", "get", "/api/v1/notifications/preferences"),
        ("List Policies", "get", "/api/v1/compliance/policies"),
        ("Create Policy", "post", "/api/v1/compliance/policies", 200),
        ("Record Consent", "post", "/api/v1/compliance/consent", 200),
        ("Get Audit Log", "get", "/api/v1/compliance/audit-log"),
        ("Get Subscription", "get", "/api/v1/billing/subscription"),
        ("Create Subscription", "post", "/api/v1/billing/subscription", 200),
        ("List Invoices", "get", "/api/v1/billing/invoices"),
        ("Get Usage", "get", "/api/v1/billing/usage"),
        ("Search Candidates", "post", "/api/v1/search/candidates", 200, {"json": {"query": "python engineer"}}),
        ("Search Jobs", "post", "/api/v1/search/jobs", 200, {"json": {"query": "backend"}}),
        ("Create Embedding", "post", "/api/v1/search/embeddings", 200),
        ("Get Embedding", "get", "/api/v1/search/embeddings/e1"),
        ("Swagger UI", "get", "/docs"),
        ("ReDoc", "get", "/redoc"),
    ]

    passed = 0
    failed = 0
    skipped = 0

    for name, method, url, *args in tests:
        kwargs = args[0] if args else {}
        result = test_endpoint(name, method, url, **kwargs)
        if result:
            passed += 1
        elif "SKIP" in str(result):
            skipped += 1
        else:
            failed += 1

    print()
    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed, {skipped} skipped")
    print(f"Total: {len(tests)} tests")
    print("=" * 60)
