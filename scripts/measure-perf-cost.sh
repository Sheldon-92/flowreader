#!/bin/bash

# Performance and Cost Measurement Script
# Part of T8-PERF-COST optimization baseline measurement infrastructure
#
# This script measures performance metrics for FlowReader endpoints:
# - Chat/stream endpoint latency and token consumption
# - Notes/auto endpoint (when implemented)
# - Statistical analysis with percentiles
# - Cost estimation based on token usage
# - Quality regression detection

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RESULTS_DIR="${PROJECT_ROOT}/perf-results"
CONFIG_FILE="${SCRIPT_DIR}/perf-config.json"
LOG_FILE="${RESULTS_DIR}/perf-${TIMESTAMP}.log"

# Default configuration
DEFAULT_ENDPOINT="chat/stream"
DEFAULT_SAMPLES=30
DEFAULT_CONCURRENT=1
DEFAULT_OUTPUT_FORMAT="json"
DEFAULT_API_BASE="http://localhost:3001/api"
DEFAULT_COMPARE=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "$LOG_FILE"; }

# Help function
show_help() {
    cat << EOF
Performance and Cost Measurement Script

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --endpoint ENDPOINT      Target endpoint (default: chat/stream)
                            Options: chat/stream, notes/auto

    --samples N             Number of test samples (default: 30)

    --concurrent N          Concurrent requests (default: 1)

    --output FORMAT         Output format: json, csv, table (default: json)

    --compare BASELINE      Compare against baseline file

    --api-base URL          API base URL (default: http://localhost:3001/api)

    --config FILE           Configuration file (default: scripts/perf-config.json)

    --scenarios FILE        Test scenarios file

    --baseline              Save results as new baseline

    --quality-check         Run quality regression check

    --verbose               Enable verbose logging

    --help                  Show this help

EXAMPLES:
    # Basic performance measurement
    $0 --endpoint chat/stream --samples 30

    # Run with comparison against baseline
    $0 --endpoint chat/stream --samples 30 --compare baseline

    # Test multiple scenarios with quality check
    $0 --scenarios test-scenarios.json --quality-check

    # Save new baseline
    $0 --endpoint chat/stream --samples 50 --baseline

ENVIRONMENT VARIABLES:
    OPENAI_API_KEY          Required for token cost calculation
    PUBLIC_SUPABASE_URL     Required for database operations
    SUPABASE_SERVICE_ROLE_KEY Required for service operations
    TEST_AUTH_TOKEN         Optional test authentication token

EOF
}

# Parse command line arguments
parse_args() {
    ENDPOINT="$DEFAULT_ENDPOINT"
    SAMPLES="$DEFAULT_SAMPLES"
    CONCURRENT="$DEFAULT_CONCURRENT"
    OUTPUT_FORMAT="$DEFAULT_OUTPUT_FORMAT"
    API_BASE="$DEFAULT_API_BASE"
    COMPARE="$DEFAULT_COMPARE"
    VERBOSE=false
    BASELINE=false
    QUALITY_CHECK=false
    SCENARIOS_FILE=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --endpoint)
                ENDPOINT="$2"
                shift 2
                ;;
            --samples)
                SAMPLES="$2"
                shift 2
                ;;
            --concurrent)
                CONCURRENT="$2"
                shift 2
                ;;
            --output)
                OUTPUT_FORMAT="$2"
                shift 2
                ;;
            --compare)
                COMPARE="$2"
                shift 2
                ;;
            --api-base)
                API_BASE="$2"
                shift 2
                ;;
            --config)
                CONFIG_FILE="$2"
                shift 2
                ;;
            --scenarios)
                SCENARIOS_FILE="$2"
                shift 2
                ;;
            --baseline)
                BASELINE=true
                shift
                ;;
            --quality-check)
                QUALITY_CHECK=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Validate environment and dependencies
validate_environment() {
    log "Validating environment..."

    # Create results directory
    mkdir -p "$RESULTS_DIR"

    # Check required tools
    local required_tools=("node" "curl" "jq")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            error "Required tool not found: $tool"
            exit 1
        fi
    done

    # Check Node.js version
    local node_version
    node_version=$(node --version | cut -d'v' -f2)
    local major_version
    major_version=$(echo "$node_version" | cut -d'.' -f1)
    if [[ $major_version -lt 16 ]]; then
        error "Node.js version 16+ required, found: $node_version"
        exit 1
    fi

    # Check if TypeScript runner exists
    if [[ ! -f "${SCRIPT_DIR}/perf-test-runner.ts" ]]; then
        warn "TypeScript runner not found, will create it"
    fi

    # Validate API base
    if [[ "$API_BASE" =~ ^https?://[^/]+$ ]]; then
        log "API Base URL: $API_BASE"
    else
        error "Invalid API base URL: $API_BASE"
        exit 1
    fi

    # Check environment variables
    if [[ -z "${OPENAI_API_KEY:-}" ]]; then
        warn "OPENAI_API_KEY not set - cost calculations may be inaccurate"
    fi

    if [[ -z "${PUBLIC_SUPABASE_URL:-}" ]]; then
        warn "PUBLIC_SUPABASE_URL not set - database operations may fail"
    fi

    success "Environment validation complete"
}

# Load configuration
load_config() {
    log "Loading configuration..."

    if [[ -f "$CONFIG_FILE" ]]; then
        log "Using config file: $CONFIG_FILE"

        # Override defaults with config file values
        if jq -e '.samples' "$CONFIG_FILE" > /dev/null 2>&1; then
            SAMPLES=$(jq -r '.samples // 30' "$CONFIG_FILE")
        fi

        if jq -e '.apiBase' "$CONFIG_FILE" > /dev/null 2>&1; then
            API_BASE=$(jq -r '.apiBase // "http://localhost:3001/api"' "$CONFIG_FILE")
        fi
    else
        warn "Config file not found: $CONFIG_FILE"
        log "Using default configuration"
    fi

    log "Configuration:"
    log "  Endpoint: $ENDPOINT"
    log "  Samples: $SAMPLES"
    log "  Concurrent: $CONCURRENT"
    log "  API Base: $API_BASE"
    log "  Output Format: $OUTPUT_FORMAT"
}

# Run TypeScript performance test
run_performance_test() {
    local endpoint="$1"
    local samples="$2"
    local concurrent="$3"
    local output_file="$4"

    log "Running performance test for $endpoint..."
    log "Samples: $samples, Concurrent: $concurrent"

    # Build TypeScript runner command
    local cmd=(
        "npx" "tsx" "${SCRIPT_DIR}/perf-test-runner.ts"
        "--endpoint" "$endpoint"
        "--samples" "$samples"
        "--concurrent" "$concurrent"
        "--api-base" "$API_BASE"
        "--output" "$output_file"
    )

    if [[ "$VERBOSE" == "true" ]]; then
        cmd+=("--verbose")
    fi

    if [[ -n "$SCENARIOS_FILE" ]]; then
        cmd+=("--scenarios" "$SCENARIOS_FILE")
    fi

    # Execute the TypeScript runner
    log "Executing: ${cmd[*]}"

    if "${cmd[@]}"; then
        success "Performance test completed successfully"
        return 0
    else
        error "Performance test failed"
        return 1
    fi
}

# Generate performance report
generate_report() {
    local results_file="$1"
    local report_file="$2"

    log "Generating performance report..."

    if [[ ! -f "$results_file" ]]; then
        error "Results file not found: $results_file"
        return 1
    fi

    # Parse results with jq and generate report
    local total_samples
    total_samples=$(jq -r '.metadata.samples' "$results_file")

    local endpoint
    endpoint=$(jq -r '.metadata.endpoint' "$results_file")

    local test_date
    test_date=$(jq -r '.metadata.timestamp' "$results_file")

    # Generate report based on output format
    case "$OUTPUT_FORMAT" in
        "json")
            generate_json_report "$results_file" "$report_file"
            ;;
        "csv")
            generate_csv_report "$results_file" "$report_file"
            ;;
        "table")
            generate_table_report "$results_file" "$report_file"
            ;;
        *)
            error "Unknown output format: $OUTPUT_FORMAT"
            return 1
            ;;
    esac

    success "Report generated: $report_file"
}

# Generate JSON report
generate_json_report() {
    local results_file="$1"
    local report_file="$2"

    jq '.' "$results_file" > "$report_file"
}

# Generate CSV report
generate_csv_report() {
    local results_file="$1"
    local report_file="$2"

    {
        echo "metric,value,unit"
        jq -r '
            .metrics |
            to_entries[] |
            if .value | type == "object" then
                .value | to_entries[] | ["\(.key)_\(.value.key)", .value.value, "ms"] | @csv
            else
                [.key, .value, ""] | @csv
            end
        ' "$results_file"
    } > "$report_file"
}

# Generate table report
generate_table_report() {
    local results_file="$1"
    local report_file="$2"

    local endpoint
    endpoint=$(jq -r '.metadata.endpoint' "$results_file")
    local samples
    samples=$(jq -r '.metadata.samples' "$results_file")
    local timestamp
    timestamp=$(jq -r '.metadata.timestamp' "$results_file")

    {
        echo "Performance Baseline Report"
        echo "=========================="
        echo "Date: $timestamp"
        echo "Endpoint: $endpoint"
        echo "Samples: $samples"
        echo ""
        echo "Latency (ms):"
        printf "  Mean: %s\n" "$(jq -r '.metrics.latency.mean' "$results_file")"
        printf "  P50:  %s\n" "$(jq -r '.metrics.latency.p50' "$results_file")"
        printf "  P95:  %s\n" "$(jq -r '.metrics.latency.p95' "$results_file")"
        printf "  P99:  %s\n" "$(jq -r '.metrics.latency.p99' "$results_file")"
        echo ""
        echo "Tokens:"
        printf "  Mean Input:  %s\n" "$(jq -r '.metrics.tokens.meanInput' "$results_file")"
        printf "  Mean Output: %s\n" "$(jq -r '.metrics.tokens.meanOutput' "$results_file")"
        printf "  Total:       %s\n" "$(jq -r '.metrics.tokens.total' "$results_file")"
        echo ""
        echo "Cost Estimate:"
        printf "  Per Request: $%s\n" "$(jq -r '.metrics.cost.perRequest' "$results_file")"
        printf "  Per 1000:    $%s\n" "$(jq -r '.metrics.cost.per1000' "$results_file")"
        echo ""
        if jq -e '.metrics.quality' "$results_file" > /dev/null; then
            printf "Quality Score: %s%% (baseline)\n" "$(jq -r '.metrics.quality.score' "$results_file")"
        fi
    } > "$report_file"
}

# Compare with baseline
compare_with_baseline() {
    local current_results="$1"
    local baseline_file="$2"
    local comparison_file="$3"

    log "Comparing with baseline: $baseline_file"

    if [[ ! -f "$baseline_file" ]]; then
        error "Baseline file not found: $baseline_file"
        return 1
    fi

    # Run comparison using TypeScript
    npx tsx "${SCRIPT_DIR}/perf-comparison.ts" \
        --current "$current_results" \
        --baseline "$baseline_file" \
        --output "$comparison_file" \
        --format "$OUTPUT_FORMAT"

    if [[ $? -eq 0 ]]; then
        success "Baseline comparison completed: $comparison_file"
    else
        error "Baseline comparison failed"
        return 1
    fi
}

# Run quality regression check
run_quality_check() {
    log "Running quality regression check..."

    local quality_test_file="${PROJECT_ROOT}/api/_spikes/knowledge-quality-mock-test.ts"

    if [[ ! -f "$quality_test_file" ]]; then
        warn "Quality test file not found: $quality_test_file"
        return 0
    fi

    log "Executing quality regression test..."

    if npx tsx "$quality_test_file"; then
        success "Quality regression check passed"
        return 0
    else
        error "Quality regression check failed"
        return 1
    fi
}

# Save as baseline
save_baseline() {
    local results_file="$1"
    local baseline_dir="${RESULTS_DIR}/baselines"
    local baseline_file="${baseline_dir}/${ENDPOINT}_baseline.json"

    mkdir -p "$baseline_dir"

    log "Saving baseline: $baseline_file"

    cp "$results_file" "$baseline_file"

    # Also create a timestamped backup
    local backup_file="${baseline_dir}/${ENDPOINT}_baseline_${TIMESTAMP}.json"
    cp "$results_file" "$backup_file"

    success "Baseline saved: $baseline_file"
    log "Backup created: $backup_file"
}

# Main execution
main() {
    echo "FlowReader Performance and Cost Measurement"
    echo "==========================================="
    echo ""

    # Parse arguments
    parse_args "$@"

    # Validate environment
    validate_environment

    # Load configuration
    load_config

    # Define output files
    local results_file="${RESULTS_DIR}/${ENDPOINT}_${TIMESTAMP}.json"
    local report_file="${RESULTS_DIR}/${ENDPOINT}_${TIMESTAMP}_report.${OUTPUT_FORMAT}"

    # Run performance test
    if ! run_performance_test "$ENDPOINT" "$SAMPLES" "$CONCURRENT" "$results_file"; then
        error "Performance test failed"
        exit 1
    fi

    # Generate report
    if ! generate_report "$results_file" "$report_file"; then
        error "Report generation failed"
        exit 1
    fi

    # Compare with baseline if requested
    if [[ -n "$COMPARE" ]]; then
        local baseline_file
        if [[ "$COMPARE" == "baseline" ]]; then
            baseline_file="${RESULTS_DIR}/baselines/${ENDPOINT}_baseline.json"
        else
            baseline_file="$COMPARE"
        fi

        local comparison_file="${RESULTS_DIR}/${ENDPOINT}_${TIMESTAMP}_comparison.${OUTPUT_FORMAT}"
        compare_with_baseline "$results_file" "$baseline_file" "$comparison_file"
    fi

    # Run quality check if requested
    if [[ "$QUALITY_CHECK" == "true" ]]; then
        if ! run_quality_check; then
            warn "Quality regression detected"
        fi
    fi

    # Save as baseline if requested
    if [[ "$BASELINE" == "true" ]]; then
        save_baseline "$results_file"
    fi

    # Summary
    echo ""
    success "Performance measurement completed!"
    log "Results: $results_file"
    log "Report: $report_file"

    if [[ "$OUTPUT_FORMAT" == "table" ]]; then
        echo ""
        echo "Performance Summary:"
        echo "==================="
        cat "$report_file"
    fi
}

# Handle script interruption
trap 'error "Script interrupted"; exit 130' INT

# Execute main function
main "$@"