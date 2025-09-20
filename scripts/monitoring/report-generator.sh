#!/bin/bash

# FlowReader 24-Hour Performance Report Generator
# Analyzes monitoring data and generates comprehensive baseline reports

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="/tmp/flowreader-monitoring"
REPORTS_DIR="/tmp/flowreader-reports"
PRODUCTION_URL=${PRODUCTION_URL:-"https://flowreader.vercel.app"}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Report thresholds
declare -A BASELINE_THRESHOLDS=(
    ["health_uptime"]=99.0
    ["db_uptime"]=99.5
    ["p95_latency"]=1500
    ["p50_latency"]=1000
    ["error_rate"]=1.0
    ["security_score"]=90
)

# Initialize report environment
init_reports() {
    echo -e "${BLUE}🔧 Initializing report generation environment...${NC}"

    mkdir -p "$REPORTS_DIR"

    echo -e "${GREEN}✅ Report environment initialized${NC}"
}

# Find latest monitoring data
find_monitoring_data() {
    local latest_metrics=""

    # Look for metrics files in data directory
    if [[ -d "$DATA_DIR" ]]; then
        latest_metrics=$(find "$DATA_DIR" -name "metrics-*.json" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2- || echo "")
    fi

    if [[ -n "$latest_metrics" ]] && [[ -f "$latest_metrics" ]]; then
        echo "$latest_metrics"
    else
        echo ""
    fi
}

# Analyze monitoring metrics
analyze_metrics() {
    local metrics_file="$1"

    if [[ ! -f "$metrics_file" ]]; then
        echo -e "${RED}❌ Metrics file not found: $metrics_file${NC}"
        return 1
    fi

    echo -e "${BLUE}📊 Analyzing monitoring metrics from: $metrics_file${NC}"

    # Validate JSON structure
    if ! jq empty "$metrics_file" 2>/dev/null; then
        echo -e "${RED}❌ Invalid JSON in metrics file${NC}"
        return 1
    fi

    # Extract basic statistics
    local total_cycles=$(jq '.metrics | length' "$metrics_file")

    if [[ "$total_cycles" -eq 0 ]]; then
        echo -e "${YELLOW}⚠️ No metrics data found in file${NC}"
        return 1
    fi

    echo "  Total monitoring cycles: $total_cycles"

    # Calculate comprehensive statistics
    cat > "/tmp/analysis.jq" << 'EOF'
{
  "monitoring_period": {
    "start_time": .monitoring_session.start_time,
    "end_time": .monitoring_session.end_time // "incomplete",
    "duration_seconds": .monitoring_session.duration_seconds,
    "total_cycles": (.metrics | length),
    "collection_interval": .monitoring_session.interval_seconds
  },
  "health_metrics": {
    "total_checks": (.metrics | length),
    "healthy_checks": ([.metrics[] | select(.health.healthy == true)] | length),
    "uptime_percent": (([.metrics[] | select(.health.healthy == true)] | length) * 100.0 / (.metrics | length)),
    "avg_response_time": ([.metrics[].health.response_time_ms] | add / length),
    "max_response_time": ([.metrics[].health.response_time_ms] | max),
    "min_response_time": ([.metrics[].health.response_time_ms] | min)
  },
  "database_metrics": {
    "total_checks": (.metrics | length),
    "healthy_checks": ([.metrics[] | select(.database.healthy == true)] | length),
    "uptime_percent": (([.metrics[] | select(.database.healthy == true)] | length) * 100.0 / (.metrics | length)),
    "avg_response_time": ([.metrics[].database.response_time_ms] | add / length),
    "max_response_time": ([.metrics[].database.response_time_ms] | max),
    "min_response_time": ([.metrics[].database.response_time_ms] | min)
  },
  "performance_metrics": {
    "avg_p50_latency": ([.metrics[].performance.p50_latency_ms] | add / length),
    "avg_p95_latency": ([.metrics[].performance.p95_latency_ms] | add / length),
    "avg_mean_latency": ([.metrics[].performance.mean_latency_ms] | add / length),
    "max_p95_latency": ([.metrics[].performance.p95_latency_ms] | max),
    "min_p95_latency": ([.metrics[].performance.p95_latency_ms] | min),
    "avg_error_rate": ([.metrics[].performance.error_rate_percent] | add / length),
    "max_error_rate": ([.metrics[].performance.error_rate_percent] | max),
    "total_requests": ([.metrics[].performance.total_requests] | add),
    "total_successful": ([.metrics[].performance.successful_requests] | add)
  },
  "security_metrics": {
    "avg_score": ([.metrics[].security.score] | add / length),
    "min_score": ([.metrics[].security.score] | min),
    "max_score": ([.metrics[].security.score] | max),
    "hsts_compliance": (([.metrics[] | select(.security.hsts == true)] | length) * 100.0 / (.metrics | length)),
    "csp_compliance": (([.metrics[] | select(.security.csp == true)] | length) * 100.0 / (.metrics | length)),
    "https_compliance": (([.metrics[] | select(.security.https == true)] | length) * 100.0 / (.metrics | length))
  },
  "alert_analysis": {
    "total_alerts": ([.metrics[].alerts | to_entries[] | select(.value == true)] | length),
    "p95_alerts": ([.metrics[] | select(.alerts.p95_latency_alert == true)] | length),
    "health_alerts": ([.metrics[] | select(.alerts.health_alert == true)] | length),
    "db_alerts": ([.metrics[] | select(.alerts.db_alert == true)] | length),
    "error_alerts": ([.metrics[] | select(.alerts.error_rate_alert == true)] | length),
    "security_alerts": ([.metrics[] | select(.alerts.security_alert == true)] | length)
  },
  "anomalies": [
    .metrics[] | select(
      .performance.p95_latency_ms > 3000 or
      .performance.error_rate_percent > 10 or
      .health.healthy == false or
      .database.healthy == false or
      .security.score < 70
    ) | {
      "timestamp": .timestamp,
      "type": (
        if .performance.p95_latency_ms > 3000 then "high_latency"
        elif .performance.error_rate_percent > 10 then "high_error_rate"
        elif .health.healthy == false then "health_failure"
        elif .database.healthy == false then "database_failure"
        elif .security.score < 70 then "security_issue"
        else "unknown"
        end
      ),
      "details": {
        "p95_latency": .performance.p95_latency_ms,
        "error_rate": .performance.error_rate_percent,
        "health_status": .health.healthy,
        "db_status": .database.healthy,
        "security_score": .security.score
      }
    }
  ]
}
EOF

    local analysis_result=$(jq -f "/tmp/analysis.jq" "$metrics_file")
    rm -f "/tmp/analysis.jq"

    echo "$analysis_result"
}

# Generate performance recommendations
generate_recommendations() {
    local analysis="$1"

    echo -e "${BLUE}💡 Generating performance recommendations...${NC}"

    local recommendations=()

    # Health recommendations
    local health_uptime=$(echo "$analysis" | jq -r '.health_metrics.uptime_percent')
    if [[ "$(echo "$health_uptime < ${BASELINE_THRESHOLDS[health_uptime]}" | bc -l)" == "1" ]]; then
        recommendations+=("CRITICAL: Health uptime (${health_uptime}%) below target (${BASELINE_THRESHOLDS[health_uptime]}%). Investigate health check failures and implement redundancy.")
    fi

    # Database recommendations
    local db_uptime=$(echo "$analysis" | jq -r '.database_metrics.uptime_percent')
    if [[ "$(echo "$db_uptime < ${BASELINE_THRESHOLDS[db_uptime]}" | bc -l)" == "1" ]]; then
        recommendations+=("HIGH: Database uptime (${db_uptime}%) below target (${BASELINE_THRESHOLDS[db_uptime]}%). Review database connection pooling and failover mechanisms.")
    fi

    # Performance recommendations
    local avg_p95=$(echo "$analysis" | jq -r '.performance_metrics.avg_p95_latency')
    if [[ "$(echo "$avg_p95 > ${BASELINE_THRESHOLDS[p95_latency]}" | bc -l)" == "1" ]]; then
        recommendations+=("MEDIUM: Average P95 latency (${avg_p95}ms) above target (${BASELINE_THRESHOLDS[p95_latency]}ms). Consider implementing caching, CDN, or performance optimizations.")
    fi

    local avg_error_rate=$(echo "$analysis" | jq -r '.performance_metrics.avg_error_rate')
    if [[ "$(echo "$avg_error_rate > ${BASELINE_THRESHOLDS[error_rate]}" | bc -l)" == "1" ]]; then
        recommendations+=("HIGH: Average error rate (${avg_error_rate}%) above target (${BASELINE_THRESHOLDS[error_rate]}%). Review error logs and implement better error handling.")
    fi

    # Security recommendations
    local avg_security=$(echo "$analysis" | jq -r '.security_metrics.avg_score')
    if [[ "$(echo "$avg_security < ${BASELINE_THRESHOLDS[security_score]}" | bc -l)" == "1" ]]; then
        recommendations+=("MEDIUM: Security score (${avg_security}/100) below target (${BASELINE_THRESHOLDS[security_score]}/100). Review and strengthen security headers configuration.")
    fi

    # Alert frequency recommendations
    local total_alerts=$(echo "$analysis" | jq -r '.alert_analysis.total_alerts')
    local total_cycles=$(echo "$analysis" | jq -r '.monitoring_period.total_cycles')
    local alert_frequency=$(echo "scale=2; $total_alerts * 100 / $total_cycles" | bc -l)

    if [[ "$(echo "$alert_frequency > 10" | bc -l)" == "1" ]]; then
        recommendations+=("MEDIUM: High alert frequency (${alert_frequency}% of cycles). Review alert thresholds to reduce noise and prevent alert fatigue.")
    fi

    # Anomaly recommendations
    local anomaly_count=$(echo "$analysis" | jq '.anomalies | length')
    if [[ "$anomaly_count" -gt 0 ]]; then
        recommendations+=("HIGH: $anomaly_count anomalies detected during monitoring period. Review anomaly details and implement preventive measures.")
    fi

    # Performance optimization recommendations
    local max_p95=$(echo "$analysis" | jq -r '.performance_metrics.max_p95_latency')
    if [[ "$(echo "$max_p95 > 5000" | bc -l)" == "1" ]]; then
        recommendations+=("HIGH: Peak P95 latency (${max_p95}ms) indicates severe performance degradation. Implement request timeout and circuit breaker patterns.")
    fi

    # Capacity recommendations
    local total_requests=$(echo "$analysis" | jq -r '.performance_metrics.total_requests')
    local duration_hours=$(echo "$analysis" | jq -r '.monitoring_period.duration_seconds / 3600')
    local requests_per_hour=$(echo "scale=0; $total_requests / $duration_hours" | bc -l)

    if [[ "$(echo "$requests_per_hour > 1000" | bc -l)" == "1" ]]; then
        recommendations+=("LOW: High request volume (${requests_per_hour}/hour). Consider implementing rate limiting and auto-scaling policies.")
    fi

    # Convert array to JSON
    local recommendations_json="["
    local first=true
    for rec in "${recommendations[@]}"; do
        if [[ "$first" == "true" ]]; then
            first=false
        else
            recommendations_json+=","
        fi
        recommendations_json+='"'"$rec"'"'
    done
    recommendations_json+="]"

    echo "$recommendations_json"
}

# Generate markdown report
generate_markdown_report() {
    local analysis="$1"
    local recommendations="$2"
    local metrics_file="$3"

    local timestamp=$(date)
    local report_file="$REPORTS_DIR/24h-performance-report-$(date +%Y%m%d-%H%M%S).md"

    echo -e "${BLUE}📄 Generating markdown report: $report_file${NC}"

    cat > "$report_file" << EOF
# FlowReader 24-Hour Production Monitoring Report

**Generated**: $timestamp
**Production URL**: $PRODUCTION_URL
**Data Source**: $metrics_file

---

## Executive Summary

This report provides a comprehensive analysis of FlowReader's production performance over a 24-hour monitoring period. The monitoring system collected metrics on health, performance, database connectivity, and security compliance to establish a production baseline.

### Key Findings

EOF

    # Extract key metrics for summary
    local health_uptime=$(echo "$analysis" | jq -r '.health_metrics.uptime_percent | . * 100 | floor / 100')
    local db_uptime=$(echo "$analysis" | jq -r '.database_metrics.uptime_percent | . * 100 | floor / 100')
    local avg_p95=$(echo "$analysis" | jq -r '.performance_metrics.avg_p95_latency | floor')
    local avg_error_rate=$(echo "$analysis" | jq -r '.performance_metrics.avg_error_rate | . * 100 | floor / 100')
    local security_score=$(echo "$analysis" | jq -r '.security_metrics.avg_score | floor')
    local total_alerts=$(echo "$analysis" | jq -r '.alert_analysis.total_alerts')
    local anomaly_count=$(echo "$analysis" | jq '.anomalies | length')

    cat >> "$report_file" << EOF
- **Health Uptime**: ${health_uptime}% $([ "$(echo "$health_uptime >= ${BASELINE_THRESHOLDS[health_uptime]}" | bc -l)" == "1" ] && echo "✅" || echo "❌")
- **Database Uptime**: ${db_uptime}% $([ "$(echo "$db_uptime >= ${BASELINE_THRESHOLDS[db_uptime]}" | bc -l)" == "1" ] && echo "✅" || echo "❌")
- **Average P95 Latency**: ${avg_p95}ms $([ "$(echo "$avg_p95 <= ${BASELINE_THRESHOLDS[p95_latency]}" | bc -l)" == "1" ] && echo "✅" || echo "❌")
- **Average Error Rate**: ${avg_error_rate}% $([ "$(echo "$avg_error_rate <= ${BASELINE_THRESHOLDS[error_rate]}" | bc -l)" == "1" ] && echo "✅" || echo "❌")
- **Security Score**: ${security_score}/100 $([ "$(echo "$security_score >= ${BASELINE_THRESHOLDS[security_score]}" | bc -l)" == "1" ] && echo "✅" || echo "❌")
- **Total Alerts**: $total_alerts
- **Anomalies Detected**: $anomaly_count

---

## Monitoring Period Details

EOF

    # Add monitoring period information
    echo "$analysis" | jq -r '
"**Start Time**: " + .monitoring_period.start_time + "
**End Time**: " + (.monitoring_period.end_time // "Incomplete") + "
**Duration**: " + ((.monitoring_period.duration_seconds // 0) / 3600 | floor | tostring) + " hours
**Total Cycles**: " + (.monitoring_period.total_cycles | tostring) + "
**Collection Interval**: " + ((.monitoring_period.collection_interval // 0) / 60 | floor | tostring) + " minutes
"' >> "$report_file"

    cat >> "$report_file" << EOF

---

## Health & Availability Metrics

### Application Health

EOF

    echo "$analysis" | jq -r '
"**Total Health Checks**: " + (.health_metrics.total_checks | tostring) + "
**Successful Checks**: " + (.health_metrics.healthy_checks | tostring) + "
**Uptime Percentage**: " + (.health_metrics.uptime_percent | . * 100 | floor / 100 | tostring) + "%
**Average Response Time**: " + (.health_metrics.avg_response_time | floor | tostring) + "ms
**Max Response Time**: " + (.health_metrics.max_response_time | floor | tostring) + "ms
**Min Response Time**: " + (.health_metrics.min_response_time | floor | tostring) + "ms
"' >> "$report_file"

    cat >> "$report_file" << EOF

### Database Connectivity

EOF

    echo "$analysis" | jq -r '
"**Total DB Checks**: " + (.database_metrics.total_checks | tostring) + "
**Successful Connections**: " + (.database_metrics.healthy_checks | tostring) + "
**Connection Uptime**: " + (.database_metrics.uptime_percent | . * 100 | floor / 100 | tostring) + "%
**Average Response Time**: " + (.database_metrics.avg_response_time | floor | tostring) + "ms
**Max Response Time**: " + (.database_metrics.max_response_time | floor | tostring) + "ms
**Min Response Time**: " + (.database_metrics.min_response_time | floor | tostring) + "ms
"' >> "$report_file"

    cat >> "$report_file" << EOF

---

## Performance Metrics

### Response Time Analysis

EOF

    echo "$analysis" | jq -r '
"**Average P50 Latency**: " + (.performance_metrics.avg_p50_latency | floor | tostring) + "ms
**Average P95 Latency**: " + (.performance_metrics.avg_p95_latency | floor | tostring) + "ms
**Average Mean Latency**: " + (.performance_metrics.avg_mean_latency | floor | tostring) + "ms
**Peak P95 Latency**: " + (.performance_metrics.max_p95_latency | floor | tostring) + "ms
**Best P95 Latency**: " + (.performance_metrics.min_p95_latency | floor | tostring) + "ms
"' >> "$report_file"

    cat >> "$report_file" << EOF

### Request & Error Analysis

EOF

    echo "$analysis" | jq -r '
"**Total Requests**: " + (.performance_metrics.total_requests | tostring) + "
**Successful Requests**: " + (.performance_metrics.total_successful | tostring) + "
**Success Rate**: " + ((.performance_metrics.total_successful * 100.0 / .performance_metrics.total_requests) | floor | tostring) + "%
**Average Error Rate**: " + (.performance_metrics.avg_error_rate | . * 100 | floor / 100 | tostring) + "%
**Peak Error Rate**: " + (.performance_metrics.max_error_rate | . * 100 | floor / 100 | tostring) + "%
"' >> "$report_file"

    cat >> "$report_file" << EOF

---

## Security Compliance

### Security Headers Analysis

EOF

    echo "$analysis" | jq -r '
"**Average Security Score**: " + (.security_metrics.avg_score | floor | tostring) + "/100
**Minimum Score**: " + (.security_metrics.min_score | floor | tostring) + "/100
**Maximum Score**: " + (.security_metrics.max_score | floor | tostring) + "/100
**HSTS Compliance**: " + (.security_metrics.hsts_compliance | floor | tostring) + "%
**CSP Compliance**: " + (.security_metrics.csp_compliance | floor | tostring) + "%
**HTTPS Compliance**: " + (.security_metrics.https_compliance | floor | tostring) + "%
"' >> "$report_file"

    cat >> "$report_file" << EOF

---

## Alert Analysis

### Alert Summary

EOF

    echo "$analysis" | jq -r '
"**Total Alerts Triggered**: " + (.alert_analysis.total_alerts | tostring) + "
**P95 Latency Alerts**: " + (.alert_analysis.p95_alerts | tostring) + "
**Health Check Alerts**: " + (.alert_analysis.health_alerts | tostring) + "
**Database Alerts**: " + (.alert_analysis.db_alerts | tostring) + "
**Error Rate Alerts**: " + (.alert_analysis.error_alerts | tostring) + "
**Security Alerts**: " + (.alert_analysis.security_alerts | tostring) + "
"' >> "$report_file"

    cat >> "$report_file" << EOF

---

## Anomaly Detection

### Detected Anomalies

EOF

    local anomaly_count=$(echo "$analysis" | jq '.anomalies | length')
    if [[ "$anomaly_count" -gt 0 ]]; then
        echo "$analysis" | jq -r '.anomalies[] |
"**" + .timestamp + "** - " + .type + "
- P95 Latency: " + (.details.p95_latency | tostring) + "ms
- Error Rate: " + (.details.error_rate | tostring) + "%
- Health Status: " + (.details.health_status | tostring) + "
- DB Status: " + (.details.db_status | tostring) + "
- Security Score: " + (.details.security_score | tostring) + "/100

"' >> "$report_file"
    else
        echo "No anomalies detected during the monitoring period. ✅" >> "$report_file"
    fi

    cat >> "$report_file" << EOF

---

## Recommendations

### Performance Optimization

EOF

    if [[ "$recommendations" != "[]" ]]; then
        echo "$recommendations" | jq -r '.[] | "- " + .' >> "$report_file"
    else
        echo "No specific recommendations at this time. System performance is within acceptable parameters. ✅" >> "$report_file"
    fi

    cat >> "$report_file" << EOF

### Baseline Establishment

Based on this 24-hour monitoring period, the following baselines are recommended:

| Metric | Current Average | Recommended Baseline | Alert Threshold |
|--------|----------------|---------------------|-----------------|
| Health Uptime | ${health_uptime}% | 99.0% | < 98.0% |
| Database Uptime | ${db_uptime}% | 99.5% | < 99.0% |
| P95 Latency | ${avg_p95}ms | ${BASELINE_THRESHOLDS[p95_latency]}ms | > $((${BASELINE_THRESHOLDS[p95_latency]} + 500))ms |
| Error Rate | ${avg_error_rate}% | ${BASELINE_THRESHOLDS[error_rate]}% | > $((${BASELINE_THRESHOLDS[error_rate]} * 2))% |
| Security Score | ${security_score}/100 | ${BASELINE_THRESHOLDS[security_score]}/100 | < $((${BASELINE_THRESHOLDS[security_score]} - 10))/100 |

---

## Next Steps

### Immediate Actions (Next 24 Hours)

1. **Review Alert Configuration**: Validate alert thresholds based on baseline data
2. **Address Critical Issues**: Investigate and resolve any critical alerts or anomalies
3. **Monitor Trends**: Continue monitoring to establish weekly and monthly baselines

### Short-term Actions (Next Week)

1. **Performance Optimization**: Implement recommended performance improvements
2. **Alert Tuning**: Adjust alert thresholds to reduce false positives
3. **Capacity Planning**: Review resource utilization trends for scaling decisions

### Long-term Actions (Next Month)

1. **Trend Analysis**: Establish long-term performance trends and seasonal patterns
2. **Capacity Forecasting**: Develop predictive models for resource requirements
3. **SLA Definition**: Define formal service level agreements based on baseline data

---

## Technical Details

**Monitoring Script**: \`24h-monitor.sh\`
**Alert Validator**: \`alert-validator.sh\`
**Report Generator**: \`report-generator.sh\`
**Data Location**: \`$DATA_DIR\`
**Report Location**: \`$REPORTS_DIR\`

---

*This report was automatically generated by the FlowReader monitoring system.*

EOF

    echo -e "${GREEN}✅ Markdown report generated: $report_file${NC}"
    echo "$report_file"
}

# Generate JSON summary for programmatic use
generate_json_summary() {
    local analysis="$1"
    local recommendations="$2"

    local summary_file="$REPORTS_DIR/24h-summary-$(date +%Y%m%d-%H%M%S).json"

    echo -e "${BLUE}📊 Generating JSON summary: $summary_file${NC}"

    cat > "$summary_file" << EOF
{
  "report_metadata": {
    "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "production_url": "$PRODUCTION_URL",
    "report_type": "24h_baseline"
  },
  "analysis": $analysis,
  "recommendations": $recommendations,
  "baseline_compliance": {
    "health_uptime": $(echo "$analysis" | jq ".health_metrics.uptime_percent >= ${BASELINE_THRESHOLDS[health_uptime]}"),
    "db_uptime": $(echo "$analysis" | jq ".database_metrics.uptime_percent >= ${BASELINE_THRESHOLDS[db_uptime]}"),
    "p95_latency": $(echo "$analysis" | jq ".performance_metrics.avg_p95_latency <= ${BASELINE_THRESHOLDS[p95_latency]}"),
    "error_rate": $(echo "$analysis" | jq ".performance_metrics.avg_error_rate <= ${BASELINE_THRESHOLDS[error_rate]}"),
    "security_score": $(echo "$analysis" | jq ".security_metrics.avg_score >= ${BASELINE_THRESHOLDS[security_score]}")
  }
}
EOF

    echo -e "${GREEN}✅ JSON summary generated: $summary_file${NC}"
    echo "$summary_file"
}

# Main report generation function
generate_report() {
    local metrics_file="$1"

    if [[ -z "$metrics_file" ]]; then
        echo -e "${RED}❌ Metrics file required${NC}"
        return 1
    fi

    if [[ ! -f "$metrics_file" ]]; then
        echo -e "${RED}❌ Metrics file not found: $metrics_file${NC}"
        return 1
    fi

    echo -e "${GREEN}🚀 Generating 24-Hour Performance Report${NC}"
    echo "Metrics file: $metrics_file"
    echo ""

    # Analyze metrics
    local analysis=$(analyze_metrics "$metrics_file")
    if [[ $? -ne 0 ]]; then
        echo -e "${RED}❌ Failed to analyze metrics${NC}"
        return 1
    fi

    # Generate recommendations
    local recommendations=$(generate_recommendations "$analysis")

    # Generate reports
    local markdown_report=$(generate_markdown_report "$analysis" "$recommendations" "$metrics_file")
    local json_summary=$(generate_json_summary "$analysis" "$recommendations")

    # Display summary
    echo -e "\n${GREEN}📋 REPORT GENERATION SUMMARY${NC}"
    echo "======================================"
    echo "Markdown Report: $markdown_report"
    echo "JSON Summary: $json_summary"

    # Extract key metrics for display
    local total_cycles=$(echo "$analysis" | jq -r '.monitoring_period.total_cycles')
    local health_uptime=$(echo "$analysis" | jq -r '.health_metrics.uptime_percent | . * 100 | floor / 100')
    local avg_p95=$(echo "$analysis" | jq -r '.performance_metrics.avg_p95_latency | floor')
    local total_alerts=$(echo "$analysis" | jq -r '.alert_analysis.total_alerts')

    echo ""
    echo "Key Metrics:"
    echo "  Monitoring cycles: $total_cycles"
    echo "  Health uptime: ${health_uptime}%"
    echo "  Average P95 latency: ${avg_p95}ms"
    echo "  Total alerts: $total_alerts"

    return 0
}

# Auto-discover and generate report
auto_generate() {
    echo -e "${BLUE}🔍 Auto-discovering latest monitoring data...${NC}"

    local latest_metrics=$(find_monitoring_data)

    if [[ -z "$latest_metrics" ]]; then
        echo -e "${YELLOW}⚠️ No monitoring data found in $DATA_DIR${NC}"
        echo "Run the 24h-monitor.sh script first to collect monitoring data."
        return 1
    fi

    echo "Found metrics file: $latest_metrics"
    generate_report "$latest_metrics"
}

# Show usage information
show_usage() {
    cat << EOF
FlowReader 24-Hour Performance Report Generator

Usage: $0 [OPTIONS] [COMMAND]

Commands:
  auto                 Auto-discover latest metrics and generate report (default)
  generate <file>      Generate report from specific metrics file
  analyze <file>       Analyze metrics file and display results only

Options:
  -h, --help          Show this help message
  -d, --data-dir DIR  Set monitoring data directory (default: /tmp/flowreader-monitoring)
  -o, --output DIR    Set reports output directory (default: /tmp/flowreader-reports)

Examples:
  $0                                    # Auto-generate from latest data
  $0 auto                              # Auto-generate from latest data
  $0 generate /path/to/metrics.json    # Generate from specific file
  $0 analyze /path/to/metrics.json     # Analyze specific file only

EOF
}

# Main function
main() {
    local command="auto"
    local metrics_file=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_usage
                exit 0
                ;;
            -d|--data-dir)
                DATA_DIR="$2"
                shift 2
                ;;
            -o|--output)
                REPORTS_DIR="$2"
                shift 2
                ;;
            auto)
                command="auto"
                shift
                ;;
            generate)
                command="generate"
                metrics_file="$2"
                shift 2
                ;;
            analyze)
                command="analyze"
                metrics_file="$2"
                shift 2
                ;;
            *)
                echo -e "${RED}❌ Unknown option: $1${NC}"
                show_usage
                exit 1
                ;;
        esac
    done

    echo -e "${GREEN}🚀 FlowReader Report Generator${NC}"
    echo "Data directory: $DATA_DIR"
    echo "Reports directory: $REPORTS_DIR"
    echo ""

    init_reports

    case "$command" in
        "auto")
            auto_generate
            ;;
        "generate")
            if [[ -z "$metrics_file" ]]; then
                echo -e "${RED}❌ Metrics file required for generate command${NC}"
                show_usage
                exit 1
            fi
            generate_report "$metrics_file"
            ;;
        "analyze")
            if [[ -z "$metrics_file" ]]; then
                echo -e "${RED}❌ Metrics file required for analyze command${NC}"
                show_usage
                exit 1
            fi
            analyze_metrics "$metrics_file" | jq '.'
            ;;
    esac
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

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    check_dependencies
    main "$@"
fi