"""AI-ROS API Test Suite."""
import httpx
import json

BASE_URL = "http://localhost:8000"

def test_health():
    """Test health endpoint."""
    r = httpx.get(f"{BASE_URL}/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "healthy"
    print("[OK] Health check")

def test_root():
    """Test root endpoint."""
    r = httpx.get(f"{BASE_URL}/")
    assert r.status_code == 200
    print("[OK] Root endpoint")

def test_auth():
    """Test auth endpoints."""
    # Register
    r = httpx.post(f"{BASE_URL}/api/v1/auth/register", json={"email": "test@test.com", "full_name": "Test", "password": "password123"})
    assert r.status_code == 200
    print("[OK] Auth register")
    
    # Login
    r = httpx.post(f"{BASE_URL}/api/v1/auth/login", json={"email": "test@test.com", "password": "password123"})
    assert r.status_code == 200
    print("[OK] Auth login")

def test_candidates():
    """Test candidate endpoints."""
    r = httpx.get(f"{BASE_URL}/api/v1/candidates/")
    assert r.status_code == 200
    data = r.json()
    assert "data" in data
    print(f"[OK] List candidates ({data['total']} found)")
    
    r = httpx.get(f"{BASE_URL}/api/v1/candidates/c1")
    assert r.status_code == 200
    print("[OK] Get candidate")

def test_jobs():
    """Test job endpoints."""
    r = httpx.get(f"{BASE_URL}/api/v1/jobs/")
    assert r.status_code == 200
    data = r.json()
    assert "data" in data
    print(f"[OK] List jobs ({data['total']} found)")
    
    r = httpx.get(f"{BASE_URL}/api/v1/jobs/j1")
    assert r.status_code == 200
    print("[OK] Get job")

def test_interviews():
    """Test interview endpoints."""
    r = httpx.get(f"{BASE_URL}/api/v1/interviews/")
    assert r.status_code == 200
    print("[OK] List interviews")

def test_ppe():
    """Test PPE endpoints."""
    r = httpx.post(f"{BASE_URL}/api/v1/ppe/sessions")
    assert r.status_code == 200
    print("[OK] Create PPE session")
    
    r = httpx.get(f"{BASE_URL}/api/v1/ppe/sessions/ppe_new")
    assert r.status_code == 200
    print("[OK] Get PPE session")

def test_analytics():
    """Test analytics endpoints."""
    r = httpx.get(f"{BASE_URL}/api/v1/analytics/dashboard")
    assert r.status_code == 200
    print("[OK] Get dashboard")
    
    r = httpx.get(f"{BASE_URL}/api/v1/analytics/pipeline")
    assert r.status_code == 200
    print("[OK] Get pipeline analytics")

def test_ai():
    """Test AI endpoints."""
    r = httpx.get(f"{BASE_URL}/api/v1/ai/agents")
    assert r.status_code == 200
    print("[OK] List AI agents")

def test_workflows():
    """Test workflow endpoints."""
    r = httpx.get(f"{BASE_URL}/api/v1/workflows/")
    assert r.status_code == 200
    print("[OK] List workflows")

def test_tenants():
    """Test tenant endpoints."""
    r = httpx.get(f"{BASE_URL}/api/v1/tenants/tenant_123")
    assert r.status_code == 200
    print("[OK] Get tenant")

def test_users():
    """Test user endpoints."""
    r = httpx.get(f"{BASE_URL}/api/v1/users/")
    assert r.status_code == 200
    print("[OK] List users")

def test_notifications():
    """Test notification endpoints."""
    r = httpx.get(f"{BASE_URL}/api/v1/notifications/")
    assert r.status_code == 200
    print("[OK] List notifications")

def test_billing():
    """Test billing endpoints."""
    r = httpx.get(f"{BASE_URL}/api/v1/billing/subscription")
    assert r.status_code == 200
    print("[OK] Get subscription")

def test_compliance():
    """Test compliance endpoints."""
    r = httpx.get(f"{BASE_URL}/api/v1/compliance/policies")
    assert r.status_code == 200
    print("[OK] List compliance policies")

def test_search():
    """Test search endpoints."""
    r = httpx.post(f"{BASE_URL}/api/v1/search/candidates", json={"query": "python engineer"})
    assert r.status_code == 200
    print("[OK] Search candidates")

if __name__ == "__main__":
    print("=" * 50)
    print("AI-ROS API Test Suite")
    print("=" * 50)
    print()
    
    tests = [
        test_health, test_root, test_auth, test_candidates, test_jobs,
        test_interviews, test_ppe, test_analytics, test_ai, test_workflows,
        test_tenants, test_users, test_notifications, test_billing,
        test_compliance, test_search,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            print(f"[FAIL] {test.__name__}: {e}")
            failed += 1
    
    print()
    print("=" * 50)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 50)
