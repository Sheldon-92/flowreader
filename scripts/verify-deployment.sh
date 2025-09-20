#!/bin/bash

# FlowReader Deployment Verification Script
# Verifies the health and functionality of a deployed FlowReader instance

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TIMEOUT=30
MAX_RETRIES=5
PERFORMANCE_THRESHOLD=3.0

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

print_usage() {
    echo "Usage: $0 <environment> [base_url]"
    echo ""
    echo "Arguments:"
    echo "  environment    staging|production"
    echo "  base_url       (optional) Custom base URL to test"
    echo ""
    echo "Examples:"
    echo "  $0 staging"
    echo "  $0 production"
    echo "  $0 staging https://flowreader-git-main-yourorg.vercel.app"
    echo "  $0 production https://flowreader.vercel.app"
}

# Utility functions
wait_with_timeout() {
    local url="$1"
    local timeout="$2"
    local message="$3"

    log_info "$message"

    for i in $(seq 1 $timeout); do
        if curl -f -s "$url" > /dev/null 2>&1; then
            return 0
        fi
        echo -n "."
        sleep 1
    done

    echo ""
    return 1
}

test_endpoint() {
    local url="$1"
    local expected_status="$2"
    local description="$3"
    local retry_count=0

    log_info "Testing: $description"
    log_info "URL: $url"

    while [ $retry_count -lt $MAX_RETRIES ]; do
        response=$(curl -s -w "%{http_code}|%{time_total}" "$url" 2>/dev/null || echo "000|0")
        status_code=$(echo "$response" | cut -d'|' -f1)
        response_time=$(echo "$response" | cut -d'|' -f2)

        if [ "$status_code" = "$expected_status" ]; then
            log_success "$description - Status: $status_code, Time: ${response_time}s"
            return 0
        else
            retry_count=$((retry_count + 1))
            log_warning "$description failed (attempt $retry_count/$MAX_RETRIES) - Status: $status_code"

            if [ $retry_count -lt $MAX_RETRIES ]; then
                sleep 5
            fi
        fi
    done

    log_error "$description failed after $MAX_RETRIES attempts - Final status: $status_code"
    return 1
}

test_health_endpoint() {
    local base_url="$1"
    local health_url="$base_url/api/health"

    log_info "Testing health endpoint..."

    # Test basic connectivity
    if ! test_endpoint "$health_url" "200" "Health endpoint availability"; then
        return 1
    fi

    # Test response content
    response_body=$(curl -s "$health_url")

    if echo "$response_body" | grep -q "status.*ok\|healthy\|UP"; then
        log_success "Health endpoint returns valid status"
    else
        log_warning "Health endpoint response may be invalid: $response_body"
    fi

    # Performance check
    response_time=$(curl -w "%{time_total}" -s -o /dev/null "$health_url")
    log_info "Health endpoint response time: ${response_time}s"

    if (( $(echo "$response_time > $PERFORMANCE_THRESHOLD" | bc -l) )); then
        log_warning "Health endpoint response time is high: ${response_time}s (threshold: ${PERFORMANCE_THRESHOLD}s)"
        return 1
    else
        log_success "Health endpoint performance acceptable"
    fi

    return 0
}

test_api_security() {
    local base_url="$1"

    log_info "Testing API security..."

    # Test protected endpoints return 401 without auth
    local protected_endpoints=(
        "/api/books"
        "/api/auth/profile"
        "/api/books/upload"
    )

    for endpoint in "${protected_endpoints[@]}"; do
        if test_endpoint "$base_url$endpoint" "401" "Protected endpoint security: $endpoint"; then
            log_success "Endpoint $endpoint properly secured"
        else
            log_error "Security issue with endpoint: $endpoint"
            return 1
        fi
    done

    return 0
}

test_frontend() {
    local base_url="$1"

    log_info "Testing frontend availability..."

    # Test main page
    if test_endpoint "$base_url" "200" "Frontend main page"; then
        log_success "Frontend is accessible"
    else
        log_error "Frontend is not accessible"
        return 1
    fi

    # Test that it's actually serving HTML
    response_body=$(curl -s "$base_url")
    if echo "$response_body" | grep -q "<html\|<!DOCTYPE"; then
        log_success "Frontend serving valid HTML"
    else
        log_warning "Frontend may not be serving HTML content"
    fi

    return 0
}

test_security_headers() {
    local base_url="$1"

    log_info "Testing security headers..."

    headers=$(curl -s -I "$base_url")

    # Required security headers
    local security_headers=(
        "X-Content-Type-Options"
        "X-Frame-Options"
        "X-XSS-Protection"
        "Referrer-Policy"
    )

    local missing_headers=()

    for header in "${security_headers[@]}"; do
        if echo "$headers" | grep -i "$header" > /dev/null; then
            log_success "Security header present: $header"
        else
            log_warning "Security header missing: $header"
            missing_headers+=("$header")
        fi
    done

    if [ ${#missing_headers[@]} -eq 0 ]; then
        log_success "All security headers present"
        return 0
    else
        log_warning "Missing ${#missing_headers[@]} security headers"
        return 1
    fi
}

test_ssl_certificate() {
    local base_url="$1"

    # Only test SSL for HTTPS URLs
    if [[ "$base_url" != https://* ]]; then
        log_info "Skipping SSL test for non-HTTPS URL"
        return 0
    fi

    log_info "Testing SSL certificate..."

    local domain
    domain=$(echo "$base_url" | sed 's|https://||' | cut -d'/' -f1)

    # Test SSL certificate validity
    if echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | openssl x509 -noout -dates > /dev/null 2>&1; then
        log_success "SSL certificate is valid"

        # Get certificate expiry
        expiry_date=$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
        log_info "SSL certificate expires: $expiry_date"

        return 0
    else
        log_error "SSL certificate validation failed"
        return 1
    fi
}

run_comprehensive_tests() {
    local base_url="$1"
    local environment="$2"

    log_info "Running comprehensive tests for $environment environment..."
    log_info "Base URL: $base_url"

    local test_results=()

    # Core functionality tests
    log_info "=== Core Functionality Tests ==="

    if test_health_endpoint "$base_url"; then
        test_results+=("health:PASS")
    else
        test_results+=("health:FAIL")
    fi

    if test_frontend "$base_url"; then
        test_results+=("frontend:PASS")
    else
        test_results+=("frontend:FAIL")
    fi

    if test_api_security "$base_url"; then
        test_results+=("security:PASS")
    else
        test_results+=("security:FAIL")
    fi

    # Security tests
    log_info "=== Security Tests ==="

    if test_security_headers "$base_url"; then
        test_results+=("headers:PASS")
    else
        test_results+=("headers:FAIL")
    fi

    if test_ssl_certificate "$base_url"; then
        test_results+=("ssl:PASS")
    else
        test_results+=("ssl:FAIL")
    fi

    # Performance tests
    log_info "=== Performance Tests ==="

    overall_start_time=$(date +%s.%N)

    # Test multiple endpoints for performance
    local performance_tests=(
        "$base_url/api/health"
        "$base_url"
    )

    local total_response_time=0
    local test_count=0

    for test_url in "${performance_tests[@]}"; do
        response_time=$(curl -w "%{time_total}" -s -o /dev/null "$test_url" 2>/dev/null || echo "999")
        total_response_time=$(echo "$total_response_time + $response_time" | bc -l)
        test_count=$((test_count + 1))
        log_info "Response time for $test_url: ${response_time}s"
    done

    overall_end_time=$(date +%s.%N)
    overall_time=$(echo "$overall_end_time - $overall_start_time" | bc -l)

    avg_response_time=$(echo "scale=3; $total_response_time / $test_count" | bc -l)
    log_info "Average response time: ${avg_response_time}s"
    log_info "Overall test duration: ${overall_time}s"

    if (( $(echo "$avg_response_time < $PERFORMANCE_THRESHOLD" | bc -l) )); then
        test_results+=("performance:PASS")
        log_success "Performance tests passed"
    else
        test_results+=("performance:FAIL")
        log_warning "Performance tests failed (avg: ${avg_response_time}s > ${PERFORMANCE_THRESHOLD}s)"
    fi

    # Summary
    log_info "=== Test Summary ==="

    local total_tests=${#test_results[@]}
    local passed_tests=0
    local failed_tests=0

    for result in "${test_results[@]}"; do
        test_name=$(echo "$result" | cut -d':' -f1)
        test_status=$(echo "$result" | cut -d':' -f2)

        if [ "$test_status" = "PASS" ]; then
            log_success "$test_name: PASSED"
            passed_tests=$((passed_tests + 1))
        else
            log_error "$test_name: FAILED"
            failed_tests=$((failed_tests + 1))
        fi
    done

    log_info "Results: $passed_tests passed, $failed_tests failed, $total_tests total"

    # Environment-specific recommendations
    if [ "$environment" = "production" ]; then
        if [ $failed_tests -gt 0 ]; then
            log_error "❌ PRODUCTION DEPLOYMENT NOT RECOMMENDED"
            log_error "Fix failing tests before deploying to production"
            return 1
        else
            log_success "✅ PRODUCTION DEPLOYMENT READY"
            return 0
        fi
    else
        if [ $failed_tests -gt 2 ]; then
            log_warning "⚠️  STAGING ENVIRONMENT HAS SIGNIFICANT ISSUES"
            return 1
        else
            log_success "✅ STAGING ENVIRONMENT ACCEPTABLE"
            return 0
        fi
    fi
}

# Main function
main() {
    local environment="$1"
    local custom_url="$2"
    local base_url

    # Validate arguments
    if [ -z "$environment" ]; then
        log_error "Environment argument is required"
        print_usage
        exit 1
    fi

    if [ "$environment" != "staging" ] && [ "$environment" != "production" ]; then
        log_error "Environment must be 'staging' or 'production'"
        print_usage
        exit 1
    fi

    # Determine base URL
    if [ -n "$custom_url" ]; then
        base_url="$custom_url"
        log_info "Using custom URL: $base_url"
    else
        case "$environment" in
            staging)
                # Try to read from staging URL file, otherwise use default
                if [ -f ".staging-url" ]; then
                    base_url=$(cat .staging-url)
                    log_info "Using staging URL from file: $base_url"
                else
                    base_url="https://flowreader-git-main-yourorg.vercel.app"
                    log_warning "Using default staging URL (update for your setup): $base_url"
                fi
                ;;
            production)
                base_url="https://flowreader.vercel.app"
                log_info "Using production URL: $base_url"
                ;;
        esac
    fi

    # Check required tools
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi

    if ! command -v bc &> /dev/null; then
        log_error "bc is required but not installed"
        exit 1
    fi

    # Run tests
    log_info "Starting deployment verification for $environment environment..."

    if run_comprehensive_tests "$base_url" "$environment"; then
        log_success "🎉 Deployment verification completed successfully!"
        exit 0
    else
        log_error "💥 Deployment verification failed!"
        exit 1
    fi
}

# Run main function with all arguments
main "$@"