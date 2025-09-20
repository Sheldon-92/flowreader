# FlowReader Performance Troubleshooting Guide

## Overview

This guide provides comprehensive troubleshooting procedures for FlowReader's performance optimization system. It covers common issues, diagnostic procedures, resolution steps, and preventive measures to maintain optimal performance.

## Table of Contents
- [Common Performance Issues](#common-performance-issues)
- [Diagnostic Procedures](#diagnostic-procedures)
- [Issue Resolution Workflows](#issue-resolution-workflows)
- [Cache-Related Issues](#cache-related-issues)
- [Quality Regression Issues](#quality-regression-issues)
- [Cost and Token Issues](#cost-and-token-issues)
- [Emergency Procedures](#emergency-procedures)

## Common Performance Issues

### High Latency Issues

#### Symptoms
- P95 latency >2000ms consistently
- Response times slower than baseline
- User complaints about slow responses
- Timeout errors increasing

#### Quick Diagnostic Commands
```bash
# Check current performance metrics
./scripts/measure-perf-cost.sh --endpoint chat/stream --samples 10 --quick

# Monitor real-time latency
./scripts/monitor-performance.sh --interval 10 --duration 300

# Check system resource usage
./scripts/check-system-resources.sh

# Analyze latency distribution
./scripts/analyze-latency-distribution.sh --last 1h
```

#### Common Causes and Solutions

**Cause: Cache Miss Rate Too High**
```bash
# Diagnosis
./scripts/check-cache-performance.sh

# Solutions
# 1. Increase cache TTL
export CACHE_TTL_MINUTES=30

# 2. Optimize cache key generation
./scripts/optimize-cache-keys.sh

# 3. Warm up cache with popular content
./scripts/warmup-cache.sh --popular-content

# 4. Increase cache size
export CACHE_SIZE=200
```

**Cause: Token Processing Overhead**
```bash
# Diagnosis
./scripts/analyze-token-processing-time.sh

# Solutions
# 1. Reduce context token limits
export MAX_CONTEXT_TOKENS=1200

# 2. Increase similarity threshold (more aggressive pruning)
export SIMILARITY_THRESHOLD=0.8

# 3. Reduce Top-K selection
export TOP_K_FINAL=2
```

**Cause: Model Response Time Issues**
```bash
# Diagnosis
./scripts/analyze-model-response-times.sh

# Solutions
# 1. Increase GPT-3.5 fallback usage
export FALLBACK_TO_GPT35=true

# 2. Adjust model selection thresholds
./scripts/adjust-model-selection.sh --prefer-fast

# 3. Enable early stopping
export EARLY_STOPPING_CONFIDENCE=0.85
```

### Token Usage Spikes

#### Symptoms
- Token consumption >115% of baseline
- Unexpected cost increases
- Token limit warnings
- Optimization effectiveness reduced

#### Quick Diagnostic Commands
```bash
# Check token usage patterns
./scripts/analyze-token-usage.sh --last 24h

# Monitor token consumption by intent
./scripts/monitor-tokens-by-intent.sh

# Check optimization effectiveness
./scripts/check-optimization-effectiveness.sh

# Analyze token distribution
./scripts/analyze-token-distribution.sh --detailed
```

#### Common Causes and Solutions

**Cause: Context Pruning Not Working**
```bash
# Diagnosis
./scripts/debug-context-pruning.sh

# Check if pruning is enabled
echo "Context pruning enabled: $ENABLE_CONTEXT_PRUNING"

# Solutions
# 1. Verify configuration
./scripts/verify-pruning-config.sh

# 2. Increase similarity threshold
export SIMILARITY_THRESHOLD=0.8

# 3. Lower relevance threshold
export RELEVANCE_THRESHOLD=0.75

# 4. Restart pruning service
./scripts/restart-context-pruning.sh
```

**Cause: Ineffective Prompt Optimization**
```bash
# Diagnosis
./scripts/debug-prompt-optimization.sh

# Solutions
# 1. Enable more aggressive prompt reduction
export PROMPT_OPTIMIZATION_LEVEL=aggressive

# 2. Reduce max prompt lengths
export MAX_SYSTEM_PROMPT_LENGTH=400
export MAX_USER_PROMPT_LENGTH=800

# 3. Enable redundancy removal
export REMOVE_REDUNDANT_INSTRUCTIONS=true
```

**Cause: Large Input Documents**
```bash
# Diagnosis
./scripts/analyze-input-sizes.sh

# Solutions
# 1. Implement input size limits
export MAX_INPUT_SIZE=5000

# 2. Add input chunking
./scripts/enable-input-chunking.sh

# 3. Improve document summarization
./scripts/optimize-document-summarization.sh
```

### Quality Regression Issues

#### Symptoms
- Quality score <80%
- User satisfaction declining
- Accuracy metrics dropping
- Relevance scores low

#### Quick Diagnostic Commands
```bash
# Run quality assessment
npx tsx api/_spikes/knowledge-quality-mock-test.ts

# Check quality trends
./scripts/analyze-quality-trends.sh --last 7d

# Compare with baseline
./scripts/compare-quality-baseline.sh

# Analyze quality by intent type
./scripts/analyze-quality-by-intent.sh
```

#### Common Causes and Solutions

**Cause: Overly Aggressive Token Pruning**
```bash
# Diagnosis
./scripts/debug-token-pruning-quality.sh

# Solutions
# 1. Reduce similarity threshold (less aggressive)
export SIMILARITY_THRESHOLD=0.7

# 2. Lower relevance threshold
export RELEVANCE_THRESHOLD=0.65

# 3. Increase context token limits
export MAX_CONTEXT_TOKENS=1700

# 4. Disable semantic deduplication temporarily
export SEMANTIC_DEDUPLICATION=false
```

**Cause: Poor Model Selection**
```bash
# Diagnosis
./scripts/analyze-model-selection-quality.sh

# Solutions
# 1. Increase GPT-4 usage for complex tasks
./scripts/adjust-model-thresholds.sh --favor-quality

# 2. Disable cost optimization temporarily
export COST_OPTIMIZED_ROUTING=false

# 3. Review intent classification
./scripts/review-intent-classification.sh
```

**Cause: Cache Serving Stale Content**
```bash
# Diagnosis
./scripts/analyze-cache-quality.sh

# Solutions
# 1. Reduce cache TTL
export CACHE_TTL_MINUTES=10

# 2. Increase semantic similarity threshold
export SEMANTIC_SIMILARITY_THRESHOLD=0.98

# 3. Clear potentially stale cache entries
./scripts/clear-stale-cache.sh --threshold 0.95
```

## Diagnostic Procedures

### Performance Health Assessment

#### Comprehensive System Check
```bash
#!/bin/bash
# comprehensive-performance-diagnosis.sh

echo "🔍 Starting comprehensive performance diagnosis..."

# Step 1: System Resource Check
echo "=== System Resources ==="
./scripts/check-system-resources.sh
./scripts/check-memory-usage.sh
./scripts/check-cpu-usage.sh

# Step 2: Performance Metrics
echo "=== Performance Metrics ==="
./scripts/measure-perf-cost.sh --endpoint chat/stream --samples 20

# Step 3: Cache Analysis
echo "=== Cache Analysis ==="
./scripts/analyze-cache-performance.sh
./scripts/check-cache-memory.sh
./scripts/analyze-cache-hit-patterns.sh

# Step 4: Optimization Status
echo "=== Optimization Status ==="
./scripts/check-optimization-status.sh
./scripts/validate-optimization-config.sh

# Step 5: Quality Assessment
echo "=== Quality Assessment ==="
npx tsx api/_spikes/knowledge-quality-mock-test.ts

# Step 6: Error Analysis
echo "=== Error Analysis ==="
./scripts/analyze-error-logs.sh --last 24h
./scripts/check-error-rates.sh

# Step 7: Generate Report
./scripts/generate-diagnostic-report.sh --comprehensive
```

#### Real-time Performance Monitoring
```bash
#!/bin/bash
# real-time-diagnosis.sh

echo "📊 Starting real-time performance monitoring for diagnosis..."

# Monitor key metrics every 10 seconds for 10 minutes
./scripts/monitor-performance.sh --interval 10 --duration 600 --verbose

# Parallel monitoring of specific components
./scripts/monitor-cache-performance.sh --interval 10 --duration 600 &
./scripts/monitor-token-usage.sh --interval 10 --duration 600 &
./scripts/monitor-quality-scores.sh --interval 30 --duration 600 &
./scripts/monitor-error-rates.sh --interval 10 --duration 600 &

wait
echo "✅ Real-time monitoring completed"
```

### Performance Profiling

#### Latency Breakdown Analysis
```bash
#!/bin/bash
# analyze-latency-breakdown.sh

echo "🔬 Analyzing latency breakdown..."

# Enable detailed timing
export ENABLE_DETAILED_TIMING=true

# Run performance test with timing
./scripts/measure-perf-cost.sh \
    --endpoint chat/stream \
    --samples 50 \
    --detailed-timing \
    --output /tmp/latency-breakdown.json

# Analyze timing components
python3 << 'EOF'
import json
import numpy as np

with open('/tmp/latency-breakdown.json') as f:
    data = json.load(f)

timings = data['detailed_timings']

print("Latency Breakdown Analysis:")
print("=" * 40)
print(f"RAG Processing: {np.mean([t['rag_processing'] for t in timings]):.0f}ms")
print(f"Context Pruning: {np.mean([t['context_pruning'] for t in timings]):.0f}ms")
print(f"Prompt Generation: {np.mean([t['prompt_generation'] for t in timings]):.0f}ms")
print(f"Model Inference: {np.mean([t['model_inference'] for t in timings]):.0f}ms")
print(f"Response Processing: {np.mean([t['response_processing'] for t in timings]):.0f}ms")
print(f"Cache Operations: {np.mean([t['cache_operations'] for t in timings]):.0f}ms")

# Identify bottlenecks
components = ['rag_processing', 'context_pruning', 'prompt_generation',
              'model_inference', 'response_processing', 'cache_operations']
avg_times = [np.mean([t[comp] for t in timings]) for comp in components]
bottleneck = components[np.argmax(avg_times)]

print(f"\nBottleneck identified: {bottleneck} ({max(avg_times):.0f}ms)")
EOF
```

#### Token Usage Analysis
```bash
#!/bin/bash
# analyze-token-usage-patterns.sh

echo "🔢 Analyzing token usage patterns..."

# Collect detailed token usage data
./scripts/collect-token-data.sh \
    --duration 24h \
    --include-breakdown \
    --output /tmp/token-analysis.json

# Analyze patterns
python3 << 'EOF'
import json
import numpy as np
from collections import defaultdict

with open('/tmp/token-analysis.json') as f:
    data = json.load(f)

# Analyze by intent type
by_intent = defaultdict(list)
for request in data['requests']:
    intent = request.get('intent', 'unknown')
    by_intent[intent].append(request['total_tokens'])

print("Token Usage by Intent:")
print("=" * 30)
for intent, tokens in by_intent.items():
    print(f"{intent}: {np.mean(tokens):.1f} ± {np.std(tokens):.1f} tokens")

# Analyze optimization effectiveness
original_tokens = [r['original_tokens'] for r in data['requests'] if 'original_tokens' in r]
optimized_tokens = [r['total_tokens'] for r in data['requests'] if 'original_tokens' in r]

if original_tokens:
    reduction = (1 - np.mean(optimized_tokens) / np.mean(original_tokens)) * 100
    print(f"\nToken Reduction: {reduction:.1f}%")

    # Identify ineffective optimizations
    ineffective = [i for i, (o, op) in enumerate(zip(original_tokens, optimized_tokens))
                   if op >= o * 0.95]  # Less than 5% reduction

    print(f"Ineffective optimizations: {len(ineffective)}/{len(original_tokens)} requests")
EOF
```

## Issue Resolution Workflows

### High Latency Resolution Workflow

#### Step-by-Step Resolution
```bash
#!/bin/bash
# resolve-high-latency.sh

ISSUE_ID="$1"
SEVERITY="$2"  # critical, high, medium

echo "🚨 Resolving high latency issue: $ISSUE_ID (Severity: $SEVERITY)"

# Step 1: Immediate Assessment
echo "Step 1: Immediate Assessment"
CURRENT_P95=$(./scripts/get-current-p95.sh)
echo "Current P95 latency: ${CURRENT_P95}ms"

if (( $(echo "$CURRENT_P95 > 2500" | bc -l) )); then
    echo "CRITICAL: Immediate action required"
    SEVERITY="critical"
fi

# Step 2: Quick Fixes Based on Severity
echo "Step 2: Applying quick fixes"
case "$SEVERITY" in
    "critical")
        # Emergency cache optimization
        ./scripts/emergency-cache-optimization.sh

        # Aggressive token reduction
        export MAX_CONTEXT_TOKENS=1000
        export MAX_RESPONSE_TOKENS=300

        # Force GPT-3.5 usage
        export FORCE_GPT35=true
        ;;
    "high")
        # Optimize cache settings
        ./scripts/optimize-cache-settings.sh --aggressive

        # Increase cache TTL
        export CACHE_TTL_MINUTES=30
        ;;
    "medium")
        # Standard optimization adjustments
        ./scripts/adjust-optimization-parameters.sh --latency-focus
        ;;
esac

# Step 3: Monitor Improvement
echo "Step 3: Monitoring improvement"
./scripts/monitor-performance.sh --interval 30 --duration 600 --alert-on-improvement

# Step 4: Root Cause Analysis
echo "Step 4: Root cause analysis"
./scripts/analyze-latency-root-cause.sh --issue-id "$ISSUE_ID"

# Step 5: Permanent Fix Implementation
echo "Step 5: Implementing permanent fixes"
ROOT_CAUSE=$(./scripts/get-root-cause.sh --issue-id "$ISSUE_ID")

case "$ROOT_CAUSE" in
    "cache_misses")
        ./scripts/implement-cache-improvements.sh
        ;;
    "token_processing")
        ./scripts/implement-token-optimizations.sh
        ;;
    "model_selection")
        ./scripts/implement-model-optimizations.sh
        ;;
    *)
        echo "Unknown root cause: $ROOT_CAUSE"
        ./scripts/escalate-issue.sh --issue-id "$ISSUE_ID"
        ;;
esac

# Step 6: Validation
echo "Step 6: Validating resolution"
./scripts/validate-latency-fix.sh --issue-id "$ISSUE_ID"

echo "✅ High latency resolution workflow completed"
```

### Token Usage Spike Resolution

#### Automated Resolution Workflow
```bash
#!/bin/bash
# resolve-token-spike.sh

SPIKE_THRESHOLD="$1"  # Percentage increase from baseline
DURATION="$2"         # How long the spike has been occurring

echo "🔢 Resolving token usage spike: +${SPIKE_THRESHOLD}% for ${DURATION}"

# Step 1: Immediate Analysis
echo "Step 1: Analyzing token spike"
./scripts/analyze-token-spike.sh --threshold "$SPIKE_THRESHOLD" --duration "$DURATION"

# Step 2: Quick Mitigation
echo "Step 2: Implementing quick mitigation"
if (( $(echo "$SPIKE_THRESHOLD > 50" | bc -l) )); then
    # Emergency token reduction
    export MAX_CONTEXT_TOKENS=1200
    export MAX_RESPONSE_TOKENS=350
    export SIMILARITY_THRESHOLD=0.8
    export TOP_K_FINAL=2
    echo "Emergency token limits applied"
fi

# Step 3: Identify Spike Source
echo "Step 3: Identifying spike source"
SPIKE_SOURCE=$(./scripts/identify-token-spike-source.sh)

case "$SPIKE_SOURCE" in
    "large_inputs")
        ./scripts/implement-input-size-limits.sh
        ./scripts/enable-input-chunking.sh
        ;;
    "ineffective_pruning")
        ./scripts/tune-pruning-parameters.sh --aggressive
        export SIMILARITY_THRESHOLD=0.85
        ;;
    "prompt_inflation")
        ./scripts/audit-prompt-templates.sh
        ./scripts/optimize-prompt-templates.sh --aggressive
        ;;
    "intent_misclassification")
        ./scripts/review-intent-classification.sh
        ./scripts/retrain-intent-classifier.sh
        ;;
esac

# Step 4: Monitor Recovery
echo "Step 4: Monitoring token usage recovery"
./scripts/monitor-token-recovery.sh --duration 1800

# Step 5: Adjust and Fine-tune
echo "Step 5: Fine-tuning parameters"
./scripts/fine-tune-token-parameters.sh --target-reduction 21.6

echo "✅ Token spike resolution completed"
```

### Quality Regression Resolution

#### Quality Recovery Workflow
```bash
#!/bin/bash
# resolve-quality-regression.sh

QUALITY_DROP="$1"     # Percentage drop from baseline
AFFECTED_INTENTS="$2" # Comma-separated list of affected intents

echo "📉 Resolving quality regression: -${QUALITY_DROP}% affecting: $AFFECTED_INTENTS"

# Step 1: Emergency Quality Assessment
echo "Step 1: Emergency quality assessment"
./scripts/emergency-quality-assessment.sh --affected-intents "$AFFECTED_INTENTS"

# Step 2: Immediate Rollback Decision
echo "Step 2: Evaluating rollback necessity"
if (( $(echo "$QUALITY_DROP > 10" | bc -l) )); then
    echo "CRITICAL: Quality drop >10%, initiating partial rollback"
    ./scripts/partial-optimization-rollback.sh --quality-focused
fi

# Step 3: Identify Regression Cause
echo "Step 3: Identifying regression cause"
REGRESSION_CAUSE=$(./scripts/identify-quality-regression-cause.sh --drop "$QUALITY_DROP")

case "$REGRESSION_CAUSE" in
    "aggressive_pruning")
        # Reduce pruning aggressiveness
        export SIMILARITY_THRESHOLD=0.7
        export RELEVANCE_THRESHOLD=0.65
        export MAX_CONTEXT_TOKENS=1700
        ;;
    "poor_model_selection")
        # Favor quality over cost
        export COST_OPTIMIZED_ROUTING=false
        ./scripts/adjust-model-thresholds.sh --favor-quality
        ;;
    "cache_staleness")
        # Refresh cache with quality focus
        ./scripts/refresh-cache.sh --quality-focused
        export SEMANTIC_SIMILARITY_THRESHOLD=0.98
        ;;
    "prompt_over_optimization")
        # Restore more detailed prompts
        ./scripts/restore-detailed-prompts.sh --affected-intents "$AFFECTED_INTENTS"
        ;;
esac

# Step 4: Gradual Recovery
echo "Step 4: Implementing gradual quality recovery"
./scripts/gradual-quality-recovery.sh --target-quality 84.1 --affected-intents "$AFFECTED_INTENTS"

# Step 5: Validation and Monitoring
echo "Step 5: Validating quality recovery"
./scripts/validate-quality-recovery.sh --affected-intents "$AFFECTED_INTENTS" --monitor-duration 3600

echo "✅ Quality regression resolution completed"
```

## Cache-Related Issues

### Cache Performance Problems

#### Cache Hit Rate Too Low
```bash
# Diagnosis
./scripts/analyze-cache-hit-patterns.sh
./scripts/check-cache-key-effectiveness.sh

# Solutions
# 1. Optimize cache key generation
./scripts/optimize-cache-keys.sh --semantic-similarity

# 2. Increase cache size
export CACHE_SIZE=200

# 3. Extend cache TTL
export CACHE_TTL_MINUTES=30

# 4. Improve semantic similarity matching
export SEMANTIC_SIMILARITY_THRESHOLD=0.92

# 5. Pre-populate cache with common queries
./scripts/warmup-cache.sh --popular-queries
```

#### Cache Memory Issues
```bash
# Diagnosis
./scripts/check-cache-memory-usage.sh
./scripts/analyze-cache-eviction-patterns.sh

# Solutions
# 1. Implement more aggressive eviction
./scripts/tune-cache-eviction.sh --aggressive

# 2. Reduce cache item size
./scripts/optimize-cache-item-size.sh

# 3. Implement cache compression
export ENABLE_CACHE_COMPRESSION=true

# 4. Monitor and alert on memory usage
./scripts/setup-cache-memory-alerts.sh
```

#### Cache Staleness Issues
```bash
# Diagnosis
./scripts/detect-stale-cache-entries.sh
./scripts/analyze-cache-freshness.sh

# Solutions
# 1. Reduce TTL for dynamic content
./scripts/implement-dynamic-ttl.sh

# 2. Implement cache invalidation
./scripts/setup-cache-invalidation.sh --content-based

# 3. Add cache versioning
./scripts/implement-cache-versioning.sh

# 4. Monitor cache quality
./scripts/monitor-cache-quality.sh --interval 300
```

## Quality Regression Issues

### Quality Monitoring and Recovery

#### Continuous Quality Monitoring
```bash
#!/bin/bash
# continuous-quality-monitoring.sh

echo "📊 Starting continuous quality monitoring..."

while true; do
    # Run quality assessment
    QUALITY_SCORE=$(npx tsx api/_spikes/knowledge-quality-mock-test.ts | jq -r '.overall_quality')

    # Check against threshold
    if (( $(echo "$QUALITY_SCORE < 80" | bc -l) )); then
        echo "⚠️ Quality below threshold: ${QUALITY_SCORE}%"
        ./scripts/quality-regression-alert.sh --score "$QUALITY_SCORE"

        # Trigger automatic recovery if severe
        if (( $(echo "$QUALITY_SCORE < 75" | bc -l) )); then
            ./scripts/automatic-quality-recovery.sh --score "$QUALITY_SCORE"
        fi
    fi

    # Log quality score
    echo "$(date): Quality Score: ${QUALITY_SCORE}%" >> /var/log/quality-monitoring.log

    # Wait 5 minutes
    sleep 300
done
```

#### Automatic Quality Recovery
```bash
#!/bin/bash
# automatic-quality-recovery.sh

CURRENT_QUALITY="$1"
TARGET_QUALITY="80"

echo "🔧 Starting automatic quality recovery from ${CURRENT_QUALITY}% to ${TARGET_QUALITY}%"

# Step 1: Reduce optimization aggressiveness
export SIMILARITY_THRESHOLD=0.7
export RELEVANCE_THRESHOLD=0.6
export MAX_CONTEXT_TOKENS=1800

# Step 2: Improve model selection
export COST_OPTIMIZED_ROUTING=false

# Step 3: Clear potentially problematic cache
./scripts/clear-low-quality-cache.sh --threshold 0.8

# Step 4: Monitor recovery
for i in {1..12}; do  # Monitor for 1 hour (5min intervals)
    sleep 300
    NEW_QUALITY=$(npx tsx api/_spikes/knowledge-quality-mock-test.ts | jq -r '.overall_quality')
    echo "Recovery check $i: Quality at ${NEW_QUALITY}%"

    if (( $(echo "$NEW_QUALITY >= $TARGET_QUALITY" | bc -l) )); then
        echo "✅ Quality recovery successful: ${NEW_QUALITY}%"
        break
    fi
done
```

## Cost and Token Issues

### Cost Optimization Problems

#### Unexpected Cost Increases
```bash
# Diagnosis
./scripts/analyze-cost-increase.sh --timeframe 24h
./scripts/breakdown-cost-by-component.sh
./scripts/identify-expensive-operations.sh

# Solutions
# 1. Increase GPT-3.5 usage
export FALLBACK_TO_GPT35=true
./scripts/adjust-model-thresholds.sh --prefer-cost

# 2. Implement stricter token limits
export MAX_CONTEXT_TOKENS=1200
export MAX_RESPONSE_TOKENS=350

# 3. Improve cost monitoring
./scripts/setup-cost-alerts.sh --daily-budget 150

# 4. Optimize expensive operations
./scripts/optimize-expensive-operations.sh
```

#### Budget Management
```bash
#!/bin/bash
# manage-performance-budget.sh

DAILY_BUDGET="$1"    # Daily budget in dollars
CURRENT_SPEND="$2"   # Current daily spend

USAGE_PERCENT=$(echo "scale=2; $CURRENT_SPEND / $DAILY_BUDGET * 100" | bc)

echo "📊 Budget Management: ${USAGE_PERCENT}% of daily budget used"

if (( $(echo "$USAGE_PERCENT > 90" | bc -l) )); then
    echo "🚨 Budget alert: >90% of daily budget used"

    # Emergency cost reduction
    export FORCE_GPT35=true
    export MAX_CONTEXT_TOKENS=1000
    export MAX_RESPONSE_TOKENS=250

    # Alert team
    ./scripts/send-budget-alert.sh --usage "$USAGE_PERCENT"

elif (( $(echo "$USAGE_PERCENT > 75" | bc -l) )); then
    echo "⚠️ Budget warning: >75% of daily budget used"

    # Moderate cost reduction
    export FALLBACK_TO_GPT35=true
    ./scripts/adjust-model-thresholds.sh --prefer-cost
fi

# Log budget usage
echo "$(date): Budget usage: ${USAGE_PERCENT}%" >> /var/log/budget-tracking.log
```

## Emergency Procedures

### Performance Emergency Response

#### Critical Performance Incident
```bash
#!/bin/bash
# critical-performance-incident.sh

INCIDENT_ID="$1"
INCIDENT_TYPE="$2"  # latency, quality, cost, availability

echo "🚨 CRITICAL PERFORMANCE INCIDENT: $INCIDENT_ID ($INCIDENT_TYPE)"

# Step 1: Immediate Assessment
echo "Step 1: Immediate assessment"
./scripts/emergency-performance-assessment.sh --incident-id "$INCIDENT_ID"

# Step 2: Incident Classification
case "$INCIDENT_TYPE" in
    "latency")
        # Extreme latency issues
        ./scripts/emergency-latency-response.sh
        ;;
    "quality")
        # Severe quality degradation
        ./scripts/emergency-quality-response.sh
        ;;
    "cost")
        # Budget overrun
        ./scripts/emergency-cost-response.sh
        ;;
    "availability")
        # System availability issues
        ./scripts/emergency-availability-response.sh
        ;;
esac

# Step 3: Stakeholder Notification
./scripts/notify-incident-stakeholders.sh --incident-id "$INCIDENT_ID" --type "$INCIDENT_TYPE"

# Step 4: Continuous Monitoring
./scripts/incident-monitoring.sh --incident-id "$INCIDENT_ID" --duration 3600

echo "✅ Critical incident response initiated for: $INCIDENT_ID"
```

#### Emergency Rollback
```bash
#!/bin/bash
# emergency-performance-rollback.sh

ROLLBACK_REASON="$1"
INCIDENT_ID="$2"

echo "🚨 EMERGENCY ROLLBACK: $ROLLBACK_REASON (Incident: $INCIDENT_ID)"

# Step 1: Immediate optimization disable
export DISABLE_ALL_OPTIMIZATIONS=true
export ENABLE_CONTEXT_PRUNING=false
export ENABLE_RESPONSE_CACHING=false
export ENABLE_PROMPT_OPTIMIZATION=false
export ENABLE_MODEL_SELECTION=false

# Step 2: Clear all caches
./scripts/emergency-cache-clear.sh

# Step 3: Restart services
./scripts/emergency-service-restart.sh

# Step 4: Verify rollback
./scripts/verify-emergency-rollback.sh --incident-id "$INCIDENT_ID"

# Step 5: Monitor post-rollback
./scripts/monitor-post-rollback.sh --duration 1800

# Step 6: Document emergency action
./scripts/document-emergency-rollback.sh --reason "$ROLLBACK_REASON" --incident-id "$INCIDENT_ID"

echo "✅ Emergency rollback completed"
```

### Recovery Procedures

#### System Recovery After Emergency
```bash
#!/bin/bash
# post-emergency-recovery.sh

INCIDENT_ID="$1"

echo "🔄 Starting post-emergency recovery for incident: $INCIDENT_ID"

# Step 1: Assess system state
./scripts/assess-post-emergency-state.sh --incident-id "$INCIDENT_ID"

# Step 2: Gradual optimization re-enablement
echo "Re-enabling optimizations gradually..."

# Enable caching first (safest)
export ENABLE_RESPONSE_CACHING=true
./scripts/monitor-performance.sh --interval 60 --duration 600
sleep 600

# Enable prompt optimization
export ENABLE_PROMPT_OPTIMIZATION=true
./scripts/monitor-performance.sh --interval 60 --duration 600
sleep 600

# Enable context pruning (conservative settings)
export ENABLE_CONTEXT_PRUNING=true
export SIMILARITY_THRESHOLD=0.65  # Conservative
export MAX_CONTEXT_TOKENS=1800    # Higher limit
./scripts/monitor-performance.sh --interval 60 --duration 600
sleep 600

# Enable model selection (last)
export ENABLE_MODEL_SELECTION=true
export COST_OPTIMIZED_ROUTING=false  # Quality-focused initially
./scripts/monitor-performance.sh --interval 60 --duration 600

# Step 3: Full system validation
./scripts/comprehensive-recovery-validation.sh --incident-id "$INCIDENT_ID"

# Step 4: Document recovery
./scripts/document-recovery.sh --incident-id "$INCIDENT_ID"

echo "✅ Post-emergency recovery completed"
```

## Preventive Measures

### Proactive Monitoring

#### Performance Health Checks
```bash
#!/bin/bash
# daily-performance-health-check.sh

echo "🏥 Daily Performance Health Check - $(date)"

# Check 1: Performance Metrics
echo "=== Performance Metrics Check ==="
P95_LATENCY=$(./scripts/get-daily-avg-p95.sh)
TOKEN_USAGE=$(./scripts/get-daily-token-usage.sh)
QUALITY_SCORE=$(./scripts/get-daily-quality-score.sh)

# Validate against thresholds
if (( $(echo "$P95_LATENCY > 1500" | bc -l) )); then
    echo "⚠️ P95 latency trending high: ${P95_LATENCY}ms"
    ./scripts/investigate-latency-trend.sh
fi

if (( $(echo "$TOKEN_USAGE > 1.1" | bc -l) )); then  # >110% of baseline
    echo "⚠️ Token usage trending high: ${TOKEN_USAGE}x baseline"
    ./scripts/investigate-token-trend.sh
fi

if (( $(echo "$QUALITY_SCORE < 82" | bc -l) )); then
    echo "⚠️ Quality score trending low: ${QUALITY_SCORE}%"
    ./scripts/investigate-quality-trend.sh
fi

# Check 2: Cache Health
echo "=== Cache Health Check ==="
./scripts/check-cache-health.sh --daily

# Check 3: Optimization Status
echo "=== Optimization Status Check ==="
./scripts/verify-optimization-status.sh --daily

# Check 4: Resource Utilization
echo "=== Resource Utilization Check ==="
./scripts/check-resource-utilization.sh --daily

# Generate daily health report
./scripts/generate-daily-health-report.sh

echo "✅ Daily health check completed"
```

#### Predictive Analysis
```bash
#!/bin/bash
# predictive-performance-analysis.sh

echo "🔮 Running predictive performance analysis..."

# Collect historical data
./scripts/collect-historical-data.sh --days 30 --output /tmp/historical-data.json

# Run predictive models
python3 << 'EOF'
import json
import numpy as np
from sklearn.linear_model import LinearRegression
from datetime import datetime, timedelta

with open('/tmp/historical-data.json') as f:
    data = json.load(f)

# Predict next week's performance
dates = [datetime.fromisoformat(d['date']) for d in data]
latencies = [d['avg_p95_latency'] for d in data]
token_usage = [d['avg_token_usage'] for d in data]
quality_scores = [d['avg_quality'] for d in data]

# Convert dates to numerical format
date_nums = [(d - dates[0]).days for d in dates]

# Predict trends
def predict_trend(values, days_ahead=7):
    X = np.array(date_nums).reshape(-1, 1)
    y = np.array(values)
    model = LinearRegression().fit(X, y)

    future_date = date_nums[-1] + days_ahead
    prediction = model.predict([[future_date]])[0]
    slope = model.coef_[0]

    return prediction, slope

# Predictions
latency_pred, latency_trend = predict_trend(latencies)
token_pred, token_trend = predict_trend(token_usage)
quality_pred, quality_trend = predict_trend(quality_scores)

print("Performance Predictions (Next Week):")
print(f"P95 Latency: {latency_pred:.0f}ms (trend: {latency_trend:+.1f}ms/day)")
print(f"Token Usage: {token_pred:.0f} (trend: {token_trend:+.1f}/day)")
print(f"Quality Score: {quality_pred:.1f}% (trend: {quality_trend:+.2f}%/day)")

# Alert on concerning trends
if latency_trend > 10:  # >10ms increase per day
    print("⚠️ WARNING: Latency trend concerning")
if token_trend > 2:     # >2 tokens increase per day
    print("⚠️ WARNING: Token usage trend concerning")
if quality_trend < -0.5:  # >0.5% decrease per day
    print("⚠️ WARNING: Quality trend concerning")
EOF
```

### Configuration Management

#### Automated Configuration Validation
```bash
#!/bin/bash
# validate-performance-configuration.sh

echo "🔧 Validating performance configuration..."

# Check 1: Environment Variables
echo "=== Environment Variables ==="
REQUIRED_VARS=(
    "ENABLE_CONTEXT_PRUNING"
    "ENABLE_RESPONSE_CACHING"
    "ENABLE_PROMPT_OPTIMIZATION"
    "ENABLE_MODEL_SELECTION"
    "MAX_CONTEXT_TOKENS"
    "MAX_RESPONSE_TOKENS"
    "CACHE_TTL_MINUTES"
    "QUALITY_THRESHOLD"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Missing required variable: $var"
    else
        echo "✅ $var = ${!var}"
    fi
done

# Check 2: Configuration File Syntax
echo "=== Configuration File Syntax ==="
npx tsc --noEmit api/_lib/performance-config.ts
if [ $? -eq 0 ]; then
    echo "✅ Configuration file syntax valid"
else
    echo "❌ Configuration file syntax errors"
fi

# Check 3: Value Ranges
echo "=== Configuration Value Validation ==="
if [ "$MAX_CONTEXT_TOKENS" -gt 2000 ] || [ "$MAX_CONTEXT_TOKENS" -lt 500 ]; then
    echo "⚠️ MAX_CONTEXT_TOKENS outside recommended range (500-2000)"
fi

if [ "$MAX_RESPONSE_TOKENS" -gt 1000 ] || [ "$MAX_RESPONSE_TOKENS" -lt 200 ]; then
    echo "⚠️ MAX_RESPONSE_TOKENS outside recommended range (200-1000)"
fi

# Check 4: Optimization Consistency
echo "=== Optimization Consistency ==="
./scripts/check-optimization-consistency.sh

echo "✅ Configuration validation completed"
```

## Best Practices for Troubleshooting

### Systematic Approach

1. **Always start with data collection**
2. **Use systematic diagnostic procedures**
3. **Document all findings and actions**
4. **Test fixes in isolation when possible**
5. **Monitor impact of changes continuously**

### Documentation Standards

1. **Record all performance incidents**
2. **Document troubleshooting steps taken**
3. **Maintain runbooks for common issues**
4. **Update procedures based on learnings**
5. **Share knowledge across team members**

### Prevention Focus

1. **Implement comprehensive monitoring**
2. **Set up predictive alerting**
3. **Regular health checks and audits**
4. **Proactive capacity planning**
5. **Continuous performance optimization**

---

*This troubleshooting guide provides comprehensive procedures for diagnosing and resolving performance issues in FlowReader's optimization system, ensuring rapid recovery and minimal impact on user experience.*