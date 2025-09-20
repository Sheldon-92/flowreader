# FlowReader Performance Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying FlowReader's performance optimizations to production environments. It covers pre-deployment validation, deployment procedures, post-deployment verification, and rollback procedures.

## Table of Contents
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Environment Configuration](#environment-configuration)
- [Deployment Procedures](#deployment-procedures)
- [Post-Deployment Verification](#post-deployment-verification)
- [Rollback Procedures](#rollback-procedures)
- [Production Configuration](#production-configuration)

## Pre-Deployment Checklist

### Performance Validation Requirements

#### ✅ Target Achievement Verification
```bash
# Validate all performance targets are met
./scripts/validate-performance-targets.sh --comprehensive --export-report

# Expected results:
# - Token Reduction: ≥21.6% (Target: ≥10%) ✅
# - P95 Latency Reduction: ≥40.4% (Target: ≥15%) ✅
# - Quality Maintenance: ≥84.1% (Target: ≥63.2%) ✅
# - Cost Reduction: ≥20.5% with positive ROI ✅
```

#### ✅ Quality Assurance
```bash
# Run comprehensive quality tests
npx tsx api/_spikes/knowledge-quality-mock-test.ts

# Validate quality across all intent types
./scripts/test-quality-across-intents.sh --comprehensive

# Expected results:
# - Overall quality score: ≥80%
# - No regression >5% from baseline
# - User satisfaction maintained
```

#### ✅ Load Testing
```bash
# Perform load testing with optimizations
./scripts/load-test-optimizations.sh --concurrent 50 --duration 300

# Validate performance under load
./scripts/validate-load-performance.sh --samples 100

# Expected results:
# - Performance maintained under load
# - No memory leaks or resource issues
# - Cache effectiveness under concurrent load
```

#### ✅ Integration Testing
```bash
# Test all optimization components
./scripts/test-optimization-integration.sh

# Validate cache integration
./scripts/test-cache-integration.sh

# Test model selection logic
./scripts/test-model-selection.sh

# Expected results:
# - All optimization features working correctly
# - No integration conflicts
# - Proper fallback behavior
```

### Infrastructure Readiness

#### ✅ Cache Infrastructure
```bash
# Verify cache infrastructure
./scripts/verify-cache-infrastructure.sh

# Check cache capacity and configuration
./scripts/check-cache-capacity.sh

# Test cache performance
./scripts/test-cache-performance.sh

# Requirements:
# - Cache capacity: ≥100MB available
# - Redis/Memory cache accessible
# - Proper TTL configuration
```

#### ✅ Monitoring Setup
```bash
# Verify monitoring infrastructure
./scripts/verify-monitoring-setup.sh

# Check alert configurations
./scripts/check-alert-configurations.sh

# Test notification channels
./scripts/test-notification-channels.sh

# Requirements:
# - All monitoring dashboards functional
# - Alert thresholds configured
# - Notification channels tested
```

#### ✅ Resource Allocation
```bash
# Check system resources
./scripts/check-system-resources.sh

# Verify memory allocation
./scripts/check-memory-allocation.sh

# Check CPU capacity
./scripts/check-cpu-capacity.sh

# Requirements:
# - Sufficient memory for caching
# - CPU capacity for optimization processing
# - Disk space for performance logs
```

### Code Deployment Verification

#### ✅ Configuration Files
```bash
# Verify configuration file syntax
./scripts/verify-config-syntax.sh

# Validate environment variables
./scripts/validate-environment-variables.sh

# Check configuration integrity
./scripts/check-config-integrity.sh

# Files to verify:
# - /api/_lib/performance-config.ts
# - Environment variables
# - Feature flag configurations
```

#### ✅ Dependencies
```bash
# Check all dependencies
npm audit
npm install --production

# Verify TypeScript compilation
npx tsc --noEmit

# Check for missing dependencies
./scripts/check-dependencies.sh

# Requirements:
# - No security vulnerabilities
# - All dependencies available
# - TypeScript compilation successful
```

## Environment Configuration

### Production Environment Variables

#### Core Performance Settings
```bash
# Enable all performance optimizations
export ENABLE_CONTEXT_PRUNING=true
export ENABLE_RESPONSE_CACHING=true
export ENABLE_PROMPT_OPTIMIZATION=true
export ENABLE_MODEL_SELECTION=true

# Token management configuration
export MAX_CONTEXT_TOKENS=1500
export MAX_RESPONSE_TOKENS=400
export TOP_K_INITIAL=8
export TOP_K_FINAL=3
export SIMILARITY_THRESHOLD=0.75
export RELEVANCE_THRESHOLD=0.7

# Caching configuration
export CACHE_SIZE=1000
export CACHE_TTL_MINUTES=15
export EMBEDDING_CACHE_TTL_MINUTES=60
export SEMANTIC_SIMILARITY_THRESHOLD=0.95
export CACHE_STRATEGY=LRU

# Quality thresholds
export QUALITY_THRESHOLD=0.632
export AUTO_ROLLBACK=true
export QUALITY_CHECK_INTERVAL=10

# Model selection
export PREFER_FAST_MODELS=true
export FALLBACK_TO_GPT35=true
export COST_OPTIMIZED_ROUTING=true
```

#### Monitoring Configuration
```bash
# Performance monitoring
export ENABLE_PERFORMANCE_MONITORING=true
export METRICS_COLLECTION_INTERVAL=30
export PERFORMANCE_LOG_LEVEL=info

# Alert thresholds
export P95_LATENCY_ALERT_THRESHOLD=2000
export QUALITY_ALERT_THRESHOLD=80
export CACHE_HIT_RATE_ALERT_THRESHOLD=20
export TOKEN_USAGE_ALERT_THRESHOLD=115

# Notification settings
export SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}
export ADMIN_EMAIL=${ADMIN_EMAIL}
export PAGERDUTY_API_KEY=${PAGERDUTY_API_KEY}
```

#### Feature Flags
```bash
# Gradual rollout feature flags
export FF_CONTEXT_PRUNING=100  # 100% rollout
export FF_RESPONSE_CACHING=100  # 100% rollout
export FF_PROMPT_OPTIMIZATION=100  # 100% rollout
export FF_MODEL_SELECTION=100  # 100% rollout

# A/B testing flags (if needed)
export FF_EXPERIMENTAL_OPTIMIZATION=0  # Disabled
export FF_ADVANCED_CACHING=0  # Disabled
```

### Configuration File Updates

#### Performance Configuration (`api/_lib/performance-config.ts`)
```typescript
// Production configuration - validated settings
export const PRODUCTION_PERFORMANCE_CONFIG: PerformanceConfig = {
  tokenManagement: {
    enabled: true,
    maxContextTokens: 1500,
    maxResponseTokens: 400,
    topKInitial: 8,
    topKFinal: 3,
    similarityThreshold: 0.75,
    semanticDeduplication: true,
    relevanceScoreThreshold: 0.7,
    dynamicTokenLimit: true
  },

  caching: {
    enabled: true,
    responseCacheTTL: 900,  // 15 minutes
    embeddingCacheTTL: 3600,  // 1 hour
    maxCacheSize: 100,  // MB
    cacheStrategy: 'LRU',
    semanticSimilarityThreshold: 0.95,
    precomputePopularContent: true
  },

  promptOptimization: {
    enabled: true,
    useConcisePrompts: true,
    dynamicPromptSelection: true,
    removeRedundantInstructions: true,
    maxSystemPromptLength: 500,
    maxUserPromptLength: 1000,
    intentBasedLimits: true
  },

  requestProcessing: {
    batchingEnabled: true,
    batchSize: 5,
    parallelProcessing: true,
    maxConcurrentRequests: 3,
    streamingOptimized: true,
    earlyStoppingConfidence: 0.9
  },

  qualityPreservation: {
    minQualityThreshold: 0.632,
    qualityCheckInterval: 10,
    autoRollback: true,
    qualityMetricsEnabled: true
  },

  modelSelection: {
    preferFastModels: true,
    fallbackToGPT35: true,
    modelByIntent: {
      'simple': 'gpt-3.5-turbo',
      'enhance': 'gpt-3.5-turbo',
      'complex': 'gpt-4-turbo-preview'
    },
    costOptimizedRouting: true
  }
};
```

## Deployment Procedures

### Blue-Green Deployment Approach

#### Phase 1: Preparation
```bash
#!/bin/bash
# prepare-performance-deployment.sh

echo "🚀 Preparing performance optimization deployment..."

# Step 1: Backup current configuration
./scripts/backup-current-configuration.sh --tag pre-optimization

# Step 2: Prepare green environment
./scripts/prepare-green-environment.sh

# Step 3: Deploy optimized code to green environment
./scripts/deploy-to-green.sh --branch performance-optimizations

# Step 4: Configure green environment
./scripts/configure-green-environment.sh --performance-optimizations

# Step 5: Warm up green environment
./scripts/warmup-green-environment.sh --cache-warmup

echo "✅ Green environment prepared and ready for testing"
```

#### Phase 2: Green Environment Testing
```bash
#!/bin/bash
# test-green-environment.sh

echo "🧪 Testing green environment with performance optimizations..."

# Step 1: Health check
./scripts/health-check-green.sh

# Step 2: Performance validation
./scripts/validate-green-performance.sh --samples 50

# Step 3: Quality validation
./scripts/validate-green-quality.sh --comprehensive

# Step 4: Load testing
./scripts/load-test-green.sh --duration 300 --concurrent 20

# Step 5: Integration testing
./scripts/integration-test-green.sh

if [ $? -eq 0 ]; then
    echo "✅ Green environment tests passed - ready for traffic switch"
    exit 0
else
    echo "❌ Green environment tests failed - aborting deployment"
    exit 1
fi
```

#### Phase 3: Traffic Switch
```bash
#!/bin/bash
# switch-to-green.sh

echo "🔄 Switching traffic to optimized environment..."

# Step 1: Gradual traffic switch (10% -> 50% -> 100%)
./scripts/route-traffic.sh --green-percentage 10
sleep 300  # Monitor for 5 minutes

# Validate performance with 10% traffic
./scripts/monitor-split-performance.sh --duration 300

# Increase to 50% traffic
./scripts/route-traffic.sh --green-percentage 50
sleep 600  # Monitor for 10 minutes

# Validate performance with 50% traffic
./scripts/monitor-split-performance.sh --duration 600

# Complete switch to 100%
./scripts/route-traffic.sh --green-percentage 100

# Step 2: Final validation
./scripts/validate-full-deployment.sh

# Step 3: Update DNS/load balancer
./scripts/update-load-balancer.sh --target green

echo "✅ Traffic successfully switched to optimized environment"
```

### Rolling Deployment Approach (Alternative)

#### Rolling Update Deployment
```bash
#!/bin/bash
# rolling-deployment.sh

echo "🔄 Starting rolling deployment of performance optimizations..."

# Get list of application instances
INSTANCES=($(./scripts/get-app-instances.sh))
TOTAL_INSTANCES=${#INSTANCES[@]}

echo "Found ${TOTAL_INSTANCES} instances to update"

# Deploy to instances one by one
for i in "${!INSTANCES[@]}"; do
    INSTANCE="${INSTANCES[$i]}"
    PROGRESS=$((i + 1))

    echo "🚀 Deploying to instance ${INSTANCE} (${PROGRESS}/${TOTAL_INSTANCES})"

    # Step 1: Remove instance from load balancer
    ./scripts/remove-from-lb.sh --instance "$INSTANCE"

    # Step 2: Deploy optimizations
    ./scripts/deploy-optimizations.sh --instance "$INSTANCE"

    # Step 3: Configure instance
    ./scripts/configure-instance.sh --instance "$INSTANCE" --optimizations

    # Step 4: Health check
    ./scripts/health-check-instance.sh --instance "$INSTANCE"

    # Step 5: Performance validation
    ./scripts/validate-instance-performance.sh --instance "$INSTANCE"

    # Step 6: Add back to load balancer
    ./scripts/add-to-lb.sh --instance "$INSTANCE"

    # Step 7: Monitor for stability
    ./scripts/monitor-instance.sh --instance "$INSTANCE" --duration 180

    echo "✅ Instance ${INSTANCE} updated successfully"
done

echo "✅ Rolling deployment completed successfully"
```

## Post-Deployment Verification

### Immediate Verification (0-30 minutes)

#### Health and Connectivity
```bash
#!/bin/bash
# immediate-verification.sh

echo "🔍 Starting immediate post-deployment verification..."

# Step 1: Basic health check
echo "Checking application health..."
./scripts/health-check.sh

# Step 2: API connectivity test
echo "Testing API connectivity..."
./scripts/test-api-connectivity.sh

# Step 3: Quick performance check
echo "Running quick performance validation..."
./scripts/quick-performance-check.sh --samples 10

# Step 4: Configuration verification
echo "Verifying optimization configuration..."
./scripts/verify-optimization-config.sh

# Step 5: Cache functionality test
echo "Testing cache functionality..."
./scripts/test-cache-functionality.sh

# Step 6: Error rate check
echo "Checking error rates..."
./scripts/check-error-rates.sh --last 30min

echo "✅ Immediate verification completed"
```

#### Performance Baseline Establishment
```bash
#!/bin/bash
# establish-post-deployment-baseline.sh

echo "📊 Establishing post-deployment performance baseline..."

# Step 1: Comprehensive performance measurement
./scripts/measure-perf-cost.sh \
    --endpoint chat/stream \
    --samples 100 \
    --output json \
    --quality-check > /tmp/post-deployment-baseline.json

# Step 2: Compare with pre-deployment baseline
./scripts/compare-baselines.sh \
    --pre deployment-baselines/pre-optimization.json \
    --post /tmp/post-deployment-baseline.json \
    --output /tmp/deployment-comparison.json

# Step 3: Validate targets achieved
./scripts/validate-deployment-targets.sh \
    --comparison /tmp/deployment-comparison.json

# Step 4: Generate deployment report
./scripts/generate-deployment-report.sh \
    --comparison /tmp/deployment-comparison.json \
    --output /tmp/deployment-success-report.html

echo "✅ Post-deployment baseline established"
```

### Extended Verification (30 minutes - 24 hours)

#### Performance Monitoring
```bash
#!/bin/bash
# extended-verification.sh

echo "📈 Starting extended post-deployment monitoring..."

# Step 1: Start continuous monitoring
./scripts/monitor-performance.sh \
    --interval 60 \
    --duration 14400 \
    --background \
    --alert-on-regression > /var/log/post-deployment-monitoring.log &

MONITOR_PID=$!

# Step 2: Load testing with realistic traffic
./scripts/simulate-realistic-load.sh \
    --duration 3600 \
    --users 100 \
    --ramp-up 300

# Step 3: Quality monitoring
./scripts/monitor-quality-scores.sh \
    --interval 300 \
    --duration 14400 \
    --alert-threshold 80 > /var/log/quality-monitoring.log &

# Step 4: Cache effectiveness monitoring
./scripts/monitor-cache-effectiveness.sh \
    --interval 300 \
    --duration 14400 > /var/log/cache-monitoring.log &

# Step 5: Cost tracking
./scripts/track-deployment-costs.sh \
    --interval 3600 \
    --duration 86400 > /var/log/cost-tracking.log &

echo "✅ Extended monitoring initiated - PID: $MONITOR_PID"
echo "Monitor logs available in /var/log/"
```

#### Regression Detection
```bash
#!/bin/bash
# detect-deployment-regressions.sh

echo "🔍 Running regression detection..."

# Collect 24-hour performance data
./scripts/collect-performance-data.sh \
    --duration 24h \
    --output /tmp/24h-performance-data.json

# Run statistical regression analysis
python3 scripts/regression_detector.py \
    deployment-baselines/pre-optimization.json \
    /tmp/24h-performance-data.json > /tmp/regression-analysis.json

# Check for significant regressions
REGRESSIONS=$(jq -r '.[] | select(.significant == true) | .metric' /tmp/regression-analysis.json)

if [ -n "$REGRESSIONS" ]; then
    echo "⚠️ Significant regressions detected:"
    echo "$REGRESSIONS"
    ./scripts/send-regression-alert.sh --regressions "$REGRESSIONS"
else
    echo "✅ No significant regressions detected"
fi
```

### Success Criteria Validation

#### Performance Target Confirmation
```bash
#!/bin/bash
# confirm-performance-targets.sh

echo "🎯 Confirming performance targets achieved..."

# Load deployment comparison data
COMPARISON_FILE="/tmp/deployment-comparison.json"

# Extract key metrics
TOKEN_REDUCTION=$(jq -r '.improvements.tokenReduction.total' "$COMPARISON_FILE")
LATENCY_REDUCTION=$(jq -r '.improvements.latencyReduction.p95' "$COMPARISON_FILE")
QUALITY_SCORE=$(jq -r '.post_deployment.quality.score' "$COMPARISON_FILE")
COST_REDUCTION=$(jq -r '.improvements.costReduction.perRequest' "$COMPARISON_FILE")

# Validate against targets
echo "Performance Target Validation:"
echo "================================"

# Token reduction target (≥10%)
if (( $(echo "$TOKEN_REDUCTION >= 10" | bc -l) )); then
    echo "✅ Token Reduction: ${TOKEN_REDUCTION}% (Target: ≥10%)"
else
    echo "❌ Token Reduction: ${TOKEN_REDUCTION}% (Target: ≥10%)"
fi

# Latency reduction target (≥15%)
if (( $(echo "$LATENCY_REDUCTION >= 15" | bc -l) )); then
    echo "✅ P95 Latency Reduction: ${LATENCY_REDUCTION}% (Target: ≥15%)"
else
    echo "❌ P95 Latency Reduction: ${LATENCY_REDUCTION}% (Target: ≥15%)"
fi

# Quality maintenance (≥63.2%)
if (( $(echo "$QUALITY_SCORE >= 63.2" | bc -l) )); then
    echo "✅ Quality Score: ${QUALITY_SCORE}% (Target: ≥63.2%)"
else
    echo "❌ Quality Score: ${QUALITY_SCORE}% (Target: ≥63.2%)"
fi

# Cost reduction validation
if (( $(echo "$COST_REDUCTION > 0" | bc -l) )); then
    echo "✅ Cost Reduction: ${COST_REDUCTION}% (Positive savings)"
else
    echo "❌ Cost Reduction: ${COST_REDUCTION}% (No savings achieved)"
fi

echo "================================"
```

## Rollback Procedures

### Emergency Rollback

#### Immediate Rollback (< 5 minutes)
```bash
#!/bin/bash
# emergency-rollback.sh

echo "🚨 EMERGENCY: Initiating immediate rollback of performance optimizations"

# Step 1: Disable all optimizations via environment variables
export DISABLE_ALL_OPTIMIZATIONS=true
export ENABLE_CONTEXT_PRUNING=false
export ENABLE_RESPONSE_CACHING=false
export ENABLE_PROMPT_OPTIMIZATION=false
export ENABLE_MODEL_SELECTION=false

# Step 2: Clear all caches
./scripts/clear-all-caches.sh

# Step 3: Restart application processes
./scripts/restart-application.sh --emergency

# Step 4: Switch to backup configuration
./scripts/restore-backup-config.sh --tag pre-optimization

# Step 5: Verify rollback
./scripts/verify-rollback.sh --quick

# Step 6: Notify team
./scripts/notify-rollback.sh --emergency

echo "✅ Emergency rollback completed in $(date)"
```

#### Code Rollback (Blue-Green)
```bash
#!/bin/bash
# code-rollback-blue-green.sh

echo "🔄 Rolling back to blue environment..."

# Step 1: Switch traffic back to blue environment
./scripts/route-traffic.sh --blue-percentage 100

# Step 2: Update load balancer
./scripts/update-load-balancer.sh --target blue

# Step 3: Verify blue environment health
./scripts/health-check-blue.sh

# Step 4: Validate performance on blue
./scripts/validate-blue-performance.sh --samples 20

# Step 5: Shut down green environment
./scripts/shutdown-green-environment.sh

# Step 6: Clean up resources
./scripts/cleanup-green-resources.sh

echo "✅ Code rollback to blue environment completed"
```

### Partial Rollback

#### Selective Feature Rollback
```bash
#!/bin/bash
# selective-rollback.sh

FEATURE="$1"  # context-pruning, caching, prompt-optimization, model-selection

echo "🔄 Rolling back feature: $FEATURE"

case "$FEATURE" in
    "context-pruning")
        export ENABLE_CONTEXT_PRUNING=false
        ./scripts/reset-token-limits.sh --default
        ;;
    "caching")
        export ENABLE_RESPONSE_CACHING=false
        ./scripts/clear-all-caches.sh
        ;;
    "prompt-optimization")
        export ENABLE_PROMPT_OPTIMIZATION=false
        ./scripts/reset-prompt-templates.sh --default
        ;;
    "model-selection")
        export ENABLE_MODEL_SELECTION=false
        ./scripts/reset-model-config.sh --default
        ;;
    *)
        echo "Unknown feature: $FEATURE"
        exit 1
        ;;
esac

# Restart affected services
./scripts/restart-optimization-services.sh --feature "$FEATURE"

# Validate rollback
./scripts/validate-feature-rollback.sh --feature "$FEATURE"

echo "✅ Feature rollback completed: $FEATURE"
```

### Rollback Validation

#### Post-Rollback Verification
```bash
#!/bin/bash
# validate-rollback.sh

echo "🔍 Validating rollback completion..."

# Step 1: Configuration verification
./scripts/verify-rollback-config.sh

# Step 2: Performance check
./scripts/measure-perf-cost.sh \
    --endpoint chat/stream \
    --samples 20 \
    --output json > /tmp/post-rollback-performance.json

# Step 3: Compare with pre-deployment baseline
./scripts/compare-baselines.sh \
    --baseline deployment-baselines/pre-optimization.json \
    --current /tmp/post-rollback-performance.json

# Step 4: Quality verification
npx tsx api/_spikes/knowledge-quality-mock-test.ts

# Step 5: Error rate check
./scripts/check-error-rates.sh --last 30min

# Step 6: System health check
./scripts/health-check.sh --comprehensive

echo "✅ Rollback validation completed"
```

## Production Configuration

### Monitoring Configuration

#### Performance Dashboards
```yaml
# dashboard-config.yml
dashboards:
  performance_overview:
    title: "FlowReader Performance Overview"
    metrics:
      - name: "P95 Latency"
        query: "percentile(latency, 0.95)"
        threshold: 1500
        alert_threshold: 2000
      - name: "Token Usage"
        query: "avg(input_tokens + output_tokens)"
        threshold: 67
        alert_threshold: 77
      - name: "Quality Score"
        query: "avg(quality_score)"
        threshold: 80
        alert_threshold: 75
      - name: "Cache Hit Rate"
        query: "avg(cache_hits / (cache_hits + cache_misses))"
        threshold: 0.25
        alert_threshold: 0.20

  optimization_effectiveness:
    title: "Optimization Effectiveness"
    metrics:
      - name: "Token Reduction"
        query: "token_reduction_percentage"
        target: 21.6
      - name: "Latency Improvement"
        query: "latency_reduction_percentage"
        target: 40.4
      - name: "Cost Savings"
        query: "cost_reduction_percentage"
        target: 20.5
```

#### Alert Configuration
```yaml
# alerts-config.yml
alerts:
  critical:
    - name: "P95 Latency Critical"
      condition: "p95_latency > 2500"
      duration: "5m"
      channels: ["slack", "email", "pagerduty"]

    - name: "Quality Regression Critical"
      condition: "quality_score < 75"
      duration: "10m"
      channels: ["slack", "email"]

    - name: "System Error Rate Critical"
      condition: "error_rate > 5"
      duration: "5m"
      channels: ["slack", "email", "pagerduty"]

  warning:
    - name: "P95 Latency Warning"
      condition: "p95_latency > 2000"
      duration: "10m"
      channels: ["slack"]

    - name: "Token Usage Warning"
      condition: "token_usage > baseline * 1.15"
      duration: "15m"
      channels: ["slack"]

    - name: "Cache Hit Rate Warning"
      condition: "cache_hit_rate < 0.20"
      duration: "15m"
      channels: ["slack"]
```

### Security Configuration

#### Performance Data Security
```bash
# Secure performance data access
export PERFORMANCE_DATA_ENCRYPTION=true
export PERFORMANCE_LOGS_RETENTION_DAYS=90
export PERFORMANCE_METRICS_ACCESS_CONTROL=true

# API key management for monitoring
export MONITORING_API_KEY_ROTATION_DAYS=30
export METRICS_ENDPOINT_AUTH_REQUIRED=true

# Log security
export PERFORMANCE_LOG_SANITIZATION=true
export SENSITIVE_DATA_REDACTION=true
```

### Backup and Recovery

#### Configuration Backup
```bash
#!/bin/bash
# backup-production-config.sh

BACKUP_DIR="/var/backup/flowreader/production"
DATE=$(date '+%Y%m%d_%H%M%S')

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup performance configuration
tar -czf "$BACKUP_DIR/performance-config-${DATE}.tar.gz" \
    /app/api/_lib/performance-config.ts \
    /etc/environment \
    /etc/monitoring/ \
    /var/lib/flowreader/baselines/

# Backup current performance metrics
./scripts/export-current-metrics.sh > "$BACKUP_DIR/current-metrics-${DATE}.json"

# Create backup manifest
cat > "$BACKUP_DIR/backup-manifest-${DATE}.json" << EOF
{
  "timestamp": "${DATE}",
  "files": {
    "config": "performance-config-${DATE}.tar.gz",
    "metrics": "current-metrics-${DATE}.json"
  },
  "performance_state": {
    "p95_latency": "$(get_current_p95)",
    "token_reduction": "$(get_current_token_reduction)",
    "quality_score": "$(get_current_quality)",
    "optimizations_enabled": "$(get_optimization_status)"
  }
}
EOF

# Upload to secure backup storage
./scripts/upload-to-backup-storage.sh "$BACKUP_DIR" --encrypt

echo "✅ Production configuration backed up: ${DATE}"
```

## Best Practices

### Deployment Best Practices

1. **Always validate in staging first**
2. **Use gradual rollout strategies**
3. **Monitor key metrics continuously**
4. **Have rollback procedures ready**
5. **Document all changes thoroughly**

### Monitoring Best Practices

1. **Set up comprehensive alerting**
2. **Monitor business impact metrics**
3. **Track user experience metrics**
4. **Maintain performance baselines**
5. **Regular alert threshold tuning**

### Rollback Best Practices

1. **Practice rollback procedures regularly**
2. **Automate rollback triggers**
3. **Maintain multiple rollback options**
4. **Validate rollback effectiveness**
5. **Document lessons learned**

---

*This deployment guide ensures safe, reliable deployment of FlowReader's performance optimizations with comprehensive verification and rollback capabilities.*