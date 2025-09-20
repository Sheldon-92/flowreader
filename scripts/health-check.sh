#!/bin/bash

# Health Check Script for FlowReader
# Usage: ./health-check.sh [--environment staging|production] [--timeout 30]
#
# Performs comprehensive health checks on the specified environment

set -euo pipefail

# Default configuration
DEFAULT_ENVIRONMENT="production"
DEFAULT_TIMEOUT=30
DEFAULT_RETRIES=3

# URLs
PROD_URL="https://flowreader.vercel.app"
STAGING_URL_PATTERN="https://flowreader-git-"  # Staging URLs vary

# Endpoints
HEALTH_ENDPOINT="/api/health"
PROTECTED_ENDPOINT="/api/books"
DATABASE_HEALTH_ENDPOINT="/api/health/database"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Global variables
ENVIRONMENT="$DEFAULT_ENVIRONMENT"
TIMEOUT="$DEFAULT_TIMEOUT"
RETRIES="$DEFAULT_RETRIES"
BASE_URL=""
VERBOSE=false

# Logging functions
log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

error() {
    echo -e "${RED}[✗]${NC} $1"
}

verbose() {
    if [[ "$VERBOSE" == true ]]; then
        echo -e "${CYAN}[DEBUG]${NC} $1"
    fi
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Health check script for FlowReader deployments.

OPTIONS:
    -e, --environment ENV    Target environment (staging|production) [default: production]
    -u, --url URL           Custom base URL to check
    -t, --timeout SECONDS   Request timeout in seconds [default: 30]
    -r, --retries COUNT     Number of retries for failed checks [default: 3]
    -v, --verbose           Enable verbose output
    -h, --help              Show this help message

EXAMPLES:
    $0                                    # Check production
    $0 -e staging                         # Check staging
    $0 -u https://custom-url.vercel.app   # Check custom URL
    $0 -v -t 60                          # Verbose mode with 60s timeout

EOF
}

# Function to parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -u|--url)
                BASE_URL="$2"
                shift 2
                ;;
            -t|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            -r|--retries)
                RETRIES="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done

    # Set base URL if not provided
    if [[ -z "$BASE_URL" ]]; then
        case "$ENVIRONMENT" in
            production)
                BASE_URL="$PROD_URL"
                ;;
            staging)
                error "Staging URL must be provided with --url option"
                error "Staging URLs follow pattern: https://flowreader-git-[branch]-[org].vercel.app"
                exit 1
                ;;
            *)
                error "Invalid environment: $ENVIRONMENT (must be staging or production)"
                exit 1
                ;;
        esac
    fi
}

# Function to make HTTP request with retries
make_request() {
    local url="$1"
    local expected_status="${2:-200}"
    local description="$3"

    verbose "Making request to: $url"
    verbose "Expected status: $expected_status"

    local attempt=1
    while [[ $attempt -le $RETRIES ]]; do
        verbose "Attempt $attempt/$RETRIES for $description"

        local response
        response=$(curl -s -w "HTTPSTATUS:%{http_code};TIME:%{time_total};SIZE:%{size_download}" \
                       --max-time "$TIMEOUT" \
                       --fail-with-body \
                       "$url" 2>/dev/null || echo "HTTPSTATUS:000;TIME:999;SIZE:0")

        local http_status
        http_status=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)

        local response_time
        response_time=$(echo "$response" | grep -o "TIME:[0-9.]*" | cut -d: -f2)

        local response_size
        response_size=$(echo "$response" | grep -o "SIZE:[0-9]*" | cut -d: -f2)

        local body
        body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*;TIME:[0-9.]*;SIZE:[0-9]*$//')

        verbose "Response - Status: $http_status, Time: ${response_time}s, Size: ${response_size}B"

        if [[ "$http_status" == "$expected_status" ]]; then
            success "$description - Status: $http_status, Time: ${response_time}s"
            echo "$response_time"
            return 0
        else
            if [[ $attempt -eq $RETRIES ]]; then
                error "$description - Status: $http_status (expected $expected_status), Time: ${response_time}s"
                if [[ -n "$body" && "$VERBOSE" == true ]]; then
                    error "Response body: $body"
                fi
                return 1
            else
                warning "$description - Attempt $attempt failed (Status: $http_status), retrying..."
                sleep 2
            fi
        fi

        ((attempt++))
    done

    return 1
}

# Function to check basic connectivity
check_connectivity() {
    info "Checking basic connectivity to $BASE_URL..."

    if make_request "$BASE_URL" "200" "Frontend connectivity" > /dev/null; then
        return 0
    else
        error "Basic connectivity check failed"
        return 1
    fi
}

# Function to check health endpoint
check_health_endpoint() {
    info "Checking health endpoint..."

    local response_time
    if response_time=$(make_request "$BASE_URL$HEALTH_ENDPOINT" "200" "Health endpoint"); then
        # Check if response time is acceptable (< 3 seconds for production, < 5 for staging)
        local max_time
        if [[ "$ENVIRONMENT" == "production" ]]; then
            max_time="3.0"
        else
            max_time="5.0"
        fi

        if (( $(echo "$response_time > $max_time" | bc -l 2>/dev/null || echo "0") )); then
            warning "Health endpoint response time is slow: ${response_time}s (max: ${max_time}s)"
        fi

        return 0
    else
        error "Health endpoint check failed"
        return 1
    fi
}

# Function to check API security
check_api_security() {
    info "Checking API endpoint security..."

    if make_request "$BASE_URL$PROTECTED_ENDPOINT" "401" "Protected endpoint security" > /dev/null; then
        return 0
    else
        error "Protected endpoint should return 401 (Unauthorized)"
        return 1
    fi
}

# Function to check database connectivity
check_database() {
    info "Checking database connectivity..."

    local response_time
    if response_time=$(make_request "$BASE_URL$DATABASE_HEALTH_ENDPOINT" "200" "Database connectivity" 2>/dev/null); then
        return 0
    else
        # Database health endpoint might not exist, which is acceptable
        warning "Database health endpoint not available (this may be expected)"
        return 0
    fi
}

# Function to check security headers
check_security_headers() {
    info "Checking security headers..."

    verbose "Fetching headers from $BASE_URL"
    local headers
    headers=$(curl -s -I --max-time "$TIMEOUT" "$BASE_URL" 2>/dev/null || echo "")

    if [[ -z "$headers" ]]; then
        error "Could not fetch headers"
        return 1
    fi

    local security_checks=0
    local security_passed=0

    # Check for important security headers
    local required_headers=(
        "X-Content-Type-Options"
        "X-Frame-Options"
        "Referrer-Policy"
    )

    local recommended_headers=(
        "X-XSS-Protection"
        "Strict-Transport-Security"
        "Content-Security-Policy"
    )

    for header in "${required_headers[@]}"; do
        ((security_checks++))
        if echo "$headers" | grep -i "$header" > /dev/null; then
            success "Required header present: $header"
            ((security_passed++))
        else
            error "Missing required header: $header"
        fi
    done

    for header in "${recommended_headers[@]}"; do
        if echo "$headers" | grep -i "$header" > /dev/null; then
            success "Recommended header present: $header"
        else
            warning "Missing recommended header: $header"
        fi
    done

    if [[ $security_passed -eq ${#required_headers[@]} ]]; then
        success "All required security headers present"
        return 0
    else
        error "Missing $((${#required_headers[@]} - security_passed)) required security headers"
        return 1
    fi
}

# Function to perform performance baseline check
check_performance() {
    info "Checking performance baseline..."

    local total_time=0
    local test_count=5

    info "Running $test_count performance tests..."

    for i in $(seq 1 $test_count); do
        verbose "Performance test $i/$test_count"
        local response_time
        if response_time=$(make_request "$BASE_URL$HEALTH_ENDPOINT" "200" "Performance test $i" 2>/dev/null); then
            total_time=$(echo "$total_time + $response_time" | bc -l 2>/dev/null || echo "$total_time")
        else
            error "Performance test $i failed"
            return 1
        fi
    done

    local avg_time
    avg_time=$(echo "scale=3; $total_time / $test_count" | bc -l 2>/dev/null || echo "999")

    local max_acceptable
    if [[ "$ENVIRONMENT" == "production" ]]; then
        max_acceptable="3.0"
    else
        max_acceptable="5.0"
    fi

    if (( $(echo "$avg_time <= $max_acceptable" | bc -l 2>/dev/null || echo "0") )); then
        success "Performance baseline met: ${avg_time}s average (max: ${max_acceptable}s)"
        return 0
    else
        error "Performance baseline exceeded: ${avg_time}s average (max: ${max_acceptable}s)"
        return 1
    fi
}

# Function to generate health report
generate_report() {
    local overall_status="$1"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    echo ""
    echo "================================================="
    echo "🔍 HEALTH CHECK REPORT"
    echo "================================================="
    echo "Timestamp: $timestamp"
    echo "Environment: $ENVIRONMENT"
    echo "Target URL: $BASE_URL"
    echo "Overall Status: $overall_status"
    echo "================================================="

    # Add recommendations based on environment
    if [[ "$ENVIRONMENT" == "production" && "$overall_status" != "✅ HEALTHY" ]]; then
        echo ""
        echo "🚨 PRODUCTION ALERT - IMMEDIATE ACTION REQUIRED:"
        echo "1. Check application logs for errors"
        echo "2. Verify database connectivity"
        echo "3. Consider rollback if issues persist"
        echo "4. Escalate to on-call engineer"
    elif [[ "$ENVIRONMENT" == "staging" && "$overall_status" != "✅ HEALTHY" ]]; then
        echo ""
        echo "⚠️  STAGING ISSUES DETECTED:"
        echo "1. Fix issues before promoting to production"
        echo "2. Review deployment configuration"
        echo "3. Check for missing environment variables"
    fi

    # Save report to file
    local report_file
    report_file="health-check-$(date '+%Y%m%d-%H%M%S').log"

    {
        echo "Health Check Report - $timestamp"
        echo "Environment: $ENVIRONMENT"
        echo "URL: $BASE_URL"
        echo "Status: $overall_status"
        echo ""
        echo "Test Results:"
        echo "- Connectivity: $(if check_connectivity &>/dev/null; then echo "PASS"; else echo "FAIL"; fi)"
        echo "- Health Endpoint: $(if check_health_endpoint &>/dev/null; then echo "PASS"; else echo "FAIL"; fi)"
        echo "- Security: $(if check_api_security &>/dev/null; then echo "PASS"; else echo "FAIL"; fi)"
        echo "- Database: $(if check_database &>/dev/null; then echo "PASS"; else echo "FAIL"; fi)"
        echo "- Headers: $(if check_security_headers &>/dev/null; then echo "PASS"; else echo "FAIL"; fi)"
        echo "- Performance: $(if check_performance &>/dev/null; then echo "PASS"; else echo "FAIL"; fi)"
    } > "$report_file"

    verbose "Report saved to: $report_file"
}

# Main health check function
main() {
    parse_args "$@"

    echo "================================================="
    echo "🔍 FLOWREADER HEALTH CHECK"
    echo "================================================="
    echo "Environment: $ENVIRONMENT"
    echo "Target URL: $BASE_URL"
    echo "Timeout: ${TIMEOUT}s"
    echo "Retries: $RETRIES"
    echo "================================================="
    echo ""

    local failed_checks=0
    local total_checks=6

    # Run health checks
    check_connectivity || ((failed_checks++))
    echo ""

    check_health_endpoint || ((failed_checks++))
    echo ""

    check_api_security || ((failed_checks++))
    echo ""

    check_database || ((failed_checks++))
    echo ""

    check_security_headers || ((failed_checks++))
    echo ""

    check_performance || ((failed_checks++))
    echo ""

    # Determine overall status
    local overall_status
    if [[ $failed_checks -eq 0 ]]; then
        overall_status="✅ HEALTHY"
    elif [[ $failed_checks -le 2 ]]; then
        overall_status="⚠️ DEGRADED"
    else
        overall_status="❌ UNHEALTHY"
    fi

    # Generate report
    generate_report "$overall_status"

    # Exit with appropriate code
    if [[ $failed_checks -eq 0 ]]; then
        success "All health checks passed!"
        exit 0
    elif [[ $failed_checks -le 2 ]]; then
        warning "Some health checks failed ($failed_checks/$total_checks)"
        exit 1
    else
        error "Multiple health checks failed ($failed_checks/$total_checks)"
        exit 2
    fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi