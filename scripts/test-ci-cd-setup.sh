#!/bin/bash

# FlowReader CI/CD Pipeline Setup Test
# Validates that all CI/CD components are properly configured

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

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Arrays for results
PASSED_ITEMS=()
FAILED_ITEMS=()

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    PASSED_ITEMS+=("$1")
    ((PASSED_TESTS++))
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    FAILED_ITEMS+=("$1")
    ((FAILED_TESTS++))
}

log_section() {
    echo -e "\n${PURPLE}=== $1 ===${NC}"
}

# Test helper
test_item() {
    ((TOTAL_TESTS++))
}

print_header() {
    echo -e "${PURPLE}"
    echo "╔══════════════════════════════════════════════════════════════════════════════╗"
    echo "║                        FlowReader CI/CD Setup Test                          ║"
    echo "║                                                                              ║"
    echo "║  This script validates the complete CI/CD pipeline configuration.           ║"
    echo "╚══════════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}\n"
}

# Test GitHub Actions workflows
test_github_workflows() {
    log_section "GitHub Actions Workflows"

    cd "$PROJECT_ROOT"

    # Check .github directory structure
    test_item
    if [ -d ".github/workflows" ]; then
        log_success ".github/workflows directory exists"
    else
        log_error ".github/workflows directory missing"
    fi

    # Test CI workflow
    test_item
    if [ -f ".github/workflows/ci.yml" ]; then
        log_success "CI workflow file exists"

        # Test YAML syntax
        if python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" 2>/dev/null; then
            log_success "CI workflow YAML syntax is valid"
        else
            log_error "CI workflow YAML syntax is invalid"
        fi
    else
        log_error "CI workflow file missing"
    fi

    # Test staging deployment workflow
    test_item
    if [ -f ".github/workflows/deploy-staging.yml" ]; then
        log_success "Staging deployment workflow exists"

        # Test YAML syntax
        if python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-staging.yml'))" 2>/dev/null; then
            log_success "Staging workflow YAML syntax is valid"
        else
            log_error "Staging workflow YAML syntax is invalid"
        fi
    else
        log_error "Staging deployment workflow missing"
    fi

    # Test production deployment workflow
    test_item
    if [ -f ".github/workflows/deploy-production.yml" ]; then
        log_success "Production deployment workflow exists"

        # Test YAML syntax
        if python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-production.yml'))" 2>/dev/null; then
            log_success "Production workflow YAML syntax is valid"
        else
            log_error "Production workflow YAML syntax is invalid"
        fi
    else
        log_error "Production deployment workflow missing"
    fi

    # Check workflow content
    test_item
    if grep -q "uses: actions/checkout@v4" .github/workflows/*.yml; then
        log_success "Workflows use latest checkout action"
    else
        log_error "Workflows may use outdated checkout action"
    fi

    test_item
    if grep -q "uses: actions/setup-node@v4" .github/workflows/*.yml; then
        log_success "Workflows use latest Node.js setup action"
    else
        log_error "Workflows may use outdated Node.js setup action"
    fi
}

# Test deployment scripts
test_deployment_scripts() {
    log_section "Deployment Scripts"

    cd "$PROJECT_ROOT"

    local required_scripts=(
        "scripts/deploy-staging.sh"
        "scripts/verify-deployment.sh"
        "scripts/verify-production-readiness.sh"
        "scripts/verify-setup.sh"
        "scripts/test-api-endpoints.sh"
        "scripts/install-deps.sh"
    )

    for script in "${required_scripts[@]}"; do
        test_item
        if [ -f "$script" ]; then
            if [ -x "$script" ]; then
                log_success "Script exists and is executable: $script"
            else
                log_error "Script exists but is not executable: $script"
            fi
        else
            log_error "Missing required script: $script"
        fi
    done

    # Test script syntax
    test_item
    if bash -n scripts/deploy-staging.sh 2>/dev/null; then
        log_success "deploy-staging.sh has valid bash syntax"
    else
        log_error "deploy-staging.sh has syntax errors"
    fi

    test_item
    if bash -n scripts/verify-deployment.sh 2>/dev/null; then
        log_success "verify-deployment.sh has valid bash syntax"
    else
        log_error "verify-deployment.sh has syntax errors"
    fi
}

# Test project configuration
test_project_configuration() {
    log_section "Project Configuration"

    cd "$PROJECT_ROOT"

    # Test essential files
    local required_files=(
        "package.json"
        "vercel.json"
        ".env.example"
        "docs/ops/deploy_runbook.md"
        "docs/ops/ci_cd_guide.md"
    )

    for file in "${required_files[@]}"; do
        test_item
        if [ -f "$file" ]; then
            log_success "Required file exists: $file"
        else
            log_error "Missing required file: $file"
        fi
    done

    # Test package.json scripts
    test_item
    if jq -e '.scripts.build' package.json > /dev/null 2>&1; then
        log_success "package.json has build script"
    else
        log_error "package.json missing build script"
    fi

    test_item
    if jq -e '.scripts.test' package.json > /dev/null 2>&1; then
        log_success "package.json has test script"
    else
        log_error "package.json missing test script"
    fi

    test_item
    if jq -e '.scripts."type-check"' package.json > /dev/null 2>&1; then
        log_success "package.json has type-check script"
    else
        log_error "package.json missing type-check script"
    fi

    # Test vercel.json configuration
    test_item
    if jq -e '.functions' vercel.json > /dev/null 2>&1; then
        log_success "vercel.json has functions configuration"
    else
        log_error "vercel.json missing functions configuration"
    fi

    test_item
    if jq -e '.headers' vercel.json > /dev/null 2>&1; then
        log_success "vercel.json has security headers"
    else
        log_error "vercel.json missing security headers"
    fi
}

# Test environment configuration
test_environment_configuration() {
    log_section "Environment Configuration"

    cd "$PROJECT_ROOT"

    # Test .env.example
    test_item
    if [ -f ".env.example" ]; then
        local required_vars=(
            "PUBLIC_SUPABASE_URL"
            "PUBLIC_SUPABASE_ANON_KEY"
            "SUPABASE_SERVICE_ROLE_KEY"
            "OPENAI_API_KEY"
            "JWT_SECRET"
        )

        local missing_vars=0
        for var in "${required_vars[@]}"; do
            if ! grep -q "^$var=" .env.example; then
                ((missing_vars++))
            fi
        done

        if [ $missing_vars -eq 0 ]; then
            log_success "All required environment variables documented in .env.example"
        else
            log_error "$missing_vars required environment variables missing from .env.example"
        fi
    else
        log_error ".env.example file missing"
    fi

    # Test that secrets are not committed
    test_item
    if [ -f ".env" ]; then
        log_error ".env file should not be committed to repository"
    else
        log_success "No .env file in repository (good security practice)"
    fi

    test_item
    if [ -f ".gitignore" ] && grep -q ".env" .gitignore; then
        log_success ".env files properly ignored in .gitignore"
    else
        log_error ".env files not properly ignored in .gitignore"
    fi
}

# Test API endpoints structure
test_api_endpoints() {
    log_section "API Endpoints Structure"

    cd "$PROJECT_ROOT"

    local required_endpoints=(
        "api/health.ts"
        "api/auth/login.ts"
        "api/auth/register.ts"
    )

    for endpoint in "${required_endpoints[@]}"; do
        test_item
        if [ -f "$endpoint" ]; then
            log_success "API endpoint exists: $endpoint"
        else
            log_error "Missing API endpoint: $endpoint"
        fi
    done

    # Test health endpoint structure
    test_item
    if [ -f "api/health.ts" ] && grep -q "export.*default" api/health.ts; then
        log_success "Health endpoint has proper export structure"
    else
        log_error "Health endpoint missing proper export structure"
    fi
}

# Test documentation
test_documentation() {
    log_section "Documentation"

    cd "$PROJECT_ROOT"

    # Test documentation files
    local doc_files=(
        "README.md"
        "docs/ops/deploy_runbook.md"
        "docs/ops/ci_cd_guide.md"
    )

    for doc in "${doc_files[@]}"; do
        test_item
        if [ -f "$doc" ]; then
            # Check if file has substantial content
            if [ $(wc -l < "$doc") -gt 10 ]; then
                log_success "Documentation file exists with content: $doc"
            else
                log_error "Documentation file exists but appears empty: $doc"
            fi
        else
            log_error "Missing documentation file: $doc"
        fi
    done

    # Test deployment runbook content
    test_item
    if [ -f "docs/ops/deploy_runbook.md" ] && grep -q "Rollback Procedures" docs/ops/deploy_runbook.md; then
        log_success "Deployment runbook includes rollback procedures"
    else
        log_error "Deployment runbook missing rollback procedures"
    fi

    # Test CI/CD guide content
    test_item
    if [ -f "docs/ops/ci_cd_guide.md" ] && grep -q "GitHub Actions" docs/ops/ci_cd_guide.md; then
        log_success "CI/CD guide includes GitHub Actions documentation"
    else
        log_error "CI/CD guide missing GitHub Actions documentation"
    fi
}

# Test dependencies and tools
test_dependencies() {
    log_section "Dependencies and Tools"

    # Test required tools availability
    local tools=(
        "node"
        "npm"
        "git"
    )

    for tool in "${tools[@]}"; do
        test_item
        if command -v "$tool" > /dev/null 2>&1; then
            version=$($tool --version 2>/dev/null | head -1)
            log_success "$tool is available: $version"
        else
            log_error "$tool is not available"
        fi
    done

    # Test optional tools
    local optional_tools=(
        "vercel"
        "supabase"
        "jq"
        "curl"
    )

    for tool in "${optional_tools[@]}"; do
        test_item
        if command -v "$tool" > /dev/null 2>&1; then
            log_success "Optional tool available: $tool"
        else
            log_error "Optional tool not available: $tool (recommended for full functionality)"
        fi
    done

    # Test Node.js version
    test_item
    if command -v node > /dev/null 2>&1; then
        node_version=$(node --version | sed 's/v//' | cut -d. -f1)
        if [ "$node_version" -ge 18 ]; then
            log_success "Node.js version is compatible (v$(node --version | sed 's/v//'))"
        else
            log_error "Node.js version too old: v$(node --version | sed 's/v//') (required: v18+)"
        fi
    fi
}

# Test security configuration
test_security_configuration() {
    log_section "Security Configuration"

    cd "$PROJECT_ROOT"

    # Test for hardcoded secrets
    test_item
    local secret_patterns=(
        "sk-[a-zA-Z0-9]+"
        "eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*"
        "postgres://[^\\s]*"
        "mongodb://[^\\s]*"
    )

    local secrets_found=0
    for pattern in "${secret_patterns[@]}"; do
        if grep -r -E "$pattern" --exclude-dir=node_modules --exclude="*.log" --exclude-dir=.git . > /dev/null 2>&1; then
            ((secrets_found++))
        fi
    done

    if [ $secrets_found -eq 0 ]; then
        log_success "No hardcoded secrets detected"
    else
        log_error "Potential hardcoded secrets found ($secrets_found patterns matched)"
    fi

    # Test Vercel security headers
    test_item
    if grep -q "X-Content-Type-Options" vercel.json; then
        log_success "Security headers configured in vercel.json"
    else
        log_error "Security headers not configured in vercel.json"
    fi

    # Test HTTPS enforcement
    test_item
    if grep -q "Strict-Transport-Security" vercel.json; then
        log_success "HTTPS enforcement configured"
    else
        log_error "HTTPS enforcement not configured"
    fi
}

# Generate final report
generate_final_report() {
    log_section "CI/CD Setup Test Results"

    echo -e "\n${BLUE}📊 Test Summary${NC}"
    echo "================="
    echo "Total Tests: $TOTAL_TESTS"
    echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
    echo -e "${RED}Failed: $FAILED_TESTS${NC}"

    # Calculate success rate
    if [ $TOTAL_TESTS -gt 0 ]; then
        success_rate=$(( (PASSED_TESTS * 100) / TOTAL_TESTS ))
        echo "Success Rate: $success_rate%"
    fi

    echo -e "\n${BLUE}📋 Detailed Results${NC}"
    echo "==================="

    if [ ${#FAILED_ITEMS[@]} -gt 0 ]; then
        echo -e "\n${RED}❌ Failed Tests:${NC}"
        for item in "${FAILED_ITEMS[@]}"; do
            echo "  • $item"
        done
    fi

    echo -e "\n${BLUE}🎯 CI/CD Readiness Assessment${NC}"
    echo "=============================="

    # Decision logic
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}✅ READY - CI/CD pipeline is properly configured${NC}"
        echo "All components are in place and the pipeline is ready for use."
        return 0
    elif [ $FAILED_TESTS -le 3 ]; then
        echo -e "${YELLOW}⚠️  MOSTLY READY - Minor issues detected${NC}"
        echo "The pipeline is mostly ready but some issues should be addressed."
        return 1
    else
        echo -e "${RED}❌ NOT READY - Significant issues detected${NC}"
        echo "Multiple critical issues must be fixed before the pipeline can be used."
        return 2
    fi
}

# Main execution
main() {
    print_header

    # Run all tests
    test_github_workflows
    test_deployment_scripts
    test_project_configuration
    test_environment_configuration
    test_api_endpoints
    test_documentation
    test_dependencies
    test_security_configuration

    # Generate final report
    generate_final_report
}

# Execute main function
main "$@"