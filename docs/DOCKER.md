# Docker Architecture

## Overview

AI-ROS uses Docker Compose to orchestrate 9 services across infrastructure, application, and monitoring layers.

## Service Architecture

```
+------------------+     +------------------+     +------------------+
|   Frontend       |     |   API Gateway    |     |   Celery Worker  |
|   :3000          |     |   :8000          |     |   (no port)      |
|   Next.js 14     |     |   FastAPI        |     |   Celery 5.x     |
+--------+---------+     +--------+---------+     +--------+---------+
         |                       |                       |
         +-------+-------+-------+-------+-------+------+
                 |       |       |       |       |
         +-------v-+ +---v---+ +v-----+ +v-----+ +v--------+
         |PostgreSQL| | Redis | |Prom. | |Graf. | |Jaeger   |
         | :5432    | | :6379 | |:9090 | |:3001 | |:16686   |
         +----------+ +-------+ +------+ +------+ +---------+
```

## Service Descriptions

### Infrastructure Services

| Service | Image | Port | Description |
|---------|-------|------|-------------|
| PostgreSQL | pgvector/pgvector:pg16 | 5432 | Primary database with vector embeddings |
| Redis | redis:7-alpine | 6379 | Cache, sessions, Celery broker |

### Application Services

| Service | Build Context | Port | Description |
|---------|--------------|------|-------------|
| API | ./backend | 8000 | FastAPI gateway with 26 microservices |
| Celery Worker | ./backend | - | Async task processor (5 queues) |
| Frontend | ./frontend | 3000 | Next.js React application |

### Monitoring Services

| Service | Image | Port | Description |
|---------|-------|------|-------------|
| Prometheus | prom/prometheus:v2.54.1 | 9090 | Metrics collection & alerting |
| Grafana | grafana/grafana:11.3.0 | 3001 | Monitoring dashboards |
| Jaeger | jaegertracing/all-in-one:latest | 16686 | Distributed tracing |
| Alertmanager | prom/alertmanager:v0.27.0 | 9093 | Alert routing |

## Port Mappings

| Host Port | Container | Service |
|-----------|-----------|---------|
| 3000 | airos-frontend | Next.js Frontend |
| 3001 | airos-grafana | Grafana Dashboard |
| 4317 | airos-jaeger | OTLP gRPC Receiver |
| 4318 | airos-jaeger | OTLP HTTP Receiver |
| 5432 | airos-postgres | PostgreSQL |
| 6379 | airos-redis | Redis |
| 8000 | airos-api | API Gateway |
| 9090 | airos-prometheus | Prometheus |
| 9093 | airos-alertmanager | Alertmanager |
| 16686 | airos-jaeger | Jaeger UI |

## Environment Variables

### Required (from .env)

```bash
OPENAI_API_KEY=sk-...          # OpenAI API key for AI features
SECRET_KEY=<32-char-string>    # JWT signing key
ENCRYPTION_KEY=<32-char-string> # Data encryption key
```

### Optional

```bash
ANTHROPIC_API_KEY=sk-ant-...   # Anthropic Claude API key
GRAFANA_ADMIN_USER=admin       # Grafana admin username
GRAFANA_ADMIN_PASSWORD=admin   # Grafana admin password
POSTGRES_PASSWORD=airos_dev_password  # Database password
```

### Service URLs

```bash
DATABASE_URL=postgresql+asyncpg://airos:airos_dev_password@postgres:5432/airos
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

## Resource Limits

| Service | Memory Limit | CPU Limit | Memory Reservation |
|---------|-------------|-----------|-------------------|
| PostgreSQL | 512M | 1.0 | 256M |
| Redis | 256M | 0.5 | 128M |
| API | 1G | 2.0 | 512M |
| Celery Worker | 1G | 1.5 | 256M |
| Frontend | 512M | 1.0 | 128M |
| Prometheus | 512M | 1.0 | - |
| Grafana | 256M | 0.5 | - |
| Jaeger | 256M | 0.5 | - |
| Alertmanager | 128M | 0.25 | - |

## Networking

All services communicate via the `airos-net` bridge network (subnet: 172.20.0.0/16).

## Volumes

| Volume | Purpose |
|--------|---------|
| postgres_data | PostgreSQL data persistence |
| redis_data | Redis data persistence (AOF) |
| api_logs | API application logs |
| prometheus_data | Prometheus metrics storage (30d retention) |
| grafana_data | Grafana dashboards & settings |

## Troubleshooting

### Service won't start

```bash
# Check logs for the specific service
docker compose logs api
docker compose logs postgres
docker compose logs redis

# Check if port is in use
netstat -tlnp | grep :8000

# Restart just that service
docker compose restart api
```

### Database connection refused

```bash
# Verify PostgreSQL is healthy
docker compose ps postgres

# Check PostgreSQL logs
docker compose logs postgres

# Test connection
docker compose exec postgres psql -U airos -d airos
```

### Redis connection refused

```bash
# Verify Redis is healthy
docker compose ps redis

# Test connection
docker compose exec redis redis-cli ping
```

### API returning 502

```bash
# Check API health
curl http://localhost:8000/health

# Check API logs
docker compose logs api

# Verify dependencies are healthy
docker compose ps
```

### Out of memory

```bash
# Check resource usage
docker stats --no-stream

# Increase memory limits in docker-compose.yml under deploy.resources.limits.memory
```

### Reset everything

```bash
# Stop all and remove volumes
docker compose down -v

# Remove all images
docker compose down -v --rmi all

# Rebuild and start
docker compose up -d --build
```

### Health checks

```bash
# Run all health checks
python scripts/monitor.py

# Run with JSON output
python scripts/monitor.py --json

# Continuous monitoring
python scripts/monitor.py --continuous --interval 60
```
