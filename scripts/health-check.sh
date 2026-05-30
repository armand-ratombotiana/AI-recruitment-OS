#!/bin/bash
# AI-ROS Health Check
echo "Health Check..."

services=(
    "Backend:http://localhost:8000/health"
    "Frontend:http://localhost:3000"
    "Grafana:http://localhost:3001/api/health"
    "Jaeger:http://localhost:16686/"
    "Prometheus:http://localhost:9090/-/healthy"
)

for service in "${services[@]}"; do
    name="${service%%:*}"
    url="${service##*:}"
    if curl -s "$url" > /dev/null 2>&1; then
        echo "[OK] $name"
    else
        echo "[FAIL] $name"
    fi
done