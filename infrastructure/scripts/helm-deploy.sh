#!/bin/bash
set -euo pipefail

# =============================================================================
# AIROS Helm Deployment Script
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HELM_CHART_DIR="${PROJECT_ROOT}/helm/airos"
ENVIRONMENT="${1:-}"
ACTION="${2:-install}"
RELEASE_NAME="airos"
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
    echo "  local       - Local development with Minikube"
    echo "  staging     - Staging environment"
    echo "  production  - Production environment"
    echo ""
    echo "Actions:"
    echo "  install     - Install the Helm chart (default)"
    echo "  upgrade     - Upgrade an existing release"
    echo "  uninstall   - Uninstall the release"
    echo "  diff        - Show differences between current and proposed"
    echo "  rollback    - Rollback to previous revision"
    echo "  status      - Show release status"
    echo ""
    echo "Examples:"
    echo "  $0 local install"
    echo "  $0 staging upgrade"
    echo "  $0 production uninstall"
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

validate_action() {
    if [[ ! "$ACTION" =~ ^(install|upgrade|uninstall|diff|rollback|status)$ ]]; then
        log_error "Invalid action: $ACTION"
        usage
        exit 1
    fi
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v helm &> /dev/null; then
        log_error "Helm is not installed."
        exit 1
    fi

    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed."
        exit 1
    fi

    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster."
        exit 1
    fi

    log_success "Prerequisites check passed."
}

setup_helm_repos() {
    log_info "Adding Helm repositories..."

    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>/dev/null || true
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts 2>/dev/null || true
    helm repo add kedacore https://kedacore.github.io/charts 2>/dev/null || true
    helm repo add external-secrets https://charts.external-secrets.io 2>/dev/null || true
    helm repo update

    log_success "Helm repositories updated."
}

get_values_file() {
    local values_file="${HELM_CHART_DIR}/values-${ENVIRONMENT}.yaml"
    if [[ ! -f "$values_file" ]]; then
        log_warning "Values file not found: $values_file"
        log_info "Using default values.yaml"
        values_file="${HELM_CHART_DIR}/values.yaml"
    fi
    echo "$values_file"
}

get_secrets_file() {
    local secrets_file="${PROJECT_ROOT}/environments/${ENVIRONMENT}/secrets.yaml"
    if [[ ! -f "$secrets_file" ]]; then
        log_warning "Secrets file not found: $secrets_file"
        log_info "Proceeding without secrets file."
        secrets_file=""
    fi
    echo "$secrets_file"
}

deploy_helm_chart() {
    local values_file
    local secrets_file
    values_file=$(get_values_file)
    secrets_file=$(get_secrets_file)

    log_info "Deploying Helm chart..."
    log_info "Environment: $ENVIRONMENT"
    log_info "Values file: $values_file"

    # Build Helm chart dependency
    log_info "Building Helm dependencies..."
    helm dependency build "$HELM_CHART_DIR" 2>/dev/null || true

    case "$ACTION" in
        install)
            log_info "Installing release '$RELEASE_NAME' in namespace '$NAMESPACE'..."
            
            local helm_args=(
                upgrade --install "$RELEASE_NAME" "$HELM_CHART_DIR"
                --namespace "$NAMESPACE"
                --create-namespace
                --values "$values_file"
                --wait
                --timeout 600s
            )

            if [[ -n "$secrets_file" ]]; then
                helm_args+=(--values "$secrets_file")
            fi

            if [[ "$ENVIRONMENT" == "production" ]]; then
                helm_args+=(--atomic)
            fi

            helm "${helm_args[@]}"
            ;;

        upgrade)
            log_info "Upgrading release '$RELEASE_NAME' in namespace '$NAMESPACE'..."
            
            local helm_args=(
                upgrade "$RELEASE_NAME" "$HELM_CHART_DIR"
                --namespace "$NAMESPACE"
                --values "$values_file"
                --wait
                --timeout 600s
            )

            if [[ -n "$secrets_file" ]]; then
                helm_args+=(--values "$secrets_file")
            fi

            if [[ "$ENVIRONMENT" == "production" ]]; then
                helm_args+=(--atomic)
            fi

            helm "${helm_args[@]}"
            ;;

        uninstall)
            log_info "Uninstalling release '$RELEASE_NAME' from namespace '$NAMESPACE'..."
            helm uninstall "$RELEASE_NAME" --namespace "$NAMESPACE" --wait
            ;;

        diff)
            log_info "Showing differences for release '$RELEASE_NAME'..."
            helm diff upgrade "$RELEASE_NAME" "$HELM_CHART_DIR" \
                --namespace "$NAMESPACE" \
                --values "$values_file" || true
            ;;

        rollback)
            log_info "Rolling back release '$RELEASE_NAME'..."
            local latest_revision
            latest_revision=$(helm history "$RELEASE_NAME" --namespace "$NAMESPACE" -o json | jq -r '.[-1].revision')
            local target_revision=$((latest_revision - 1))
            
            if [[ $target_revision -lt 1 ]]; then
                log_error "No previous revision to rollback to."
                exit 1
            fi
            
            log_info "Rolling back to revision $target_revision..."
            helm rollback "$RELEASE_NAME" "$target_revision" --namespace "$NAMESPACE" --wait
            ;;

        status)
            log_info "Showing status for release '$RELEASE_NAME'..."
            helm status "$RELEASE_NAME" --namespace "$NAMESPACE"
            echo ""
            helm history "$RELEASE_NAME" --namespace "$NAMESPACE" --max 10
            ;;
    esac

    log_success "$ACTION completed successfully!"
}

verify_deployment() {
    if [[ "$ACTION" == "install" || "$ACTION" == "upgrade" ]]; then
        log_info "Verifying deployment..."

        echo ""
        echo "=== Pods in $NAMESPACE ==="
        kubectl get pods -n "$NAMESPACE"

        echo ""
        echo "=== Services in $NAMESPACE ==="
        kubectl get svc -n "$NAMESPACE"

        echo ""
        echo "=== Ingress in $NAMESPACE ==="
        kubectl get ingress -n "$NAMESPACE"

        echo ""
        echo "=== Helm Release Status ==="
        helm status "$RELEASE_NAME" --namespace "$NAMESPACE" 2>/dev/null || true
    fi
}

print_access_info() {
    if [[ "$ACTION" == "install" || "$ACTION" == "upgrade" ]]; then
        echo ""
        echo "=========================================="
        echo " Access Information"
        echo "=========================================="
        echo ""

        case "$ENVIRONMENT" in
            local)
                local minikube_ip
                minikube_ip=$(minikube ip 2>/dev/null || echo "localhost")
                echo "Frontend: http://${minikube_ip}"
                echo "API: http://${minikube_ip}:8000"
                echo "Grafana: http://${minikube_ip}:3001"
                echo "Jaeger: http://${minikube_ip}:16686"
                echo ""
                echo "Port-forwarding commands:"
                echo "  kubectl port-forward svc/airos-frontend 3000:3000 -n $NAMESPACE"
                echo "  kubectl port-forward svc/airos-api 8000:8000 -n $NAMESPACE"
                ;;
            staging|production)
                echo "Fetching load balancer URLs..."
                echo ""
                kubectl get svc -n "$NAMESPACE" -o custom-columns=\
NAME:.metadata.name,TYPE:.spec.type,EXTERNAL-IP:.status.loadBalancer.ingress[0].hostname,PORT:.spec.ports[0].port
                ;;
        esac

        echo ""
    fi
}

main() {
    echo "=========================================="
    echo " AIROS Helm Deployment"
    echo " Environment: ${ENVIRONMENT:-not set}"
    echo " Action: $ACTION"
    echo "=========================================="
    echo ""

    validate_environment
    validate_action
    check_prerequisites
    setup_helm_repos
    deploy_helm_chart
    verify_deployment
    print_access_info

    log_success "Deployment complete!"
}

main "$@"
