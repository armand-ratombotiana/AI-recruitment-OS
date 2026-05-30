#!/bin/bash
set -euo pipefail

# =============================================================================
# AIROS Kubernetes Cluster Setup Script
# Supports: EKS (AWS), Minikube (local development)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENVIRONMENT="${1:-local}"
CLUSTER_NAME="airos-${ENVIRONMENT}"
REGION="${AWS_REGION:-eu-west-1}"

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

check_prerequisites() {
    log_info "Checking prerequisites..."

    local missing_deps=()

    if ! command -v kubectl &> /dev/null; then
        missing_deps+=("kubectl")
    fi

    if ! command -v helm &> /dev/null; then
        missing_deps+=("helm")
    fi

    if [[ "$ENVIRONMENT" == "local" ]] && ! command -v minikube &> /dev/null; then
        missing_deps+=("minikube")
    fi

    if [[ "$ENVIRONMENT" != "local" ]] && ! command -v aws &> /dev/null; then
        missing_deps+=("aws-cli")
    fi

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_info "Please install the missing dependencies and try again."
        exit 1
    fi

    log_success "All prerequisites are installed."
}

setup_minikube() {
    log_info "Setting up Minikube cluster..."

    # Start minikube with required addons
    minikube start \
        --name="$CLUSTER_NAME" \
        --driver=docker \
        --cpus=4 \
        --memory=8192 \
        --disk-size=50g \
        --kubernetes-version=v1.29.3

    # Enable required addons
    minikube addons enable ingress
    minikube addons enable metrics-server
    minikube addons enable storage-provisioner

    # Configure Docker to use minikube's Docker daemon
    eval $(minikube docker-env)

    log_success "Minikube cluster started successfully."
    log_info "To access the cluster dashboard: minikube dashboard"
}

setup_eks() {
    log_info "Setting up EKS cluster..."

    # Check if cluster exists
    if aws eks describe-cluster --name "$CLUSTER_NAME" --region "$REGION" &>/dev/null; then
        log_warning "EKS cluster '$CLUSTER_NAME' already exists."
    else
        log_info "Creating EKS cluster '$CLUSTER_NAME'..."
        eksctl create cluster \
            --name "$CLUSTER_NAME" \
            --region "$REGION" \
            --nodegroup-name "airos-nodes" \
            --node-type "m5.xlarge" \
            --nodes 3 \
            --nodes-min 2 \
            --nodes-max 5 \
            --managed \
            --with-oidc \
            --ssh-access \
            --ssh-public-key ~/.ssh/airos-${ENVIRONMENT}.pub
    fi

    # Update kubeconfig
    aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$REGION"

    log_success "EKS cluster setup complete."
}

install_cert_manager() {
    log_info "Installing cert-manager..."

    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.4/cert-manager.yaml

    # Wait for cert-manager to be ready
    kubectl wait --for=condition=Available deployment/cert-manager -n cert-manager --timeout=120s
    kubectl wait --for=condition=Available deployment/cert-manager-webhook -n cert-manager --timeout=120s

    # Create ClusterIssuer for Let's Encrypt
    cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@airos.io
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF

    log_success "cert-manager installed successfully."
}

install_nginx_ingress() {
    log_info "Installing NGINX Ingress Controller..."

    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo update

    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.replicaCount=2 \
        --set controller.metrics.enabled=true \
        --set controller.metrics.serviceMonitor.enabled=true

    # Wait for ingress controller to be ready
    kubectl wait --for=condition=Available deployment/ingress-nginx-controller -n ingress-nginx --timeout=120s

    log_success "NGINX Ingress Controller installed successfully."
}

install_strimzi() {
    log_info "Installing Strimzi Kafka Operator..."

    kubectl create namespace kafka --dry-run=client -o yaml | kubectl apply -f -

    kubectl apply -f 'https://strimzi.io/install/latest?namespace=kafka' -n kafka

    # Wait for Strimzi operator to be ready
    kubectl wait --for=condition=Available deployment/strimzi-cluster-operator -n kafka --timeout=120s

    log_success "Strimzi Kafka Operator installed successfully."
}

install_elasticsearch_operator() {
    log_info "Installing Elasticsearch Operator..."

    kubectl create namespace elastic-system --dry-run=client -o yaml | kubectl apply -f -

    kubectl apply -f https://download.elastic.co/downloads/eck/2.12.1/crds.yaml
    kubectl apply -f https://download.elastic.co/downloads/eck/2.12.1/operator.yaml -n elastic-system

    # Wait for operator to be ready
    kubectl wait --for=condition=Available deployment/elastic-operator -n elastic-system --timeout=120s

    log_success "Elasticsearch Operator installed successfully."
}

install_monitoring_stack() {
    log_info "Installing Monitoring Stack..."

    # Create monitoring namespace
    kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

    # Install Prometheus Stack
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update

    helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        --set grafana.enabled=false \
        --set alertmanager.enabled=true \
        --set prometheus.prometheusSpec.retention=30d \
        --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=50Gi

    log_success "Monitoring stack installed successfully."
}

install_metrics_server() {
    log_info "Installing Metrics Server..."

    if [[ "$ENVIRONMENT" == "local" ]]; then
        minikube addons enable metrics-server
    else
        kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

        # Patch metrics-server to allow kubelet certificates
        kubectl patch deployment metrics-server -n kube-system --type='json' -p='[
            {"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}
        ]'
    fi

    log_success "Metrics Server installed successfully."
}

install_keda() {
    log_info "Installing KEDA (Kubernetes Event-driven Autoscaling)..."

    helm repo add kedacore https://kedacore.github.io/charts
    helm repo update

    helm upgrade --install keda kedacore/keda \
        --namespace keda \
        --create-namespace \
        --set prometheus.metricServer.enabled=true

    log_success "KEDA installed successfully."
}

install_external_secrets() {
    log_info "Installing External Secrets Operator..."

    helm repo add external-secrets https://charts.external-secrets.io
    helm repo update

    helm upgrade --install external-secrets external-secrets/external-secrets \
        --namespace external-secrets \
        --create-namespace \
        --set installCRDs=true

    log_success "External Secrets Operator installed successfully."
}

create_namespaces() {
    log_info "Creating namespaces..."

    kubectl create namespace airos-staging --dry-run=client -o yaml | kubectl apply -f -
    kubectl create namespace airos-production --dry-run=client -o yaml | kubectl apply -f -
    kubectl create namespace airos-shared --dry-run=client -o yaml | kubectl apply -f -

    # Add labels to namespaces
    kubectl label namespace airos-staging environment=staging --overwrite
    kubectl label namespace airos-production environment=production --overwrite
    kubectl label namespace airos-shared environment=shared --overwrite

    log_success "Namespaces created successfully."
}

setup_secrets() {
    log_info "Setting up secrets..."

    if [[ "$ENVIRONMENT" == "local" ]]; then
        # For local development, create dummy secrets
        kubectl create secret generic airos-secrets \
            --from-literal=nextauth-secret="local-dev-secret" \
            --from-literal=celery-broker-url="redis://redis:6379/1" \
            --from-literal=celery-result-backend="redis://redis:6379/2" \
            --from-literal=database-url="postgresql://airos:devpassword@postgres:5432/airos_dev" \
            --from-literal=redis-url="redis://redis:6379/0" \
            --from-literal=openai-api-key="${OPENAI_API_KEY:-sk-placeholder}" \
            --from-literal=smtp-host="mailhog" \
            --from-literal=smtp-password="" \
            -n airos-staging --dry-run=client -o yaml | kubectl apply -f -

        kubectl create secret generic airos-secrets \
            --from-literal=nextauth-secret="local-dev-secret" \
            --from-literal=celery-broker-url="redis://redis:6379/1" \
            --from-literal=celery-result-backend="redis://redis:6379/2" \
            --from-literal=database-url="postgresql://airos:devpassword@postgres:5432/airos_dev" \
            --from-literal=redis-url="redis://redis:6379/0" \
            --from-literal=openai-api-key="${OPENAI_API_KEY:-sk-placeholder}" \
            --from-literal=smtp-host="mailhog" \
            --from-literal=smtp-password="" \
            -n airos-production --dry-run=client -o yaml | kubectl apply -f -
    else
        log_warning "For production, please configure secrets using External Secrets Operator."
        log_warning "Refer to documentation for setting up AWS Secrets Manager."
    fi

    log_success "Secrets configured successfully."
}

verify_installation() {
    log_info "Verifying installation..."

    echo ""
    echo "=== Cluster Info ==="
    kubectl cluster-info

    echo ""
    echo "=== Namespaces ==="
    kubectl get namespaces

    echo ""
    echo "=== Pods in airos-staging ==="
    kubectl get pods -n airos-staging

    echo ""
    echo "=== Services ==="
    kubectl get svc -A

    echo ""
    log_success "Installation verification complete."
}

print_access_info() {
    log_info "Access Information:"
    echo ""

    if [[ "$ENVIRONMENT" == "local" ]]; then
        echo "Minikube IP: $(minikube ip)"
        echo ""
        echo "To access services:"
        echo "  Frontend: http://$(minikube ip)"
        echo "  API: http://$(minikube ip):8000"
        echo "  Grafana: http://$(minikube ip):3001"
        echo "  Jaeger: http://$(minikube ip):16686"
        echo ""
        echo "To enable port-forwarding:"
        echo "  kubectl port-forward svc/airos-frontend 3000:3000 -n airos-staging"
        echo "  kubectl port-forward svc/airos-api 8000:8000 -n airos-staging"
    else
        echo "EKS Cluster: $CLUSTER_NAME"
        echo "Region: $REGION"
        echo ""
        echo "To get load balancer URLs:"
        echo "  kubectl get svc -n airos-production"
    fi
    echo ""
}

main() {
    echo "=========================================="
    echo " AIROS Kubernetes Cluster Setup"
    echo " Environment: $ENVIRONMENT"
    echo "=========================================="
    echo ""

    check_prerequisites

    case "$ENVIRONMENT" in
        local|minikube)
            setup_minikube
            ;;
        staging|production)
            setup_eks
            ;;
        *)
            log_error "Unknown environment: $ENVIRONMENT"
            echo "Usage: $0 [local|staging|production]"
            exit 1
            ;;
    esac

    install_metrics_server
    install_nginx_ingress
    install_cert_manager
    install_strimzi
    install_elasticsearch_operator
    install_monitoring_stack
    install_keda
    install_external_secrets
    create_namespaces
    setup_secrets
    verify_installation
    print_access_info

    log_success "Kubernetes cluster setup complete!"
}

main "$@"
