#!/bin/bash
# AI-ROS Monitoring Script
echo "============================================"
echo "  AI-ROS Monitoring Dashboard"
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

echo "Checking Docker containers..."
echo ""

# Check containers
check "PostgreSQL" "docker ps | grep -q airos-postgres"
check "Redis" "docker ps | grep -q airos-redis"
check "API" "docker ps | grep -q airos-api"
check "Frontend" "docker ps | grep -q airos-frontend"
check "Prometheus" "docker ps | grep -q airos-prometheus"
check "Grafana" "docker ps | grep -q airos-grafana"
check "Jaeger" "docker ps | grep -q airos-jaeger"
check "Alertmanager" "docker ps | grep -q airos-alertmanager"

echo ""
echo "Checking services..."
echo ""

check "Backend API" "curl -s http://localhost:8000/health"
check "API Docs" "curl -s http://localhost:8000/docs"
check "Frontend" "curl -s http://localhost:3000"
check "Grafana" "curl -s http://localhost:3001/api/health"
check "Jaeger" "curl -s http://localhost:16686/"
check "Prometheus" "curl -s http://localhost:9090/-/healthy"
check "Alertmanager" "curl -s http://localhost:9093/-/healthy"

echo ""
echo "Checking API endpoints..."
echo ""

check "Candidates" "curl -s http://localhost:8000/api/v1/candidates/ | grep -q data"
check "Jobs" "curl -s http://localhost:8000/api/v1/jobs/ | grep -q data"
check "Interviews" "curl -s http://localhost:8000/api/v1/interviews/ | grep -q data"
check "Analytics" "curl -s http://localhost:8000/api/v1/analytics/dashboard | grep -q metrics"
check "AI Agents" "curl -s http://localhost:8000/api/v1/ai/agents | grep -q data"
check "Workflows" "curl -s http://localhost:8000/api/v1/workflows/ | grep -q data"

echo ""
echo "============================================"
echo "  Monitoring Complete"
echo "============================================"