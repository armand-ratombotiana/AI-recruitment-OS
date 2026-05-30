#!/bin/bash
echo "AI-ROS Verification"
echo ""
check() { if eval "$2" > /dev/null 2>&1; then echo "[OK] $1"; else echo "[FAIL] $1"; fi; }
check "Backend API" "curl -s http://localhost:8000/health"
check "API Docs" "curl -s http://localhost:8000/docs"
check "Frontend" "curl -s http://localhost:3000"
check "Prometheus" "curl -s http://localhost:9090/-/healthy"
check "Grafana" "curl -s http://localhost:3001/api/health"
check "Jaeger" "curl -s http://localhost:16686/"
check "Alertmanager" "curl -s http://localhost:9093/-/healthy"
echo ""
echo "Done!"
