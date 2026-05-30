#!/bin/bash
# Run All AI-ROS Tests
echo "============================================"
echo "  AI-ROS Test Suite"
echo "============================================"
echo ""

echo "Running unit tests..."
cd backend && python tests/test_all.py

echo ""
echo "Running security tests..."
python tests/test_security.py

echo ""
echo "Running AI tests..."
python tests/test_ai.py

echo ""
echo "Running event tests..."
python tests/test_events.py

echo ""
echo "Running utility tests..."
python tests/test_utils.py

echo ""
echo "Running Docker tests..."
cd .. && python tests/test_docker.py

echo ""
echo "Running API tests..."
python tests/test_api_full.py

echo ""
echo "============================================"
echo "  All tests complete!"
echo "============================================"
