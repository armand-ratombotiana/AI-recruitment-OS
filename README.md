# AI-Native Recruitment Operating System (AI-ROS)

An autonomous AI-native enterprise recruitment platform with multi-agent orchestration, live coding interviews, and real-time collaboration.

---

## Overview

AI-ROS is a multi-tenant SaaS platform that transforms the hiring lifecycle into an AI-driven, workflow-orchestrated, continuously learning ecosystem. Unlike traditional ATS systems, AI-ROS operates as a distributed multi-agent AI system where specialized agents collaborate to execute resume parsing, candidate evaluation, interview orchestration, pair programming assessment, hiring recommendations, and workforce analytics — all with full explainability, tenant isolation, and enterprise-grade security.

### Key Differentiators

| Dimension | Traditional ATS | AI-ROS |
|-----------|----------------|--------|
| Architecture | Monolithic CRUD | Distributed Multi-Agent AI |
| Intelligence | Manual rules | Autonomous AI orchestration |
| Interviews | Human-only | AI interviewers + live coding |
| Evaluation | Subjective scoring | Explainable AI scoring |
| Workflows | Hardcoded pipelines | No-code event-driven automation |
| Memory | Stateless | Persistent AI memory per tenant |
| Scale | Vertical | Horizontal + AI-native scaling |

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Python 3.12+
- Node.js 18+
- Git

### One-Command Setup

```bash
git clone https://github.com/your-org/ai-ros.git
cd ai-ros

cp .env.example .env
# Edit .env with your API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY)

make bootstrap
make dev
```

### Manual Setup

```bash
cp .env.example .env

docker compose up -d postgres redis prometheus grafana jaeger

cd backend && pip install -r requirements.txt && python run.py

cd frontend && npm install && npm run dev
```

### Docker Compose

```bash
# Start all services (app + monitoring)
docker compose up -d

# Start infrastructure only
docker compose up -d postgres redis prometheus grafana jaeger

# View logs
docker compose logs -f api

# Stop all services
docker compose down
```

---

## Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | — |
| API Gateway | http://localhost:8000 | — |
| Swagger UI | http://localhost:8000/docs | — |
| ReDoc | http://localhost:8000/redoc | — |
| Grafana | http://localhost:3001 | admin / admin |
| Prometheus | http://localhost:9090 | — |
| Jaeger | http://localhost:16686 | — |
| Alertmanager | http://localhost:9093 | — |

---

## Architecture

### High-Level

```
┌─────────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                         │
│   Next.js Frontend  │  Candidate Portal  │  Live Coding IDE    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / WSS
┌──────────────────────────▼──────────────────────────────────────┐
│                      GATEWAY LAYER                              │
│   API Gateway  │  Rate Limiter  │  Auth Middleware  │  WAF     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ gRPC / Kafka
┌──────────────────────────▼──────────────────────────────────────┐
│                      SERVICE MESH (15 microservices)            │
│   Auth  │  Tenant  │  User  │  Candidate  │  Resume  │  Job   │
│   Interview  │  PPE  │  AI Orchestrator  │  Analytics  │       │
│   Workflow  │  Notification  │  Compliance  │  Billing  │      │
│   Vector Search  │  WebSocket                                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                      DATA & AI LAYER                            │
│   PostgreSQL  │  Redis  │  Kafka  │  pgvector  │  ES          │
│   OpenAI  │  Claude  │  Whisper  │  TTS                      │
└─────────────────────────────────────────────────────────────────┘
```

### Backend (Python/FastAPI)

- **15 Microservices** unified under a single API gateway
- **100+ API endpoints** covering all recruitment workflows
- **Multi-agent AI system** with LangGraph orchestration
- **Event-driven architecture** with Kafka
- **Real-time collaboration** via WebSockets
- **Async-first** with SQLAlchemy + asyncpg

### Frontend (Next.js/React)

- **22+ pages** covering recruiter workspace, candidate management, interviews
- **Real-time PPE IDE** with Monaco code editor
- **AI Copilot** chat interface for recruiter assistance
- **Responsive design** with TailwindCSS
- **Type-safe** with TypeScript

### Infrastructure

- **Docker Compose** for local development
- **Kubernetes** manifests for production (base + overlays)
- **Terraform** modules for AWS infrastructure (VPC, RDS, EKS, Redis, S3, IAM)
- **Helm charts** for K8s deployment
- **Prometheus + Grafana** for monitoring
- **Jaeger** for distributed tracing
- **Alertmanager** for alert routing
- **GitHub Actions** CI/CD pipeline
- **ArgoCD** for GitOps deployment

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12, FastAPI, SQLAlchemy, Pydantic v2 |
| AI/ML | LangGraph, LangChain, OpenAI, Anthropic |
| Frontend | Next.js 14, TypeScript, TailwindCSS, Zustand |
| Database | PostgreSQL 16 + pgvector, Redis 7 |
| Events | Apache Kafka, Celery |
| Search | Elasticsearch 8 |
| Monitoring | Prometheus, Grafana, Jaeger, Alertmanager |
| Infrastructure | Docker, Kubernetes, Terraform, Helm |
| CI/CD | GitHub Actions, ArgoCD |

---

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` — Register new user
- `POST /api/v1/auth/login` — Login
- `POST /api/v1/auth/refresh` — Refresh token
- `POST /api/v1/auth/logout` — Logout
- `POST /api/v1/auth/mfa/enable` — Enable MFA
- `POST /api/v1/auth/mfa/verify` — Verify MFA

### Tenants
- `POST /api/v1/tenants/` — Create tenant
- `GET /api/v1/tenants/{id}` — Get tenant
- `PUT /api/v1/tenants/{id}` — Update tenant
- `GET /api/v1/tenants/{id}/settings` — Get settings
- `PUT /api/v1/tenants/{id}/settings` — Update settings
- `GET /api/v1/tenants/{id}/branding` — Get branding
- `PUT /api/v1/tenants/{id}/branding` — Update branding

### Users
- `GET /api/v1/users/` — List users
- `GET /api/v1/users/{id}` — Get user
- `PUT /api/v1/users/{id}` — Update user
- `DELETE /api/v1/users/{id}` — Delete user
- `GET /api/v1/users/{id}/activity` — User activity

### Candidates
- `GET /api/v1/candidates/` — List candidates
- `GET /api/v1/candidates/{id}` — Get candidate
- `POST /api/v1/candidates/` — Create candidate
- `PUT /api/v1/candidates/{id}` — Update candidate
- `DELETE /api/v1/candidates/{id}` — Delete candidate
- `POST /api/v1/candidates/{id}/enrich` — AI enrichment
- `GET /api/v1/candidates/{id}/skills` — Get skills

### Resumes
- `POST /api/v1/resumes/upload` — Upload resume
- `GET /api/v1/resumes/{id}` — Get resume
- `GET /api/v1/resumes/{id}/parsed` — Get parsed resume
- `POST /api/v1/resumes/{id}/reparse` — Reparse resume

### Jobs
- `GET /api/v1/jobs/` — List jobs
- `GET /api/v1/jobs/{id}` — Get job
- `POST /api/v1/jobs/` — Create job
- `PUT /api/v1/jobs/{id}` — Update job
- `DELETE /api/v1/jobs/{id}` — Delete job
- `GET /api/v1/jobs/{id}/candidates` — Matched candidates

### Interviews
- `GET /api/v1/interviews/` — List interviews
- `GET /api/v1/interviews/{id}` — Get interview
- `POST /api/v1/interviews/` — Schedule interview
- `POST /api/v1/interviews/{id}/start` — Start interview
- `POST /api/v1/interviews/{id}/complete` — Complete interview
- `POST /api/v1/interviews/{id}/feedback` — Submit feedback

### Evaluations
- `POST /api/v1/evaluations/` — Start AI evaluation
- `GET /api/v1/evaluations/{id}` — Get evaluation
- `GET /api/v1/evaluations/{id}/explain` — Explain evaluation
- `GET /api/v1/evaluations/candidates/{id}/evaluations` — Candidate evaluations
- `POST /api/v1/evaluations/compare` — Compare candidates

### PPE (Pair Programming Evaluation)
- `POST /api/v1/ppe/sessions` — Create session
- `GET /api/v1/ppe/sessions/{id}` — Get session
- `POST /api/v1/ppe/sessions/{id}/start` — Start session
- `POST /api/v1/ppe/sessions/{id}/code` — Submit code
- `POST /api/v1/ppe/sessions/{id}/execute` — Execute code
- `POST /api/v1/ppe/sessions/{id}/hint` — Get hint
- `POST /api/v1/ppe/sessions/{id}/message` — Send message to agent
- `POST /api/v1/ppe/sessions/{id}/complete` — Complete session
- `GET /api/v1/ppe/sessions/{id}/evaluation` — Get evaluation
- `GET /api/v1/ppe/problems` — List coding problems

### AI Orchestrator
- `POST /api/v1/ai/orchestrate` — Orchestrate task
- `GET /api/v1/ai/agents` — List agents
- `GET /api/v1/ai/agents/{id}` — Get agent
- `POST /api/v1/ai/tasks` — Submit task
- `GET /api/v1/ai/tasks/{id}` — Get task

### Analytics
- `GET /api/v1/analytics/dashboard` — Dashboard metrics
- `GET /api/v1/analytics/metrics` — Query metrics
- `GET /api/v1/analytics/pipeline` — Pipeline analytics
- `GET /api/v1/analytics/recruiters` — Recruiter analytics
- `GET /api/v1/analytics/ai-performance` — AI performance
- `POST /api/v1/analytics/reports` — Generate report

### Workflows
- `GET /api/v1/workflows/` — List workflows
- `GET /api/v1/workflows/{id}` — Get workflow
- `POST /api/v1/workflows/` — Create workflow
- `PUT /api/v1/workflows/{id}` — Update workflow
- `POST /api/v1/workflows/{id}/trigger` — Trigger workflow
- `POST /api/v1/workflows/{id}/activate` — Activate workflow
- `GET /api/v1/workflows/{id}/executions` — List executions
- `POST /api/v1/workflows/executions/{id}/approve` — Approve execution

### Notifications
- `POST /api/v1/notifications/` — Send notification
- `GET /api/v1/notifications/` — List notifications
- `PUT /api/v1/notifications/{id}/read` — Mark as read
- `GET /api/v1/notifications/preferences` — Get preferences
- `PUT /api/v1/notifications/preferences` — Update preferences

### Compliance
- `GET /api/v1/compliance/policies` — List policies
- `POST /api/v1/compliance/policies` — Create policy
- `POST /api/v1/compliance/consent` — Record consent
- `GET /api/v1/compliance/audit-log` — Audit log
- `POST /api/v1/compliance/data-export` — Export data

### Billing
- `GET /api/v1/billing/subscription` — Get subscription
- `POST /api/v1/billing/subscription` — Create subscription
- `GET /api/v1/billing/invoices` — List invoices
- `GET /api/v1/billing/usage` — Get usage

### Search
- `POST /api/v1/search/candidates` — Search candidates
- `POST /api/v1/search/jobs` — Search jobs
- `POST /api/v1/search/embeddings` — Generate embedding
- `GET /api/v1/search/embeddings/{id}` — Get embedding

### WebSocket
- `WS /api/v1/ppe/ws/{session_id}` — PPE real-time collaboration

Full API reference: [docs/API.md](docs/API.md)

---

## Features

### Backend (15+ microservices)
- Multi-agent AI orchestration (LangGraph)
- Resume parsing and skill extraction
- Candidate-job semantic matching
- Pair programming evaluation engine
- Fraud detection and anomaly scoring
- GDPR/SOC2 compliance automation
- Intelligent scheduling engine
- Real-time WebSocket collaboration
- Event-driven workflow automation
- Multi-tenant isolation and RBAC

### Frontend (22+ pages)
- Recruiter dashboard with pipeline view
- AI copilot chat interface
- PPE IDE with Monaco code editor
- Candidate management portal
- Job management and matching
- Interview scheduling and tracking
- Analytics dashboards with Recharts
- No-code workflow builder
- Reports and insights
- Settings and tenant management
- Dark/light mode ready
- Responsive design (mobile-first)

### AI Capabilities
- Resume analysis and information extraction
- Candidate-job matching with explainable scores
- Interview evaluation with confidence levels
- Seniority estimation from code and conversation
- Talent intelligence and market insights
- Semantic search via pgvector embeddings
- Multi-provider LLM routing (OpenAI, Claude)
- Persistent AI memory per tenant

### Infrastructure
- Docker containerization (dev + prod)
- Kubernetes manifests (base + overlays)
- Helm charts for K8s deployment
- Terraform modules (AWS VPC, RDS, EKS, Redis, S3, IAM)
- Prometheus metrics collection
- Grafana monitoring dashboards
- Jaeger distributed tracing
- Alertmanager alert routing
- GitHub Actions CI/CD
- ArgoCD GitOps deployment

---

## Development

### Running Tests

```bash
make test                 # All backend tests with coverage
make test-cov             # Run tests with coverage
make test-frontend        # Frontend linting

# Monitoring / health checks
make check                # Run infrastructure health checks
make check-json           # Run health checks with JSON output
make check-continuous     # Run continuous monitoring (every 60s)
```

### Code Quality

```bash
make lint          # Lint all code
make format        # Format all code
make typecheck     # Type check all code
make security      # Security scan
make pre-commit    # Pre-commit checks (lint + typecheck + unit tests)
```

### Database

```bash
make migrate               # Run migrations
make migrate-create NAME="add users table"  # Create new migration
make migrate-down          # Rollback last migration
make seed                  # Seed database with dev data
make reset-db              # Reset database (drop + create + migrate + seed)
make db-shell              # Open PostgreSQL shell
make db-redis              # Open Redis CLI
```

### Make Targets

```bash
make help          # Show all available commands
make bootstrap     # Initial project setup
make dev           # Start dev servers with hot reload
make up            # Start all services
make down          # Stop all services
make restart       # Restart all services
make logs          # Tail logs from all services
make build         # Build Docker images
make clean         # Clean build artifacts
make nuke          # Full cleanup (containers, volumes, images)
```

---

## Docker

### Start / Stop

```bash
make up                    # Start all services (docker compose up -d)
make down                  # Stop all services
make down-clean            # Stop all services and remove volumes
make logs                  # Tail logs from all services
make logs-api              # Tail API logs only
make status                # Show running container status
make stats                 # Show container resource usage
```

### Docker Compose Commands

```bash
docker compose up -d                                    # Start all
docker compose up -d postgres redis prometheus grafana jaeger  # Infrastructure only
docker compose -f docker-compose.dev.yml up --build     # Dev with hot reload
docker compose logs -f api                              # View API logs
docker compose down                                     # Stop all
docker compose down -v                                  # Stop + remove volumes
docker compose build                                    # Build images
bash scripts/backup.sh                                  # Backup data
```

### Build & Clean

```bash
make build                 # Build all Docker images
make build-no-cache        # Build all Docker images (no cache)
make clean                 # Remove containers, networks, volumes, caches
make clean-all             # Remove everything including images
```

## Docker Services

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| PostgreSQL | airos-postgres | 5432 | Primary database (pgvector) |
| Redis | airos-redis | 6379 | Cache & sessions |
| API | airos-api | 8000 | FastAPI gateway (26 services) |
| Celery Worker | airos-celery-worker | 8000 | Async task processor |
| Frontend | airos-frontend | 3000 | Next.js app |
| Prometheus | airos-prometheus | 9090 | Metrics collection |
| Grafana | airos-grafana | 3001 | Monitoring dashboards |
| Jaeger | airos-jaeger | 16686 | Distributed tracing |
| Alertmanager | airos-alertmanager | 9093 | Alert routing |

### Architecture

```
                        +------------------+
                        |    Frontend      |
                        |   :3000 (Next.js)|
                        +--------+---------+
                                 |
                        +--------v---------+
                        |   API Gateway    |
                        |   :8000 (FastAPI)|
                        +--+-----+-----+--+
                           |     |     |
              +------------+     |     +------------+
              |                  |                  |
    +---------v-------+  +------v------+  +--------v-------+
    | PostgreSQL      |  | Redis       |  | Celery Worker   |
    | :5432 (pgvector)|  | :6379       |  | (5 queues)      |
    +-----------------+  +-------------+  +-----------------+

  +--------------------+  +------------------+  +-----------------+
  | Prometheus :9090   |  | Grafana :3001    |  | Jaeger :16686   |
  +--------------------+  +------------------+  +-----------------+
  +--------------------+
  | Alertmanager :9093 |
  +--------------------+
```

### Backend Services (26 microservices under single API gateway)

| Service | Prefix | Description |
|---------|--------|-------------|
| Auth | `/api/v1/auth` | Registration, login, MFA, SSO |
| Tenants | `/api/v1/tenants` | Multi-tenant org management |
| Users | `/api/v1/users` | User account management |
| Candidates | `/api/v1/candidates` | CRUD, AI enrichment, skill extraction |
| Resumes | `/api/v1/resumes` | Upload, parsing, re-parsing |
| Jobs | `/api/v1/jobs` | Job postings, candidate matching |
| Interviews | `/api/v1/interviews` | Scheduling, AI interviews, feedback |
| PPE | `/api/v1/ppe` | Pair programming evaluation, live coding |
| AI Orchestrator | `/api/v1/ai` | Multi-agent task routing, LLM management |
| Analytics | `/api/v1/analytics` | Pipeline metrics, reports, dashboards |
| Workflows | `/api/v1/workflows` | Event-driven automation |
| Notifications | `/api/v1/notifications` | Multi-channel (email, push, in-app) |
| Compliance | `/api/v1/compliance` | GDPR/SOC2, audit logging |
| Billing | `/api/v1/billing` | Subscriptions, invoices, usage |
| Search | `/api/v1/search` | Vector embeddings, similarity search |
| WebSocket | `/api/v1/ws` | Real-time collaboration |
| Resume Analysis | `/api/v1/resume-analysis` | Advanced resume processing |
| Scheduling | `/api/v1/scheduling` | Interview scheduling engine |
| Fraud Detection | `/api/v1/fraud` | Anomaly scoring |
| Compliance Automation | `/api/v1/compliance-automation` | Automated compliance checks |
| AI Evaluation | `/api/v1/ai-evaluation` | AI scoring engine |
| Talent Intelligence | `/api/v1/talent-intelligence` | Market insights |
| Workflow Automation | `/api/v1/workflow-automation` | No-code workflows |
| SSO | `/api/v1/sso` | Single sign-on providers |
| Innovation | `/api/v1/innovations` | Experimental features |

---

## Project Structure

```
ai-ros/
├── src/                                # Backend source (Python/FastAPI)
│   ├── main.py                         # Application entry point
│   ├── config.py                       # Pydantic settings
│   ├── api/v1/                         # API route handlers
│   │   ├── auth.py                     # Authentication endpoints
│   │   ├── candidates.py               # Candidate management
│   │   ├── interviews.py               # Interview orchestration
│   │   ├── evaluations.py              # AI evaluations
│   │   ├── ppe.py                      # Pair programming evaluation
│   │   ├── workflows.py                # Workflow automation
│   │   ├── analytics.py                # Analytics & reporting
│   │   ├── websockets.py               # WebSocket handlers
│   │   └── ...
│   ├── domain/                         # Domain models (DDD)
│   │   ├── identity/                   # User & auth models
│   │   ├── candidate/                  # Candidate models
│   │   ├── interview/                  # Interview models
│   │   ├── evaluation/                 # Evaluation models
│   │   ├── pair_programming/           # PPE models
│   │   ├── workflow/                   # Workflow models
│   │   └── ...
│   ├── ai/                             # AI subsystem
│   │   ├── agents/                     # Specialized AI agents
│   │   ├── orchestrator/               # LangGraph orchestration
│   │   ├── providers/                  # LLM provider routing
│   │   ├── prompts/                    # Prompt management
│   │   └── rag/                        # RAG pipeline
│   ├── services/                       # Business logic services
│   ├── infrastructure/                 # DB, cache, observability
│   ├── core/                           # Security, middleware, exceptions
│   └── workers/                        # Celery background workers
├── frontend/                           # Next.js frontend
│   └── src/app/                        # 22+ page routes
│       ├── dashboard/                  # Main recruiter workspace
│       ├── (interview)/                # Interview pages
│       └── ...
├── infrastructure/                     # K8s, Helm, Terraform, monitoring
├── scripts/                            # Operational scripts
├── tests/                              # Test suites
├── docs/                               # Documentation
├── docker/                             # Dockerfiles
├── docker-compose.yml                  # Production compose
├── docker-compose.dev.yml              # Development compose
├── Makefile                            # Developer commands
└── .env.example                        # Environment template
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required
OPENAI_API_KEY=sk-...
SECRET_KEY=<random-32-char-string>
ENCRYPTION_KEY=<random-32-char-string>

# Optional (for full AI features)
ANTHROPIC_API_KEY=sk-ant-...

# Database (defaults work with docker compose)
DATABASE_URL=postgresql+asyncpg://airos:airos_dev_password@localhost:5432/airos
REDIS_URL=redis://localhost:6379/0

# Celery
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2

# Kafka (optional)
KAFKA_BOOTSTRAP_SERVERS=localhost:9092

# Elasticsearch (optional)
ELASTICSEARCH_URL=http://localhost:9200

# Observability
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

---

## Contributing

1. Create a feature branch from `develop`
2. Make changes and add tests
3. Run `make pre-commit` (lint + typecheck + unit tests)
4. Submit a pull request to `main`

---

## License

Proprietary — Internal use only.
