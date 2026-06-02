"""AI-ROS Integration Tests.

Tests the full API flow across auth, candidates, jobs, interviews, and PPE.
Requires the backend to be running on localhost:8000.

Usage:
    python -m pytest tests/test_integration.py -v
    python tests/test_integration.py
"""
from __future__ import annotations

import sys
import json
from dataclasses import dataclass
from typing import Any

import httpx

BASE_URL = "http://localhost:8000"

passed = 0
failed = 0
skipped = 0
results: list[dict[str, Any]] = []


@dataclass
class TestResult:
    name: str
    status: str
    details: str = ""
    response_data: Any = None


def test(name: str, method: str, path: str, json_data: dict | None = None,
         headers: dict | None = None, expected_status: int = 200) -> TestResult:
    global passed, failed, skipped
    url = f"{BASE_URL}{path}"
    try:
        with httpx.Client(timeout=10.0) as client:
            if method.upper() == "GET":
                resp = client.get(url, headers=headers)
            elif method.upper() == "POST":
                resp = client.post(url, json=json_data, headers=headers)
            elif method.upper() == "PUT":
                resp = client.put(url, json=json_data, headers=headers)
            elif method.upper() == "DELETE":
                resp = client.delete(url, headers=headers)
            else:
                resp = client.request(method, url, json=json_data, headers=headers)

            if resp.status_code == expected_status:
                print(f"  [PASS] {name}")
                passed += 1
                data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text
                return TestResult(name=name, status="PASS", response_data=data)
            else:
                print(f"  [FAIL] {name} (expected {expected_status}, got {resp.status_code})")
                failed += 1
                return TestResult(name=name, status="FAIL", details=f"HTTP {resp.status_code}")
    except httpx.ConnectError:
        print(f"  [SKIP] {name} (backend not reachable)")
        skipped += 1
        return TestResult(name=name, status="SKIP", details="Connection refused")
    except Exception as e:
        print(f"  [FAIL] {name} ({e})")
        failed += 1
        return TestResult(name=name, status="FAIL", details=str(e))


def test_auth_flow():
    """Test full authentication flow: register -> login -> token usage."""
    print("\n--- Auth Flow ---")

    reg = test("Register user", "POST", "/api/v1/auth/register", json_data={
        "email": "integration@test.com",
        "full_name": "Integration Tester",
        "password": "TestPass123!",
        "role": "candidate",
    })
    assert reg.response_data is None or "id" in (reg.response_data or {})

    login = test("Login", "POST", "/api/v1/auth/login", json_data={
        "email": "integration@test.com",
        "password": "TestPass123!",
    })
    token = None
    if login.response_data and isinstance(login.response_data, dict):
        token = login.response_data.get("access_token")
        assert token is not None, "access_token missing from login response"

    test("Logout", "POST", "/api/v1/auth/logout")

    if token:
        auth_headers = {"Authorization": f"Bearer {token}"}
        test("Authenticated request", "GET", "/api/v1/candidates/", headers=auth_headers)

    return token


def test_candidate_flow():
    """Test candidate CRUD and AI features."""
    print("\n--- Candidate Flow ---")

    test("List candidates", "GET", "/api/v1/candidates/")

    test("Get candidate detail", "GET", "/api/v1/candidates/c1")

    create = test("Create candidate", "POST", "/api/v1/candidates/", json_data={
        "email": "new.candidate@test.com",
        "full_name": "New Candidate",
        "seniority_level": "senior",
        "years_experience": 5,
    })

    test("Update candidate", "PUT", "/api/v1/candidates/c1")

    test("Enrich candidate", "POST", "/api/v1/candidates/c1/enrich")

    test("Enrichment status", "GET", "/api/v1/candidates/c1/enrichment-status")

    test("Match candidate", "POST", "/api/v1/candidates/c1/match")

    test("Get candidate skills", "GET", "/api/v1/candidates/c1/skills")


def test_job_flow():
    """Test job posting management."""
    print("\n--- Job Flow ---")

    test("List jobs", "GET", "/api/v1/jobs/")

    test("Get job detail", "GET", "/api/v1/jobs/j1")

    test("Create job", "POST", "/api/v1/jobs/", json_data={
        "title": "Integration Test Engineer",
        "description": "Test integration flows.",
        "department": "QA",
        "location": "Remote",
    })

    test("Update job", "PUT", "/api/v1/jobs/j1")

    test("Matched candidates for job", "GET", "/api/v1/jobs/j1/candidates")


def test_interview_flow():
    """Test interview scheduling and management."""
    print("\n--- Interview Flow ---")

    test("List interviews", "GET", "/api/v1/interviews/")

    test("Get interview detail", "GET", "/api/v1/interviews/i1")

    test("Create interview", "POST", "/api/v1/interviews/", json_data={
        "candidate_id": "c1",
        "job_id": "j1",
        "interview_type": "technical",
        "is_ai_interview": True,
    })

    test("Start interview", "POST", "/api/v1/interviews/i1/start")

    test("Complete interview", "POST", "/api/v1/interviews/i1/complete")

    test("Get transcript", "GET", "/api/v1/interviews/i1/transcript")

    test("Get analytics", "GET", "/api/v1/interviews/i1/analytics")


def test_ppesession_flow():
    """Test PPE (Pair Programming Evaluation) session flow."""
    print("\n--- PPE Session Flow ---")

    test("List PPE problems", "GET", "/api/v1/ppe/problems")

    test("Get PPE problem", "GET", "/api/v1/ppe/problems/p1")

    create = test("Create PPE session", "POST", "/api/v1/ppe/sessions", json_data={
        "interview_id": "i1",
        "language": "python",
        "difficulty": "medium",
    })

    test("Get PPE session", "GET", "/api/v1/ppe/sessions/ppe_new")

    test("Start PPE session", "POST", "/api/v1/ppe/sessions/ppe_new/start")

    test("Execute code", "POST", "/api/v1/ppe/sessions/ppe_new/execute", json_data={
        "code": "def two_sum(nums, target): pass",
        "language": "python",
    })

    test("Request hint", "POST", "/api/v1/ppe/sessions/ppe_new/hint")

    test("Complete PPE session", "POST", "/api/v1/ppe/sessions/ppe_new/complete")

    test("Get evaluation", "GET", "/api/v1/ppe/sessions/ppe_new/evaluation")

    test("Get progress", "GET", "/api/v1/ppe/sessions/ppe_new/progress")


def test_additional_endpoints():
    """Test analytics, workflows, compliance, billing, and search."""
    print("\n--- Additional Endpoints ---")

    test("Dashboard analytics", "GET", "/api/v1/analytics/dashboard")
    test("Pipeline analytics", "GET", "/api/v1/analytics/pipeline")
    test("AI performance", "GET", "/api/v1/analytics/ai-performance")

    test("AI agents", "GET", "/api/v1/ai/agents")
    test("AI orchestrate", "POST", "/api/v1/ai/orchestrate", json_data={
        "task_type": "candidate_evaluation",
        "candidate_id": "c1",
    })

    test("List workflows", "GET", "/api/v1/workflows/")
    test("Create workflow", "POST", "/api/v1/workflows/", json_data={
        "name": "Integration Test Workflow",
        "trigger": "candidate.created",
    })

    test("List notifications", "GET", "/api/v1/notifications/")

    test("Compliance status", "GET", "/api/v1/compliance/status")

    test("Billing subscription", "GET", "/api/v1/billing/subscription")

    test("Search candidates", "POST", "/api/v1/search/candidates", json_data={"query": "python"})

    test("Bias detection", "POST", "/api/v1/innovations/bias-detection", json_data={"text": "Looking for young energetic candidate"})
    test("Predict success", "POST", "/api/v1/innovations/predict-success", json_data={"candidate_id": "c1", "job_id": "j1"})


def main():
    global passed, failed, skipped
    print("=" * 60)
    print("  AI-ROS Integration Test Suite")
    print(f"  Target: {BASE_URL}")
    print("=" * 60)

    try:
        with httpx.Client(timeout=5.0) as c:
            c.get(f"{BASE_URL}/health")
            print("  [OK] Backend is reachable\n")
    except Exception:
        print("  [ERROR] Backend is not reachable. Start the backend first.")
        sys.exit(1)

    test_auth_flow()
    test_candidate_flow()
    test_job_flow()
    test_interview_flow()
    test_ppesession_flow()
    test_additional_endpoints()

    print(f"\n{'='*60}")
    total = passed + failed + skipped
    print(f"  Results: {passed}/{total} passed, {failed} failed, {skipped} skipped")
    print(f"{'='*60}")

    results_data = {
        "total": total,
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
    }
    with open("test_results.json", "w") as f:
        json.dump(results_data, f, indent=2)

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
