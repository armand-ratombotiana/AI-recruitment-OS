# AI-ROS Deployment Guide

## Local Development

### Prerequisites

- Docker and Docker Compose
- Python 3.12+
- Node.js 20+
- Git

### Quick Start

```bash
# Clone repository
git clone <repo-url>
cd ai-ros

# Copy environment variables
cp .env.example .env
# Edit .env with your API keys

# Start infrastructure
docker compose up -d postgres redis

# Start backend
cd backend
pip install -r requirements.txt
python run.py

# Start frontend (in another terminal)
cd frontend
npm install
npm run dev
```

### Using Make

```bash
# Full bootstrap (installs deps, starts infra, migrates DB, seeds data)
make bootstrap

# Start dev servers with hot reload
make dev

# Run all tests
make test
```

## Docker Deployment

### Start All Services

```bash
docker compose up -d
```

This starts:
- **api** — FastAPI backend on port 8000
- **frontend** — Next.js app on port 3000
- **postgres** — PostgreSQL 16 with pgvector on port 5432
- **redis** — Redis 7 on port 6379
- **prometheus** — Metrics on port 9090
- **grafana** — Dashboards on port 3001
- **jaeger** — Tracing on port 16686
- **alertmanager** — Alerts on port 9093

### Start Infrastructure Only

```bash
docker compose up -d postgres redis prometheus grafana jaeger
```

### Start Development Mode

```bash
docker compose -f docker-compose.dev.yml up --build
```

### View Logs

```bash
docker compose logs -f api
docker compose logs -f frontend
docker compose logs -f
```

### Stop All Services

```bash
docker compose down
```

### Stop and Remove Volumes

```bash
docker compose down -v
```

### Rebuild Images

```bash
docker compose build --no-cache
```

## Production Deployment

### Kubernetes

```bash
# Apply base manifests
kubectl apply -f infrastructure/kubernetes/base/

# Apply environment overlay
kubectl apply -f infrastructure/kubernetes/overlays/production/
```

### Helm

```bash
# Install
helm install airos helm/airos/ \
  --namespace production \
  --create-namespace \
  --set image.tag=<commit-sha> \
  --set imageFrontend.tag=<commit-sha>

# Upgrade
helm upgrade airos helm/airos/ \
  --namespace production \
  --set image.tag=<commit-sha>
```

### Terraform (AWS)

```bash
cd infrastructure/terraform/environments/production

terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

### CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/ci-cd.yml`) handles:

1. **Lint** — ruff (Python), eslint (TypeScript)
2. **Test** — pytest (backend), npm test (frontend)
3. **Security** — Trivy vulnerability scan
4. **Build** — Docker images pushed to ECR
5. **Deploy** — Helm to EKS (staging on `develop`, production on `main`)

## Monitoring

### Access Monitoring

| Service | URL | Credentials |
|---------|-----|-------------|
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3001 | admin / admin |
| Jaeger | http://localhost:16686 | — |
| Alertmanager | http://localhost:9093 | — |

### View Dashboards

1. Open Grafana at http://localhost:3001
2. Navigate to Dashboards
3. Select AI-ROS Dashboard

### Start Monitoring Stack

```bash
bash scripts/start-monitoring.sh
```

### Check Monitoring Status

```bash
bash scripts/monitoring-status.sh
```

## Backup

```bash
# Backup PostgreSQL, Redis, and Grafana dashboards
bash scripts/backup.sh
```

Backups are stored in `backups/<timestamp>/`.

## Database Migrations

```bash
# Run migrations
cd backend && alembic upgrade head

# Create new migration
cd backend && alembic revision --autogenerate -m "description"

# Rollback last migration
cd backend && alembic downgrade -1

# Reset database (drop + create + migrate + seed)
make reset-db
```

## Troubleshooting

### Backend Won't Start

1. Check Python version: `python --version` (requires 3.12+)
2. Install dependencies: `pip install -r requirements.txt`
3. Check database connection: `docker compose up -d postgres`
4. Check logs: `docker compose logs api`

### Frontend Won't Start

1. Check Node.js version: `node --version` (requires 20+)
2. Install dependencies: `npm install`
3. Check API URL in `.env`: `NEXT_PUBLIC_API_URL=http://localhost:8000`
4. Check logs: `docker compose logs frontend`

### Docker Issues

1. Check Docker status: `docker info`
2. Rebuild images: `docker compose build --no-cache`
3. Check logs: `docker compose logs`
4. Clean up: `docker system prune -af`

### Database Issues

1. Check PostgreSQL is running: `docker compose ps postgres`
2. Check connection: `docker exec airos-postgres psql -U airos -d airos -c "SELECT 1"`
3. Reset database: `make reset-db`

### Port Conflicts

Check which process is using a port:

```bash
# Windows
netstat -ano | findstr :8000

# macOS/Linux
lsof -i :8000
```

Change ports in `docker-compose.yml` or stop the conflicting process.
