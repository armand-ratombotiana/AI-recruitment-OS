# AI-ROS Kubernetes Deployment Guide

## Overview

AI-ROS can be deployed to Kubernetes using two methods:

1. **Helm charts** (recommended) - Full-featured with templating, environment overrides, and rollback
2. **Raw manifests** - Simple `kubectl apply` for quick deployments

## Architecture

```
                    +-----------+
                    |  Ingress  |
                    |  (nginx)  |
                    +-----+-----+
                          |
              +-----------+-----------+
              |                       |
        +-----+-----+         +------+-------+
        |  Frontend  |         |     API      |
        |  (Next.js) |         |  (FastAPI)   |
        |  :3000     |         |  :8000       |
        +------------+         +------+-------+
                                      |
                          +-----------+-----------+
                          |                       |
                   +------+------+          +-----+-----+
                   | PostgreSQL   |          |   Redis   |
                   | (pgvector)   |          |           |
                   | :5432        |          | :6379     |
                   +--------------+          +-----------+
```

## Prerequisites

- Kubernetes cluster (1.26+)
- `kubectl` configured with cluster access
- `helm` v3.12+ (for Helm deployment)
- `nginx-ingress` controller (or compatible ingress)
- `cert-manager` (for TLS certificates)

## Quick Start

### Helm Deployment (Recommended)

```bash
# Deploy to staging
./scripts/deploy-k8s.sh deploy --env staging --tag v1.0.0

# Check status
./scripts/deploy-k8s.sh status

# Run health checks
./scripts/deploy-k8s.sh health

# View logs
./scripts/deploy-k8s.sh logs api
```

### Raw Manifests Deployment

```bash
./scripts/deploy-k8s.sh deploy-raw
```

## Helm Chart Structure

```
helm/airos/
  Chart.yaml              # Chart metadata
  values.yaml             # Default values
  values-prod.yaml        # Production overrides
  values-staging.yaml     # Staging overrides
  templates/
    _helpers.tpl          # Template helpers
    namespace.yaml        # Namespace
    configmap.yaml        # Application config
    secrets.yaml          # Secrets
    api-deployment.yaml   # API server
    frontend-deployment.yaml  # Frontend
    worker-deployment.yaml    # Celery worker
    services.yaml         # Service definitions
    ingress.yaml          # Ingress routing
    hpa.yaml              # Autoscaling
```

## Configuration

### Environment-Specific Deploys

```bash
# Staging
helm upgrade --install airos helm/airos \
  --namespace airos --create-namespace \
  --values helm/airos/values-staging.yaml \
  --set image.tag=v1.0.0

# Production
helm upgrade --install airos helm/airos \
  --namespace airos --create-namespace \
  --values helm/airos/values-prod.yaml \
  --set image.tag=v1.0.0
```

### Key Values

| Value | Description | Default |
|-------|-------------|---------|
| `replicaCount.api` | API replicas | 2 |
| `replicaCount.worker` | Worker replicas | 2 |
| `replicaCount.frontend` | Frontend replicas | 2 |
| `image.repository` | Container registry | `ghcr.io/airos` |
| `image.tag` | Image tag | `latest` |
| `ingress.enabled` | Enable ingress | `true` |
| `autoscaling.enabled` | Enable HPA | `false` |

### Setting Secrets

Secrets should be managed via sealed-secrets or external-secrets in production:

```bash
# Using sealed-secrets
kubectl create secret generic airos-secrets \
  --from-literal=SECRET_KEY=$(openssl rand -base64 32) \
  --from-literal=DB_PASSWORD=$(openssl rand -base64 32) \
  --from-literal=OPENAI_API_KEY=sk-... \
  --namespace airos \
  --dry-run=client -o yaml | kubeseal --cert sealed-secrets-pub.pem -o yaml > sealed-secrets.yaml

kubectl apply -f sealed-secrets.yaml
```

## Rollback

```bash
# List revisions
helm history airos --namespace airos

# Rollback to previous
./scripts/deploy-k8s.sh rollback

# Rollback to specific revision
./scripts/deploy-k8s.sh rollback 3
```

## Scaling

### Manual Scaling

```bash
kubectl scale deployment airos-api --replicas=5 -n airos
kubectl scale deployment airos-worker --replicas=4 -n airos
```

### Autoscaling (HPA)

Enable in values:

```yaml
autoscaling:
  enabled: true
  api:
    minReplicas: 3
    maxReplicas: 20
    targetCPUUtilizationPercentage: 70
```

## Monitoring

```bash
# Pod status
kubectl get pods -n airos -o wide

# Resource usage
kubectl top pods -n airos

# Events
kubectl get events -n airos --sort-by='.lastTimestamp'

# Describe a failing pod
kubectl describe pod <pod-name> -n airos
```

## Troubleshooting

### Pod CrashLoopBackOff

```bash
# Check logs
kubectl logs <pod-name> -n airos --previous

# Check events
kubectl describe pod <pod-name> -n airos
```

### Database Connection Issues

```bash
# Verify PostgreSQL is running
kubectl exec -n airos deploy/airos-postgres -- pg_isready -U airos

# Test connection from API pod
kubectl exec -n airos deploy/airos-api -- \
  python -c "import asyncio; from sqlalchemy.ext.asyncio import create_async_engine; e = create_async_engine('postgresql+asyncpg://airos:pass@airos-postgres:5432/airos'); asyncio.run(e.connect())"
```

### Ingress Not Routing

```bash
# Check ingress
kubectl describe ingress airos-ingress -n airos

# Verify ingress controller
kubectl get pods -n ingress-nginx

# Test from inside cluster
kubectl exec -n airos deploy/airos-api -- curl -s http://airos-frontend:3000/
```

### Image Pull Errors

```bash
# Verify image exists
kubectl get pods -n airos -o jsonpath='{range .items[*]}{.spec.containers[*].image}{"\n"}{end}'

# Create pull secret
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=USERNAME \
  --docker-password=TOKEN \
  -n airos
```

### High Memory Usage

```bash
# Check current usage
kubectl top pods -n airos

# Adjust resource limits
helm upgrade airos helm/airos --reuse-values \
  --set resources.api.limits.memory=2Gi
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Deploy to staging
  run: |
    helm upgrade --install airos helm/airos \
      --namespace airos --create-namespace \
      --values helm/airos/values-staging.yaml \
      --set image.tag=${{ github.sha }} \
      --wait --timeout 600s

- name: Health check
  run: ./scripts/deploy-k8s.sh health --env staging
```

## Backup & Recovery

```bash
# Backup PostgreSQL
kubectl exec -n airos deploy/airos-postgres -- \
  pg_dump -U airos airos | gzip > backup-$(date +%Y%m%d).sql.gz

# Restore
gunzip -c backup.sql.gz | kubectl exec -i -n airos deploy/airos-postgres -- \
  psql -U airos airos
```
