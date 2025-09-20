#!/bin/bash

# FlowReader Monitoring Dashboard
# Simple terminal-based dashboard for production monitoring

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="/tmp/flowreader-monitoring"
CONFIG_FILE="$SCRIPT_DIR/dashboard-config.json"
REFRESH_INTERVAL=${1:-30}  # Default 30 seconds

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

# Unicode symbols
CHECK='✅'
WARNING='⚠️'
ERROR='❌'
INFO='ℹ️'
GRAPH='📊'
ALERT='🚨'

# Dashboard state
DASHBOARD_PID=""
RUNNING=true

# Signal handlers
cleanup() {
    RUNNING=false
    clear
    echo -e "${BLUE}Dashboard stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Find latest monitoring data
find_latest_metrics() {
    local latest_metrics=""

    if [[ -d "$DATA_DIR" ]]; then
        latest_metrics=$(find "$DATA_DIR" -name "metrics-*.json" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2- || echo "")
    fi

    echo "$latest_metrics"
}

# Extract metric value from JSON
extract_metric() {
    local json_file="$1"
    local query="$2"
    local default="${3:-0}"

    if [[ -f "$json_file" ]]; then
        jq -r "$query // $default" "$json_file" 2>/dev/null || echo "$default"
    else
        echo "$default"
    fi
}

# Get latest metric values
get_latest_metrics() {
    local metrics_file="$1"

    if [[ ! -f "$metrics_file" ]]; then
        echo "null"
        return
    fi

    jq -r '{
        "health_status": (.metrics[-1].health.healthy // false),
        "health_response_time": (.metrics[-1].health.response_time_ms // 0),
        "db_status": (.metrics[-1].database.healthy // false),
        "db_response_time": (.metrics[-1].database.response_time_ms // 0),
        "p95_latency": (.metrics[-1].performance.p95_latency_ms // 0),
        "p50_latency": (.metrics[-1].performance.p50_latency_ms // 0),
        "mean_latency": (.metrics[-1].performance.mean_latency_ms // 0),
        "error_rate": (.metrics[-1].performance.error_rate_percent // 0),
        "security_score": (.metrics[-1].security.score // 0),
        "total_requests": (.metrics[-1].performance.total_requests // 0),
        "successful_requests": (.metrics[-1].performance.successful_requests // 0),
        "timestamp": (.metrics[-1].timestamp // "unknown"),
        "alerts": {
            "p95_alert": (.metrics[-1].alerts.p95_latency_alert // false),
            "health_alert": (.metrics[-1].alerts.health_alert // false),
            "db_alert": (.metrics[-1].alerts.db_alert // false),
            "error_alert": (.metrics[-1].alerts.error_rate_alert // false),
            "security_alert": (.metrics[-1].alerts.security_alert // false)
        }
    }' "$metrics_file" 2>/dev/null || echo "null"
}

# Calculate statistics from metrics
calculate_stats() {
    local metrics_file="$1"

    if [[ ! -f "$metrics_file" ]]; then
        echo "null"
        return
    fi

    jq -r '{
        "total_cycles": (.metrics | length),
        "health_uptime": (([.metrics[] | select(.health.healthy == true)] | length) * 100.0 / (.metrics | length)),
        "db_uptime": (([.metrics[] | select(.database.healthy == true)] | length) * 100.0 / (.metrics | length)),
        "avg_p95": ([.metrics[].performance.p95_latency_ms] | add / length),
        "avg_error_rate": ([.metrics[].performance.error_rate_percent] | add / length),
        "total_alerts": ([.metrics[].alerts | to_entries[] | select(.value == true)] | length),
        "monitoring_start": .monitoring_session.start_time,
        "monitoring_duration": (.monitoring_session.duration_seconds // 0)
    }' "$metrics_file" 2>/dev/null || echo "null"
}

# Format status indicator
format_status() {
    local value="$1"
    local good_threshold="$2"
    local warning_threshold="$3"
    local comparison="${4:-gte}" # gte (>=) or lte (<=)

    if [[ "$value" == "true" ]]; then
        echo -e "${GREEN}${CHECK}${NC}"
    elif [[ "$value" == "false" ]]; then
        echo -e "${RED}${ERROR}${NC}"
    else
        if [[ "$comparison" == "gte" ]]; then
            if (( $(echo "$value >= $good_threshold" | bc -l) )); then
                echo -e "${GREEN}${CHECK}${NC}"
            elif (( $(echo "$value >= $warning_threshold" | bc -l) )); then
                echo -e "${YELLOW}${WARNING}${NC}"
            else
                echo -e "${RED}${ERROR}${NC}"
            fi
        else
            if (( $(echo "$value <= $good_threshold" | bc -l) )); then
                echo -e "${GREEN}${CHECK}${NC}"
            elif (( $(echo "$value <= $warning_threshold" | bc -l) )); then
                echo -e "${YELLOW}${WARNING}${NC}"
            else
                echo -e "${RED}${ERROR}${NC}"
            fi
        fi
    fi
}

# Create simple ASCII bar chart
create_bar() {
    local value="$1"
    local max_value="$2"
    local width="${3:-20}"
    local char="${4:-█}"

    if [[ "$max_value" == "0" ]]; then
        echo ""
        return
    fi

    local bar_length=$(echo "scale=0; $value * $width / $max_value" | bc -l 2>/dev/null || echo "0")
    local bar=""

    for ((i=0; i<bar_length; i++)); do
        bar+="$char"
    done

    echo "$bar"
}

# Display header
display_header() {
    local current_time=$(date '+%Y-%m-%d %H:%M:%S')

    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC} ${WHITE}FlowReader Production Monitoring Dashboard${NC}                                 ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC} ${CYAN}Last Updated: $current_time${NC}                                              ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC} ${CYAN}Refresh Interval: ${REFRESH_INTERVAL}s${NC}                                                    ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Display system status
display_system_status() {
    local metrics="$1"

    if [[ "$metrics" == "null" ]]; then
        echo -e "${RED}${ERROR} No monitoring data available${NC}"
        echo ""
        return
    fi

    local health_status=$(echo "$metrics" | jq -r '.health_status')
    local db_status=$(echo "$metrics" | jq -r '.db_status')
    local timestamp=$(echo "$metrics" | jq -r '.timestamp')

    echo -e "${WHITE}${GRAPH} SYSTEM STATUS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    printf "%-25s %s\n" "Application Health:" "$(format_status "$health_status" "true" "true")"
    printf "%-25s %s\n" "Database Connectivity:" "$(format_status "$db_status" "true" "true")"
    printf "%-25s %s\n" "Last Update:" "$timestamp"

    echo ""
}

# Display performance metrics
display_performance() {
    local metrics="$1"

    if [[ "$metrics" == "null" ]]; then
        return
    fi

    local p95_latency=$(echo "$metrics" | jq -r '.p95_latency')
    local p50_latency=$(echo "$metrics" | jq -r '.p50_latency')
    local mean_latency=$(echo "$metrics" | jq -r '.mean_latency')
    local error_rate=$(echo "$metrics" | jq -r '.error_rate')

    echo -e "${WHITE}${GRAPH} PERFORMANCE METRICS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # P95 Latency
    local p95_status=$(format_status "$p95_latency" "1500" "2000" "lte")
    local p95_bar=$(create_bar "$p95_latency" "3000" 30 "▓")
    printf "%-20s %s %6.0fms %s\n" "P95 Latency:" "$p95_status" "$p95_latency" "$p95_bar"

    # P50 Latency
    local p50_status=$(format_status "$p50_latency" "1000" "1500" "lte")
    local p50_bar=$(create_bar "$p50_latency" "3000" 30 "▒")
    printf "%-20s %s %6.0fms %s\n" "P50 Latency:" "$p50_status" "$p50_latency" "$p50_bar"

    # Mean Latency
    local mean_status=$(format_status "$mean_latency" "1100" "1600" "lte")
    local mean_bar=$(create_bar "$mean_latency" "3000" 30 "░")
    printf "%-20s %s %6.0fms %s\n" "Mean Latency:" "$mean_status" "$mean_latency" "$mean_bar"

    # Error Rate
    local error_status=$(format_status "$error_rate" "1.0" "5.0" "lte")
    local error_bar=$(create_bar "$(echo "$error_rate * 2" | bc -l)" "20" 30 "█")
    printf "%-20s %s %6.2f%% %s\n" "Error Rate:" "$error_status" "$error_rate" "$error_bar"

    echo ""
}

# Display security status
display_security() {
    local metrics="$1"

    if [[ "$metrics" == "null" ]]; then
        return
    fi

    local security_score=$(echo "$metrics" | jq -r '.security_score')

    echo -e "${WHITE}🔒 SECURITY COMPLIANCE${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local security_status=$(format_status "$security_score" "90" "80" "gte")
    local security_bar=$(create_bar "$security_score" "100" 40 "█")
    printf "%-20s %s %6.0f/100 %s\n" "Security Score:" "$security_status" "$security_score" "$security_bar"

    echo ""
}

# Display active alerts
display_alerts() {
    local metrics="$1"

    if [[ "$metrics" == "null" ]]; then
        return
    fi

    local alerts=$(echo "$metrics" | jq -r '.alerts')
    local p95_alert=$(echo "$alerts" | jq -r '.p95_alert')
    local health_alert=$(echo "$alerts" | jq -r '.health_alert')
    local db_alert=$(echo "$alerts" | jq -r '.db_alert')
    local error_alert=$(echo "$alerts" | jq -r '.error_alert')
    local security_alert=$(echo "$alerts" | jq -r '.security_alert')

    local any_alerts=false

    echo -e "${WHITE}${ALERT} ACTIVE ALERTS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [[ "$p95_alert" == "true" ]]; then
        echo -e "${RED}${ALERT} P95 Latency Alert: Response time exceeds threshold${NC}"
        any_alerts=true
    fi

    if [[ "$health_alert" == "true" ]]; then
        echo -e "${RED}${ALERT} Health Check Alert: Application health check failed${NC}"
        any_alerts=true
    fi

    if [[ "$db_alert" == "true" ]]; then
        echo -e "${RED}${ALERT} Database Alert: Database connectivity issue${NC}"
        any_alerts=true
    fi

    if [[ "$error_alert" == "true" ]]; then
        echo -e "${RED}${ALERT} Error Rate Alert: High error rate detected${NC}"
        any_alerts=true
    fi

    if [[ "$security_alert" == "true" ]]; then
        echo -e "${YELLOW}${WARNING} Security Alert: Security compliance below threshold${NC}"
        any_alerts=true
    fi

    if [[ "$any_alerts" == "false" ]]; then
        echo -e "${GREEN}${CHECK} No active alerts - All systems operating normally${NC}"
    fi

    echo ""
}

# Display statistics
display_statistics() {
    local stats="$1"

    if [[ "$stats" == "null" ]]; then
        return
    fi

    local total_cycles=$(echo "$stats" | jq -r '.total_cycles')
    local health_uptime=$(echo "$stats" | jq -r '.health_uptime')
    local db_uptime=$(echo "$stats" | jq -r '.db_uptime')
    local avg_p95=$(echo "$stats" | jq -r '.avg_p95')
    local avg_error_rate=$(echo "$stats" | jq -r '.avg_error_rate')
    local total_alerts=$(echo "$stats" | jq -r '.total_alerts')

    echo -e "${WHITE}📈 MONITORING STATISTICS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    printf "%-25s %6.0f cycles\n" "Total Monitoring Cycles:" "$total_cycles"
    printf "%-25s %6.2f%%\n" "Health Uptime:" "$health_uptime"
    printf "%-25s %6.2f%%\n" "Database Uptime:" "$db_uptime"
    printf "%-25s %6.0f ms\n" "Average P95 Latency:" "$avg_p95"
    printf "%-25s %6.2f%%\n" "Average Error Rate:" "$avg_error_rate"
    printf "%-25s %6.0f alerts\n" "Total Alerts:" "$total_alerts"

    echo ""
}

# Display footer
display_footer() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC} ${CYAN}Press Ctrl+C to exit dashboard${NC}                                               ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC} ${CYAN}Monitoring: /scripts/monitoring/24h-monitor.sh${NC}                               ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC} ${CYAN}Alerts: /scripts/monitoring/alert-validator.sh${NC}                               ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════════════╝${NC}"
}

# Main dashboard refresh function
refresh_dashboard() {
    clear

    # Find latest monitoring data
    local metrics_file=$(find_latest_metrics)

    if [[ -z "$metrics_file" ]]; then
        display_header
        echo -e "${YELLOW}${WARNING} No monitoring data found${NC}"
        echo ""
        echo "Start monitoring with:"
        echo "  ./scripts/monitoring/24h-monitor.sh"
        echo ""
        display_footer
        return
    fi

    # Get current metrics and statistics
    local current_metrics=$(get_latest_metrics "$metrics_file")
    local stats=$(calculate_stats "$metrics_file")

    # Display dashboard sections
    display_header
    display_system_status "$current_metrics"
    display_performance "$current_metrics"
    display_security "$current_metrics"
    display_alerts "$current_metrics"
    display_statistics "$stats"
    display_footer
}

# Show usage information
show_usage() {
    cat << EOF
FlowReader Monitoring Dashboard

Usage: $0 [REFRESH_INTERVAL]

Arguments:
  REFRESH_INTERVAL    Dashboard refresh interval in seconds (default: 30)

Examples:
  $0                  # Refresh every 30 seconds
  $0 10              # Refresh every 10 seconds
  $0 60              # Refresh every 60 seconds

Controls:
  Ctrl+C             Exit dashboard

The dashboard displays real-time monitoring data from:
  - Health and availability metrics
  - Performance and latency data
  - Security compliance status
  - Active alerts and notifications
  - Historical statistics

Prerequisites:
  - Monitoring data from 24h-monitor.sh
  - jq command-line JSON processor
  - bc command-line calculator

EOF
}

# Check dependencies
check_dependencies() {
    local deps=("jq" "bc")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            echo -e "${RED}❌ Required dependency missing: $dep${NC}"
            echo "Please install $dep and try again."
            exit 1
        fi
    done
}

# Main function
main() {
    # Parse arguments
    if [[ $# -gt 1 ]]; then
        show_usage
        exit 1
    fi

    if [[ $# -eq 1 ]]; then
        if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
            show_usage
            exit 0
        fi

        if ! [[ "$1" =~ ^[0-9]+$ ]] || [[ "$1" -lt 5 ]]; then
            echo -e "${RED}❌ Invalid refresh interval. Must be a number >= 5${NC}"
            exit 1
        fi

        REFRESH_INTERVAL="$1"
    fi

    echo -e "${GREEN}🚀 Starting FlowReader Monitoring Dashboard${NC}"
    echo "Refresh interval: ${REFRESH_INTERVAL} seconds"
    echo "Press Ctrl+C to exit"
    echo ""
    sleep 2

    # Main dashboard loop
    while [[ "$RUNNING" == "true" ]]; do
        refresh_dashboard
        sleep "$REFRESH_INTERVAL"
    done
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    check_dependencies
    main "$@"
fi