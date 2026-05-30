#!/bin/bash
# AI-ROS Complete Docker Test
set -e

echo "============================================"
echo "  AI-ROS Docker Test"
echo "============================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass=0
fail=0

check() {
    if eval "$2" > /dev/null 2>&1; then
        echo -e "${GREEN}[OK]${NC} $1"
        ((pass++))
    else
        echo -e "${RED}[FAIL]${NC} $1"
        ((fail++))
    fi
}

echo "Starting services..."
docker compose up -d

echo "Waiting for services to be ready..."
sleep 15

echo ""
echo "Checking services..."
echo ""

# Infrastructure
check "PostgreSQL" "docker exec airos-postgres pg_isready -U airos"
check "Redis" "docker exec airos-redis redis-cli ping"

# Application
check "Backend API" "curl -s http://localhost:8000/health"
check "API Docs" "curl -s http://localhost:8000/docs"
check "Frontend" "curl -s http://localhost:3000"

# Monitoring
check "Prometheus" "curl -s http://localhost:9090/-/healthy"
check "Grafana" "curl -s http://localhost:3001/api/health"
check "Jaeger" "curl -s http://localhost:16686/"
check "Alertmanager" "curl -s http://localhost:9093/-/healthy"

echo ""
echo "Checking API endpoints..."
echo ""

check "GET /api/v1/candidates/" "curl -s http://localhost:8000/api/v1/candidates/ | grep -q data"
check "GET /api/v1/jobs/" "curl -s http://localhost:8000/api/v1/jobs/ | grep -q data"
check "GET /api/v1/interviews/" "curl -s http://localhost:8000/api/v1/interviews/ | grep -q data"
check "GET /api/v1/analytics/dashboard" "curl -s http://localhost:8000/api/v1/analytics/dashboard | grep -q metrics"
check "GET /api/v1/ai/agents" "curl -s http://localhost:8000/api/v1/ai/agents | grep -q data"
check "GET /api/v1/workflows/" "curl -s http://localhost:8000/api/v1/workflows/ | grep -q data"

echo ""
echo "============================================"
echo "Results: $pass passed, $fail failed"
echo "============================================"

if [ $fail -gt 0 ]; then
    exit 1
fi