#!/bin/bash
# =============================================================================
# AI-ROS — Full Setup Script
# =============================================================================
set -e

echo "Setting up AI-Native Recruitment OS..."

# Copy env
cp -n .env.example .env 2>/dev/null || true

# Install Python dependencies
echo "Installing Python dependencies..."
cd backend
pip install -r requirements.txt
cd ..

# Install Node.js dependencies
echo "Installing frontend dependencies..."
cd frontend
npm install
cd ..

echo "Setup complete! Run './scripts/start.sh' to start the platform."