#!/bin/bash
# AI-ROS Comprehensive Verification Script
echo "============================================"
echo "  AI-ROS Comprehensive Verification"
echo "============================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
    if eval "$2" > /dev/null 2>&1; then
        echo -e "${GREEN}[OK]${NC} $1"
        return 0
    else
        echo -e "${RED}[FAIL]${NC} $1"
        return 1
    fi
}

echo "Checking services..."
echo ""

# Backend
check "Backend API" "curl -s http://localhost:8000/health"
check "API Docs" "curl -s http://localhost:8000/docs"
check "API ReDoc" "curl -s http://localhost:8000/redoc"

# Frontend
check "Frontend" "curl -s http://localhost:3000"

# Monitoring
check "Grafana" "curl -s http://localhost:3001"
check "Jaeger" "curl -s http://localhost:16686"
check "Prometheus" "curl -s http://localhost:9090"
check "Alertmanager" "curl -s http://localhost:9093"

# Docker
check "PostgreSQL" "docker exec airos-postgres pg_isready -U airos"
check "Redis" "docker exec airos-redis redis-cli ping"

echo ""
echo "Checking API endpoints..."
echo ""

# API Endpoints
check "GET /api/v1/candidates/" "curl -s http://localhost:8000/api/v1/candidates/ | grep -q data"
check "GET /api/v1/jobs/" "curl -s http://localhost:8000/api/v1/jobs/ | grep -q data"
check "GET /api/v1/interviews/" "curl -s http://localhost:8000/api/v1/interviews/ | grep -q data"
check "GET /api/v1/analytics/dashboard" "curl -s http://localhost:8000/api/v1/analytics/dashboard | grep -q metrics"
check "GET /api/v1/ai/agents" "curl -s http://localhost:8000/api/v1/ai/agents | grep -q data"
check "GET /api/v1/workflows/" "curl -s http://localhost:8000/api/v1/workflows/ | grep -q data"

echo ""
echo "============================================"
echo "  Verification Complete"
echo "============================================"
