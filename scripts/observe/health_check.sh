#!/bin/bash
set -euo pipefail

# FlowReader Health Check Script
# Purpose: Sample health endpoint N times and report success rate
# Usage: ./health_check.sh [APP_URL] [SAMPLE_COUNT]
# Example: ./health_check.sh http://localhost:5173 10

# Configuration
DEFAULT_APP_URL="http://localhost:5173"
DEFAULT_SAMPLES=10
SLEEP_BETWEEN_SAMPLES=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Help function
show_help() {
    cat << EOF
FlowReader Health Check Sampler
================================
Samples the /api/health endpoint multiple times and reports statistics.

Usage:
  $0 [APP_URL] [SAMPLE_COUNT]

Arguments:
  APP_URL       - Application URL (default: $DEFAULT_APP_URL)
  SAMPLE_COUNT  - Number of samples to take (default: $DEFAULT_SAMPLES)

Examples:
  $0                                    # Use defaults
  $0 http://localhost:5174              # Custom port
  $0 http://localhost:5173 20           # 20 samples

Requirements:
  - curl
  - jq (optional, for JSON parsing)

Output:
  - Success rate percentage
  - Response time statistics
  - Recent error samples (if any)

EOF
    exit 0
}

# Parse arguments
if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
    show_help
fi

APP_URL="${1:-$DEFAULT_APP_URL}"
SAMPLE_COUNT="${2:-$DEFAULT_SAMPLES}"

# Validate sample count
if ! [[ "$SAMPLE_COUNT" =~ ^[0-9]+$ ]] || [[ "$SAMPLE_COUNT" -lt 1 ]]; then
    echo -e "${RED}Error: Sample count must be a positive number${NC}"
    exit 1
fi

# Check dependencies
if ! command -v curl &> /dev/null; then
    echo -e "${RED}Error: curl is required but not installed${NC}"
    exit 1
fi

HAS_JQ=false
if command -v jq &> /dev/null; then
    HAS_JQ=true
fi

# Initialize counters
SUCCESS_COUNT=0
FAIL_COUNT=0
TOTAL_TIME=0
declare -a ERRORS=()
declare -a RESPONSE_TIMES=()

# Header
echo "========================================"
echo "FlowReader Health Check Sampler"
echo "========================================"
echo "Target: ${APP_URL}/api/health"
echo "Samples: ${SAMPLE_COUNT}"
echo "Interval: ${SLEEP_BETWEEN_SAMPLES}s"
echo "Started: $(date '+%Y-%m-%d %H:%M:%S')"
echo "----------------------------------------"

# Sampling function
perform_health_check() {
    local sample_num=$1
    local start_time=$(date +%s%3N 2>/dev/null || date +%s)

    # Make request
    local response
    local http_code
    local response_time

    if response=$(curl -s -w "\n%{http_code}\n%{time_total}" \
                       --max-time 5 \
                       "${APP_URL}/api/health" 2>/dev/null); then

        # Parse response
        local body=$(echo "$response" | head -n -2)
        http_code=$(echo "$response" | tail -2 | head -1)
        response_time=$(echo "$response" | tail -1)

        # Calculate time in ms
        response_time_ms=$(echo "$response_time * 1000" | bc 2>/dev/null || echo "N/A")

        if [[ "$http_code" == "200" ]]; then
            # Check if response contains "ok" status
            local status="unknown"
            if [[ "$HAS_JQ" == true ]] && [[ -n "$body" ]]; then
                status=$(echo "$body" | jq -r '.status // "error"' 2>/dev/null || echo "parse_error")
            elif [[ "$body" == *'"status":"ok"'* ]] || [[ "$body" == *'"status": "ok"'* ]]; then
                status="ok"
            fi

            if [[ "$status" == "ok" ]]; then
                echo -e "[${sample_num}/${SAMPLE_COUNT}] ${GREEN}✓${NC} Success (${response_time_ms}ms)"
                ((SUCCESS_COUNT++))
                RESPONSE_TIMES+=("$response_time_ms")
            else
                echo -e "[${sample_num}/${SAMPLE_COUNT}] ${YELLOW}⚠${NC} HTTP 200 but status not 'ok': ${status}"
                ((FAIL_COUNT++))
                ERRORS+=("[Sample ${sample_num}] Status: ${status}")
            fi
        else
            echo -e "[${sample_num}/${SAMPLE_COUNT}] ${RED}✗${NC} HTTP ${http_code}"
            ((FAIL_COUNT++))
            ERRORS+=("[Sample ${sample_num}] HTTP ${http_code}")
        fi
    else
        echo -e "[${sample_num}/${SAMPLE_COUNT}] ${RED}✗${NC} Connection failed"
        ((FAIL_COUNT++))
        ERRORS+=("[Sample ${sample_num}] Connection failed")
    fi
}

# Main sampling loop
echo ""
echo "Sampling..."
echo ""

for i in $(seq 1 "$SAMPLE_COUNT"); do
    perform_health_check "$i"

    # Sleep between samples (except for last one)
    if [[ "$i" -lt "$SAMPLE_COUNT" ]]; then
        sleep "$SLEEP_BETWEEN_SAMPLES"
    fi
done

# Calculate statistics
SUCCESS_RATE=$(echo "scale=2; $SUCCESS_COUNT * 100 / $SAMPLE_COUNT" | bc 2>/dev/null || \
               echo $(( SUCCESS_COUNT * 100 / SAMPLE_COUNT )))

# Response time statistics (if we have data)
if [[ ${#RESPONSE_TIMES[@]} -gt 0 ]]; then
    # Calculate average
    TOTAL=0
    for time in "${RESPONSE_TIMES[@]}"; do
        if [[ "$time" != "N/A" ]]; then
            TOTAL=$(echo "$TOTAL + $time" | bc 2>/dev/null || echo "0")
        fi
    done
    AVG_TIME=$(echo "scale=2; $TOTAL / ${#RESPONSE_TIMES[@]}" | bc 2>/dev/null || echo "N/A")
fi

# Results summary
echo ""
echo "========================================"
echo "Results Summary"
echo "========================================"
echo "Completed: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Success rate with color coding
if (( $(echo "$SUCCESS_RATE >= 95" | bc -l 2>/dev/null || echo 0) )); then
    echo -e "Success Rate: ${GREEN}${SUCCESS_RATE}%${NC} (${SUCCESS_COUNT}/${SAMPLE_COUNT})"
elif (( $(echo "$SUCCESS_RATE >= 80" | bc -l 2>/dev/null || echo 0) )); then
    echo -e "Success Rate: ${YELLOW}${SUCCESS_RATE}%${NC} (${SUCCESS_COUNT}/${SAMPLE_COUNT})"
else
    echo -e "Success Rate: ${RED}${SUCCESS_RATE}%${NC} (${SUCCESS_COUNT}/${SAMPLE_COUNT})"
fi

# Response times
if [[ ${#RESPONSE_TIMES[@]} -gt 0 ]] && [[ "$AVG_TIME" != "N/A" ]]; then
    echo "Avg Response Time: ${AVG_TIME}ms"
fi

# Recent errors
if [[ ${#ERRORS[@]} -gt 0 ]]; then
    echo ""
    echo "Recent Error Samples:"
    echo "--------------------"
    # Show last 5 errors
    for ((i=${#ERRORS[@]}-1; i>=0 && i>=${#ERRORS[@]}-5; i--)); do
        echo "  ${ERRORS[$i]}"
    done
fi

# Threshold assessment
echo ""
echo "Threshold Assessment:"
echo "--------------------"
if (( $(echo "$SUCCESS_RATE >= 95" | bc -l 2>/dev/null || echo 0) )); then
    echo -e "${GREEN}✓ Within acceptable range (>95%)${NC}"
    EXIT_CODE=0
elif (( $(echo "$SUCCESS_RATE >= 80" | bc -l 2>/dev/null || echo 0) )); then
    echo -e "${YELLOW}⚠ Warning: Below optimal (80-95%)${NC}"
    echo "  Action: Monitor closely, check logs"
    EXIT_CODE=1
else
    echo -e "${RED}✗ Critical: Below threshold (<80%)${NC}"
    echo "  Action: Immediate investigation required"
    EXIT_CODE=2
fi

echo ""
echo "========================================"

# Exit with appropriate code
exit $EXIT_CODE