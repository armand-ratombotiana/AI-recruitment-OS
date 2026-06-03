# AI-ROS Monitor Report

- **Timestamp:** 2026-06-03T19:02:06.913383+00:00
- **Hostname:** kael
- **Overall status:** **WARN**
- **Summary:** Total=43 | PASS=38 | FAIL=0 | WARN=4 | SKIP=1

## Docker

| Status | Check | Latency | Details |
|--------|-------|---------|---------|
| ✅ PASS | `postgres tcp:5432` | 9.8 ms | port open |
| ✅ PASS | `redis tcp:6379` | 1.4 ms | port open |
| ✅ PASS | `api http://localhost:8000/health` | 803.6 ms | HTTP 200 |
| ✅ PASS | `celery-worker` | — | Up 23 minutes (healthy) |
| ✅ PASS | `frontend http://localhost:3000` | 769.6 ms | HTTP 200 |
| ✅ PASS | `prometheus http://localhost:9090/-/healthy` | 806.6 ms | HTTP 200 |
| ✅ PASS | `grafana http://localhost:3001/api/health` | 950.4 ms | HTTP 200 |
| ✅ PASS | `jaeger http://localhost:16686/` | 798.1 ms | HTTP 200 |
| ✅ PASS | `alertmanager http://localhost:9093/-/healthy` | 982.7 ms | HTTP 200 |

## Api_Health

| Status | Check | Latency | Details |
|--------|-------|---------|---------|
| ✅ PASS | `Backend /health` | 983.8 ms | HTTP 200 — status=healthy |
| ✅ PASS | `Auth /health` | 843.8 ms | HTTP 200 |
| ✅ PASS | `Candidates /health` | 706.8 ms | HTTP 200 |
| ✅ PASS | `Jobs /health` | 1044.1 ms | HTTP 200 |
| ✅ PASS | `Interviews /health` | 1037.6 ms | HTTP 200 |
| ✅ PASS | `PPE /health` | 911.6 ms | HTTP 200 |
| ✅ PASS | `AI /health` | 844.0 ms | HTTP 200 |
| ✅ PASS | `Analytics /health` | 734.2 ms | HTTP 200 |
| ✅ PASS | `Workflows /health` | 898.9 ms | HTTP 200 |
| ✅ PASS | `Notifications /health` | 655.6 ms | HTTP 200 |
| ✅ PASS | `Compliance /health` | 776.2 ms | HTTP 200 |
| ✅ PASS | `Billing /health` | 1007.2 ms | HTTP 200 |
| ✅ PASS | `Search /health` | 677.4 ms | HTTP 200 |
| ✅ PASS | `Tenants /health` | 716.5 ms | HTTP 200 |
| ✅ PASS | `Users /health` | 765.2 ms | HTTP 200 |
| ✅ PASS | `Resumes /health` | 710.1 ms | HTTP 200 |
| ✅ PASS | `WebSocket /health` | 605.4 ms | HTTP 200 |
| ✅ PASS | `SSO /health` | 572.2 ms | HTTP 200 |
| ✅ PASS | `Innovation /health` | 749.3 ms | HTTP 200 |
| ✅ PASS | `OpenAPI spec` | 692.4 ms | HTTP 200 |

## Database

| Status | Check | Latency | Details |
|--------|-------|---------|---------|
| ⏭️ SKIP | `PostgreSQL direct` | — | psycopg2 not installed |

## Redis

| Status | Check | Latency | Details |
|--------|-------|---------|---------|
| ✅ PASS | `Redis connect+set/get` | 28.6 ms | memory=1.51M, roundtrip=ok |

## Frontend

| Status | Check | Latency | Details |
|--------|-------|---------|---------|
| ✅ PASS | `GET /` | 1184.6 ms | HTTP 200 (page loaded) |
| ✅ PASS | `GET /dashboard` | 1332.1 ms | HTTP 200 (page loaded) |
| ⚠️ WARN | `GET /candidates` | 1252.5 ms | HTTP 404 (route may not exist yet) |
| ⚠️ WARN | `GET /jobs` | 1284.4 ms | HTTP 404 (route may not exist yet) |
| ⚠️ WARN | `GET /interviews` | 1083.1 ms | HTTP 404 (route may not exist yet) |
| ⚠️ WARN | `GET /ppe` | 1263.6 ms | HTTP 404 (route may not exist yet) |

## Prometheus

| Status | Check | Latency | Details |
|--------|-------|---------|---------|
| ✅ PASS | `Prometheus /-/healthy` | 960.8 ms | HTTP 200 |
| ✅ PASS | `Prometheus /api/v1/status/runtimeinfo` | 974.2 ms | HTTP 200 |
| ✅ PASS | `Prometheus targets` | 1256.8 ms | HTTP 200 — 3/6 targets up |
| ✅ PASS | `Prometheus metrics` | 1208.6 ms | HTTP 200 |

## Grafana

| Status | Check | Latency | Details |
|--------|-------|---------|---------|
| ✅ PASS | `Grafana /api/health` | 1123.6 ms | HTTP 200 |
| ✅ PASS | `Grafana /api/dashboards` | 1202.5 ms | HTTP 401 (auth required, OK) |
