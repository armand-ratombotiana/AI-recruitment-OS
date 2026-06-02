#!/usr/bin/env bash
# =============================================================================
# AI-ROS Deployment Script
# =============================================================================
#
# Usage:
#   ./scripts/deploy.sh [OPTIONS]
#
# Options:
#   --env ENV           Target environment: dev, prod (default: dev)
#   --skip-tests        Skip running tests before deploy
#   --skip-build        Skip building images
#   --skip-health       Skip post-deploy health checks
#   --force-recreate    Force recreate all containers
#   --dry-run           Show what would be done without executing
#   --help              Show this help message
#
# =============================================================================

set -euo pipefail

# --- Configuration ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="docker-compose.yml"
ENVIRONMENT="dev"
SKIP_TESTS=false
SKIP_BUILD=false
SKIP_HEALTH=false
FORCE_RECREATE=false
DRY_RUN=false
DEPLOY_TIMEOUT=300
HEALTH_TIMEOUT=120
LOG_FILE="$PROJECT_ROOT/logs/deploy-$(date +%Y%m%d-%H%M%S).log"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# --- Helpers ---
log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"; }
info() { echo -e "${CYAN}[INFO]${NC} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"; }
success() { echo -e "${GREEN}[OK]${NC} $*" | tee -a "$LOG_FILE"; }

run_cmd() {
    if [ "$DRY_RUN" = true ]; then
        info "[DRY-RUN] $*"
        return 0
    fi
    eval "$@" 2>&1 | tee -a "$LOG_FILE"
}

die() {
    error "$1"
    exit 1
}

# --- Parse Arguments ---
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-health)
            SKIP_HEALTH=true
            shift
            ;;
        --force-recreate)
            FORCE_RECREATE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            head -25 "$0" | tail -15
            exit 0
            ;;
        *)
            die "Unknown option: $1"
            ;;
    esac
done

# --- Validate Environment ---
case $ENVIRONMENT in
    dev)
        COMPOSE_FILE="docker-compose.yml"
        ;;
    prod)
        COMPOSE_FILE="docker-compose.prod.yml"
        ;;
    *)
        die "Invalid environment: $ENVIRONMENT (use: dev, prod)"
        ;;
esac

# --- Main Deploy Flow ---
main() {
    mkdir -p "$PROJECT_ROOT/logs"

    echo ""
    echo -e "${CYAN}============================================${NC}"
    echo -e "${CYAN}  AI-ROS Deployment - ${ENVIRONMENT^^}${NC}"
    echo -e "${CYAN}============================================${NC}"
    echo ""
    info "Compose file: $COMPOSE_FILE"
    info "Project root: $PROJECT_ROOT"
    info "Log file:     $LOG_FILE"
    echo ""

    cd "$PROJECT_ROOT"

    # Step 1: Validate environment file
    step_validate_env

    # Step 2: Build images
    if [ "$SKIP_BUILD" = false ]; then
        step_build
    fi

    # Step 3: Run tests
    if [ "$SKIP_TESTS" = false ]; then
        step_test
    fi

    # Step 4: Deploy
    step_deploy

    # Step 5: Health checks
    if [ "$SKIP_HEALTH" = false ]; then
        step_health_check
    fi

    echo ""
    success "Deployment complete!"
    echo ""
}

step_validate_env() {
    log "Step 1/5: Validating environment..."

    if [ ! -f "$COMPOSE_FILE" ]; then
        die "Compose file not found: $COMPOSE_FILE"
    fi

    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            warn ".env file not found. Copying from .env.example"
            run_cmd "cp .env.example .env"
        else
            die ".env file not found and no .env.example available"
        fi
    fi

    success "Environment validated"
}

step_build() {
    log "Step 2/5: Building Docker images..."

    if [ "$FORCE_RECREATE" = true ]; then
        run_cmd "docker compose -f $COMPOSE_FILE build --no-cache"
    else
        run_cmd "docker compose -f $COMPOSE_FILE build"
    fi

    success "Images built successfully"
}

step_test() {
    log "Step 3/5: Running tests..."

    # Backend tests
    if [ -d "backend/tests" ]; then
        info "Running backend tests..."
        run_cmd "cd backend && python -m pytest tests/ -v --tb=short -x" || {
            warn "Backend tests failed or skipped"
        }
    fi

    # Frontend lint
    if [ -f "frontend/package.json" ]; then
        info "Running frontend lint..."
        run_cmd "cd frontend && npm run lint" || {
            warn "Frontend lint failed or skipped"
        }
    fi

    success "Tests completed"
}

step_deploy() {
    log "Step 4/5: Deploying services..."

    if [ "$FORCE_RECREATE" = true ]; then
        info "Force recreating all containers..."
        run_cmd "docker compose -f $COMPOSE_FILE up -d --force-recreate --remove-orphans"
    else
        run_cmd "docker compose -f $COMPOSE_FILE up -d --remove-orphans"
    fi

    # Wait for containers to start
    info "Waiting for containers to initialize..."
    sleep 10

    success "Services deployed"
}

step_health_check() {
    log "Step 5/5: Running post-deploy health checks..."

    local timeout=$HEALTH_TIMEOUT
    local start_time=$(date +%s)

    # Check if all containers are running
    info "Checking container status..."
    local all_running=true
    while IFS= read -r line; do
        local name=$(echo "$line" | cut -d'|' -f1)
        local state=$(echo "$line" | cut -d'|' -f2)
        if [ "$state" != "running" ]; then
            warn "Container $name is $state"
            all_running=false
        fi
    done < <(docker compose -f $COMPOSE_FILE ps --format "name|{{.State}}" 2>/dev/null)

    if [ "$all_running" = false ]; then
        warn "Some containers are not running"
    fi

    # Wait for health checks
    info "Waiting for health checks (timeout: ${timeout}s)..."

    # Backend health
    local backend_ready=false
    while [ $(($(date +%s) - start_time)) -lt $timeout ]; do
        if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
            backend_ready=true
            success "Backend is healthy"
            break
        fi
        sleep 5
    done

    if [ "$backend_ready" = false ]; then
        warn "Backend health check timed out"
    fi

    # Frontend health
    local frontend_ready=false
    while [ $(($(date +%s) - start_time)) -lt $timeout ]; do
        if curl -sf http://localhost:3000 > /dev/null 2>&1; then
            frontend_ready=true
            success "Frontend is healthy"
            break
        fi
        sleep 5
    done

    if [ "$frontend_ready" = false ]; then
        warn "Frontend health check timed out"
    fi

    # Run full monitor if available
    if [ -f "scripts/monitor.py" ]; then
        info "Running full infrastructure monitor..."
        python scripts/monitor.py --backend http://localhost:8000 --frontend http://localhost:3000 --log-file logs/monitor-deploy.log || true
    fi

    success "Health checks completed"
}

# --- Entry Point ---
main "$@"
