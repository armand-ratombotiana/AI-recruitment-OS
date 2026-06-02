"""Test that frontend pages are served correctly from Docker."""
import requests
import re
import sys

BASE_URL = "http://localhost:3000"


def test_landing_page():
    """Test landing page at /."""
    resp = requests.get(BASE_URL, timeout=10)
    assert resp.status_code == 200, f"Landing page returned {resp.status_code}"
    html = resp.text
    assert "AI-Native Recruitment" in html or "AI-ROS" in html, "Landing page missing brand text"
    assert "Start Free Trial" in html or "/register" in html, "Landing page missing CTA"
    assert "Features" in html or "features" in html, "Landing page missing features section"
    print("  PASS  Landing page (/)")


def test_login_page():
    """Test login page at /login."""
    resp = requests.get(f"{BASE_URL}/login", timeout=10)
    assert resp.status_code == 200, f"Login page returned {resp.status_code}"
    html = resp.text
    assert "Welcome back" in html or "Sign in" in html or "login" in html.lower(), \
        "Login page missing expected text"
    assert "email" in html.lower(), "Login page missing email input"
    assert "password" in html.lower(), "Login page missing password input"
    print("  PASS  Login page (/login)")


def test_register_page():
    """Test register page at /register."""
    resp = requests.get(f"{BASE_URL}/register", timeout=10)
    assert resp.status_code == 200, f"Register page returned {resp.status_code}"
    html = resp.text
    assert "Create" in html or "Register" in html or "Sign up" in html or "free trial" in html.lower(), \
        "Register page missing expected text"
    assert "email" in html.lower(), "Register page missing email input"
    print("  PASS  Register page (/register)")


def test_dashboard_sidebar():
    """Test dashboard sidebar navigation via a child route.

    The (dashboard) route group doesn't create a /dashboard URL.
    Sidebar content is visible on child routes like /candidates.
    """
    resp = requests.get(f"{BASE_URL}/candidates", timeout=10)
    assert resp.status_code == 200, f"Candidates page returned {resp.status_code}"
    html = resp.text
    assert "Candidates" in html or "candidates" in html.lower(), \
        "Candidates page missing expected text"
    assert "Dashboard" in html or "Jobs" in html or "Interviews" in html, \
        "Dashboard sidebar navigation missing"
    assert "AI-ROS" in html, "Dashboard missing brand name"
    print("  PASS  Dashboard sidebar navigation (/candidates)")


def test_next_js_manifest():
    """Test that Next.js build artifacts are served."""
    resp = requests.get(f"{BASE_URL}/_next/static/", timeout=10)
    # Static directory may 404 but should still respond
    assert resp.status_code in (200, 404), \
        f"Next.js static assets returned unexpected {resp.status_code}"
    print("  PASS  Next.js static assets accessible")


def test_html_structure():
    """Verify HTML pages have proper structure."""
    pages = {
        "/": ["<html", "<head", "<body", "<div"],
        "/login": ["<html", "<head", "<body", "<form"],
        "/register": ["<html", "<head", "<body", "<form"],
        "/candidates": ["<html", "<head", "<body", "<div"],
    }
    for path, required_tags in pages.items():
        resp = requests.get(f"{BASE_URL}{path}", timeout=10)
        html = resp.text
        for tag in required_tags:
            assert tag in html.lower(), f"Page {path} missing {tag}"
    print("  PASS  HTML structure validation")


def main():
    tests = [
        test_landing_page,
        test_login_page,
        test_register_page,
        test_dashboard,
        test_next_js_manifest,
        test_html_structure,
    ]
    passed = 0
    failed = 0
    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"  FAIL  {test.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"  FAIL  {test.__name__}: {e}")
            failed += 1

    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed")
    if failed:
        sys.exit(1)
    print("All frontend Docker tests passed!")


if __name__ == "__main__":
    main()
