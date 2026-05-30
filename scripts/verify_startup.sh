#!/bin/bash
echo "Verifying AI-ROS startup..."
echo ""

echo "=== Checking Python version ==="
python --version
echo ""

echo "=== Checking pip packages ==="
pip list | grep -E "fastapi|uvicorn|pydantic|sqlalchemy"
echo ""

echo "=== Testing imports ==="
cd backend && python -c "
import sys
sys.path.insert(0, '.')
from main import app
print(f'App title: {app.title}')
print(f'Routes: {len(app.routes)}')
print('Backend loads successfully!')
"
echo ""

echo "=== Testing frontend ==="
cd ../frontend && npm run build 2>&1 | tail -5
echo ""

echo "=== Verification complete ==="
