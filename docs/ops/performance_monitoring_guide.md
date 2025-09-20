# FlowReader Performance Monitoring Guide

## Overview

This guide provides comprehensive instructions for monitoring FlowReader's performance optimizations in production. It covers real-time monitoring, alerting, reporting, and troubleshooting procedures to ensure optimal system performance.

## Table of Contents
- [Monitoring Architecture](#monitoring-architecture)
- [Key Performance Indicators](#key-performance-indicators)
- [Real-time Monitoring](#real-time-monitoring)
- [Alerting System](#alerting-system)
- [Reporting and Analytics](#reporting-and-analytics)
- [Troubleshooting Procedures](#troubleshooting-procedures)
- [Performance Regression Detection](#performance-regression-detection)

## Monitoring Architecture

### Components Overview
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Application   │    │   Monitoring    │    │   Alerting      │
│   Metrics       │───▶│   System        │───▶│   System        │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Performance   │    │   Dashboards    │    │ Notifications   │
│   Logs          │    │   Analytics     │    │ (Slack/Email)   │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Monitoring Stack
- **Metrics Collection**: Built-in performance tracking
- **Time Series Database**: Performance data storage
- **Dashboards**: Real-time visualization
- **Alerting**: Automated notifications
- **Log Analysis**: Performance event tracking

## Key Performance Indicators

### Primary KPIs

#### 1. Response Time Metrics
- **P50 Latency**: Median response time
- **P95 Latency**: 95th percentile response time
- **P99 Latency**: 99th percentile response time
- **Mean Latency**: Average response time

**Targets**:
- P95 < 1500ms (Alert: >2000ms)
- P50 < 1000ms (Alert: >1500ms)
- Mean < 1100ms (Alert: >1600ms)

#### 2. Token Consumption Metrics
- **Tokens per Request**: Average token usage
- **Daily Token Count**: Total daily consumption
- **Token Efficiency**: Tokens per quality unit
- **Token Cost**: Daily/monthly cost tracking

**Targets**:
- Maintain 21%+ token reduction
- Alert on >15% increase week-over-week
- Daily budget alerts at 90% threshold

#### 3. Quality Metrics
- **Overall Quality Score**: Weighted average quality
- **Quality by Intent**: Category-specific quality
- **Quality Regression**: Change from baseline
- **User Satisfaction**: Feedback-based metrics

**Targets**:
- Overall Quality > 80% (Alert: <78%)
- Quality regression < 5% from baseline
- User satisfaction > 4.0/5

#### 4. Cache Performance Metrics
- **Cache Hit Rate**: Percentage of cached responses
- **Cache Miss Rate**: Percentage of uncached responses
- **Cache Memory Usage**: Current cache size
- **Cache TTL Effectiveness**: Average cache lifespan

**Targets**:
- Hit rate > 25% (Alert: <20%)
- Memory usage < 80% capacity
- TTL effectiveness > 70%

### Secondary KPIs

#### 5. Cost Metrics
- **Cost per Request**: Average request cost
- **Monthly Cost**: Total monthly AI costs
- **Cost per Quality Unit**: Cost efficiency
- **Budget Utilization**: Percentage of budget used

#### 6. System Health Metrics
- **Error Rate**: Percentage of failed requests
- **Availability**: System uptime percentage
- **Throughput**: Requests per minute
- **Concurrent Users**: Active user count

## Real-time Monitoring

### Monitoring Commands

#### Performance Health Check
```bash
# Real-time performance monitoring
./scripts/monitor-performance.sh --live

# Quick health check
./scripts/performance-health-check.sh

# Detailed metrics collection
./scripts/collect-performance-metrics.sh --interval 60
```

#### Cache Monitoring
```bash
# Cache performance monitoring
./scripts/monitor-cache-performance.sh --real-time

# Cache hit rate analysis
./scripts/analyze-cache-effectiveness.sh --live

# Cache memory usage
./scripts/monitor-cache-memory.sh
```

#### Quality Monitoring
```bash
# Real-time quality monitoring
./scripts/monitor-quality-scores.sh --live

# Quality regression detection
./scripts/detect-quality-regression.sh --threshold 0.05

# User satisfaction tracking
./scripts/monitor-user-satisfaction.sh
```

### Monitoring Script Implementation

#### Performance Monitor (`scripts/monitor-performance.sh`)
```bash
#!/bin/bash
# Real-time performance monitoring script

INTERVAL=${1:-30}  # Default 30 seconds
DURATION=${2:-3600}  # Default 1 hour

echo "Starting real-time performance monitoring..."
echo "Interval: ${INTERVAL}s, Duration: ${DURATION}s"

START_TIME=$(date +%s)
while [ $(($(date +%s) - START_TIME)) -lt $DURATION ]; do
    # Collect metrics
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    # Get current performance metrics
    METRICS=$(./scripts/measure-perf-cost.sh --endpoint chat/stream --samples 5 --quick)

    # Extract key metrics
    P95_LATENCY=$(echo "$METRICS" | jq -r '.latency.p95')
    MEAN_TOKENS=$(echo "$METRICS" | jq -r '.tokens.total')
    QUALITY_SCORE=$(echo "$METRICS" | jq -r '.quality.score // "N/A"')
    CACHE_HIT_RATE=$(echo "$METRICS" | jq -r '.cache.hitRate // 0')

    # Display metrics
    printf "[%s] P95: %dms | Tokens: %d | Quality: %s%% | Cache: %d%%\n" \
        "$TIMESTAMP" \
        "${P95_LATENCY%.*}" \
        "${MEAN_TOKENS%.*}" \
        "$QUALITY_SCORE" \
        "$((CACHE_HIT_RATE * 100))"

    # Check thresholds and alert if needed
    if (( $(echo "$P95_LATENCY > 2000" | bc -l) )); then
        echo "⚠️  ALERT: P95 latency above threshold (${P95_LATENCY}ms > 2000ms)"
    fi

    if (( $(echo "$QUALITY_SCORE < 80" | bc -l) )); then
        echo "⚠️  ALERT: Quality below threshold (${QUALITY_SCORE}% < 80%)"
    fi

    sleep "$INTERVAL"
done
```

### Performance Dashboard Queries

#### Latency Trends
```sql
-- P95 Latency over time
SELECT
    timestamp,
    percentile(latency, 0.95) as p95_latency,
    percentile(latency, 0.50) as p50_latency,
    avg(latency) as mean_latency
FROM performance_metrics
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY timestamp
ORDER BY timestamp;
```

#### Token Usage Analysis
```sql
-- Token consumption trends
SELECT
    DATE(timestamp) as date,
    SUM(input_tokens + output_tokens) as total_tokens,
    AVG(input_tokens + output_tokens) as avg_tokens_per_request,
    COUNT(*) as request_count
FROM performance_metrics
WHERE timestamp >= NOW() - INTERVAL '7 days'
GROUP BY DATE(timestamp)
ORDER BY date;
```

#### Quality Score Monitoring
```sql
-- Quality score trends by intent
SELECT
    intent_type,
    DATE(timestamp) as date,
    AVG(quality_score) as avg_quality,
    MIN(quality_score) as min_quality,
    MAX(quality_score) as max_quality,
    COUNT(*) as sample_count
FROM quality_metrics
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY intent_type, DATE(timestamp)
ORDER BY date, intent_type;
```

## Alerting System

### Alert Definitions

#### Critical Alerts (Immediate Response Required)
```yaml
# P95 Latency Critical
alert: p95_latency_critical
condition: p95_latency > 2500ms for 5 minutes
severity: critical
channels: [slack, email, pagerduty]
message: "P95 latency critically high: {{value}}ms"

# Quality Score Critical
alert: quality_critical
condition: quality_score < 75% for 10 minutes
severity: critical
channels: [slack, email]
message: "Quality score critically low: {{value}}%"

# System Error Rate Critical
alert: error_rate_critical
condition: error_rate > 5% for 5 minutes
severity: critical
channels: [slack, email, pagerduty]
message: "Error rate critically high: {{value}}%"
```

#### Warning Alerts (Attention Required)
```yaml
# P95 Latency Warning
alert: p95_latency_warning
condition: p95_latency > 2000ms for 10 minutes
severity: warning
channels: [slack]
message: "P95 latency elevated: {{value}}ms"

# Token Usage Warning
alert: token_usage_warning
condition: daily_tokens > 110% of baseline for 1 hour
severity: warning
channels: [slack]
message: "Token usage elevated: {{value}} (+{{percentage}}%)"

# Cache Hit Rate Warning
alert: cache_hit_rate_warning
condition: cache_hit_rate < 20% for 15 minutes
severity: warning
channels: [slack]
message: "Cache hit rate low: {{value}}%"
```

#### Info Alerts (Monitoring Information)
```yaml
# Daily Performance Summary
alert: daily_summary
condition: daily_schedule
severity: info
channels: [email]
message: "Daily performance summary attached"

# Cost Budget Alert
alert: cost_budget_warning
condition: monthly_cost > 90% of budget
severity: warning
channels: [slack, email]
message: "Monthly cost approaching budget: {{value}}% used"
```

### Alert Response Procedures

#### Critical Alert Response
1. **Immediate Assessment**
   ```bash
   # Check system status
   ./scripts/performance-health-check.sh --critical

   # Get detailed metrics
   ./scripts/measure-perf-cost.sh --endpoint chat/stream --samples 20

   # Check error logs
   ./scripts/check-error-logs.sh --last 30min
   ```

2. **Root Cause Analysis**
   ```bash
   # Analyze performance trends
   ./scripts/analyze-performance-trends.sh --last 2hours

   # Check optimization status
   ./scripts/check-optimization-status.sh

   # Validate configuration
   ./scripts/validate-performance-config.sh
   ```

3. **Mitigation Actions**
   ```bash
   # Emergency rollback if needed
   export DISABLE_ALL_OPTIMIZATIONS=true

   # Restart optimization services
   ./scripts/restart-optimization-services.sh

   # Clear cache if problematic
   ./scripts/clear-performance-cache.sh
   ```

#### Warning Alert Response
1. **Monitoring Intensification**
   ```bash
   # Increase monitoring frequency
   ./scripts/monitor-performance.sh --interval 10 --duration 1800

   # Start trend analysis
   ./scripts/start-trend-analysis.sh --warning
   ```

2. **Preventive Actions**
   ```bash
   # Optimize cache if hit rate low
   ./scripts/optimize-cache-settings.sh

   # Adjust token limits if usage high
   ./scripts/adjust-token-limits.sh --temporary

   # Scale resources if needed
   ./scripts/scale-performance-resources.sh
   ```

### Notification Channels

#### Slack Integration
```javascript
// Slack webhook configuration
const slackConfig = {
  webhook: process.env.SLACK_WEBHOOK_URL,
  channel: '#performance-alerts',
  username: 'FlowReader Performance Monitor',
  iconEmoji: ':chart_with_upwards_trend:'
};

// Alert message formatting
function formatSlackAlert(alert) {
  return {
    text: `🚨 FlowReader Performance Alert`,
    attachments: [{
      color: alert.severity === 'critical' ? 'danger' : 'warning',
      fields: [
        { title: 'Alert', value: alert.name, short: true },
        { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
        { title: 'Value', value: alert.value, short: true },
        { title: 'Threshold', value: alert.threshold, short: true },
        { title: 'Time', value: new Date().toISOString(), short: false }
      ]
    }]
  };
}
```

#### Email Integration
```bash
# Email alert script
#!/bin/bash
# send-performance-alert.sh

ALERT_TYPE="$1"
METRIC_VALUE="$2"
THRESHOLD="$3"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Email template
cat > /tmp/alert_email.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>FlowReader Performance Alert</title>
</head>
<body>
    <h2>🚨 FlowReader Performance Alert</h2>

    <table border="1" cellpadding="10">
        <tr><td><strong>Alert Type</strong></td><td>${ALERT_TYPE}</td></tr>
        <tr><td><strong>Current Value</strong></td><td>${METRIC_VALUE}</td></tr>
        <tr><td><strong>Threshold</strong></td><td>${THRESHOLD}</td></tr>
        <tr><td><strong>Timestamp</strong></td><td>${TIMESTAMP}</td></tr>
    </table>

    <h3>Recommended Actions</h3>
    <ul>
        <li>Check performance dashboard</li>
        <li>Run diagnostic scripts</li>
        <li>Review recent changes</li>
        <li>Consider optimization adjustments</li>
    </ul>

    <p>Performance Dashboard: <a href="https://flowreader.app/admin/performance">View Dashboard</a></p>
</body>
</html>
EOF

# Send email
mail -s "FlowReader Performance Alert: ${ALERT_TYPE}" \
     -a "Content-Type: text/html" \
     "${ADMIN_EMAIL}" < /tmp/alert_email.html
```

## Reporting and Analytics

### Daily Reports

#### Daily Performance Report
```bash
#!/bin/bash
# generate-daily-performance-report.sh

DATE=$(date '+%Y-%m-%d')
REPORT_FILE="/tmp/daily-performance-report-${DATE}.html"

# Generate daily report
./scripts/daily-performance-analysis.sh --date "$DATE" --format html > "$REPORT_FILE"

# Key metrics summary
cat >> "$REPORT_FILE" << EOF
<h2>Key Metrics Summary - ${DATE}</h2>
<table border="1">
<tr><th>Metric</th><th>Value</th><th>Target</th><th>Status</th></tr>
<tr><td>P95 Latency</td><td>$(get_daily_avg_p95)ms</td><td>&lt;1500ms</td><td>$(get_status)</td></tr>
<tr><td>Token Reduction</td><td>$(get_token_reduction)%</td><td>&gt;21%</td><td>$(get_status)</td></tr>
<tr><td>Quality Score</td><td>$(get_quality_score)%</td><td>&gt;80%</td><td>$(get_status)</td></tr>
<tr><td>Cache Hit Rate</td><td>$(get_cache_hit_rate)%</td><td>&gt;25%</td><td>$(get_status)</td></tr>
<tr><td>Cost per Request</td><td>\$$(get_cost_per_request)</td><td>&lt;\$0.007</td><td>$(get_status)</td></tr>
</table>
EOF

# Email report
mail -s "Daily Performance Report - ${DATE}" \
     -a "Content-Type: text/html" \
     "${ADMIN_EMAIL}" < "$REPORT_FILE"
```

#### Weekly Performance Analysis
```bash
#!/bin/bash
# generate-weekly-performance-analysis.sh

WEEK_START=$(date -d '7 days ago' '+%Y-%m-%d')
WEEK_END=$(date '+%Y-%m-%d')

echo "Generating weekly performance analysis: ${WEEK_START} to ${WEEK_END}"

# Collect weekly metrics
./scripts/collect-weekly-metrics.sh \
    --start "$WEEK_START" \
    --end "$WEEK_END" \
    --output /tmp/weekly-metrics.json

# Generate trend analysis
./scripts/analyze-weekly-trends.sh \
    --input /tmp/weekly-metrics.json \
    --output /tmp/weekly-analysis.html

# Performance regression detection
./scripts/detect-weekly-regressions.sh \
    --input /tmp/weekly-metrics.json \
    --output /tmp/regression-analysis.json

# Send comprehensive report
./scripts/send-weekly-report.sh \
    --analysis /tmp/weekly-analysis.html \
    --regressions /tmp/regression-analysis.json
```

### Monthly Reports

#### Monthly Performance Review
```bash
#!/bin/bash
# generate-monthly-performance-review.sh

MONTH=$(date '+%Y-%m')
echo "Generating monthly performance review for: ${MONTH}"

# Comprehensive monthly analysis
./scripts/monthly-performance-analysis.sh \
    --month "$MONTH" \
    --include-trends \
    --include-costs \
    --include-forecasts \
    --output "/tmp/monthly-review-${MONTH}.pdf"

# Cost analysis
./scripts/monthly-cost-analysis.sh \
    --month "$MONTH" \
    --include-savings \
    --include-roi \
    --output "/tmp/cost-analysis-${MONTH}.csv"

# Optimization recommendations
./scripts/generate-optimization-recommendations.sh \
    --month "$MONTH" \
    --output "/tmp/optimization-recommendations-${MONTH}.md"

# Executive summary
./scripts/generate-executive-summary.sh \
    --month "$MONTH" \
    --output "/tmp/executive-summary-${MONTH}.pdf"
```

## Performance Regression Detection

### Statistical Monitoring

#### Automated Regression Detection
```python
# regression_detector.py
import numpy as np
from scipy import stats
import json
import sys

def detect_performance_regression(baseline_data, current_data, confidence_level=0.95):
    """
    Detect performance regression using statistical testing
    """
    results = {}

    # P95 Latency regression
    baseline_p95 = np.array(baseline_data['latency_p95'])
    current_p95 = np.array(current_data['latency_p95'])

    # Perform t-test
    t_stat, p_value = stats.ttest_ind(baseline_p95, current_p95)

    results['latency_regression'] = {
        'p_value': p_value,
        'significant': p_value < (1 - confidence_level),
        'direction': 'increase' if np.mean(current_p95) > np.mean(baseline_p95) else 'decrease',
        'magnitude': (np.mean(current_p95) - np.mean(baseline_p95)) / np.mean(baseline_p95)
    }

    # Token usage regression
    baseline_tokens = np.array(baseline_data['token_count'])
    current_tokens = np.array(current_data['token_count'])

    t_stat, p_value = stats.ttest_ind(baseline_tokens, current_tokens)

    results['token_regression'] = {
        'p_value': p_value,
        'significant': p_value < (1 - confidence_level),
        'direction': 'increase' if np.mean(current_tokens) > np.mean(baseline_tokens) else 'decrease',
        'magnitude': (np.mean(current_tokens) - np.mean(baseline_tokens)) / np.mean(baseline_tokens)
    }

    # Quality regression
    baseline_quality = np.array(baseline_data['quality_score'])
    current_quality = np.array(current_data['quality_score'])

    t_stat, p_value = stats.ttest_ind(baseline_quality, current_quality)

    results['quality_regression'] = {
        'p_value': p_value,
        'significant': p_value < (1 - confidence_level),
        'direction': 'decrease' if np.mean(current_quality) < np.mean(baseline_quality) else 'increase',
        'magnitude': (np.mean(current_quality) - np.mean(baseline_quality)) / np.mean(baseline_quality)
    }

    return results

# Usage
if __name__ == "__main__":
    baseline_file = sys.argv[1]
    current_file = sys.argv[2]

    with open(baseline_file) as f:
        baseline_data = json.load(f)

    with open(current_file) as f:
        current_data = json.load(f)

    results = detect_performance_regression(baseline_data, current_data)
    print(json.dumps(results, indent=2))
```

### Regression Alert Workflow

#### Automated Regression Monitoring
```bash
#!/bin/bash
# monitor-performance-regressions.sh

# Collect recent performance data
./scripts/collect-recent-performance-data.sh \
    --days 7 \
    --output /tmp/recent_performance.json

# Load baseline data
BASELINE_FILE="/var/lib/flowreader/baseline_performance.json"

# Run regression detection
REGRESSION_RESULTS=$(python3 scripts/regression_detector.py \
    "$BASELINE_FILE" \
    "/tmp/recent_performance.json")

# Check for significant regressions
LATENCY_REGRESSION=$(echo "$REGRESSION_RESULTS" | jq -r '.latency_regression.significant')
TOKEN_REGRESSION=$(echo "$REGRESSION_RESULTS" | jq -r '.token_regression.significant')
QUALITY_REGRESSION=$(echo "$REGRESSION_RESULTS" | jq -r '.quality_regression.significant')

# Alert on regressions
if [[ "$LATENCY_REGRESSION" == "true" ]]; then
    MAGNITUDE=$(echo "$REGRESSION_RESULTS" | jq -r '.latency_regression.magnitude')
    ./scripts/send-regression-alert.sh \
        --type "latency" \
        --magnitude "$MAGNITUDE" \
        --severity "warning"
fi

if [[ "$TOKEN_REGRESSION" == "true" ]]; then
    MAGNITUDE=$(echo "$REGRESSION_RESULTS" | jq -r '.token_regression.magnitude')
    ./scripts/send-regression-alert.sh \
        --type "token" \
        --magnitude "$MAGNITUDE" \
        --severity "warning"
fi

if [[ "$QUALITY_REGRESSION" == "true" ]]; then
    MAGNITUDE=$(echo "$REGRESSION_RESULTS" | jq -r '.quality_regression.magnitude')
    ./scripts/send-regression-alert.sh \
        --type "quality" \
        --magnitude "$MAGNITUDE" \
        --severity "critical"
fi
```

## Troubleshooting Procedures

### Common Performance Issues

#### High Latency Troubleshooting
```bash
# Step 1: Check current performance
./scripts/measure-perf-cost.sh --endpoint chat/stream --samples 20

# Step 2: Analyze latency distribution
./scripts/analyze-latency-distribution.sh --last 24h

# Step 3: Check cache performance
./scripts/check-cache-status.sh

# Step 4: Validate optimization configuration
./scripts/validate-optimization-config.sh

# Step 5: Check for system bottlenecks
./scripts/check-system-bottlenecks.sh

# Step 6: Restart optimization services if needed
./scripts/restart-optimization-services.sh
```

#### Token Usage Spike Troubleshooting
```bash
# Step 1: Analyze token usage patterns
./scripts/analyze-token-usage-patterns.sh --last 24h

# Step 2: Check optimization effectiveness
./scripts/check-token-optimization-status.sh

# Step 3: Review recent configuration changes
./scripts/review-config-changes.sh --last 48h

# Step 4: Validate token limits
./scripts/validate-token-limits.sh

# Step 5: Adjust optimization parameters if needed
./scripts/adjust-optimization-parameters.sh --token-focus
```

#### Quality Regression Troubleshooting
```bash
# Step 1: Run quality assessment
npx tsx api/_spikes/knowledge-quality-mock-test.ts

# Step 2: Analyze quality trends
./scripts/analyze-quality-trends.sh --last 7d

# Step 3: Check optimization impact on quality
./scripts/check-optimization-quality-impact.sh

# Step 4: Validate quality metrics
./scripts/validate-quality-metrics.sh

# Step 5: Consider optimization rollback if severe
./scripts/evaluate-optimization-rollback.sh --quality-focus
```

### Emergency Procedures

#### Complete Optimization Rollback
```bash
#!/bin/bash
# emergency-optimization-rollback.sh

echo "⚠️  EMERGENCY: Rolling back all performance optimizations"

# Disable all optimizations
export DISABLE_ALL_OPTIMIZATIONS=true
export ENABLE_CONTEXT_PRUNING=false
export ENABLE_RESPONSE_CACHING=false
export ENABLE_PROMPT_OPTIMIZATION=false
export ENABLE_MODEL_SELECTION=false

# Clear all caches
./scripts/clear-all-caches.sh

# Restart application services
./scripts/restart-application-services.sh

# Validate rollback
./scripts/validate-rollback-status.sh

# Monitor post-rollback performance
./scripts/monitor-performance.sh --interval 30 --duration 1800

echo "✅ Emergency rollback completed. Monitor performance for stability."
```

#### Performance Emergency Response
```bash
#!/bin/bash
# performance-emergency-response.sh

SEVERITY="$1"  # critical, high, medium

echo "🚨 Performance Emergency Response - Severity: ${SEVERITY}"

case "$SEVERITY" in
    "critical")
        # Immediate actions for critical performance issues
        ./scripts/emergency-optimization-rollback.sh
        ./scripts/notify-emergency-team.sh --severity critical
        ./scripts/start-incident-monitoring.sh --critical
        ;;
    "high")
        # Actions for high severity issues
        ./scripts/adjust-optimization-parameters.sh --conservative
        ./scripts/increase-monitoring-frequency.sh --high
        ./scripts/notify-operations-team.sh --severity high
        ;;
    "medium")
        # Actions for medium severity issues
        ./scripts/optimize-cache-settings.sh
        ./scripts/increase-monitoring-frequency.sh --medium
        ./scripts/notify-operations-team.sh --severity medium
        ;;
esac

# Log emergency response
echo "$(date): Emergency response executed for ${SEVERITY} severity issue" >> \
    /var/log/flowreader/emergency-responses.log
```

## Maintenance Procedures

### Regular Maintenance Tasks

#### Weekly Maintenance
```bash
#!/bin/bash
# weekly-maintenance.sh

echo "Starting weekly performance maintenance..."

# Update performance baselines
./scripts/update-performance-baselines.sh

# Optimize cache configurations
./scripts/optimize-cache-configurations.sh

# Clean up old performance logs
./scripts/cleanup-performance-logs.sh --older-than 30days

# Update monitoring thresholds based on trends
./scripts/update-monitoring-thresholds.sh

# Generate weekly performance report
./scripts/generate-weekly-performance-report.sh

echo "Weekly maintenance completed."
```

#### Monthly Maintenance
```bash
#!/bin/bash
# monthly-maintenance.sh

echo "Starting monthly performance maintenance..."

# Comprehensive performance analysis
./scripts/comprehensive-performance-analysis.sh

# Update optimization parameters based on learnings
./scripts/update-optimization-parameters.sh --data-driven

# Archive old performance data
./scripts/archive-performance-data.sh --older-than 3months

# Update performance documentation
./scripts/update-performance-documentation.sh

# Generate monthly executive report
./scripts/generate-monthly-executive-report.sh

echo "Monthly maintenance completed."
```

### Configuration Management

#### Performance Configuration Backup
```bash
#!/bin/bash
# backup-performance-configuration.sh

BACKUP_DIR="/var/backup/flowreader/performance"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')

mkdir -p "$BACKUP_DIR"

# Backup current configuration
cp /app/api/_lib/performance-config.ts \
   "$BACKUP_DIR/performance-config-${TIMESTAMP}.ts"

# Backup environment variables
env | grep -E "(ENABLE_|CACHE_|MAX_|THRESHOLD)" > \
    "$BACKUP_DIR/performance-env-${TIMESTAMP}.txt"

# Backup monitoring configuration
cp /etc/monitoring/performance-alerts.yml \
   "$BACKUP_DIR/performance-alerts-${TIMESTAMP}.yml"

# Create backup manifest
cat > "$BACKUP_DIR/backup-manifest-${TIMESTAMP}.json" << EOF
{
  "timestamp": "${TIMESTAMP}",
  "files": [
    "performance-config-${TIMESTAMP}.ts",
    "performance-env-${TIMESTAMP}.txt",
    "performance-alerts-${TIMESTAMP}.yml"
  ],
  "performance_metrics": {
    "p95_latency": "$(get_current_p95_latency)",
    "token_reduction": "$(get_current_token_reduction)",
    "quality_score": "$(get_current_quality_score)",
    "cache_hit_rate": "$(get_current_cache_hit_rate)"
  }
}
EOF

echo "Performance configuration backed up to: $BACKUP_DIR"
```

## Best Practices

### Monitoring Best Practices

1. **Continuous Monitoring**: Monitor key metrics 24/7
2. **Baseline Maintenance**: Update baselines monthly
3. **Alert Tuning**: Regularly review and adjust alert thresholds
4. **Documentation**: Keep monitoring procedures up-to-date
5. **Team Training**: Ensure team understands monitoring tools

### Performance Optimization Best Practices

1. **Gradual Changes**: Implement optimizations incrementally
2. **A/B Testing**: Validate optimizations before full deployment
3. **Quality Focus**: Never sacrifice quality for performance
4. **Documentation**: Document all optimization changes
5. **Rollback Readiness**: Always have rollback procedures ready

### Incident Response Best Practices

1. **Quick Assessment**: Rapidly assess incident severity
2. **Clear Communication**: Keep stakeholders informed
3. **Documentation**: Document all incident response actions
4. **Post-Incident Review**: Conduct thorough post-mortems
5. **Continuous Improvement**: Learn from each incident

---

*This monitoring guide ensures comprehensive oversight of FlowReader's performance optimizations, enabling proactive management and rapid response to any performance issues.*