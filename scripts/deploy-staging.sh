#!/bin/bash

# FlowReader Staging Deployment Script
# This script deploys FlowReader to staging environment (Vercel preview)

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
STAGING_BRANCH="main"
REQUIRED_NODE_VERSION="18"

# Logging functions
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

# Utility functions
check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

check_node_version() {
    local node_version
    node_version=$(node --version | sed 's/v//' | cut -d. -f1)

    if [ "$node_version" -lt "$REQUIRED_NODE_VERSION" ]; then
        log_error "Node.js version $REQUIRED_NODE_VERSION or higher is required. Found: v$node_version"
        exit 1
    fi

    log_success "Node.js version check passed: v$(node --version | sed 's/v//')"
}

check_environment() {
    log_info "Checking deployment environment..."

    # Check required commands
    check_command "node"
    check_command "npm"
    check_command "vercel"
    check_command "git"

    # Check Node.js version
    check_node_version

    # Check if we're in project root
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        log_error "package.json not found. Please run this script from the project root."
        exit 1
    fi

    # Check if Vercel is authenticated
    if ! vercel whoami &> /dev/null; then
        log_error "Vercel CLI not authenticated. Run 'vercel login' first."
        exit 1
    fi

    log_success "Environment checks passed"
}

check_git_status() {
    log_info "Checking Git status..."

    cd "$PROJECT_ROOT"

    # Check if working directory is clean
    if [ -n "$(git status --porcelain)" ]; then
        log_warning "Working directory has uncommitted changes:"
        git status --short
        read -p "Continue with deployment? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled"
            exit 0
        fi
    fi

    # Check current branch
    current_branch=$(git branch --show-current)
    if [ "$current_branch" != "$STAGING_BRANCH" ]; then
        log_warning "Current branch is '$current_branch', expected '$STAGING_BRANCH'"
        read -p "Continue with deployment from '$current_branch'? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled"
            exit 0
        fi
    fi

    log_success "Git status check completed"
}

run_pre_deployment_tests() {
    log_info "Running pre-deployment tests..."

    cd "$PROJECT_ROOT"

    # Install dependencies
    log_info "Installing dependencies..."
    npm ci --prefer-offline

    # Type checking
    log_info "Running type checks..."
    if npm run type-check; then
        log_success "Type checks passed"
    else
        log_error "Type checks failed"
        exit 1
    fi

    # Linting
    log_info "Running linter..."
    if npm run lint; then
        log_success "Linting passed"
    else
        log_error "Linting failed"
        exit 1
    fi

    # Build test
    log_info "Testing build..."
    if npm run build; then
        log_success "Build test passed"
    else
        log_error "Build failed"
        exit 1
    fi

    log_success "Pre-deployment tests completed"
}

deploy_to_staging() {
    log_info "Deploying to staging..."

    cd "$PROJECT_ROOT"

    # Deploy to Vercel staging (preview)
    log_info "Deploying to Vercel preview environment..."

    # Pull environment configuration
    vercel pull --yes --environment=preview

    # Build for staging
    NODE_ENV=staging vercel build

    # Deploy
    staging_url=$(vercel deploy --prebuilt)

    if [ $? -eq 0 ]; then
        log_success "Deployed to staging: $staging_url"
        echo "$staging_url" > "$PROJECT_ROOT/.staging-url"
    else
        log_error "Staging deployment failed"
        exit 1
    fi

    echo "STAGING_URL=$staging_url"
}

run_smoke_tests() {
    log_info "Running smoke tests against staging..."

    # Get staging URL
    if [ -f "$PROJECT_ROOT/.staging-url" ]; then
        staging_url=$(cat "$PROJECT_ROOT/.staging-url")
    else
        log_error "Staging URL not found. Deployment may have failed."
        exit 1
    fi

    log_info "Testing staging deployment at: $staging_url"

    # Wait for deployment to be ready
    log_info "Waiting for deployment to be ready..."
    sleep 30

    # Health check
    log_info "Running health check..."
    for i in {1..5}; do
        if curl -f "$staging_url/api/health" > /dev/null 2>&1; then
            log_success "Health check passed"
            break
        else
            log_warning "Health check failed (attempt $i/5), retrying in 10s..."
            if [ $i -eq 5 ]; then
                log_error "Health check failed after 5 attempts"
                exit 1
            fi
            sleep 10
        fi
    done

    # Test API endpoints
    log_info "Testing API endpoints..."

    # Test protected endpoint (should return 401)
    response_code=$(curl -s -w "%{http_code}" -o /dev/null "$staging_url/api/books")
    if [ "$response_code" = "401" ]; then
        log_success "Protected endpoints properly secured"
    else
        log_error "Protected endpoint security issue: $response_code"
        exit 1
    fi

    # Test frontend
    log_info "Testing frontend..."
    response_code=$(curl -s -w "%{http_code}" -o /dev/null "$staging_url")
    if [ "$response_code" = "200" ]; then
        log_success "Frontend accessible"
    else
        log_error "Frontend not accessible: $response_code"
        exit 1
    fi

    # Performance check
    log_info "Running performance check..."
    response_time=$(curl -w "%{time_total}" -s -o /dev/null "$staging_url/api/health")
    log_info "Health endpoint response time: ${response_time}s"

    if (( $(echo "$response_time > 5.0" | bc -l) )); then
        log_warning "Response time is high: ${response_time}s"
    else
        log_success "Response time acceptable: ${response_time}s"
    fi

    log_success "Smoke tests completed successfully"
}

cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f "$PROJECT_ROOT/.staging-url"
}

# Main deployment flow
main() {
    log_info "Starting FlowReader staging deployment..."

    # Trap to ensure cleanup on exit
    trap cleanup EXIT

    # Pre-deployment checks
    check_environment
    check_git_status

    # Run tests
    run_pre_deployment_tests

    # Deploy
    deploy_to_staging

    # Verify deployment
    run_smoke_tests

    log_success "🚀 Staging deployment completed successfully!"

    if [ -f "$PROJECT_ROOT/.staging-url" ]; then
        staging_url=$(cat "$PROJECT_ROOT/.staging-url")
        log_info "Staging URL: $staging_url"
        log_info "You can now test the staging environment before production deployment."
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --force)
            FORCE_DEPLOY=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-tests    Skip pre-deployment tests (not recommended)"
            echo "  --force         Force deployment even with uncommitted changes"
            echo "  -h, --help      Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main function
main