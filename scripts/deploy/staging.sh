#!/bin/bash
# =============================================================================
# AI-ROS — Staging Deployment Script
# =============================================================================
set -euo pipefail

echo "🚀 Deploying AI-ROS to staging..."

# Build images
echo "📦 Building Docker images..."
docker build -f docker/backend/Dockerfile -t airos-api:latest ./backend
docker build -f docker/frontend/Dockerfile -t airos-frontend:latest ./frontend

# Push to ECR
echo "📤 Pushing to ECR..."
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
docker tag airos-api:latest $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/airos-api:$GITHUB_SHA
docker tag airos-frontend:latest $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/airos-frontend:$GITHUB_SHA
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/airos-api:$GITHUB_SHA
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/airos-frontend:$GITHUB_SHA

# Deploy with Helm
echo "⎈ Deploying to Kubernetes..."
helm upgrade --install airos ./infrastructure/helm/airos \
  --namespace staging \
  --set image.tag=$GITHUB_SHA \
  --set image.repository=$ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/airos

echo "✅ Staging deployment complete!"
