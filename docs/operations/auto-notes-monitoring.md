# Auto Notes Operational Monitoring & Maintenance

## Overview

This guide provides comprehensive operational guidance for monitoring, maintaining, and troubleshooting the T6-NOTES-AUTO system in production environments. It covers performance monitoring, error tracking, capacity planning, and maintenance procedures.

## System Architecture Monitoring

### Key Components to Monitor

1. **API Endpoint Performance** (`/api/notes/auto`)
2. **T5 Knowledge Enhancement Integration**
3. **T7 Dialog History Integration**
4. **Database Performance** (notes table operations)
5. **Rate Limiting System**
6. **Caching Layer**
7. **Authentication & Authorization**

## Performance Monitoring

### Core Metrics

#### Response Time Metrics
```bash
# Key performance indicators
- P50 Response Time: <3 seconds target
- P95 Response Time: <10 seconds target
- P99 Response Time: <15 seconds target
- Timeout Rate: <1% target
```

#### Throughput Metrics
```bash
# Request volume indicators
- Requests per minute: Monitor for traffic patterns
- Concurrent requests: Track peak usage
- Queue depth: Monitor processing backlog
- Success rate: >95% target
```

#### Quality Metrics
```bash
# Content quality indicators
- Average confidence score: >0.75 target
- Low quality rate: <10% (confidence <0.6)
- Enhancement success rate: >90% for T5 integration
- Dialog summary success rate: >85% for T7 integration
```

### Monitoring Implementation

#### Application Performance Monitoring (APM)

```typescript
// monitoring/AutoNotesMonitoring.ts
import { MetricsCollector } from '../lib/MetricsCollector';
import { AlertManager } from '../lib/AlertManager';

export class AutoNotesMonitoring {
  private metrics: MetricsCollector;
  private alerts: AlertManager;

  constructor() {
    this.metrics = new MetricsCollector('auto_notes');
    this.alerts = new AlertManager();
    this.setupMetrics();
  }

  private setupMetrics() {
    // Response time histogram
    this.metrics.createHistogram('auto_notes_response_time', {
      help: 'Auto notes response time in milliseconds',
      buckets: [100, 500, 1000, 3000, 5000, 10000, 15000, 30000]
    });

    // Success rate counter
    this.metrics.createCounter('auto_notes_requests_total', {
      help: 'Total auto notes requests',
      labelNames: ['method', 'status', 'intent']
    });

    // Confidence score gauge
    this.metrics.createGauge('auto_notes_confidence_score', {
      help: 'Auto notes confidence score'
    });

    // Rate limiting gauge
    this.metrics.createGauge('auto_notes_rate_limit_usage', {
      help: 'Rate limit usage percentage',
      labelNames: ['user_id']
    });
  }

  recordAutoNoteRequest(data: {
    method: string;
    status: number;
    responseTime: number;
    confidence?: number;
    intent?: string;
    userId: string;
  }) {
    // Record response time
    this.metrics.histogram('auto_notes_response_time').observe(data.responseTime);

    // Record request outcome
    this.metrics.counter('auto_notes_requests_total').inc({
      method: data.method,
      status: data.status.toString(),
      intent: data.intent || 'none'
    });

    // Record quality metrics
    if (data.confidence !== undefined) {
      this.metrics.gauge('auto_notes_confidence_score').set(data.confidence);

      // Alert on low quality
      if (data.confidence < 0.6) {
        this.alerts.lowQualityGeneration(data);
      }
    }

    // Check for performance issues
    if (data.responseTime > 15000) {
      this.alerts.slowResponse(data);
    }

    if (data.status >= 500) {
      this.alerts.systemError(data);
    }
  }
}
```

#### Health Check Endpoints

```typescript
// health/AutoNotesHealthCheck.ts
export class AutoNotesHealthCheck {
  async checkHealth(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkApiEndpoint(),
      this.checkT5Integration(),
      this.checkT7Integration(),
      this.checkDatabaseHealth(),
      this.checkRateLimiting(),
      this.checkCaching()
    ]);

    return this.aggregateHealthStatus(checks);
  }

  private async checkApiEndpoint(): Promise<ComponentHealth> {
    try {
      const startTime = Date.now();

      // Minimal health check request
      const response = await fetch('/api/notes/auto', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HEALTH_CHECK_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bookId: process.env.HEALTH_CHECK_BOOK_ID,
          selection: { text: 'health check' }
        })
      });

      const responseTime = Date.now() - startTime;

      return {
        component: 'api_endpoint',
        status: response.ok ? 'healthy' : 'unhealthy',
        responseTime,
        details: { statusCode: response.status }
      };

    } catch (error) {
      return {
        component: 'api_endpoint',
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  private async checkT5Integration(): Promise<ComponentHealth> {
    try {
      // Test T5 knowledge enhancement
      const enhancer = new KnowledgeEnhancer();
      const testResult = await enhancer.healthCheck();

      return {
        component: 't5_integration',
        status: testResult.available ? 'healthy' : 'unhealthy',
        details: testResult
      };

    } catch (error) {
      return {
        component: 't5_integration',
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  private async checkT7Integration(): Promise<ComponentHealth> {
    try {
      // Test dialog history query
      const { data, error } = await supabaseAdmin
        .from('dialog_messages')
        .select('id')
        .limit(1);

      return {
        component: 't7_integration',
        status: !error ? 'healthy' : 'unhealthy',
        details: { querySuccessful: !error }
      };

    } catch (error) {
      return {
        component: 't7_integration',
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}
```

## Error Monitoring & Alerting

### Error Categories

#### High Priority Alerts
```yaml
# alerts/auto-notes-high.yml
alerts:
  - name: AutoNotesHighErrorRate
    condition: error_rate > 0.1  # >10% errors
    duration: 5m
    severity: critical
    description: "Auto notes error rate exceeds 10%"

  - name: AutoNotesSlowResponse
    condition: p95_response_time > 15000  # >15s
    duration: 3m
    severity: warning
    description: "Auto notes P95 response time exceeds 15 seconds"

  - name: AutoNotesT5Failure
    condition: t5_integration_errors > 5
    duration: 2m
    severity: critical
    description: "Multiple T5 knowledge enhancement failures"
```

#### Medium Priority Alerts
```yaml
# alerts/auto-notes-medium.yml
alerts:
  - name: AutoNotesLowQuality
    condition: avg_confidence < 0.6
    duration: 10m
    severity: warning
    description: "Auto notes average confidence below threshold"

  - name: AutoNotesRateLimit
    condition: rate_limit_rejections > 20
    duration: 5m
    severity: warning
    description: "High rate limit rejection rate"
```

### Error Tracking Implementation

```typescript
// monitoring/ErrorTracker.ts
export class AutoNotesErrorTracker {
  private errorLog: ErrorEvent[] = [];
  private errorPatterns: Map<string, ErrorPattern> = new Map();

  trackError(error: {
    type: string;
    message: string;
    userId?: string;
    bookId?: string;
    requestData?: any;
    stack?: string;
    timestamp: Date;
  }) {
    // Log error
    this.errorLog.push(error);

    // Detect error patterns
    this.detectErrorPattern(error);

    // Send to external monitoring
    this.sendToErrorTracking(error);

    // Trigger alerts if needed
    this.checkAlertConditions(error);
  }

  private detectErrorPattern(error: ErrorEvent) {
    const pattern = this.classifyError(error);
    const key = `${pattern.type}_${pattern.subtype}`;

    if (!this.errorPatterns.has(key)) {
      this.errorPatterns.set(key, {
        type: pattern.type,
        subtype: pattern.subtype,
        count: 0,
        firstSeen: error.timestamp,
        lastSeen: error.timestamp,
        affectedUsers: new Set()
      });
    }

    const patternData = this.errorPatterns.get(key)!;
    patternData.count++;
    patternData.lastSeen = error.timestamp;

    if (error.userId) {
      patternData.affectedUsers.add(error.userId);
    }

    // Alert on new error patterns
    if (patternData.count === 1) {
      this.alertNewErrorPattern(patternData);
    }

    // Alert on error spikes
    if (this.isErrorSpike(patternData)) {
      this.alertErrorSpike(patternData);
    }
  }

  getErrorSummary(timeRange: { start: Date; end: Date }) {
    const errors = this.errorLog.filter(e =>
      e.timestamp >= timeRange.start && e.timestamp <= timeRange.end
    );

    return {
      totalErrors: errors.length,
      errorsByType: this.groupErrorsByType(errors),
      errorsByUser: this.groupErrorsByUser(errors),
      topErrors: this.getTopErrors(errors),
      errorTrends: this.calculateErrorTrends(errors)
    };
  }
}
```

## Performance Optimization

### Database Performance

#### Query Optimization
```sql
-- Monitor slow queries for auto notes
-- notes table operations
EXPLAIN ANALYZE SELECT * FROM notes
WHERE user_id = $1 AND book_id = $2 AND source = 'auto'
ORDER BY created_at DESC LIMIT 20;

-- dialog_messages queries for T7 integration
EXPLAIN ANALYZE SELECT * FROM dialog_messages
WHERE user_id = $1 AND book_id = $2
ORDER BY created_at DESC LIMIT 10;
```

#### Index Monitoring
```sql
-- Check index usage for auto notes queries
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename IN ('notes', 'dialog_messages')
ORDER BY idx_scan DESC;

-- Monitor index bloat
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE tablename IN ('notes', 'dialog_messages');
```

### Caching Performance

#### Cache Hit Rate Monitoring
```typescript
// monitoring/CacheMonitoring.ts
export class CacheMonitoring {
  private hitRate: number = 0;
  private missRate: number = 0;

  recordCacheHit() {
    this.hitRate++;
    this.updateMetrics();
  }

  recordCacheMiss() {
    this.missRate++;
    this.updateMetrics();
  }

  private updateMetrics() {
    const total = this.hitRate + this.missRate;
    const hitRatio = total > 0 ? this.hitRate / total : 0;

    // Target: >80% cache hit rate
    if (hitRatio < 0.8) {
      this.alertLowCacheHitRate(hitRatio);
    }

    // Export metrics
    this.exportCacheMetrics({
      hitRate: this.hitRate,
      missRate: this.missRate,
      hitRatio
    });
  }

  analyzeCachePatterns() {
    return {
      mostCachedSelections: this.getMostCachedSelections(),
      cacheEvictionRate: this.getCacheEvictionRate(),
      optimalTTL: this.calculateOptimalTTL(),
      cacheSize: this.getCurrentCacheSize()
    };
  }
}
```

## Capacity Planning

### Resource Usage Projections

#### Traffic Growth Planning
```typescript
// planning/CapacityPlanner.ts
export class AutoNotesCapacityPlanner {
  calculateResourceNeeds(projections: {
    expectedUsers: number;
    notesPerUserPerDay: number;
    growthRate: number;
    timeHorizon: number; // months
  }) {
    const dailyRequests = projections.expectedUsers * projections.notesPerUserPerDay;
    const peakHourlyRequests = dailyRequests * 0.15; // 15% of daily in peak hour

    // Account for growth
    const futureRequests = peakHourlyRequests * Math.pow(1 + projections.growthRate, projections.timeHorizon);

    return {
      current: {
        dailyRequests,
        peakHourlyRequests,
        requiredCapacity: Math.ceil(peakHourlyRequests / 3600 * 10) // 10x buffer
      },
      future: {
        projectedDailyRequests: dailyRequests * Math.pow(1 + projections.growthRate, projections.timeHorizon),
        projectedPeakHourly: futureRequests,
        requiredCapacity: Math.ceil(futureRequests / 3600 * 10)
      },
      recommendations: this.generateRecommendations(futureRequests)
    };
  }

  private generateRecommendations(futureLoad: number) {
    const recommendations = [];

    if (futureLoad > 1000) {
      recommendations.push('Consider implementing request queuing');
    }

    if (futureLoad > 5000) {
      recommendations.push('Scale T5 knowledge enhancement service');
      recommendations.push('Implement horizontal scaling for API endpoints');
    }

    if (futureLoad > 10000) {
      recommendations.push('Consider regional deployment');
      recommendations.push('Implement advanced caching strategies');
    }

    return recommendations;
  }
}
```

### Resource Scaling Guidelines

#### Horizontal Scaling Triggers
```yaml
# scaling/auto-notes-scaling.yml
scaling_rules:
  scale_out:
    - metric: avg_response_time
      threshold: 8000  # 8 seconds
      duration: 300    # 5 minutes
      action: add_instance

    - metric: request_queue_depth
      threshold: 100
      duration: 120    # 2 minutes
      action: add_instance

    - metric: cpu_utilization
      threshold: 80    # 80%
      duration: 300    # 5 minutes
      action: add_instance

  scale_in:
    - metric: avg_response_time
      threshold: 2000  # 2 seconds
      duration: 600    # 10 minutes
      action: remove_instance

    - metric: cpu_utilization
      threshold: 30    # 30%
      duration: 900    # 15 minutes
      action: remove_instance
```

## Maintenance Procedures

### Regular Maintenance Tasks

#### Daily Tasks
```bash
#!/bin/bash
# scripts/auto-notes-daily-maintenance.sh

echo "Starting daily auto notes maintenance..."

# Check system health
echo "1. Checking system health..."
curl -s http://localhost:5173/health/auto-notes | jq '.'

# Monitor error rates
echo "2. Checking error rates..."
node scripts/check-error-rates.js --hours 24

# Verify T5/T7 integration health
echo "3. Checking integrations..."
node scripts/check-integrations.js

# Clean up old cache entries
echo "4. Cleaning cache..."
node scripts/clean-cache.js --older-than 24h

# Generate daily report
echo "5. Generating daily report..."
node scripts/generate-daily-report.js

echo "Daily maintenance completed."
```

#### Weekly Tasks
```bash
#!/bin/bash
# scripts/auto-notes-weekly-maintenance.sh

echo "Starting weekly auto notes maintenance..."

# Analyze performance trends
echo "1. Analyzing performance trends..."
node scripts/analyze-performance-trends.js --days 7

# Review error patterns
echo "2. Reviewing error patterns..."
node scripts/analyze-error-patterns.js --days 7

# Optimize database
echo "3. Optimizing database..."
psql -d flowreader -f scripts/optimize-auto-notes-db.sql

# Update capacity planning
echo "4. Updating capacity planning..."
node scripts/update-capacity-planning.js

# Archive old logs
echo "5. Archiving logs..."
node scripts/archive-logs.js --older-than 7d

echo "Weekly maintenance completed."
```

#### Monthly Tasks
```bash
#!/bin/bash
# scripts/auto-notes-monthly-maintenance.sh

echo "Starting monthly auto notes maintenance..."

# Comprehensive performance review
echo "1. Performance review..."
node scripts/monthly-performance-review.js

# Security audit
echo "2. Security audit..."
node scripts/security-audit.js --component auto-notes

# Capacity planning update
echo "3. Capacity planning..."
node scripts/comprehensive-capacity-planning.js

# Documentation review
echo "4. Documentation review..."
node scripts/check-documentation-freshness.js

echo "Monthly maintenance completed."
```

### Troubleshooting Procedures

#### Common Issues & Resolutions

**Issue: High Response Times**
```bash
# Diagnosis steps
1. Check T5 knowledge enhancement service status
2. Monitor database query performance
3. Verify rate limiting is not causing delays
4. Check for memory/CPU constraints

# Resolution steps
curl -X GET "http://localhost:5173/health/t5-knowledge"
psql -d flowreader -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
node scripts/check-rate-limit-usage.js
htop  # Check system resources
```

**Issue: Low Quality Notes (Confidence < 0.6)**
```bash
# Diagnosis steps
1. Analyze input text quality
2. Check T5 enhancement parameters
3. Review recent model updates
4. Verify training data relevance

# Resolution steps
node scripts/analyze-low-quality-notes.js --days 1
node scripts/check-t5-model-version.js
node scripts/review-enhancement-parameters.js
```

**Issue: Rate Limit Errors**
```bash
# Diagnosis steps
1. Check rate limit configuration
2. Analyze user request patterns
3. Verify rate limit bypass for health checks
4. Monitor for abuse patterns

# Resolution steps
redis-cli GET "auto_notes_rate_limit:*"
node scripts/analyze-rate-limit-usage.js
node scripts/check-abuse-patterns.js
```

### Disaster Recovery

#### Backup Procedures
```bash
#!/bin/bash
# scripts/backup-auto-notes-data.sh

# Backup auto notes from database
pg_dump -h localhost -U postgres -d flowreader \
  --table=notes \
  --where="source='auto'" \
  > backups/auto-notes-$(date +%Y%m%d).sql

# Backup cache data
redis-cli --rdb backups/auto-notes-cache-$(date +%Y%m%d).rdb

# Backup configuration
cp config/auto-notes.yml backups/auto-notes-config-$(date +%Y%m%d).yml
```

#### Recovery Procedures
```bash
#!/bin/bash
# scripts/recover-auto-notes.sh

# Restore database data
psql -h localhost -U postgres -d flowreader < backups/auto-notes-${1}.sql

# Restore cache data
redis-cli --rdb backups/auto-notes-cache-${1}.rdb

# Verify restoration
node scripts/verify-auto-notes-recovery.js

echo "Auto notes recovery completed. Running health checks..."
curl -X GET "http://localhost:5173/health/auto-notes"
```

This comprehensive monitoring and maintenance guide ensures reliable operation of the auto notes system in production environments.