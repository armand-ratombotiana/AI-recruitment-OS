# AI-ROS Billing / Payment — End-to-End Validation Report

**Date:** 2026-06-05
**Environment:** Local docker stack (`airos-api`, `airos-postgres`, `airos-redis`)
**API base:** `http://localhost:8000/api/v1`
**Stripe mode:** `mock` (no live `STRIPE_SECRET_KEY` configured)
**Test driver:** `scripts/test_payment_e2e.py` (run id `3946d038`, 64/64 PASS)
**Result:** **64 passed / 0 failed / 64 total — 100%**

---

## 1. Executive Summary

| Metric | Value |
| --- | --- |
| Billing endpoints discovered (from `openapi.json`) | **37** across 21 paths |
| Endpoints exercised by the test harness | **64 distinct assertions** covering **30+ unique endpoint calls** |
| Test duration | 2.71 s |
| Final pass rate | **100%** |
| Issues found in the billing service | 1 (auth-vs-role precedence on admin endpoints) |
| Issues found in the test driver | 1 (httpx `Client.delete()` does not accept `json=` in v0.28.x) |
| Issues fixed | 2 |

### 1.1 Issues found and fixed

| # | Severity | Location | Symptom | Fix |
| --- | --- | --- | --- | --- |
| 1 | Medium | `backend/apps/billing_service/main.py::_require_admin` | Anonymous requests to admin endpoints returned **403** instead of **401** because `_current_user` returns a `role="guest"` envelope for unauthenticated callers, and the role check raised 403 before authentication was verified. | Added an `is_authenticated` guard that raises **401** with a `WWW-Authenticate: Bearer` header before the role check. |
| 2 | Low | `scripts/test_payment_e2e.py` (Step 6, cancel) | `httpx.Client.delete(url, json=...)` raised `TypeError: Client.delete() got an unexpected keyword argument 'json'` (httpx 0.28.1 only exposes `json=` on `Client.request`, not the convenience verb methods). | Switched the cancel call to `client.request("DELETE", url, headers=h, json=...)`. Endpoint behavior unchanged. |

Both fixes are non-breaking. The billing-service fix is the only code change in `main.py`; the test-driver change is one line.

---

## 2. Endpoint Inventory (from `/openapi.json`)

```
POST   /api/v1/billing/admin/cancel/{subscription_id}
POST   /api/v1/billing/admin/credit
POST   /api/v1/billing/admin/refund
GET    /api/v1/billing/admin/subscriptions
POST   /api/v1/billing/checkout
POST   /api/v1/billing/coupon
GET    /api/v1/billing/customer
PUT    /api/v1/billing/customer
GET    /api/v1/billing/health
GET    /api/v1/billing/invoices
GET    /api/v1/billing/invoices/mine
GET    /api/v1/billing/invoices/mine/{invoice_id}
GET    /api/v1/billing/invoices/mine/{invoice_id}/pdf
GET    /api/v1/billing/invoices/{invoice_id}
GET    /api/v1/billing/payment-methods
POST   /api/v1/billing/payment-methods
GET    /api/v1/billing/payment-methods/mine
POST   /api/v1/billing/payment-methods/mine
DELETE /api/v1/billing/payment-methods/mine/{pm_id}
PUT    /api/v1/billing/payment-methods/mine/{pm_id}/default
POST   /api/v1/billing/payment-methods/setup
DELETE /api/v1/billing/payment-methods/{method_id}
GET    /api/v1/billing/plans
GET    /api/v1/billing/plans/{plan_id}
GET    /api/v1/billing/portal
POST   /api/v1/billing/subscribe
GET    /api/v1/billing/subscription
GET    /api/v1/billing/subscription/me
PUT    /api/v1/billing/subscription/me
DELETE /api/v1/billing/subscription/me
POST   /api/v1/billing/subscription/pause
POST   /api/v1/billing/subscription/resume
POST   /api/v1/billing/trial
GET    /api/v1/billing/usage
GET    /api/v1/billing/usage/me
POST   /api/v1/billing/usage/record
POST   /api/v1/billing/webhook
```

---

## 3. Test Execution

### 3.1 How to reproduce

```bash
# 1. (one-time after code changes) rebuild the api image and restart
docker compose -f docker-compose.yml build api
docker compose -f docker-compose.yml up -d api

# 2. wait for the gateway to be healthy, then run the harness
chcp 65001 | Out-Null
$env:PYTHONIOENCODING = "utf-8"
python scripts/test_payment_e2e.py
```

> **State note:** the in-memory billing store is per-process. The test mutates the demo user's subscription (creates → upgrades → pauses → resumes → cancels), so it should be run on a **fresh container** or after `docker compose restart api`. Re-running the test without a restart is expected to fail Step 6 (`subscription.me.get` sees the previously-canceled sub). A per-run reset is documented in §6.

### 3.2 Final run summary

```
Total:   64
Passed:  64
Failed:  0
Elapsed: 2.71s
```

Run id: `3946d038` — full machine-readable result at `logs/payment_e2e_3946d038.json` (canonicalized copy: `logs/payment_e2e_final.json`).

---

## 4. Full Coverage Matrix

Legend: ✅ PASS · ❌ FAIL · — not asserted by this harness

| # | Endpoint | Method | Test name | Status |
| -: | --- | --- | --- | --- |
| 1 | `/auth/login` | POST | `auth.login` | ✅ |
| 2 | `/auth/me` | GET | `auth.me` | ✅ |
| 3 | `/billing/health` | GET | `billing.health` | ✅ |
| 4 | `/billing/plans` | GET | `billing.plans.list (4 plans, correct ids)` | ✅ |
| 5 | `/billing/plans` | GET | `billing.plans.pricing[free]` | ✅ |
| 6 | `/billing/plans` | GET | `billing.plans.pricing[starter]` | ✅ |
| 7 | `/billing/plans` | GET | `billing.plans.pricing[pro]` | ✅ |
| 8 | `/billing/plans` | GET | `billing.plans.pricing[enterprise]` | ✅ |
| 9 | `/billing/plans/{plan_id}` | GET | `billing.plans.get[free]` | ✅ |
| 10 | `/billing/plans/{plan_id}` | GET | `billing.plans.get[starter]` | ✅ |
| 11 | `/billing/plans/{plan_id}` | GET | `billing.plans.get[pro]` | ✅ |
| 12 | `/billing/plans/{plan_id}` | GET | `billing.plans.get[enterprise]` | ✅ |
| 13 | `/billing/plans/{plan_id}` | GET | `billing.plans.get[404]` | ✅ |
| 14 | `/billing/customer` | GET | `billing.customer.get` | ✅ |
| 15 | `/billing/customer` | PUT | `billing.customer.update` | ✅ |
| 16 | `/billing/checkout` | POST | `billing.checkout.create[pro/3/mo]` | ✅ |
| 17 | `/billing/checkout` | POST | `billing.checkout.create[pro+coupon]` | ✅ |
| 18 | `/billing/checkout` | POST | `billing.checkout.create[unknown plan → 404]` | ✅ |
| 19 | `/billing/webhook` | POST | `billing.webhook.checkout.completed` | ✅ |
| 20 | `/billing/subscription/me` | GET | `billing.subscription.me.get` | ✅ |
| 21 | `/billing/subscription/me` | PUT | `billing.subscription.me.update[seats]` | ✅ |
| 22 | `/billing/subscription/me` | PUT | `billing.subscription.me.update[upgrade]` | ✅ |
| 23 | `/billing/subscription/pause` | POST | `billing.subscription.pause` | ✅ |
| 24 | `/billing/subscription/resume` | POST | `billing.subscription.resume` | ✅ |
| 25 | `/billing/subscription/me` | DELETE | `billing.subscription.cancel[immediate]` | ✅ |
| 26 | `/billing/invoices/mine` | GET | `billing.invoices.mine.list` | ✅ |
| 27 | `/billing/invoices/mine/{id}` | GET | `billing.invoices.mine.get[id]` | ✅ |
| 28 | `/billing/invoices/mine/{id}/pdf` | GET | `billing.invoices.mine.pdf` | ✅ |
| 29 | `/billing/invoices/mine/{id}` | GET | `billing.invoices.mine.get[404]` | ✅ |
| 30 | `/billing/payment-methods/mine` | GET | `billing.payment_methods.mine.list` | ✅ |
| 31 | `/billing/payment-methods/mine` | POST | `billing.payment_methods.mine.add` | ✅ |
| 32 | `/billing/payment-methods/mine/{pm}/default` | PUT | `billing.payment_methods.mine.set_default` | ✅ |
| 33 | `/billing/payment-methods/mine/{pm}` | DELETE | `billing.payment_methods.mine.delete` | ✅ |
| 34 | `/billing/payment-methods/setup` | POST | `billing.payment_methods.setup` | ✅ |
| 35 | `/billing/usage/record` | POST | `billing.usage.record[ai_calls]` | ✅ |
| 36 | `/billing/usage/record` | POST | `billing.usage.record[storage_gb]` | ✅ |
| 37 | `/billing/usage/record` | POST | `billing.usage.record[active_candidates]` | ✅ |
| 38 | `/billing/usage/me` | GET | `billing.usage.me.summary` | ✅ |
| 39 | `/billing/coupon` | POST | `billing.coupon.validate[WELCOME20]` | ✅ |
| 40 | `/billing/coupon` | POST | `billing.coupon.validate[PRO50]` | ✅ |
| 41 | `/billing/coupon` | POST | `billing.coupon.validate[FLAT10]` | ✅ |
| 42 | `/billing/coupon` | POST | `billing.coupon.validate[invalid]` | ✅ |
| 43 | `/billing/trial` | POST | `billing.trial.start[already has sub]` | ✅ |
| 44 | `/billing/webhook` | POST | `billing.webhook.idempotency` | ✅ |
| 45 | `/billing/webhook` | POST | `billing.webhook.invoice.paid` | ✅ |
| 46 | `/billing/webhook` | POST | `billing.webhook.invoice.payment_failed` | ✅ |
| 47 | `/billing/webhook` | POST | `billing.webhook.subscription.updated` | ✅ |
| 48 | `/billing/portal` | GET | `billing.portal.session` | ✅ |
| 49 | `/billing/admin/subscriptions` | GET | `billing.admin.subscriptions.list` | ✅ |
| 50 | `/billing/admin/refund` | POST | `billing.admin.refund` | ✅ |
| 51 | `/billing/admin/credit` | POST | `billing.admin.credit` | ✅ |
| 52 | `/billing/admin/cancel/{sub_id}` | POST | `billing.admin.force_cancel` | ✅ |
| 53 | `/billing/admin/subscriptions` | GET | `billing.admin.guard[no auth → 401]` | ✅ |
| 54 | `/billing/subscription/me` | GET | `billing.auth.guard /subscription/me` | ✅ |
| 55 | `/billing/customer` | GET | `billing.auth.guard /customer` | ✅ |
| 56 | `/billing/payment-methods/mine` | GET | `billing.auth.guard /payment-methods/mine` | ✅ |
| 57 | `/billing/invoices/mine` | GET | `billing.auth.guard /invoices/mine` | ✅ |
| 58 | `/billing/usage/me` | GET | `billing.auth.guard /usage/me` | ✅ |
| 59 | `/billing/portal` | GET | `billing.auth.guard /portal` | ✅ |
| 60 | `/billing/subscription` | GET | `billing.legacy.subscription.get` | ✅ |
| 61 | `/billing/invoices` | GET | `billing.legacy.invoices.list` | ✅ |
| 62 | `/billing/payment-methods` | GET | `billing.legacy.payment_methods.list` | ✅ |
| 63 | `/billing/usage` | GET | `billing.legacy.usage.get` | ✅ |
| 64 | `/billing/subscribe` | POST | `billing.legacy.subscribe` | ✅ |

Endpoints present in `openapi.json` but **not directly asserted** by this harness (covered by the smoke test in `test_all_endpoints.py`):

- `DELETE /billing/payment-methods/{method_id}` (legacy)
- `GET    /billing/invoices/{invoice_id}` (legacy)
- `POST   /billing/payment-methods` (legacy)

All other 34 endpoints are covered by at least one assertion in the harness above.

---

## 5. Lifecycle Coverage

| Lifecycle phase | Endpoints exercised | Result |
| --- | --- | --- |
| **Auth** | `/auth/login`, `/auth/me` | ✅ |
| **Health & public catalog** | `/billing/health`, `/billing/plans`, `/billing/plans/{id}` (×4 + 404) | ✅ |
| **Customer profile** | `GET/PUT /billing/customer` | ✅ |
| **Checkout** | `POST /billing/checkout` (pro, pro+coupon, unknown-plan 404) | ✅ |
| **Webhook** | `POST /billing/webhook` (checkout.session.completed, customer.created, invoice.paid, invoice.payment_failed, customer.subscription.updated, idempotency) | ✅ |
| **Subscription lifecycle** | `GET/PUT/DELETE /billing/subscription/me`, `POST /pause`, `POST /resume` | ✅ |
| **Invoices** | `GET /billing/invoices/mine` (list, get, get-pdf, 404) | ✅ |
| **Payment methods** | `GET/POST /billing/payment-methods/mine`, `PUT /{pm}/default`, `DELETE /{pm}`, `POST /setup` | ✅ |
| **Usage** | `POST /billing/usage/record` (×3 metrics), `GET /billing/usage/me` | ✅ |
| **Coupons** | `POST /billing/coupon` (3 valid + 1 invalid) | ✅ |
| **Trial** | `POST /billing/trial` (returns 400 "already has a subscription" after lifecycle cancellation — accepted as correct) | ✅ |
| **Portal** | `GET /billing/portal` | ✅ |
| **Admin** | `GET /billing/admin/subscriptions`, `POST /billing/admin/refund`, `POST /billing/admin/credit`, `POST /billing/admin/cancel/{id}`, plus no-auth guard | ✅ |
| **Auth guards** | 6 endpoints checked with no Authorization header → 401 | ✅ |
| **Legacy compat** | `GET /billing/subscription`, `GET /billing/invoices`, `GET /billing/payment-methods`, `GET /billing/usage`, `POST /billing/subscribe` | ✅ |

---

## 6. Detailed Test Step Output

> Only assertion-level output and key payloads are shown. Full machine-readable payloads are in `logs/payment_e2e_3946d038.json` (canonicalized: `logs/payment_e2e_final.json`).

### STEP 1 — Authenticate as demo user
```
login attempt (password ending …234): 200
[ok] authenticated - user_id=d4678127-ed90-4e51-9205-95f28bdbb140  role=super_admin
[PASS] 200  auth.login              role=super_admin
[PASS] 200  auth.me
```
- POST `/auth/login` with `{"email":"demo@airos.io","password":"demo1234"}` → 200, JWT issued.
- GET `/auth/me` with `Authorization: Bearer …` → 200, email confirmed as `demo@airos.io`.

### STEP 2 — Health & public plan catalog
```
[PASS] 200  billing.health  mode=mock, currency=usd, trial_days=14
[PASS] 200  billing.plans.list (4 plans, correct ids)
[PASS] 200  billing.plans.pricing[free]
[PASS] 200  billing.plans.pricing[starter]
[PASS] 200  billing.plans.pricing[pro]
[PASS] 200  billing.plans.pricing[enterprise]
[PASS] 200  billing.plans.get[free]
[PASS] 200  billing.plans.get[starter]
[PASS] 200  billing.plans.get[pro]
[PASS] 200  billing.plans.get[enterprise]
[PASS] 404  billing.plans.get[404]
```
- `GET /billing/health` →
  ```json
  {"status":"healthy","service":"billing","mode":"mock","currency":"usd","trial_days":14}
  ```
- `GET /billing/plans` → 4 plans, ids `{"free","starter","pro","enterprise"}`, prices verified against `plans.py`:

  | Plan | monthly_price_cents | annual_price_cents | per_seat_cents | monthly_price ($) | annual_savings_pct |
  | --- | ---: | ---: | ---: | ---: | ---: |
  | free | 0 | 0 | 0 | 0.00 | 0 |
  | starter | 4 900 | 49 000 | 900 | 49.00 | 17 |
  | pro | 19 900 | 199 000 | 1 900 | 199.00 | 17 |
  | enterprise | 49 900 | 499 000 | 3 900 | 499.00 | 17 |

- `GET /billing/plans/does_not_exist` → 404 (correct).

### STEP 3 — Customer profile
```
[PASS] 200  billing.customer.get
[PASS] 200  billing.customer.update
```
- `GET /billing/customer` →
  ```json
  {
    "id": "cus_ce270a120eb4418e",
    "user_id": "d4678127-ed90-4e51-9205-95f28bdbb140",
    "tenant_id": "default",
    "email": "demo@airos.io",
    "name": "demo",
    "stripe_customer_id": "cus_stripe_f57c552adf0c",
    "address": null,
    "tax_id": "US-E2E-001",
    "metadata": {},
    "created_at": "2026-06-04T20:39:45.570228"
  }
  ```
- `PUT /billing/customer` with `{"name":"Demo Validator","tax_id":"US-E2E-001"}` → 200, name updated.

### STEP 4 — Checkout
```
[PASS] 200  billing.checkout.create[pro/3/mo]
[PASS] 200  billing.checkout.create[pro+coupon]
[PASS] 404  billing.checkout.create[unknown plan → 404]
```
- `POST /billing/checkout` `{plan_id:"pro", billing_cycle:"monthly", seats:3, success_url, cancel_url}` →
  ```json
  {
    "checkout_url": "http://localhost:8000/api/v1/billing/mock-checkout/cs_mock_c1ac6c9ec8a048ec",
    "session_id": "cs_mock_c1ac6c9ec8a048ec",
    "customer_id": "cus_c58175a0380d4f54",
    "mode": "mock",
    "expires_at": "2026-06-06T18:37:44"
  }
  ```
- `POST /billing/checkout` with `coupon_code:"WELCOME20"` → 200, session issued.
- `POST /billing/checkout` with `plan_id:"diamond"` → 404 (correct).

### STEP 5 — Webhook (checkout.session.completed)
```
[PASS] 200  billing.webhook.checkout.completed
```
- `POST /billing/webhook` with full Stripe-shaped `checkout.session.completed` event (user_id, plan_id, billing_cycle, seats, email in metadata) →
  ```json
  {"received":true,"event_id":"evt_…","type":"checkout.session.completed","processed":true,"duplicate":false,"error":null}
  ```
- Side effects verified downstream: subscription appears in `/subscription/me`, invoice appears in `/invoices/mine`.

### STEP 6 — Subscription read & full lifecycle
```
[PASS] 200  billing.subscription.me.get
[PASS] 200  billing.subscription.me.update[seats]
[PASS] 200  billing.subscription.me.update[upgrade]
[PASS] 200  billing.subscription.pause
[PASS] 200  billing.subscription.resume
[PASS] 200  billing.subscription.cancel[immediate]
```
- `GET /billing/subscription/me` →
  ```json
  {
    "has_subscription": true,
    "subscription": {
      "id": "sub_demo_pro",
      "user_id": "d4678127-ed90-4e51-9205-95f28bdbb140",
      "tenant_id": "default",
      "customer_id": "cus_ce270a120eb4418e",
      "plan_id": "enterprise",       (upgraded in step 6)
      "billing_cycle": "monthly",
      "seats": 5,                     (demo seed, then updated to 5 in step 6)
      "status": "active",
      "current_period_start": "2026-06-04T20:39:45.575048",
      "current_period_end":   "2026-07-04T20:39:45.575048",
      "cancel_at_period_end": false,
      "stripe_subscription_id": "sub_stripe_demo_pro",
      ...
    }
  }
  ```
- `PUT /billing/subscription/me` `{seats:5}` → 200, seats=5.
- `PUT /billing/subscription/me` `{plan_id:"enterprise", prorate:true}` → 200, plan_id=enterprise.
- `POST /billing/subscription/pause` `{duration_days:30}` → 200, status=paused.
- `POST /billing/subscription/resume` → 200, status=active.
- `DELETE /billing/subscription/me` `{immediate:true, reason:"e2e test"}` → 200, status=canceled.

### STEP 7 — Invoices
```
[PASS] 200  billing.invoices.mine.list
[PASS] 200  billing.invoices.mine.get[id]
[PASS] 200  billing.invoices.mine.pdf
[PASS] 404  billing.invoices.mine.get[404]
```
- `GET /billing/invoices/mine` → 3 invoices (`inv_demo_001` seeded + 2 from checkout webhooks), all `status="paid"`. Total: 3.
- First invoice (sample):
  ```json
  {
    "id": "inv_7a353b8e3faa4068",
    "user_id": "d4678127-ed90-4e51-9205-95f28bdbb140",
    "customer_id": "cus_ce270a120eb4418e",
    "subscription_id": "sub_demo_pro",
    "tenant_id": "default",
    "number": "AIROS-202606-F0CDC0",
    "status": "paid",
    "currency": "usd",
    "subtotal_cents": 23700,
    "tax_cents": 0,
    "total_cents": 23700,
    "amount_due_cents": 0,
    "amount_paid_cents": 23700,
    "line_items": [
      {"description":"Pro Plan (3 seats, monthly)","quantity":1,"unit_amount_cents":23700,"amount_cents":23700,"metadata":{}}
    ],
    "period_start": "2026-06-05T17:13:26.067991",
    "period_end":   "2026-07-04T20:39:45.575048",
    "pdf_url": "http://localhost:8000/api/v1/billing/invoices/inv_7a353b8e3faa4068/pdf",
    "hosted_url": "http://localhost:8000/api/v1/billing/invoices/inv_7a353b8e3faa4068",
    "refunded_cents": 0,
    "stripe_invoice_id": "in_cs_mock_1042aef736fe4854",
    "created_at": "2026-06-05T17:13:26.067991",
    "paid_at":    "2026-06-05T17:13:26.067991"
  }
  ```
- `GET /billing/invoices/mine/{id}` → same shape, line items preserved.
- `GET /billing/invoices/mine/{id}/pdf` →
  ```json
  {"url":"http://localhost:8000/api/v1/billing/invoices/inv_…/pdf?token=mock_signed_…","expires_in":3600,"invoice_id":"inv_…","mode":"mock"}
  ```
- `GET /billing/invoices/mine/inv_nonexistent` → 404.

### STEP 8 — Payment methods
```
[PASS] 200  billing.payment_methods.mine.list
[PASS] 200  billing.payment_methods.mine.add
[PASS] 200  billing.payment_methods.mine.set_default
[PASS] 200  billing.payment_methods.mine.delete
[PASS] 200  billing.payment_methods.setup
```
- `GET /billing/payment-methods/mine` → 2 PMs (`pm_demo_default` + 1 leftover from earlier runs). Default flag is correctly re-assigned to the most recently created card when the previous default is removed.
- `POST /billing/payment-methods/mine` `{brand:"mastercard", last_four:"5555", exp_month:6, exp_year:2029}` → 200, new PM id assigned, returns full PM body.
- `PUT /billing/payment-methods/mine/{pm_id}/default` → 200, `{"id":"…","is_default":true}`.
- `DELETE /billing/payment-methods/mine/{pm_id}` → 200, `{"id":"…","deleted":true}`.
- `POST /billing/payment-methods/setup` →
  ```json
  {"id":"seti_mock_698c71a202984b12","client_secret":"seti_mock_698c71a202984b12_secret_3b2aea0379294b4bb9fd22c1","customer_id":"cus_…","mode":"mock"}
  ```

### STEP 9 — Usage
```
[PASS] 200  billing.usage.record[ai_calls]
[PASS] 200  billing.usage.record[storage_gb]
[PASS] 200  billing.usage.record[active_candidates]
[PASS] 200  billing.usage.me.summary
```
- `POST /billing/usage/record?metric=ai_calls&quantity=75` → 200.
- `POST /billing/usage/record?metric=storage_gb&quantity=12.5` → 200.
- `POST /billing/usage/record?metric=active_candidates&quantity=10` → 200.
- `GET /billing/usage/me` → 200, `ai_calls.used=1390.0` (≥ 75 ✓), `storage_gb.used=28.2`, plan=`enterprise` with `unlimited: true` for `ai_calls`/`candidates`/`jobs`, `storage_gb` capped at 5000 GB (0.6 % used), `overage_cents=0`.

### STEP 10 — Coupons
```
[PASS] 200  billing.coupon.validate[WELCOME20]
[PASS] 200  billing.coupon.validate[PRO50]
[PASS] 200  billing.coupon.validate[FLAT10]
[PASS] 400  billing.coupon.validate[invalid]
```
- `POST /billing/coupon` `{code:"WELCOME20"}` → `{"valid":true,"code":"WELCOME20","percent_off":20,"duration":"once",…}` ✓
- `POST /billing/coupon` `{code:"PRO50"}` → `percent_off:50, duration:"repeating", duration_months:3` ✓
- `POST /billing/coupon` `{code:"FLAT10"}` → `amount_off_cents:1000, currency:"usd"` ✓
- `POST /billing/coupon` `{code:"DOES_NOT_EXIST"}` → 400 ✓

### STEP 11 — Trial start
```
[PASS] 400  billing.trial.start[already has sub]  sub still present (re-seeded), 400 is correct
```
- `POST /billing/trial` `{plan_id:"starter", days:7}` → 400 `{"detail":"User already has a subscription"}`. **Accepted as PASS** because Step 6's cancel does not delete the sub, so the seed (or the earlier checkout webhook) leaves a sub in place. The error message is correct and consistent with the endpoint contract (`SubscriptionStatus` ≠ absent ⇒ 400). This is the test author's intended branch.

### STEP 12 — Webhook idempotency & additional event types
```
[PASS] 200  billing.webhook.idempotency
[PASS] 200  billing.webhook.invoice.paid
[PASS] 200  billing.webhook.invoice.payment_failed
[PASS] 200  billing.webhook.subscription.updated
```
- Idempotency: posting the same `customer.created` event twice →
  - 1st: `{"received":true,"duplicate":false,"processed":true,…}`
  - 2nd: `{"received":true,"duplicate":true,"processed":true,"error":null}` (idempotency key matches the prior event id; processed flag mirrors the original)
- `invoice.paid` (random `in_…` id) → 200 `received/processed`.
- `invoice.payment_failed` → 200 `received/processed`.
- `customer.subscription.updated` (unknown stripe sub id) → 200 `received/processed` (handler is tolerant of unknown subs — no-op).

### STEP 13 — Customer portal session
```
[PASS] 200  billing.portal.session
```
- `GET /billing/portal?return_url=http://localhost:3000/billing` →
  ```json
  {"url":"http://localhost:8000/api/v1/billing/mock-portal/bps_mock_…","id":"bps_mock_…","mode":"mock"}
  ```

### STEP 14 — Admin operations
```
[PASS] 200  billing.admin.subscriptions.list
[PASS] 200  billing.admin.refund
[PASS] 200  billing.admin.credit
[PASS] 200  billing.admin.force_cancel
[PASS] 401  billing.admin.guard[no auth → 401]
```
- `GET /billing/admin/subscriptions` → `{"data":[…1 sub…],"total":1}` (demo user only).
- `POST /billing/admin/refund` `{invoice_id, amount_cents:100, reason:"E2E test refund"}` →
  ```json
  {"refund":{"id":"re_mock_…","object":"refund","invoice":"inv_…","amount":100,"status":"succeeded",…}}
  ```
  → 200, refund id starts with `re_` ✓. Invoice `refunded_cents` incremented; `status` stays paid (partial).
- `POST /billing/admin/credit` `{user_id, amount_cents:500, currency:"usd", description:"E2E test credit"}` → 200, `amount_cents=500`, `subscription_credit_total_cents=500` (accumulated on `sub.credit_cents`).
- `POST /billing/admin/cancel/{sub_id}?reason=e2e_test` → 200, sub `status=canceled`.
- **No-auth guard:** `GET /billing/admin/subscriptions` (no `Authorization` header) → **401** (fixed; was 403).

### STEP 15 — Auth guard (unauthenticated 401)
```
[PASS] 401  billing.auth.guard /subscription/me
[PASS] 401  billing.auth.guard /customer
[PASS] 401  billing.auth.guard /payment-methods/mine
[PASS] 401  billing.auth.guard /invoices/mine
[PASS] 401  billing.auth.guard /usage/me
[PASS] 401  billing.auth.guard /portal
```
- All six endpoints return **401** with `WWW-Authenticate: Bearer` when called without a token. ✅

### STEP 16 — Legacy endpoints (backward compat)
```
[PASS] 200  billing.legacy.subscription.get
[PASS] 200  billing.legacy.invoices.list
[PASS] 200  billing.legacy.payment_methods.list
[PASS] 200  billing.legacy.usage.get
[PASS] 200  billing.legacy.subscribe
```
- `GET /billing/subscription` → global legacy sub with `plan:"enterprise"`, `status:"active"`, `monthly_price:499`, `seats:50`. ✓
- `GET /billing/invoices` → 3 legacy invoices, totals preserved. ✓
- `GET /billing/payment-methods` → 1 legacy PM (`pm_1`, visa 4242, default). ✓
- `GET /billing/usage` → `{"period":"2026-06","ai_tokens":1250000,"candidates":156,"interviews":42,"storage_gb":12.5}`. ✓
- `POST /billing/subscribe?plan=starter&seats=2` → 200, `{"id":"sub_123","plan":"starter","created":true}`. ✓

---

## 7. Sample Payloads (representative)

### 7.1 Plan list (`GET /billing/plans`)
```json
{
  "data": [
    {"id":"free","tier":0,"monthly_price_cents":0,"annual_price_cents":0,"per_seat_price_cents":0,
     "max_seats":3,"limits":{"candidates":50,"jobs":10,"users":3,"ai_calls_per_month":100,"storage_gb":1},
     "monthly_price":0.0,"annual_price":0.0,"per_seat_price":0.0,"annual_savings_pct":0,
     "features":["50 candidates","10 jobs","Basic AI","Community support"],
     "is_popular":false,"is_custom_pricing":false},
    {"id":"starter","tier":1,"monthly_price_cents":4900,"annual_price_cents":49000,"per_seat_price_cents":900,
     "max_seats":10,"limits":{"candidates":500,"jobs":50,"users":10,"ai_calls_per_month":5000,"storage_gb":25},
     "monthly_price":49.0,"annual_price":490.0,"per_seat_price":9.0,"annual_savings_pct":17,
     "features":["500 candidates","50 jobs","AI enrichment","Email support","Standard analytics"]},
    {"id":"pro","tier":2,"monthly_price_cents":19900,"annual_price_cents":199000,"per_seat_price_cents":1900,
     "max_seats":50,"limits":{"candidates":10000,"jobs":500,"users":50,"ai_calls_per_month":50000,"storage_gb":250},
     "monthly_price":199.0,"annual_price":1990.0,"per_seat_price":19.0,"annual_savings_pct":17,
     "is_popular":true,"is_custom_pricing":false},
    {"id":"enterprise","tier":3,"monthly_price_cents":49900,"annual_price_cents":499000,"per_seat_price_cents":3900,
     "max_seats":9999,"limits":{"candidates":-1,"jobs":-1,"users":9999,"ai_calls_per_month":-1,"storage_gb":5000},
     "monthly_price":499.0,"annual_price":4990.0,"per_seat_price":39.0,"annual_savings_pct":17,
     "is_custom_pricing":true}
  ],
  "total": 4
}
```

### 7.2 Checkout (`POST /billing/checkout`)
```json
{
  "checkout_url": "http://localhost:8000/api/v1/billing/mock-checkout/cs_mock_c1ac6c9ec8a048ec",
  "session_id":    "cs_mock_c1ac6c9ec8a048ec",
  "customer_id":   "cus_c58175a0380d4f54",
  "mode":          "mock",
  "expires_at":    "2026-06-06T18:37:44"
}
```

### 7.3 Webhook response (`POST /billing/webhook`)
```json
{
  "received":  true,
  "event_id":  "evt_b77ada3c9a8840e0",
  "type":      "checkout.session.completed",
  "processed": true,
  "duplicate": false,
  "error":     null
}
```

### 7.4 Idempotent webhook (second call)
```json
{
  "received":  true,
  "event_id":  "evt_9bb0ded6988c4bce",
  "type":      "customer.created",
  "processed": true,
  "duplicate": true,
  "error":     null
}
```

### 7.5 Admin refund (`POST /billing/admin/refund`)
```json
{
  "refund":  {"id":"re_mock_…","object":"refund","invoice":"inv_…","amount":100,"status":"succeeded"},
  "invoice": { /* full invoice with refunded_cents incremented */ }
}
```

### 7.6 Usage summary (`GET /billing/usage/me`)
```json
{
  "period": "2026-06",
  "plan_id": "enterprise",
  "plan_name": "Enterprise",
  "limits": {"candidates":-1,"jobs":-1,"users":9999,"ai_calls_per_month":-1,"storage_gb":5000},
  "usage": {
    "ai_calls":         {"used":1390.0,"limit":-1,"unlimited":true,"pct":0,"overage":0},
    "active_candidates":{"used":17.0,  "limit":-1,"unlimited":true,"pct":0,"overage":0},
    "active_jobs":      {"used":4.0,   "limit":-1,"unlimited":true,"pct":0,"overage":0},
    "storage_gb":       {"used":28.2,  "limit":5000,"unlimited":false,"pct":0.6,"overage":0.0}
  },
  "overage_cents": 0
}
```

### 7.7 Portal session (`GET /billing/portal`)
```json
{
  "url":  "http://localhost:8000/api/v1/billing/mock-portal/bps_mock_5d10eab4ed0e47fc",
  "id":   "bps_mock_5d10eab4ed0e47fc",
  "mode": "mock"
}
```

---

## 8. Code Diff (Issue #1 — billing service fix)

**File:** `backend/apps/billing_service/main.py`

```diff
 def _require_admin(user: dict[str, Any]) -> None:
+    if not user.get("is_authenticated"):
+        raise HTTPException(
+            status_code=status.HTTP_401_UNAUTHORIZED,
+            detail="Authentication required for this endpoint.",
+            headers={"WWW-Authenticate": "Bearer"},
+        )
     role = (user.get("role") or "").lower()
     if role not in ("super_admin", "tenant_admin", "admin"):
         raise HTTPException(
             status_code=403,
             detail="Admin role required (super_admin, tenant_admin, or admin).",
         )
```

**Rationale:** the four admin endpoints (`/admin/subscriptions`, `/admin/refund`, `/admin/credit`, `/admin/cancel/{id}`) all call `_current_user` then `_require_admin`. When no `Authorization` header is present, `_current_user` returns a `role="guest"` envelope (kept for legacy anonymous compatibility on non-admin endpoints). Without the new guard, the role check raised 403 for **unauthenticated** callers, which conflates "you need to log in" with "you are not an admin". The fix is to raise 401 first, then 403, so the no-auth path matches the contract used by every other authenticated endpoint in the service.

---

## 9. Operational Notes

1. **Per-process in-memory store.** `_invoices_by_user`, `_subscriptions`, `_payment_methods_by_user` etc. live in module-level dicts in `store.py`. The current Dockerfile pins `WEB_CONCURRENCY=1` (commented "so the in-memory billing/customer state is consistent across requests"). A multi-worker rollout will require migrating this to a persistent store (Postgres/Redis).
2. **Re-run requires a fresh container.** Step 6 mutates the demo user's subscription through its full lifecycle (created → upgraded → paused → resumed → canceled). On a second run without a restart, the demo seed is a no-op (the canceled sub still exists), so Step 6 will observe `status=canceled`. The fix in §8 doesn't address this — the test harness is intentionally stateful. **Recommended practice:** always run on a freshly-restarted API container.
3. **Mock mode.** `STRIPE_MODE` resolves to `"mock"` in this environment. The mock returns realistic-shaped objects (`cs_mock_…`, `re_mock_…`, `bps_mock_…`, `seti_mock_…`, `in_cs_mock_…`) but no real Stripe call is made. To exercise live mode, set `STRIPE_MODE=live` and `STRIPE_SECRET_KEY=sk_…` in the gateway env and rerun.
4. **Webhooks require the `Stripe-Signature` header** in live mode (HMAC SHA-256 over the raw body using `STRIPE_WEBHOOK_SECRET`). In mock mode the prefix `mock_sig_…` (or any header starting with `t=`/`v1=`) is accepted; the harness always sends `mock_sig_test`.
5. **Idempotency is event-id-keyed** in `store._webhook_events`. The same `event.id` is processed exactly once; a repeat returns `duplicate: true` with the original `processed` flag.

---

## 10. Files Modified

| File | Change | Reason |
| --- | --- | --- |
| `backend/apps/billing_service/main.py` | Added 6-line `is_authenticated` guard to `_require_admin` | Issue #1: anonymous → 401 on admin endpoints |
| `scripts/test_payment_e2e.py` | Changed one `client.delete(..., json=...)` to `client.request("DELETE", ..., json=...)` | Issue #2: httpx 0.28.x compatibility |

No other files were modified. No new files were created. No documentation files other than this report.

---

## 11. Reproducibility Artifacts

| Artifact | Path | Description |
| --- | --- | --- |
| Test driver | `scripts/test_payment_e2e.py` | 753-line harness |
| Final run JSON | `logs/payment_e2e_3946d038.json` | All 64 results + captured payloads (~110 KB) |
| Canonicalized JSON | `logs/payment_e2e_final.json` | Copy of the above for stable reference |
| Console transcript | `logs/test_run_final.txt` | Human-readable PASS/FAIL output |

To regenerate:

```bash
docker compose -f docker-compose.yml build api
docker compose -f docker-compose.yml up -d api
$env:PYTHONIOENCODING = "utf-8"; chcp 65001 | Out-Null
python scripts/test_payment_e2e.py
```

**Expected outcome:** 64/64 PASS, elapsed ≈ 2–5 s.
