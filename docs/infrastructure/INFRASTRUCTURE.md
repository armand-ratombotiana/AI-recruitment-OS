# Infrastructure Architecture — Kubernetes, CI/CD, and Scaling

## Kubernetes Cluster Topology

### Cluster Configuration
- **Provider**: AWS EKS
- **Version**: 1.29
- **Regions**: us-east-1 (primary), eu-west-1 (secondary)
- **Zones**: 3 AZs per region

### Node Pools

| Pool | Instance Type | Min | Max | Purpose |
|------|--------------|-----|-----|---------|
| system | m6i.large | 3 | 5 | System components, ingress |
| application | m6i.xlarge | 5 | 30 | API services, workers |
| ai-ml | g5.2xlarge | 2 | 10 | AI inference, embedding |
| data | r6i.2xlarge | 3 | 10 | PostgreSQL, Redis, Elasticsearch |

### Namespace Strategy

```
ai-ros-production
├── ingress           # NGINX Ingress Controller
├── core              # API Gateway, Auth, Tenant, User, RBAC
├── recruitment       # Candidate, Resume, Job, Pipeline
├── ai-platform       # Orchestrator, Evaluation, Memory, RAG
├── interviews        # Interview, PPE, Voice AI, Coding Sandbox
├── data              # PostgreSQL, Redis, Kafka, Elasticsearch
├── monitoring        # Prometheus, Grafana, Jaeger
├── workflows         # Workflow Engine, Notifications
└── cert-manager      # TLS certificate management
```

### Resource Quotas (per namespace)

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: airos-quota
  namespace: core
spec:
  hard:
    requests.cpu: "20"
    requests.memory: 40Gi
    limits.cpu: "40"
    limits.memory: 80Gi
    pods: "50"
    services: "20"
    persistentvolumeclaims: "10"
```

## Helm Chart Structure

```
helm/
├── airos/
│   ├── Chart.yaml
│   ├── values.yaml
│   ├── values-production.yaml
│   ├── values-staging.yaml
│   ├── templates/
│   │   ├── _helpers.tpl
│   │   ├── api-gateway/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   ├── hpa.yaml
│   │   │   └── pdb.yaml
│   │   ├── core-services/
│   │   │   ├── auth/
│   │   │   ├── tenant/
│   │   │   └── user/
│   │   ├── recruitment/
│   │   │   ├── candidate/
│   │   │   ├── resume/
│   │   │   └── job/
│   │   ├── ai-platform/
│   │   │   ├── orchestrator/
│   │   │   ├── evaluation/
│   │   │   └── embedding/
│   │   ├── interviews/
│   │   │   ├── ppe/
│   │   │   └── coding-sandbox/
│   │   ├── data/
│   │   │   ├── postgres/
│   │   │   ├── redis/
│   │   │   └── kafka/
│   │   └── monitoring/
│   │       ├── prometheus/
│   │       └── grafana/
│   └── charts/
│       └── dependencies/
```

## Terraform Modules

```hcl
# modules/vpc/main.tf
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "airos-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["us-east-1a", "us-east-1b", "us-east-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway   = true
  single_nat_gateway   = false
  enable_dns_hostnames = true

  tags = {
    Environment = "production"
    Project     = "ai-ros"
  }
}

# modules/eks/main.tf
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = "airos-cluster"
  cluster_version = "1.29"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  eks_managed_node_groups = {
    system = {
      min_size       = 3
      max_size       = 5
      desired_size   = 3
      instance_types = ["m6i.large"]
    }
    application = {
      min_size       = 5
      max_size       = 30
      desired_size   = 10
      instance_types = ["m6i.xlarge"]
    }
    ai_ml = {
      min_size       = 2
      max_size       = 10
      desired_size   = 3
      instance_types = ["g5.2xlarge"]
    }
  }
}
```

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/ci-cd.yaml
name: AI-ROS CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r requirements.txt
      - run: pytest tests/ -v --cov=src --cov-report=xml
      - run: ruff check src/
      - run: mypy src/

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          severity: 'CRITICAL,HIGH'

  build:
    needs: [test, security-scan]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: docker build -t airos:${{ github.sha }} .
      - name: Push to ECR
        run: |
          aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
          docker tag airos:${{ github.sha }} $ECR_URI/airos:${{ github.sha }}
          docker push $ECR_URI/airos:${{ github.sha }}

  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to staging
        run: |
          helm upgrade --install airos ./helm/airos \
            --namespace staging \
            --values ./helm/airos/values-staging.yaml \
            --set image.tag=${{ github.sha }}

  deploy-production:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy to production (canary)
        run: |
          helm upgrade --install airos ./helm/airos \
            --namespace production \
            --values ./helm/airos/values-production.yaml \
            --set image.tag=${{ github.sha }} \
            --set canary.enabled=true
```

## Monitoring & Observability

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - /etc/prometheus/alerts/*.yml

scrape_configs:
  - job_name: 'airos-api'
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names: ['core', 'recruitment', 'ai-platform', 'interviews']
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true

  - job_name: 'airos-ai-metrics'
    static_configs:
      - targets: ['ai-observability:9090']
```

### Alert Rules

```yaml
# alerts/ai-ros-alerts.yml
groups:
  - name: airos-critical
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"

      - alert: HighLatency
        expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning

      - alert: AIAgentFailure
        expr: rate(ai_agent_errors_total[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "AI agent failure rate elevated"

      - alert: HighTokenUsage
        expr: ai_tokens_consumed_total > 1000000
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "High AI token consumption"
```

### Grafana Dashboards

| Dashboard | Purpose |
|-----------|---------|
| API Overview | Request rate, latency, errors per service |
| AI Agent Performance | Agent throughput, success rate, token usage |
| PPE Session Metrics | Sessions started, completion rate, avg score |
| Database Performance | Query latency, connections, replication lag |
| Kafka Event Flow | Event throughput, consumer lag, DLQ depth |
| Infrastructure | CPU, memory, disk, network per node |
| Business Metrics | Candidates processed, interviews conducted, hires made |

## Scaling Configuration

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: airos-api-gateway
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Pods
      pods:
        metric:
          name: active_connections
        target:
          type: AverageValue
          averageValue: "100"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 25
          periodSeconds: 120
```

### Disaster Recovery

| Component | RTO | RPO | Strategy |
|-----------|-----|-----|----------|
| API Services | < 5 min | 0 | Multi-AZ, auto-restart |
| PostgreSQL | < 30 min | < 1 min | Streaming replication, automated failover |
| Redis | < 5 min | < 1 min | Sentinel with automatic failover |
| Kafka | < 15 min | < 1 min | Multi-AZ, replication factor 3 |
| Elasticsearch | < 30 min | < 5 min | Multi-node cluster, snapshot/restore |
| S3 | N/A | 0 | AWS-managed, 99.999999999% durability |

### Chaos Engineering

```yaml
# Litmus Chaos experiments
apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata:
  name: airos-chaos
spec:
  appinfo:
    appns: production
    applabel: app=airos
    appkind: deployment
  chaosServiceAccount: litmus-admin
  experiments:
    - name: pod-delete
      spec:
        components:
          env:
            - name: TOTAL_CHAOS_DURATION
              value: '300'
            - name: CHAOS_INTERVAL
              value: '10'
    - name: network-chaos
      spec:
        components:
          env:
            - name: NETWORK_INTERFACE
              value: 'eth0'
            - name: TC_PACKET_LOSS
              value: '30'
```
