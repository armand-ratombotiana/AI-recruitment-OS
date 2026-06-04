# AI-ROS — Production Deployment Guide

This document covers everything required to take AI-ROS from a fresh
checkout to a production-grade, multi-tenant deployment.

> For day-2 operations (rollbacks, scaling, on-call), see
> [`RUNBOOKS.md`](RUNBOOKS.md). For backup/recovery see
> [`BACKUP_RECOVERY.md`](BACKUP_RECOVERY.md).

---

## 1. Architecture recap

```
                ┌──────────────────────────────────────┐
                │         Load Balancer / CDN         │
                └────────────────┬─────────────────────┘
                                 │
                  ┌──────────────┴──────────────┐
                  │                             │
           ┌──────▼──────┐              ┌──────▼──────┐
           │  Frontend   │              │  Backend    │
           │  (Next.js)  │              │  (FastAPI)  │
           └─────────────┘              └──────┬──────┘
                                              │
                          ┌───────────────────┼────────────────────┐
                          │                   │                    │
                  ┌───────▼──────┐    ┌───────▼──────┐    ┌────────▼─────┐
                  │  PostgreSQL  │    │    Redis     │    │  Celery      │
                  │  + pgvector  │    │  (cache/bus) │    │  workers     │
                  └──────────────┘    └──────────────┘    └──────────────┘
```

| Tier | Stateless? | Notes |
|------|-----------|-------|
| Frontend (Next.js) | yes | Behind CDN, scales horizontally |
| Backend (FastAPI) | yes for HTTP, sticky for in-process caches | `WEB_CONCURRENCY=1` if you depend on in-memory state; raise it once a real DB-backed billing store lands |
| PostgreSQL | no | Single primary + read replicas |
| Redis | no (with persistence) | Used for rate-limit, sessions, and Celery |
| Celery workers | yes | Scale by replicas, not by worker per pod |

---

## 2. Prerequisites

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4 vCPU | 8+ vCPU |
| RAM | 8 GB | 16+ GB |
| Disk | 50 GB SSD | 200 GB+ NVMe |
| Docker | 24.0+ | 26+ |
| Kubernetes (prod) | 1.27 | 1.30 |
| PostgreSQL | 15 | 16 with `pgvector` |
| Redis | 7 | 7-alpine |
| Node.js | 20 LTS | 22 LTS |
| Python | 3.12 | 3.12 |

External services you must provision before going live:

- **Stripe** account (live mode) with API keys and a webhook secret
- **SMTP** provider (SES, Postmark, SendGrid, Mailgun, …)
- **S3-compatible** object store for resume files and exports
- **OpenAI / Anthropic** API keys for the AI agents
- A **TLS certificate** (Let's Encrypt, AWS ACM, or Cloudflare)

---

## 3. Environment variables

All configuration is read from environment variables. The complete list,
with defaults from `backend/shared/core/config.py`, is shown below.
**Bold** entries must be set explicitly in production.

### 3.1 Application

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_NAME` | `AI-ROS` | Display name |
| `APP_VERSION` | `1.0.0` | Set by CI from git tag |
| `ENVIRONMENT` | `development` | `development` / `staging` / `production` |
| `DEBUG` | `true` | **Must be `false` in prod** |
| `API_V1_PREFIX` | `/api/v1` | URL prefix for the API |
| `WEB_CONCURRENCY` | `1` | uvicorn workers per pod |

### 3.2 Security

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | dev value | **Min 32-byte random string** (used to sign JWTs) |
| `ENCRYPTION_KEY` | dev value | **Min 32-byte random string** (Fernet symmetric encryption) |
| `JWT_ALGORITHM` | `HS256` | Keep `HS256` unless you migrate to RS256 |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Shorten to `5` for sensitive tenants |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | `7` | |

### 3.3 Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://…` | **Use a connection pooler URL (PgBouncer) in prod** |
| `DATABASE_POOL_SIZE` | `20` | Tune to `WEB_CONCURRENCY * 4` |
| `DATABASE_MAX_OVERFLOW` | `10` | |

### 3.4 Redis / Celery

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://…/0` | Cache & rate limiter |
| `CELERY_BROKER_URL` | `redis://…/1` | Task broker |
| `CELERY_RESULT_BACKEND` | `redis://…/2` | Task results |

### 3.5 AI providers

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | `sk-placeholder` | **Real key in prod** |
| `OPENAI_MODEL_PRIMARY` | `gpt-4o` | Slow / accurate tasks |
| `OPENAI_MODEL_FAST` | `gpt-4o-mini` | Cheap / fast tasks |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-large` | Vector search |
| `ANTHROPIC_API_KEY` | _empty_ | Optional fallback |
| `ANTHROPIC_MODEL_PRIMARY` | `claude-sonnet-4-…` | |

### 3.6 Object storage (S3-compatible)

| Variable | Default | Description |
|----------|---------|-------------|
| `S3_ENDPOINT` | _empty_ | Leave blank for AWS; set for MinIO/Wasabi |
| `S3_BUCKET` | `airos-storage` | |
| `S3_ACCESS_KEY` | _empty_ | |
| `S3_SECRET_KEY` | _empty_ | |

### 3.7 Mailing / SMTP

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | _empty_ | **Required in prod** |
| `SMTP_PORT` | `587` | 587 (TLS) or 465 (SSL) |
| `SMTP_USERNAME` | _empty_ | |
| `SMTP_PASSWORD` | _empty_ | |
| `SMTP_FROM_EMAIL` | `noreply@airos.io` | **Set to your verified sender** |
| `SMTP_FROM_NAME` | `AI-ROS` | |
| `SMTP_USE_TLS` | `true` | |
| `SMTP_USE_SSL` | `false` | |
| `MAIL_MOCK_MODE` | `true` | **Must be `false` in prod** |

### 3.8 Billing (Stripe)

| Variable | Default | Description |
|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | _empty_ | **Required for live mode** |
| `STRIPE_PUBLISHABLE_KEY` | _empty_ | Surfaced to the frontend |
| `STRIPE_WEBHOOK_SECRET` | _empty_ | Used to verify the `Stripe-Signature` header |
| `STRIPE_MODE` | `mock` | **`live` in prod** |
| `BILLING_CURRENCY` | `usd` | `eur`, `gbp`, … |
| `TRIAL_DAYS` | `14` | |
| `ANNUAL_DISCOUNT_PCT` | `17` | |
| `TAX_RATE_PCT` | `0.0` | Set per jurisdiction |

### 3.9 Auth hardening

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_MAX_FAILED_ATTEMPTS` | `5` | Lockout threshold |
| `AUTH_LOCKOUT_BASE_SECONDS` | `30` | Exponential backoff base |
| `AUTH_LOCKOUT_MAX_SECONDS` | `3600` | Cap |
| `AUTH_LOGIN_RATE_LIMIT_PER_MIN` | `10` | Per IP+email |
| `AUTH_REGISTER_RATE_LIMIT_PER_MIN` | `5` | |
| `AUTH_FORGOT_PASSWORD_RATE_LIMIT_PER_MIN` | `3` | |
| `EMAIL_VERIFY_TOKEN_HOURS` | `24` | |
| `PASSWORD_RESET_TOKEN_HOURS` | `2` | |

### 3.10 Observability

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_ENABLED` | `false` | Set to `true` to ship spans to Jaeger |
| `OTEL_SERVICE_NAME` | `ai-ros` | |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | |
| `AIROS_MONITORING_SAMPLES` | `5000` | In-memory ring buffer for `/api/v1/monitoring/samples` |

---

## 4. Database setup

### 4.1 Local

```bash
# Start the bundled PostgreSQL container
docker compose up -d postgres

# Run migrations
cd backend
pip install -r requirements.txt
alembic upgrade head

# Optional: seed demo data
python -m scripts.seed_demo
```

### 4.2 Production (RDS / Cloud SQL / managed Postgres)

1. Provision PostgreSQL 15+ with the `pgvector` extension available
   (most managed providers support it as a one-click add-on).
2. Create a dedicated `airos` user with a strong password and a database
   called `airos`.
3. Allow connections from your app subnets only (security group / VPC).
4. Run migrations as a one-off Job before the first deployment:
   ```yaml
   apiVersion: batch/v1
   kind: Job
   metadata: { name: airos-migrate }
   spec:
     template:
       spec:
         containers:
           - name: migrate
             image: ghcr.io/your-org/airos-api:1.0.0
             command: ["alembic", "upgrade", "head"]
             envFrom: [ secretRef: { name: airos-env } ]
         restartPolicy: Never
   ```
5. Enable automated daily backups and PITR.
6. Schedule `VACUUM ANALYZE` for heavy tables (see `BACKUP_RECOVERY.md`).

### 4.3 Connection pooling

For more than ~50 concurrent requests, place **PgBouncer** in front of
PostgreSQL in transaction-pooling mode and point `DATABASE_URL` at it:

```
postgresql+asyncpg://airos:<pw>@pgbouncer:6432/airos
```

---

## 5. Redis setup

Redis is used for:

- Rate-limit counters (per-IP, per-email)
- Session & refresh-token bookkeeping (read-through)
- Celery broker & result backend
- AI semantic cache (best-effort)

Recommended configuration:

```conf
# /etc/redis/redis.conf (managed)
maxmemory 1gb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
```

For managed Redis (ElastiCache, Memorystore, Upstash) prefer the
**cluster mode** only if you need >25 GB; otherwise a single primary +
read replica is simpler.

---

## 6. Stripe configuration

1. Switch the account to **live mode** and copy the `sk_live_…` secret
   key to `STRIPE_SECRET_KEY`.
2. Create a webhook endpoint in the Stripe dashboard pointing at
   `https://api.your-domain.com/api/v1/billing/webhooks/stripe`. Subscribe
   to **all** `invoice.*`, `customer.subscription.*`, `payment_intent.*`
   events. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
3. Create one **Product** per plan (`pro-monthly`, `pro-annual`,
   `enterprise-monthly`, `enterprise-annual`) with two **Prices** each
   (monthly + annual). The price IDs are referenced from
   `apps/billing_service/plans.py`.
4. Set `TAX_RATE_PCT` to your jurisdiction's default (e.g. `20` for FR).
5. Verify the webhook is reachable from Stripe (a green check in the
   dashboard) before cutting traffic over.

---

## 7. Email / SMTP setup

AI-ROS uses the standard SMTP protocol — any provider works.

| Provider | Host | Port | Notes |
|----------|------|------|-------|
| Amazon SES | `email-smtp.<region>.amazonaws.com` | 587 | Use SMTP credentials, not API keys |
| Postmark | `smtp.postmarkapp.com` | 587 | Best deliverability for transactional |
| SendGrid | `smtp.sendgrid.net` | 587 | |
| Mailgun | `smtp.mailgun.org` | 587 | |

For each, set `SMTP_USERNAME` and `SMTP_PASSWORD` and **verify the
sender domain** (SPF, DKIM, DMARC). The demo account never sends real
emails because `MAIL_MOCK_MODE=true` short-circuits the SMTP client.

---

## 8. Webhook configuration

The `webhooks_service` ships outgoing webhooks (we call *you*) and
incoming webhooks (Stripe calls *us*).

### 8.1 Outgoing

1. As a tenant admin, create a webhook at
   `POST /api/v1/webhooks/` with the target URL, the list of event
   types, and a strong secret.
2. The server signs each delivery with `X-AIROS-Signature: sha256=…`
   using the secret as the HMAC key. Verify the signature on your end
   before processing.
3. Delivery is retried on non-2xx responses with the schedule
   `1m → 5m → 30m → 2h → 12h` (max 5 attempts). Inspect
   `GET /api/v1/webhooks/{id}/deliveries` to see the history.

### 8.2 Incoming (Stripe)

Stripe posts to `/api/v1/billing/webhooks/stripe`. The handler validates
the `Stripe-Signature` header against `STRIPE_WEBHOOK_SECRET` and
deduplicates events via the event ID. **No raw body is logged**.

---

## 9. SSL / TLS

| Layer | Recommendation |
|-------|----------------|
| Edge (CloudFront / Cloudflare) | Terminate TLS, use HTTP/2 + ALPN h2 |
| Backend | Listen on HTTP only; let the edge handle TLS |
| Database / Redis | TLS-only connections, CA bundle in `DATABASE_URL` / `REDIS_URL` |
| Webhooks | Force HTTPS in Stripe / partner configs |

For self-hosted environments (no edge proxy), use **Caddy** or
**Traefik** with automatic Let's Encrypt renewal:

```caddyfile
api.your-domain.com {
  reverse_proxy airos-api:8000
  encode zstd gzip
  header Strict-Transport-Security "max-age=63072000"
}
```

---

## 10. Scaling recommendations

| Bottleneck | Knob |
|------------|------|
| API latency (CPU) | Increase `WEB_CONCURRENCY` to `2-4`; add API pods |
| Slow LLM calls | Move the orchestrator to its own worker pool with `max_tasks_per_child=100` |
| DB CPU | Add read replicas; route `/api/v1/candidates/` to the replica via SQLAlchemy |
| Redis memory | Cluster mode (≥3 shards) or upgrade to a larger node |
| WebSocket connections | Run a dedicated `ws` deployment with sticky sessions |

Vertical scale first, then horizontal. The current backend is
**stateless at the HTTP layer** (sessions are in PostgreSQL, refresh
tokens are too); you can run `kubectl scale --replicas=10` and trust the
load balancer.

---

## 11. Helm / Kubernetes

A starter chart lives at `helm/airos/`. To install:

```bash
helm upgrade --install airos helm/airos/ \
  --namespace production --create-namespace \
  --set image.tag="$(git rev-parse --short HEAD)" \
  --set imageFrontend.tag="$(git rev-parse --short HEAD)" \
  --values helm/airos/values.production.yaml
```

Tunables in `values.production.yaml`:

```yaml
api:
  replicas: 3
  resources:
    requests: { cpu: "500m", memory: "1Gi" }
    limits:   { cpu: "2",    memory: "2Gi" }
  envFrom:
    - secretRef: { name: airos-secrets }
celery:
  replicas: 2
  resources:
    requests: { cpu: "250m", memory: "512Mi" }
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: api.your-domain.com
      paths: [ / ]
  tls:
    - secretName: airos-tls
      hosts: [ api.your-domain.com ]
```

---

## 12. CI/CD

The pipeline is in `.github/workflows/ci-cd.yml` and runs:

1. **Lint** — `ruff check backend/`
2. **Test** — `pytest tests/ -q`
3. **Build** — `docker build -f backend/Dockerfile -t ghcr.io/org/airos-api:${{ github.sha }} .`
4. **Push** — `docker push ghcr.io/org/airos-api:${{ github.sha }}`
5. **Deploy (staging)** — `helm upgrade … --reuse-values --set image.tag=${{ github.sha }}` on `develop`
6. **Deploy (production)** — same on `main`, with a manual approval gate

Required secrets:

- `GITHUB_TOKEN` (provided by Actions)
- `KUBECONFIG_STAGING` / `KUBECONFIG_PRODUCTION` (base64)
- `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `SMTP_PASSWORD`, …

---

## 13. Post-deploy smoke tests

Run from your laptop or CI:

```bash
# 1. Health
curl -fsS https://api.your-domain.com/health | jq

# 2. OpenAPI spec is published
curl -fsS https://api.your-domain.com/openapi.json | jq '.info.version'

# 3. Public billing plans
curl -fsS https://api.your-domain.com/api/v1/billing/plans | jq '.total'

# 4. Monitoring snapshot
curl -fsS https://api.your-domain.com/api/v1/monitoring/health-summary | jq

# 5. Prometheus exposition
curl -fsS https://api.your-domain.com/metrics | grep airos_requests_total
```

A green smoke test means the deploy is good to point DNS at.
