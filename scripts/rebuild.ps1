# =============================================================================
# AI-ROS — Complete Docker Rebuild Script (PowerShell)
# =============================================================================

Write-Host "============================================"
Write-Host "  AI-ROS Docker Rebuild"
Write-Host "============================================"
Write-Host ""

# Step 1: Stop all containers
Write-Host "[1/5] Stopping all containers..."
docker compose down --remove-orphans 2>$null
Write-Host "  Done!"
Write-Host ""

# Step 2: Remove old images
Write-Host "[2/5] Removing old images..."
docker rmi airecrutementos-api:latest 2>$null
docker rmi airecrutementos-frontend:latest 2>$null
docker image prune -f 2>$null
Write-Host "  Done!"
Write-Host ""

# Step 3: Build images
Write-Host "[3/5] Building images..."
docker compose build --no-cache
Write-Host "  Done!"
Write-Host ""

# Step 4: Start services
Write-Host "[4/5] Starting services..."
docker compose up -d
Write-Host "  Done!"
Write-Host ""

# Step 5: Wait and verify
Write-Host "[5/5] Waiting for services..."
Start-Sleep -Seconds 20
Write-Host "  Done!"
Write-Host ""

# Verify
Write-Host "============================================"
Write-Host "  Verification"
Write-Host "============================================"
Write-Host ""

Write-Host "Container Status:"
docker compose ps
Write-Host ""

Write-Host "Service Health:"
$services = @(
    @("PostgreSQL", "docker exec airos-postgres pg_isready -U airos"),
    @("Redis", "docker exec airos-redis redis-cli ping"),
    @("API Health", "curl -s http://localhost:8000/health"),
    @("Frontend", "curl -s http://localhost:3000")
)

foreach ($svc in $services) {
    $result = Invoke-Expression $svc[1] 2>$null
    if ($result) {
        Write-Host "  [OK] $($svc[0])"
    } else {
        Write-Host "  [FAIL] $($svc[0])"
    }
}

Write-Host ""
Write-Host "============================================"
Write-Host "  Access URLs"
Write-Host "============================================"
Write-Host ""
Write-Host "  Frontend:    http://localhost:3000"
Write-Host "  API:         http://localhost:8000"
Write-Host "  API Docs:    http://localhost:8000/docs"
Write-Host "  Grafana:     http://localhost:3001 (admin/admin)"
Write-Host "  Jaeger:      http://localhost:16686"
Write-Host "  Prometheus:  http://localhost:9090"
Write-Host ""
Write-Host "============================================"
