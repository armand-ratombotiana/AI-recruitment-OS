#!/bin/bash
# =============================================================================
# AI-ROS — Complete Rebuild and Monitor Script
# =============================================================================

echo "============================================"
echo "  AI-ROS Complete Rebuild & Monitor"
echo "============================================"
echo ""

# Step 1: Clean up
echo "[1/6] Cleaning up existing containers..."
docker compose down --remove-orphans 2>/dev/null || true
docker system prune -f 2>/dev/null || true
echo "  Done!"
echo ""

# Step 2: Build backend
echo "[2/6] Building backend image..."
docker compose build --no-cache api
echo "  Backend built!"
echo ""

# Step 3: Build frontend
echo "[3/6] Building frontend image..."
docker compose build --no-cache frontend
echo "  Frontend built!"
echo ""

# Step 4: Start all services
echo "[4/6] Starting all services..."
docker compose up -d
echo "  All services started!"
echo ""

# Step 5: Wait for services
echo "[5/6] Waiting for services to be ready..."
sleep 20
echo "  Done!"
echo ""

# Step 6: Verify
echo "[6/6] Verifying services..."
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

check() {
    if eval "$2" > /dev/null 2>&1; then
        echo -e "${GREEN}[OK]${NC} $1"
    else
        echo -e "${RED}[FAIL]${NC} $1"
    fi
}

echo "=== Container Status ==="
docker compose ps --format "table {{.Name}}\t{{.Status}}"
echo ""

echo "=== Health Checks ==="
check "PostgreSQL" "docker exec airos-postgres pg_isready -U airos"
check "Redis" "docker exec airos-redis redis-cli ping"
check "API Health" "curl -s http://localhost:8000/health | grep -q healthy"
check "API Docs" "curl -s http://localhost:8000/docs | grep -q swagger"
check "Frontend" "curl -s http://localhost:3000 | grep -q AI-ROS"
check "Prometheus" "curl -s http://localhost:9090/-/healthy"
check "Grafana" "curl -s http://localhost:3001/api/health | grep -q ok"
check "Jaeger" "curl -s http://localhost:16686/ | grep -q Jaeger"
check "Alertmanager" "curl -s http://localhost:9093/-/healthy"

echo ""
echo "=== API Endpoints ==="
check "Candidates" "curl -s http://localhost:8000/api/v1/candidates/ | grep -q data"
check "Jobs" "curl -s http://localhost:8000/api/v1/jobs/ | grep -q data"
check "Interviews" "curl -s http://localhost:8000/api/v1/interviews/ | grep -q data"
check "Analytics" "curl -s http://localhost:8000/api/v1/analytics/dashboard | grep -q metrics"
check "AI Agents" "curl -s http://localhost:8000/api/v1/ai/agents | grep -q data"
check "Workflows" "curl -s http://localhost:8000/api/v1/workflows/ | grep -q data"

echo ""
echo "============================================"
echo "  Rebuild & Monitor Complete!"
echo "============================================"
echo ""
echo "  Frontend:    http://localhost:3000"
echo "  API:         http://localhost:8000"
echo "  API Docs:    http://localhost:8000/docs"
echo "  Grafana:     http://localhost:3001 (admin/admin)"
echo "  Jaeger:      http://localhost:16686"
echo "  Prometheus:  http://localhost:9090"
echo ""
