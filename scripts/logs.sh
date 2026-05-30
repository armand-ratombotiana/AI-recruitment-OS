#!/bin/bash
# AI-ROS Logs
echo "Viewing logs..."
echo ""

if [ "$1" = "" ]; then
    docker compose logs -f
else
    docker compose logs -f "$1"
fi