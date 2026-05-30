"""AI-ROS Docker Tests."""
import subprocess
import httpx

def test_postgres_running():
    result = subprocess.run(["docker", "ps", "-f", "name=airos-postgres", "--format", "{{.Names}}"], capture_output=True, text=True)
    assert "airos-postgres" in result.stdout
    print("[OK] PostgreSQL container running")

def test_redis_running():
    result = subprocess.run(["docker", "ps", "-f", "name=airos-redis", "--format", "{{.Names}}"], capture_output=True, text=True)
    assert "airos-redis" in result.stdout
    print("[OK] Redis container running")

def test_api_running():
    result = subprocess.run(["docker", "ps", "-f", "name=airos-api", "--format", "{{.Names}}"], capture_output=True, text=True)
    assert "airos-api" in result.stdout
    print("[OK] API container running")

def test_frontend_running():
    result = subprocess.run(["docker", "ps", "-f", "name=airos-frontend", "--format", "{{.Names}}"], capture_output=True, text=True)
    assert "airos-frontend" in result.stdout
    print("[OK] Frontend container running")

def test_prometheus_running():
    result = subprocess.run(["docker", "ps", "-f", "name=airos-prometheus", "--format", "{{.Names}}"], capture_output=True, text=True)
    assert "airos-prometheus" in result.stdout
    print("[OK] Prometheus container running")

def test_grafana_running():
    result = subprocess.run(["docker", "ps", "-f", "name=airos-grafana", "--format", "{{.Names}}"], capture_output=True, text=True)
    assert "airos-grafana" in result.stdout
    print("[OK] Grafana container running")

def test_jaeger_running():
    result = subprocess.run(["docker", "ps", "-f", "name=airos-jaeger", "--format", "{{.Names}}"], capture_output=True, text=True)
    assert "airos-jaeger" in result.stdout
    print("[OK] Jaeger container running")

def test_api_health():
    try:
        r = httpx.get("http://localhost:8000/health", timeout=5.0)
        assert r.status_code == 200
        print("[OK] API health check")
    except Exception as e:
        print(f"[FAIL] API health: {e}")

def test_frontend_accessible():
    try:
        r = httpx.get("http://localhost:3000", timeout=5.0)
        assert r.status_code == 200
        print("[OK] Frontend accessible")
    except Exception as e:
        print(f"[FAIL] Frontend: {e}")

def test_grafana_accessible():
    try:
        r = httpx.get("http://localhost:3001/api/health", timeout=5.0)
        assert r.status_code == 200
        print("[OK] Grafana accessible")
    except Exception as e:
        print(f"[FAIL] Grafana: {e}")

def test_jaeger_accessible():
    try:
        r = httpx.get("http://localhost:16686/", timeout=5.0)
        assert r.status_code == 200
        print("[OK] Jaeger accessible")
    except Exception as e:
        print(f"[FAIL] Jaeger: {e}")

def test_prometheus_accessible():
    try:
        r = httpx.get("http://localhost:9090/-/healthy", timeout=5.0)
        assert r.status_code == 200
        print("[OK] Prometheus accessible")
    except Exception as e:
        print(f"[FAIL] Prometheus: {e}")

if __name__ == "__main__":
    print("=" * 50)
    print("AI-ROS Docker Tests")
    print("=" * 50)
    
    tests = [
        test_postgres_running, test_redis_running, test_api_running,
        test_frontend_running, test_prometheus_running, test_grafana_running,
        test_jaeger_running, test_api_health, test_frontend_accessible,
        test_grafana_accessible, test_jaeger_accessible, test_prometheus_accessible,
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
    
    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed")
    print(f"{'='*50}")
