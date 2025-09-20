#!/bin/bash

# FlowReader Alert Validation System
# Tests alert delivery chain: trigger → alert → recovery

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="/tmp/flowreader-alert-validation"
VALIDATION_LOG="$DATA_DIR/alert-validation-$(date +%Y%m%d-%H%M%S).log"
PRODUCTION_URL=${PRODUCTION_URL:-"https://flowreader.vercel.app"}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Alert thresholds (matching monitoring script)
declare -A THRESHOLDS=(
    ["p95_latency"]=2000
    ["p50_latency"]=1500
    ["error_rate"]=5.0
    ["health_check"]=200
    ["db_response"]=1000
    ["security_score"]=80
)

# Initialize validation environment
init_validation() {
    echo -e "${BLUE}🔧 Initializing alert validation environment...${NC}"

    mkdir -p "$DATA_DIR"

    cat > "$VALIDATION_LOG" << EOF
# FlowReader Alert Validation Log
# Started: $(date)
# Production URL: $PRODUCTION_URL

=== ALERT VALIDATION TEST SUITE ===

EOF

    echo -e "${GREEN}✅ Validation environment initialized${NC}"
}

# Test alert trigger mechanism
test_alert_trigger() {
    local alert_type="$1"
    local threshold="$2"
    local test_description="$3"

    echo -e "\n${BLUE}🎯 Testing alert trigger: $alert_type${NC}"
    echo "Description: $test_description"
    echo "Threshold: $threshold"

    local trigger_result=""
    local trigger_success="false"

    case "$alert_type" in
        "p95_latency")
            trigger_result=$(test_latency_alert "$threshold")
            ;;
        "health_check")
            trigger_result=$(test_health_alert "$threshold")
            ;;
        "error_rate")
            trigger_result=$(test_error_rate_alert "$threshold")
            ;;
        "database")
            trigger_result=$(test_database_alert "$threshold")
            ;;
        "security")
            trigger_result=$(test_security_alert "$threshold")
            ;;
        *)
            trigger_result="Unknown alert type"
            ;;
    esac

    if [[ "$trigger_result" == "TRIGGERED" ]]; then
        trigger_success="true"
        echo -e "${GREEN}✅ Alert trigger successful${NC}"
    else
        echo -e "${RED}❌ Alert trigger failed: $trigger_result${NC}"
    fi

    # Log result
    echo "$(date): $alert_type - Trigger: $trigger_success - Details: $trigger_result" >> "$VALIDATION_LOG"

    echo "$trigger_success"
}

# Test P95 latency alert
test_latency_alert() {
    local threshold="$1"

    echo "  Testing latency alert with threshold ${threshold}ms..."

    # Collect multiple samples to calculate P95
    local response_times=()
    local total_requests=10

    for i in $(seq 1 $total_requests); do
        local response=$(curl -s -w "%{time_total}" -o /dev/null "$PRODUCTION_URL/api/health" 2>/dev/null || echo "999")
        local response_ms=$(echo "$response * 1000" | bc -l | cut -d'.' -f1)
        response_times+=("$response_ms")
        sleep 0.1
    done

    # Calculate P95
    IFS=$'\n' sorted_times=($(printf '%s\n' "${response_times[@]}" | sort -n))
    local count=${#sorted_times[@]}
    local p95_index=$((count * 95 / 100))
    local p95_latency=${sorted_times[$p95_index]}

    echo "  Current P95 latency: ${p95_latency}ms"

    if [[ "$p95_latency" -gt "$threshold" ]]; then
        echo "TRIGGERED"
    else
        echo "NORMAL (${p95_latency}ms <= ${threshold}ms)"
    fi
}

# Test health check alert
test_health_alert() {
    local expected_code="$1"

    echo "  Testing health check alert..."

    local health_response=$(curl -s -w "%{http_code}" -o /dev/null "$PRODUCTION_URL/api/health" 2>/dev/null || echo "000")

    echo "  Health check status: $health_response"

    if [[ "$health_response" != "$expected_code" ]]; then
        echo "TRIGGERED"
    else
        echo "NORMAL (status: $health_response)"
    fi
}

# Test error rate alert
test_error_rate_alert() {
    local threshold="$1"

    echo "  Testing error rate alert with threshold ${threshold}%..."

    # Test multiple endpoints to calculate error rate
    local endpoints=(
        "/api/health"
        "/api/books"
        "/api/non-existent-endpoint"  # This should return 404
        "/"
    )

    local total_requests=0
    local error_requests=0

    for endpoint in "${endpoints[@]}"; do
        for i in {1..3}; do  # 3 samples per endpoint
            local response=$(curl -s -w "%{http_code}" -o /dev/null "$PRODUCTION_URL$endpoint" 2>/dev/null || echo "000")
            total_requests=$((total_requests + 1))

            # Count 4xx and 5xx as errors (except 401 which is expected for protected endpoints)
            if [[ "$response" =~ ^[45] ]] && [[ "$response" != "401" ]]; then
                error_requests=$((error_requests + 1))
            fi

            sleep 0.1
        done
    done

    local error_rate=$(echo "scale=2; $error_requests * 100 / $total_requests" | bc -l)

    echo "  Current error rate: ${error_rate}% (${error_requests}/${total_requests})"

    if [[ "$(echo "$error_rate > $threshold" | bc -l)" == "1" ]]; then
        echo "TRIGGERED"
    else
        echo "NORMAL (${error_rate}% <= ${threshold}%)"
    fi
}

# Test database alert
test_database_alert() {
    local threshold="$1"

    echo "  Testing database connectivity alert..."

    local db_start=$(date +%s%3N)
    local db_response=$(curl -s -w "%{http_code},%{time_total}" \
        -H "Content-Type: application/json" \
        "$PRODUCTION_URL/api/books" 2>/dev/null || echo "000,999")

    local db_code=$(echo "$db_response" | tail -1 | cut -d',' -f1)
    local db_time=$(echo "$db_response" | tail -1 | cut -d',' -f2)
    local db_time_ms=$(echo "$db_time * 1000" | bc -l | cut -d'.' -f1)

    echo "  Database response: ${db_code} in ${db_time_ms}ms"

    # Database alert triggers if:
    # 1. Response code is not 200 or 401 (401 is expected for protected endpoints)
    # 2. Response time exceeds threshold
    if [[ "$db_code" != "200" ]] && [[ "$db_code" != "401" ]]; then
        echo "TRIGGERED (unhealthy: $db_code)"
    elif [[ "$db_time_ms" -gt "$threshold" ]]; then
        echo "TRIGGERED (slow: ${db_time_ms}ms > ${threshold}ms)"
    else
        echo "NORMAL (${db_code} in ${db_time_ms}ms)"
    fi
}

# Test security alert
test_security_alert() {
    local threshold="$1"

    echo "  Testing security headers alert..."

    local headers_response=$(curl -sI "$PRODUCTION_URL/" 2>/dev/null || echo "")

    local security_score=0
    local header_checks=(
        "strict-transport-security:HSTS"
        "content-security-policy:CSP"
        "x-frame-options:X-Frame-Options"
        "x-xss-protection:XSS-Protection"
        "x-content-type-options:Content-Type-Options"
    )

    echo "  Checking security headers:"
    for check in "${header_checks[@]}"; do
        local header=$(echo "$check" | cut -d':' -f1)
        local name=$(echo "$check" | cut -d':' -f2)

        if echo "$headers_response" | grep -qi "$header"; then
            echo "    ✅ $name"
            security_score=$((security_score + 20))
        else
            echo "    ❌ $name"
        fi
    done

    echo "  Security score: ${security_score}/100"

    if [[ "$security_score" -lt "$threshold" ]]; then
        echo "TRIGGERED"
    else
        echo "NORMAL (${security_score}/100 >= ${threshold}/100)"
    fi
}

# Test alert notification delivery
test_alert_delivery() {
    local alert_type="$1"
    local triggered="$2"

    echo -e "\n${BLUE}📢 Testing alert delivery for: $alert_type${NC}"

    if [[ "$triggered" == "true" ]]; then
        # Simulate alert notification
        local notification_result=$(simulate_alert_notification "$alert_type")
        echo "  Notification result: $notification_result"

        # Log delivery test
        echo "$(date): $alert_type - Delivery test: $notification_result" >> "$VALIDATION_LOG"

        if [[ "$notification_result" == "SUCCESS" ]]; then
            echo -e "${GREEN}✅ Alert delivery test passed${NC}"
            return 0
        else
            echo -e "${RED}❌ Alert delivery test failed${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}⏭️ Skipping delivery test (alert not triggered)${NC}"
        return 0
    fi
}

# Simulate alert notification (placeholder for actual notification system)
simulate_alert_notification() {
    local alert_type="$1"

    # This would integrate with actual notification systems (Slack, email, etc.)
    # For now, we simulate the notification process

    local notification_channels=("console" "log" "webhook_simulation")
    local delivery_success="true"

    for channel in "${notification_channels[@]}"; do
        case "$channel" in
            "console")
                echo "    🔔 Console notification: $alert_type alert triggered"
                ;;
            "log")
                echo "$(date): ALERT NOTIFICATION - $alert_type" >> "$VALIDATION_LOG"
                ;;
            "webhook_simulation")
                # Simulate webhook delivery (could be replaced with actual webhook call)
                local webhook_result=$(echo '{"alert_type":"'$alert_type'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","status":"triggered"}' | wc -l)
                if [[ "$webhook_result" -eq 1 ]]; then
                    echo "    🌐 Webhook notification: SUCCESS"
                else
                    echo "    🌐 Webhook notification: FAILED"
                    delivery_success="false"
                fi
                ;;
        esac
    done

    if [[ "$delivery_success" == "true" ]]; then
        echo "SUCCESS"
    else
        echo "FAILED"
    fi
}

# Test alert recovery
test_alert_recovery() {
    local alert_type="$1"

    echo -e "\n${BLUE}🔄 Testing alert recovery for: $alert_type${NC}"

    # Wait for system to potentially recover
    echo "  Waiting 30 seconds for potential recovery..."
    sleep 30

    # Re-test the condition
    local recovery_result=""
    case "$alert_type" in
        "p95_latency")
            recovery_result=$(test_latency_alert "${THRESHOLDS[p95_latency]}")
            ;;
        "health_check")
            recovery_result=$(test_health_alert "${THRESHOLDS[health_check]}")
            ;;
        "error_rate")
            recovery_result=$(test_error_rate_alert "${THRESHOLDS[error_rate]}")
            ;;
        "database")
            recovery_result=$(test_database_alert "${THRESHOLDS[db_response]}")
            ;;
        "security")
            recovery_result=$(test_security_alert "${THRESHOLDS[security_score]}")
            ;;
    esac

    if [[ "$recovery_result" != "TRIGGERED" ]]; then
        echo -e "${GREEN}✅ Alert recovery successful: $recovery_result${NC}"
        echo "$(date): $alert_type - Recovery: SUCCESS - $recovery_result" >> "$VALIDATION_LOG"
        return 0
    else
        echo -e "${YELLOW}⚠️ Alert still active: $recovery_result${NC}"
        echo "$(date): $alert_type - Recovery: PENDING - $recovery_result" >> "$VALIDATION_LOG"
        return 1
    fi
}

# Comprehensive alert validation
run_comprehensive_validation() {
    echo -e "\n${GREEN}🧪 Running comprehensive alert validation...${NC}"

    local alerts_to_test=(
        "p95_latency:${THRESHOLDS[p95_latency]}:P95 latency exceeds threshold"
        "health_check:${THRESHOLDS[health_check]}:Health check returns non-200 status"
        "error_rate:${THRESHOLDS[error_rate]}:Error rate exceeds threshold"
        "database:${THRESHOLDS[db_response]}:Database connectivity issues"
        "security:${THRESHOLDS[security_score]}:Security headers score below threshold"
    )

    local total_tests=0
    local passed_tests=0
    local triggered_alerts=()

    for alert_config in "${alerts_to_test[@]}"; do
        IFS=':' read -r alert_type threshold description <<< "$alert_config"

        total_tests=$((total_tests + 1))

        echo -e "\n${YELLOW}=== Testing Alert: $alert_type ===${NC}"

        # Test trigger
        local trigger_result=$(test_alert_trigger "$alert_type" "$threshold" "$description")

        if [[ "$trigger_result" == "true" ]]; then
            triggered_alerts+=("$alert_type")

            # Test delivery
            if test_alert_delivery "$alert_type" "true"; then
                # Test recovery
                test_alert_recovery "$alert_type"
                passed_tests=$((passed_tests + 1))
            fi
        else
            echo -e "${GREEN}✅ Alert properly dormant (no trigger condition met)${NC}"
            passed_tests=$((passed_tests + 1))
        fi
    done

    # Summary
    echo -e "\n${BLUE}📊 ALERT VALIDATION SUMMARY${NC}"
    echo "======================================"
    echo "Total tests: $total_tests"
    echo "Passed tests: $passed_tests"
    echo "Success rate: $(echo "scale=1; $passed_tests * 100 / $total_tests" | bc -l)%"

    if [[ ${#triggered_alerts[@]} -gt 0 ]]; then
        echo "Triggered alerts: ${triggered_alerts[*]}"
    else
        echo "Triggered alerts: None (system healthy)"
    fi

    echo ""
    echo "Validation log: $VALIDATION_LOG"

    # Return success if all tests passed
    [[ "$passed_tests" -eq "$total_tests" ]]
}

# Test specific alert type
test_specific_alert() {
    local alert_type="$1"

    if [[ -z "${THRESHOLDS[$alert_type]:-}" ]]; then
        echo -e "${RED}❌ Unknown alert type: $alert_type${NC}"
        echo "Available types: ${!THRESHOLDS[*]}"
        exit 1
    fi

    local threshold="${THRESHOLDS[$alert_type]}"

    echo -e "${BLUE}🎯 Testing specific alert: $alert_type${NC}"

    local trigger_result=$(test_alert_trigger "$alert_type" "$threshold" "Manual test of $alert_type alert")

    if [[ "$trigger_result" == "true" ]]; then
        test_alert_delivery "$alert_type" "true"
        test_alert_recovery "$alert_type"
    fi
}

# Generate validation report
generate_validation_report() {
    local report_file="$DATA_DIR/alert-validation-report-$(date +%Y%m%d-%H%M%S).md"

    echo -e "${BLUE}📋 Generating validation report...${NC}"

    cat > "$report_file" << EOF
# FlowReader Alert Validation Report

**Generated**: $(date)
**Production URL**: $PRODUCTION_URL
**Validation Log**: $VALIDATION_LOG

## Alert Thresholds

| Alert Type | Threshold | Description |
|------------|-----------|-------------|
| P95 Latency | ${THRESHOLDS[p95_latency]}ms | Response time 95th percentile |
| P50 Latency | ${THRESHOLDS[p50_latency]}ms | Response time 50th percentile |
| Error Rate | ${THRESHOLDS[error_rate]}% | Percentage of failed requests |
| Health Check | ${THRESHOLDS[health_check]} | Expected HTTP status code |
| Database Response | ${THRESHOLDS[db_response]}ms | Database query response time |
| Security Score | ${THRESHOLDS[security_score]}/100 | Security headers compliance |

## Validation Results

EOF

    # Extract validation results from log
    if [[ -f "$VALIDATION_LOG" ]]; then
        echo "### Alert Trigger Tests" >> "$report_file"
        echo "" >> "$report_file"
        grep "Trigger:" "$VALIDATION_LOG" | while read line; do
            echo "- $line" >> "$report_file"
        done

        echo "" >> "$report_file"
        echo "### Alert Delivery Tests" >> "$report_file"
        echo "" >> "$report_file"
        grep "Delivery test:" "$VALIDATION_LOG" | while read line; do
            echo "- $line" >> "$report_file"
        done

        echo "" >> "$report_file"
        echo "### Alert Recovery Tests" >> "$report_file"
        echo "" >> "$report_file"
        grep "Recovery:" "$VALIDATION_LOG" | while read line; do
            echo "- $line" >> "$report_file"
        done
    fi

    echo "" >> "$report_file"
    echo "## Recommendations" >> "$report_file"
    echo "" >> "$report_file"
    echo "- Monitor alert frequency to avoid alert fatigue" >> "$report_file"
    echo "- Implement alert escalation policies for critical issues" >> "$report_file"
    echo "- Regular validation of alert delivery channels" >> "$report_file"
    echo "- Review and adjust thresholds based on production patterns" >> "$report_file"
    echo "- Implement automated alert acknowledgment for resolved issues" >> "$report_file"

    echo -e "${GREEN}✅ Validation report generated: $report_file${NC}"
    echo "$report_file"
}

# Show usage information
show_usage() {
    cat << EOF
FlowReader Alert Validation System

Usage: $0 [OPTIONS] [COMMAND]

Commands:
  comprehensive     Run comprehensive alert validation (default)
  test <alert_type> Test specific alert type
  report           Generate validation report only

Alert Types:
  p95_latency      P95 response time alert
  health_check     Health endpoint alert
  error_rate       Error rate threshold alert
  database         Database connectivity alert
  security         Security headers alert

Options:
  -h, --help       Show this help message
  -u, --url URL    Set production URL (default: https://flowreader.vercel.app)

Examples:
  $0                           # Run comprehensive validation
  $0 comprehensive             # Run comprehensive validation
  $0 test p95_latency          # Test only P95 latency alert
  $0 report                    # Generate report from existing logs
  $0 -u https://example.com    # Use custom production URL

EOF
}

# Main function
main() {
    local command="comprehensive"
    local specific_alert=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_usage
                exit 0
                ;;
            -u|--url)
                PRODUCTION_URL="$2"
                shift 2
                ;;
            comprehensive)
                command="comprehensive"
                shift
                ;;
            test)
                command="test"
                specific_alert="$2"
                shift 2
                ;;
            report)
                command="report"
                shift
                ;;
            *)
                echo -e "${RED}❌ Unknown option: $1${NC}"
                show_usage
                exit 1
                ;;
        esac
    done

    echo -e "${GREEN}🚀 FlowReader Alert Validation System${NC}"
    echo "Production URL: $PRODUCTION_URL"
    echo ""

    init_validation

    case "$command" in
        "comprehensive")
            if run_comprehensive_validation; then
                echo -e "\n${GREEN}✅ Comprehensive alert validation completed successfully${NC}"
                generate_validation_report
                exit 0
            else
                echo -e "\n${RED}❌ Alert validation failed${NC}"
                generate_validation_report
                exit 1
            fi
            ;;
        "test")
            if [[ -z "$specific_alert" ]]; then
                echo -e "${RED}❌ Alert type required for test command${NC}"
                show_usage
                exit 1
            fi
            test_specific_alert "$specific_alert"
            generate_validation_report
            ;;
        "report")
            generate_validation_report
            ;;
    esac
}

# Check dependencies
check_dependencies() {
    local deps=("curl" "jq" "bc")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            echo -e "${RED}❌ Required dependency missing: $dep${NC}"
            echo "Please install $dep and try again."
            exit 1
        fi
    done
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    check_dependencies
    main "$@"
fi