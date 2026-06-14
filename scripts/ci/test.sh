#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[test]${NC} $*"; }
warn() { echo -e "${YELLOW}[test]${NC} $*"; }
error() { echo -e "${RED}[test]${NC} $*"; }
info() { echo -e "${BLUE}[test]${NC} $*"; }

ERRORS=0
COVERAGE=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --coverage) COVERAGE=true; shift ;;
        --verbose|-v) VERBOSE=true; shift ;;
        --help)
            echo "Usage: $0 [--coverage] [--verbose]"
            exit 0
            ;;
        *) shift ;;
    esac
done

cd "$PROJECT_ROOT"

log "=== Backend Tests ==="

if [ -f "requirements.txt" ]; then
    PYTEST_ARGS=("python" "-m" "pytest" "tests/" "--tb=short" "-x")

    if [ "$VERBOSE" = true ]; then
        PYTEST_ARGS+=("-v")
    fi

    if [ "$COVERAGE" = true ]; then
        PYTEST_ARGS+=("--cov=." "--cov-report=term-missing" "--cov-report=xml:coverage.xml")
    fi

    export DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://airos:test@localhost:5432/airos_test}"
    export REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"
    export SECRET_KEY="${SECRET_KEY:-test-secret-key-min-32-chars-placeholder!!}"
    export ENCRYPTION_KEY="${ENCRYPTION_KEY:-test-encryption-key-32-chars-placeholder}"
    export ENVIRONMENT="${ENVIRONMENT:-test}"

    info "Running backend tests..."
    info "DATABASE_URL: $DATABASE_URL"

    "${PYTEST_ARGS[@]}" || { error "Backend tests failed"; ERRORS=$((ERRORS + 1)); }
else
    warn "requirements.txt not found, skipping backend tests"
fi

log "=== Frontend Tests ==="

if [ -f "frontend/package.json" ]; then
    cd frontend

    if [ -d "node_modules" ]; then
        info "Running frontend lint as test..."
        npm run lint || { error "Frontend lint failed"; ERRORS=$((ERRORS + 1)); }

        info "Running TypeScript check..."
        npx tsc --noEmit || { error "TypeScript check failed"; ERRORS=$((ERRORS + 1)); }

        if [ -f "playwright.config.ts" ]; then
            info "Playwright config detected (skipping E2E in unit test run)"
        fi
    else
        warn "node_modules not found, run 'cd frontend && npm install' first"
    fi

    cd "$PROJECT_ROOT"
else
    warn "frontend/package.json not found"
fi

echo ""
if [ "$ERRORS" -gt 0 ]; then
    error "Tests completed with $ERRORS failure(s)"
    exit 1
else
    log "All tests passed"
    exit 0
fi
