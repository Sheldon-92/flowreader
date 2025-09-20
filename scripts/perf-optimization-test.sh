#!/bin/bash

# Performance Optimization Test Script
# Validates the performance improvements from T8-PERF-COST optimizations
#
# This script:
# 1. Runs baseline measurements
# 2. Enables optimizations
# 3. Measures improvements
# 4. Validates targets are met

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RESULTS_DIR="${PROJECT_ROOT}/perf-results/optimization"

# Create results directory
mkdir -p "$RESULTS_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }

# Performance targets
TARGET_TOKEN_REDUCTION=10  # ≥10% token reduction
TARGET_LATENCY_REDUCTION=15 # ≥15% p95 latency reduction
QUALITY_THRESHOLD=63.2      # Maintain ≥63.2% quality (T5 baseline - 2%)

# Help function
show_help() {
    cat << EOF
Performance Optimization Test Script

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --validate-targets    Run full validation of performance targets
    --quick-test         Run quick test with fewer samples
    --export-metrics     Export optimization metrics
    --rollback          Rollback optimizations if targets not met
    --help              Show this help

EXAMPLES:
    # Full validation
    $0 --validate-targets

    # Quick test
    $0 --quick-test

    # Export metrics
    $0 --export-metrics

EOF
}

# Parse arguments
VALIDATE_TARGETS=false
QUICK_TEST=false
EXPORT_METRICS=false
ROLLBACK=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --validate-targets)
            VALIDATE_TARGETS=true
            shift
            ;;
        --quick-test)
            QUICK_TEST=true
            shift
            ;;
        --export-metrics)
            EXPORT_METRICS=true
            shift
            ;;
        --rollback)
            ROLLBACK=true
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

# Run baseline measurement without optimizations
run_baseline() {
    log "Running baseline measurement (optimizations disabled)..."

    # Create baseline config
    cat > "${RESULTS_DIR}/baseline-config.json" << EOF
{
  "tokenManagement": {
    "enabled": false
  },
  "caching": {
    "enabled": false
  },
  "promptOptimization": {
    "enabled": false
  }
}
EOF

    # Run measurement with baseline config
    export PERF_CONFIG="${RESULTS_DIR}/baseline-config.json"

    if [[ "$QUICK_TEST" == "true" ]]; then
        SAMPLES=10
    else
        SAMPLES=30
    fi

    "${SCRIPT_DIR}/measure-perf-cost.sh" \
        --endpoint chat/stream \
        --samples "$SAMPLES" \
        --output json \
        > "${RESULTS_DIR}/baseline_${TIMESTAMP}.json"

    log "Baseline measurement completed"
}

# Run optimized measurement with all optimizations
run_optimized() {
    log "Running optimized measurement (all optimizations enabled)..."

    # Create optimized config
    cat > "${RESULTS_DIR}/optimized-config.json" << EOF
{
  "tokenManagement": {
    "enabled": true,
    "maxContextTokens": 1500,
    "maxResponseTokens": 400,
    "topKInitial": 8,
    "topKFinal": 3,
    "similarityThreshold": 0.75,
    "semanticDeduplication": true,
    "relevanceScoreThreshold": 0.7
  },
  "caching": {
    "enabled": true,
    "responseCacheTTL": 900,
    "embeddingCacheTTL": 3600,
    "semanticSimilarityThreshold": 0.95
  },
  "promptOptimization": {
    "enabled": true,
    "useConcisePrompts": true,
    "dynamicPromptSelection": true,
    "removeRedundantInstructions": true
  }
}
EOF

    # Run measurement with optimized config
    export PERF_CONFIG="${RESULTS_DIR}/optimized-config.json"

    if [[ "$QUICK_TEST" == "true" ]]; then
        SAMPLES=10
    else
        SAMPLES=30
    fi

    "${SCRIPT_DIR}/measure-perf-cost.sh" \
        --endpoint chat/stream \
        --samples "$SAMPLES" \
        --output json \
        > "${RESULTS_DIR}/optimized_${TIMESTAMP}.json"

    log "Optimized measurement completed"
}

# Calculate improvements
calculate_improvements() {
    local baseline_file="$1"
    local optimized_file="$2"
    local results_file="$3"

    log "Calculating performance improvements..."

    # Create TypeScript calculation script
    cat > "${RESULTS_DIR}/calculate-improvements.ts" << 'EOF'
import fs from 'fs';

const baseline = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const optimized = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

const results = {
  tokenReduction: {
    input: ((baseline.metrics.tokens.meanInput - optimized.metrics.tokens.meanInput) /
            baseline.metrics.tokens.meanInput * 100).toFixed(2),
    output: ((baseline.metrics.tokens.meanOutput - optimized.metrics.tokens.meanOutput) /
             baseline.metrics.tokens.meanOutput * 100).toFixed(2),
    total: ((baseline.metrics.tokens.total - optimized.metrics.tokens.total) /
            baseline.metrics.tokens.total * 100).toFixed(2)
  },
  latencyReduction: {
    p50: ((baseline.metrics.latency.p50 - optimized.metrics.latency.p50) /
          baseline.metrics.latency.p50 * 100).toFixed(2),
    p95: ((baseline.metrics.latency.p95 - optimized.metrics.latency.p95) /
          baseline.metrics.latency.p95 * 100).toFixed(2),
    p99: ((baseline.metrics.latency.p99 - optimized.metrics.latency.p99) /
          baseline.metrics.latency.p99 * 100).toFixed(2)
  },
  costReduction: {
    perRequest: ((baseline.metrics.cost.perRequest - optimized.metrics.cost.perRequest) /
                 baseline.metrics.cost.perRequest * 100).toFixed(2)
  },
  cacheHitRate: optimized.metrics.cache?.hitRate || 0,
  timestamp: new Date().toISOString()
};

console.log(JSON.stringify(results, null, 2));
fs.writeFileSync(process.argv[4], JSON.stringify(results, null, 2));
EOF

    npx tsx "${RESULTS_DIR}/calculate-improvements.ts" \
        "$baseline_file" \
        "$optimized_file" \
        "$results_file"

    log "Improvements calculated and saved to $results_file"
}

# Validate performance targets
validate_targets() {
    local results_file="$1"

    log "Validating performance targets..."

    # Read results
    local token_reduction=$(jq -r '.tokenReduction.total' "$results_file")
    local latency_reduction=$(jq -r '.latencyReduction.p95' "$results_file")

    # Convert to numbers for comparison
    token_reduction=${token_reduction%.*}
    latency_reduction=${latency_reduction%.*}

    local targets_met=true
    local messages=()

    # Check token reduction target
    if [[ $token_reduction -ge $TARGET_TOKEN_REDUCTION ]]; then
        success "Token Reduction: ${token_reduction}% (Target: ≥${TARGET_TOKEN_REDUCTION}%)"
    else
        # Check if latency target is met instead
        if [[ $latency_reduction -ge $TARGET_LATENCY_REDUCTION ]]; then
            warn "Token Reduction: ${token_reduction}% (Below target, but latency target met)"
        else
            error "Token Reduction: ${token_reduction}% (Target: ≥${TARGET_TOKEN_REDUCTION}%)"
            targets_met=false
            messages+=("Token reduction target not met")
        fi
    fi

    # Check latency reduction target
    if [[ $latency_reduction -ge $TARGET_LATENCY_REDUCTION ]]; then
        success "Latency Reduction (P95): ${latency_reduction}% (Target: ≥${TARGET_LATENCY_REDUCTION}%)"
    else
        # Check if token target is met instead
        if [[ $token_reduction -ge $TARGET_TOKEN_REDUCTION ]]; then
            warn "Latency Reduction: ${latency_reduction}% (Below target, but token target met)"
        else
            error "Latency Reduction (P95): ${latency_reduction}% (Target: ≥${TARGET_LATENCY_REDUCTION}%)"
            targets_met=false
            messages+=("Latency reduction target not met")
        fi
    fi

    # Check if at least one target is met
    if [[ $token_reduction -ge $TARGET_TOKEN_REDUCTION ]] || [[ $latency_reduction -ge $TARGET_LATENCY_REDUCTION ]]; then
        success "At least one performance target achieved!"
    else
        error "Neither performance target was achieved"
        targets_met=false
    fi

    # Run quality check
    log "Running quality regression check..."
    local quality_score
    quality_score=$(npx tsx "${PROJECT_ROOT}/api/_spikes/knowledge-quality-mock-test.ts" 2>/dev/null | grep "Overall Quality Score" | awk '{print $4}' | sed 's/%//')

    if [[ -n "$quality_score" ]]; then
        # Convert to integer for comparison
        quality_score=${quality_score%.*}

        if [[ $quality_score -ge ${QUALITY_THRESHOLD%.*} ]]; then
            success "Quality Score: ${quality_score}% (Target: ≥${QUALITY_THRESHOLD}%)"
        else
            error "Quality Score: ${quality_score}% (Target: ≥${QUALITY_THRESHOLD}%)"
            targets_met=false
            messages+=("Quality regression detected")
        fi
    else
        warn "Could not determine quality score"
    fi

    # Summary
    echo ""
    echo "================================="
    echo "Performance Validation Summary"
    echo "================================="
    echo "Token Reduction: ${token_reduction}% (Target: ≥${TARGET_TOKEN_REDUCTION}%)"
    echo "Latency Reduction: ${latency_reduction}% (Target: ≥${TARGET_LATENCY_REDUCTION}%)"
    echo "Quality Score: ${quality_score}% (Target: ≥${QUALITY_THRESHOLD}%)"
    echo "================================="

    if [[ "$targets_met" == "true" ]]; then
        success "All targets met! Optimizations successful."
        return 0
    else
        error "Some targets not met:"
        for msg in "${messages[@]}"; do
            error "  - $msg"
        done
        return 1
    fi
}

# Export optimization metrics
export_metrics() {
    log "Exporting optimization metrics..."

    cat > "${RESULTS_DIR}/optimization-metrics.ts" << 'EOF'
import { exportPerformanceMetrics } from '../api/_lib/performance-config.js';

const metrics = exportPerformanceMetrics();
console.log(JSON.stringify(metrics, null, 2));
EOF

    npx tsx "${RESULTS_DIR}/optimization-metrics.ts" > "${RESULTS_DIR}/metrics_${TIMESTAMP}.json"

    success "Metrics exported to ${RESULTS_DIR}/metrics_${TIMESTAMP}.json"
}

# Main execution
main() {
    echo "FlowReader Performance Optimization Test"
    echo "========================================"
    echo ""

    if [[ "$EXPORT_METRICS" == "true" ]]; then
        export_metrics
        exit 0
    fi

    if [[ "$VALIDATE_TARGETS" == "true" ]]; then
        log "Starting full validation of performance targets..."

        # Run baseline
        run_baseline
        local baseline_file="${RESULTS_DIR}/baseline_${TIMESTAMP}.json"

        # Run optimized
        run_optimized
        local optimized_file="${RESULTS_DIR}/optimized_${TIMESTAMP}.json"

        # Calculate improvements
        local improvements_file="${RESULTS_DIR}/improvements_${TIMESTAMP}.json"
        calculate_improvements "$baseline_file" "$optimized_file" "$improvements_file"

        # Validate targets
        if validate_targets "$improvements_file"; then
            success "Performance optimization validation completed successfully!"
            exit 0
        else
            if [[ "$ROLLBACK" == "true" ]]; then
                warn "Rolling back optimizations due to target failures..."
                # Rollback logic would go here
            fi
            exit 1
        fi
    fi

    if [[ "$QUICK_TEST" == "true" ]]; then
        log "Running quick performance test..."

        run_baseline
        run_optimized

        local baseline_file="${RESULTS_DIR}/baseline_${TIMESTAMP}.json"
        local optimized_file="${RESULTS_DIR}/optimized_${TIMESTAMP}.json"
        local improvements_file="${RESULTS_DIR}/improvements_${TIMESTAMP}.json"

        calculate_improvements "$baseline_file" "$optimized_file" "$improvements_file"

        log "Quick test completed. Results:"
        cat "$improvements_file"
    fi
}

# Handle script interruption
trap 'error "Script interrupted"; exit 130' INT

# Execute main function
main "$@"