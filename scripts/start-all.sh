#!/bin/bash
echo "Starting AI-Native Recruitment OS..."
docker compose up -d
echo "Waiting for services..."
sleep 10
echo ""
echo "Services started!"
echo "  Frontend: http://localhost:3000"
echo "  API: http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo "  Grafana: http://localhost:3001"
echo "  Jaeger: http://localhost:16686"
echo "  Prometheus: http://localhost:9090"
echo "  Alertmanager: http://localhost:9093"
