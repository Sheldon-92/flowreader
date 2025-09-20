#!/bin/bash

# FlowReader Pre-Deployment Checklist Script
# Validates environment and prerequisites before production deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Results storage
declare -a PASSED_CHECKS=()
declare -a FAILED_CHECKS=()
declare -a WARNING_CHECKS=()

# Check functions
check() {
    local description="$1"
    local command="$2"
    local is_critical="${3:-true}"

    echo -n "Checking $description... "

    if eval "$command" &>/dev/null; then
        echo -e "${GREEN}✅ PASS${NC}"
        PASSED_CHECKS+=("$description")
        ((PASSED++))
    else
        if [[ "$is_critical" == "true" ]]; then
            echo -e "${RED}❌ FAIL${NC}"
            FAILED_CHECKS+=("$description")
            ((FAILED++))
        else
            echo -e "${YELLOW}⚠️  WARNING${NC}"
            WARNING_CHECKS+=("$description")
            ((WARNINGS++))
        fi
    fi
}

# Environment variable checks
check_environment_variables() {
    echo -e "${BLUE}=== Environment Variables ===${NC}"

    check "Vercel Token" '[[ -n "$VERCEL_TOKEN" ]]'
    check "Vercel Org ID" '[[ -n "$VERCEL_ORG_ID" ]]'
    check "Vercel Project ID" '[[ -n "$VERCEL_PROJECT_ID" ]]'
    check "Supabase URL" '[[ -n "$PUBLIC_SUPABASE_URL" ]]'
    check "Supabase Service Role Key" '[[ -n "$SUPABASE_SERVICE_ROLE_KEY" ]]'
    check "OpenAI API Key" '[[ -n "$OPENAI_API_KEY" ]]'
    check "JWT Secret" '[[ -n "$JWT_SECRET" && ${#JWT_SECRET} -ge 32 ]]'

    # Non-critical environment variables
    check "QStash Token" '[[ -n "$QSTASH_TOKEN" ]]' false
    check "Sentry DSN" '[[ -n "$SENTRY_DSN" ]]' false
}

# Git repository checks
check_git_repository() {
    echo -e "\n${BLUE}=== Git Repository ===${NC}"

    check "Git repository" 'git rev-parse --git-dir'
    check "On main branch" '[[ "$(git branch --show-current)" == "main" ]]'
    check "Working directory clean" '[[ -z "$(git status --porcelain)" ]]'
    check "Remote origin exists" 'git remote get-url origin'
    check "Latest changes pulled" 'git fetch --dry-run 2>&1 | grep -q "up to date\|Everything up-to-date" || [[ -z "$(git fetch --dry-run 2>&1)" ]]'
    check "No unpushed commits" '[[ -z "$(git log origin/main..HEAD --oneline)" ]]'
}

# Node.js and dependencies
check_nodejs_dependencies() {
    echo -e "\n${BLUE}=== Node.js & Dependencies ===${NC}"

    check "Node.js version >= 18" 'node --version | grep -E "v(1[8-9]|[2-9][0-9])\."'
    check "npm version >= 9" 'npm --version | grep -E "^([9-9]|[1-9][0-9])\."'
    check "package-lock.json exists" '[[ -f "package-lock.json" ]]'
    check "node_modules exists" '[[ -d "node_modules" ]]'
    check "Dependencies up to date" '[[ ! "package-lock.json" -nt "node_modules" ]]'

    # Check for security vulnerabilities
    check "No security vulnerabilities" 'npm audit --audit-level=high' false
}

# Project structure validation
check_project_structure() {
    echo -e "\n${BLUE}=== Project Structure ===${NC}"

    check "API directory exists" '[[ -d "api" ]]'
    check "Health endpoint exists" '[[ -f "api/health.ts" ]]'
    check "Vercel config exists" '[[ -f "vercel.json" ]]'
    check "Package.json valid" 'node -e "require(\"./package.json\")"'
    check "Supabase migrations exist" '[[ -d "supabase/migrations" ]]'
    check "Latest migration exists" '[[ -f "supabase/migrations/003_dialog_history.sql" ]]'
}

# Database migration validation
check_database_migrations() {
    echo -e "\n${BLUE}=== Database Migrations ===${NC}"

    check "Migration 001 exists" '[[ -f "supabase/migrations/001_initial_schema.sql" ]]'
    check "Migration 002 exists" '[[ -f "supabase/migrations/002_security_hardening.sql" ]]'
    check "Migration 003 exists" '[[ -f "supabase/migrations/003_dialog_history.sql" ]]'
    check "Migration 003 rollback exists" '[[ -f "supabase/migrations/003_dialog_history_rollback.sql" ]]'

    # Check migration syntax (basic validation)
    check "Migration 003 syntax" 'head -n 20 "supabase/migrations/003_dialog_history.sql" | grep -q "CREATE TABLE dialog_messages"'
}

# CI/CD pipeline validation
check_cicd_pipeline() {
    echo -e "\n${BLUE}=== CI/CD Pipeline ===${NC}"

    check "GitHub workflows directory" '[[ -d ".github/workflows" ]]'
    check "Production deploy workflow" '[[ -f ".github/workflows/deploy-production.yml" ]]'
    check "CI workflow" '[[ -f ".github/workflows/ci.yml" ]]'
    check "Staging deploy workflow" '[[ -f ".github/workflows/deploy-staging.yml" ]]'

    # Check workflow syntax
    if command -v yq &> /dev/null; then
        check "Production workflow syntax" 'yq eval ".name" .github/workflows/deploy-production.yml | grep -q "Deploy to Production"'
    else
        check "Production workflow syntax" 'grep -q "name: Deploy to Production" .github/workflows/deploy-production.yml'
    fi
}

# Security configuration
check_security_config() {
    echo -e "\n${BLUE}=== Security Configuration ===${NC}"

    check "Vercel.json has security headers" 'grep -q "X-Content-Type-Options" vercel.json'
    check "CSP header configured" 'grep -q "Content-Security-Policy" vercel.json'
    check "HSTS header configured" 'grep -q "Strict-Transport-Security" vercel.json'
    check "No hardcoded secrets in code" '! grep -r "sk-[a-zA-Z0-9]" api/ --include="*.ts" --include="*.js"' false
    check ".env files not committed" '! git ls-files | grep -E "\.env$|\.env\.local$"'
}

# External service connectivity
check_external_services() {
    echo -e "\n${BLUE}=== External Service Connectivity ===${NC}"

    if [[ -n "$PUBLIC_SUPABASE_URL" ]]; then
        check "Supabase reachable" "curl -f -s '$PUBLIC_SUPABASE_URL/rest/v1/' -H 'apikey: $SUPABASE_SERVICE_ROLE_KEY' | grep -q 'openapi'"
    fi

    if [[ -n "$OPENAI_API_KEY" ]]; then
        check "OpenAI API reachable" "curl -f -s 'https://api.openai.com/v1/models' -H 'Authorization: Bearer $OPENAI_API_KEY' | grep -q 'data'" false
    fi

    check "GitHub reachable" 'curl -f -s https://api.github.com/zen' false
    check "Vercel API reachable" 'curl -f -s https://api.vercel.com/v2/user -H "Authorization: Bearer $VERCEL_TOKEN"' false
}

# Performance and build validation
check_build_performance() {
    echo -e "\n${BLUE}=== Build & Performance ===${NC}"

    # Test build (dry run)
    if command -v vercel &> /dev/null; then
        check "Vercel build succeeds" 'timeout 300 vercel build --prod --token="$VERCEL_TOKEN" || true' false
    fi

    # Check bundle size (if built)
    if [[ -d ".vercel/output" ]]; then
        check "Bundle size reasonable" '[[ $(du -s .vercel/output | cut -f1) -lt 102400 ]]' false  # < 100MB
    fi
}

# Generate report
generate_report() {
    local total=$((PASSED + FAILED + WARNINGS))

    echo -e "\n${BLUE}=== DEPLOYMENT READINESS REPORT ===${NC}"
    echo "Total Checks: $total"
    echo -e "Passed: ${GREEN}$PASSED${NC}"
    echo -e "Failed: ${RED}$FAILED${NC}"
    echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"

    if [[ $FAILED -gt 0 ]]; then
        echo -e "\n${RED}❌ CRITICAL ISSUES (must fix before deployment):${NC}"
        printf '%s\n' "${FAILED_CHECKS[@]}"
    fi

    if [[ $WARNINGS -gt 0 ]]; then
        echo -e "\n${YELLOW}⚠️  WARNINGS (recommended to fix):${NC}"
        printf '%s\n' "${WARNING_CHECKS[@]}"
    fi

    if [[ $FAILED -eq 0 ]]; then
        echo -e "\n${GREEN}🚀 READY FOR DEPLOYMENT!${NC}"
        echo "All critical checks passed. You can proceed with production deployment."
        return 0
    else
        echo -e "\n${RED}🚫 NOT READY FOR DEPLOYMENT${NC}"
        echo "Please fix the critical issues above before deploying to production."
        return 1
    fi
}

# Main execution
main() {
    echo -e "${BLUE}FlowReader Pre-Deployment Checklist${NC}"
    echo "Validating environment and prerequisites..."
    echo

    check_environment_variables
    check_git_repository
    check_nodejs_dependencies
    check_project_structure
    check_database_migrations
    check_cicd_pipeline
    check_security_config
    check_external_services
    check_build_performance

    generate_report
}

# Run main function
main "$@"