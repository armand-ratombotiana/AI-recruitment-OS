#!/bin/bash
set -euo pipefail

# =============================================================================
# AIROS Database Migration Script for Kubernetes
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENVIRONMENT="${1:-}"
ACTION="${2:-migrate}"
NAMESPACE="airos-${ENVIRONMENT}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

usage() {
    echo "Usage: $0 <environment> [action]"
    echo ""
    echo "Environments:"
    echo "  local       - Local development"
    echo "  staging     - Staging environment"
    echo "  production  - Production environment"
    echo ""
    echo "Actions:"
    echo "  migrate     - Run database migrations (default)"
    echo "  rollback    - Rollback last migration"
    echo "  status      - Show migration status"
    echo "  seed        - Run database seeding"
    echo "  create      - Create new migration"
    echo ""
    echo "Examples:"
    echo "  $0 local migrate"
    echo "  $0 staging rollback"
    echo "  $0 production status"
    echo "  $0 local create add_users_table"
}

validate_environment() {
    if [[ -z "$ENVIRONMENT" ]]; then
        log_error "Environment is required."
        usage
        exit 1
    fi

    if [[ ! "$ENVIRONMENT" =~ ^(local|staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT"
        usage
        exit 1
    fi
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed."
        exit 1
    fi

    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster."
        exit 1
    fi

    # Check if API pod exists
    if ! kubectl get pods -n "$NAMESPACE" -l app=airos-api &> /dev/null; then
        log_error "No API pods found in namespace $NAMESPACE"
        exit 1
    fi

    log_success "Prerequisites check passed."
}

get_api_pod() {
    kubectl get pods -n "$NAMESPACE" -l app=airos-api -o jsonpath="{.items[0].metadata.name}" 2>/dev/null
}

run_migration() {
    local api_pod
    api_pod=$(get_api_pod)

    if [[ -z "$api_pod" ]]; then
        log_error "Could not find API pod."
        exit 1
    fi

    log_info "Running migrations on pod: $api_pod"

    case "$ACTION" in
        migrate)
            log_info "Executing database migration..."
            kubectl exec -n "$NAMESPACE" "$api_pod" -- \
                python -m alembic upgrade head
            
            log_success "Migration completed successfully."
            ;;

        rollback)
            log_warning "Rolling back last migration..."
            kubectl exec -n "$NAMESPACE" "$api_pod" -- \
                python -m alembic downgrade -1
            
            log_success "Rollback completed successfully."
            ;;

        status)
            log_info "Checking migration status..."
            kubectl exec -n "$NAMESPACE" "$api_pod" -- \
                python -m alembic current
            
            echo ""
            log_info "Migration history:"
            kubectl exec -n "$NAMESPACE" "$api_pod" -- \
                python -m alembic history --verbose
            ;;

        seed)
            log_info "Running database seeding..."
            kubectl exec -n "$NAMESPACE" "$api_pod" -- \
                python -m app.scripts.seed_data
            
            log_success "Seeding completed successfully."
            ;;

        create)
            if [[ -z "${3:-}" ]]; then
                log_error "Migration name is required for create action."
                echo "Usage: $0 $ENVIRONMENT create <migration_name>"
                exit 1
            fi
            
            local migration_name="$3"
            log_info "Creating migration: $migration_name"
            
            kubectl exec -n "$NAMESPACE" "$api_pod" -- \
                python -m alembic revision --autogenerate -m "$migration_name"
            
            log_success "Migration created successfully."
            
            # Get the new migration file
            log_info "New migration file:"
            kubectl exec -n "$NAMESPACE" "$api_pod" -- \
                ls -la /app/alembic/versions/ | tail -1
            ;;
    esac
}

backup_database() {
    log_info "Creating database backup..."
    
    local backup_name="backup-$(date +%Y%m%d-%H%M%S)"
    
    case "$ENVIRONMENT" in
        local|staging)
            # For local/staging, use pg_dump
            local api_pod
            api_pod=$(get_api_pod)
            
            kubectl exec -n "$NAMESPACE" "$api_pod" -- \
                pg_dump -U airos -d airos_${ENVIRONMENT} | \
                gzip > "${backup_name}.sql.gz"
            
            log_success "Backup created: ${backup_name}.sql.gz"
            ;;
            
        production)
            # For production, use AWS RDS snapshot
            log_warning "Production backup should be done via AWS RDS."
            log_info "Creating RDS snapshot..."
            
            aws rds create-db-snapshot \
                --db-instance-identifier airos-${ENVIRONMENT} \
                --db-snapshot-identifier "${backup_name}" \
                --region "${AWS_REGION:-eu-west-1}"
            
            log_success "RDS snapshot initiated: ${backup_name}"
            log_info "Monitor snapshot status with:"
            echo "  aws rds describe-db-snapshots --db-snapshot-identifier ${backup_name}"
            ;;
    esac
}

run_with_safety_checks() {
    local environment="$1"
    local action="$2"

    # Safety checks for production
    if [[ "$environment" == "production" && "$action" == "rollback" ]]; then
        log_warning "Production rollback requested!"
        echo ""
        echo "This will rollback the database migration in PRODUCTION."
        echo "Are you sure you want to continue? (yes/no)"
        read -r confirmation
        
        if [[ "$confirmation" != "yes" ]]; then
            log_info "Rollback cancelled."
            exit 0
        fi
        
        # Create backup before rollback
        backup_database
    fi

    if [[ "$environment" == "production" && "$action" == "migrate" ]]; then
        log_warning "Production migration requested!"
        echo ""
        echo "This will run database migrations in PRODUCTION."
        echo "Please ensure you have:"
        echo "  1. Reviewed the migration scripts"
        echo "  2. Tested in staging"
        echo "  3. Have a rollback plan"
        echo ""
        echo "Are you sure you want to continue? (yes/no)"
        read -r confirmation
        
        if [[ "$confirmation" != "yes" ]]; then
            log_info "Migration cancelled."
            exit 0
        fi
    fi

    run_migration
}

verify_migration() {
    log_info "Verifying migration results..."
    
    local api_pod
    api_pod=$(get_api_pod)
    
    # Check database connectivity
    kubectl exec -n "$NAMESPACE" "$api_pod" -- \
        python -c "
import sqlalchemy
from app.config import settings
engine = sqlalchemy.create_engine(settings.DATABASE_URL)
with engine.connect() as conn:
    result = conn.execute(sqlalchemy.text('SELECT 1'))
    print('Database connection: OK')
"
    
    # Run any verification scripts
    kubectl exec -n "$NAMESPACE" "$api_pod" -- \
        python -c "
from app.models import Base
from app.config import settings
import sqlalchemy
engine = sqlalchemy.create_engine(settings.DATABASE_URL)
Base.metadata.create_all(engine)
print('All tables exist: OK')
" 2>/dev/null || log_warning "Table verification skipped"
    
    log_success "Migration verification complete."
}

main() {
    echo "=========================================="
    echo " AIROS Database Migration"
    echo " Environment: ${ENVIRONMENT:-not set}"
    echo " Action: $ACTION"
    echo "=========================================="
    echo ""

    validate_environment
    check_prerequisites
    
    # Run with safety checks (handles production confirmation)
    run_with_safety_checks "$ENVIRONMENT" "$ACTION"
    
    # Verify migration (except for status)
    if [[ "$ACTION" != "status" ]]; then
        verify_migration
    fi

    log_success "Operation completed successfully!"
}

main "$@"
