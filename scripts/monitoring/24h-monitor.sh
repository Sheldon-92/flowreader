#!/bin/bash

# FlowReader 24-Hour Production Monitoring Script
# Establishes comprehensive monitoring baseline for production environment

set -euo pipefail

# Configuration
MONITORING_DURATION=${1:-86400}  # Default 24 hours (86400 seconds)
COLLECTION_INTERVAL=${2:-300}    # Default 5 minutes (300 seconds)
DATA_DIR="/tmp/flowreader-monitoring"
LOG_FILE="$DATA_DIR/24h-monitor.log"
METRICS_FILE="$DATA_DIR/metrics-$(date +%Y%m%d-%H%M%S).json"
PRODUCTION_URL=${PRODUCTION_URL:-"https://flowreader.vercel.app"}

# Thresholds (based on performance monitoring guide)
P95_LATENCY_THRESHOLD=2000      # ms
P50_LATENCY_THRESHOLD=1500      # ms
ERROR_RATE_THRESHOLD=5          # %
CACHE_HIT_RATE_THRESHOLD=20     # %
QUALITY_THRESHOLD=80            # %
DB_RESPONSE_THRESHOLD=1000      # ms

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Initialize monitoring environment
init_monitoring() {
    echo -e "${BLUE}🔧 Initializing 24-hour production monitoring...${NC}"

    # Create data directory
    mkdir -p "$DATA_DIR"

    # Initialize log file
    cat > "$LOG_FILE" << EOF
# FlowReader 24-Hour Monitoring Log
# Started: $(date)
# Duration: ${MONITORING_DURATION} seconds
# Interval: ${COLLECTION_INTERVAL} seconds
# Production URL: $PRODUCTION_URL

EOF

    # Initialize metrics file
    cat > "$METRICS_FILE" << EOF
{
  "monitoring_session": {
    "start_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "duration_seconds": $MONITORING_DURATION,
    "interval_seconds": $COLLECTION_INTERVAL,
    "production_url": "$PRODUCTION_URL"
  },
  "thresholds": {
    "p95_latency_ms": $P95_LATENCY_THRESHOLD,
    "p50_latency_ms": $P50_LATENCY_THRESHOLD,
    "error_rate_percent": $ERROR_RATE_THRESHOLD,
    "cache_hit_rate_percent": $CACHE_HIT_RATE_THRESHOLD,
    "quality_percent": $QUALITY_THRESHOLD,
    "db_response_ms": $DB_RESPONSE_THRESHOLD
  },
  "metrics": []
}
EOF

    echo -e "${GREEN}✅ Monitoring environment initialized${NC}"
}

# Health check function
check_health() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local health_start=$(date +%s%3N)

    # Health endpoint check
    local health_response=$(curl -s -w "%{http_code},%{time_total}" "$PRODUCTION_URL/api/health" || echo "000,999")
    local health_code=$(echo "$health_response" | tail -1 | cut -d',' -f1)
    local health_time=$(echo "$health_response" | tail -1 | cut -d',' -f2)
    local health_time_ms=$(echo "$health_time * 1000" | bc -l | cut -d'.' -f1)

    # Parse health response body
    local health_body=""
    if [[ "$health_code" == "200" ]]; then
        health_body=$(echo "$health_response" | head -n -1)
    fi

    echo "$health_code,$health_time_ms,$health_body"
}

# Database connectivity check
check_database() {
    local db_start=$(date +%s%3N)

    # Simple database connectivity test via API
    local db_response=$(curl -s -w "%{http_code},%{time_total}" \
        -H "Content-Type: application/json" \
        "$PRODUCTION_URL/api/books" 2>/dev/null || echo "000,999")

    local db_code=$(echo "$db_response" | tail -1 | cut -d',' -f1)
    local db_time=$(echo "$db_response" | tail -1 | cut -d',' -f2)
    local db_time_ms=$(echo "$db_time * 1000" | bc -l | cut -d'.' -f1)

    # Database is considered healthy if we get 401 (unauthorized) - means DB is reachable
    local db_healthy="false"
    if [[ "$db_code" == "401" ]] || [[ "$db_code" == "200" ]]; then
        db_healthy="true"
    fi

    echo "$db_healthy,$db_time_ms,$db_code"
}

# Performance metrics collection
collect_performance_metrics() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    # Multiple endpoints for performance testing
    local endpoints=(
        "/api/health"
        "/api/books"
        "/"
    )

    local total_requests=0
    local successful_requests=0
    local total_response_time=0
    local response_times=()

    # Collect metrics from multiple requests
    for endpoint in "${endpoints[@]}"; do
        for i in {1..5}; do  # 5 samples per endpoint
            local start_time=$(date +%s%3N)
            local response=$(curl -s -w "%{http_code},%{time_total}" "$PRODUCTION_URL$endpoint" 2>/dev/null || echo "000,999")

            local status_code=$(echo "$response" | tail -1 | cut -d',' -f1)
            local response_time=$(echo "$response" | tail -1 | cut -d',' -f2)
            local response_time_ms=$(echo "$response_time * 1000" | bc -l | cut -d'.' -f1)

            total_requests=$((total_requests + 1))
            total_response_time=$(echo "$total_response_time + $response_time_ms" | bc -l)
            response_times+=("$response_time_ms")

            # Count successful requests (2xx or 401 for protected endpoints)
            if [[ "$status_code" =~ ^(2|401) ]]; then
                successful_requests=$((successful_requests + 1))
            fi

            # Small delay between requests
            sleep 0.1
        done
    done

    # Calculate percentiles
    IFS=$'\n' sorted_times=($(printf '%s\n' "${response_times[@]}" | sort -n))
    local count=${#sorted_times[@]}
    local p50_index=$((count / 2))
    local p95_index=$((count * 95 / 100))

    local p50_latency=${sorted_times[$p50_index]}
    local p95_latency=${sorted_times[$p95_index]}
    local mean_latency=$(echo "scale=0; $total_response_time / $total_requests" | bc -l)

    # Error rate calculation
    local error_requests=$((total_requests - successful_requests))
    local error_rate=$(echo "scale=2; $error_requests * 100 / $total_requests" | bc -l)

    echo "$p50_latency,$p95_latency,$mean_latency,$error_rate,$successful_requests,$total_requests"
}

# Security headers check
check_security() {
    local security_start=$(date +%s%3N)

    # Check critical security headers
    local headers_response=$(curl -sI "$PRODUCTION_URL/" 2>/dev/null || echo "")

    local has_hsts="false"
    local has_csp="false"
    local has_xframe="false"
    local has_xss="false"
    local is_https="false"

    if echo "$headers_response" | grep -qi "strict-transport-security"; then
        has_hsts="true"
    fi

    if echo "$headers_response" | grep -qi "content-security-policy"; then
        has_csp="true"
    fi

    if echo "$headers_response" | grep -qi "x-frame-options"; then
        has_xframe="true"
    fi

    if echo "$headers_response" | grep -qi "x-xss-protection"; then
        has_xss="true"
    fi

    if echo "$headers_response" | grep -qi "^HTTP.*200\|^HTTP.*301\|^HTTP.*302"; then
        is_https="true"
    fi

    local security_score=0
    [[ "$has_hsts" == "true" ]] && security_score=$((security_score + 20))
    [[ "$has_csp" == "true" ]] && security_score=$((security_score + 20))
    [[ "$has_xframe" == "true" ]] && security_score=$((security_score + 20))
    [[ "$has_xss" == "true" ]] && security_score=$((security_score + 20))
    [[ "$is_https" == "true" ]] && security_score=$((security_score + 20))

    echo "$security_score,$has_hsts,$has_csp,$has_xframe,$has_xss,$is_https"
}

# Collect single monitoring cycle
collect_metrics() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local cycle_start=$(date +%s)

    echo -e "${BLUE}📊 Collecting metrics at $timestamp${NC}"

    # Health check
    echo -n "  Health check... "
    local health_data=$(check_health)
    local health_code=$(echo "$health_data" | cut -d',' -f1)
    local health_time=$(echo "$health_data" | cut -d',' -f2)
    echo -e "${GREEN}$health_code (${health_time}ms)${NC}"

    # Database check
    echo -n "  Database check... "
    local db_data=$(check_database)
    local db_healthy=$(echo "$db_data" | cut -d',' -f1)
    local db_time=$(echo "$db_data" | cut -d',' -f2)
    local db_status=$(echo "$db_data" | cut -d',' -f3)
    if [[ "$db_healthy" == "true" ]]; then
        echo -e "${GREEN}Healthy (${db_time}ms)${NC}"
    else
        echo -e "${RED}Unhealthy (${db_time}ms, status: $db_status)${NC}"
    fi

    # Performance metrics
    echo -n "  Performance metrics... "
    local perf_data=$(collect_performance_metrics)
    local p50=$(echo "$perf_data" | cut -d',' -f1)
    local p95=$(echo "$perf_data" | cut -d',' -f2)
    local mean=$(echo "$perf_data" | cut -d',' -f3)
    local error_rate=$(echo "$perf_data" | cut -d',' -f4)
    echo -e "${GREEN}P95: ${p95}ms, P50: ${p50}ms, Errors: ${error_rate}%${NC}"

    # Security check
    echo -n "  Security headers... "
    local security_data=$(check_security)
    local security_score=$(echo "$security_data" | cut -d',' -f1)
    echo -e "${GREEN}Score: ${security_score}/100${NC}"

    # Build metrics JSON
    local metrics_json=$(cat << EOF
{
  "timestamp": "$timestamp",
  "cycle_duration_seconds": $(($(date +%s) - cycle_start)),
  "health": {
    "status_code": $health_code,
    "response_time_ms": $health_time,
    "healthy": $([ "$health_code" == "200" ] && echo "true" || echo "false")
  },
  "database": {
    "healthy": $db_healthy,
    "response_time_ms": $db_time,
    "status_code": $db_status
  },
  "performance": {
    "p50_latency_ms": $p50,
    "p95_latency_ms": $p95,
    "mean_latency_ms": $mean,
    "error_rate_percent": $error_rate,
    "successful_requests": $(echo "$perf_data" | cut -d',' -f5),
    "total_requests": $(echo "$perf_data" | cut -d',' -f6)
  },
  "security": {
    "score": $security_score,
    "hsts": $(echo "$security_data" | cut -d',' -f2),
    "csp": $(echo "$security_data" | cut -d',' -f3),
    "x_frame_options": $(echo "$security_data" | cut -d',' -f4),
    "xss_protection": $(echo "$security_data" | cut -d',' -f5),
    "https": $(echo "$security_data" | cut -d',' -f6)
  },
  "alerts": {
    "p95_latency_alert": $([ "$p95" -gt "$P95_LATENCY_THRESHOLD" ] && echo "true" || echo "false"),
    "p50_latency_alert": $([ "$p50" -gt "$P50_LATENCY_THRESHOLD" ] && echo "true" || echo "false"),
    "error_rate_alert": $([ "$(echo "$error_rate > $ERROR_RATE_THRESHOLD" | bc -l)" == "1" ] && echo "true" || echo "false"),
    "health_alert": $([ "$health_code" != "200" ] && echo "true" || echo "false"),
    "db_alert": $([ "$db_healthy" != "true" ] && echo "true" || echo "false"),
    "security_alert": $([ "$security_score" -lt "80" ] && echo "true" || echo "false")
  }
}
EOF
)

    # Append to metrics file
    # Update the metrics array in the JSON file
    local temp_file=$(mktemp)
    jq --argjson new_metric "$metrics_json" '.metrics += [$new_metric]' "$METRICS_FILE" > "$temp_file"
    mv "$temp_file" "$METRICS_FILE"

    # Log to file
    echo "$(date): $timestamp - Health: $health_code, DB: $db_healthy, P95: ${p95}ms, Errors: ${error_rate}%" >> "$LOG_FILE"

    # Check for alert conditions
    check_alerts "$metrics_json"
}

# Alert checking function
check_alerts() {
    local metrics_json="$1"

    # Extract alert conditions
    local p95_alert=$(echo "$metrics_json" | jq -r '.alerts.p95_latency_alert')
    local health_alert=$(echo "$metrics_json" | jq -r '.alerts.health_alert')
    local db_alert=$(echo "$metrics_json" | jq -r '.alerts.db_alert')
    local error_alert=$(echo "$metrics_json" | jq -r '.alerts.error_rate_alert')
    local security_alert=$(echo "$metrics_json" | jq -r '.alerts.security_alert')

    # Display alerts
    if [[ "$p95_alert" == "true" ]]; then
        local p95_value=$(echo "$metrics_json" | jq -r '.performance.p95_latency_ms')
        echo -e "${RED}🚨 ALERT: P95 latency high (${p95_value}ms > ${P95_LATENCY_THRESHOLD}ms)${NC}"
    fi

    if [[ "$health_alert" == "true" ]]; then
        local health_code=$(echo "$metrics_json" | jq -r '.health.status_code')
        echo -e "${RED}🚨 ALERT: Health check failed (status: $health_code)${NC}"
    fi

    if [[ "$db_alert" == "true" ]]; then
        echo -e "${RED}🚨 ALERT: Database connectivity issue${NC}"
    fi

    if [[ "$error_alert" == "true" ]]; then
        local error_rate=$(echo "$metrics_json" | jq -r '.performance.error_rate_percent')
        echo -e "${RED}🚨 ALERT: High error rate (${error_rate}% > ${ERROR_RATE_THRESHOLD}%)${NC}"
    fi

    if [[ "$security_alert" == "true" ]]; then
        local security_score=$(echo "$metrics_json" | jq -r '.security.score')
        echo -e "${YELLOW}⚠️ WARNING: Security score low ($security_score/100)${NC}"
    fi
}

# Signal handlers for graceful shutdown
cleanup() {
    echo -e "\n${YELLOW}🛑 Monitoring interrupted. Generating summary...${NC}"
    generate_summary
    exit 0
}

trap cleanup SIGINT SIGTERM

# Generate monitoring summary
generate_summary() {
    local end_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    echo -e "\n${BLUE}📋 Generating 24-hour monitoring summary...${NC}"

    # Update metrics file with end time
    local temp_file=$(mktemp)
    jq --arg end_time "$end_time" '.monitoring_session.end_time = $end_time' "$METRICS_FILE" > "$temp_file"
    mv "$temp_file" "$METRICS_FILE"

    # Calculate summary statistics
    local total_cycles=$(jq '.metrics | length' "$METRICS_FILE")
    local healthy_cycles=$(jq '[.metrics[] | select(.health.healthy == true)] | length' "$METRICS_FILE")
    local db_healthy_cycles=$(jq '[.metrics[] | select(.database.healthy == true)] | length' "$METRICS_FILE")

    if [[ "$total_cycles" -gt 0 ]]; then
        local avg_p95=$(jq '[.metrics[].performance.p95_latency_ms] | add / length | floor' "$METRICS_FILE")
        local avg_p50=$(jq '[.metrics[].performance.p50_latency_ms] | add / length | floor' "$METRICS_FILE")
        local avg_error_rate=$(jq '[.metrics[].performance.error_rate_percent] | add / length' "$METRICS_FILE")
        local avg_security_score=$(jq '[.metrics[].security.score] | add / length | floor' "$METRICS_FILE")

        local health_uptime=$(echo "scale=2; $healthy_cycles * 100 / $total_cycles" | bc -l)
        local db_uptime=$(echo "scale=2; $db_healthy_cycles * 100 / $total_cycles" | bc -l)

        echo -e "\n${GREEN}📊 MONITORING SUMMARY${NC}"
        echo "======================================"
        echo "Total monitoring cycles: $total_cycles"
        echo "Health uptime: ${health_uptime}%"
        echo "Database uptime: ${db_uptime}%"
        echo "Average P95 latency: ${avg_p95}ms"
        echo "Average P50 latency: ${avg_p50}ms"
        echo "Average error rate: ${avg_error_rate}%"
        echo "Average security score: ${avg_security_score}/100"
        echo ""
        echo "Data files:"
        echo "  Metrics: $METRICS_FILE"
        echo "  Log: $LOG_FILE"

        # Alert summary
        local total_alerts=$(jq '[.metrics[].alerts | to_entries[] | select(.value == true)] | length' "$METRICS_FILE")
        echo ""
        echo "Total alerts triggered: $total_alerts"

        if [[ "$total_alerts" -gt 0 ]]; then
            echo "Alert breakdown:"
            jq -r '.metrics[].alerts | to_entries[] | select(.value == true) | .key' "$METRICS_FILE" | sort | uniq -c | while read count alert; do
                echo "  $alert: $count times"
            done
        fi
    else
        echo -e "${YELLOW}⚠️ No metrics collected${NC}"
    fi
}

# Main monitoring loop
main() {
    echo -e "${GREEN}🚀 Starting FlowReader 24-Hour Production Monitoring${NC}"
    echo "Duration: $(($MONITORING_DURATION / 3600)) hours"
    echo "Collection interval: $(($COLLECTION_INTERVAL / 60)) minutes"
    echo "Production URL: $PRODUCTION_URL"
    echo "Data directory: $DATA_DIR"
    echo ""

    init_monitoring

    local start_time=$(date +%s)
    local end_time=$((start_time + MONITORING_DURATION))
    local cycle_count=0

    while [[ $(date +%s) -lt $end_time ]]; do
        cycle_count=$((cycle_count + 1))
        local remaining_time=$((end_time - $(date +%s)))
        local remaining_hours=$((remaining_time / 3600))
        local remaining_minutes=$(((remaining_time % 3600) / 60))

        echo -e "\n${BLUE}🔄 Monitoring cycle $cycle_count (${remaining_hours}h ${remaining_minutes}m remaining)${NC}"

        collect_metrics

        # Sleep until next collection interval
        if [[ $(date +%s) -lt $end_time ]]; then
            echo -e "${YELLOW}⏳ Waiting ${COLLECTION_INTERVAL} seconds until next collection...${NC}"
            sleep $COLLECTION_INTERVAL
        fi
    done

    echo -e "\n${GREEN}✅ 24-hour monitoring completed!${NC}"
    generate_summary
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