#!/bin/bash
# Test Frontend Build
echo "Testing Frontend Build..."
cd frontend

echo "Installing dependencies..."
npm install --silent 2>/dev/null

echo "Building..."
npm run build

if [ $? -eq 0 ]; then
    echo "[OK] Frontend builds successfully"
else
    echo "[FAIL] Frontend build failed"
    exit 1
fi
