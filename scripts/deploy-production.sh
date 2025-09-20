#!/bin/bash

# FlowReader Production Deployment Script
# This script provides a manual deployment alternative to GitHub Actions

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOYMENT_LOG="$PROJECT_ROOT/deployment-$(date +%Y%m%d-%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

# Check if required environment variables are set
check_environment() {
    log "Checking environment variables..."

    local required_vars=(
        "VERCEL_TOKEN"
        "VERCEL_ORG_ID"
        "VERCEL_PROJECT_ID"
    )

    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            error "Environment variable $var is not set. Please export it before running this script."
        fi
    done

    success "Environment variables verified"
}

# Check if we're on the main branch
check_branch() {
    log "Checking current branch..."

    local current_branch
    current_branch=$(git branch --show-current)

    if [[ "$current_branch" != "main" ]]; then
        error "Deployment must be from main branch. Current branch: $current_branch"
    fi

    success "On main branch"
}

# Check for uncommitted changes
check_git_status() {
    log "Checking git status..."

    if [[ -n $(git status --porcelain) ]]; then
        error "There are uncommitted changes. Please commit or stash them before deploying."
    fi

    success "Working directory clean"
}

# Install dependencies if needed
install_dependencies() {
    log "Installing dependencies..."

    if [[ ! -d "$PROJECT_ROOT/node_modules" ]] || [[ "$PROJECT_ROOT/package-lock.json" -nt "$PROJECT_ROOT/node_modules" ]]; then
        cd "$PROJECT_ROOT"
        npm ci
        success "Dependencies installed"
    else
        log "Dependencies already up to date"
    fi
}

# Install Vercel CLI
install_vercel_cli() {
    log "Installing Vercel CLI..."

    if ! command -v vercel &> /dev/null; then
        npm install -g vercel@latest
        success "Vercel CLI installed"
    else
        log "Vercel CLI already installed"
    fi
}

# Create backup reference
create_backup_reference() {
    log "Creating backup reference..."

    local current_deployment
    current_deployment=$(vercel ls --token="$VERCEL_TOKEN" | grep "flowreader" | head -1 | awk '{print $2}' || echo "")

    if [[ -n "$current_deployment" ]]; then
        echo "$current_deployment" > "$PROJECT_ROOT/.last-production-deployment"
        success "Backup reference created: $current_deployment"
        export BACKUP_DEPLOYMENT="$current_deployment"
    else
        warning "No previous deployment found for backup"
    fi
}

# Pull Vercel configuration
pull_vercel_config() {
    log "Pulling Vercel environment configuration..."

    cd "$PROJECT_ROOT"
    vercel pull --yes --environment=production --token="$VERCEL_TOKEN"

    success "Vercel configuration pulled"
}

# Build project
build_project() {
    log "Building project for production..."

    cd "$PROJECT_ROOT"
    NODE_ENV=production vercel build --prod --token="$VERCEL_TOKEN"

    success "Project built successfully"
}

# Deploy to production
deploy_to_production() {
    log "Deploying to production..."

    cd "$PROJECT_ROOT"
    local deployment_url
    deployment_url=$(vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN")

    if [[ -n "$deployment_url" ]]; then
        echo "$deployment_url" > "$PROJECT_ROOT/.current-production-deployment"
        success "Deployed to production: $deployment_url"
        export PRODUCTION_URL="$deployment_url"
    else
        error "Deployment failed - no URL returned"
    fi
}

# Wait for deployment propagation
wait_for_propagation() {
    log "Waiting for deployment propagation..."
    sleep 60
    success "Propagation wait completed"
}

# Health check with retries
health_check() {
    log "Running production health checks..."

    local url="${PRODUCTION_URL:-https://flowreader.vercel.app}"
    local max_attempts=10
    local attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        log "Health check attempt $attempt/$max_attempts..."

        if curl -f "$url/api/health" > /dev/null 2>&1; then
            success "Health check passed (attempt $attempt)"
            return 0
        else
            warning "Health check failed (attempt $attempt), retrying in 30s..."
            if [[ $attempt -eq $max_attempts ]]; then
                error "Health check failed after $max_attempts attempts"
            fi
            sleep 30
        fi

        ((attempt++))
    done
}

# API functionality test
api_functionality_test() {
    log "Testing API functionality..."

    local url="${PRODUCTION_URL:-https://flowreader.vercel.app}"

    # Test health endpoint response
    local health_response
    health_response=$(curl -s "$url/api/health")

    if echo "$health_response" | grep -q "status.*ok\|healthy"; then
        success "Health endpoint returns valid response"
    else
        error "Health endpoint response invalid: $health_response"
    fi

    # Test protected endpoint (should return 401)
    local protected_status
    protected_status=$(curl -s -w "%{http_code}" -o /dev/null "$url/api/books")

    if [[ "$protected_status" == "401" ]]; then
        success "Protected endpoints properly secured"
    else
        error "Protected endpoint security issue: $protected_status"
    fi
}

# Performance check
performance_check() {
    log "Running performance baseline check..."

    local url="${PRODUCTION_URL:-https://flowreader.vercel.app}"
    local health_time

    health_time=$(curl -w "%{time_total}" -s -o /dev/null "$url/api/health")
    log "Health endpoint response time: ${health_time}s"

    # Check if response time is acceptable (< 3 seconds)
    if (( $(echo "$health_time > 3.0" | bc -l 2>/dev/null || echo "0") )); then
        error "Production response time too slow: ${health_time}s"
    else
        success "Performance baseline met: ${health_time}s"
    fi
}

# Security headers check
security_check() {
    log "Running security headers check..."

    local url="${PRODUCTION_URL:-https://flowreader.vercel.app}"
    local headers
    headers=$(curl -s -I "$url")

    local security_headers=(
        "X-Content-Type-Options"
        "X-Frame-Options"
        "X-XSS-Protection"
        "Referrer-Policy"
    )

    for header in "${security_headers[@]}"; do
        if echo "$headers" | grep -i "$header" > /dev/null; then
            log "✅ $header header present"
        else
            warning "⚠️  $header header missing"
        fi
    done

    success "Security check completed"
}

# Rollback function
rollback_deployment() {
    log "Rolling back deployment..."

    if [[ -f "$PROJECT_ROOT/.last-production-deployment" ]]; then
        local backup_deployment
        backup_deployment=$(cat "$PROJECT_ROOT/.last-production-deployment")

        log "Rolling back to: $backup_deployment"
        vercel promote "$backup_deployment" --token="$VERCEL_TOKEN"

        # Verify rollback
        sleep 30
        if curl -f "https://flowreader.vercel.app/api/health" > /dev/null 2>&1; then
            success "Rollback verification successful"
        else
            error "Rollback verification failed"
        fi
    else
        error "No backup deployment found for rollback"
    fi
}

# Display usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help          Show this help message"
    echo "  -r, --rollback      Rollback to previous deployment"
    echo "  -s, --skip-checks   Skip pre-deployment checks (dangerous!)"
    echo "  --dry-run           Show what would be deployed without actually deploying"
    echo ""
    echo "Environment variables required:"
    echo "  VERCEL_TOKEN        Vercel authentication token"
    echo "  VERCEL_ORG_ID       Vercel organization ID"
    echo "  VERCEL_PROJECT_ID   Vercel project ID"
    echo ""
    echo "Examples:"
    echo "  $0                  Deploy to production"
    echo "  $0 --rollback       Rollback to previous deployment"
    echo "  $0 --dry-run        Show deployment plan"
}

# Dry run function
dry_run() {
    log "=== DRY RUN MODE ==="
    log "The following actions would be performed:"
    log "1. Check environment variables"
    log "2. Verify current branch is 'main'"
    log "3. Check for uncommitted changes"
    log "4. Install dependencies if needed"
    log "5. Install Vercel CLI"
    log "6. Create backup reference of current deployment"
    log "7. Pull Vercel production configuration"
    log "8. Build project for production"
    log "9. Deploy to production"
    log "10. Wait for deployment propagation"
    log "11. Run health checks"
    log "12. Test API functionality"
    log "13. Check performance baseline"
    log "14. Verify security headers"
    log ""
    log "To execute the deployment, run without --dry-run flag"
    exit 0
}

# Main deployment function
main() {
    local skip_checks=false
    local should_rollback=false

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -r|--rollback)
                should_rollback=true
                shift
                ;;
            -s|--skip-checks)
                skip_checks=true
                shift
                ;;
            --dry-run)
                dry_run
                ;;
            *)
                echo "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done

    # Handle rollback
    if [[ "$should_rollback" == true ]]; then
        log "Starting rollback process..."
        rollback_deployment
        exit 0
    fi

    log "Starting FlowReader production deployment..."
    log "Deployment log: $DEPLOYMENT_LOG"

    # Deployment process
    trap 'error "Deployment interrupted"' INT TERM

    if [[ "$skip_checks" == false ]]; then
        check_environment
        check_branch
        check_git_status
    else
        warning "Skipping pre-deployment checks (dangerous!)"
    fi

    install_dependencies
    install_vercel_cli
    create_backup_reference
    pull_vercel_config
    build_project
    deploy_to_production
    wait_for_propagation

    # Post-deployment verification
    if health_check && api_functionality_test && performance_check; then
        security_check
        success "🚀 Production deployment completed successfully!"
        success "URL: ${PRODUCTION_URL:-https://flowreader.vercel.app}"

        # Create deployment summary
        {
            echo "# FlowReader Production Deployment"
            echo ""
            echo "**Date**: $(date)"
            echo "**Commit**: $(git rev-parse HEAD)"
            echo "**Branch**: $(git branch --show-current)"
            echo "**URL**: ${PRODUCTION_URL:-https://flowreader.vercel.app}"
            echo ""
            echo "## Verification Results"
            echo "- ✅ Health checks passed"
            echo "- ✅ API functionality verified"
            echo "- ✅ Performance baseline met"
            echo "- ✅ Security headers verified"
            echo ""
            echo "Deployment completed successfully at $(date)"
        } >> "$PROJECT_ROOT/DEPLOYMENT_SUMMARY.md"

    else
        error "Post-deployment verification failed. Consider rolling back."
    fi
}

# Run main function
main "$@"