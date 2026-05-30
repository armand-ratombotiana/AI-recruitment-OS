.PHONY: help dev up down logs test lint format build clean bootstrap

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

bootstrap:
	cp -n .env.example .env 2>/dev/null || true
	cd frontend && npm install
	cd backend && pip install -r requirements.txt
	docker compose up -d postgres redis

dev:
	docker compose up -d postgres redis prometheus grafana jaeger

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

test:
	cd backend && python -m pytest tests/ -v

lint:
	cd backend && ruff check .
	cd frontend && npm run lint

format:
	cd backend && ruff format .
	cd frontend && npm run format

build:
	docker compose build

clean:
	docker compose down -v
	rm -rf backend/__pycache__ frontend/.next
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
