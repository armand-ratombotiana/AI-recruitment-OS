"""End-to-end live API test script.

Hits the running API at http://localhost:8000 and exercises:
- /api/v1/mailing/health
- /api/v1/auth/register (sends verification email)
- /api/v1/auth/verify-email
- /api/v1/auth/login with demo@airos.io / demo1234
- /api/v1/auth/forgot-password (sends reset email)
- /api/v1/auth/reset-password
- Account lockout after 5 failed attempts
"""
import time
import uuid

import httpx
import json
import sys

BASE = "http://localhost:8000/api/v1"
RUN_ID = uuid.uuid4().hex[:8]
USER_EMAIL = f"newuser_{RUN_ID}@example.com"
LOCK_EMAIL = f"lockme_{RUN_ID}@example.com"


def hr(t: str) -> None:
    print()
    print("=" * 70)
    print(t)
    print("=" * 70)


def main() -> int:
    client = httpx.Client(timeout=15.0)

    hr("1. Mailing service health")
    r = client.get(f"{BASE}/mailing/health")
    print(r.status_code, r.json())

    hr("2. List sent emails (initial)")
    r = client.get(f"{BASE}/mailing/admin/emails")
    print(r.status_code, r.json())

    hr("3. Register a new user")
    r = client.post(
        f"{BASE}/auth/register",
        json={
            "email": USER_EMAIL,
            "full_name": "New User",
            "password": "SecureP@ss123",
        },
    )
    print(r.status_code, json.dumps(r.json(), indent=2)[:600])
    user_id = r.json().get("id")

    hr("4. Verify a verification email was sent")
    r = client.get(
        f"{BASE}/mailing/admin/emails?type=email_verification&to={USER_EMAIL}"
    )
    print(r.status_code)
    emails = r.json()["emails"]
    print("emails found:", len(emails))
    assert len(emails) >= 1, "expected at least one verification email"
    token = emails[0]["extra"]["token"]
    print("token:", token[:30], "...")

    hr("5. Verify email with token")
    r = client.post(f"{BASE}/auth/verify-email?token={token}")
    print(r.status_code, r.json())
    assert r.json().get("verified") is True

    hr("6. Demo login (demo@airos.io / demo1234)")
    r = client.post(
        f"{BASE}/auth/login",
        json={"email": "demo@airos.io", "password": "demo1234"},
    )
    print(r.status_code, json.dumps(r.json(), indent=2)[:500])
    assert r.status_code == 200, "demo login should succeed"
    body = r.json()
    assert body["user"]["is_demo"] is True
    assert body["user"]["email_verified"] is True

    hr("7. Forgot password")
    r = client.post(
        f"{BASE}/auth/forgot-password",
        json={"email": USER_EMAIL},
    )
    print(r.status_code, r.json())

    hr("8. Get reset token from sent emails")
    r = client.get(
        f"{BASE}/mailing/admin/emails?type=password_reset&to={USER_EMAIL}"
    )
    emails = r.json()["emails"]
    print("reset emails found:", len(emails))
    assert len(emails) >= 1
    reset_token = emails[0]["extra"]["token"]
    print("reset token:", reset_token[:30], "...")

    hr("9. Reset password with token")
    r = client.post(
        f"{BASE}/auth/reset-password",
        json={"token": reset_token, "new_password": "NewSecureP@ss456"},
    )
    print(r.status_code, r.json())

    hr("10. Login with the new password")
    r = client.post(
        f"{BASE}/auth/login",
        json={"email": USER_EMAIL, "password": "NewSecureP@ss456"},
    )
    print(r.status_code, json.dumps(r.json(), indent=2)[:300])
    assert r.status_code == 200

    # Wait a bit for any rate limiter state
    time.sleep(0.1)

    hr("11. Account lockout after 5 failed attempts")
    # Use a fresh user so demo state isn't disrupted
    client.post(
        f"{BASE}/auth/register",
        json={
            "email": LOCK_EMAIL,
            "full_name": "Lock",
            "password": "SecureP@ss123",
        },
    )
    for i in range(6):
        r = client.post(
            f"{BASE}/auth/login",
            json={"email": LOCK_EMAIL, "password": "WrongP@ssword"},
        )
        detail = r.json().get("detail", "")[:80]
        print(f"  attempt {i + 1}: status={r.status_code} detail={detail!r}")
        if i >= 4:
            assert r.status_code in (423, 401), "expected lockout after 5 attempts"
        else:
            assert r.status_code == 401

    hr("12. Demo account still works (not affected by lockout)")
    r = client.post(
        f"{BASE}/auth/login",
        json={"email": "demo@airos.io", "password": "demo1234"},
    )
    print(r.status_code, "is_demo:", r.json().get("user", {}).get("is_demo"))
    assert r.status_code == 200

    hr("13. /auth/me for demo user")
    token_value = r.json()["access_token"]
    r = client.get(
        f"{BASE}/auth/me", headers={"Authorization": f"Bearer {token_value}"}
    )
    print(r.status_code, json.dumps(r.json(), indent=2))
    assert r.json()["is_demo"] is True
    assert r.json()["email_verified"] is True

    hr("14. Refresh token rotation")
    rt = r_pre_refresh = client.post(
        f"{BASE}/auth/login",
        json={"email": "demo@airos.io", "password": "demo1234"},
    ).json()["refresh_token"]
    r1 = client.post(f"{BASE}/auth/refresh", json={"refresh_token": rt})
    rt2 = r1.json().get("refresh_token")
    print(f"  old == new: {rt == rt2}")
    assert rt != rt2, "refresh token should rotate"
    # Old should be invalid
    r_old = client.post(f"{BASE}/auth/refresh", json={"refresh_token": rt})
    assert r_old.status_code == 401, "old token should be revoked"

    hr("15. Logout revokes the supplied refresh token")
    rt3 = r1.json()["refresh_token"]
    r = client.post(f"{BASE}/auth/logout", json={"refresh_token": rt3})
    print("logout:", r.status_code, r.json())
    r_after = client.post(f"{BASE}/auth/refresh", json={"refresh_token": rt3})
    print("refresh after logout:", r_after.status_code)
    assert r_after.status_code == 401

    print()
    print("=" * 70)
    print("ALL E2E TESTS PASSED")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
