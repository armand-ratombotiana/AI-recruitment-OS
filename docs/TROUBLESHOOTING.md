# AI-ROS Troubleshooting Guide

## Common Issues

### Backend Issues

#### ImportError: No module named 'shared'

**Cause:** Python path not configured correctly.

**Solution:**
```bash
cd backend
export PYTHONPATH=$PWD
python run.py
```

Or use the Makefile:
```bash
make dev
```

#### Database Connection Error

**Cause:** PostgreSQL is not running or connection string is wrong.

**Solution:**
```bash
# Start PostgreSQL
docker compose up -d postgres

# Check it's healthy
docker compose ps postgres

# Verify connection
docker exec airos-postgres psql -U airos -d airos -c "SELECT 1"
```

#### Port Already in Use

**Cause:** Another process is using port 8000.

**Solution:**
```bash
# Find the process (Windows)
netstat -ano | findstr :8000

# Find the process (macOS/Linux)
lsof -i :8000

# Kill it
kill -9 <PID>
```

#### Alembic Migration Error

**Cause:** Migration files conflict or database is in inconsistent state.

**Solution:**
```bash
# Check current migration state
cd backend && alembic current

# Stamp to a specific revision
alembic stamp head

# Generate fresh migration
alembic revision --autogenerate -m "reset"
```

#### Celery Worker Not Starting

**Cause:** Redis connection or import errors.

**Solution:**
```bash
# Check Redis is running
docker compose ps redis

# Start worker manually
cd backend && celery -A shared.events.celery_app worker --loglevel=info
```

### Frontend Issues

#### Module Not Found

**Cause:** Dependencies not installed.

**Solution:**
```bash
cd frontend
rm -rf node_modules
npm install
```

#### Build Failed

**Cause:** TypeScript errors or missing dependencies.

**Solution:**
```bash
cd frontend
npm run build 2>&1 | head -50
# Fix the errors shown, then retry
```

#### Hydration Error

**Cause:** Server/client rendering mismatch.

**Solution:**
- Check for `useEffect` missing dependency array
- Ensure state updates are wrapped in `useEffect`
- Check for browser-only APIs used during SSR

#### API Connection Refused

**Cause:** Backend not running or wrong API URL.

**Solution:**
```bash
# Check backend is running
curl http://localhost:8000/health

# Verify .env
cat .env | grep NEXT_PUBLIC_API_URL
# Should be: NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Docker Issues

#### Container Won't Start

**Cause:** Build errors or dependency issues.

**Solution:**
```bash
# Check container logs
docker compose logs <service>

# Rebuild from scratch
docker compose build --no-cache <service>
docker compose up -d <service>
```

#### Port Conflict

**Cause:** Another container or service using the same port.

**Solution:**
```bash
# Check what's using the port
docker compose ps
netstat -ano | findstr :5432

# Change ports in docker-compose.yml if needed
```

#### Out of Disk Space

**Cause:** Docker images and volumes accumulating.

**Solution:**
```bash
# Prune unused resources
docker system prune -af

# Remove unused volumes
docker volume prune -f
```

#### Container Keeps Restarting

**Cause:** Health check failing or application crash.

**Solution:**
```bash
# Check logs
docker compose logs --tail=50 <service>

# Disable health check temporarily in docker-compose.yml
# Fix the underlying issue
```

### Monitoring Issues

#### Grafana Dashboard Not Showing

**Cause:** Provisioning config missing or Prometheus not connected.

**Solution:**
```bash
# Check Grafana logs
docker compose logs grafana

# Verify provisioning files exist
ls infrastructure/monitoring/grafana/provisioning/
ls infrastructure/monitoring/grafana/dashboards/

# Restart Grafana
docker compose restart grafana
```

#### Prometheus Targets Down

**Cause:** Service endpoints not reachable from Prometheus.

**Solution:**
```bash
# Check targets
curl http://localhost:9090/api/v1/targets

# Verify prometheus config
cat infrastructure/monitoring/prometheus/prometheus.yml

# Check network connectivity
docker compose exec prometheus wget -qO- http://api:8000/health
```

#### Jaeger Not Receiving Traces

**Cause:** OpenTelemetry exporter not configured or network issue.

**Solution:**
```bash
# Check Jaeger is running
curl http://localhost:16686/

# Verify OTEL config in .env
cat .env | grep OTEL

# Check API logs for OTEL errors
docker compose logs api | grep -i otel
```

### AI/LLM Issues

#### OpenAI API Key Invalid

**Cause:** Wrong key or expired key.

**Solution:**
```bash
# Check .env
cat .env | grep OPENAI_API_KEY

# Test the key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

#### Rate Limiting from LLM Providers

**Cause:** Too many requests to OpenAI/Anthropic.

**Solution:**
- Implement exponential backoff (already in codebase via tenacity)
- Use semantic caching (Redis)
- Reduce concurrent AI requests
- Upgrade API tier if needed

#### AI Agent Timeout

**Cause:** LLM response taking too long.

**Solution:**
- Check network connectivity to API provider
- Increase timeout in agent configuration
- Use faster model for time-sensitive operations
- Check for prompt too large (token limits)

### WebSocket Issues

#### WebSocket Connection Fails

**Cause:** Wrong URL or server not handling WS upgrades.

**Solution:**
```bash
# Verify WebSocket endpoint
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://localhost:8000/ws
```

#### Real-time Updates Not Working

**Cause:** WebSocket disconnected or event not emitted.

**Solution:**
- Check browser console for WS errors
- Verify backend is emitting events
- Check Redis is running (for pub/sub)
- Look for CORS issues

## Debugging Tips

### Enable Debug Mode

```bash
# Backend
export DEBUG=true
export LOG_LEVEL=debug

# Frontend
export NEXT_PUBLIC_DEBUG=true
```

### Check Service Health

```bash
# All services
docker compose ps

# Specific service
curl http://localhost:8000/health
curl http://localhost:3000
curl http://localhost:9090/-/healthy
curl http://localhost:3000/api/health
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f postgres --tail=100

# Search logs
docker compose logs api 2>&1 | grep -i error
```

### Database Debugging

```bash
# Connect to database
docker exec -it airos-postgres psql -U airos -d airos

# List tables
\dt

# Check migrations
alembic current

# Run SQL directly
docker exec airos-postgres psql -U airos -d airos -c "SELECT count(*) FROM candidates;"
```

## Getting Help

1. **Check logs:** `docker compose logs -f`
2. **Verify services:** `bash scripts/verify-all.sh`
3. **Run tests:** `cd backend && pytest tests/ -v`
4. **Check health:** `curl http://localhost:8000/health`
5. **Read API docs:** http://localhost:8000/docs
6. **Check architecture:** [ARCHITECTURE.md](../ARCHITECTURE.md)
