#!/bin/bash
echo "AI-ROS Monitoring Status"
echo ""

echo "Prometheus Targets:"
curl -s http://localhost:9090/api/v1/targets | python -m json.tool 2>/dev/null | head -20

echo ""
echo "Grafana Datasources:"
curl -s -u admin:admin http://localhost:3001/api/datasources 2>/dev/null | python -m json.tool 2>/dev/null | head -10

echo ""
echo "Jaeger Services:"
curl -s http://localhost:16686/api/services 2>/dev/null | python -m json.tool 2>/dev/null | head -10