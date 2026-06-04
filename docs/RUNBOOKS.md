# AI-ROS — Operational Runbooks

A runbook is a step-by-step procedure for handling a specific
operational scenario. The aim is that **any on-call engineer can resolve
an incident at 3 a.m.** without having to dig through code or guess at
the right commands.

> For diagnosis help see [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md).
> For restore procedures see [`BACKUP_RECOVERY.md`](BACKUP_RECOVERY.md).

---

## Table of contents

1. [On-call basics](#1-on-call-basics)
2. [Deploying a new release](#2-deploying-a-new-release)
3. [Rolling back a release](#3-rolling-back-a-release)
4. [Scaling the platform](#4-scaling-the-platform)
5. [Common alerts](#5-common-alerts)
6. [High-error-rate incident](#6-high-error-rate-incident)
7. [High-latency incident](#7-high-latency-incident)
8. [Database is down](#8-database-is-down)
9. [Redis is down](#9-redis-is-down)
10. [AI orchestrator timing out](#10-ai-orchestrator-timing-out)
11. [Billing webhook failure](#11-billing-webhook-failure)
12. [Suspected breach / token leak](#12-suspected-breach--token-leak)
13. [Communication templates](#13-communication-templates)

---

## 1. On-call basics

### 1.1 Rotation

- **Primary on-call** — first responder, all pages go here.
- **Secondary on-call** — escalates if primary doesn't ack within
  5 minutes.
- **Manager** — escalates if secondary doesn't ack within 10 minutes.

Rotation is in PagerDuty (schedule `airos-primary`). Each rotation is
**one week**, Monday 10:00 → Monday 10:00 local time.

### 1.2 Channels

| Channel | Purpose |
|---------|---------|
| Slack `#ops-incidents` | Real-time coordination |
| Slack `#ops-backups` | Backup verification & restore status |
| Zoom `airos-bridge` | Incident calls (always-on) |
| Status page | Customer-facing updates |

### 1.3 Severity levels

| Sev | Definition | Response time | Example |
|-----|-----------|---------------|---------|
| **SEV-1** | Production down for all users | Acknowledge ≤ 5 min | DB primary unreachable |
| **SEV-2** | Major feature impaired | Acknowledge ≤ 15 min | Login returns 500 for all users |
| **SEV-3** | Minor feature impaired | Acknowledge ≤ 1 h | One specific endpoint 5xx |
| **SEV-4** | Cosmetic / informational | Next business day | Dashboard widget wrong colour |

### 1.4 First 5 minutes checklist

1. **Acknowledge** the page in PagerDuty.
2. **Open `#ops-incidents`** and post "*<sev> - investigating*".
3. **Check `/health`**:
   ```bash
   curl -fsS https://api.your-domain.com/health | jq
   ```
4. **Check the active deploys** in the GitHub Actions tab.
5. **Check Prometheus** — `https://prometheus.your-domain.com/alerts`.

---

## 2. Deploying a new release

### 2.1 Standard release (Helm + GitHub Actions)

1. Merge the PR into `main`. CI runs lint + tests + builds the image.
2. CI tags the image as `ghcr.io/org/airos-api:<commit-sha>`.
3. The **staging** environment is auto-deployed.
4. Smoke tests run against staging. On green, the workflow **pauses for
   manual approval**.
5. An on-call engineer approves → production is deployed.
6. The on-call watches the `error_rate`, `p95_latency`, and
   `5xx_count_by_service` dashboards for 30 minutes.

### 2.2 Hotfix (out-of-band)

For a SEV-1 fix you can deploy directly to production:

```bash
git checkout main
git pull
git checkout -b hotfix/<short-description>
# … fix + tests
git commit -m "hotfix: <description>"
git push -u origin HEAD
gh pr create --base main --title "hotfix: …" --body "SEV-1 fix"
```

Once the PR is merged, force the production workflow:
```bash
gh workflow run ci-cd.yml --ref main -f environment=production
```

---

## 3. Rolling back a release

### 3.1 Helm rollback (preferred)

```bash
helm history airos -n production | head
helm rollback airos <REVISION> -n production
```

Then verify:
```bash
kubectl rollout status deploy/airos-api -n production
curl -fsS https://api.your-domain.com/health | jq
```

### 3.2 Database migration rollback

Migrations are forward-only by policy. If a migration must be reverted:

1. Write a new migration that reverses the change.
2. Test it against a fresh database and a copy of production.
3. Deploy the new migration as a normal release.

> If the migration is **destructive** (e.g. dropped a column) and
> there's a SEV-1, the correct path is to restore from backup — see
> [`BACKUP_RECOVERY.md`](BACKUP_RECOVERY.md#71-from-a-pgdump-backup).

### 3.3 Feature flag rollback

For application code that is feature-flagged:

```bash
# Disable a feature globally
curl -fsS -X POST https://api.your-domain.com/api/v1/feature-flags/disable \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"flag": "new_matching_algo"}'
```

The flag store is Redis — propagation is sub-second.

---

## 4. Scaling the platform

### 4.1 Scale the API

```bash
kubectl scale deploy/airos-api --replicas=10 -n production
# or, with HPA:
kubectl autoscale deploy/airos-api --min=3 --max=20 --cpu-percent=70
```

The API is stateless — no special considerations.

### 4.2 Scale Celery workers

```bash
kubectl scale deploy/airos-celery --replicas=10 -n production
```

Each worker has `--concurrency=2`; raising replicas scales linearly.

### 4.3 Scale Postgres

Vertical first, then horizontal:

- **Vertical** — change the instance type (RDS / Cloud SQL) and reboot.
- **Horizontal** — add a read replica. Update `DATABASE_URL` to point
  the replica at the read pool.

### 4.4 Scale Redis

- **Vertical** — change the node size.
- **Cluster** — enable cluster mode and migrate (downtime required).

### 4.5 Database is hot

```sql
-- Find the long-running queries
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '1 second'
ORDER BY duration DESC;
```

Cancel the culprit:
```sql
SELECT pg_cancel_backend(<pid>);
-- if it doesn't comply:
SELECT pg_terminate_backend(<pid>);
```

---

## 5. Common alerts

| Alert | Meaning | First action |
|-------|---------|--------------|
| `APIDown` | `/health` returns 5xx for 1 minute | Runbook § 6 |
| `HighErrorRate5xx` | > 1 % 5xx for 5 minutes | Runbook § 6 |
| `HighLatencyP95` | p95 > 2 s for 5 minutes | Runbook § 7 |
| `PostgresDown` | `SELECT 1` fails | Runbook § 8 |
| `RedisDown` | `PING` fails | Runbook § 9 |
| `AIOrchestratorSlow` | p95 > 30 s | Runbook § 10 |
| `BillingWebhookFailing` | Stripe webhook 4xx for 10 minutes | Runbook § 11 |
| `DiskSpaceLow` | < 10 % free on any node | `kubectl exec … df -h` |
| `CertExpiringSoon` | TLS cert < 14 days | Re-run `cert-manager` renew |

---

## 6. High-error-rate incident

**Trigger:** `5xx_rate{service="api"} > 0.01` for 5 min.

1. **Check the latest deploy** in `#deploys` Slack channel.
2. **Roll back** if the alert started within 30 min of a deploy
   (Runbook § 3.1).
3. **Check the error breakdown**:
   ```bash
   curl -s "http://localhost:9090/api/v1/query?query=sum%20by%20(status)%20(rate(airos_errors_total[5m]))" | jq
   ```
4. **Inspect a sample**:
   ```bash
   curl -s "http://localhost:8000/api/v1/monitoring/samples?limit=20" | jq '.samples[] | select(.status | startswith("5"))'
   ```
5. **Look at the slow-query log** if it's a DB error:
   ```sql
   SELECT * FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```
6. **Mitigate** by either rolling back, scaling out, or applying a
   rate-limit / circuit breaker.

---

## 7. High-latency incident

**Trigger:** `airos_request_duration_seconds:p95 > 2` for 5 min.

1. **Identify the hot endpoint**:
   ```bash
   curl -s "http://localhost:9090/api/v1/query?query=topk(5,%20histogram_quantile(0.95,%20sum%20by%20(le,%20endpoint)%20(rate(airos_request_duration_seconds_bucket[5m]))))" | jq
   ```
2. **Common causes**:
   - Cache miss storm (Redis eviction, backend warm-up)
   - LLM provider slowdown
   - DB connection pool exhaustion
3. **Actions** by cause:
   - **Cache miss** — warm the cache: `curl /api/v1/candidates/?page_size=100` from a script.
   - **LLM slowdown** — switch the orchestrator to the `fast` model.
   - **Pool exhaustion** — scale the API pods.

---

## 8. Database is down

**Trigger:** `PostgresDown` alert.

1. **Check the DB instance**:
   ```bash
   # AWS
   aws rds describe-db-instances --db-instance-identifier airos-prod
   # GCP
   gcloud sql instances describe airos-prod
   ```
2. **Try a connection**:
   ```bash
   psql "$DATABASE_URL" -c "SELECT 1"
   ```
3. **If the instance is healthy but unreachable** — check the security
   group / firewall.
4. **If the instance is unhealthy** — reboot (`aws rds reboot-db-instance`).
5. **If reboot doesn't help** — fail over to the replica:
   ```bash
   aws rds failover-db-cluster --db-cluster-identifier airos-prod
   ```
6. **Postgres is back** — verify with the smoke tests in
   `BACKUP_RECOVERY.md § 9`.

---

## 9. Redis is down

**Trigger:** `RedisDown` alert.

1. **Check the Redis instance**:
   ```bash
   redis-cli -u "$REDIS_URL" ping
   ```
2. **AI-ROS will still serve traffic** — it falls back to in-process
   rate limiting. Login, sessions, and Celery will be impaired.
3. **Restart Redis** if needed (`aws elasticache reboot-cache-cluster`).
4. **Clear stuck rate-limit keys** after Redis comes back:
   ```bash
   redis-cli -u "$REDIS_URL" --scan --pattern 'airos:ratelimit:*' | xargs redis-cli -u "$REDIS_URL" DEL
   ```

---

## 10. AI orchestrator timing out

**Trigger:** `AIOrchestratorSlow` alert or repeated 504s on
`/api/v1/ai/orchestrate`.

1. **Check the LLM provider status**:
   - <https://status.openai.com>
   - <https://status.anthropic.com>
2. **Check our spend** — a runaway prompt loop can blow the budget.
3. **Reduce concurrency** as a temporary measure:
   ```bash
   kubectl scale deploy/airos-api --replicas=2 -n production
   ```
4. **Switch the model** by setting `OPENAI_MODEL_PRIMARY=gpt-4o-mini`
   in the secret and restarting the API.
5. **Inspect the slow orchestrations**:
   ```bash
   curl -s "http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,%20sum%20by%20(le,%20agent_type)%20(rate(airos_ai_orchestration_duration_seconds_bucket[5m])))" | jq
   ```

---

## 11. Billing webhook failure

**Trigger:** `BillingWebhookFailing` alert.

1. **Check the Stripe dashboard** for the latest webhook delivery
   attempts. The HTTP status code and response body are right there.
2. **Check the API logs** for the request id Stripe sent:
   ```bash
   kubectl logs deploy/airos-api -n production | grep -i stripe | tail -50
   ```
3. **If the secret is wrong** (most common cause):
   - Re-copy the signing secret from the Stripe dashboard.
   - Update the `STRIPE_WEBHOOK_SECRET` value in the secret manager.
   - Roll the API.
4. **If Stripe sent a malformed payload** — fix the parser and roll.

---

## 12. Suspected breach / token leak

**Trigger:** Anomalous 401 pattern, secret in a public repo, or
PagerDuty from the security team.

1. **Rotate `SECRET_KEY` immediately**:
   ```bash
   # Update the secret
   kubectl create secret generic airos-secrets \
     --from-literal=SECRET_KEY=$(openssl rand -base64 48) \
     --namespace production --dry-run=client -o yaml | kubectl apply -f -
   kubectl rollout restart deploy/airos-api -n production
   ```
   All existing JWTs are now invalid. Users get logged out, which is the
   desired behaviour.
2. **Revoke all API keys**:
   ```bash
   psql "$DATABASE_URL" -c "UPDATE api_keys SET revoked_at = now() WHERE revoked_at IS NULL;"
   ```
3. **Force a password reset for affected users** — see
   `auth_service` for the per-user force-reset endpoint.
4. **Open a post-mortem** within 48 h.

---

## 13. Communication templates

### 13.1 Status page — investigating

> We're investigating reports of [issue]. The AI-ROS API is
> [impact]. Our team is engaged and we will post an update within
> [time].

### 13.2 Status page — identified

> We've identified the cause of the [issue] — [short technical
> description]. A fix is being deployed. We expect normal operation
> by [time].

### 13.3 Status page — resolved

> The [issue] has been resolved. [Impact] is back to normal. A full
> post-mortem will be published within 5 business days at
> <https://status.your-domain.com/incidents/<id>>.

### 13.4 Internal — incident channel kickoff

> SEV-<n> - <one-line description>
> Started: <HH:MM UTC>
> Impact: <who is affected and how>
> Current state: <investigating / identified / mitigating / resolved>
> Incident commander: @<name>
> Comms: @<name>
> Next update in: 15 min

---

## Appendix A — Useful one-liners

```bash
# All API pods, sorted by restart count
kubectl get pods -n production -l app=airos-api \
  -o json | jq -r '.items[] | "\(.metadata.name) restarts=\(.status.containerStatuses[0].restartCount)"' | sort -t= -k2 -nr

# Tail logs from every API pod
kubectl logs -n production -l app=airos-api --tail=100 -f

# Top 5 endpoints by request volume
curl -s "http://localhost:9090/api/v1/query?query=topk(5,%20sum%20by%20(endpoint)%20(rate(airos_requests_total[5m])))" | jq

# Current error rate
curl -s "http://localhost:9090/api/v1/query?query=sum(rate(airos_errors_total[5m]))%20/%20sum(rate(airos_requests_total[5m]))" | jq

# Active users (in-process)
curl -s http://localhost:8000/api/v1/monitoring/active-users | jq
```

---

## Appendix B — Escalation paths

| Sev | Primary | Secondary | Manager | VP-Eng |
|------|---------|-----------|---------|--------|
| SEV-1 | On-call (PagerDuty) | Secondary on-call | Eng manager | VP-Eng |
| SEV-2 | On-call | Secondary on-call | Eng manager | — |
| SEV-3 | On-call | — | — | — |
| SEV-4 | Open a ticket | — | — | — |
