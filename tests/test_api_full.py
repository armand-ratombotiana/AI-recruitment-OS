"""AI-ROS Full API Tests."""
import httpx

BASE = "http://localhost:8000"

def test(name, method, url, expected_status=200, **kwargs):
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
    print("=" * 50)
    print("AI-ROS Full API Tests")
    print("=" * 50)
    
    tests = [
        ("Health", "get", "/health"),
        ("Root", "get", "/"),
        ("Docs", "get", "/docs"),
        ("ReDoc", "get", "/redoc"),
        ("Auth Register", "post", "/api/v1/auth/register", 200, {"json": {"email": "t@t.com", "full_name": "T", "password": "p123"}}),
        ("Auth Login", "post", "/api/v1/auth/login", 200, {"json": {"email": "t@t.com", "password": "p123"}}),
        ("List Candidates", "get", "/api/v1/candidates/"),
        ("Get Candidate", "get", "/api/v1/candidates/c1"),
        ("List Jobs", "get", "/api/v1/jobs/"),
        ("Get Job", "get", "/api/v1/jobs/j1"),
        ("List Interviews", "get", "/api/v1/interviews/"),
        ("Create PPE", "post", "/api/v1/ppe/sessions"),
        ("Get PPE", "get", "/api/v1/ppe/sessions/ppe1"),
        ("Execute Code", "post", "/api/v1/ppe/sessions/ppe1/execute"),
        ("Dashboard", "get", "/api/v1/analytics/dashboard"),
        ("Pipeline", "get", "/api/v1/analytics/pipeline"),
        ("AI Agents", "get", "/api/v1/ai/agents"),
        ("Workflows", "get", "/api/v1/workflows/"),
        ("Tenant", "get", "/api/v1/tenants/t1"),
        ("Users", "get", "/api/v1/users/"),
        ("Notifications", "get", "/api/v1/notifications/"),
        ("Billing", "get", "/api/v1/billing/subscription"),
        ("Compliance", "get", "/api/v1/compliance/policies"),
        ("Search", "post", "/api/v1/search/candidates", 200, {"json": {"query": "python"}}),
    ]
    
    passed = sum(1 for name, method, url, *args in tests if test(name, method, url, **(args[0] if args else {})))
    print(f"\n{'='*50}")
    print(f"Results: {passed}/{len(tests)} passed")
    print(f"{'='*50}")
