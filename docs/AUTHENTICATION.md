# AI-ROS — Authentication Guide

How authentication works in the AI Recruitment OS, and how to integrate it
safely from the backend, frontend, mobile, and partner integrations.

---

## 1. Overview

AI-ROS uses **JWT bearer tokens** issued by the Auth service. A short-lived
access token is paired with a long-lived refresh token; both are required
for fully authenticated requests.

| Token | Lifetime | Purpose | Storage |
|-------|----------|---------|---------|
| Access token (JWT) | 30 minutes (default) | Authorise API calls | Memory / `httpOnly` cookie |
| Refresh token | 7 days (default) | Obtain new access tokens | `httpOnly` cookie (recommended) or server-side store |
| API key | Until revoked | Service-to-service auth | Secret manager only |
| SSO assertion | 5 minutes | One-time exchange for a JWT | Never persisted |
| MFA TOTP code | 30 seconds | Second factor on login | Authenticator app |
| Email verification | 24 hours | Confirm ownership of email | Email link |
| Password reset | 2 hours | Reset forgotten password | Email link |

All authentication-related configuration lives in `backend/shared/core/config.py`
under the `AUTH_*` and `JWT_*` settings.

---

## 2. Token lifecycle

```
              ┌──────────────┐
              │  /register   │──┐
              └──────────────┘  │  returns { access, refresh, user }
                               ▼
            ┌──────────────────────────────────┐
            │  Access: 30 m  /  Refresh: 7 d   │   stored in DB-backed Session
            └──────────────────────────────────┘
              │                              ▲
              │  HTTP Bearer                 │  /auth/refresh
              ▼                              │
        ┌──────────────┐                ┌────┴─────────┐
        │  API call    │                │  /refresh    │  rotates refresh token
        └──────────────┘                └──────────────┘  (old one invalidated)
              │
              │  401 Unauthorized
              ▼
        ┌──────────────┐
        │  /refresh    │  →  new access (and possibly refresh)
        └──────────────┘
              │
              │  user clicks "log out" OR refresh fails
              ▼
        ┌──────────────┐
        │  /logout     │  →  revokes the session row
        └──────────────┘
```

Key invariants:
- Access tokens are **stateless** (no DB read per request) but carry a `jti`
  that is referenced when refresh / logout is called.
- Refresh tokens are **stateful**: each is stored in the `sessions` table
  keyed by a SHA-256 hash. When `/auth/refresh` is called the old row is
  invalidated and a new one is issued (rotation).
- `/auth/logout` revokes the refresh row. Access tokens remain valid until
  their `exp`; rotate the `SECRET_KEY` or wait for natural expiry to
  invalidate outstanding access tokens.

---

## 3. Endpoints

### 3.1 Registration & login

#### `POST /api/v1/auth/register`
Creates a new user, sends a verification email, auto-logs the user in,
and returns a fresh access/refresh pair.

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@acme.com",
    "full_name": "Jane Recruiter",
    "password": "SecureP@ss123",
    "role": "recruiter"
  }'
```

Passwords must be **at least 8 characters** and contain an upper-case letter,
a lower-case letter, a digit, and one of `!@#$%^&*()_+-=[]{};':"\\|,.<>/?`~`.

The response (200) contains:
```json
{
  "id": "u_…",
  "email": "user@acme.com",
  "access_token": "eyJ…",
  "refresh_token": "rt_…",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": { "id": "u_…", "email": "…", "role": "recruiter", "email_verified": false },
  "verification_email_sent": true
}
```

#### `POST /api/v1/auth/login`
Validates the email + password combination, applies rate limiting, and
returns a token pair. Generic error messages are returned to avoid
user-existence leaks.

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "user@acme.com", "password": "SecureP@ss123" }'
```

#### `POST /api/v1/auth/refresh`
Exchanges a valid refresh token for a fresh access token (and a new
refresh token, rotated).

```bash
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{ "refresh_token": "rt_…" }'
```

#### `POST /api/v1/auth/logout`
Revokes the current session. The response is idempotent.

#### `GET /api/v1/auth/me`
Returns the authenticated user profile. Requires a valid access token.

---

### 3.2 Password reset

The reset flow uses **two endpoints** with a token exchanged by email.
The token is single-use and expires after 2 hours.

```bash
# 1. Request a reset
curl -X POST http://localhost:8000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{ "email": "user@acme.com" }'
# → { "message": "If the account exists, a reset email has been sent." }

# 2. (Email contains a link with the token)
#    User clicks the link → frontend calls:
curl -X POST http://localhost:8000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{ "token": "rt_…", "new_password": "NewSecureP@ss456" }'
# → { "message": "Password has been reset successfully." }
```

The same generic message is returned for both "user exists" and "user does
not exist" to avoid account enumeration.

---

### 3.3 Email verification

```bash
# Verify with the token from the verification email
curl -X POST "http://localhost:8000/api/v1/auth/verify-email?token=…"

# Re-send if the link expired (rate-limited to 3 / minute per IP+email)
curl -X POST http://localhost:8000/api/v1/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{ "email": "user@acme.com" }'
```

---

### 3.4 Multi-factor authentication (MFA / TOTP)

MFA uses a TOTP (RFC 6238) secret bound to a standard authenticator app
(Google Authenticator, 1Password, Authy, etc.). The flow is **enrol-then-verify**
so a stolen secret cannot be activated by an attacker.

```bash
# 1. Enable — server returns a secret, otpauth URL, and one-time backup codes.
curl -X POST http://localhost:8000/api/v1/auth/mfa/enable \
  -H "Authorization: Bearer …" \
  -H "Content-Type: application/json" \
  -d '{ "user_id": "u_…" }'
# {
#   "secret": "JBSWY3DPEHPK3PXP",
#   "otpauth_url": "otpauth://totp/AI-ROS%3Auser%40acme.com?secret=JBSWY3DPEHPK3PXP&issuer=AI-ROS",
#   "backup_codes": ["123456", "789012", …]
# }

# 2. Verify — supply a fresh 6-digit code from the user's app.
curl -X POST http://localhost:8000/api/v1/auth/mfa/verify \
  -H "Authorization: Bearer …" \
  -H "Content-Type: application/json" \
  -d '{ "user_id": "u_…", "code": "123456" }'
# → { "verified": true }
```

The `MFAVerifyRequest` is also called as a second step during login: when
the user's account has MFA enabled the login endpoint will respond with
`202 Accepted` and a `mfa_token`; the client must complete the login by
calling `/auth/mfa/verify` with the same `user_id` and a fresh TOTP code.

---

### 3.5 API keys (service-to-service)

API keys are intended for **server-to-server** integrations (CI, webhooks,
background workers). They never expire automatically; rotation is done
explicitly via a new key + revoke of the old one.

```bash
# Create a key
curl -X POST http://localhost:8000/api/v1/auth/api-keys \
  -H "Authorization: Bearer …" \
  -H "Content-Type: application/json" \
  -d '{ "name": "ingest-pipeline" }'
# {
#   "id": "ak_…",
#   "name": "ingest-pipeline",
#   "key": "S_-MMZ1GGcHvw17ID4z3sp63XwwKrkQ-VT-xRa_-2l08KrXB1ZUnIpQKuiV56Qiu",
#   "scopes": {},
#   "expires_at": null,
#   "created_at": "2026-06-04T07:44:19Z"
# }
#  ⚠️  The plaintext `key` is returned ONCE — store it now.

# List (without the secret material)
curl -X GET http://localhost:8000/api/v1/auth/api-keys \
  -H "Authorization: Bearer …"

# Revoke
curl -X DELETE http://localhost:8000/api/v1/auth/api-keys/{id} \
  -H "Authorization: Bearer …"
```

Use the key as a bearer token:
```bash
curl http://localhost:8000/api/v1/candidates/ \
  -H "Authorization: Bearer S_-MMZ1GGcHvw17ID4z3sp63XwwKrkQ-VT-xRa_-2l08KrXB1ZUnIpQKuiV56Qiu"
```

The server stores only the SHA-256 hash of the key; the plaintext value
is never recoverable after creation.

---

### 3.6 SSO (Google, Microsoft, LinkedIn, Apple)

SSO is implemented as an **OAuth 2.0 Authorization Code** exchange. The
frontend redirects the user to the provider, the provider redirects back
with a `code`, and the backend exchanges that for a profile + an
AI-ROS JWT.

```bash
# Frontend redirects to:
#   /api/v1/auth/sso/{provider}?redirect_uri=…

# After consent, the provider redirects back to:
#   https://app.example.com/sso/callback?code=…&state=…

# The frontend then calls:
curl -X POST http://localhost:8000/api/v1/auth/sso/{provider}/exchange \
  -H "Content-Type: application/json" \
  -d '{ "code": "…", "state": "…", "redirect_uri": "https://…" }'
# → { "access_token": "…", "refresh_token": "…", "user": { … } }
```

Provider configuration is read from environment variables:
`SSO_GOOGLE_CLIENT_ID`, `SSO_GOOGLE_CLIENT_SECRET`, `SSO_MICROSOFT_*`,
`SSO_LINKEDIN_*`, `SSO_APPLE_*`.

---

## 4. Authorisation

Authentication is **who you are**; authorisation is **what you can do**.
AI-ROS uses a simple role-based scheme for v1:

| Role | Can |
|------|-----|
| `super_admin` | Everything (cross-tenant) |
| `tenant_admin` | Manage users, jobs, candidates, billing within their tenant |
| `recruiter` | Manage jobs, candidates, interviews within their tenant |
| `candidate` | Manage their own profile, applications, PPE sessions |
| `hiring_manager` | Review assigned candidates, leave feedback |

Tenancy is scoped via the `X-Tenant-ID` header. The middleware resolves
the tenant from the token's `tenant_id` claim when present, and falls
back to the header.

> Most public endpoints (`/auth/login`, `/billing/plans`,
> `/webhooks/billing/stripe`) **do not** require a token. Anything under
> `/api/v1/*` that mutates state does.

---

## 5. Security best practices

1. **Always use HTTPS in production.** The dev server accepts plain HTTP
   but should never be exposed publicly.
2. **Set `SECRET_KEY` and `ENCRYPTION_KEY` to long random values.**
   The defaults in `.env.example` are dev-only.
3. **Rotate keys on suspected compromise.** Rotating `SECRET_KEY`
   invalidates *all* outstanding access tokens; clients will need to
   log in again.
4. **Store refresh tokens in `httpOnly` cookies** to mitigate XSS.
   The same applies to the API key plaintext.
5. **Use short-lived access tokens** in production. The default (30 m)
   is a sensible starting point; reduce to 5 m for sensitive tenants.
6. **Enforce MFA on tenant_admin and super_admin accounts.** The auth
   service exposes `/auth/mfa/enable` for self-service.
7. **Watch for 401 spikes in monitoring.** A sudden increase usually
   indicates a token leak, expired client, or active credential-stuffing
   attempt.
8. **Treat the verification/reset emails as PII.** They contain
   one-time tokens — never log them.
9. **Apply per-IP rate limits** to `/auth/login`, `/auth/register`, and
   `/auth/forgot-password` (defaults: 10 / 5 / 3 per minute).
10. **Never trust the `role` field from the client.** Always derive it
    from the JWT or the database.

---

## 6. Error codes

| Status | When | Detail |
|--------|------|--------|
| 400 | Invalid request body (e.g. weak password) | Specific validation error |
| 401 | Missing or invalid bearer token | `Missing or invalid authorization header` / `Invalid or expired token` |
| 403 | Authenticated but lacks the role for the resource | `Forbidden` |
| 404 | Resource not found *or* user does not exist (login) | `User not found` / `Invalid email or password` |
| 409 | Duplicate email on registration | `A user with this email already exists` |
| 422 | Pydantic validation failure | Field-level error list |
| 429 | Rate-limit exceeded on auth endpoint | `Too many … attempts. Please try again later.` |
| 500 | Unexpected server error | `Internal server error` |
| 503 | Required service (PostgreSQL/Redis) is down | Surfaced by `/health` |

The error envelope is the standard FastAPI shape:
```json
{ "detail": "Invalid email or password" }
```
or, for validation errors,
```json
{ "detail": [ { "loc": ["body","email"], "msg": "...", "type": "..." } ] }
```

---

## 7. Example: full login flow from JavaScript

```js
// 1. Register
const reg = await fetch("/api/v1/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "user@acme.com",
    full_name: "Jane Recruiter",
    password: "SecureP@ss123",
  }),
});
const regData = await reg.json();
localStorage.setItem("access_token", regData.access_token);
// refresh token should be set as an httpOnly cookie by the server

// 2. Subsequent calls
async function api(path, opts = {}) {
  const token = localStorage.getItem("access_token");
  const r = await fetch(`/api/v1${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (r.status === 401) {
    // Try to refresh once
    const refresh = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (refresh.ok) {
      const data = await refresh.json();
      localStorage.setItem("access_token", data.access_token);
      return api(path, opts);
    }
    // Refresh failed → kick to login
    location.href = "/login";
  }
  return r;
}
```

---

## 8. Example: backend-to-backend with API key

```python
import httpx

API_KEY = "S_-MMZ1GGcHvw17ID4z3sp63XwwKrkQ-VT-xRa_-2l08KrXB1ZUnIpQKuiV56Qiu"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

# Ingest a new candidate
r = httpx.post(
    "http://localhost:8000/api/v1/candidates/",
    headers=HEADERS,
    json={"email": "cand@example.com", "full_name": "Test Candidate"},
)
r.raise_for_status()
print(r.json())
```

---

## 9. Frequently asked questions

**Q: My access token is rejected with 401 immediately after issue.**
A: Check that the system clocks are within ±30 seconds of each other.
JWT validation is strict on the `exp` claim.

**Q: I lost my API key.**
A: The plaintext value cannot be recovered. Create a new key, switch the
caller over, and revoke the old one.

**Q: Can I disable MFA for a user?**
A: Yes, by issuing a `DELETE /api/v1/auth/mfa/{user_id}` call as a
`tenant_admin` or `super_admin`.

**Q: Does the demo account support MFA?**
A: Yes, but the seed complexity is relaxed. For production
self-service, always require a complex password.
