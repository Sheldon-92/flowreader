#!/bin/bash

# Cache Effectiveness Testing Script
# Part of T8-PERF-COST optimization validation framework
#
# This script tests cache effectiveness and measures performance improvements
# from intelligent response caching optimization

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RESULTS_DIR="${PROJECT_ROOT}/perf-results/cache-testing"

# Create results directory
mkdir -p "$RESULTS_DIR"

# API configuration
API_BASE="http://localhost:3001/api"
CACHE_TEST_ENDPOINT="${API_BASE}/chat/stream"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*" | tee -a "${RESULTS_DIR}/cache_test_${TIMESTAMP}.log"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "${RESULTS_DIR}/cache_test_${TIMESTAMP}.log"; }
error() { echo -e "${RED}[ERROR]${NC} $*" | tee -a "${RESULTS_DIR}/cache_test_${TIMESTAMP}.log"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "${RESULTS_DIR}/cache_test_${TIMESTAMP}.log"; }
cache() { echo -e "${CYAN}[CACHE]${NC} $*" | tee -a "${RESULTS_DIR}/cache_test_${TIMESTAMP}.log"; }

# Help function
show_help() {
    cat << EOF
Cache Effectiveness Testing Script

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --api-base URL          API base URL (default: http://localhost:3001/api)
    --cache-warmup-requests N  Number of warmup requests (default: 5)
    --cache-test-requests N    Number of test requests (default: 10)
    --cache-scenarios N        Number of different scenarios (default: 3)

    --target-hit-rate N     Target cache hit rate percentage (default: 80)
    --target-speedup N      Target cache speedup multiplier (default: 2.0)

    --export-results        Export detailed cache test results
    --export-format FORMAT Output format: json, csv, markdown (default: json)

    --include-stress-test   Include cache stress testing
    --concurrent-requests N Concurrent requests for stress test (default: 5)

    --verbose               Enable verbose logging
    --help                  Show this help

CACHE SCENARIOS:
    1. Identical requests (100% cache hit expected)
    2. Similar requests (semantic similarity cache)
    3. Different requests (cache miss expected)

TARGETS:
    Cache Hit Rate: ≥80%
    Cache Speedup: ≥2.0x faster than uncached

EXAMPLES:
    # Basic cache effectiveness test
    $0

    # Comprehensive test with stress testing
    $0 --include-stress-test --concurrent-requests 10

    # Test with custom targets
    $0 --target-hit-rate 90 --target-speedup 3.0 --export-results

EOF
}

# Parse command line arguments
parse_args() {
    API_BASE="http://localhost:3001/api"
    CACHE_WARMUP_REQUESTS=5
    CACHE_TEST_REQUESTS=10
    CACHE_SCENARIOS=3

    TARGET_HIT_RATE=80
    TARGET_SPEEDUP=2.0

    EXPORT_RESULTS=false
    EXPORT_FORMAT="json"
    INCLUDE_STRESS_TEST=false
    CONCURRENT_REQUESTS=5
    VERBOSE=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --api-base)
                API_BASE="$2"
                CACHE_TEST_ENDPOINT="${API_BASE}/chat/stream"
                shift 2
                ;;
            --cache-warmup-requests)
                CACHE_WARMUP_REQUESTS="$2"
                shift 2
                ;;
            --cache-test-requests)
                CACHE_TEST_REQUESTS="$2"
                shift 2
                ;;
            --cache-scenarios)
                CACHE_SCENARIOS="$2"
                shift 2
                ;;
            --target-hit-rate)
                TARGET_HIT_RATE="$2"
                shift 2
                ;;
            --target-speedup)
                TARGET_SPEEDUP="$2"
                shift 2
                ;;
            --export-results)
                EXPORT_RESULTS=true
                shift
                ;;
            --export-format)
                EXPORT_FORMAT="$2"
                shift 2
                ;;
            --include-stress-test)
                INCLUDE_STRESS_TEST=true
                shift
                ;;
            --concurrent-requests)
                CONCURRENT_REQUESTS="$2"
                shift 2
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

# Validate environment
validate_environment() {
    log "Validating environment for cache testing..."

    # Check required tools
    local required_tools=("curl" "jq" "node" "npx" "bc")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            error "Required tool not found: $tool"
            exit 1
        fi
    done

    # Test API connectivity
    log "Testing API connectivity: $API_BASE"
    if ! curl -s --max-time 10 "$API_BASE" > /dev/null; then
        error "Cannot connect to API at: $API_BASE"
        exit 1
    fi

    success "Environment validation completed"
}

# Enable cache for testing
enable_cache() {
    log "Enabling cache for testing..."

    # Create cache-enabled config
    cat > "${RESULTS_DIR}/cache-enabled-config.json" << EOF
{
  "caching": {
    "enabled": true,
    "responseCacheTTL": 900,
    "embeddingCacheTTL": 3600,
    "semanticSimilarityThreshold": 0.95
  },
  "tokenManagement": {
    "enabled": true
  },
  "promptOptimization": {
    "enabled": true
  }
}
EOF

    export PERF_CONFIG="${RESULTS_DIR}/cache-enabled-config.json"
    success "Cache enabled for testing"
}

# Disable cache for comparison
disable_cache() {
    log "Disabling cache for comparison..."

    # Create cache-disabled config
    cat > "${RESULTS_DIR}/cache-disabled-config.json" << EOF
{
  "caching": {
    "enabled": false
  },
  "tokenManagement": {
    "enabled": true
  },
  "promptOptimization": {
    "enabled": true
  }
}
EOF

    export PERF_CONFIG="${RESULTS_DIR}/cache-disabled-config.json"
    success "Cache disabled for comparison"
}

# Test cache scenario
test_cache_scenario() {
    local scenario_name="$1"
    local scenario_description="$2"
    local test_requests="$3"
    local results_file="$4"

    cache "Testing cache scenario: $scenario_name"
    log "Description: $scenario_description"

    # Create TypeScript cache test script
    cat > "${RESULTS_DIR}/cache-test-${scenario_name}.ts" << EOF
import fetch from 'node-fetch';
import fs from 'fs';

interface CacheTestRequest {
  bookId: string;
  query?: string;
  intent?: string;
  selection?: { text: string };
}

interface CacheTestResult {
  requestId: number;
  latency: number;
  cacheHit: boolean;
  cacheStatus: string;
  responseSize: number;
  success: boolean;
  error?: string;
}

interface ScenarioResult {
  scenarioName: string;
  description: string;
  timestamp: string;
  totalRequests: number;
  cacheHitRate: number;
  averageLatency: number;
  cacheHitLatency: number;
  cacheMissLatency: number;
  speedupFactor: number;
  results: CacheTestResult[];
}

const API_BASE = '${API_BASE}';
const SCENARIO_NAME = '${scenario_name}';
const SCENARIO_DESCRIPTION = '${scenario_description}';
const TEST_REQUESTS = ${test_requests};

// Test requests for different scenarios
function generateTestRequests(): CacheTestRequest[] {
  const requests: CacheTestRequest[] = [];

  switch (SCENARIO_NAME) {
    case 'identical':
      // Identical requests - should hit cache after first request
      for (let i = 0; i < TEST_REQUESTS; i++) {
        requests.push({
          bookId: 'test-book',
          query: 'What is the main theme of this work?',
          intent: 'explain'
        });
      }
      break;

    case 'similar':
      // Similar requests - should hit semantic similarity cache
      const similarQueries = [
        'What is the main theme of this work?',
        'What is the primary theme of this book?',
        'What are the central themes?',
        'What is the key theme discussed?',
        'What themes are explored in this text?'
      ];
      for (let i = 0; i < TEST_REQUESTS; i++) {
        requests.push({
          bookId: 'test-book',
          query: similarQueries[i % similarQueries.length],
          intent: 'explain'
        });
      }
      break;

    case 'different':
      // Different requests - should miss cache
      const differentQueries = [
        'Who are the main characters?',
        'When was this written?',
        'What is the historical context?',
        'How does this relate to modern times?',
        'What literary techniques are used?',
        'What is the author\\'s background?',
        'How was this work received?',
        'What influenced the author?',
        'What is the significance of the title?',
        'How does this compare to other works?'
      ];
      for (let i = 0; i < TEST_REQUESTS; i++) {
        requests.push({
          bookId: 'test-book',
          query: differentQueries[i % differentQueries.length],
          intent: 'explain'
        });
      }
      break;

    case 'mixed':
      // Mixed scenario - combination of identical, similar, and different
      for (let i = 0; i < TEST_REQUESTS; i++) {
        if (i % 3 === 0) {
          // Identical
          requests.push({
            bookId: 'test-book',
            query: 'What is the main theme of this work?',
            intent: 'explain'
          });
        } else if (i % 3 === 1) {
          // Similar
          requests.push({
            bookId: 'test-book',
            query: 'What are the primary themes discussed?',
            intent: 'explain'
          });
        } else {
          // Different
          requests.push({
            bookId: 'test-book',
            query: \`What is unique about aspect \${i}?\`,
            intent: 'analyze'
          });
        }
      }
      break;
  }

  return requests;
}

async function executeRequest(request: CacheTestRequest, requestId: number): Promise<CacheTestResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(\`\${API_BASE}/chat/stream\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify(request),
      timeout: 30000
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
    }

    // Check cache headers
    const cacheStatus = response.headers.get('x-cache-status') || 'unknown';
    const cacheHit = cacheStatus.toLowerCase().includes('hit');

    // Get response size
    const responseText = await response.text();
    const responseSize = responseText.length;

    if (\${VERBOSE}) {
      console.log(\`  Request \${requestId}: \${latency}ms (\${cacheStatus})\`);
    }

    return {
      requestId,
      latency,
      cacheHit,
      cacheStatus,
      responseSize,
      success: true
    };

  } catch (error) {
    const latency = Date.now() - startTime;

    console.error(\`  Request \${requestId} failed: \${error.message}\`);

    return {
      requestId,
      latency,
      cacheHit: false,
      cacheStatus: 'error',
      responseSize: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function runCacheTest(): Promise<ScenarioResult> {
  console.log(\`Running cache test: \${SCENARIO_NAME}\`);
  console.log(\`Requests: \${TEST_REQUESTS}\`);

  const requests = generateTestRequests();
  const results: CacheTestResult[] = [];

  // Execute requests sequentially to properly test cache behavior
  for (let i = 0; i < requests.length; i++) {
    const result = await executeRequest(requests[i], i + 1);
    results.push(result);

    // Small delay between requests to allow cache to settle
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Calculate metrics
  const successfulResults = results.filter(r => r.success);
  const cacheHits = successfulResults.filter(r => r.cacheHit);
  const cacheMisses = successfulResults.filter(r => !r.cacheHit);

  const cacheHitRate = successfulResults.length > 0 ? (cacheHits.length / successfulResults.length) * 100 : 0;
  const averageLatency = successfulResults.length > 0 ?
    successfulResults.reduce((sum, r) => sum + r.latency, 0) / successfulResults.length : 0;

  const cacheHitLatency = cacheHits.length > 0 ?
    cacheHits.reduce((sum, r) => sum + r.latency, 0) / cacheHits.length : 0;

  const cacheMissLatency = cacheMisses.length > 0 ?
    cacheMisses.reduce((sum, r) => sum + r.latency, 0) / cacheMisses.length : 0;

  const speedupFactor = cacheHitLatency > 0 && cacheMissLatency > 0 ?
    cacheMissLatency / cacheHitLatency : 1;

  const scenarioResult: ScenarioResult = {
    scenarioName: SCENARIO_NAME,
    description: SCENARIO_DESCRIPTION,
    timestamp: new Date().toISOString(),
    totalRequests: TEST_REQUESTS,
    cacheHitRate,
    averageLatency,
    cacheHitLatency,
    cacheMissLatency,
    speedupFactor,
    results
  };

  return scenarioResult;
}

async function main() {
  try {
    const result = await runCacheTest();

    // Save results
    await fs.promises.writeFile('${results_file}', JSON.stringify(result, null, 2));

    // Output summary
    console.log(\`Cache Hit Rate: \${result.cacheHitRate.toFixed(1)}%\`);
    console.log(\`Average Latency: \${result.averageLatency.toFixed(0)}ms\`);
    console.log(\`Cache Speedup: \${result.speedupFactor.toFixed(1)}x\`);

    // Determine success based on scenario expectations
    let success = false;
    switch (SCENARIO_NAME) {
      case 'identical':
        success = result.cacheHitRate >= 80; // Expect high hit rate for identical requests
        break;
      case 'similar':
        success = result.cacheHitRate >= 50; // Expect moderate hit rate for similar requests
        break;
      case 'different':
        success = result.cacheHitRate <= 20; // Expect low hit rate for different requests
        break;
      case 'mixed':
        success = result.cacheHitRate >= 30 && result.cacheHitRate <= 70; // Expect mixed results
        break;
      default:
        success = true;
    }

    process.exit(success ? 0 : 1);

  } catch (error) {
    console.error('Cache test failed:', error);
    process.exit(1);
  }
}

main();
EOF

    # Execute cache test
    if npx tsx "${RESULTS_DIR}/cache-test-${scenario_name}.ts"; then
        local hit_rate
        hit_rate=$(jq -r '.cacheHitRate' "$results_file" 2>/dev/null || echo "0")

        local speedup
        speedup=$(jq -r '.speedupFactor' "$results_file" 2>/dev/null || echo "1")

        success "✅ $scenario_name: ${hit_rate}% hit rate, ${speedup}x speedup"
        return 0
    else
        error "❌ $scenario_name: Test failed"
        return 1
    fi
}

# Run cache effectiveness tests
run_cache_tests() {
    log "Running cache effectiveness tests..."
    log "Target hit rate: ≥${TARGET_HIT_RATE}%"
    log "Target speedup: ≥${TARGET_SPEEDUP}x"
    echo ""

    # Enable cache
    enable_cache

    # Define test scenarios
    declare -A SCENARIOS=(
        ["identical"]="Identical requests (expect high hit rate)"
        ["similar"]="Similar requests (expect semantic cache hits)"
        ["different"]="Different requests (expect cache misses)"
        ["mixed"]="Mixed scenario (expect balanced cache behavior)"
    )

    local scenario_results=()
    local passed_scenarios=0
    local total_scenarios=0

    # Test each scenario
    for scenario in "${!SCENARIOS[@]}"; do
        local description="${SCENARIOS[$scenario]}"
        local scenario_file="${RESULTS_DIR}/scenario_${scenario}_${TIMESTAMP}.json"

        ((total_scenarios++))

        if test_cache_scenario "$scenario" "$description" "$CACHE_TEST_REQUESTS" "$scenario_file"; then
            ((passed_scenarios++))
        fi

        scenario_results+=("$scenario_file")
    done

    # Generate combined results
    local combined_file="${RESULTS_DIR}/cache_effectiveness_${TIMESTAMP}.json"
    combine_cache_results "${scenario_results[@]}" > "$combined_file"

    # Analyze overall cache effectiveness
    analyze_cache_effectiveness "$combined_file"
}

# Combine scenario results
combine_cache_results() {
    local files=("$@")

    echo '{'
    echo '  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",'
    echo '  "targetHitRate": '$TARGET_HIT_RATE','
    echo '  "targetSpeedup": '$TARGET_SPEEDUP','
    echo '  "cacheConfiguration": "enabled",'
    echo '  "scenarios": ['

    local first=true
    for file in "${files[@]}"; do
        if [[ -f "$file" ]]; then
            if [[ "$first" == "true" ]]; then
                first=false
            else
                echo ','
            fi
            cat "$file" | jq '.' | sed 's/^/    /'
        fi
    done

    echo ''
    echo '  ],'

    # Calculate overall statistics
    local total_hit_rate=0
    local total_speedup=0
    local total_scenarios=0

    for file in "${files[@]}"; do
        if [[ -f "$file" ]]; then
            local hit_rate
            hit_rate=$(jq -r '.cacheHitRate' "$file" 2>/dev/null || echo "0")
            local speedup
            speedup=$(jq -r '.speedupFactor' "$file" 2>/dev/null || echo "1")

            total_hit_rate=$(echo "$total_hit_rate + $hit_rate" | bc)
            total_speedup=$(echo "$total_speedup + $speedup" | bc)
            ((total_scenarios++))
        fi
    done

    local avg_hit_rate=0
    local avg_speedup=1
    if [[ $total_scenarios -gt 0 ]]; then
        avg_hit_rate=$(echo "scale=2; $total_hit_rate / $total_scenarios" | bc)
        avg_speedup=$(echo "scale=2; $total_speedup / $total_scenarios" | bc)
    fi

    echo '  "summary": {'
    echo '    "totalScenarios": '$total_scenarios','
    echo '    "averageHitRate": '$avg_hit_rate','
    echo '    "averageSpeedup": '$avg_speedup','
    echo '    "hitRateTarget": '$(if (( $(echo "$avg_hit_rate >= $TARGET_HIT_RATE" | bc -l) )); then echo "true"; else echo "false"; fi)','
    echo '    "speedupTarget": '$(if (( $(echo "$avg_speedup >= $TARGET_SPEEDUP" | bc -l) )); then echo "true"; else echo "false"; fi)
    echo '  }'
    echo '}'
}

# Analyze cache effectiveness
analyze_cache_effectiveness() {
    local results_file="$1"

    log "Analyzing cache effectiveness..."

    local avg_hit_rate
    avg_hit_rate=$(jq -r '.summary.averageHitRate' "$results_file")

    local avg_speedup
    avg_speedup=$(jq -r '.summary.averageSpeedup' "$results_file")

    local hit_rate_target
    hit_rate_target=$(jq -r '.summary.hitRateTarget' "$results_file")

    local speedup_target
    speedup_target=$(jq -r '.summary.speedupTarget' "$results_file")

    echo ""
    echo "================================="
    echo "CACHE EFFECTIVENESS ANALYSIS"
    echo "================================="

    # Overall metrics
    cache "OVERALL METRICS:"
    printf "  Average Hit Rate: %.1f%% (Target: ≥%d%%)\n" "$avg_hit_rate" "$TARGET_HIT_RATE"
    printf "  Average Speedup: %.1fx (Target: ≥%.1fx)\n" "$avg_speedup" "$TARGET_SPEEDUP"

    # Individual scenario results
    echo ""
    cache "SCENARIO RESULTS:"
    jq -r '.scenarios[] | "  \(.scenarioName): \(.cacheHitRate | . * 10 | round | . / 10)% hit rate, \(.speedupFactor | . * 10 | round | . / 10)x speedup"' "$results_file"

    # Target achievement
    echo ""
    echo "================================="
    echo "TARGET ACHIEVEMENT"
    echo "================================="

    if [[ "$hit_rate_target" == "true" ]]; then
        success "✅ Cache Hit Rate Target: ACHIEVED (≥${TARGET_HIT_RATE}%)"
    else
        warn "❌ Cache Hit Rate Target: NOT MET (<${TARGET_HIT_RATE}%)"
    fi

    if [[ "$speedup_target" == "true" ]]; then
        success "✅ Cache Speedup Target: ACHIEVED (≥${TARGET_SPEEDUP}x)"
    else
        warn "❌ Cache Speedup Target: NOT MET (<${TARGET_SPEEDUP}x)"
    fi

    echo ""
    if [[ "$hit_rate_target" == "true" && "$speedup_target" == "true" ]]; then
        success "🎉 CACHE OPTIMIZATION SUCCESSFUL!"
        echo "  ✅ Both cache targets achieved"
        echo "  ✅ Significant performance improvement from caching"
        echo "  📊 Average Hit Rate: ${avg_hit_rate}%"
        echo "  📊 Average Speedup: ${avg_speedup}x"
        return 0
    else
        warn "⚠️  CACHE OPTIMIZATION NEEDS IMPROVEMENT"
        echo ""
        echo "Issues identified:"
        if [[ "$hit_rate_target" != "true" ]]; then
            echo "  • Cache hit rate below target (${avg_hit_rate}% < ${TARGET_HIT_RATE}%)"
        fi
        if [[ "$speedup_target" != "true" ]]; then
            echo "  • Cache speedup below target (${avg_speedup}x < ${TARGET_SPEEDUP}x)"
        fi
        echo ""
        echo "Recommendations:"
        echo "  • Review cache configuration parameters"
        echo "  • Adjust semantic similarity thresholds"
        echo "  • Optimize cache storage and retrieval"
        return 1
    fi
}

# Run cache stress test
run_cache_stress_test() {
    if [[ "$INCLUDE_STRESS_TEST" != "true" ]]; then
        return 0
    fi

    log "Running cache stress test..."
    log "Concurrent requests: $CONCURRENT_REQUESTS"

    # Create stress test script
    cat > "${RESULTS_DIR}/cache-stress-test.ts" << EOF
import fetch from 'node-fetch';
import fs from 'fs';

interface StressTestResult {
  concurrentRequests: number;
  totalRequests: number;
  successfulRequests: number;
  averageLatency: number;
  p95Latency: number;
  cacheHitRate: number;
  errorRate: number;
}

const API_BASE = '${API_BASE}';
const CONCURRENT_REQUESTS = ${CONCURRENT_REQUESTS};
const REQUESTS_PER_THREAD = 5;

async function executeStressTest(): Promise<StressTestResult> {
  console.log(\`Starting stress test with \${CONCURRENT_REQUESTS} concurrent threads\`);

  const promises: Promise<any>[] = [];

  // Create concurrent request threads
  for (let thread = 0; thread < CONCURRENT_REQUESTS; thread++) {
    const threadPromise = (async () => {
      const results = [];

      for (let i = 0; i < REQUESTS_PER_THREAD; i++) {
        const startTime = Date.now();

        try {
          const response = await fetch(\`\${API_BASE}/chat/stream\`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer test-token'
            },
            body: JSON.stringify({
              bookId: 'stress-test',
              query: \`Stress test query \${thread}-\${i}\`,
              intent: 'explain'
            }),
            timeout: 10000
          });

          const latency = Date.now() - startTime;
          const cacheStatus = response.headers.get('x-cache-status') || 'unknown';
          const cacheHit = cacheStatus.toLowerCase().includes('hit');

          results.push({
            latency,
            cacheHit,
            success: response.ok,
            status: response.status
          });

        } catch (error) {
          const latency = Date.now() - startTime;
          results.push({
            latency,
            cacheHit: false,
            success: false,
            error: error.message
          });
        }
      }

      return results;
    })();

    promises.push(threadPromise);
  }

  // Wait for all threads to complete
  const allResults = await Promise.all(promises);
  const flatResults = allResults.flat();

  // Calculate metrics
  const totalRequests = flatResults.length;
  const successfulRequests = flatResults.filter(r => r.success).length;
  const cacheHits = flatResults.filter(r => r.cacheHit).length;

  const latencies = flatResults.filter(r => r.success).map(r => r.latency);
  const averageLatency = latencies.length > 0 ?
    latencies.reduce((sum, l) => sum + l, 0) / latencies.length : 0;

  // Calculate P95 latency
  latencies.sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);
  const p95Latency = latencies.length > 0 ? latencies[p95Index] : 0;

  const cacheHitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;
  const errorRate = totalRequests > 0 ? ((totalRequests - successfulRequests) / totalRequests) * 100 : 0;

  return {
    concurrentRequests: CONCURRENT_REQUESTS,
    totalRequests,
    successfulRequests,
    averageLatency,
    p95Latency,
    cacheHitRate,
    errorRate
  };
}

async function main() {
  try {
    const result = await executeStressTest();

    // Save results
    await fs.promises.writeFile('${RESULTS_DIR}/stress_test_${TIMESTAMP}.json', JSON.stringify(result, null, 2));

    console.log(\`Stress Test Results:\`);
    console.log(\`  Total Requests: \${result.totalRequests}\`);
    console.log(\`  Successful: \${result.successfulRequests}\`);
    console.log(\`  Average Latency: \${result.averageLatency.toFixed(0)}ms\`);
    console.log(\`  P95 Latency: \${result.p95Latency.toFixed(0)}ms\`);
    console.log(\`  Cache Hit Rate: \${result.cacheHitRate.toFixed(1)}%\`);
    console.log(\`  Error Rate: \${result.errorRate.toFixed(1)}%\`);

    // Success criteria: <5% error rate and reasonable latency
    const success = result.errorRate < 5 && result.p95Latency < 5000;
    process.exit(success ? 0 : 1);

  } catch (error) {
    console.error('Stress test failed:', error);
    process.exit(1);
  }
}

main();
EOF

    if npx tsx "${RESULTS_DIR}/cache-stress-test.ts"; then
        success "✅ Cache stress test passed"
    else
        warn "⚠️  Cache stress test failed"
    fi
}

# Export cache test results
export_cache_results() {
    if [[ "$EXPORT_RESULTS" != "true" ]]; then
        return 0
    fi

    log "Exporting cache test results..."

    local combined_file="${RESULTS_DIR}/cache_effectiveness_${TIMESTAMP}.json"
    local export_file="${RESULTS_DIR}/cache_report_${TIMESTAMP}.${EXPORT_FORMAT}"

    case "$EXPORT_FORMAT" in
        "json")
            cp "$combined_file" "$export_file"
            ;;
        "csv")
            export_cache_csv "$combined_file" "$export_file"
            ;;
        "markdown")
            export_cache_markdown "$combined_file" "$export_file"
            ;;
        *)
            error "Unknown export format: $EXPORT_FORMAT"
            return 1
            ;;
    esac

    success "Cache test results exported: $export_file"
}

# Export CSV format
export_cache_csv() {
    local input_file="$1"
    local output_file="$2"

    {
        echo "scenario,description,hitRate,averageLatency,speedupFactor,targetHitRate,targetSpeedup"
        jq -r '.scenarios[] | [.scenarioName, .description, .cacheHitRate, .averageLatency, .speedupFactor, .targetHitRate, .targetSpeedup] | @csv' "$input_file"
    } > "$output_file"
}

# Export Markdown format
export_cache_markdown() {
    local input_file="$1"
    local output_file="$2"

    cat > "$output_file" << EOF
# Cache Effectiveness Test Results

**Generated:** $(date)
**Target Hit Rate:** $(jq -r '.targetHitRate' "$input_file")%
**Target Speedup:** $(jq -r '.targetSpeedup' "$input_file")x

## Summary

$(jq -r '.summary | "- **Average Hit Rate:** \(.averageHitRate)%\n- **Average Speedup:** \(.averageSpeedup)x\n- **Hit Rate Target:** " + (if .hitRateTarget then "✅ ACHIEVED" else "❌ NOT MET" end) + "\n- **Speedup Target:** " + (if .speedupTarget then "✅ ACHIEVED" else "❌ NOT MET" end)' "$input_file")

## Scenario Results

| Scenario | Description | Hit Rate | Speedup | Requests |
|----------|-------------|----------|---------|----------|
$(jq -r '.scenarios[] | "| \(.scenarioName) | \(.description) | \(.cacheHitRate)% | \(.speedupFactor)x | \(.totalRequests) |"' "$input_file")

## Performance Analysis

$(jq -r '
if .summary.hitRateTarget and .summary.speedupTarget then
    "✅ **CACHE OPTIMIZATION SUCCESSFUL**\n\nThe intelligent response caching system is performing effectively:\n- Cache hit rates meet or exceed targets\n- Significant latency improvements achieved\n- Performance optimizations are working as designed"
else
    "⚠️ **CACHE OPTIMIZATION NEEDS IMPROVEMENT**\n\nThe caching system requires optimization:\n" +
    (if .summary.hitRateTarget | not then "- Cache hit rate below target (" + (.summary.averageHitRate | tostring) + "% < " + (.targetHitRate | tostring) + "%)\n" else "" end) +
    (if .summary.speedupTarget | not then "- Cache speedup below target (" + (.summary.averageSpeedup | tostring) + "x < " + (.targetSpeedup | tostring) + "x)\n" else "" end) +
    "\nRecommendations:\n- Review cache configuration parameters\n- Adjust semantic similarity thresholds\n- Optimize cache key generation\n- Consider cache prewarming strategies"
end
' "$input_file")

## Detailed Results

$(jq -r '.scenarios[] | "### \(.scenarioName | ascii_upcase) Scenario\n\n**Description:** \(.description)\n\n- **Cache Hit Rate:** \(.cacheHitRate)%\n- **Average Latency:** \(.averageLatency)ms\n- **Cache Hit Latency:** \(.cacheHitLatency)ms\n- **Cache Miss Latency:** \(.cacheMissLatency)ms\n- **Speedup Factor:** \(.speedupFactor)x\n- **Total Requests:** \(.totalRequests)\n"' "$input_file")

## Recommendations

$(jq -r '
if .summary.hitRateTarget and .summary.speedupTarget then
    "### ✅ Proceed with Cache Optimization\n\n1. **Deploy cache configuration** to production\n2. **Monitor cache metrics** continuously\n3. **Tune cache parameters** based on production usage\n4. **Consider cache prewarming** for common queries"
else
    "### ⚠️ Optimize Cache Configuration\n\n1. **Review cache settings** and thresholds\n2. **Adjust semantic similarity** parameters\n3. **Optimize cache key generation** strategy\n4. **Test with different TTL values**\n5. **Consider cache warming** strategies"
end
' "$input_file")

---
*Generated by FlowReader Cache Effectiveness Testing Framework*
EOF
}

# Main execution function
main() {
    echo "FlowReader Cache Effectiveness Testing"
    echo "====================================="
    echo ""

    # Parse arguments
    parse_args "$@"

    # Show configuration
    log "Cache Testing Configuration:"
    log "  API Base: $API_BASE"
    log "  Cache Test Requests: $CACHE_TEST_REQUESTS per scenario"
    log "  Target Hit Rate: ≥${TARGET_HIT_RATE}%"
    log "  Target Speedup: ≥${TARGET_SPEEDUP}x"
    log "  Include Stress Test: $INCLUDE_STRESS_TEST"
    echo ""

    # Validate environment
    validate_environment

    # Run cache effectiveness tests
    if run_cache_tests; then
        # Run stress test if requested
        run_cache_stress_test

        # Export results if requested
        export_cache_results

        success "🎉 Cache effectiveness testing SUCCESSFUL!"
        echo ""
        echo "Results saved to: ${RESULTS_DIR}/"
        exit 0
    else
        # Export results even on failure for analysis
        export_cache_results

        warn "⚠️  Cache effectiveness testing revealed issues"
        echo ""
        echo "Analysis saved to: ${RESULTS_DIR}/"
        echo "Review cache configuration and consider optimizations"
        exit 1
    fi
}

# Handle script interruption
trap 'error "Cache testing interrupted"; exit 130' INT

# Execute main function
main "$@"