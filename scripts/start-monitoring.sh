#!/bin/bash
echo "Starting AI-ROS with Monitoring..."
docker-compose up -d postgres redis prometheus grafana jaeger alertmanager
echo ""
echo "Monitoring services started:"
echo "  Prometheus: http://localhost:9090"
echo "  Grafana: http://localhost:3001 (admin/admin)"
echo "  Jaeger: http://localhost:16686"
echo "  Alertmanager: http://localhost:9093"
