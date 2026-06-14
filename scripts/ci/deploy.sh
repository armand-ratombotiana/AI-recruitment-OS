#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
error() { echo -e "${RED}[deploy]${NC} $*"; }
info() { echo -e "${BLUE}[deploy]${NC} $*"; }
step() { echo -e "${CYAN}[deploy]${NC} $*"; }

ENVIRONMENT="staging"
IMAGE_TAG="latest"
NAMESPACE=""
DRY_RUN=false
SKIP_HEALTH=false
HELM_TIMEOUT="10m"
HELM_VALUES=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --env|--environment) ENVIRONMENT="$2"; shift 2 ;;
        --tag) IMAGE_TAG="$2"; shift 2 ;;
        --namespace) NAMESPACE="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --skip-health) SKIP_HEALTH=true; shift ;;
        --timeout) HELM_TIMEOUT="$2"; shift 2 ;;
        --values) HELM_VALUES="$2"; shift 2 ;;
        --help)
            echo "Usage: $0 --env ENV --tag TAG [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --env ENV          Target: staging|production (default: staging)"
            echo "  --tag TAG          Docker image tag (default: latest)"
            echo "  --namespace NS     Kubernetes namespace (default: env name)"
            echo "  --dry-run          Helm dry run"
            echo "  --skip-health      Skip post-deploy health checks"
            echo "  --timeout DUR      Helm timeout (default: 10m)"
            echo "  --values FILE      Additional Helm values file"
            exit 0
            ;;
        *) error "Unknown option: $1"; exit 1 ;;
    esac
done

NAMESPACE="${NAMESPACE:-$ENVIRONMENT}"

cd "$PROJECT_ROOT"

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  AI-ROS CI/CD Deployment${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
info "Environment: $ENVIRONMENT"
info "Image Tag:   $IMAGE_TAG"
info "Namespace:   $NAMESPACE"
info "Dry Run:     $DRY_RUN"
echo ""

step "Step 1/5: Pre-deploy validation"

if [ ! -d "helm/airos" ]; then
    error "Helm chart not found at helm/airos"
    exit 1
fi

if ! command -v kubectl &> /dev/null; then
    error "kubectl not found"
    exit 1
fi

if ! command -v helm &> /dev/null; then
    error "helm not found"
    exit 1
fi

log "Pre-deploy validation passed"

step "Step 2/5: Cluster configuration"

CLUSTER_NAME="airos-${ENVIRONMENT}"
AWS_REGION="${AWS_REGION:-us-east-1}"

if [ "$DRY_RUN" = false ]; then
    info "Configuring kubectl for $CLUSTER_NAME..."
    aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION" 2>/dev/null || {
        warn "Could not configure kubectl (AWS CLI not configured or cluster not found)"
        warn "Continuing in dry-run compatible mode"
    }
else
    info "[DRY-RUN] Would configure kubectl for $CLUSTER_NAME"
fi

log "Cluster configuration complete"

step "Step 3/5: Helm deployment"

HELM_ARGS="upgrade --install airos ./helm/airos \
    --namespace $NAMESPACE --create-namespace \
    --set image.tag=${IMAGE_TAG} \
    --set imageFrontend.tag=${IMAGE_TAG} \
    --set environment=${ENVIRONMENT} \
    --timeout ${HELM_TIMEOUT}"

if [ "$DRY_RUN" = true ]; then
    HELM_ARGS="$HELM_ARGS --dry-run"
fi

if [ -n "$HELM_VALUES" ] && [ -f "$HELM_VALUES" ]; then
    HELM_ARGS="$HELM_ARGS --values $HELM_VALUES"
    info "Using additional values file: $HELM_VALUES"
fi

if [ "$ENVIRONMENT" = "production" ]; then
    HELM_ARGS="$HELM_ARGS --set autoscaling.minReplicas.api=5"
    info "Production mode: setting min API replicas to 5"
fi

info "Running: helm $HELM_ARGS"
eval "helm $HELM_ARGS" || {
    error "Helm deployment failed"
    exit 1
}

log "Helm deployment complete"

step "Step 4/5: Rollout verification"

if [ "$DRY_RUN" = false ] && [ "$SKIP_HEALTH" = false ]; then
    info "Waiting for API rollout..."
    kubectl rollout status deployment/airos-api -n "$NAMESPACE" --timeout=300s || {
        error "API rollout failed"
        exit 1
    }

    info "Waiting for frontend rollout..."
    kubectl rollout status deployment/airos-frontend -n "$NAMESPACE" --timeout=300s || {
        error "Frontend rollout failed"
        exit 1
    }

    info "Current pod status:"
    kubectl get pods -n "$NAMESPACE"
else
    info "[DRY-RUN] Would verify rollout"
fi

log "Rollout verification complete"

step "Step 5/5: Post-deploy health checks"

if [ "$DRY_RUN" = false ] && [ "$SKIP_HEALTH" = false ]; then
    if [ "$ENVIRONMENT" = "production" ]; then
        HEALTH_URL="https://ai-ros.com/health"
    else
        HEALTH_URL="https://staging.ai-ros.com/health"
    fi

    info "Running health checks against $HEALTH_URL..."
    HEALTHY=false
    for i in $(seq 1 30); do
        if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
            HEALTHY=true
            log "Health check passed (attempt $i)"
            break
        fi
        sleep 10
    done

    if [ "$HEALTHY" = false ]; then
        error "Health check failed after 30 attempts"
        error "Initiating rollback..."
        helm rollback airos -n "$NAMESPACE"
        exit 1
    fi
else
    info "[DRY-RUN] Would run health checks"
fi

echo ""
log "============================================"
log "  Deployment to $ENVIRONMENT complete!"
log "  Image: $IMAGE_TAG"
log "============================================"
echo ""
