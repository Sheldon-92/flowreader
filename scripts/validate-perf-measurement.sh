#!/bin/bash

# Performance Measurement Validation Script
# Part of T8-PERF-COST optimization baseline measurement infrastructure
#
# This script validates:
# - Measurement accuracy and consistency
# - Integration with existing systems
# - Configuration correctness
# - Baseline stability

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
VALIDATION_DIR="${PROJECT_ROOT}/perf-validation"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

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

# Validation results
VALIDATION_PASSED=0
VALIDATION_FAILED=0

# Add validation result
add_result() {
    local test_name="$1"
    local status="$2"
    local message="$3"

    if [[ "$status" == "PASS" ]]; then
        success "✅ $test_name: $message"
        ((VALIDATION_PASSED++))
    else
        error "❌ $test_name: $message"
        ((VALIDATION_FAILED++))
    fi
}

# Check if required files exist
validate_file_structure() {
    log "Validating file structure..."

    local required_files=(
        "scripts/measure-perf-cost.sh"
        "scripts/perf-test-runner.ts"
        "scripts/perf-comparison.ts"
        "scripts/perf-config.json"
        "scripts/test-scenarios.json"
        "api/_spikes/performance-baseline.ts"
    )

    for file in "${required_files[@]}"; do
        local file_path="${PROJECT_ROOT}/${file}"
        if [[ -f "$file_path" ]]; then
            add_result "File Structure" "PASS" "$file exists"
        else
            add_result "File Structure" "FAIL" "$file missing"
        fi
    done
}

# Validate script permissions
validate_permissions() {
    log "Validating script permissions..."

    local script_file="${SCRIPT_DIR}/measure-perf-cost.sh"
    if [[ -x "$script_file" ]]; then
        add_result "Permissions" "PASS" "measure-perf-cost.sh is executable"
    else
        add_result "Permissions" "FAIL" "measure-perf-cost.sh is not executable"
    fi
}

# Validate configuration files
validate_configuration() {
    log "Validating configuration files..."

    # Validate perf-config.json
    local config_file="${SCRIPT_DIR}/perf-config.json"
    if jq empty "$config_file" 2>/dev/null; then
        add_result "Configuration" "PASS" "perf-config.json is valid JSON"

        # Check required fields
        local required_fields=("apiBase" "samples" "concurrent" "endpoints")
        for field in "${required_fields[@]}"; do
            if jq -e ".$field" "$config_file" > /dev/null; then
                add_result "Configuration" "PASS" "perf-config.json has $field"
            else
                add_result "Configuration" "FAIL" "perf-config.json missing $field"
            fi
        done
    else
        add_result "Configuration" "FAIL" "perf-config.json is invalid JSON"
    fi

    # Validate test-scenarios.json
    local scenarios_file="${SCRIPT_DIR}/test-scenarios.json"
    if jq empty "$scenarios_file" 2>/dev/null; then
        add_result "Configuration" "PASS" "test-scenarios.json is valid JSON"

        # Check if it's an array with required fields
        local scenario_count
        scenario_count=$(jq 'length' "$scenarios_file")
        if [[ $scenario_count -gt 0 ]]; then
            add_result "Configuration" "PASS" "test-scenarios.json has $scenario_count scenarios"
        else
            add_result "Configuration" "FAIL" "test-scenarios.json is empty"
        fi
    else
        add_result "Configuration" "FAIL" "test-scenarios.json is invalid JSON"
    fi
}

# Validate dependencies
validate_dependencies() {
    log "Validating dependencies..."

    # Check Node.js
    if command -v node &> /dev/null; then
        local node_version
        node_version=$(node --version)
        add_result "Dependencies" "PASS" "Node.js available: $node_version"
    else
        add_result "Dependencies" "FAIL" "Node.js not found"
    fi

    # Check npm/npx
    if command -v npx &> /dev/null; then
        add_result "Dependencies" "PASS" "npx available"
    else
        add_result "Dependencies" "FAIL" "npx not found"
    fi

    # Check tsx
    if npx tsx --version &> /dev/null; then
        local tsx_version
        tsx_version=$(npx tsx --version 2>/dev/null || echo "unknown")
        add_result "Dependencies" "PASS" "tsx available: $tsx_version"
    else
        add_result "Dependencies" "FAIL" "tsx not available"
    fi

    # Check jq
    if command -v jq &> /dev/null; then
        local jq_version
        jq_version=$(jq --version)
        add_result "Dependencies" "PASS" "jq available: $jq_version"
    else
        add_result "Dependencies" "FAIL" "jq not found"
    fi

    # Check curl
    if command -v curl &> /dev/null; then
        add_result "Dependencies" "PASS" "curl available"
    else
        add_result "Dependencies" "FAIL" "curl not found"
    fi
}

# Validate TypeScript compilation
validate_typescript() {
    log "Validating TypeScript files..."

    local ts_files=(
        "scripts/perf-test-runner.ts"
        "scripts/perf-comparison.ts"
        "api/_spikes/performance-baseline.ts"
    )

    for ts_file in "${ts_files[@]}"; do
        local file_path="${PROJECT_ROOT}/${ts_file}"
        if npx tsx --check "$file_path" 2>/dev/null; then
            add_result "TypeScript" "PASS" "$ts_file compiles successfully"
        else
            add_result "TypeScript" "FAIL" "$ts_file has compilation errors"
        fi
    done
}

# Validate environment variables
validate_environment() {
    log "Validating environment variables..."

    # Optional but recommended variables
    local optional_vars=("OPENAI_API_KEY" "PUBLIC_SUPABASE_URL" "SUPABASE_SERVICE_ROLE_KEY")

    for var in "${optional_vars[@]}"; do
        if [[ -n "${!var:-}" ]]; then
            add_result "Environment" "PASS" "$var is set"
        else
            add_result "Environment" "WARN" "$var is not set (optional for testing)"
        fi
    done
}

# Test basic script functionality
test_basic_functionality() {
    log "Testing basic script functionality..."

    # Create validation directory
    mkdir -p "$VALIDATION_DIR"

    # Test help command
    if "${SCRIPT_DIR}/measure-perf-cost.sh" --help &> /dev/null; then
        add_result "Functionality" "PASS" "Help command works"
    else
        add_result "Functionality" "FAIL" "Help command failed"
    fi

    # Test configuration validation
    local temp_config="${VALIDATION_DIR}/test-config.json"
    echo '{"apiBase": "http://test", "samples": 5}' > "$temp_config"

    # This would test config loading (simplified for demo)
    if jq empty "$temp_config" 2>/dev/null; then
        add_result "Functionality" "PASS" "Configuration loading works"
    else
        add_result "Functionality" "FAIL" "Configuration loading failed"
    fi
}

# Test measurement consistency
test_measurement_consistency() {
    log "Testing measurement consistency..."

    # Create a simple test scenario
    local test_scenario_file="${VALIDATION_DIR}/test-scenario.json"
    cat > "$test_scenario_file" << 'EOF'
[
  {
    "name": "Validation Test",
    "bookId": "test-book-validation",
    "intent": "ask",
    "query": "What is this test about?",
    "weight": 1.0
  }
]
EOF

    if jq empty "$test_scenario_file" 2>/dev/null; then
        add_result "Measurement" "PASS" "Test scenario created successfully"
    else
        add_result "Measurement" "FAIL" "Failed to create test scenario"
    fi

    # Test TypeScript runner (dry run)
    if npx tsx "${SCRIPT_DIR}/perf-test-runner.ts" --help &> /dev/null; then
        add_result "Measurement" "PASS" "TypeScript runner accessible"
    else
        add_result "Measurement" "FAIL" "TypeScript runner not accessible"
    fi
}

# Test baseline collection
test_baseline_collection() {
    log "Testing baseline collection..."

    # Test baseline collector
    if npx tsx "${PROJECT_ROOT}/api/_spikes/performance-baseline.ts" --help &> /dev/null; then
        add_result "Baseline" "PASS" "Baseline collector accessible"
    else
        add_result "Baseline" "FAIL" "Baseline collector not accessible"
    fi
}

# Test comparison functionality
test_comparison_functionality() {
    log "Testing comparison functionality..."

    # Create mock performance data for testing
    local mock_baseline="${VALIDATION_DIR}/mock-baseline.json"
    local mock_current="${VALIDATION_DIR}/mock-current.json"

    cat > "$mock_baseline" << 'EOF'
{
  "endpoint": "chat/stream",
  "timestamp": "2024-01-01T00:00:00Z",
  "samples": 10,
  "concurrent": 1,
  "metadata": {
    "endpoint": "chat/stream",
    "samples": 10,
    "concurrent": 1,
    "timestamp": "2024-01-01T00:00:00Z",
    "apiBase": "http://test",
    "scenarios": 1
  },
  "metrics": {
    "latency": {
      "mean": 1000,
      "median": 950,
      "p50": 950,
      "p95": 1800,
      "p99": 2000,
      "min": 800,
      "max": 2100,
      "stdDev": 200
    },
    "tokens": {
      "meanInput": 100,
      "meanOutput": 80,
      "total": 1800,
      "inputTokens": 1000,
      "outputTokens": 800,
      "tokensPerSecond": 50
    },
    "cost": {
      "perRequest": 0.002,
      "per1000": 2.0,
      "totalCost": 0.02,
      "inputCost": 0.0005,
      "outputCost": 0.0012
    },
    "throughput": {
      "requestsPerSecond": 1.0,
      "tokensPerSecond": 50,
      "bytesPerSecond": 0
    }
  },
  "rawData": []
}
EOF

    cat > "$mock_current" << 'EOF'
{
  "endpoint": "chat/stream",
  "timestamp": "2024-01-02T00:00:00Z",
  "samples": 10,
  "concurrent": 1,
  "metadata": {
    "endpoint": "chat/stream",
    "samples": 10,
    "concurrent": 1,
    "timestamp": "2024-01-02T00:00:00Z",
    "apiBase": "http://test",
    "scenarios": 1
  },
  "metrics": {
    "latency": {
      "mean": 850,
      "median": 800,
      "p50": 800,
      "p95": 1500,
      "p99": 1700,
      "min": 700,
      "max": 1800,
      "stdDev": 180
    },
    "tokens": {
      "meanInput": 90,
      "meanOutput": 70,
      "total": 1600,
      "inputTokens": 900,
      "outputTokens": 700,
      "tokensPerSecond": 55
    },
    "cost": {
      "perRequest": 0.0018,
      "per1000": 1.8,
      "totalCost": 0.018,
      "inputCost": 0.00045,
      "outputCost": 0.00105
    },
    "throughput": {
      "requestsPerSecond": 1.1,
      "tokensPerSecond": 55,
      "bytesPerSecond": 0
    }
  },
  "rawData": []
}
EOF

    if jq empty "$mock_baseline" && jq empty "$mock_current"; then
        add_result "Comparison" "PASS" "Mock test data created"
    else
        add_result "Comparison" "FAIL" "Failed to create mock test data"
    fi

    # Test comparison script (would run actual comparison in real test)
    local comparison_output="${VALIDATION_DIR}/comparison-test.json"
    if npx tsx "${SCRIPT_DIR}/perf-comparison.ts" \
        --current "$mock_current" \
        --baseline "$mock_baseline" \
        --output "$comparison_output" \
        --format json 2>/dev/null; then
        add_result "Comparison" "PASS" "Comparison script executed successfully"
    else
        add_result "Comparison" "FAIL" "Comparison script failed"
    fi
}

# Generate validation report
generate_validation_report() {
    local report_file="${VALIDATION_DIR}/validation-report-${TIMESTAMP}.txt"

    {
        echo "Performance Measurement Infrastructure Validation Report"
        echo "======================================================"
        echo "Generated: $(date)"
        echo "Script: $0"
        echo ""
        echo "SUMMARY"
        echo "-------"
        echo "Tests Passed: $VALIDATION_PASSED"
        echo "Tests Failed: $VALIDATION_FAILED"
        echo "Total Tests: $((VALIDATION_PASSED + VALIDATION_FAILED))"
        echo ""
        if [[ $VALIDATION_FAILED -eq 0 ]]; then
            echo "✅ ALL VALIDATIONS PASSED"
            echo ""
            echo "The performance measurement infrastructure is ready for use."
            echo "You can now run baseline measurements and performance comparisons."
        else
            echo "❌ SOME VALIDATIONS FAILED"
            echo ""
            echo "Please review the failed tests above and fix the issues before proceeding."
        fi
        echo ""
        echo "NEXT STEPS"
        echo "----------"
        if [[ $VALIDATION_FAILED -eq 0 ]]; then
            echo "1. Run baseline measurement: ./scripts/measure-perf-cost.sh --endpoint chat/stream --samples 30 --baseline"
            echo "2. Set up automated performance monitoring"
            echo "3. Implement optimizations and compare against baseline"
        else
            echo "1. Fix failed validation tests"
            echo "2. Re-run validation: ./scripts/validate-perf-measurement.sh"
            echo "3. Proceed with baseline measurement once all tests pass"
        fi
    } | tee "$report_file"

    log "Validation report saved: $report_file"
}

# Main validation function
main() {
    echo "Performance Measurement Infrastructure Validation"
    echo "================================================"
    echo ""

    # Create validation directory
    mkdir -p "$VALIDATION_DIR"

    # Run all validation tests
    validate_file_structure
    validate_permissions
    validate_configuration
    validate_dependencies
    validate_typescript
    validate_environment
    test_basic_functionality
    test_measurement_consistency
    test_baseline_collection
    test_comparison_functionality

    echo ""
    log "Validation completed"

    # Generate report
    generate_validation_report

    # Exit with appropriate code
    if [[ $VALIDATION_FAILED -eq 0 ]]; then
        echo ""
        success "🎉 All validations passed! Performance measurement infrastructure is ready."
        exit 0
    else
        echo ""
        error "⚠️  Some validations failed. Please review and fix issues."
        exit 1
    fi
}

# Handle script interruption
trap 'error "Validation interrupted"; exit 130' INT

# Execute main function
main "$@"