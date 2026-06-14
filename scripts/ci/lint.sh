#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[lint]${NC} $*"; }
warn() { echo -e "${YELLOW}[lint]${NC} $*"; }
error() { echo -e "${RED}[lint]${NC} $*"; }

ERRORS=0

cd "$PROJECT_ROOT"

log "=== Backend Linting ==="

if command -v ruff &> /dev/null; then
    log "Running ruff check..."
    ruff check . || { error "ruff check failed"; ERRORS=$((ERRORS + 1)); }

    log "Running ruff format check..."
    ruff format --check . || { error "ruff format check failed"; ERRORS=$((ERRORS + 1)); }
else
    warn "ruff not found, skipping Python linting"
fi

if command -v mypy &> /dev/null; then
    log "Running mypy type check..."
    mypy . --ignore-missing-imports || { warn "mypy found issues (non-blocking)"; }
else
    warn "mypy not found, skipping type checking"
fi

log "=== Frontend Linting ==="

if [ -f "frontend/package.json" ]; then
    cd frontend

    if [ -d "node_modules" ]; then
        log "Running ESLint..."
        npm run lint || { error "ESLint failed"; ERRORS=$((ERRORS + 1)); }

        log "Running TypeScript check..."
        npx tsc --noEmit || { error "TypeScript check failed"; ERRORS=$((ERRORS + 1)); }
    else
        warn "node_modules not found, run 'cd frontend && npm install' first"
    fi

    cd "$PROJECT_ROOT"
else
    warn "frontend/package.json not found"
fi

log "=== Docker Linting ==="

if command -v hadolint &> /dev/null; then
    for df in Dockerfile Dockerfile.backend Dockerfile.frontend; do
        if [ -f "$df" ]; then
            log "Linting $df..."
            hadolint "$df" || { warn "hadolint found issues in $df"; }
        fi
    done
else
    warn "hadolint not found, skipping Docker linting"
fi

echo ""
if [ "$ERRORS" -gt 0 ]; then
    error "Linting completed with $ERRORS error(s)"
    exit 1
else
    log "All linting checks passed"
    exit 0
fi
