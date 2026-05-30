#!/bin/bash
echo "Running all tests..."
echo ""

echo "=== Unit Tests ==="
cd backend && python tests/test_all.py

echo ""
echo "=== Security Tests ==="
python tests/test_security.py

echo ""
echo "=== AI Tests ==="
python tests/test_ai.py

echo ""
echo "=== Event Tests ==="
python tests/test_events.py

echo ""
echo "=== Utility Tests ==="
python tests/test_utils.py

echo ""
echo "=== API Tests ==="
cd .. && python tests/test_api_integration.py

echo ""
echo "All tests complete!"
