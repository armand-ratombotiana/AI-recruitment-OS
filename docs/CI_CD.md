# CI/CD Pipeline Guide

## Overview

AI-ROS uses GitHub Actions for continuous integration and deployment with five core pipelines:

| Pipeline | File | Trigger | Purpose |
|----------|------|---------|---------|
| CI | `.github/workflows/ci.yml` | Push/PR to main, develop | Lint, test, build verification |
| CD | `.github/workflows/cd.yml` | CI success on main/develop | Deploy to staging/production |
| Release | `.github/workflows/release.yml` | Tag push (`v*.*.*`) | Versioned releases |
| Security | `.github/workflows/security.yml` | Push/PR, weekly schedule | Vulnerability scanning |
| Performance | `.github/workflows/performance.yml` | Push to main, weekly | Load testing, benchmarks |

## Pipeline Details

### CI Pipeline (`ci.yml`)

Runs on every push and pull request to `main` and `develop`.

**Jobs:**
1. **Backend Lint & Type Check** - ruff lint, ruff format, mypy
2. **Backend Tests** - pytest with coverage (requires PostgreSQL + Redis services)
3. **Frontend Lint** - ESLint + TypeScript type checking
4. **Frontend Build** - Next.js production build
5. **Docker Build Verification** - Build both Docker images without pushing
6. **CI Summary** - Aggregate pass/fail status

**Branch behavior:**
- PRs: Full CI suite, no deployment
- Push to `develop`: CI + triggers CD staging
- Push to `main`: CI + triggers CD production

### CD Pipeline (`cd.yml`)

Triggered after successful CI runs. Supports manual dispatch.

**Jobs:**
1. **Validate** - Resolve environment and image tag
2. **Docker Push** - Build and push images to ECR
3. **Deploy Staging** - Helm deploy to staging (auto on `develop`)
4. **Deploy Production** - Helm deploy to production (auto on `main`)
5. **Post-Deploy Verification** - Smoke tests and status reporting

**Environments:**
- `staging` - Auto-deployed from `develop` branch
- `production` - Auto-deployed from `main` branch, requires approval

**Production safeguards:**
- Pre-deploy database backup to S3
- Automatic rollback on health check failure
- Canary-style deployment with higher replica counts

### Release Pipeline (`release.yml`)

Triggered by semantic version tags: `v1.0.0`, `v1.0.0-rc.1`, `v1.0.0-beta.1`.

**Jobs:**
1. **Validate Release** - Extract version, generate changelog
2. **Pre-Release Tests** - Full backend + frontend test suite
3. **Build Artifacts** - Docker images as release artifacts
4. **Create GitHub Release** - Release notes, artifacts, deployment instructions
5. **Publish Images** - Push to ECR (stable releases only)

### Security Pipeline (`security.yml`)

Runs on push, PR, weekly schedule (Monday 6AM), and manual dispatch.

**Scans:**
- **Dependency Scan** - Trivy filesystem scan for vulnerable dependencies
- **Docker Image Scan** - Trivy container image scanning
- **Secret Detection** - Gitleaks for leaked credentials
- **CodeQL Analysis** - GitHub's semantic code analysis (Python + JavaScript)
- **License Compliance** - Check for copyleft licenses
- **SBOM Generation** - CycloneDX software bill of materials

### Performance Pipeline (`performance.yml`)

Runs on push to `main`, PRs affecting backend/frontend, weekly schedule (Saturday 2AM).

**Tests:**
- **Backend Load Test** - k6 load testing (50-100 concurrent users)
- **Frontend Performance** - Lighthouse CI scoring
- **Bundle Analysis** - Next.js bundle size tracking
- **Database Benchmarks** - Query performance benchmarks

## Reusable Templates

### Docker Build Template (`templates/docker-build.yml`)

Reusable workflow for building Docker images with:
- Multi-platform support
- ECR push with metadata tagging
- Integrated Trivy scanning
- GitHub Actions cache

**Usage:**
```yaml
jobs:
  build:
    uses: ./.github/workflows/templates/docker-build.yml
    with:
      component: backend
      dockerfile: Dockerfile.backend
      image_name: airos-api
      push: true
    secrets:
      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

### Kubernetes Deploy Template (`templates/k8s-deploy.yml`)

Reusable workflow for Helm-based Kubernetes deployments:
- EKS cluster configuration
- Pre-deploy backups (production)
- Rollout verification
- Automatic rollback on failure
- Smoke tests

**Usage:**
```yaml
jobs:
  deploy:
    uses: ./.github/workflows/templates/k8s-deploy.yml
    with:
      environment: staging
      image_tag: ${{ github.sha }}
    secrets:
      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

## Automation Scripts

Located in `scripts/ci/`:

### `lint.sh`
Runs all linting checks locally:
```bash
./scripts/ci/lint.sh
```
- Backend: ruff check, ruff format, mypy
- Frontend: ESLint, TypeScript
- Docker: hadolint (if installed)

### `test.sh`
Runs test suite locally:
```bash
./scripts/ci/test.sh                  # Basic
./scripts/ci/test.sh --coverage       # With coverage report
./scripts/ci/test.sh --verbose        # Verbose output
```
- Backend: pytest with configurable coverage
- Frontend: ESLint + TypeScript check

### `build.sh`
Builds Docker images locally:
```bash
./scripts/ci/build.sh                              # Build all
./scripts/ci/build.sh --component backend          # Single component
./scripts/ci/build.sh --tag v1.0.0 --no-cache      # Custom tag, no cache
./scripts/ci/build.sh --push --tag latest          # Build and push
```

### `deploy.sh`
Deploys via Helm to Kubernetes:
```bash
./scripts/ci/deploy.sh --env staging --tag abc123
./scripts/ci/deploy.sh --env production --tag v1.0.0 --dry-run
./scripts/ci/deploy.sh --env staging --tag latest --skip-health
```

## Environment Setup

### Required GitHub Secrets

| Secret | Purpose | Required By |
|--------|---------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS authentication | CD, Release |
| `AWS_SECRET_ACCESS_KEY` | AWS authentication | CD, Release |
| `AWS_ACCOUNT_ID` | ECR registry URL | CD |

### Required Infrastructure

| Resource | Purpose |
|----------|---------|
| ECR Repository (`airos-api`) | Backend image storage |
| ECR Repository (`airos-frontend`) | Frontend image storage |
| EKS Cluster (`airos-staging`) | Staging environment |
| EKS Cluster (`airos-production`) | Production environment |
| S3 Bucket | Database backups |

### Environment Variables

Set in GitHub Environment settings:

**Staging:**
- `ENVIRONMENT=staging`
- `NEXT_PUBLIC_API_URL=https://staging-api.ai-ros.com`

**Production:**
- `ENVIRONMENT=production`
- `NEXT_PUBLIC_API_URL=https://api.ai-ros.com`

## Workflow Diagram

```
Push/PR
  |
  v
[CI Pipeline]
  |
  +-- Backend Lint
  +-- Backend Test (pgvector + redis)
  +-- Frontend Lint
  +-- Frontend Build
  +-- Docker Build Verification
  |
  v (on success, push to main/develop)
[CD Pipeline]
  |
  +-- Docker Push to ECR
  +-- Helm Deploy (staging or production)
  +-- Smoke Tests
  +-- Rollback on failure
  |
  v (on tag push)
[Release Pipeline]
  |
  +-- Pre-release tests
  +-- Build artifacts
  +-- GitHub Release
  +-- Publish images (stable only)

Parallel:
[Security Pipeline] -- runs independently
[Performance Pipeline] -- runs on main + weekly
```

## Local Development

Run the CI pipeline locally:

```bash
# Install act (https://github.com/nektos/act)
brew install act

# Run CI locally
act -j backend-lint
act -j frontend-lint

# Or use scripts directly
./scripts/ci/lint.sh
./scripts/ci/test.sh --coverage
./scripts/ci/build.sh --tag dev
```

## Troubleshooting

### CI fails on dependency installation
- Clear pip cache: `pip cache purge`
- Clear npm cache: `npm cache clean --force`
- Check `requirements.txt` and `package-lock.json` are up to date

### Docker build fails
- Verify Dockerfiles match the project structure
- Check `.dockerignore` excludes unnecessary files
- Run `./scripts/ci/build.sh --no-cache` to rule out cache issues

### Deployment fails
- Verify EKS cluster exists and is accessible
- Check Helm chart values match the environment
- Use `--dry-run` to preview changes: `./scripts/ci/deploy.sh --env staging --tag latest --dry-run`
- Check rollout status: `kubectl rollout status deployment/airos-api -n staging`

### Security scan false positives
- Add suppressions to `.trivyignore`
- Update dependency versions
- Review and accept risks in security dashboard
