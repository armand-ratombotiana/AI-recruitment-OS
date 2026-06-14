#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[build]${NC} $*"; }
warn() { echo -e "${YELLOW}[build]${NC} $*"; }
error() { echo -e "${RED}[build]${NC} $*"; }
info() { echo -e "${BLUE}[build]${NC} $*"; }

NO_CACHE=false
PUSH=false
TAG="${TAG:-latest}"
COMPONENTS=("backend" "frontend")

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-cache) NO_CACHE=true; shift ;;
        --push) PUSH=true; shift ;;
        --tag) TAG="$2"; shift 2 ;;
        --component) COMPONENTS=("$2"); shift 2 ;;
        --help)
            echo "Usage: $0 [--no-cache] [--push] [--tag TAG] [--component NAME]"
            exit 0
            ;;
        *) shift ;;
    esac
done

cd "$PROJECT_ROOT"

log "=== Build Configuration ==="
info "Tag: $TAG"
info "No cache: $NO_CACHE"
info "Push: $PUSH"
info "Components: ${COMPONENTS[*]}"
echo ""

build_backend() {
    log "=== Building Backend ==="

    if [ ! -f "Dockerfile.backend" ]; then
        warn "Dockerfile.backend not found, using root Dockerfile"
        local df="Dockerfile"
    else
        local df="Dockerfile.backend"
    fi

    local BUILD_ARGS=("-f" "$df" "-t" "airos-backend:${TAG}")

    if [ "$NO_CACHE" = true ]; then
        BUILD_ARGS+=("--no-cache")
    fi

    BUILD_ARGS+=("--build-arg" "BUILD_VERSION=${TAG}")

    info "Building backend image..."
    docker build "${BUILD_ARGS[@]}" .

    if [ "$PUSH" = true ]; then
        info "Pushing backend image..."
        docker tag "airos-backend:${TAG}" "${ECR_REGISTRY:-localhost}/airos-api:${TAG}"
        docker push "${ECR_REGISTRY:-localhost}/airos-api:${TAG}"
    fi

    log "Backend build complete"
}

build_frontend() {
    log "=== Building Frontend ==="

    if [ ! -f "Dockerfile.frontend" ]; then
        error "Dockerfile.frontend not found"
        return 1
    fi

    local BUILD_ARGS=("-f" "Dockerfile.frontend" "-t" "airos-frontend:${TAG}")

    if [ "$NO_CACHE" = true ]; then
        BUILD_ARGS+=("--no-cache")
    fi

    BUILD_ARGS+=("--build-arg" "BUILD_VERSION=${TAG}")

    info "Building frontend image..."
    docker build "${BUILD_ARGS[@]}" .

    if [ "$PUSH" = true ]; then
        info "Pushing frontend image..."
        docker tag "airos-frontend:${TAG}" "${ECR_REGISTRY:-localhost}/airos-frontend:${TAG}"
        docker push "${ECR_REGISTRY:-localhost}/airos-frontend:${TAG}"
    fi

    log "Frontend build complete"
}

ERRORS=0

for comp in "${COMPONENTS[@]}"; do
    case $comp in
        backend) build_backend || ERRORS=$((ERRORS + 1)) ;;
        frontend) build_frontend || ERRORS=$((ERRORS + 1)) ;;
        *) error "Unknown component: $comp"; ERRORS=$((ERRORS + 1)) ;;
    esac
done

echo ""
if [ "$ERRORS" -gt 0 ]; then
    error "Build completed with $ERRORS error(s)"
    exit 1
else
    log "All builds successful"
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" | grep airos || true
    exit 0
fi
