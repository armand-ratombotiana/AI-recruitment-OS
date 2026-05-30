#!/bin/bash
# AI-ROS Startup Script
set -e

echo "Starting AI-Native Recruitment OS..."

# Check Docker
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running. Please start Docker Desktop."
    exit 1
fi

# Copy env
cp -n .env .env.backup 2>/dev/null || true

echo "Starting infrastructure..."
docker compose up -d postgres redis prometheus grafana jaeger alertmanager

echo "Waiting for PostgreSQL..."
sleep 5

echo ""
echo "=========================================="
echo "  AI-Native Recruitment OS"
echo "=========================================="
echo ""
echo "  Infrastructure is running!"
echo ""
echo "  PostgreSQL:  localhost:5432"
echo "  Redis:       localhost:6379"
echo "  Prometheus:  http://localhost:9090"
echo "  Grafana:     http://localhost:3001 (admin/admin)"
echo "  Jaeger:      http://localhost:16686"
echo "  Alertmanager: http://localhost:9093"
echo ""
echo "To start the API:"
echo "  cd backend && pip install -r requirements.txt && python -m uvicorn main:app --reload"
echo ""
echo "To start the Frontend:"
echo "  cd frontend && npm install && npm run dev"
echo ""
echo "Or start everything with Docker:"
echo "  docker compose up"
echo ""
