#!/bin/bash
# =============================================================================
# AI-ROS — Comprehensive Docker Test Script
# =============================================================================
# Tests all Docker services end-to-end

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

log_ok() { echo -e "${GREEN}[OK]${NC} $1"; PASS=$((PASS + 1)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; FAIL=$((FAIL + 1)); }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; WARN=$((WARN + 1)); }
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }

echo ""
echo "=========================================="
echo "  AI-ROS Docker Comprehensive Test"
echo "=========================================="
echo ""

# -------------------------------------------------------
# Phase 1: Build & Start
# -------------------------------------------------------
log_info "Phase 1: Building and starting services..."
echo ""

docker compose down -v 2>/dev/null || true
docker compose build --no-cache 2>&1 | tail -5

echo ""
log_info "Starting services..."
docker compose up -d

# -------------------------------------------------------
# Phase 2: Wait for all services
# -------------------------------------------------------
echo ""
log_info "Phase 2: Waiting for services to become healthy..."
echo ""

MAX_WAIT=120
INTERVAL=5
ELAPSED=0

wait_for_health() {
    local service=$1
    local url=$2
    local start_time=$(date +%s)

    while true; do
        local elapsed=$(( $(date +%s) - start_time ))
        if [ $elapsed -ge $MAX_WAIT ]; then
            log_fail "$service did not become healthy within ${MAX_WAIT}s"
            return 1
        fi

        if curl -sf "$url" > /dev/null 2>&1; then
            log_ok "$service is healthy (${elapsed}s)"
            return 0
        fi

        sleep $INTERVAL
    done
}

wait_for_health "PostgreSQL" "http://localhost:5432" || true
sleep 2

docker exec airos-postgres pg_isready -U airos > /dev/null 2>&1 && log_ok "PostgreSQL is ready" || log_fail "PostgreSQL not ready"
docker exec airos-redis redis-cli ping > /dev/null 2>&1 && log_ok "Redis is ready" || log_fail "Redis not ready"

wait_for_health "Prometheus" "http://localhost:9090/-/healthy"
wait_for_health "Alertmanager" "http://localhost:9093/-/healthy"
wait_for_health "Grafana" "http://localhost:3001/api/health"
wait_for_health "Jaeger" "http://localhost:16686/"
wait_for_health "API" "http://localhost:8000/health"
wait_for_health "Frontend" "http://localhost:3000"

# -------------------------------------------------------
# Phase 3: Test Endpoints
# -------------------------------------------------------
echo ""
log_info "Phase 3: Testing endpoints..."
echo ""

# API Health
RESP=$(curl -sf http://localhost:8000/health 2>/dev/null)
if echo "$RESP" | grep -q "healthy"; then
    log_ok "API health check returns healthy"
else
    log_fail "API health check failed"
fi

# API Root
RESP=$(curl -sf http://localhost:8000/ 2>/dev/null)
if echo "$RESP" | grep -q "AI-Native Recruitment"; then
    log_ok "API root page returns content"
else
    log_fail "API root page failed"
fi

# API Docs
RESP=$(curl -sf http://localhost:8000/docs 2>/dev/null)
if echo "$RESP" | grep -q "swagger"; then
    log_ok "API docs (Swagger) accessible"
else
    log_fail "API docs not accessible"
fi

# Frontend
RESP=$(curl -sf http://localhost:3000/ 2>/dev/null)
if [ -n "$RESP" ]; then
    log_ok "Frontend is serving content"
else
    log_fail "Frontend is not serving content"
fi

# Prometheus
RESP=$(curl -sf http://localhost:9090/api/v1/targets 2>/dev/null)
if echo "$RESP" | grep -q "airos-api"; then
    log_ok "Prometheus has scrape targets configured"
else
    log_warn "Prometheus scrape targets not visible (may need time)"
fi

# Grafana Datasource
RESP=$(curl -sf -u admin:admin http://localhost:3001/api/datasources 2>/dev/null)
if echo "$RESP" | grep -q "Prometheus"; then
    log_ok "Grafana has Prometheus datasource"
else
    log_fail "Grafana missing Prometheus datasource"
fi

# Grafana Dashboards
RESP=$(curl -sf -u admin:admin http://localhost:3001/api/search 2>/dev/null)
if echo "$RESP" | grep -q "AI-ROS"; then
    log_ok "Grafana has AI-ROS dashboard"
else
    log_warn "Grafana dashboard not loaded yet (may need refresh)"
fi

# Jaeger Services
RESP=$(curl -sf http://localhost:16686/api/services 2>/dev/null)
if echo "$RESP" | grep -q "data"; then
    log_ok "Jaeger is accepting traces"
else
    log_warn "Jaeger has no traces yet (expected for fresh start)"
fi

# PostgreSQL Extensions
docker exec airos-postgres psql -U airos -d airos -c "SELECT extname FROM pg_extension WHERE extname = 'vector'" 2>/dev/null | grep -q "vector" && log_ok "pgvector extension installed" || log_warn "pgvector extension check failed"

# -------------------------------------------------------
# Phase 4: Verify Monitoring Configuration
# -------------------------------------------------------
echo ""
log_info "Phase 4: Verifying monitoring configuration..."
echo ""

# Prometheus config
if curl -sf http://localhost:9090/api/v1/status/config > /dev/null 2>&1; then
    log_ok "Prometheus config is loaded"
else
    log_fail "Prometheus config not accessible"
fi

# Alert rules
RULES=$(curl -sf http://localhost:9090/api/v1/rules 2>/dev/null)
if echo "$RULES" | grep -q "HighErrorRate"; then
    log_ok "Alert rules are loaded"
else
    log_warn "Alert rules not visible (may need reload)"
fi

# Alertmanager config
AM_CONFIG=$(curl -sf http://localhost:9093/api/v2/status 2>/dev/null)
if [ -n "$AM_CONFIG" ]; then
    log_ok "Alertmanager is responding"
else
    log_fail "Alertmanager not responding"
fi

# -------------------------------------------------------
# Phase 5: Docker Container Health
# -------------------------------------------------------
echo ""
log_info "Phase 5: Checking container health..."
echo ""

for container in airos-postgres airos-redis airos-api airos-frontend airos-prometheus airos-grafana airos-jaeger airos-alertmanager; do
    STATUS=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "not found")
    if [ "$STATUS" = "running" ]; then
        log_ok "$container is running"
    else
        log_fail "$container is $STATUS"
    fi
done

# -------------------------------------------------------
# Phase 6: Port Checks
# -------------------------------------------------------
echo ""
log_info "Phase 6: Verifying port accessibility..."
echo ""

check_port() {
    local port=$1
    local name=$2
    if curl -sf --connect-timeout 2 "http://localhost:$port" > /dev/null 2>&1 || \
       nc -z localhost $port 2>/dev/null; then
        log_ok "Port $port ($name) is accessible"
    else
        log_fail "Port $port ($name) is not accessible"
    fi
}

check_port 5432 "PostgreSQL"
check_port 6379 "Redis"
check_port 8000 "API"
check_port 3000 "Frontend"
check_port 9090 "Prometheus"
check_port 3001 "Grafana"
check_port 16686 "Jaeger"
check_port 9093 "Alertmanager"
check_port 4317 "OTLP gRPC"

# -------------------------------------------------------
# Summary
# -------------------------------------------------------
echo ""
echo "=========================================="
echo "  Test Results Summary"
echo "=========================================="
echo ""
echo -e "  ${GREEN}Passed: $PASS${NC}"
echo -e "  ${RED}Failed: $FAIL${NC}"
echo -e "  ${YELLOW}Warnings: $WARN${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}All critical tests passed!${NC}"
    echo ""
    echo "  Services are running at:"
    echo "    Frontend:     http://localhost:3000"
    echo "    API:          http://localhost:8000"
    echo "    API Docs:     http://localhost:8000/docs"
    echo "    Grafana:      http://localhost:3001 (admin/admin)"
    echo "    Jaeger:       http://localhost:16686"
    echo "    Prometheus:   http://localhost:9090"
    echo "    Alertmanager: http://localhost:9093"
    echo ""
    exit 0
else
    echo -e "${RED}Some tests failed. Check the output above.${NC}"
    echo ""
    exit 1
fi
