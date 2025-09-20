#!/bin/bash

# FlowReader Production Readiness Verification Script
# Comprehensive pre-production checks and validation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REQUIRED_NODE_VERSION="18"

# Counters for final report
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Arrays to store results
PASSED_ITEMS=()
FAILED_ITEMS=()
WARNING_ITEMS=()

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    PASSED_ITEMS+=("$1")
    ((PASSED_CHECKS++))
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
    WARNING_ITEMS+=("$1")
    ((WARNING_CHECKS++))
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    FAILED_ITEMS+=("$1")
    ((FAILED_CHECKS++))
}

log_section() {
    echo -e "\n${PURPLE}=== $1 ===${NC}"
}

# Increment total checks counter
check() {
    ((TOTAL_CHECKS++))
}

# Environment and dependency checks
check_environment() {
    log_section "Environment Verification"

    # Node.js version
    check
    if command -v node &> /dev/null; then
        node_version=$(node --version | sed 's/v//' | cut -d. -f1)
        if [ "$node_version" -ge "$REQUIRED_NODE_VERSION" ]; then
            log_success "Node.js version: v$(node --version | sed 's/v//')"
        else
            log_error "Node.js version too old: v$(node --version | sed 's/v//') (required: v$REQUIRED_NODE_VERSION+)"
        fi
    else
        log_error "Node.js not installed"
    fi

    # npm
    check
    if command -v npm &> /dev/null; then
        log_success "npm available: v$(npm --version)"
    else
        log_error "npm not available"
    fi

    # Vercel CLI
    check
    if command -v vercel &> /dev/null; then
        log_success "Vercel CLI available: v$(vercel --version)"
    else
        log_error "Vercel CLI not installed"
    fi

    # Git
    check
    if command -v git &> /dev/null; then
        log_success "Git available: v$(git --version | cut -d' ' -f3)"
    else
        log_error "Git not available"
    fi

    # Supabase CLI
    check
    if command -v supabase &> /dev/null; then
        log_success "Supabase CLI available: v$(supabase --version)"
    else
        log_warning "Supabase CLI not available (optional but recommended)"
    fi
}

check_project_structure() {
    log_section "Project Structure Verification"

    cd "$PROJECT_ROOT"

    # Essential files
    local required_files=(
        "package.json"
        "vercel.json"
        ".env.example"
        "apps/web/package.json"
    )

    for file in "${required_files[@]}"; do
        check
        if [ -f "$file" ]; then
            log_success "Required file exists: $file"
        else
            log_error "Missing required file: $file"
        fi
    done

    # API endpoints
    local required_api_endpoints=(
        "api/health.ts"
        "api/auth/login.ts"
        "api/auth/register.ts"
    )

    for endpoint in "${required_api_endpoints[@]}"; do
        check
        if [ -f "$endpoint" ]; then
            log_success "API endpoint exists: $endpoint"
        else
            log_error "Missing API endpoint: $endpoint"
        fi
    done

    # Documentation
    local required_docs=(
        "README.md"
        "docs/ops/deploy_runbook.md"
    )

    for doc in "${required_docs[@]}"; do
        check
        if [ -f "$doc" ]; then
            log_success "Documentation exists: $doc"
        else
            log_warning "Missing documentation: $doc"
        fi
    done
}

check_dependencies() {
    log_section "Dependency Analysis"

    cd "$PROJECT_ROOT"

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies..."
        npm ci
    fi

    # Security audit
    check
    log_info "Running security audit..."
    if npm audit --audit-level=high --parseable | grep -q ""; then
        log_error "High severity vulnerabilities found in dependencies"
        npm audit --audit-level=high
    else
        log_success "No high severity vulnerabilities found"
    fi

    # Outdated packages
    check
    log_info "Checking for outdated packages..."
    outdated_count=$(npm outdated --parseable 2>/dev/null | wc -l || echo "0")
    if [ "$outdated_count" -gt 10 ]; then
        log_warning "Many outdated packages found ($outdated_count). Consider updating."
    elif [ "$outdated_count" -gt 0 ]; then
        log_warning "Some outdated packages found ($outdated_count)"
    else
        log_success "Dependencies are up to date"
    fi
}

check_code_quality() {
    log_section "Code Quality Verification"

    cd "$PROJECT_ROOT"

    # TypeScript compilation
    check
    log_info "Running TypeScript type checking..."
    if npm run type-check 2>/dev/null; then
        log_success "TypeScript compilation successful"
    else
        log_error "TypeScript compilation failed"
    fi

    # Linting
    check
    log_info "Running ESLint..."
    if npm run lint 2>/dev/null; then
        log_success "Linting passed"
    else
        log_error "Linting failed"
    fi

    # Build test
    check
    log_info "Testing production build..."
    if NODE_ENV=production npm run build 2>/dev/null; then
        log_success "Production build successful"

        # Check build artifacts
        if [ -d "apps/web/build" ]; then
            build_size=$(du -sh apps/web/build | cut -f1)
            log_success "Build artifacts created (size: $build_size)"
        else
            log_warning "Build artifacts location unexpected"
        fi
    else
        log_error "Production build failed"
    fi
}

check_environment_configuration() {
    log_section "Environment Configuration"

    cd "$PROJECT_ROOT"

    # Environment template
    check
    if [ -f ".env.example" ]; then
        log_success ".env.example template exists"

        # Check required variables
        local required_vars=(
            "PUBLIC_SUPABASE_URL"
            "PUBLIC_SUPABASE_ANON_KEY"
            "SUPABASE_SERVICE_ROLE_KEY"
            "OPENAI_API_KEY"
            "JWT_SECRET"
        )

        for var in "${required_vars[@]}"; do
            check
            if grep -q "^$var=" .env.example; then
                log_success "Required variable documented: $var"
            else
                log_error "Missing required variable in .env.example: $var"
            fi
        done
    else
        log_error ".env.example not found"
    fi

    # Vercel configuration
    check
    if [ -f "vercel.json" ]; then
        log_success "Vercel configuration exists"

        # Check important configurations
        if grep -q '"functions"' vercel.json; then
            log_success "Vercel functions configuration found"
        else
            log_warning "No Vercel functions configuration"
        fi

        if grep -q '"headers"' vercel.json; then
            log_success "Security headers configured"
        else
            log_warning "Security headers not configured"
        fi
    else
        log_error "vercel.json not found"
    fi
}

check_security_configuration() {
    log_section "Security Configuration"

    cd "$PROJECT_ROOT"

    # Check for hardcoded secrets
    check
    log_info "Scanning for potential hardcoded secrets..."
    secret_patterns=(
        "sk-[a-zA-Z0-9]{32,}"  # OpenAI API keys
        "eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*"  # JWT tokens
        "postgres://[^\\s]*"  # Database URLs
    )

    secrets_found=0
    for pattern in "${secret_patterns[@]}"; do
        if grep -r -E "$pattern" --exclude-dir=node_modules --exclude="*.log" . 2>/dev/null; then
            ((secrets_found++))
        fi
    done

    if [ $secrets_found -eq 0 ]; then
        log_success "No hardcoded secrets detected"
    else
        log_error "Potential hardcoded secrets found ($secrets_found patterns matched)"
    fi

    # Check .gitignore
    check
    if [ -f ".gitignore" ]; then
        if grep -q ".env" .gitignore; then
            log_success ".env files properly ignored"
        else
            log_error ".env files not in .gitignore"
        fi
    else
        log_warning ".gitignore not found"
    fi

    # Check for secure headers in Vercel config
    check
    if [ -f "vercel.json" ]; then
        if grep -q "X-Content-Type-Options\|X-Frame-Options\|X-XSS-Protection" vercel.json; then
            log_success "Security headers configured in Vercel"
        else
            log_warning "Security headers not configured in Vercel"
        fi
    fi
}

check_database_configuration() {
    log_section "Database Configuration"

    cd "$PROJECT_ROOT"

    # Supabase migrations
    check
    if [ -d "supabase/migrations" ]; then
        migration_count=$(find supabase/migrations -name "*.sql" | wc -l)
        if [ "$migration_count" -gt 0 ]; then
            log_success "Database migrations found ($migration_count files)"
        else
            log_warning "No database migrations found"
        fi
    else
        log_warning "Supabase migrations directory not found"
    fi

    # Database types
    check
    if [ -f "packages/shared/src/types/supabase.ts" ]; then
        log_success "Database type definitions exist"
    else
        log_warning "Database type definitions not found"
    fi
}

check_deployment_readiness() {
    log_section "Deployment Readiness"

    cd "$PROJECT_ROOT"

    # Git status
    check
    if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
        log_warning "Working directory has uncommitted changes"
        git status --short
    else
        log_success "Working directory is clean"
    fi

    # Branch check
    check
    current_branch=$(git branch --show-current 2>/dev/null || echo "unknown")
    if [ "$current_branch" = "main" ]; then
        log_success "On main branch"
    else
        log_warning "Not on main branch (current: $current_branch)"
    fi

    # Recent commits
    check
    if command -v git &> /dev/null && git rev-parse --git-dir > /dev/null 2>&1; then
        commits_ahead=$(git rev-list --count HEAD ^origin/main 2>/dev/null || echo "unknown")
        if [ "$commits_ahead" = "0" ]; then
            log_success "Branch is up to date with origin/main"
        elif [ "$commits_ahead" = "unknown" ]; then
            log_warning "Could not determine branch status"
        else
            log_warning "$commits_ahead commits ahead of origin/main"
        fi
    fi

    # Scripts executability
    local scripts=(
        "scripts/deploy-staging.sh"
        "scripts/verify-deployment.sh"
        "scripts/verify-production-readiness.sh"
    )

    for script in "${scripts[@]}"; do
        check
        if [ -x "$script" ]; then
            log_success "Script is executable: $script"
        else
            log_warning "Script not executable: $script"
        fi
    done
}

check_monitoring_setup() {
    log_section "Monitoring and Observability"

    # Error tracking configuration
    check
    if grep -r "sentry\|datadog\|newrelic" --exclude-dir=node_modules . 2>/dev/null | grep -v "example" | head -1 >/dev/null; then
        log_success "Error tracking service configured"
    else
        log_warning "No error tracking service found"
    fi

    # Health check endpoint
    check
    if [ -f "api/health.ts" ]; then
        log_success "Health check endpoint exists"
    else
        log_error "Health check endpoint missing"
    fi

    # Logging configuration
    check
    if grep -r "console\.\(log\|error\|warn\|info\)" --exclude-dir=node_modules . 2>/dev/null | head -5 >/dev/null; then
        log_success "Logging statements found in code"
    else
        log_warning "Limited logging found"
    fi
}

perform_staging_verification() {
    log_section "Staging Environment Verification"

    # Check if staging URL is available
    check
    if [ -f "$PROJECT_ROOT/.staging-url" ]; then
        staging_url=$(cat "$PROJECT_ROOT/.staging-url")
        log_info "Found staging URL: $staging_url"

        # Test staging deployment
        if curl -f -s "$staging_url/api/health" >/dev/null 2>&1; then
            log_success "Staging environment is accessible"
        else
            log_warning "Staging environment not accessible"
        fi
    else
        log_warning "No staging URL found. Run deploy-staging.sh first."
    fi
}

generate_final_report() {
    log_section "Production Readiness Assessment"

    echo -e "\n${BLUE}📊 Summary Report${NC}"
    echo "=================="
    echo "Total Checks: $TOTAL_CHECKS"
    echo -e "${GREEN}Passed: $PASSED_CHECKS${NC}"
    echo -e "${YELLOW}Warnings: $WARNING_CHECKS${NC}"
    echo -e "${RED}Failed: $FAILED_CHECKS${NC}"

    # Calculate success rate
    success_rate=$(( (PASSED_CHECKS * 100) / TOTAL_CHECKS ))
    echo "Success Rate: $success_rate%"

    echo -e "\n${BLUE}📋 Detailed Results${NC}"
    echo "==================="

    if [ ${#FAILED_ITEMS[@]} -gt 0 ]; then
        echo -e "\n${RED}❌ Failed Checks:${NC}"
        for item in "${FAILED_ITEMS[@]}"; do
            echo "  • $item"
        done
    fi

    if [ ${#WARNING_ITEMS[@]} -gt 0 ]; then
        echo -e "\n${YELLOW}⚠️  Warnings:${NC}"
        for item in "${WARNING_ITEMS[@]}"; do
            echo "  • $item"
        done
    fi

    echo -e "\n${BLUE}🎯 Production Readiness Decision${NC}"
    echo "================================="

    # Decision logic
    if [ $FAILED_CHECKS -eq 0 ] && [ $WARNING_CHECKS -le 3 ]; then
        echo -e "${GREEN}✅ GO - READY FOR PRODUCTION${NC}"
        echo "All critical checks passed. Production deployment is recommended."
        return 0
    elif [ $FAILED_CHECKS -le 2 ] && [ $WARNING_CHECKS -le 5 ]; then
        echo -e "${YELLOW}⚠️  CAUTION - PRODUCTION DEPLOYMENT WITH RISKS${NC}"
        echo "Some issues detected. Consider fixing before production deployment."
        return 1
    else
        echo -e "${RED}❌ NO-GO - NOT READY FOR PRODUCTION${NC}"
        echo "Significant issues detected. Fix critical problems before deployment."
        return 2
    fi
}

# Main execution
main() {
    echo -e "${PURPLE}"
    echo "╔══════════════════════════════════════════════════════════════════════════════╗"
    echo "║                   FlowReader Production Readiness Verification               ║"
    echo "║                                                                              ║"
    echo "║  This script performs comprehensive checks to determine if FlowReader        ║"
    echo "║  is ready for production deployment.                                        ║"
    echo "╚══════════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}\n"

    # Run all verification checks
    check_environment
    check_project_structure
    check_dependencies
    check_code_quality
    check_environment_configuration
    check_security_configuration
    check_database_configuration
    check_deployment_readiness
    check_monitoring_setup
    perform_staging_verification

    # Generate final report and decision
    generate_final_report
}

# Execute main function
main "$@"