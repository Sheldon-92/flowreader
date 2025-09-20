#!/bin/bash
# FlowReader SLO Monitoring and Compliance Check Script
# This script monitors Service Level Objectives (SLOs) and Service Level Indicators (SLIs)
# for FlowReader, providing real-time compliance checking and alerting

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MONITORING_DIR="/tmp/flowreader-monitoring"
SLO_DATA_DIR="$MONITORING_DIR/slo-data"
LOG_FILE="$MONITORING_DIR/slo-check.log"

# Default configuration
PRODUCTION_URL="${PRODUCTION_URL:-https://flowreader.vercel.app}"
CHECK_INTERVAL="${CHECK_INTERVAL:-300}"  # 5 minutes
MEASUREMENT_WINDOW="${MEASUREMENT_WINDOW:-3600}"  # 1 hour
DRY_RUN="${DRY_RUN:-false}"

# SLO Targets (from SLO Policy)
declare -A SLO_TARGETS=(
    ["availability"]="99.5"
    ["p95_latency_ms"]="1500"
    ["p99_latency_ms"]="2500"
    ["error_rate_percent"]="1.0"
    ["dialog_success_rate_percent"]="95.0"
    ["security_compliance_percent"]="100.0"
)

# Warning Thresholds
declare -A WARNING_THRESHOLDS=(
    ["availability"]="99.8"
    ["p95_latency_ms"]="2000"
    ["p99_latency_ms"]="3000"
    ["error_rate_percent"]="2.0"
    ["dialog_success_rate_percent"]="90.0"
    ["security_compliance_percent"]="99.0"
)

# Critical Thresholds
declare -A CRITICAL_THRESHOLDS=(
    ["availability"]="99.5"
    ["p95_latency_ms"]="2500"
    ["p99_latency_ms"]="4000"
    ["error_rate_percent"]="5.0"
    ["dialog_success_rate_percent"]="85.0"
    ["security_compliance_percent"]="95.0"
)

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Utility functions
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
    log "ERROR: $1"
}

warning() {
    echo -e "${YELLOW}WARNING: $1${NC}" >&2
    log "WARNING: $1"
}

success() {
    echo -e "${GREEN}SUCCESS: $1${NC}"
    log "SUCCESS: $1"
}

info() {
    echo -e "${BLUE}INFO: $1${NC}"
    log "INFO: $1"
}

# Initialize monitoring directories
initialize_monitoring() {
    log "Initializing SLO monitoring environment"
    mkdir -p "$MONITORING_DIR" "$SLO_DATA_DIR"

    if [[ ! -f "$LOG_FILE" ]]; then
        touch "$LOG_FILE"
    fi

    # Initialize SLO data files if they don't exist
    for metric in "${!SLO_TARGETS[@]}"; do
        local data_file="$SLO_DATA_DIR/${metric}_data.json"
        if [[ ! -f "$data_file" ]]; then
            echo "[]" > "$data_file"
        fi
    done
}

# Collect availability SLI data
collect_availability_sli() {
    local timestamp="$1"
    local health_check_result

    log "Collecting availability SLI data"

    # Health check
    local health_start_time=$(date +%s%3N)
    if health_check_result=$(curl -s -w "%{http_code}" --max-time 30 "$PRODUCTION_URL/api/health"); then
        local health_end_time=$(date +%s%3N)
        local health_response_time=$((health_end_time - health_start_time))
        local health_status_code="${health_check_result: -3}"

        local is_healthy=false
        if [[ "$health_status_code" == "200" ]]; then
            is_healthy=true
        fi

        # Store availability data
        local availability_data=$(cat "$SLO_DATA_DIR/availability_data.json")
        local new_entry=$(jq -n \
            --arg timestamp "$timestamp" \
            --argjson response_time "$health_response_time" \
            --arg status_code "$health_status_code" \
            --argjson healthy "$is_healthy" \
            '{
                timestamp: $timestamp,
                response_time_ms: $response_time,
                status_code: $status_code,
                healthy: $healthy
            }')

        echo "$availability_data" | jq --argjson entry "$new_entry" '. += [$entry]' > "$SLO_DATA_DIR/availability_data.json"

        return 0
    else
        # Health check failed
        local new_entry=$(jq -n \
            --arg timestamp "$timestamp" \
            --argjson response_time "30000" \
            --arg status_code "timeout" \
            --argjson healthy "false" \
            '{
                timestamp: $timestamp,
                response_time_ms: $response_time,
                status_code: $status_code,
                healthy: $healthy
            }')

        local availability_data=$(cat "$SLO_DATA_DIR/availability_data.json")
        echo "$availability_data" | jq --argjson entry "$new_entry" '. += [$entry]' > "$SLO_DATA_DIR/availability_data.json"

        return 1
    fi
}

# Collect latency SLI data
collect_latency_sli() {
    local timestamp="$1"
    local sample_count=5
    local latencies=()
    local successful_requests=0
    local total_requests=0

    log "Collecting latency SLI data with $sample_count samples"

    # Test endpoints
    local endpoints=("$PRODUCTION_URL" "$PRODUCTION_URL/api/health" "$PRODUCTION_URL/api/books")

    for endpoint in "${endpoints[@]}"; do
        for ((i=1; i<=sample_count; i++)); do
            total_requests=$((total_requests + 1))
            local start_time=$(date +%s%3N)
            local http_code

            if http_code=$(curl -s -w "%{http_code}" --max-time 10 "$endpoint" -o /dev/null); then
                local end_time=$(date +%s%3N)
                local response_time=$((end_time - start_time))

                if [[ "$http_code" =~ ^[23] ]]; then
                    latencies+=("$response_time")
                    successful_requests=$((successful_requests + 1))
                fi
            else
                # Timeout or failure - record as maximum latency
                latencies+=("10000")
            fi

            sleep 0.5  # Small delay between requests
        done
    done

    if [[ ${#latencies[@]} -gt 0 ]]; then
        # Calculate percentiles
        IFS=$'\n' sorted_latencies=($(sort -n <<<"${latencies[*]}"))
        local count=${#sorted_latencies[@]}

        local p50_index=$(( count * 50 / 100 ))
        local p95_index=$(( count * 95 / 100 ))
        local p99_index=$(( count * 99 / 100 ))

        [[ $p50_index -ge $count ]] && p50_index=$((count - 1))
        [[ $p95_index -ge $count ]] && p95_index=$((count - 1))
        [[ $p99_index -ge $count ]] && p99_index=$((count - 1))

        local p50_latency=${sorted_latencies[$p50_index]}
        local p95_latency=${sorted_latencies[$p95_index]}
        local p99_latency=${sorted_latencies[$p99_index]}

        # Calculate mean latency
        local sum=0
        for latency in "${latencies[@]}"; do
            sum=$((sum + latency))
        done
        local mean_latency=$((sum / count))

        # Store latency data
        local latency_entry=$(jq -n \
            --arg timestamp "$timestamp" \
            --argjson p50 "$p50_latency" \
            --argjson p95 "$p95_latency" \
            --argjson p99 "$p99_latency" \
            --argjson mean "$mean_latency" \
            --argjson successful "$successful_requests" \
            --argjson total "$total_requests" \
            '{
                timestamp: $timestamp,
                p50_latency_ms: $p50,
                p95_latency_ms: $p95,
                p99_latency_ms: $p99,
                mean_latency_ms: $mean,
                successful_requests: $successful,
                total_requests: $total,
                success_rate: (($successful / $total) * 100)
            }')

        local latency_data=$(cat "$SLO_DATA_DIR/p95_latency_ms_data.json")
        echo "$latency_data" | jq --argjson entry "$latency_entry" '. += [$entry]' > "$SLO_DATA_DIR/p95_latency_ms_data.json"

        # Also store for P99 tracking
        echo "$latency_data" | jq --argjson entry "$latency_entry" '. += [$entry]' > "$SLO_DATA_DIR/p99_latency_ms_data.json"

        log "Latency metrics collected: P50=${p50_latency}ms, P95=${p95_latency}ms, P99=${p99_latency}ms"
        return 0
    else
        error "No latency samples collected"
        return 1
    fi
}

# Collect error rate SLI data
collect_error_rate_sli() {
    local timestamp="$1"
    local total_requests=0
    local error_requests=0

    log "Collecting error rate SLI data"

    # Test critical endpoints
    local endpoints=(
        "$PRODUCTION_URL/api/health"
        "$PRODUCTION_URL/api/books"
        "$PRODUCTION_URL/"
    )

    for endpoint in "${endpoints[@]}"; do
        for ((i=1; i<=3; i++)); do
            total_requests=$((total_requests + 1))
            local http_code

            if http_code=$(curl -s -w "%{http_code}" --max-time 10 "$endpoint" -o /dev/null); then
                if [[ "$http_code" =~ ^[45] ]] || [[ "$http_code" == "000" ]]; then
                    error_requests=$((error_requests + 1))
                fi
            else
                error_requests=$((error_requests + 1))
            fi
        done
    done

    local error_rate=0
    if [[ $total_requests -gt 0 ]]; then
        error_rate=$(echo "scale=2; $error_requests * 100 / $total_requests" | bc -l)
    fi

    # Store error rate data
    local error_entry=$(jq -n \
        --arg timestamp "$timestamp" \
        --argjson errors "$error_requests" \
        --argjson total "$total_requests" \
        --argjson rate "$error_rate" \
        '{
            timestamp: $timestamp,
            error_requests: $errors,
            total_requests: $total,
            error_rate_percent: $rate
        }')

    local error_data=$(cat "$SLO_DATA_DIR/error_rate_percent_data.json")
    echo "$error_data" | jq --argjson entry "$error_entry" '. += [$entry]' > "$SLO_DATA_DIR/error_rate_percent_data.json"

    log "Error rate collected: ${error_rate}% (${error_requests}/${total_requests})"
    return 0
}

# Collect security compliance SLI data
collect_security_compliance_sli() {
    local timestamp="$1"
    local security_headers=("strict-transport-security" "content-security-policy" "x-frame-options" "x-content-type-options" "x-xss-protection")
    local compliant_headers=0
    local total_headers=${#security_headers[@]}

    log "Collecting security compliance SLI data"

    # Check security headers
    local headers_response
    if headers_response=$(curl -sI --max-time 10 "$PRODUCTION_URL"); then
        for header in "${security_headers[@]}"; do
            if echo "$headers_response" | grep -qi "^$header:"; then
                compliant_headers=$((compliant_headers + 1))
            fi
        done

        local compliance_rate=$(echo "scale=2; $compliant_headers * 100 / $total_headers" | bc -l)

        # Store security compliance data
        local security_entry=$(jq -n \
            --arg timestamp "$timestamp" \
            --argjson compliant "$compliant_headers" \
            --argjson total "$total_headers" \
            --argjson rate "$compliance_rate" \
            '{
                timestamp: $timestamp,
                compliant_headers: $compliant,
                total_headers: $total,
                compliance_percent: $rate
            }')

        local security_data=$(cat "$SLO_DATA_DIR/security_compliance_percent_data.json")
        echo "$security_data" | jq --argjson entry "$security_entry" '. += [$entry]' > "$SLO_DATA_DIR/security_compliance_percent_data.json"

        log "Security compliance: ${compliance_rate}% (${compliant_headers}/${total_headers} headers)"
        return 0
    else
        error "Failed to collect security headers"
        return 1
    fi
}

# Calculate SLO compliance for a metric
calculate_slo_compliance() {
    local metric="$1"
    local window_seconds="$2"
    local data_file="$SLO_DATA_DIR/${metric}_data.json"

    if [[ ! -f "$data_file" ]]; then
        echo "0"
        return 1
    fi

    local cutoff_timestamp=$(date -d "-${window_seconds} seconds" '+%Y-%m-%dT%H:%M:%SZ')
    local recent_data
    recent_data=$(jq --arg cutoff "$cutoff_timestamp" '[.[] | select(.timestamp >= $cutoff)]' "$data_file")

    local data_count
    data_count=$(echo "$recent_data" | jq 'length')

    if [[ $data_count -eq 0 ]]; then
        echo "0"
        return 1
    fi

    local result
    case "$metric" in
        "availability")
            local healthy_count
            healthy_count=$(echo "$recent_data" | jq '[.[] | select(.healthy == true)] | length')
            result=$(echo "scale=2; $healthy_count * 100 / $data_count" | bc -l)
            ;;
        "p95_latency_ms"|"p99_latency_ms")
            local percentile="${metric:1:2}"
            local field="${metric}"
            result=$(echo "$recent_data" | jq -r --arg field "$field" "map(.[\$field]) | sort | .[length * ${percentile} / 100 | floor]")
            ;;
        "error_rate_percent")
            result=$(echo "$recent_data" | jq '[.[].error_rate_percent] | add / length')
            ;;
        "security_compliance_percent")
            result=$(echo "$recent_data" | jq '[.[].compliance_percent] | add / length')
            ;;
        *)
            result="0"
            ;;
    esac

    echo "$result"
}

# Check SLO status and compliance
check_slo_status() {
    local metric="$1"
    local current_value="$2"
    local target="${SLO_TARGETS[$metric]}"
    local warning="${WARNING_THRESHOLDS[$metric]}"
    local critical="${CRITICAL_THRESHOLDS[$metric]}"

    local status="healthy"
    local message=""

    # Determine status based on metric type and thresholds
    case "$metric" in
        "availability"|"dialog_success_rate_percent"|"security_compliance_percent")
            # Higher is better
            if (( $(echo "$current_value < $critical" | bc -l) )); then
                status="critical"
                message="Below critical threshold ($current_value < $critical)"
            elif (( $(echo "$current_value < $warning" | bc -l) )); then
                status="warning"
                message="Below warning threshold ($current_value < $warning)"
            elif (( $(echo "$current_value < $target" | bc -l) )); then
                status="violation"
                message="Below SLO target ($current_value < $target)"
            fi
            ;;
        "p95_latency_ms"|"p99_latency_ms"|"error_rate_percent")
            # Lower is better
            if (( $(echo "$current_value > $critical" | bc -l) )); then
                status="critical"
                message="Above critical threshold ($current_value > $critical)"
            elif (( $(echo "$current_value > $warning" | bc -l) )); then
                status="warning"
                message="Above warning threshold ($current_value > $warning)"
            elif (( $(echo "$current_value > $target" | bc -l) )); then
                status="violation"
                message="Above SLO target ($current_value > $target)"
            fi
            ;;
    esac

    echo "$status|$message"
}

# Calculate error budget consumption
calculate_error_budget() {
    local metric="$1"
    local current_value="$2"
    local target="${SLO_TARGETS[$metric]}"

    local error_budget_percent=0
    local budget_consumed=0

    case "$metric" in
        "availability")
            error_budget_percent=$(echo "100 - $target" | bc -l)
            local current_error_rate=$(echo "100 - $current_value" | bc -l)
            if (( $(echo "$error_budget_percent > 0" | bc -l) )); then
                budget_consumed=$(echo "scale=2; $current_error_rate * 100 / $error_budget_percent" | bc -l)
            fi
            ;;
        "error_rate_percent")
            error_budget_percent="$target"
            budget_consumed=$(echo "scale=2; $current_value * 100 / $error_budget_percent" | bc -l)
            ;;
        *)
            # For other metrics, calculate based on deviation from target
            local deviation
            if [[ "$metric" =~ latency ]]; then
                deviation=$(echo "scale=2; ($current_value - $target) * 100 / $target" | bc -l)
            else
                deviation=$(echo "scale=2; ($target - $current_value) * 100 / $target" | bc -l)
            fi
            budget_consumed="$deviation"
            ;;
    esac

    # Ensure budget consumed is within 0-100% range
    if (( $(echo "$budget_consumed < 0" | bc -l) )); then
        budget_consumed=0
    elif (( $(echo "$budget_consumed > 100" | bc -l) )); then
        budget_consumed=100
    fi

    echo "$budget_consumed"
}

# Generate SLO compliance report
generate_slo_report() {
    local window_seconds="$1"
    local report_file="$MONITORING_DIR/slo-report-$(date +%Y%m%d_%H%M%S).md"

    log "Generating SLO compliance report for ${window_seconds}s window"

    cat > "$report_file" << EOF
# FlowReader SLO Compliance Report

**Generated**: $(date '+%Y-%m-%d %H:%M:%S UTC')
**Measurement Window**: ${window_seconds} seconds ($(( window_seconds / 60 )) minutes)
**Production URL**: $PRODUCTION_URL

## SLO Compliance Summary

EOF

    local overall_status="healthy"
    local violations_count=0
    local warnings_count=0
    local criticals_count=0

    echo "| Metric | Current Value | SLO Target | Status | Error Budget Consumed |" >> "$report_file"
    echo "|--------|---------------|------------|--------|-----------------------|" >> "$report_file"

    for metric in "${!SLO_TARGETS[@]}"; do
        local current_value
        current_value=$(calculate_slo_compliance "$metric" "$window_seconds")

        if [[ "$current_value" == "0" ]]; then
            continue  # Skip if no data available
        fi

        local status_info
        status_info=$(check_slo_status "$metric" "$current_value")
        local status="${status_info%|*}"
        local message="${status_info#*|}"

        local error_budget
        error_budget=$(calculate_error_budget "$metric" "$current_value")

        local status_icon="✅"
        case "$status" in
            "warning")
                status_icon="⚠️"
                warnings_count=$((warnings_count + 1))
                overall_status="warning"
                ;;
            "violation")
                status_icon="❌"
                violations_count=$((violations_count + 1))
                overall_status="violation"
                ;;
            "critical")
                status_icon="🚨"
                criticals_count=$((criticals_count + 1))
                overall_status="critical"
                ;;
        esac

        # Format values based on metric type
        local formatted_value="$current_value"
        local formatted_target="${SLO_TARGETS[$metric]}"

        if [[ "$metric" =~ latency ]]; then
            formatted_value="${current_value}ms"
            formatted_target="${formatted_target}ms"
        elif [[ "$metric" =~ percent ]]; then
            formatted_value="${current_value}%"
            formatted_target="${formatted_target}%"
        fi

        echo "| $metric | $formatted_value | $formatted_target | $status_icon $status | ${error_budget}% |" >> "$report_file"

        if [[ "$status" != "healthy" ]]; then
            echo "" >> "$report_file"
            echo "**$metric Alert**: $message" >> "$report_file"
        fi
    done

    # Add summary section
    cat >> "$report_file" << EOF

## Alert Summary

- **Overall Status**: $overall_status
- **Critical Alerts**: $criticals_count
- **Violations**: $violations_count
- **Warnings**: $warnings_count

## Error Budget Status

EOF

    for metric in "${!SLO_TARGETS[@]}"; do
        local current_value
        current_value=$(calculate_slo_compliance "$metric" "$window_seconds")

        if [[ "$current_value" == "0" ]]; then
            continue
        fi

        local error_budget
        error_budget=$(calculate_error_budget "$metric" "$current_value")

        local budget_status="🟢 Healthy"
        if (( $(echo "$error_budget > 85" | bc -l) )); then
            budget_status="🔴 Critical"
        elif (( $(echo "$error_budget > 50" | bc -l) )); then
            budget_status="🟡 Warning"
        fi

        echo "- **$metric**: ${error_budget}% consumed - $budget_status" >> "$report_file"
    done

    cat >> "$report_file" << EOF

## Recommendations

EOF

    if [[ $criticals_count -gt 0 ]]; then
        echo "- **IMMEDIATE ACTION REQUIRED**: $criticals_count critical SLO violations detected" >> "$report_file"
        echo "- Execute emergency response procedures" >> "$report_file"
        echo "- Consider deployment freeze until issues are resolved" >> "$report_file"
    elif [[ $violations_count -gt 0 ]]; then
        echo "- **ACTION REQUIRED**: $violations_count SLO violations detected" >> "$report_file"
        echo "- Investigate root causes and implement fixes" >> "$report_file"
        echo "- Monitor error budget consumption closely" >> "$report_file"
    elif [[ $warnings_count -gt 0 ]]; then
        echo "- **MONITORING REQUIRED**: $warnings_count warning thresholds exceeded" >> "$report_file"
        echo "- Increase monitoring frequency" >> "$report_file"
        echo "- Consider preventive actions" >> "$report_file"
    else
        echo "- All SLOs are healthy and within targets" >> "$report_file"
        echo "- Continue normal operations" >> "$report_file"
    fi

    echo "" >> "$report_file"
    echo "---" >> "$report_file"
    echo "*Report generated by FlowReader SLO Monitoring System*" >> "$report_file"

    log "SLO report generated: $report_file"
    echo "$report_file"
}

# Send alert notifications
send_alert() {
    local metric="$1"
    local status="$2"
    local current_value="$3"
    local message="$4"

    local severity="info"
    case "$status" in
        "critical") severity="critical" ;;
        "violation") severity="high" ;;
        "warning") severity="warning" ;;
    esac

    local alert_message="SLO Alert: $metric - $status ($message)"

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "[DRY RUN] Alert: $alert_message"
        return 0
    fi

    # Log alert
    log "ALERT [$severity]: $alert_message"

    # Console output with color
    case "$status" in
        "critical")
            echo -e "${RED}🚨 CRITICAL: $alert_message${NC}"
            ;;
        "violation")
            echo -e "${RED}❌ VIOLATION: $alert_message${NC}"
            ;;
        "warning")
            echo -e "${YELLOW}⚠️ WARNING: $alert_message${NC}"
            ;;
    esac

    # Webhook notification (placeholder for integration)
    if [[ -n "${WEBHOOK_URL:-}" ]]; then
        local payload=$(jq -n \
            --arg metric "$metric" \
            --arg status "$status" \
            --arg value "$current_value" \
            --arg message "$message" \
            --arg severity "$severity" \
            --arg timestamp "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
            '{
                metric: $metric,
                status: $status,
                current_value: $value,
                message: $message,
                severity: $severity,
                timestamp: $timestamp,
                service: "flowreader",
                alert_type: "slo_compliance"
            }')

        curl -s -X POST -H "Content-Type: application/json" \
             -d "$payload" \
             "$WEBHOOK_URL" || warning "Failed to send webhook notification"
    fi

    # Email notification (placeholder for integration)
    if [[ -n "${ALERT_EMAIL:-}" ]] && command -v mail >/dev/null 2>&1; then
        echo "$alert_message" | mail -s "FlowReader SLO Alert - $severity" "$ALERT_EMAIL" || \
            warning "Failed to send email notification"
    fi
}

# Main monitoring loop
run_continuous_monitoring() {
    local duration="$1"
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))

    info "Starting continuous SLO monitoring for ${duration}s ($(( duration / 60 )) minutes)"
    info "Production URL: $PRODUCTION_URL"
    info "Check interval: ${CHECK_INTERVAL}s"

    while [[ $(date +%s) -lt $end_time ]]; do
        local timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

        info "Collecting SLI data at $timestamp"

        # Collect all SLI metrics
        collect_availability_sli "$timestamp"
        collect_latency_sli "$timestamp"
        collect_error_rate_sli "$timestamp"
        collect_security_compliance_sli "$timestamp"

        # Check SLO compliance and send alerts
        for metric in "${!SLO_TARGETS[@]}"; do
            local current_value
            current_value=$(calculate_slo_compliance "$metric" "$MEASUREMENT_WINDOW")

            if [[ "$current_value" != "0" ]]; then
                local status_info
                status_info=$(check_slo_status "$metric" "$current_value")
                local status="${status_info%|*}"
                local message="${status_info#*|}"

                if [[ "$status" != "healthy" ]]; then
                    send_alert "$metric" "$status" "$current_value" "$message"
                fi
            fi
        done

        # Clean up old data (keep last 24 hours)
        cleanup_old_data

        info "SLI collection complete. Next check in ${CHECK_INTERVAL}s"
        sleep "$CHECK_INTERVAL"
    done

    success "Continuous monitoring completed"
}

# Cleanup old monitoring data
cleanup_old_data() {
    local cutoff_timestamp=$(date -d "-24 hours" '+%Y-%m-%dT%H:%M:%SZ')

    for data_file in "$SLO_DATA_DIR"/*.json; do
        if [[ -f "$data_file" ]]; then
            local cleaned_data
            cleaned_data=$(jq --arg cutoff "$cutoff_timestamp" '[.[] | select(.timestamp >= $cutoff)]' "$data_file")
            echo "$cleaned_data" > "$data_file"
        fi
    done
}

# Display current SLO status
show_slo_status() {
    local window_seconds="${1:-3600}"  # Default 1 hour

    echo -e "\n${BLUE}FlowReader SLO Status Report${NC}"
    echo "=================================="
    echo "Measurement Window: $(( window_seconds / 60 )) minutes"
    echo "Production URL: $PRODUCTION_URL"
    echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S UTC')"
    echo ""

    printf "%-30s %-15s %-15s %-10s %-15s\n" "Metric" "Current" "Target" "Status" "Error Budget"
    printf "%-30s %-15s %-15s %-10s %-15s\n" "$(printf '%*s' 30 | tr ' ' '-')" "$(printf '%*s' 15 | tr ' ' '-')" "$(printf '%*s' 15 | tr ' ' '-')" "$(printf '%*s' 10 | tr ' ' '-')" "$(printf '%*s' 15 | tr ' ' '-')"

    local overall_status="healthy"

    for metric in "${!SLO_TARGETS[@]}"; do
        local current_value
        current_value=$(calculate_slo_compliance "$metric" "$window_seconds")

        if [[ "$current_value" == "0" ]]; then
            printf "%-30s %-15s %-15s %-10s %-15s\n" "$metric" "N/A" "${SLO_TARGETS[$metric]}" "No Data" "N/A"
            continue
        fi

        local status_info
        status_info=$(check_slo_status "$metric" "$current_value")
        local status="${status_info%|*}"

        local error_budget
        error_budget=$(calculate_error_budget "$metric" "$current_value")

        local status_display="$status"
        case "$status" in
            "healthy") status_display="${GREEN}✅ OK${NC}" ;;
            "warning") status_display="${YELLOW}⚠️ WARN${NC}"; overall_status="warning" ;;
            "violation") status_display="${RED}❌ VIOL${NC}"; overall_status="violation" ;;
            "critical") status_display="${RED}🚨 CRIT${NC}"; overall_status="critical" ;;
        esac

        # Format values for display
        local formatted_current="$current_value"
        local formatted_target="${SLO_TARGETS[$metric]}"

        if [[ "$metric" =~ latency ]]; then
            formatted_current="${current_value}ms"
            formatted_target="${formatted_target}ms"
        elif [[ "$metric" =~ percent ]]; then
            formatted_current="${current_value}%"
            formatted_target="${formatted_target}%"
        fi

        printf "%-30s %-15s %-15s %-10s %-15s\n" "$metric" "$formatted_current" "$formatted_target" "$status_display" "${error_budget}%"
    done

    echo ""
    echo -n "Overall System Status: "
    case "$overall_status" in
        "healthy") echo -e "${GREEN}✅ All SLOs Healthy${NC}" ;;
        "warning") echo -e "${YELLOW}⚠️ Warning - Some SLOs At Risk${NC}" ;;
        "violation") echo -e "${RED}❌ Violation - SLOs Not Met${NC}" ;;
        "critical") echo -e "${RED}🚨 Critical - Immediate Action Required${NC}" ;;
    esac
    echo ""
}

# Display error budget status
show_error_budget_status() {
    local window_seconds="${1:-86400}"  # Default 24 hours

    echo -e "\n${BLUE}FlowReader Error Budget Status${NC}"
    echo "=================================="
    echo "Measurement Window: $(( window_seconds / 3600 )) hours"
    echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S UTC')"
    echo ""

    printf "%-30s %-15s %-15s %-15s\n" "Metric" "Budget Used" "Budget Left" "Status"
    printf "%-30s %-15s %-15s %-15s\n" "$(printf '%*s' 30 | tr ' ' '-')" "$(printf '%*s' 15 | tr ' ' '-')" "$(printf '%*s' 15 | tr ' ' '-')" "$(printf '%*s' 15 | tr ' ' '-')"

    for metric in "${!SLO_TARGETS[@]}"; do
        local current_value
        current_value=$(calculate_slo_compliance "$metric" "$window_seconds")

        if [[ "$current_value" == "0" ]]; then
            printf "%-30s %-15s %-15s %-15s\n" "$metric" "N/A" "N/A" "No Data"
            continue
        fi

        local error_budget
        error_budget=$(calculate_error_budget "$metric" "$current_value")
        local budget_remaining=$(echo "100 - $error_budget" | bc -l)

        local status_display
        if (( $(echo "$error_budget > 85" | bc -l) )); then
            status_display="${RED}🔴 Critical${NC}"
        elif (( $(echo "$error_budget > 50" | bc -l) )); then
            status_display="${YELLOW}🟡 Warning${NC}"
        else
            status_display="${GREEN}🟢 Healthy${NC}"
        fi

        printf "%-30s %-15s %-15s %-15s\n" "$metric" "${error_budget}%" "${budget_remaining}%" "$status_display"
    done
    echo ""
}

# Display help information
show_help() {
    cat << EOF
FlowReader SLO Monitoring Script

Usage: $0 [OPTIONS] [COMMAND]

COMMANDS:
    status                  Show current SLO status
    detailed               Show detailed SLO report with error budgets
    error-budget           Show error budget consumption status
    violations             Show current SLO violations
    monitor DURATION       Run continuous monitoring for DURATION seconds
    report [WINDOW]        Generate comprehensive SLO report
    emergency              Emergency SLO status check with all details

OPTIONS:
    --production-url URL   Production URL to monitor (default: https://flowreader.vercel.app)
    --interval SECONDS     Check interval for continuous monitoring (default: 300)
    --window SECONDS       Measurement window for calculations (default: 3600)
    --dry-run             Run in dry-run mode (no alerts sent)
    --help                Show this help message

EXAMPLES:
    # Quick status check
    $0 status

    # Detailed status with error budgets
    $0 detailed

    # Monitor for 1 hour
    $0 monitor 3600

    # Generate comprehensive report
    $0 report

    # Check violations in last 2 hours
    $0 violations --window 7200

    # Emergency status check
    $0 emergency

ENVIRONMENT VARIABLES:
    PRODUCTION_URL         Production URL to monitor
    CHECK_INTERVAL         Check interval in seconds
    MEASUREMENT_WINDOW     Measurement window in seconds
    DRY_RUN               Set to 'true' for dry-run mode
    WEBHOOK_URL           Webhook URL for alert notifications
    ALERT_EMAIL           Email address for alert notifications

EOF
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --production-url)
                PRODUCTION_URL="$2"
                shift 2
                ;;
            --interval)
                CHECK_INTERVAL="$2"
                shift 2
                ;;
            --window)
                MEASUREMENT_WINDOW="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            status|detailed|error-budget|violations|emergency)
                COMMAND="$1"
                shift
                ;;
            monitor)
                COMMAND="$1"
                DURATION="$2"
                shift 2
                ;;
            report)
                COMMAND="$1"
                if [[ $# -gt 1 ]] && [[ "$2" =~ ^[0-9]+$ ]]; then
                    REPORT_WINDOW="$2"
                    shift 2
                else
                    REPORT_WINDOW="$MEASUREMENT_WINDOW"
                    shift
                fi
                ;;
            *)
                error "Unknown argument: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Main script execution
main() {
    # Initialize variables
    local COMMAND="status"
    local DURATION="3600"
    local REPORT_WINDOW="$MEASUREMENT_WINDOW"

    # Parse command line arguments
    parse_arguments "$@"

    # Initialize monitoring environment
    initialize_monitoring

    # Execute command
    case "$COMMAND" in
        "status")
            show_slo_status "$MEASUREMENT_WINDOW"
            ;;
        "detailed")
            show_slo_status "$MEASUREMENT_WINDOW"
            echo ""
            show_error_budget_status "86400"  # 24 hours
            ;;
        "error-budget")
            show_error_budget_status "86400"
            ;;
        "violations")
            local violations_found=false
            echo -e "\n${RED}Current SLO Violations${NC}"
            echo "====================="

            for metric in "${!SLO_TARGETS[@]}"; do
                local current_value
                current_value=$(calculate_slo_compliance "$metric" "$MEASUREMENT_WINDOW")

                if [[ "$current_value" != "0" ]]; then
                    local status_info
                    status_info=$(check_slo_status "$metric" "$current_value")
                    local status="${status_info%|*}"
                    local message="${status_info#*|}"

                    if [[ "$status" != "healthy" ]]; then
                        echo "❌ $metric: $message"
                        violations_found=true
                    fi
                fi
            done

            if [[ "$violations_found" == "false" ]]; then
                echo -e "${GREEN}✅ No SLO violations detected${NC}"
            fi
            echo ""
            ;;
        "monitor")
            run_continuous_monitoring "$DURATION"
            ;;
        "report")
            local report_file
            report_file=$(generate_slo_report "$REPORT_WINDOW")
            echo "Report generated: $report_file"
            cat "$report_file"
            ;;
        "emergency")
            echo -e "${RED}🚨 EMERGENCY SLO STATUS CHECK${NC}"
            echo "================================"
            show_slo_status "300"  # 5 minutes window for emergency
            echo ""
            show_error_budget_status "3600"  # 1 hour window
            echo ""
            echo "Recent violations:"
            for metric in "${!SLO_TARGETS[@]}"; do
                local current_value
                current_value=$(calculate_slo_compliance "$metric" "300")

                if [[ "$current_value" != "0" ]]; then
                    local status_info
                    status_info=$(check_slo_status "$metric" "$current_value")
                    local status="${status_info%|*}"

                    if [[ "$status" == "critical" || "$status" == "violation" ]]; then
                        echo "🚨 $metric: IMMEDIATE ATTENTION REQUIRED"
                    fi
                fi
            done
            ;;
        *)
            error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

# Check dependencies
check_dependencies() {
    local missing_deps=()

    for cmd in curl jq bc date; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_deps+=("$cmd")
        fi
    done

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        error "Missing required dependencies: ${missing_deps[*]}"
        echo "Please install the missing dependencies and try again."
        exit 1
    fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    check_dependencies
    main "$@"
fi