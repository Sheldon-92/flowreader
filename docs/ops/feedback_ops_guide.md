# FlowReader Feedback System Operations Guide

## Overview

The FlowReader Feedback System is a privacy-first user feedback collection platform designed to gather user insights while protecting user privacy and preventing abuse. This guide provides comprehensive instructions for operations teams to monitor, configure, and maintain the feedback system.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Privacy and Security](#privacy-and-security)
3. [Configuration Management](#configuration-management)
4. [Monitoring and Alerts](#monitoring-and-alerts)
5. [Data Management](#data-management)
6. [Troubleshooting](#troubleshooting)
7. [Standard Operating Procedures](#standard-operating-procedures)
8. [API Documentation](#api-documentation)
9. [Database Schema](#database-schema)
10. [Incident Response](#incident-response)

## System Architecture

### Components Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Frontend UI    │────│  API Endpoints   │────│   Database      │
│                 │    │                  │    │                 │
│ • FeedbackForm  │    │ • /submit        │    │ • feedback_     │
│ • FeedbackTrigger│   │ • /stats         │    │   submissions   │
│ • Dashboard     │    │ • Rate Limiting  │    │ • Views         │
│ • Admin Panel   │    │ • Validation     │    │ • Functions     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Key Features

- **Anonymous Collection**: No PII stored, ephemeral session tracking
- **Feature Toggles**: Gradual rollout controls (0-100% of users)
- **Rate Limiting**: Client and server-side abuse prevention
- **Privacy Controls**: Automatic PII detection and sanitization
- **Real-time Dashboard**: Operations monitoring and analytics

## Privacy and Security

### Data Protection Measures

#### 1. No PII Collection
- **Email addresses**: Automatically detected and rejected
- **Phone numbers**: Pattern matching prevents submission
- **Credit card numbers**: Blocked at validation layer
- **SSNs**: Filtered out during input processing

#### 2. Anonymous Session Tracking
```javascript
// Session ID generation (cryptographically secure)
sessionId: "a3f5d8e2c1b9..." // 32-character hex string
- Rotated every 24 hours
- Not linked to user accounts
- Used only for abuse detection
```

#### 3. Data Sanitization
- **User Agent**: Only browser name/version stored (`Chrome/91`)
- **Routes**: Sensitive parameters removed (`/read/[bookId]`)
- **IP Addresses**: Hashed for abuse detection only
- **Descriptions**: HTML stripped, XSS prevention

### Security Controls

#### Rate Limiting
```yaml
Limits:
  - Client-side: 5 requests per 15 minutes
  - Server-side: 5 requests per 15 minutes per IP
  - Session-based: 3 submissions per 24-hour session

Enforcement:
  - Local storage tracking (client)
  - Redis/memory cache (server)
  - Database session counter
```

#### Input Validation
```yaml
Validation Rules:
  type: ['bug', 'feature', 'general', 'praise']
  rating: 1-5 (integer)
  category: predefined list
  description: 10-1000 characters, PII-free
  sessionId: 16-64 character hex string
```

## Configuration Management

### Feature Toggle System

#### Access Configuration
```javascript
// Frontend access
import { FeedbackFeatureToggle } from '$lib/feedback';

// Check if enabled for current user
const isEnabled = FeedbackFeatureToggle.isEnabledForUser('/current/route');

// Get current configuration
const config = FeedbackFeatureToggle.getConfig();
```

#### Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Master switch for feedback system |
| `rolloutPercentage` | number | `10` | Percentage of users who see the system (0-100) |
| `maxSubmissionsPerSession` | number | `3` | Maximum submissions per 24-hour session |
| `allowedRoutes` | string[] | `['/read', '/library', '/']` | Routes where feedback is shown |

#### Updating Configuration

**Method 1: Admin Interface**
1. Navigate to feedback admin panel
2. Click "Configure Settings"
3. Update parameters
4. Save configuration
5. Changes apply immediately to new sessions

**Method 2: Direct API**
```javascript
// Update configuration programmatically
FeedbackFeatureToggle.updateConfig({
  enabled: true,
  rolloutPercentage: 25,
  maxSubmissionsPerSession: 5
});
```

### Rollout Strategy

#### Gradual Rollout Process
1. **Start Small**: Begin with 5-10% rollout
2. **Monitor Metrics**: Watch for issues in first 24 hours
3. **Increase Gradually**: 10% → 25% → 50% → 100%
4. **Stop if Issues**: Immediate rollback capability

#### Rollout Decision Logic
```javascript
// Consistent user assignment based on session ID hash
const userHash = simpleHash(sessionId) % 100;
const isInRollout = userHash < rolloutPercentage;
```

## Monitoring and Alerts

### Key Metrics to Monitor

#### 1. Submission Volume
```sql
-- Daily submission count
SELECT
  DATE(created_at) as date,
  COUNT(*) as submissions
FROM feedback_submissions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at);
```

#### 2. User Satisfaction
```sql
-- Average rating trend
SELECT
  DATE(created_at) as date,
  ROUND(AVG(rating), 2) as avg_rating,
  COUNT(*) as total_submissions
FROM feedback_submissions
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

#### 3. System Health
- API response times (`/api/feedback/submit`, `/api/feedback/stats`)
- Error rates (validation failures, database errors)
- Rate limiting triggers (abuse detection)

### Alert Thresholds

#### Critical Alerts
- **Zero submissions for 2+ hours**: System potentially down
- **Error rate > 25%**: API or database issues
- **Average rating < 2.0**: Severe user satisfaction problems

#### Warning Alerts
- **Submission volume spike > 300%**: Potential abuse
- **Average rating < 3.0**: User satisfaction declining
- **Rate limiting active > 10 users/hour**: High activity or abuse

### Dashboard Access

#### Real-time Monitoring
```url
# Operations dashboard
https://flowreader.app/admin/feedback

# Raw API data
https://flowreader.app/api/feedback/stats
```

#### Exported Reports
```javascript
// Generate daily report
const generateReport = async () => {
  const stats = await getFeedbackStats();
  const report = {
    date: new Date().toISOString().split('T')[0],
    totalSubmissions: stats.totalSubmissions,
    averageRating: stats.averageRating,
    topIssues: stats.submissionsByCategory,
    userSentiment: categorizeRatings(stats)
  };

  // Export as JSON or CSV
  exportReport(report);
};
```

## Data Management

### Database Schema

#### Primary Table: `feedback_submissions`
```sql
CREATE TABLE feedback_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('bug', 'feature', 'general', 'praise')),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    category VARCHAR(30) NOT NULL,
    description TEXT NOT NULL CHECK (LENGTH(description) >= 10 AND LENGTH(description) <= 1000),
    session_id VARCHAR(64) NOT NULL,
    ip_hash VARCHAR(16),
    user_agent VARCHAR(50),
    route VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Indexes for Performance
```sql
-- Query optimization indexes
CREATE INDEX idx_feedback_submissions_created_at ON feedback_submissions(created_at DESC);
CREATE INDEX idx_feedback_submissions_type ON feedback_submissions(type);
CREATE INDEX idx_feedback_submissions_rating ON feedback_submissions(rating);

-- Recent data optimization (30-day window)
CREATE INDEX idx_feedback_submissions_recent
ON feedback_submissions(created_at DESC, type, category)
WHERE created_at > NOW() - INTERVAL '30 days';
```

### Data Retention Policy

#### Automated Cleanup
```sql
-- Cleanup function (runs monthly)
CREATE OR REPLACE FUNCTION cleanup_old_feedback()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM feedback_submissions
    WHERE created_at < NOW() - INTERVAL '1 year';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
```

#### Manual Data Export
```bash
# Export feedback data for analysis
psql -h <host> -d <database> -c "
COPY (
  SELECT type, rating, category, description, created_at
  FROM feedback_submissions
  WHERE created_at > NOW() - INTERVAL '30 days'
) TO '/tmp/feedback_export.csv' WITH CSV HEADER;
"
```

## Troubleshooting

### Common Issues

#### 1. No Feedback Submissions
**Symptoms**: Zero submissions for extended period

**Diagnosis Steps**:
1. Check feature toggle configuration
```javascript
const config = FeedbackFeatureToggle.getConfig();
console.log('Enabled:', config.enabled);
console.log('Rollout:', config.rolloutPercentage + '%');
```

2. Verify API endpoints
```bash
curl -X GET https://flowreader.app/api/feedback/stats
curl -X POST https://flowreader.app/api/feedback/submit \
  -H "Content-Type: application/json" \
  -d '{"type":"general","rating":5,"category":"other","description":"test feedback","sessionId":"test123","timestamp":"2024-01-01T12:00:00Z"}'
```

3. Check database connectivity
```sql
SELECT COUNT(*) FROM feedback_submissions WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Solutions**:
- Enable feedback system: `FeedbackFeatureToggle.updateConfig({enabled: true})`
- Increase rollout percentage: `rolloutPercentage: 100`
- Verify database migrations are applied
- Check API server logs for errors

#### 2. High Error Rates
**Symptoms**: Many failed submissions, user complaints

**Diagnosis Steps**:
1. Check validation errors in logs
2. Monitor rate limiting triggers
3. Verify database performance
4. Test with known good data

**Solutions**:
- Relax validation rules if too strict
- Increase rate limits if legitimate traffic
- Optimize database queries
- Clear corrupted session data

#### 3. Spam/Abuse Detection
**Symptoms**: Unusual submission patterns, inappropriate content

**Diagnosis Steps**:
1. Review recent submissions by session
```sql
SELECT session_id, COUNT(*), array_agg(description)
FROM feedback_submissions
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY session_id
HAVING COUNT(*) > 5;
```

2. Check for PII leakage
```sql
SELECT id, description
FROM feedback_submissions
WHERE description ~* '\b[\w._%+-]+@[\w.-]+\.[A-Z|a-z]{2,}\b'
   OR description ~* '\b\d{3}-\d{2}-\d{4}\b';
```

**Solutions**:
- Block abusive sessions
- Enhance PII detection patterns
- Reduce rate limits temporarily
- Manual content review and cleanup

### Emergency Procedures

#### Immediate Disable
```javascript
// Emergency shutdown
FeedbackFeatureToggle.updateConfig({
  enabled: false,
  rolloutPercentage: 0
});
```

#### Database Emergency Cleanup
```sql
-- Remove all submissions from last hour (emergency only)
DELETE FROM feedback_submissions
WHERE created_at > NOW() - INTERVAL '1 hour';
```

## Standard Operating Procedures

### Daily Operations

#### Morning Checklist (9:00 AM)
1. Review overnight submission volume
2. Check average rating trend
3. Review any error alerts
4. Scan recent submissions for quality issues
5. Verify system health metrics

```bash
# Daily health check script
#!/bin/bash
echo "=== Daily Feedback System Health Check ==="
echo "Date: $(date)"
echo ""

# Check API health
echo "API Health:"
curl -s -w "Response time: %{time_total}s\n" https://flowreader.app/api/feedback/stats | head -1

# Check last 24h stats
echo "Last 24h submissions:"
psql -h $DB_HOST -d $DB_NAME -c "
SELECT
  COUNT(*) as total_submissions,
  ROUND(AVG(rating), 2) as avg_rating,
  COUNT(DISTINCT session_id) as unique_sessions
FROM feedback_submissions
WHERE created_at > NOW() - INTERVAL '24 hours';"
```

#### Weekly Review (Mondays)
1. Analyze weekly trends
2. Review configuration changes needed
3. Plan rollout adjustments
4. Identify improvement opportunities
5. Generate weekly report for stakeholders

### Monthly Maintenance

#### Data Housekeeping (First Monday)
1. Run cleanup procedures
2. Archive old data if needed
3. Review retention policies
4. Optimize database performance
5. Update documentation

#### Security Review (Second Monday)
1. Review PII detection effectiveness
2. Audit rate limiting logs
3. Check for new abuse patterns
4. Update validation rules if needed
5. Review access logs

## API Documentation

### Endpoints

#### Submit Feedback
```http
POST /api/feedback/submit
Content-Type: application/json

{
  "type": "bug|feature|general|praise",
  "rating": 1-5,
  "category": "usability|performance|ai-interaction|reading-experience|technical|other",
  "description": "User feedback text (10-1000 chars)",
  "sessionId": "32-character hex string",
  "timestamp": "ISO 8601 timestamp",
  "userAgent": "Browser/Version (optional)",
  "route": "/current/path (optional)"
}
```

**Response**:
```json
{
  "success": true,
  "submissionId": "uuid",
  "message": "Thank you for your feedback!"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Description too short",
  "retryAfter": 900
}
```

#### Get Statistics
```http
GET /api/feedback/stats?days=30&limit=50
Authorization: Bearer <jwt_token>
```

**Response**:
```json
{
  "totalSubmissions": 142,
  "averageRating": 4.2,
  "submissionsByType": {
    "bug": 23,
    "feature": 45,
    "general": 34,
    "praise": 40
  },
  "submissionsByCategory": {
    "usability": 38,
    "performance": 22,
    "ai-interaction": 45,
    "reading-experience": 28,
    "technical": 9
  },
  "ratingDistribution": {
    "1": 3,
    "2": 8,
    "3": 25,
    "4": 58,
    "5": 48
  },
  "submissionsByDay": [
    {"date": "2024-01-15", "count": 12},
    {"date": "2024-01-14", "count": 8}
  ],
  "recentSubmissions": [
    {
      "id": "uuid",
      "type": "feature",
      "rating": 4,
      "category": "ai-interaction",
      "description": "AI responses could be faster...",
      "created_at": "2024-01-15T10:30:00Z",
      "route": "/read/[bookId]"
    }
  ],
  "sessionStats": {
    "uniqueSessions": 89,
    "avgSubmissionsPerSession": 1.6,
    "topRoutes": [
      {"route": "/read/[bookId]", "count": 78},
      {"route": "/library", "count": 34}
    ]
  }
}
```

### Error Codes

| Code | Meaning | Action Required |
|------|---------|-----------------|
| 400 | Bad Request | Fix validation errors |
| 401 | Unauthorized | Check authentication |
| 429 | Rate Limited | Wait before retrying |
| 500 | Server Error | Check logs, contact admin |

## Incident Response

### Severity Levels

#### P0 - Critical (Response: Immediate)
- System completely down
- Data breach suspected
- Massive spam attack

**Response Steps**:
1. Disable feedback system immediately
2. Notify security team
3. Begin investigation
4. Communicate with stakeholders

#### P1 - High (Response: 1 hour)
- High error rates (>50%)
- Database issues
- Significant abuse detected

**Response Steps**:
1. Assess impact scope
2. Implement temporary mitigations
3. Begin detailed investigation
4. Plan permanent fix

#### P2 - Medium (Response: 4 hours)
- Moderate error rates (10-50%)
- Performance degradation
- Minor configuration issues

**Response Steps**:
1. Monitor for escalation
2. Schedule fix within business hours
3. Document issue for review

#### P3 - Low (Response: Next business day)
- Minor bugs
- Feature requests
- Documentation updates

### Contact Information

**Primary Contacts**:
- Operations Lead: ops-lead@flowreader.app
- Development Team: dev-team@flowreader.app
- Security Team: security@flowreader.app

**Escalation Path**:
1. Operations Engineer (0-30 min)
2. Operations Lead (30-60 min)
3. Engineering Manager (1-2 hours)
4. CTO (2+ hours or P0 incidents)

### Post-Incident Review

After resolving any P0 or P1 incident:

1. **Root Cause Analysis**: Document what went wrong and why
2. **Timeline Review**: Detailed incident timeline
3. **Response Evaluation**: How quickly was it resolved?
4. **Preventive Measures**: What can prevent recurrence?
5. **Documentation Updates**: Update runbooks and procedures

## Appendix

### Useful SQL Queries

#### User Sentiment Analysis
```sql
-- Categorize feedback by sentiment
SELECT
  CASE
    WHEN rating >= 4 THEN 'Positive'
    WHEN rating = 3 THEN 'Neutral'
    ELSE 'Negative'
  END as sentiment,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM feedback_submissions
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY count DESC;
```

#### Top Issues by Category
```sql
-- Find most common issues
SELECT
  category,
  type,
  COUNT(*) as frequency,
  ROUND(AVG(rating), 2) as avg_rating
FROM feedback_submissions
WHERE created_at > NOW() - INTERVAL '7 days'
  AND rating <= 3
GROUP BY category, type
ORDER BY frequency DESC
LIMIT 10;
```

#### Session Analysis
```sql
-- Analyze submission patterns by session
SELECT
  session_id,
  COUNT(*) as submission_count,
  MIN(created_at) as first_submission,
  MAX(created_at) as last_submission,
  array_agg(DISTINCT type) as feedback_types,
  ROUND(AVG(rating), 2) as avg_rating
FROM feedback_submissions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY session_id
HAVING COUNT(*) > 1
ORDER BY submission_count DESC;
```

### Configuration Templates

#### Production Configuration
```json
{
  "enabled": true,
  "rolloutPercentage": 100,
  "maxSubmissionsPerSession": 3,
  "allowedRoutes": ["/read", "/library", "/"]
}
```

#### Staging Configuration
```json
{
  "enabled": true,
  "rolloutPercentage": 100,
  "maxSubmissionsPerSession": 10,
  "allowedRoutes": []
}
```

#### Emergency Disable
```json
{
  "enabled": false,
  "rolloutPercentage": 0,
  "maxSubmissionsPerSession": 0,
  "allowedRoutes": []
}
```

---

**Document Version**: 1.0
**Last Updated**: 2024-01-15
**Next Review**: 2024-02-15
**Maintained By**: FlowReader Operations Team