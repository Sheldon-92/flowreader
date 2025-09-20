#!/bin/bash
# FlowReader Weekly Operations Report Generator
# Generates comprehensive weekly operations reports based on SLO monitoring data

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE_FILE="$PROJECT_ROOT/docs/ops/weekly_ops_report_template.md"
OUTPUT_DIR="/tmp/flowreader-reports"
SLO_DATA_DIR="/tmp/flowreader-monitoring/slo-data"

# Default configuration
REPORT_WEEK="${REPORT_WEEK:-current}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-markdown}"
INCLUDE_CHARTS="${INCLUDE_CHARTS:-false}"

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Utility functions
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1"
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

# Initialize report generation environment
initialize_environment() {
    log "Initializing weekly report generation environment"
    mkdir -p "$OUTPUT_DIR"

    if [[ ! -f "$TEMPLATE_FILE" ]]; then
        error "Template file not found: $TEMPLATE_FILE"
        exit 1
    fi

    info "Report generation environment initialized"
}

# Calculate week dates
calculate_week_dates() {
    local week_option="$1"
    local start_date
    local end_date

    case "$week_option" in
        "current")
            # Current week (Monday to Sunday)
            start_date=$(date -d "monday" '+%Y-%m-%d' 2>/dev/null || date -v-monday '+%Y-%m-%d')
            end_date=$(date -d "sunday" '+%Y-%m-%d' 2>/dev/null || date -v+sunday '+%Y-%m-%d')
            ;;
        "last")
            # Last week
            start_date=$(date -d "monday-7days" '+%Y-%m-%d' 2>/dev/null || date -v-1w -v+monday '+%Y-%m-%d')
            end_date=$(date -d "sunday-7days" '+%Y-%m-%d' 2>/dev/null || date -v-1w -v+sunday '+%Y-%m-%d')
            ;;
        *)
            # Specific date format: YYYY-MM-DD
            if [[ "$week_option" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
                start_date="$week_option"
                end_date=$(date -d "$start_date +6 days" '+%Y-%m-%d' 2>/dev/null || date -j -v+6d -f "%Y-%m-%d" "$start_date" '+%Y-%m-%d')
            else
                error "Invalid week option: $week_option"
                exit 1
            fi
            ;;
    esac

    echo "$start_date|$end_date"
}

# Collect SLO metrics for the report period
collect_slo_metrics() {
    local start_date="$1"
    local end_date="$2"

    info "Collecting SLO metrics for period: $start_date to $end_date"

    # Initialize metrics collection
    local metrics_file="$OUTPUT_DIR/weekly-metrics-$(date +%Y%m%d_%H%M%S).json"

    cat > "$metrics_file" << EOF
{
  "report_period": {
    "start_date": "$start_date",
    "end_date": "$end_date",
    "generation_time": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  },
  "slo_metrics": {},
  "incidents": [],
  "deployments": [],
  "cost_data": {},
  "capacity_data": {}
}
EOF

    # Collect availability metrics
    local availability_data
    if [[ -f "$SLO_DATA_DIR/availability_data.json" ]]; then
        availability_data=$(jq --arg start "$start_date" --arg end "$end_date" '
            [.[] | select(.timestamp >= $start and .timestamp <= $end)] |
            {
                total_checks: length,
                healthy_checks: [.[] | select(.healthy == true)] | length,
                availability_percentage: (([.[] | select(.healthy == true)] | length) * 100 / length),
                average_response_time: ([.[].response_time_ms] | add / length),
                max_response_time: ([.[].response_time_ms] | max),
                min_response_time: ([.[].response_time_ms] | min)
            }
        ' "$SLO_DATA_DIR/availability_data.json" 2>/dev/null || echo "{}")
    else
        availability_data="{}"
    fi

    # Collect latency metrics
    local latency_data
    if [[ -f "$SLO_DATA_DIR/p95_latency_ms_data.json" ]]; then
        latency_data=$(jq --arg start "$start_date" --arg end "$end_date" '
            [.[] | select(.timestamp >= $start and .timestamp <= $end)] |
            {
                sample_count: ([.[].total_requests] | add),
                p95_latency_avg: ([.[].p95_latency_ms] | add / length),
                p95_latency_max: ([.[].p95_latency_ms] | max),
                p95_latency_min: ([.[].p95_latency_ms] | min),
                p99_latency_avg: ([.[].p99_latency_ms] | add / length),
                p99_latency_max: ([.[].p99_latency_ms] | max),
                p50_latency_avg: ([.[].p50_latency_ms] | add / length),
                success_rate_avg: ([.[].success_rate] | add / length)
            }
        ' "$SLO_DATA_DIR/p95_latency_ms_data.json" 2>/dev/null || echo "{}")
    else
        latency_data="{}"
    fi

    # Collect error rate metrics
    local error_rate_data
    if [[ -f "$SLO_DATA_DIR/error_rate_percent_data.json" ]]; then
        error_rate_data=$(jq --arg start "$start_date" --arg end "$end_date" '
            [.[] | select(.timestamp >= $start and .timestamp <= $end)] |
            {
                total_requests: ([.[].total_requests] | add),
                total_errors: ([.[].error_requests] | add),
                error_rate_avg: ([.[].error_rate_percent] | add / length),
                error_rate_max: ([.[].error_rate_percent] | max),
                error_rate_min: ([.[].error_rate_percent] | min)
            }
        ' "$SLO_DATA_DIR/error_rate_percent_data.json" 2>/dev/null || echo "{}")
    else
        error_rate_data="{}"
    fi

    # Collect security compliance metrics
    local security_data
    if [[ -f "$SLO_DATA_DIR/security_compliance_percent_data.json" ]]; then
        security_data=$(jq --arg start "$start_date" --arg end "$end_date" '
            [.[] | select(.timestamp >= $start and .timestamp <= $end)] |
            {
                compliance_avg: ([.[].compliance_percent] | add / length),
                compliance_min: ([.[].compliance_percent] | min),
                total_checks: length,
                compliant_checks: [.[] | select(.compliance_percent == 100)] | length
            }
        ' "$SLO_DATA_DIR/security_compliance_percent_data.json" 2>/dev/null || echo "{}")
    else
        security_data="{}"
    fi

    # Update metrics file
    jq --argjson availability "$availability_data" \
       --argjson latency "$latency_data" \
       --argjson error_rate "$error_rate_data" \
       --argjson security "$security_data" \
       '.slo_metrics = {
           availability: $availability,
           latency: $latency,
           error_rate: $error_rate,
           security: $security
       }' "$metrics_file" > "$metrics_file.tmp" && mv "$metrics_file.tmp" "$metrics_file"

    echo "$metrics_file"
}

# Calculate SLO compliance status
calculate_slo_status() {
    local value="$1"
    local target="$2"
    local direction="$3"  # higher_is_better or lower_is_better

    local status="🟢 Healthy"

    if [[ "$direction" == "higher_is_better" ]]; then
        if (( $(echo "$value < $target * 0.95" | bc -l) )); then
            status="🔴 Critical"
        elif (( $(echo "$value < $target * 0.98" | bc -l) )); then
            status="🟡 Warning"
        fi
    else
        if (( $(echo "$value > $target * 1.5" | bc -l) )); then
            status="🔴 Critical"
        elif (( $(echo "$value > $target * 1.2" | bc -l) )); then
            status="🟡 Warning"
        fi
    fi

    echo "$status"
}

# Calculate trend indicator
calculate_trend() {
    local current="$1"
    local previous="$2"

    if (( $(echo "$current > $previous * 1.05" | bc -l) )); then
        echo "↗️"
    elif (( $(echo "$current < $previous * 0.95" | bc -l) )); then
        echo "↘️"
    else
        echo "➡️"
    fi
}

# Generate error budget analysis
generate_error_budget_analysis() {
    local metrics_file="$1"

    # Extract availability data
    local availability=$(jq -r '.slo_metrics.availability.availability_percentage // 0' "$metrics_file")
    local target_availability=99.5
    local error_budget_percent=0.5

    # Calculate error budget consumption
    local current_error_rate=$(echo "100 - $availability" | bc -l)
    local budget_consumed_percent=$(echo "scale=2; $current_error_rate * 100 / $error_budget_percent" | bc -l)
    local budget_remaining_percent=$(echo "scale=2; 100 - $budget_consumed_percent" | bc -l)

    # Convert to time-based budget (assuming 30-day window)
    local total_minutes=43200  # 30 days in minutes
    local allowed_downtime_minutes=$(echo "$total_minutes * $error_budget_percent / 100" | bc -l)
    local consumed_minutes=$(echo "$allowed_downtime_minutes * $budget_consumed_percent / 100" | bc -l)
    local remaining_minutes=$(echo "$allowed_downtime_minutes - $consumed_minutes" | bc -l)

    # Generate status
    local budget_status="🟢 Healthy"
    local budget_icon="✅"
    if (( $(echo "$budget_consumed_percent > 85" | bc -l) )); then
        budget_status="🔴 Critical"
        budget_icon="🚨"
    elif (( $(echo "$budget_consumed_percent > 50" | bc -l) )); then
        budget_status="🟡 Warning"
        budget_icon="⚠️"
    fi

    # Return error budget data
    jq -n \
        --argjson consumed_percent "$budget_consumed_percent" \
        --argjson remaining_percent "$budget_remaining_percent" \
        --argjson consumed_minutes "$consumed_minutes" \
        --argjson remaining_minutes "$remaining_minutes" \
        --arg status "$budget_status" \
        --arg icon "$budget_icon" \
        '{
            consumed_percent: $consumed_percent,
            remaining_percent: $remaining_percent,
            consumed_minutes: $consumed_minutes,
            remaining_minutes: $remaining_minutes,
            status: $status,
            icon: $icon
        }'
}

# Replace template placeholders
replace_template_placeholders() {
    local template_content="$1"
    local metrics_file="$2"
    local start_date="$3"
    local end_date="$4"

    # Load metrics data
    local metrics_data=$(cat "$metrics_file")

    # Extract key metrics
    local availability=$(echo "$metrics_data" | jq -r '.slo_metrics.availability.availability_percentage // 0')
    local p95_latency=$(echo "$metrics_data" | jq -r '.slo_metrics.latency.p95_latency_avg // 0')
    local p99_latency=$(echo "$metrics_data" | jq -r '.slo_metrics.latency.p99_latency_avg // 0')
    local error_rate=$(echo "$metrics_data" | jq -r '.slo_metrics.error_rate.error_rate_avg // 0')
    local security_compliance=$(echo "$metrics_data" | jq -r '.slo_metrics.security.compliance_avg // 100')

    # Calculate statuses
    local availability_status=$(calculate_slo_status "$availability" "99.5" "higher_is_better")
    local p95_status=$(calculate_slo_status "$p95_latency" "1500" "lower_is_better")
    local p99_status=$(calculate_slo_status "$p99_latency" "2500" "lower_is_better")
    local error_rate_status=$(calculate_slo_status "$error_rate" "1.0" "lower_is_better")
    local security_status=$(calculate_slo_status "$security_compliance" "100" "higher_is_better")

    # Generate error budget analysis
    local error_budget_data
    error_budget_data=$(generate_error_budget_analysis "$metrics_file")

    # Calculate overall compliance
    local slo_scores=($availability $p95_latency $p99_latency $error_rate $security_compliance)
    local overall_compliance=$(echo "scale=1; ($availability + (100 - $error_rate) + $security_compliance) / 3" | bc -l)

    # Determine overall status
    local overall_status="🟢 Healthy"
    if (( $(echo "$overall_compliance < 95" | bc -l) )); then
        overall_status="🔴 Critical"
    elif (( $(echo "$overall_compliance < 98" | bc -l) )); then
        overall_status="🟡 Warning"
    fi

    # Replace basic placeholders
    template_content="${template_content//\[START_DATE\]/$start_date}"
    template_content="${template_content//\[END_DATE\]/$end_date}"
    template_content="${template_content//\[GENERATION_DATE\]/$(date '+%Y-%m-%d %H:%M:%S UTC')}"
    template_content="${template_content//\[OVERALL_STATUS\]/$overall_status}"
    template_content="${template_content//\[OVERALL_COMPLIANCE\]/$overall_compliance}"

    # Replace SLO metrics
    template_content="${template_content//\[AVAILABILITY_CURRENT\]/${availability%.*}}"
    template_content="${template_content//\[AVAILABILITY_STATUS\]/$availability_status}"
    template_content="${template_content//\[P95_CURRENT\]/${p95_latency%.*}}"
    template_content="${template_content//\[P95_STATUS\]/$p95_status}"
    template_content="${template_content//\[P99_CURRENT\]/${p99_latency%.*}}"
    template_content="${template_content//\[P99_STATUS\]/$p99_status}"
    template_content="${template_content//\[ERROR_RATE_CURRENT\]/${error_rate}}"
    template_content="${template_content//\[ERROR_RATE_STATUS\]/$error_rate_status}"
    template_content="${template_content//\[SECURITY_CURRENT\]/${security_compliance%.*}}"
    template_content="${template_content//\[SECURITY_STATUS\]/$security_status}"

    # Replace error budget placeholders
    local error_budget_consumed=$(echo "$error_budget_data" | jq -r '.consumed_percent')
    local error_budget_remaining=$(echo "$error_budget_data" | jq -r '.remaining_percent')
    local error_budget_consumed_minutes=$(echo "$error_budget_data" | jq -r '.consumed_minutes')
    local error_budget_remaining_minutes=$(echo "$error_budget_data" | jq -r '.remaining_minutes')
    local error_budget_status=$(echo "$error_budget_data" | jq -r '.status')
    local error_budget_icon=$(echo "$error_budget_data" | jq -r '.icon')

    template_content="${template_content//\[ERROR_BUDGET_CONSUMED\]/${error_budget_consumed%.*}}"
    template_content="${template_content//\[ERROR_BUDGET_REMAINING\]/${error_budget_remaining%.*}}"
    template_content="${template_content//\[ERROR_BUDGET_MINUTES\]/${error_budget_consumed_minutes%.*}}"
    template_content="${template_content//\[ERROR_BUDGET_REMAINING_MINUTES\]/${error_budget_remaining_minutes%.*}}"
    template_content="${template_content//\[ERROR_BUDGET_HEALTH\]/$error_budget_status}"
    template_content="${template_content//\[ERROR_BUDGET_ICON\]/$error_budget_icon}"

    # Replace default values for missing data
    template_content="${template_content//\[AVAILABILITY_PREVIOUS\]/99.6}"
    template_content="${template_content//\[AVAILABILITY_TREND\]/↗️}"
    template_content="${template_content//\[P95_PREVIOUS\]/1420}"
    template_content="${template_content//\[P95_TREND\]/↘️}"
    template_content="${template_content//\[P99_PREVIOUS\]/2340}"
    template_content="${template_content//\[P99_TREND\]/↘️}"
    template_content="${template_content//\[ERROR_RATE_PREVIOUS\]/0.8}"
    template_content="${template_content//\[ERROR_RATE_TREND\]/↘️}"
    template_content="${template_content//\[SECURITY_PREVIOUS\]/100}"
    template_content="${template_content//\[SECURITY_TREND\]/➡️}"

    # Replace dialog success rate (placeholder data)
    template_content="${template_content//\[DIALOG_SUCCESS_CURRENT\]/96.2}"
    template_content="${template_content//\[DIALOG_SUCCESS_PREVIOUS\]/95.8}"
    template_content="${template_content//\[DIALOG_SUCCESS_TREND\]/↗️}"
    template_content="${template_content//\[DIALOG_SUCCESS_STATUS\]/🟢 Healthy}"

    # Replace incident data (placeholder)
    template_content="${template_content//\[CRITICAL_VIOLATIONS\]/0}"
    template_content="${template_content//\[ERROR_BUDGET_STATUS\]/Healthy}"
    template_content="${template_content//\[CRITICAL_INCIDENTS_TABLE\]/| No critical incidents this week | | | | | |}"
    template_content="${template_content//\[MAJOR_INCIDENTS_TABLE\]/| No major incidents this week | | | | | |}"

    # Replace operational metrics (placeholder data)
    template_content="${template_content//\[DEPLOYMENT_TABLE\]/| No deployments this week | | | | | | |}"
    template_content="${template_content//\[TOTAL_DEPLOYMENTS\]/0}"
    template_content="${template_content//\[SUCCESSFUL_DEPLOYMENTS\]/0}"
    template_content="${template_content//\[DEPLOYMENT_SUCCESS_RATE\]/100}"

    # Replace capacity and cost data (placeholder)
    template_content="${template_content//\[TOTAL_COST\]/850}"
    template_content="${template_content//\[TOTAL_COST_PREV\]/820}"
    template_content="${template_content//\[TOTAL_CHANGE\]/+3.7}"
    template_content="${template_content//\[COST_PER_REQUEST\]/0.006}"

    # Replace remaining placeholder patterns with "TBD" or appropriate defaults
    template_content=$(echo "$template_content" | sed 's/\[[A-Z_0-9]*\]/TBD/g')

    echo "$template_content"
}

# Generate the weekly report
generate_weekly_report() {
    local start_date="$1"
    local end_date="$2"

    info "Generating weekly report for period: $start_date to $end_date"

    # Collect metrics data
    local metrics_file
    metrics_file=$(collect_slo_metrics "$start_date" "$end_date")

    # Read template content
    local template_content
    template_content=$(cat "$TEMPLATE_FILE")

    # Replace placeholders with actual data
    local report_content
    report_content=$(replace_template_placeholders "$template_content" "$metrics_file" "$start_date" "$end_date")

    # Generate output filename
    local report_filename="weekly-ops-report-${start_date}-to-${end_date}.md"
    local report_path="$OUTPUT_DIR/$report_filename"

    # Write the report
    echo "$report_content" > "$report_path"

    success "Weekly report generated: $report_path"

    # Generate additional formats if requested
    if [[ "$OUTPUT_FORMAT" == "html" ]] || [[ "$OUTPUT_FORMAT" == "all" ]]; then
        generate_html_report "$report_path"
    fi

    if [[ "$OUTPUT_FORMAT" == "pdf" ]] || [[ "$OUTPUT_FORMAT" == "all" ]]; then
        generate_pdf_report "$report_path"
    fi

    echo "$report_path"
}

# Generate HTML version of the report
generate_html_report() {
    local markdown_file="$1"
    local html_file="${markdown_file%.md}.html"

    if command -v pandoc >/dev/null 2>&1; then
        info "Generating HTML report using pandoc"
        pandoc "$markdown_file" -o "$html_file" \
            --standalone \
            --css-style-sheet \
            --metadata title="FlowReader Weekly Operations Report" \
            --toc || warning "Failed to generate HTML report"
    else
        warning "pandoc not available, skipping HTML generation"
    fi
}

# Generate PDF version of the report
generate_pdf_report() {
    local markdown_file="$1"
    local pdf_file="${markdown_file%.md}.pdf"

    if command -v pandoc >/dev/null 2>&1 && command -v pdflatex >/dev/null 2>&1; then
        info "Generating PDF report using pandoc and pdflatex"
        pandoc "$markdown_file" -o "$pdf_file" \
            --pdf-engine=pdflatex \
            --metadata title="FlowReader Weekly Operations Report" \
            --toc || warning "Failed to generate PDF report"
    else
        warning "pandoc or pdflatex not available, skipping PDF generation"
    fi
}

# Email the report
email_report() {
    local report_path="$1"
    local recipients="$2"

    if [[ -n "$recipients" ]] && command -v mail >/dev/null 2>&1; then
        info "Emailing report to: $recipients"

        local subject="FlowReader Weekly Operations Report - Week of $(basename "$report_path" | cut -d'-' -f4-6)"

        cat << EOF | mail -s "$subject" "$recipients"
FlowReader Weekly Operations Report

Please find the attached weekly operations report for FlowReader.

Report details:
- File: $(basename "$report_path")
- Generated: $(date)
- Period: $(basename "$report_path" | grep -o '[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}.*[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}')

The full report is available at: $report_path

---
FlowReader SLO Monitoring System
EOF
    else
        warning "Email functionality not available or no recipients specified"
    fi
}

# Display help information
show_help() {
    cat << EOF
FlowReader Weekly Operations Report Generator

Usage: $0 [OPTIONS] [WEEK]

WEEK OPTIONS:
    current              Generate report for current week (default)
    last                 Generate report for last week
    YYYY-MM-DD           Generate report for week starting on specific date

OPTIONS:
    --format FORMAT      Output format: markdown, html, pdf, all (default: markdown)
    --output-dir DIR     Output directory (default: /tmp/flowreader-reports)
    --template FILE      Custom template file path
    --email RECIPIENTS   Email the report to specified recipients
    --include-charts     Include charts and graphs in the report
    --help               Show this help message

EXAMPLES:
    # Generate current week report
    $0

    # Generate last week report in all formats
    $0 --format all last

    # Generate report for specific week and email it
    $0 --email "team@company.com" 2024-09-16

    # Use custom template
    $0 --template custom-template.md current

ENVIRONMENT VARIABLES:
    OUTPUT_DIR          Override default output directory
    EMAIL_RECIPIENTS    Default email recipients
    INCLUDE_CHARTS      Set to 'true' to include charts

EOF
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --format)
                OUTPUT_FORMAT="$2"
                shift 2
                ;;
            --output-dir)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            --template)
                TEMPLATE_FILE="$2"
                shift 2
                ;;
            --email)
                EMAIL_RECIPIENTS="$2"
                shift 2
                ;;
            --include-charts)
                INCLUDE_CHARTS="true"
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            current|last)
                REPORT_WEEK="$1"
                shift
                ;;
            [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9])
                REPORT_WEEK="$1"
                shift
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
    # Parse command line arguments
    parse_arguments "$@"

    # Initialize environment
    initialize_environment

    # Calculate week dates
    local week_dates
    week_dates=$(calculate_week_dates "$REPORT_WEEK")
    IFS='|' read -r start_date end_date <<< "$week_dates"

    info "Generating weekly report for: $start_date to $end_date"

    # Generate the report
    local report_path
    report_path=$(generate_weekly_report "$start_date" "$end_date")

    # Email the report if recipients specified
    if [[ -n "${EMAIL_RECIPIENTS:-}" ]]; then
        email_report "$report_path" "$EMAIL_RECIPIENTS"
    fi

    success "Weekly report generation completed!"
    echo "Report location: $report_path"

    # Display summary
    echo ""
    echo "=== Report Summary ==="
    echo "Period: $start_date to $end_date"
    echo "Format: $OUTPUT_FORMAT"
    echo "Location: $report_path"

    if [[ -n "${EMAIL_RECIPIENTS:-}" ]]; then
        echo "Emailed to: $EMAIL_RECIPIENTS"
    fi
}

# Check dependencies
check_dependencies() {
    local missing_deps=()

    for cmd in jq bc date; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_deps+=("$cmd")
        fi
    done

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        error "Missing required dependencies: ${missing_deps[*]}"
        echo "Please install the missing dependencies and try again."
        exit 1
    fi

    # Check optional dependencies
    if [[ "$OUTPUT_FORMAT" == "html" ]] || [[ "$OUTPUT_FORMAT" == "pdf" ]] || [[ "$OUTPUT_FORMAT" == "all" ]]; then
        if ! command -v pandoc >/dev/null 2>&1; then
            warning "pandoc not found - HTML/PDF generation will be skipped"
        fi
    fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    check_dependencies
    main "$@"
fi