.PHONY: help dev prod up down logs test lint format build clean bootstrap deploy check docs

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

bootstrap: ## Initial project setup (env, deps, infra)
	@echo "=== Bootstrapping AI-ROS ==="
	cp -n .env.example .env 2>/dev/null || true
	cd frontend && npm install
	cd backend && pip install -r requirements.txt
	docker compose up -d postgres redis
	@echo "=== Bootstrap complete ==="

dev: ## Start development environment
	docker compose up -d postgres redis prometheus grafana jaeger
	@echo "Infrastructure started. Run 'make dev-api' and 'make dev-frontend' in separate terminals."

dev-api: ## Start API dev server locally
	cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000

dev-frontend: ## Start frontend dev server locally
	cd frontend && npm run dev

prod: ## Start production environment
	docker compose -f docker-compose.prod.yml up -d
	@echo "Production services started"

up: ## Start all services (docker compose up)
	docker compose up -d

down: ## Stop all services
	docker compose down

down-clean: ## Stop all services and remove volumes
	docker compose down -v

logs: ## Tail logs from all services
	docker compose logs -f

logs-api: ## Tail API logs
	docker compose logs -f api

logs-frontend: ## Tail frontend logs
	docker compose logs -f frontend

test: ## Run all tests
	cd backend && python -m pytest tests/ -v --tb=short

test-cov: ## Run tests with coverage
	cd backend && python -m pytest tests/ -v --cov=. --cov-report=term-missing

test-frontend: ## Run frontend tests
	cd frontend && npm run lint

lint: ## Run linting on all code
	cd backend && ruff check .
	cd frontend && npm run lint

lint-fix: ## Auto-fix linting issues
	cd backend && ruff check --fix .
	cd frontend && npm run lint -- --fix

format: ## Format all code
	cd backend && ruff format .
	cd frontend && npx prettier --write "src/**/*.{ts,tsx,js,jsx,json,css}"

typecheck: ## Run type checking
	cd backend && mypy . --ignore-missing-imports

build: ## Build all Docker images
	docker compose build

build-no-cache: ## Build all Docker images (no cache)
	docker compose build --no-cache

check: ## Run infrastructure health checks
	python scripts/monitor.py --backend http://localhost:8000 --frontend http://localhost:3000

check-json: ## Run health checks with JSON output
	python scripts/monitor.py --json --backend http://localhost:8000 --frontend http://localhost:3000

check-continuous: ## Run continuous monitoring
	python scripts/monitor.py --continuous --interval 60

deploy: ## Deploy to production
	./scripts/deploy.sh --env prod

deploy-dev: ## Deploy to development
	./scripts/deploy.sh --env dev

deploy-dry-run: ## Dry run deployment
	./scripts/deploy.sh --env prod --dry-run

clean: ## Remove all containers, networks, and volumes
	docker compose down -v --remove-orphans
	docker system prune -f
	rm -rf backend/__pycache__ frontend/.next
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

clean-all: ## Remove everything including images
	docker compose down -v --rmi all --remove-orphans
	docker system prune -af
	rm -rf backend/__pycache__ frontend/.next logs/

db-upgrade: ## Run database migrations
	cd backend && alembic upgrade head

db-downgrade: ## Rollback last migration
	cd backend && alembic downgrade -1

db-revision: ## Create new migration (usage: make db-revision MSG="description")
	cd backend && alembic revision --autogenerate -m "$(MSG)"

status: ## Show running container status
	docker compose ps

stats: ## Show container resource usage
	docker stats --no-stream

docs: ## Open documentation
	@echo "Documentation files:"
	@echo "  docs/DOCKER.md          - Docker architecture & troubleshooting"
	@echo "  docs/API_ENDPOINTS.md   - Complete API endpoint reference"
	@echo "  README.md               - Project overview"

monitor: ## Run health checks against all services
	python scripts/monitor.py --backend http://localhost:8000 --frontend http://localhost:3000

monitor-continuous: ## Run continuous health monitoring
	python scripts/monitor.py --continuous --interval 60

monitor-json: ## Run health checks with JSON output
	python scripts/monitor.py --json --backend http://localhost:8000 --frontend http://localhost:3000

grafana: ## Open Grafana dashboard
	@echo "Grafana: http://localhost:3001 (admin / admin)"

prometheus: ## Open Prometheus UI
	@echo "Prometheus: http://localhost:9090"

jaeger: ## Open Jaeger UI
	@echo "Jaeger: http://localhost:16686"
