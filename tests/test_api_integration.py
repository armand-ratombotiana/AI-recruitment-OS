"""API Integration Tests."""
import httpx

BASE = "http://localhost:8000"
passed = 0
failed = 0

def test(name, method, url, **kwargs):
    global passed, failed
    try:
        r = getattr(httpx, method)(f"{BASE}{url}", timeout=5.0, **kwargs)
        if r.status_code == 200:
            print(f"[OK] {method} {url}")
            passed += 1
        else:
            print(f"[FAIL] {method} {url} ({r.status_code})")
            failed += 1
    except:
        print(f"[SKIP] {method} {url}")
        failed += 1

if __name__ == "__main__":
    print("=" * 50)
    print("API Integration Tests")
    print("=" * 50)
    tests = [
        ("Health", "get", "/health"),
        ("Candidates", "get", "/api/v1/candidates/"),
        ("Jobs", "get", "/api/v1/jobs/"),
        ("Interviews", "get", "/api/v1/interviews/"),
        ("PPE", "get", "/api/v1/ppe/problems"),
        ("AI Agents", "get", "/api/v1/ai/agents"),
        ("Dashboard", "get", "/api/v1/analytics/dashboard"),
        ("Pipeline", "get", "/api/v1/analytics/pipeline"),
        ("Workflows", "get", "/api/v1/workflows/"),
        ("Notifications", "get", "/api/v1/notifications/"),
        ("Compliance", "get", "/api/v1/compliance/policies"),
        ("Billing", "get", "/api/v1/billing/subscription"),
    ]
    for name, method, url in tests:
        test(name, method, url)
    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed")
    print(f"{'='*50}")
