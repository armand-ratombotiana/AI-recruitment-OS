#!/bin/bash
# =============================================================================
# AI-ROS — Local Development Bootstrap Script
# =============================================================================
set -euo pipefail

echo "🚀 Bootstrapping AI-ROS development environment..."

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "Docker is required. Install it first."; exit 1; }
command -v docker-compose >/dev/null 2>&1 || COMPOSE_CMD="docker compose" || COMPOSE_CMD="docker-compose"
command -v node >/dev/null 2>&1 || { echo "Node.js is required."; exit 1; }
command -v python >/dev/null 2>&1 || { echo "Python is required."; exit 1; }

# Copy env file
cp -n .env.example .env 2>/dev/null || true
echo "✅ Environment file ready"

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend && npm install && cd ..

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend && pip install -r requirements/requirements.txt && cd ..

# Start infrastructure services
echo "🐳 Starting infrastructure services..."
$COMPOSE_CMD up -d postgres redis kafka elasticsearch minio

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Run migrations
echo "🔄 Running database migrations..."
cd backend && alembic upgrade head && cd ..

# Seed database
echo "🌱 Seeding database..."
cd backend && python -m scripts.seed 2>/dev/null || echo "Seed script not found, skipping..."

echo ""
echo "✅ AI-ROS development environment is ready!"
echo ""
echo "Commands:"
echo "  make dev         — Start all services with hot reload"
echo "  make test        — Run all tests"
echo "  make lint        — Lint all code"
echo "  make migrate     — Run migrations"
echo "  make db-shell    — Open PostgreSQL shell"
echo "  make logs        — Tail all logs"
echo ""
echo "URLs:"
echo "  Frontend:    http://localhost:3000"
echo "  API:         http://localhost:8000"
echo "  API Docs:    http://localhost:8000/docs"
echo "  Grafana:     http://localhost:3001"
echo "  Jaeger:      http://localhost:16686"
echo "  MinIO:       http://localhost:9001"
