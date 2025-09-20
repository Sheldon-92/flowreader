#!/bin/bash

# Cost Analysis Script
# Part of T8-PERF-COST optimization validation framework
#
# This script analyzes cost reduction from performance optimizations
# and calculates ROI for optimization efforts

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RESULTS_DIR="${PROJECT_ROOT}/perf-results/cost-analysis"

# Create results directory
mkdir -p "$RESULTS_DIR"

# Default cost parameters (OpenAI GPT-4 pricing as reference)
DEFAULT_INPUT_COST_PER_1K=0.03    # $0.03 per 1K input tokens
DEFAULT_OUTPUT_COST_PER_1K=0.06   # $0.06 per 1K output tokens
DEFAULT_MONTHLY_REQUESTS=30000     # Estimated monthly requests

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*" | tee -a "${RESULTS_DIR}/cost_analysis_${TIMESTAMP}.log"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "${RESULTS_DIR}/cost_analysis_${TIMESTAMP}.log"; }
error() { echo -e "${RED}[ERROR]${NC} $*" | tee -a "${RESULTS_DIR}/cost_analysis_${TIMESTAMP}.log"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "${RESULTS_DIR}/cost_analysis_${TIMESTAMP}.log"; }
cost() { echo -e "${CYAN}[COST]${NC} $*" | tee -a "${RESULTS_DIR}/cost_analysis_${TIMESTAMP}.log"; }

# Help function
show_help() {
    cat << EOF
Cost Analysis Script

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --baseline FILE         Baseline performance results file
    --optimized FILE        Optimized performance results file

    --input-cost N          Cost per 1K input tokens (default: 0.03)
    --output-cost N         Cost per 1K output tokens (default: 0.06)
    --monthly-requests N    Estimated monthly requests (default: 30000)

    --export-report         Export detailed cost analysis report
    --export-format FORMAT Output format: json, csv, markdown (default: json)

    --include-infrastructure Include infrastructure cost analysis
    --optimization-cost N   One-time cost of optimization effort (default: 0)

    --projection-months N   Cost projection period in months (default: 12)

    --help                  Show this help

EXAMPLES:
    # Basic cost analysis
    $0 --baseline baseline.json --optimized optimized.json

    # Comprehensive analysis with projections
    $0 --baseline baseline.json --optimized optimized.json \\
       --monthly-requests 50000 --projection-months 24 --export-report

    # Include optimization costs
    $0 --baseline baseline.json --optimized optimized.json \\
       --optimization-cost 5000 --include-infrastructure

COST PARAMETERS:
    Input Tokens: \$${DEFAULT_INPUT_COST_PER_1K} per 1K tokens
    Output Tokens: \$${DEFAULT_OUTPUT_COST_PER_1K} per 1K tokens
    Monthly Requests: ${DEFAULT_MONTHLY_REQUESTS}

EOF
}

# Parse command line arguments
parse_args() {
    BASELINE_FILE=""
    OPTIMIZED_FILE=""

    INPUT_COST_PER_1K="$DEFAULT_INPUT_COST_PER_1K"
    OUTPUT_COST_PER_1K="$DEFAULT_OUTPUT_COST_PER_1K"
    MONTHLY_REQUESTS="$DEFAULT_MONTHLY_REQUESTS"

    EXPORT_REPORT=false
    EXPORT_FORMAT="json"
    INCLUDE_INFRASTRUCTURE=false
    OPTIMIZATION_COST=0
    PROJECTION_MONTHS=12

    while [[ $# -gt 0 ]]; do
        case $1 in
            --baseline)
                BASELINE_FILE="$2"
                shift 2
                ;;
            --optimized)
                OPTIMIZED_FILE="$2"
                shift 2
                ;;
            --input-cost)
                INPUT_COST_PER_1K="$2"
                shift 2
                ;;
            --output-cost)
                OUTPUT_COST_PER_1K="$2"
                shift 2
                ;;
            --monthly-requests)
                MONTHLY_REQUESTS="$2"
                shift 2
                ;;
            --export-report)
                EXPORT_REPORT=true
                shift
                ;;
            --export-format)
                EXPORT_FORMAT="$2"
                shift 2
                ;;
            --include-infrastructure)
                INCLUDE_INFRASTRUCTURE=true
                shift
                ;;
            --optimization-cost)
                OPTIMIZATION_COST="$2"
                shift 2
                ;;
            --projection-months)
                PROJECTION_MONTHS="$2"
                shift 2
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

    # Validate required arguments
    if [[ -z "$BASELINE_FILE" ]]; then
        error "Baseline file is required (--baseline)"
        exit 1
    fi

    if [[ -z "$OPTIMIZED_FILE" ]]; then
        error "Optimized file is required (--optimized)"
        exit 1
    fi
}

# Validate environment and files
validate_environment() {
    log "Validating environment for cost analysis..."

    # Check required tools
    local required_tools=("node" "npx" "jq" "bc")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            error "Required tool not found: $tool"
            exit 1
        fi
    done

    # Validate input files
    if [[ ! -f "$BASELINE_FILE" ]]; then
        error "Baseline file not found: $BASELINE_FILE"
        exit 1
    fi

    if [[ ! -f "$OPTIMIZED_FILE" ]]; then
        error "Optimized file not found: $OPTIMIZED_FILE"
        exit 1
    fi

    # Validate JSON format
    if ! jq empty "$BASELINE_FILE" 2>/dev/null; then
        error "Invalid JSON format in baseline file: $BASELINE_FILE"
        exit 1
    fi

    if ! jq empty "$OPTIMIZED_FILE" 2>/dev/null; then
        error "Invalid JSON format in optimized file: $OPTIMIZED_FILE"
        exit 1
    fi

    success "Environment validation completed"
}

# Calculate detailed cost analysis
calculate_cost_analysis() {
    log "Calculating detailed cost analysis..."

    # Create TypeScript cost calculation script
    cat > "${RESULTS_DIR}/cost-calculator.ts" << EOF
import fs from 'fs';

interface PerformanceMetrics {
  metadata: {
    endpoint: string;
    samples: number;
    timestamp: string;
  };
  metrics: {
    tokens: {
      meanInput: number;
      meanOutput: number;
      total: number;
    };
    latency: {
      p50: number;
      p95: number;
      p99: number;
      mean: number;
    };
    cost: {
      perRequest: number;
      per1000: number;
    };
    quality?: {
      score: number;
    };
    cache?: {
      hitRate: number;
    };
  };
}

interface CostAnalysisResult {
  baseline: CostBreakdown;
  optimized: CostBreakdown;
  savings: CostSavings;
  projections: CostProjections;
  roi: ROIAnalysis;
  summary: CostSummary;
}

interface CostBreakdown {
  tokenCosts: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
  };
  perRequest: number;
  perThousandRequests: number;
  monthly: number;
  annual: number;
}

interface CostSavings {
  absolute: {
    perRequest: number;
    monthly: number;
    annual: number;
  };
  percentage: {
    perRequest: number;
    monthly: number;
    annual: number;
  };
}

interface CostProjections {
  months: number[];
  baselineCosts: number[];
  optimizedCosts: number[];
  cumulativeSavings: number[];
}

interface ROIAnalysis {
  optimizationCost: number;
  monthlyReturn: number;
  paybackPeriodMonths: number;
  roi12Month: number;
  roi24Month: number;
  netPresentValue: number;
}

interface CostSummary {
  significantSavings: boolean;
  recommendProceed: boolean;
  keyMetrics: {
    monthlyReduction: string;
    annualSavings: string;
    tokenReduction: string;
    paybackPeriod: string;
  };
}

// Configuration
const inputCostPer1K = ${INPUT_COST_PER_1K};
const outputCostPer1K = ${OUTPUT_COST_PER_1K};
const monthlyRequests = ${MONTHLY_REQUESTS};
const optimizationCost = ${OPTIMIZATION_COST};
const projectionMonths = ${PROJECTION_MONTHS};

// Load data
const baselineFile = process.argv[2];
const optimizedFile = process.argv[3];
const outputFile = process.argv[4];

const baseline: PerformanceMetrics = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const optimized: PerformanceMetrics = JSON.parse(fs.readFileSync(optimizedFile, 'utf8'));

function calculateCostBreakdown(metrics: PerformanceMetrics): CostBreakdown {
  const inputTokens = metrics.metrics.tokens.meanInput;
  const outputTokens = metrics.metrics.tokens.meanOutput;

  const inputCost = (inputTokens / 1000) * inputCostPer1K;
  const outputCost = (outputTokens / 1000) * outputCostPer1K;
  const totalCost = inputCost + outputCost;

  const monthly = totalCost * monthlyRequests;
  const annual = monthly * 12;

  return {
    tokenCosts: {
      inputCost,
      outputCost,
      totalCost
    },
    perRequest: totalCost,
    perThousandRequests: totalCost * 1000,
    monthly,
    annual
  };
}

function calculateSavings(baseline: CostBreakdown, optimized: CostBreakdown): CostSavings {
  const absolutePerRequest = baseline.perRequest - optimized.perRequest;
  const absoluteMonthly = baseline.monthly - optimized.monthly;
  const absoluteAnnual = baseline.annual - optimized.annual;

  const percentagePerRequest = (absolutePerRequest / baseline.perRequest) * 100;
  const percentageMonthly = (absoluteMonthly / baseline.monthly) * 100;
  const percentageAnnual = (absoluteAnnual / baseline.annual) * 100;

  return {
    absolute: {
      perRequest: absolutePerRequest,
      monthly: absoluteMonthly,
      annual: absoluteAnnual
    },
    percentage: {
      perRequest: percentagePerRequest,
      monthly: percentageMonthly,
      annual: percentageAnnual
    }
  };
}

function calculateProjections(baseline: CostBreakdown, optimized: CostBreakdown): CostProjections {
  const months = Array.from({ length: projectionMonths }, (_, i) => i + 1);
  const monthlySaving = baseline.monthly - optimized.monthly;

  const baselineCosts = months.map(month => baseline.monthly * month);
  const optimizedCosts = months.map(month => optimized.monthly * month);
  const cumulativeSavings = months.map(month => monthlySaving * month);

  return {
    months,
    baselineCosts,
    optimizedCosts,
    cumulativeSavings
  };
}

function calculateROI(savings: CostSavings): ROIAnalysis {
  const monthlyReturn = savings.absolute.monthly;
  const paybackPeriodMonths = optimizationCost > 0 ? optimizationCost / monthlyReturn : 0;
  const roi12Month = optimizationCost > 0 ? ((savings.absolute.annual - optimizationCost) / optimizationCost) * 100 : 0;
  const roi24Month = optimizationCost > 0 ? (((savings.absolute.annual * 2) - optimizationCost) / optimizationCost) * 100 : 0;

  // Simple NPV calculation (assuming 5% discount rate)
  const discountRate = 0.05;
  let npv = -optimizationCost;
  for (let i = 1; i <= 24; i++) {
    npv += monthlyReturn / Math.pow(1 + discountRate / 12, i);
  }

  return {
    optimizationCost,
    monthlyReturn,
    paybackPeriodMonths,
    roi12Month,
    roi24Month,
    netPresentValue: npv
  };
}

function generateSummary(
  baseline: CostBreakdown,
  optimized: CostBreakdown,
  savings: CostSavings,
  roi: ROIAnalysis
): CostSummary {
  const tokenReduction = ((baseline.tokenCosts.totalCost - optimized.tokenCosts.totalCost) / baseline.tokenCosts.totalCost) * 100;

  const significantSavings = savings.percentage.monthly >= 10; // 10% or more monthly savings
  const paybackReasonable = roi.paybackPeriodMonths <= 12; // Payback within 12 months
  const recommendProceed = significantSavings && (optimizationCost === 0 || paybackReasonable);

  return {
    significantSavings,
    recommendProceed,
    keyMetrics: {
      monthlyReduction: \`\${savings.percentage.monthly.toFixed(1)}%\`,
      annualSavings: \`\$\${savings.absolute.annual.toFixed(0)}\`,
      tokenReduction: \`\${tokenReduction.toFixed(1)}%\`,
      paybackPeriod: roi.paybackPeriodMonths > 0 ? \`\${roi.paybackPeriodMonths.toFixed(1)} months\` : 'Immediate'
    }
  };
}

// Calculate all metrics
const baselineCosts = calculateCostBreakdown(baseline);
const optimizedCosts = calculateCostBreakdown(optimized);
const savings = calculateSavings(baselineCosts, optimizedCosts);
const projections = calculateProjections(baselineCosts, optimizedCosts);
const roi = calculateROI(savings);
const summary = generateSummary(baselineCosts, optimizedCosts, savings, roi);

const result: CostAnalysisResult = {
  baseline: baselineCosts,
  optimized: optimizedCosts,
  savings,
  projections,
  roi,
  summary
};

// Add metadata
const finalResult = {
  ...result,
  metadata: {
    timestamp: new Date().toISOString(),
    configuration: {
      inputCostPer1K,
      outputCostPer1K,
      monthlyRequests,
      optimizationCost,
      projectionMonths
    },
    baselineFile,
    optimizedFile
  }
};

// Write result
fs.writeFileSync(outputFile, JSON.stringify(finalResult, null, 2));

// Output summary for shell script
console.log(JSON.stringify({
  monthlyReduction: savings.percentage.monthly.toFixed(1),
  annualSavings: savings.absolute.annual.toFixed(0),
  paybackMonths: roi.paybackPeriodMonths.toFixed(1),
  recommendProceed: summary.recommendProceed
}));
EOF

    # Execute cost calculation
    local cost_results_file="${RESULTS_DIR}/cost_analysis_${TIMESTAMP}.json"

    if npx tsx "${RESULTS_DIR}/cost-calculator.ts" \
        "$BASELINE_FILE" \
        "$OPTIMIZED_FILE" \
        "$cost_results_file"; then

        success "Cost analysis calculated: $cost_results_file"
        echo "$cost_results_file"
    else
        error "Failed to calculate cost analysis"
        exit 1
    fi
}

# Display cost analysis results
display_results() {
    local results_file="$1"

    log "Displaying cost analysis results..."

    # Extract key metrics
    local monthly_reduction
    monthly_reduction=$(jq -r '.savings.percentage.monthly' "$results_file")

    local annual_savings
    annual_savings=$(jq -r '.savings.absolute.annual' "$results_file")

    local payback_months
    payback_months=$(jq -r '.roi.paybackPeriodMonths' "$results_file")

    local recommend_proceed
    recommend_proceed=$(jq -r '.summary.recommendProceed' "$results_file")

    echo ""
    echo "================================="
    echo "COST ANALYSIS RESULTS"
    echo "================================="

    # Baseline costs
    echo ""
    cost "BASELINE COSTS:"
    printf "  Per Request: \$%s\n" "$(jq -r '.baseline.perRequest' "$results_file")"
    printf "  Monthly: \$%s\n" "$(jq -r '.baseline.monthly' "$results_file")"
    printf "  Annual: \$%s\n" "$(jq -r '.baseline.annual' "$results_file")"

    # Optimized costs
    echo ""
    cost "OPTIMIZED COSTS:"
    printf "  Per Request: \$%s\n" "$(jq -r '.optimized.perRequest' "$results_file")"
    printf "  Monthly: \$%s\n" "$(jq -r '.optimized.monthly' "$results_file")"
    printf "  Annual: \$%s\n" "$(jq -r '.optimized.annual' "$results_file")"

    # Savings
    echo ""
    success "COST SAVINGS:"
    printf "  Per Request: \$%s (%.1f%%)\n" \
        "$(jq -r '.savings.absolute.perRequest' "$results_file")" \
        "$(jq -r '.savings.percentage.perRequest' "$results_file")"
    printf "  Monthly: \$%s (%.1f%%)\n" \
        "$(jq -r '.savings.absolute.monthly' "$results_file")" \
        "$(jq -r '.savings.percentage.monthly' "$results_file")"
    printf "  Annual: \$%s (%.1f%%)\n" \
        "$(jq -r '.savings.absolute.annual' "$results_file")" \
        "$(jq -r '.savings.percentage.annual' "$results_file")"

    # ROI Analysis
    if [[ $(echo "$OPTIMIZATION_COST > 0" | bc) -eq 1 ]]; then
        echo ""
        cost "ROI ANALYSIS:"
        printf "  Optimization Cost: \$%s\n" "$(jq -r '.roi.optimizationCost' "$results_file")"
        printf "  Monthly Return: \$%s\n" "$(jq -r '.roi.monthlyReturn' "$results_file")"
        printf "  Payback Period: %.1f months\n" "$(jq -r '.roi.paybackPeriodMonths' "$results_file")"
        printf "  12-Month ROI: %.1f%%\n" "$(jq -r '.roi.roi12Month' "$results_file")"
        printf "  24-Month ROI: %.1f%%\n" "$(jq -r '.roi.roi24Month' "$results_file")"
        printf "  Net Present Value: \$%s\n" "$(jq -r '.roi.netPresentValue' "$results_file")"
    fi

    # Token optimization impact
    echo ""
    cost "TOKEN OPTIMIZATION:"
    local baseline_input
    baseline_input=$(jq -r '.baseline.tokenCosts.inputCost' "$results_file")
    local optimized_input
    optimized_input=$(jq -r '.optimized.tokenCosts.inputCost' "$results_file")
    local input_reduction
    input_reduction=$(echo "scale=1; ($baseline_input - $optimized_input) / $baseline_input * 100" | bc)

    local baseline_output
    baseline_output=$(jq -r '.baseline.tokenCosts.outputCost' "$results_file")
    local optimized_output
    optimized_output=$(jq -r '.optimized.tokenCosts.outputCost' "$results_file")
    local output_reduction
    output_reduction=$(echo "scale=1; ($baseline_output - $optimized_output) / $baseline_output * 100" | bc)

    printf "  Input Token Cost Reduction: %.1f%%\n" "$input_reduction"
    printf "  Output Token Cost Reduction: %.1f%%\n" "$output_reduction"

    # Cache impact (if available)
    local cache_hit_rate
    cache_hit_rate=$(jq -r '.optimized.cacheHitRate // 0' "$OPTIMIZED_FILE")
    if [[ "$cache_hit_rate" != "0" ]]; then
        echo ""
        cost "CACHE EFFECTIVENESS:"
        printf "  Cache Hit Rate: %.1f%%\n" "$(echo "$cache_hit_rate * 100" | bc)"
        local cache_savings
        cache_savings=$(echo "scale=2; $annual_savings * $cache_hit_rate" | bc)
        printf "  Estimated Cache Savings: \$%s annually\n" "$cache_savings"
    fi

    # Recommendation
    echo ""
    echo "================================="
    echo "COST ANALYSIS SUMMARY"
    echo "================================="

    if [[ "$recommend_proceed" == "true" ]]; then
        success "💰 RECOMMENDATION: PROCEED with optimization deployment"
        echo ""
        echo "Key Benefits:"
        echo "  ✅ Significant cost reduction: ${monthly_reduction}% monthly"
        echo "  ✅ Annual savings: \$${annual_savings}"
        if [[ $(echo "$OPTIMIZATION_COST > 0" | bc) -eq 1 ]]; then
            echo "  ✅ Reasonable payback period: ${payback_months} months"
        fi
        echo "  ✅ Positive ROI and sustainable savings"
    else
        warn "⚠️  RECOMMENDATION: REVIEW optimization before deployment"
        echo ""
        echo "Considerations:"
        if [[ $(echo "${monthly_reduction} < 10" | bc) -eq 1 ]]; then
            echo "  ⚠️  Monthly reduction below 10%: ${monthly_reduction}%"
        fi
        if [[ $(echo "$payback_months > 12" | bc) -eq 1 ]]; then
            echo "  ⚠️  Payback period exceeds 12 months: ${payback_months}"
        fi
        echo "  📊 Annual savings potential: \$${annual_savings}"
    fi

    echo ""
}

# Export detailed report
export_cost_report() {
    local results_file="$1"

    if [[ "$EXPORT_REPORT" != "true" ]]; then
        return 0
    fi

    log "Exporting detailed cost analysis report..."

    local report_file="${RESULTS_DIR}/cost_report_${TIMESTAMP}.${EXPORT_FORMAT}"

    case "$EXPORT_FORMAT" in
        "json")
            cp "$results_file" "$report_file"
            ;;
        "csv")
            export_cost_csv "$results_file" "$report_file"
            ;;
        "markdown")
            export_cost_markdown "$results_file" "$report_file"
            ;;
        *)
            error "Unknown export format: $EXPORT_FORMAT"
            return 1
            ;;
    esac

    success "Cost analysis report exported: $report_file"
}

# Export CSV format
export_cost_csv() {
    local input_file="$1"
    local output_file="$2"

    {
        echo "metric,baseline,optimized,savings_absolute,savings_percentage"
        echo "per_request,$(jq -r '.baseline.perRequest' "$input_file"),$(jq -r '.optimized.perRequest' "$input_file"),$(jq -r '.savings.absolute.perRequest' "$input_file"),$(jq -r '.savings.percentage.perRequest' "$input_file")"
        echo "monthly,$(jq -r '.baseline.monthly' "$input_file"),$(jq -r '.optimized.monthly' "$input_file"),$(jq -r '.savings.absolute.monthly' "$input_file"),$(jq -r '.savings.percentage.monthly' "$input_file")"
        echo "annual,$(jq -r '.baseline.annual' "$input_file"),$(jq -r '.optimized.annual' "$input_file"),$(jq -r '.savings.absolute.annual' "$input_file"),$(jq -r '.savings.percentage.annual' "$input_file")"
    } > "$output_file"
}

# Export Markdown format
export_cost_markdown() {
    local input_file="$1"
    local output_file="$2"

    cat > "$output_file" << EOF
# Cost Analysis Report

**Generated:** $(date)
**Analysis Period:** $(jq -r '.metadata.configuration.projectionMonths' "$input_file") months
**Monthly Requests:** $(jq -r '.metadata.configuration.monthlyRequests' "$input_file")

## Executive Summary

$(jq -r '
if .summary.recommendProceed then
    "✅ **RECOMMENDATION: PROCEED** - Optimization provides significant cost benefits\n\n- Monthly cost reduction: " + .summary.keyMetrics.monthlyReduction + "\n- Annual savings: " + .summary.keyMetrics.annualSavings + "\n- Token optimization: " + .summary.keyMetrics.tokenReduction + "\n- Payback period: " + .summary.keyMetrics.paybackPeriod
else
    "⚠️ **RECOMMENDATION: REVIEW** - Cost benefits may not justify optimization\n\n- Monthly cost reduction: " + .summary.keyMetrics.monthlyReduction + "\n- Annual savings: " + .summary.keyMetrics.annualSavings + "\n- Consider alternative optimization strategies"
end
' "$input_file")

## Cost Comparison

| Metric | Baseline | Optimized | Savings | Reduction |
|--------|----------|-----------|---------|-----------|
| Per Request | \$$(jq -r '.baseline.perRequest' "$input_file") | \$$(jq -r '.optimized.perRequest' "$input_file") | \$$(jq -r '.savings.absolute.perRequest' "$input_file") | $(jq -r '.savings.percentage.perRequest' "$input_file")% |
| Monthly | \$$(jq -r '.baseline.monthly' "$input_file") | \$$(jq -r '.optimized.monthly' "$input_file") | \$$(jq -r '.savings.absolute.monthly' "$input_file") | $(jq -r '.savings.percentage.monthly' "$input_file")% |
| Annual | \$$(jq -r '.baseline.annual' "$input_file") | \$$(jq -r '.optimized.annual' "$input_file") | \$$(jq -r '.savings.absolute.annual' "$input_file") | $(jq -r '.savings.percentage.annual' "$input_file")% |

## Token Cost Breakdown

### Baseline
- **Input Tokens:** \$$(jq -r '.baseline.tokenCosts.inputCost' "$input_file") per request
- **Output Tokens:** \$$(jq -r '.baseline.tokenCosts.outputCost' "$input_file") per request
- **Total:** \$$(jq -r '.baseline.tokenCosts.totalCost' "$input_file") per request

### Optimized
- **Input Tokens:** \$$(jq -r '.optimized.tokenCosts.inputCost' "$input_file") per request
- **Output Tokens:** \$$(jq -r '.optimized.tokenCosts.outputCost' "$input_file") per request
- **Total:** \$$(jq -r '.optimized.tokenCosts.totalCost' "$input_file") per request

## ROI Analysis

$(if [[ $(jq -r '.roi.optimizationCost' "$input_file") != "0" ]]; then
cat << ROI_SECTION
- **Optimization Investment:** \$$(jq -r '.roi.optimizationCost' "$input_file")
- **Monthly Return:** \$$(jq -r '.roi.monthlyReturn' "$input_file")
- **Payback Period:** $(jq -r '.roi.paybackPeriodMonths' "$input_file") months
- **12-Month ROI:** $(jq -r '.roi.roi12Month' "$input_file")%
- **24-Month ROI:** $(jq -r '.roi.roi24Month' "$input_file")%
- **Net Present Value:** \$$(jq -r '.roi.netPresentValue' "$input_file")
ROI_SECTION
else
echo "No optimization cost specified - all savings are net benefits"
fi)

## Cost Projections

The following table shows projected costs and cumulative savings over $(jq -r '.metadata.configuration.projectionMonths' "$input_file") months:

| Month | Baseline Cost | Optimized Cost | Monthly Savings | Cumulative Savings |
|-------|---------------|----------------|-----------------|-------------------|
$(jq -r '
  .projections.months as $months |
  .projections.baselineCosts as $baseline |
  .projections.optimizedCosts as $optimized |
  .projections.cumulativeSavings as $savings |
  range(0; ($months | length)) as $i |
  "| \($months[$i]) | \$\($baseline[$i] | round) | \$\($optimized[$i] | round) | \$\(($baseline[$i] - $optimized[$i]) | round) | \$\($savings[$i] | round) |"
' "$input_file")

## Key Findings

$(jq -r '
[
  "💰 **Cost Impact:** " + (.savings.percentage.monthly | tostring) + "% monthly reduction",
  "📊 **Scale Impact:** \$" + (.savings.absolute.annual | tostring) + " annual savings",
  "⚡ **Token Efficiency:** " + (.summary.keyMetrics.tokenReduction) + " reduction in token costs",
  if .roi.optimizationCost > 0 then
    "🎯 **ROI:** " + (.roi.paybackPeriodMonths | tostring) + " month payback period"
  else
    "🎯 **ROI:** Immediate return (no optimization costs)"
  end,
  if .summary.significantSavings then
    "✅ **Significance:** Cost savings exceed 10% threshold"
  else
    "⚠️ **Significance:** Cost savings below 10% threshold"
  end
] | join("\n- ")
' "$input_file" | sed 's/^/- /')

## Recommendations

$(jq -r '
if .summary.recommendProceed then
    "### ✅ Proceed with Optimization\n\n1. **Deploy optimizations** to production environment\n2. **Monitor costs** continuously for 30 days\n3. **Track actual vs projected** savings\n4. **Document optimization strategies** for future reference\n5. **Consider additional optimizations** based on results\n\n### Success Criteria\n- Achieve projected monthly savings of \$" + (.savings.absolute.monthly | tostring) + "\n- Maintain or improve service quality\n- Complete payback within " + (.roi.paybackPeriodMonths | tostring) + " months"
else
    "### ⚠️ Review Before Proceeding\n\n1. **Analyze optimization strategies** for potential improvements\n2. **Consider alternative approaches** to increase cost benefits\n3. **Re-evaluate optimization scope** and implementation\n4. **Test with different parameters** or configurations\n5. **Consider phased deployment** to minimize risk\n\n### Improvement Areas\n- Target higher token reduction (current: " + .summary.keyMetrics.tokenReduction + ")\n- Optimize for specific high-cost operations\n- Implement more aggressive caching strategies"
end
' "$input_file")

---
*Generated by FlowReader Cost Analysis Framework*
EOF
}

# Main execution function
main() {
    echo "FlowReader Cost Analysis"
    echo "======================="
    echo ""

    # Parse arguments
    parse_args "$@"

    # Show configuration
    log "Cost Analysis Configuration:"
    log "  Baseline File: $BASELINE_FILE"
    log "  Optimized File: $OPTIMIZED_FILE"
    log "  Input Token Cost: \$${INPUT_COST_PER_1K} per 1K"
    log "  Output Token Cost: \$${OUTPUT_COST_PER_1K} per 1K"
    log "  Monthly Requests: ${MONTHLY_REQUESTS}"
    log "  Optimization Cost: \$${OPTIMIZATION_COST}"
    log "  Projection Period: ${PROJECTION_MONTHS} months"
    echo ""

    # Validate environment
    validate_environment

    # Calculate cost analysis
    local results_file
    results_file=$(calculate_cost_analysis)

    # Display results
    display_results "$results_file"

    # Export report if requested
    export_cost_report "$results_file"

    success "🎉 Cost analysis completed successfully!"
    echo ""
    echo "Results saved to: ${RESULTS_DIR}/"
}

# Handle script interruption
trap 'error "Cost analysis interrupted"; exit 130' INT

# Execute main function
main "$@"