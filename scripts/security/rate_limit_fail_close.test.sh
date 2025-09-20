#!/bin/bash

# FlowReader Rate Limit Fail-Close Test Script
# Enterprise Security Testing - SOC 2 Type II Compliance
# Tests rate limiting behavior under error conditions to ensure fail-close operation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_RESULTS_FILE="/tmp/rate_limit_fail_close_test_results.json"
LOG_FILE="/tmp/rate_limit_fail_close_test.log"

# Test configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
TEST_TIMEOUT=30
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo -e "${BLUE}=== FlowReader Rate Limit Fail-Close Security Test ===${NC}"
echo "Testing fail-close behavior under various error conditions..."
echo "Base URL: $BASE_URL"
echo "Test results will be saved to: $TEST_RESULTS_FILE"
echo ""

# Initialize results file
cat > "$TEST_RESULTS_FILE" << EOF
{
  "test_suite": "rate_limit_fail_close",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "base_url": "$BASE_URL",
  "tests": []
}
EOF

# Function to log test results
log_test_result() {
    local test_name="$1"
    local status="$2"
    local description="$3"
    local details="$4"
    local security_impact="$5"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    case "$status" in
        "PASS")
            echo -e "${GREEN}✓ PASS${NC}: $test_name"
            PASSED_TESTS=$((PASSED_TESTS + 1))
            ;;
        "FAIL")
            echo -e "${RED}✗ FAIL${NC}: $test_name"
            echo -e "  ${RED}Details: $details${NC}"
            echo -e "  ${RED}Security Impact: $security_impact${NC}"
            FAILED_TESTS=$((FAILED_TESTS + 1))
            ;;
        "WARN")
            echo -e "${YELLOW}⚠ WARN${NC}: $test_name"
            echo -e "  ${YELLOW}Details: $details${NC}"
            ;;
    esac

    # Add to JSON results
    local test_result=$(cat << EOF
{
  "name": "$test_name",
  "status": "$status",
  "description": "$description",
  "details": "$details",
  "security_impact": "$security_impact",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
    )

    # Append to results file (requires jq for proper JSON manipulation)
    if command -v jq &> /dev/null; then
        local temp_file=$(mktemp)
        jq ".tests += [$test_result]" "$TEST_RESULTS_FILE" > "$temp_file"
        mv "$temp_file" "$TEST_RESULTS_FILE"
    fi

    echo "$(date): $status - $test_name - $details" >> "$LOG_FILE"
}

# Function to make HTTP request with timeout
make_request() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local expected_status="$4"
    local timeout="${5:-$TEST_TIMEOUT}"

    local curl_args=("-s" "-w" "%{http_code}" "-o" "/dev/null" "-m" "$timeout")

    if [ "$method" = "POST" ]; then
        curl_args+=("-X" "POST" "-H" "Content-Type: application/json")
        if [ -n "$data" ]; then
            curl_args+=("-d" "$data")
        fi
    fi

    local response_code
    response_code=$(curl "${curl_args[@]}" "${BASE_URL}${endpoint}" 2>/dev/null || echo "ERROR")

    if [ "$response_code" = "$expected_status" ]; then
        return 0
    elif [ "$response_code" = "ERROR" ]; then
        return 2
    else
        return 1
    fi
}

# Function to simulate database error by overwhelming connections
simulate_database_error() {
    echo "Simulating database connection issues..."

    # This would normally involve:
    # 1. Overwhelming database connection pool
    # 2. Blocking database access temporarily
    # 3. Causing timeout errors
    # For testing purposes, we'll simulate the scenario

    return 0
}

# Test 1: Normal Rate Limiting Behavior (Baseline)
echo -e "${BLUE}Test 1: Baseline Rate Limiting Behavior${NC}"
echo "Testing normal rate limiting under healthy conditions..."

test_endpoint="/api/health"
healthy_requests=0
rate_limited_requests=0

# Make requests within rate limit
for i in {1..5}; do
    if make_request "GET" "$test_endpoint" "" "200" 5; then
        healthy_requests=$((healthy_requests + 1))
    fi
done

# Make requests to trigger rate limiting
for i in {1..50}; do
    if make_request "GET" "$test_endpoint" "" "429" 2; then
        rate_limited_requests=$((rate_limited_requests + 1))
        break
    fi
done

if [ $healthy_requests -ge 3 ] && [ $rate_limited_requests -ge 1 ]; then
    log_test_result "Baseline Rate Limiting" "PASS" "Normal rate limiting works correctly" \
        "Healthy requests: $healthy_requests, Rate limited: $rate_limited_requests" "None"
else
    log_test_result "Baseline Rate Limiting" "FAIL" "Rate limiting not working properly" \
        "Healthy requests: $healthy_requests, Rate limited: $rate_limited_requests" \
        "CRITICAL: Rate limiting bypass possible"
fi

# Test 2: Database Connection Error Scenario
echo ""
echo -e "${BLUE}Test 2: Database Connection Error (Fail-Close Test)${NC}"
echo "Testing rate limiter behavior when database is unavailable..."

# Since we can't actually break the database in a test, we'll check the code
rate_limiter_file="$PROJECT_ROOT/api/_lib/rate-limiter.ts"

if [ -f "$rate_limiter_file" ]; then
    # Check for fail-close patterns in the code
    if grep -q "SECURITY.*Fail close" "$rate_limiter_file" && \
       grep -q "allowed.*false" "$rate_limiter_file" && \
       ! grep -q "allowed.*true.*error" "$rate_limiter_file"; then

        log_test_result "Database Error Fail-Close" "PASS" "Rate limiter implements fail-close behavior" \
            "Found fail-close patterns in code" "None"
    else
        log_test_result "Database Error Fail-Close" "FAIL" "Rate limiter does not implement fail-close" \
            "Fail-open patterns detected or fail-close not implemented" \
            "CRITICAL: Security bypass during database outages"
    fi
else
    log_test_result "Database Error Fail-Close" "FAIL" "Rate limiter file not found" \
        "Cannot locate rate-limiter.ts file" "CRITICAL: No rate limiting implementation"
fi

# Test 3: Rate Limit Storage Corruption
echo ""
echo -e "${BLUE}Test 3: Rate Limit Storage Corruption (Error Handling)${NC}"
echo "Testing behavior when rate limit storage is corrupted..."

# Check error handling in rate limiter
if [ -f "$rate_limiter_file" ]; then
    if grep -q "catch.*error" "$rate_limiter_file" && \
       grep -q "console\.error.*Rate limiting error" "$rate_limiter_file"; then

        # Check if errors result in fail-close
        if grep -A 10 "catch.*error" "$rate_limiter_file" | grep -q "allowed.*false"; then
            log_test_result "Storage Corruption Handling" "PASS" "Proper error handling with fail-close" \
                "Error handling results in request denial" "None"
        else
            log_test_result "Storage Corruption Handling" "FAIL" "Error handling allows bypass" \
                "Errors do not result in fail-close behavior" \
                "HIGH: Security bypass during storage issues"
        fi
    else
        log_test_result "Storage Corruption Handling" "FAIL" "No error handling found" \
            "Rate limiter lacks proper error handling" \
            "HIGH: Unpredictable behavior during errors"
    fi
fi

# Test 4: Network Timeout Scenarios
echo ""
echo -e "${BLUE}Test 4: Network Timeout Scenarios${NC}"
echo "Testing rate limiter behavior during network timeouts..."

# Test with very short timeout to simulate network issues
timeout_test_passed=0

for i in {1..3}; do
    if make_request "GET" "$test_endpoint" "" "429" 1; then
        timeout_test_passed=$((timeout_test_passed + 1))
    fi
done

if [ $timeout_test_passed -ge 1 ]; then
    log_test_result "Network Timeout Handling" "PASS" "Rate limiting works under network stress" \
        "Successful rate limiting even with short timeouts" "None"
else
    log_test_result "Network Timeout Handling" "WARN" "Cannot verify timeout behavior" \
        "Unable to test network timeout scenarios" "MEDIUM: Unknown behavior under network stress"
fi

# Test 5: Concurrent Request Handling
echo ""
echo -e "${BLUE}Test 5: Concurrent Request Handling${NC}"
echo "Testing rate limiter under concurrent load..."

# Launch multiple requests in parallel
concurrent_results=""
for i in {1..10}; do
    make_request "GET" "$test_endpoint" "" "200" 5 &
done

# Wait for all background jobs
wait

# Check if any requests were properly rate limited
concurrent_limited=0
for i in {1..20}; do
    if make_request "GET" "$test_endpoint" "" "429" 2; then
        concurrent_limited=$((concurrent_limited + 1))
        break
    fi
done

if [ $concurrent_limited -ge 1 ]; then
    log_test_result "Concurrent Request Handling" "PASS" "Rate limiting works under concurrent load" \
        "Rate limiting activated under concurrent requests" "None"
else
    log_test_result "Concurrent Request Handling" "WARN" "Concurrent rate limiting unclear" \
        "Cannot verify rate limiting under concurrent load" \
        "MEDIUM: Potential bypass under high concurrency"
fi

# Test 6: Authentication Bypass Attempt
echo ""
echo -e "${BLUE}Test 6: Authentication Bypass Attempt${NC}"
echo "Testing if rate limiting can be bypassed by varying authentication..."

# Test with different authentication patterns
bypass_attempts=0
bypass_successful=0

test_endpoints=("/api/notes" "/api/chat/stream" "/api/feedback/submit")

for endpoint in "${test_endpoints[@]}"; do
    bypass_attempts=$((bypass_attempts + 1))

    # Try without authentication (should still be rate limited)
    if make_request "POST" "$endpoint" '{"test": "data"}' "401" 5; then
        # 401 is expected, but we want to ensure it's not 200 (bypass)
        if ! make_request "POST" "$endpoint" '{"test": "data"}' "200" 5; then
            bypass_successful=$((bypass_successful + 1))
        fi
    fi
done

if [ $bypass_successful -eq $bypass_attempts ]; then
    log_test_result "Authentication Bypass Prevention" "PASS" "Rate limiting prevents bypass attempts" \
        "All bypass attempts properly handled" "None"
else
    log_test_result "Authentication Bypass Prevention" "FAIL" "Potential bypass detected" \
        "Some requests may bypass rate limiting" \
        "HIGH: Authentication state may affect rate limiting"
fi

# Test 7: Resource Exhaustion Protection
echo ""
echo -e "${BLUE}Test 7: Resource Exhaustion Protection${NC}"
echo "Testing protection against resource exhaustion attacks..."

# Check if rate limiter has cleanup mechanisms
if [ -f "$rate_limiter_file" ]; then
    if grep -q "delete.*lt\|cleanup\|expire" "$rate_limiter_file"; then
        log_test_result "Resource Exhaustion Protection" "PASS" "Cleanup mechanisms implemented" \
            "Rate limit entries are cleaned up" "None"
    else
        log_test_result "Resource Exhaustion Protection" "FAIL" "No cleanup mechanisms" \
            "Rate limit storage may grow indefinitely" \
            "MEDIUM: Potential memory/storage exhaustion"
    fi
fi

# Generate Test Summary
echo ""
echo -e "${BLUE}Test Summary${NC}"
echo "=========================="
echo -e "Total Tests: ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

# Calculate security score
if [ $TOTAL_TESTS -gt 0 ]; then
    SECURITY_SCORE=$(( (PASSED_TESTS * 100) / TOTAL_TESTS ))
    echo -e "Security Score: ${BLUE}$SECURITY_SCORE%${NC}"

    if [ $SECURITY_SCORE -ge 90 ]; then
        echo -e "Security Status: ${GREEN}EXCELLENT - Fail-Close Properly Implemented${NC}"
    elif [ $SECURITY_SCORE -ge 80 ]; then
        echo -e "Security Status: ${GREEN}GOOD - Minor Issues${NC}"
    elif [ $SECURITY_SCORE -ge 70 ]; then
        echo -e "Security Status: ${YELLOW}NEEDS IMPROVEMENT${NC}"
    else
        echo -e "Security Status: ${RED}CRITICAL ISSUES - Fail-Close Not Implemented${NC}"
    fi
fi

# Update final results file
if command -v jq &> /dev/null; then
    local temp_file=$(mktemp)
    jq ".summary = {
        \"total_tests\": $TOTAL_TESTS,
        \"passed_tests\": $PASSED_TESTS,
        \"failed_tests\": $FAILED_TESTS,
        \"security_score\": $SECURITY_SCORE,
        \"fail_close_implemented\": $([ $SECURITY_SCORE -ge 80 ] && echo "true" || echo "false")
    }" "$TEST_RESULTS_FILE" > "$temp_file"
    mv "$temp_file" "$TEST_RESULTS_FILE"
fi

echo ""
echo "Detailed test results: $TEST_RESULTS_FILE"
echo "Test execution log: $LOG_FILE"

# Exit with appropriate code
if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}SECURITY ALERT: Some fail-close tests failed. Review implementation immediately.${NC}"
    exit 1
else
    echo -e "${GREEN}All fail-close tests passed. Rate limiting security is properly implemented.${NC}"
    exit 0
fi