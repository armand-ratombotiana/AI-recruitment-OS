"""Quick API test."""
import httpx

BASE = "http://localhost:8000"

def test(name, method, url, **kwargs):
    try:
        r = getattr(httpx, method)(f"{BASE}{url}", timeout=5.0, **kwargs)
        if r.status_code == 200:
            print(f"[OK] {name}")
            return True
        else:
            print(f"[FAIL] {name}: {r.status_code}")
            return False
    except Exception as e:
        print(f"[SKIP] {name}: {e}")
        return False

if __name__ == "__main__":
    print("Testing API endpoints...")
    tests = [
        ("Health", "get", "/health"),
        ("Root", "get", "/"),
        ("Docs", "get", "/docs"),
        ("Candidates", "get", "/api/v1/candidates/"),
        ("Jobs", "get", "/api/v1/jobs/"),
        ("Interviews", "get", "/api/v1/interviews/"),
        ("PPE Sessions", "post", "/api/v1/ppe/sessions"),
        ("Dashboard", "get", "/api/v1/analytics/dashboard"),
        ("AI Agents", "get", "/api/v1/ai/agents"),
        ("Workflows", "get", "/api/v1/workflows/"),
    ]
    passed = sum(1 for name, method, url, *args in tests if test(name, method, url, **(args[0] if args else {})))
    print(f"\nResults: {passed}/{len(tests)} passed")
