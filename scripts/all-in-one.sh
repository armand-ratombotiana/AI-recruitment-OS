#!/bin/bash
# AI-ROS All-in-One Startup
set -e

echo "=========================================="
echo "  AI-Native Recruitment OS"
echo "  All-in-One Startup"
echo "=========================================="
echo ""

# Step 1: Start Docker services
echo "[1/4] Starting Docker services..."
docker compose up -d postgres redis prometheus grafana jaeger alertmanager
echo "  Done!"
echo ""

# Step 2: Wait for PostgreSQL
echo "[2/4] Waiting for PostgreSQL..."
sleep 5
for i in {1..30}; do
    if docker exec airos-postgres pg_isready -U airos > /dev/null 2>&1; then
        echo "  PostgreSQL is ready!"
        break
    fi
    sleep 1
done
echo ""

# Step 3: Start Backend
echo "[3/4] Starting Backend API..."
cd backend
pip install -r requirements.txt -q 2>/dev/null
python -m uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..
echo "  Backend PID: $BACKEND_PID"
echo ""

# Step 4: Start Frontend
echo "[4/4] Starting Frontend..."
cd frontend
npm install --silent 2>/dev/null
npm run dev &
FRONTEND_PID=$!
cd ..
echo "  Frontend PID: $FRONTEND_PID"
echo ""

# Wait for services
sleep 5

echo ""
echo "=========================================="
echo "  ALL SERVICES STARTED!"
echo "=========================================="
echo ""
echo "  Frontend:     http://localhost:3000"
echo "  API:          http://localhost:8000"
echo "  API Docs:     http://localhost:8000/docs"
echo "  Grafana:      http://localhost:3001"
echo "  Jaeger:       http://localhost:16686"
echo "  Prometheus:   http://localhost:9090"
echo "  Alertmanager: http://localhost:9093"
echo ""
echo "  Press Ctrl+C to stop all services"
echo ""

# Trap to cleanup
trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; docker compose down; exit 0" INT TERM

wait
