"""Test all Docker services for the AI-ROS platform."""
import socket
import urllib.request
import urllib.error
import json
import sys
import time


def test_http(name: str, url: str, timeout: int = 5) -> dict:
    """Test an HTTP endpoint."""
    start = time.perf_counter()
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed_ms = (time.perf_counter() - start) * 1000
            body = resp.read().decode("utf-8", errors="replace")
            try:
                data = json.loads(body)
            except (json.JSONDecodeError, ValueError):
                data = None
            return {
                "name": name,
                "url": url,
                "status": "PASS",
                "http_code": resp.status,
                "latency_ms": round(elapsed_ms, 2),
                "data": data,
            }
    except urllib.error.HTTPError as e:
        elapsed_ms = (time.perf_counter() - start) * 1000
        return {
            "name": name,
            "url": url,
            "status": "FAIL",
            "http_code": e.code,
            "latency_ms": round(elapsed_ms, 2),
            "error": str(e),
        }
    except Exception as e:
        elapsed_ms = (time.perf_counter() - start) * 1000
        return {
            "name": name,
            "url": url,
            "status": "FAIL",
            "http_code": None,
            "latency_ms": round(elapsed_ms, 2),
            "error": str(e),
        }


def test_tcp(name: str, host: str, port: int, timeout: int = 5) -> dict:
    """Test a TCP port connection."""
    start = time.perf_counter()
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((host, port))
        sock.close()
        elapsed_ms = (time.perf_counter() - start) * 1000
        return {
            "name": name,
            "url": f"{host}:{port}",
            "status": "PASS",
            "latency_ms": round(elapsed_ms, 2),
        }
    except Exception as e:
        elapsed_ms = (time.perf_counter() - start) * 1000
        return {
            "name": name,
            "url": f"{host}:{port}",
            "status": "FAIL",
            "latency_ms": round(elapsed_ms, 2),
            "error": str(e),
        }


def main():
    results = []
    all_pass = True

    print("=" * 70)
    print("AI-ROS Docker Services Test Suite")
    print("=" * 70)

    # --- HTTP Services ---
    http_tests = [
        ("Backend API Health", "http://localhost:8000/health"),
        ("Backend API Docs", "http://localhost:8000/docs"),
        ("Backend API Root", "http://localhost:8000/"),
        ("Frontend", "http://localhost:3000"),
        ("Prometheus", "http://localhost:9090/-/healthy"),
        ("Prometheus Config", "http://localhost:9090/api/v1/status/config"),
        ("Grafana", "http://localhost:3001/api/health"),
        ("Jaeger UI", "http://localhost:16686/"),
        ("Alertmanager", "http://localhost:9093/-/healthy"),
    ]

    for name, url in http_tests:
        result = test_http(name, url)
        results.append(result)
        icon = "OK" if result["status"] == "PASS" else "FAIL"
        latency = result.get("latency_ms", 0)
        extra = ""
        if result["status"] == "PASS" and result.get("data"):
            data = result["data"]
            if isinstance(data, dict) and "status" in data:
                extra = f" [{data['status']}]"
        elif result["status"] == "FAIL":
            extra = f" ({result.get('error', 'unknown')})"
        print(f"  [{icon}] {name:<30} {latency:>8.1f}ms{extra}")
        if result["status"] == "FAIL":
            all_pass = False

    # --- TCP Services ---
    tcp_tests = [
        ("PostgreSQL", "localhost", 5432),
        ("Redis", "localhost", 6379),
        ("Backend API (TCP)", "localhost", 8000),
        ("Frontend (TCP)", "localhost", 3000),
        ("Prometheus (TCP)", "localhost", 9090),
        ("Grafana (TCP)", "localhost", 3001),
        ("Jaeger (TCP)", "localhost", 16686),
        ("Alertmanager (TCP)", "localhost", 9093),
    ]

    print()
    for name, host, port in tcp_tests:
        result = test_tcp(name, host, port)
        results.append(result)
        icon = "OK" if result["status"] == "PASS" else "FAIL"
        latency = result.get("latency_ms", 0)
        extra = ""
        if result["status"] == "FAIL":
            extra = f" ({result.get('error', 'unknown')})"
        print(f"  [{icon}] {name:<30} {latency:>8.1f}ms{extra}")
        if result["status"] == "FAIL":
            all_pass = False

    # --- Summary ---
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")

    print()
    print("=" * 70)
    print(f"RESULTS: {passed} passed, {failed} failed, {len(results)} total")
    if all_pass:
        print("ALL TESTS PASSED")
    else:
        print("SOME TESTS FAILED - see details above")
        print()
        print("Failed tests:")
        for r in results:
            if r["status"] == "FAIL":
                print(f"  - {r['name']}: {r.get('error', 'unknown')}")
    print("=" * 70)

    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
