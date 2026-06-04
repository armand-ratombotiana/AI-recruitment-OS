# AI-ROS — Troubleshooting Guide

A field guide for diagnosing and fixing the most common issues that
arise while running AI-ROS. Each section is **symptom → diagnosis → fix**.

> For step-by-step operational procedures see
> [`RUNBOOKS.md`](RUNBOOKS.md). For backup/restore see
> [`BACKUP_RECOVERY.md`](BACKUP_RECOVERY.md).

---

## Table of contents

1. [Backend won't start](#1-backend-wont-start)
2. [Database issues](#2-database-issues)
3. [Redis issues](#3-redis-issues)
4. [Authentication problems](#4-authentication-problems)
5. [AI / LLM problems](#5-ai--llm-problems)
6. [Billing / Stripe problems](#6-billing--stripe-problems)
7. [Performance problems](#7-performance-problems)
8. [WebSocket problems](#8-websocket-problems)
9. [Frontend problems](#9-frontend-problems)
10. [Docker / container problems](#10-docker--container-problems)
11. [Monitoring / observability problems](#11-monitoring--observability-problems)
12. [Production debugging recipes](#12-production-debugging-recipes)

---

## 1. Backend won't start

### 1.1 `ImportError: No module named 'shared'`

**Cause:** `PYTHONPATH` is not set to the `backend/` directory.

**Fix:**
```bash
cd backend
export PYTHONPATH=$PWD
python run.py
```

Inside Docker this is already handled by `ENV PYTHONPATH=/app` in the
`backend/Dockerfile`.

### 1.2 `ModuleNotFoundError: No module named 'fastapi'`

**Cause:** Dependencies not installed (or wrong virtualenv active).

**Fix:**
```bash
cd backend
pip install -r requirements.txt
# or
make install
```

### 1.3 `Address already in use` on port 8000

**Cause:** Another process (often a previous uvicorn) is still bound.

**Fix (Windows):**
```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**Fix (macOS / Linux):**
```bash
lsof -ti:8000 | xargs kill -9
```

### 1.4 Backend starts but `/health` returns 503

**Cause:** One of the integrated services is unhealthy (usually Postgres
or Redis).

**Fix:**
```bash
curl http://localhost:8000/health | jq
# Look at `checks` to see which one failed.
```

Then jump to section 2 or 3.

---

## 2. Database issues

### 2.1 `asyncpg.exceptions.ConnectionDoesNotExistError`

**Cause:** Postgres isn't running, or `DATABASE_URL` is wrong.

**Fix:**
```bash
docker compose ps postgres
docker exec airos-postgres pg_isready -U airos
docker exec airos-postgres psql -U airos -d airos -c "SELECT 1"
```

If the URL is wrong, fix `.env` and `docker compose restart api`.

### 2.2 `alembic.util.exc.CommandError: Target database is not up to date`

**Cause:** New migration added but not applied.

**Fix:**
```bash
cd backend
alembic upgrade head
```

### 2.3 `sqlalchemy.exc.ProgrammingError: permission denied for table …`

**Cause:** The `airos` role does not own the table (typical after a
manual `psql` restore or a `pg_dump | psql` into a new database).

**Fix:**
```sql
-- Connect as the superuser, then:
ALTER TABLE candidates OWNER TO airos;
ALTER TABLE jobs       OWNER TO airos;
-- repeat for every table; or, generically:
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO airos', r.tablename);
  END LOOP;
END $$;
```

### 2.4 `pgvector: extension not found`

**Cause:** The `pgvector` extension wasn't installed in the database.

**Fix:**
```sql
-- Connect as superuser
CREATE EXTENSION IF NOT EXISTS vector;
```

The `pgvector/pgvector:pg16` image already has the extension binary;
you just need to enable it in each database.

### 2.5 Slow queries / high CPU on Postgres

**Diagnosis:**
```sql
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '1 second'
ORDER BY duration DESC;
```

**Fixes:**
- Add the missing index (`EXPLAIN ANALYZE` first)
- Tune `shared_buffers`, `work_mem`, `effective_cache_size`
- Route read traffic to a read replica

---

## 3. Redis issues

### 3.1 `redis.exceptions.ConnectionError`

**Fix:**
```bash
docker compose ps redis
docker exec airos-redis redis-cli ping
# PONG
```

If the container is up but `redis-cli ping` fails, the password may be
wrong — set `REDIS_URL=redis://:password@host:6379/0`.

### 3.2 Redis keeps running out of memory

**Cause:** Cached embeddings / rate-limit counters grow without bound.

**Fix:** Tune eviction:
```conf
maxmemory 2gb
maxmemory-policy allkeys-lru
```

Or split the cache across dedicated Redis nodes for cache and broker.

### 3.3 Rate limiter stuck after a deploy

**Cause:** A bad deploy left counters in a wrong format.

**Fix:** `redis-cli -h <host> KEYS 'airos:ratelimit:*' | xargs redis-cli DEL`

---

## 4. Authentication problems

### 4.1 Login returns 401 for a known-good user

**Diagnosis:** Check the password against the complexity policy in
`backend/shared/core/security.py` and `backend/apps/auth_service/main.py`.
The complexity check is enforced on **register** but the **login**
endpoint accepts any password attempt and simply fails the bcrypt
comparison.

**Fixes:**
- Reset the password via `/auth/forgot-password` + `/auth/reset-password`.
- If MFA is enabled, ensure the client completes the `202 → /auth/mfa/verify`
  step in the same request lifecycle.

### 4.2 Token rejected with 401 immediately after issue

**Cause:** Clock skew. JWTs are strict on the `exp` claim.

**Fix:** Sync clocks:
```bash
# On the host
sudo ntpdate -s time.nist.gov   # or
sudo chronyc tracking
```

### 4.3 Account locked out

**Cause:** `AUTH_MAX_FAILED_ATTEMPTS` (default 5) hit.

**Fix:** Wait — the lockout uses exponential backoff
(`AUTH_LOCKOUT_BASE_SECONDS * 2^attempts`, capped at `AUTH_LOCKOUT_MAX_SECONDS`).
Or, as a tenant admin, force a password reset.

### 4.4 Verification / reset emails never arrive

**Cause:** `MAIL_MOCK_MODE=true` (the dev default). The tokens are
returned in the response body and in the logs.

**Fix:** Set `MAIL_MOCK_MODE=false` and configure SMTP — see
[DEPLOYMENT.md § 7](DEPLOYMENT.md#7-email--smtp-setup).

### 4.5 429 Too Many Requests on `/auth/login`

**Cause:** Per-IP+email rate limit (default 10 / min).

**Fix:** Wait, or raise `AUTH_LOGIN_RATE_LIMIT_PER_MIN` in `.env` and
restart the API.

---

## 5. AI / LLM problems

### 5.1 `openai.AuthenticationError: 401`

**Cause:** `OPENAI_API_KEY` is the placeholder or has been revoked.

**Fix:**
```bash
echo $OPENAI_API_KEY
# Should start with sk-…
```

Regenerate at <https://platform.openai.com/api-keys> and update `.env`.

### 5.2 `openai.RateLimitError: 429`

**Cause:** Exceeded the per-minute tokens / requests quota.

**Fixes:**
- Use the `OPENAI_MODEL_FAST` (gpt-4o-mini) for non-critical tasks
- Cache identical prompts (Redis-based semantic cache is on by default)
- Reduce `WEB_CONCURRENCY` for the orchestrator pods
- Upgrade the OpenAI tier

### 5.3 Agent timeouts (CCT 30+ s)

**Cause:** Long prompt + slow model.

**Fixes:**
- Trim the prompt context (only pass the last N messages)
- Set a per-agent timeout in `apps/ai_orchestrator/main.py`
- Use the smaller model for time-sensitive flows

### 5.4 Embeddings dimension mismatch (pgvector error)

**Cause:** The DB has embeddings from an older model with a different
dimension. Mixing `text-embedding-3-large` (3072) with `text-embedding-3-small`
(1536) will fail with `expected 3072 dimensions, got 1536`.

**Fix:** Re-embed everything, or split into per-model tables.

---

## 6. Billing / Stripe problems

### 6.1 Webhook returns 400

**Cause:** `STRIPE_WEBHOOK_SECRET` mismatch (the dashboard's signing
secret is different from the one the code uses).

**Fix:** Re-copy the secret from
*Dashboard → Developers → Webhooks → <endpoint> → Signing secret*.
Restart the API.

### 6.2 Invoices not generated after a successful payment

**Cause:** Stripe never posted the `invoice.paid` event — usually a
misconfigured webhook subscription in the dashboard.

**Fix:** In *Dashboard → Developers → Webhooks → <endpoint>*, ensure
these events are selected:
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

### 6.3 Customer stuck in `past_due` after paying

**Cause:** The webhook is being deduplicated and never re-processed.

**Fix:** Resend the event from the Stripe dashboard (click *Resend* on
the failed event row). If it still fails, the handler returned a non-2xx
— check the API logs around the timestamp.

### 6.4 "Stripe is in test mode" warning in the UI

**Cause:** `STRIPE_MODE=mock` (or `STRIPE_SECRET_KEY=sk_test_…`).

**Fix:** Set `STRIPE_MODE=live` and use the `sk_live_…` key. Restart.

---

## 7. Performance problems

### 7.1 p95 latency > 1 s on `/api/v1/candidates/`

**Diagnosis:**
```bash
curl -w "%{time_total}\n" -o /dev/null -s \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/candidates/?page=1&page_size=20"
```

**Fixes:**
- Verify the `candidates` table is indexed on `tenant_id` and `created_at`
- Lower `page_size` to ≤ 50
- Add a read replica and route GET traffic there
- Enable Redis caching for the most popular filter combinations

### 7.2 Memory growth in API pods

**Cause:** In-process caches (rate limiter, billing store) are unbounded
in development. In production they should be backed by Redis.

**Fix:**
- `WEB_CONCURRENCY=1` (default) keeps memory predictable
- Add `--max-requests=1000 --max-requests-jitter=200` to uvicorn to recycle workers

### 7.3 CPU pinned to 100 % on a single pod

**Diagnosis:** Use `py-spy` or the `Prometheus` cAdvisor metrics to
identify the hot coroutine.

```bash
py-spy dump --pid <pid> | head -40
```

Common culprits: a synchronous LLM call inside an async route; an
unbounded `for x in cursor.execute(...)` loop.

---

## 8. WebSocket problems

### 8.1 `WebSocket disconnected immediately`

**Cause:** Wrong path or missing `Sec-WebSocket-*` headers from a
custom client.

**Fix:** Use the built-in `WebSocket` API of the browser. Verify with
`wscat -c ws://localhost:8000/api/v1/ws/ws/test` (if installed).

### 8.2 Real-time updates stop after a Redis restart

**Cause:** The pub/sub channel was reset; the orchestrator's
subscriptions were lost.

**Fix:** Restart the `api` service (`docker compose restart api`) so it
re-subscribes. Add a `redis-cli MONITOR` to a sidecar to confirm events
are flowing.

### 8.3 CORS error on `wss://`

**Cause:** The CORS middleware only allows same-origin by default for
WebSockets. Add the front-end origin to `allow_origins` in
`backend/main.py`.

---

## 9. Frontend problems

### 9.1 `ECONNREFUSED 127.0.0.1:8000` from the browser

**Cause:** The backend is not running, or `NEXT_PUBLIC_API_URL` points
to the wrong host.

**Fix:**
```bash
echo $NEXT_PUBLIC_API_URL
# Should be http://localhost:8000 in dev
docker compose ps api
```

### 9.2 Hydration error in production

**Cause:** `useEffect` missing dependency, or a Date / locale difference
between server and client.

**Fix:** Wrap any client-only state in `useEffect` and use `next/dynamic`
with `ssr: false` for browser-only widgets.

### 9.3 `next/image` blocked by remotePatterns

**Cause:** The domain isn't in `images.remotePatterns` in
`next.config.js`.

**Fix:** Add the host there. Don't use `unoptimized: true` as a
workaround — it bloats the bundle.

---

## 10. Docker / container problems

### 10.1 `port is already allocated`

**Cause:** A previous container is still bound to the host port.

**Fix:**
```bash
docker ps -a | grep -E "airos-(api|frontend|postgres|redis)"
docker rm -f <id>
```

### 10.2 Build cache poisoning

**Fix:**
```bash
docker builder prune -af
docker compose build --no-cache api
```

### 10.3 Container keeps restarting

**Diagnosis:**
```bash
docker logs --tail=200 airos-api
```

Look for the most recent traceback. Common causes: missing env var,
DB not reachable, OOM killed (`dmesg | grep -i killed`).

### 10.4 Out of disk

**Fix:**
```bash
docker system prune -af
docker volume prune -f
```

---

## 11. Monitoring / observability problems

### 11.1 Prometheus targets marked "down"

**Cause:** The network between Prometheus and the API is broken, or the
scrape path is wrong.

**Fix:**
```bash
# Inside the Prometheus container
wget -qO- http://api:8000/metrics | head
# If this fails, the API is unreachable from Prometheus.
# Check docker network: docker network inspect airos-net
```

### 11.2 `/api/v1/monitoring/metrics` returns stale data

**Cause:** You are looking at a different uvicorn worker (each worker
has its own in-process store).

**Fix:** Run with `WEB_CONCURRENCY=1` for the monitoring dashboards, or
back the store with Redis. The current default is
`WEB_CONCURRENCY=${WEB_CONCURRENCY:-1}`.

### 11.3 Grafana dashboard empty

**Fix:**
```bash
docker logs --tail=100 airos-grafana | grep -i error
# Usually a provisioning typo or a missing data source
```

---

## 12. Production debugging recipes

### 12.1 "Why is this request slow?"

1. Capture the `X-Request-ID` header from the response (it is set by
   `RequestIDMiddleware`).
2. `docker logs airos-api 2>&1 | grep "<request-id>"` to see every
   log line for that request.
3. `curl http://localhost:16686/api/traces/<trace-id>` to view the
   OpenTelemetry trace (when `OTEL_ENABLED=true`).

### 12.2 "Why is this user locked out?"

```sql
SELECT id, email, failed_login_count, locked_until
FROM users
WHERE email = lower('user@acme.com');
```

If `locked_until` is in the future, wait. As a tenant admin, force a
password reset to clear the counter.

### 12.3 "The API is returning 500s for a specific endpoint"

1. `curl -v …` to capture the response body.
2. Look for a `detail` field — the message usually points at the
   underlying error.
3. If it's a SQL error, run the failing query in `psql` with
   `EXPLAIN ANALYZE`.
4. If it's a Pydantic validation error, the body contains a structured
   list of `loc`, `msg`, and `type` per failing field.

### 12.4 "I need a heap dump from the running container"

```bash
docker exec airos-api python -c "
import tracemalloc, json, time
tracemalloc.start(25)
time.sleep(30)
snap = tracemalloc.take_snapshot()
for stat in snap.statistics('lineno')[:25]:
    print(stat)
" > heap.txt
```

Then attach `heap.txt` to the incident.

---

## 13. Getting help

1. **Check the runbook** — [`RUNBOOKS.md`](RUNBOOKS.md) has
   step-by-step procedures for the most common incidents.
2. **Look at recent changes** — `git log --oneline -20`.
3. **Reproduce locally** — `docker compose down && docker compose up -d`
   gives you a known-good state.
4. **Open a ticket** — attach the request id, the failing `curl`, and
   the relevant log lines.
5. **Check service health** —
   * https://status.openai.com (for OpenAI outages)
   * https://status.stripe.com (for Stripe outages)
