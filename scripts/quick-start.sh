#!/bin/bash
# AI-ROS Quick Start
echo "Starting AI-Native Recruitment OS..."

# Start Docker services
docker compose up -d postgres redis

echo "Waiting for PostgreSQL..."
sleep 5

echo ""
echo "Infrastructure is ready!"
echo ""
echo "To start the API:"
echo "  cd backend && pip install -r requirements.txt && python run.py"
echo ""
echo "To start the Frontend:"
echo "  cd frontend && npm install && npm run dev"
echo ""
