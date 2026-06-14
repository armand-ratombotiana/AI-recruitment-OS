#!/usr/bin/env bash
# =============================================================================
# AI-ROS Kubernetes Deployment Script
# =============================================================================
#
# Usage:
#   ./scripts/deploy-k8s.sh [COMMAND] [OPTIONS]
#
# Commands:
#   deploy        Deploy AI-ROS to Kubernetes
#   rollback      Rollback to previous revision
#   health        Run health checks
#   status        Show deployment status
#   logs          Tail logs from all components
#   clean         Remove all AI-ROS resources
#
# Options:
#   --env ENV           Environment: staging, prod (default: staging)
#   --namespace NS      Kubernetes namespace (default: airos)
#   --tag TAG           Image tag to deploy (default: latest)
#   --dry-run           Show what would be done without executing
#   --help              Show this help message
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HELM_CHART="$PROJECT_ROOT/helm/airos"
K8S_MANIFESTS="$PROJECT_ROOT/k8s"

ENVIRONMENT="staging"
NAMESPACE="airos"
RELEASE_NAME="airos"
IMAGE_TAG="latest"
DRY_RUN=false
HELM_TIMEOUT="600s"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $*"; }
info() { echo -e "${CYAN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }

die() { error "$1"; exit 1; }

run_cmd() {
    if [ "$DRY_RUN" = true ]; then
        info "[DRY-RUN] $*"
        return 0
    fi
    eval "$@"
}

usage() {
    head -25 "$0" | tail -18
    exit 0
}

check_prerequisites() {
    local missing=()
    command -v kubectl >/dev/null 2>&1 || missing+=("kubectl")
    command -v helm >/dev/null 2>&1 || missing+=("helm")

    if [ ${#missing[@]} -gt 0 ]; then
        die "Missing required tools: ${missing[*]}"
    fi

    if ! kubectl cluster-info >/dev/null 2>&1; then
        die "Cannot connect to Kubernetes cluster"
    fi

    success "Prerequisites verified"
}

get_values_file() {
    case $ENVIRONMENT in
        staging)
            echo "$HELM_CHART/values-staging.yaml"
            ;;
        prod|production)
            echo "$HELM_CHART/values-prod.yaml"
            ;;
        *)
            die "Unknown environment: $ENVIRONMENT (use: staging, prod)"
            ;;
    esac
}

# =============================================================================
# DEPLOY
# =============================================================================
cmd_deploy() {
    log "Deploying AI-ROS to ${ENVIRONMENT}..."

    check_prerequisites

    local values_file
    values_file="$(get_values_file)"

    if [ ! -f "$values_file" ]; then
        die "Values file not found: $values_file"
    fi

    info "Environment:  $ENVIRONMENT"
    info "Namespace:    $NAMESPACE"
    info "Values file:  $values_file"
    info "Image tag:    $IMAGE_TAG"

    run_cmd "kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -"

    local helm_args=(
        "upgrade" "--install" "$RELEASE_NAME" "$HELM_CHART"
        "--namespace" "$NAMESPACE"
        "--values" "$values_file"
        "--set" "image.tag=$IMAGE_TAG"
        "--timeout" "$HELM_TIMEOUT"
        "--wait"
    )

    if [ "$DRY_RUN" = true ]; then
        helm_args+=("--dry-run")
    fi

    run_cmd "helm ${helm_args[*]}"

    success "Deployment initiated"
    info "Running post-deploy health checks..."
    cmd_health
}

# =============================================================================
# ROLLBACK
# =============================================================================
cmd_rollback() {
    local revision="${1:-}"

    log "Rolling back AI-ROS in $NAMESPACE..."

    check_prerequisites

    if [ -n "$revision" ]; then
        info "Rolling back to revision: $revision"
        run_cmd "helm rollback $RELEASE_NAME $revision --namespace $NAMESPACE --wait --timeout $HELM_TIMEOUT"
    else
        info "Rolling back to previous revision"
        run_cmd "helm rollback $RELEASE_NAME --namespace $NAMESPACE --wait --timeout $HELM_TIMEOUT"
    fi

    success "Rollback complete"
    cmd_health
}

# =============================================================================
# HEALTH CHECK
# =============================================================================
cmd_health() {
    log "Running health checks for $NAMESPACE..."

    local failed=0
    local timeout=180
    local start_time
    start_time=$(date +%s)

    info "Checking pod status..."
    local not_ready
    not_ready=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=airos \
        --no-headers 2>/dev/null | grep -v "Running\|Completed" || true)

    if [ -n "$not_ready" ]; then
        warn "Pods not in Running state:"
        echo "$not_ready"
        failed=1
    else
        success "All pods are running"
    fi

    info "Checking deployments..."
    kubectl get deployments -n "$NAMESPACE" -l app.kubernetes.io/name=airos \
        -o custom-columns='NAME:.metadata.name,READY:.status.readyReplicas/.status.replicas' 2>/dev/null || true

    info "Waiting for API health endpoint..."
    local api_ready=false
    while [ $(($(date +%s) - start_time)) -lt $timeout ]; do
        if kubectl exec -n "$NAMESPACE" deploy/airos-api -- \
            curl -sf http://localhost:8000/health >/dev/null 2>&1; then
            api_ready=true
            success "API is healthy"
            break
        fi
        sleep 5
    done

    if [ "$api_ready" = false ]; then
        warn "API health check timed out after ${timeout}s"
        failed=1
    fi

    info "Checking PostgreSQL..."
    if kubectl exec -n "$NAMESPACE" deploy/airos-postgres -- \
        pg_isready -U airos -d airos >/dev/null 2>&1; then
        success "PostgreSQL is ready"
    else
        warn "PostgreSQL is not ready"
        failed=1
    fi

    info "Checking Redis..."
    if kubectl exec -n "$NAMESPACE" deploy/airos-redis -- \
        redis-cli ping 2>/dev/null | grep -q PONG; then
        success "Redis is ready"
    else
        warn "Redis is not ready"
        failed=1
    fi

    if [ $failed -eq 0 ]; then
        success "All health checks passed"
    else
        warn "Some health checks failed — check logs with: kubectl logs -n $NAMESPACE -l app.kubernetes.io/name=airos"
    fi

    return $failed
}

# =============================================================================
# STATUS
# =============================================================================
cmd_status() {
    log "AI-ROS deployment status..."

    echo ""
    echo -e "${CYAN}--- Helm Release ---${NC}"
    helm status "$RELEASE_NAME" --namespace "$NAMESPACE" 2>/dev/null || warn "No Helm release found"

    echo ""
    echo -e "${CYAN}--- Pods ---${NC}"
    kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=airos -o wide 2>/dev/null || true

    echo ""
    echo -e "${CYAN}--- Services ---${NC}"
    kubectl get svc -n "$NAMESPACE" -l app.kubernetes.io/name=airos 2>/dev/null || true

    echo ""
    echo -e "${CYAN}--- Ingress ---${NC}"
    kubectl get ingress -n "$NAMESPACE" 2>/dev/null || true

    echo ""
    echo -e "${CYAN}--- HPA ---${NC}"
    kubectl get hpa -n "$NAMESPACE" 2>/dev/null || true
}

# =============================================================================
# LOGS
# =============================================================================
cmd_logs() {
    local component="${1:-}"

    if [ -n "$component" ]; then
        log "Tailing logs for $component..."
        kubectl logs -n "$NAMESPACE" -l app.kubernetes.io/component="$component" -f --tail=100
    else
        log "Tailing logs for all AI-ROS components..."
        kubectl logs -n "$NAMESPACE" -l app.kubernetes.io/name=airos -f --tail=50 --all-containers
    fi
}

# =============================================================================
# CLEAN
# =============================================================================
cmd_clean() {
    log "Removing AI-ROS from $NAMESPACE..."

    check_prerequisites

    run_cmd "helm uninstall $RELEASE_NAME --namespace $NAMESPACE"
    run_cmd "kubectl delete namespace $NAMESPACE --ignore-not-found"

    success "AI-ROS removed"
}

# =============================================================================
# RAW K8S DEPLOY (no Helm)
# =============================================================================
cmd_deploy_raw() {
    log "Deploying AI-ROS using raw Kubernetes manifests..."

    check_prerequisites

    info "Applying manifests from $K8S_MANIFESTS..."

    run_cmd "kubectl apply -f $K8S_MANIFESTS/namespace.yaml"
    run_cmd "kubectl apply -f $K8S_MANIFESTS/secrets.yaml"
    run_cmd "kubectl apply -f $K8S_MANIFESTS/configmap.yaml"
    run_cmd "kubectl apply -f $K8S_MANIFESTS/postgres-deployment.yaml"
    run_cmd "kubectl apply -f $K8S_MANIFESTS/redis-deployment.yaml"

    info "Waiting for infrastructure to be ready..."
    run_cmd "kubectl wait --for=condition=ready pod -l app.kubernetes.io/component=postgres -n $NAMESPACE --timeout=120s"
    run_cmd "kubectl wait --for=condition=ready pod -l app.kubernetes.io/component=redis -n $NAMESPACE --timeout=60s"

    run_cmd "kubectl apply -f $K8S_MANIFESTS/api-deployment.yaml"
    run_cmd "kubectl apply -f $K8S_MANIFESTS/api-service.yaml"
    run_cmd "kubectl apply -f $K8S_MANIFESTS/frontend-deployment.yaml"
    run_cmd "kubectl apply -f $K8S_MANIFESTS/frontend-service.yaml"
    run_cmd "kubectl apply -f $K8S_MANIFESTS/ingress.yaml"

    success "Raw manifests applied"
    cmd_health
}

# =============================================================================
# MAIN
# =============================================================================
COMMAND="${1:-help}"
shift || true

while [[ $# -gt 0 ]]; do
    case $1 in
        --env)       ENVIRONMENT="$2"; shift 2 ;;
        --namespace) NAMESPACE="$2"; shift 2 ;;
        --tag)       IMAGE_TAG="$2"; shift 2 ;;
        --dry-run)   DRY_RUN=true; shift ;;
        --help)      usage ;;
        *)           die "Unknown option: $1" ;;
    esac
done

case $COMMAND in
    deploy)      cmd_deploy ;;
    deploy-raw)  cmd_deploy_raw ;;
    rollback)    cmd_rollback "$@" ;;
    health)      cmd_health ;;
    status)      cmd_status ;;
    logs)        cmd_logs "$@" ;;
    clean)       cmd_clean ;;
    help|--help) usage ;;
    *)           die "Unknown command: $COMMAND (use: deploy, rollback, health, status, logs, clean)" ;;
esac
