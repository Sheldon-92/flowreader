# FlowReader Production Monitoring Suite

This directory contains a comprehensive monitoring and alerting system for FlowReader's production environment, providing 24-hour baseline monitoring, alert validation, security compliance tracking, and automated report generation.

## Overview

The monitoring suite establishes production baselines across multiple dimensions:
- **Health & Availability**: Application health checks and database connectivity
- **Performance Metrics**: Response times, latency percentiles, and error rates
- **Security Compliance**: Security headers, SSL/TLS configuration, and vulnerability assessment
- **Alert Validation**: End-to-end alert testing with delivery and recovery verification
- **Automated Reporting**: Statistical analysis, anomaly detection, and baseline recommendations

## Scripts Overview

| Script | Purpose | Usage |
|--------|---------|-------|
| `24h-monitor.sh` | Core 24-hour monitoring with real-time data collection | `./24h-monitor.sh [duration] [interval]` |
| `alert-validator.sh` | Alert delivery chain validation (trigger → alert → recovery) | `./alert-validator.sh [comprehensive|test|report]` |
| `report-generator.sh` | Statistical analysis and automated report generation | `./report-generator.sh [auto|generate|analyze]` |
| `security-monitor.sh` | Security compliance and vulnerability monitoring | `./security-monitor.sh [-u URL] [-d DIR]` |
| `dashboard.sh` | Real-time terminal dashboard for monitoring visualization | `./dashboard.sh [refresh_interval]` |

## Quick Start

### 1. Start 24-Hour Monitoring

```bash
# Start 24-hour monitoring with 5-minute intervals
./scripts/monitoring/24h-monitor.sh

# Custom monitoring: 12 hours with 2-minute intervals
./scripts/monitoring/24h-monitor.sh 43200 120

# Monitor with custom production URL
PRODUCTION_URL=https://custom.url.com ./scripts/monitoring/24h-monitor.sh
```

### 2. Validate Alert System

```bash
# Run comprehensive alert validation
./scripts/monitoring/alert-validator.sh comprehensive

# Test specific alert type
./scripts/monitoring/alert-validator.sh test p95_latency

# Generate validation report
./scripts/monitoring/alert-validator.sh report
```

### 3. Generate Performance Reports

```bash
# Auto-generate report from latest data
./scripts/monitoring/report-generator.sh

# Generate report from specific metrics file
./scripts/monitoring/report-generator.sh generate /path/to/metrics.json
```

### 4. Monitor Security Compliance

```bash
# Run security monitoring and establish baseline
./scripts/monitoring/security-monitor.sh

# Monitor custom URL
./scripts/monitoring/security-monitor.sh -u https://example.com
```

### 5. View Real-Time Dashboard

```bash
# Start dashboard with 30-second refresh
./scripts/monitoring/dashboard.sh

# Custom refresh interval (10 seconds)
./scripts/monitoring/dashboard.sh 10
```

## Monitoring Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   24h-monitor.sh    │───▶│   Data Collection   │───▶│   report-generator  │
│   (Core Monitoring) │    │   (JSON Metrics)    │    │   (Analysis)        │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
           │                          │                          │
           ▼                          ▼                          ▼
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  alert-validator.sh │    │   Real-time Alerts  │    │   Baseline Reports  │
│  (Alert Testing)    │    │   (Threshold Based) │    │   (MD + JSON)       │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
           │                          │                          │
           ▼                          ▼                          ▼
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ security-monitor.sh │    │   Security Events   │    │   dashboard.sh      │
│ (Security Baseline) │    │   (Compliance)      │    │   (Visualization)   │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## Detailed Script Documentation

### 24h-monitor.sh

**Purpose**: Core monitoring script that collects comprehensive metrics over a 24-hour period.

**Features**:
- Health endpoint monitoring with response time tracking
- Database connectivity verification
- Performance metrics (P50, P95, mean latency, error rates)
- Security headers compliance checking
- Real-time alert generation based on configurable thresholds
- JSON data export for analysis

**Usage**:
```bash
./24h-monitor.sh [DURATION] [INTERVAL]
```

**Parameters**:
- `DURATION`: Monitoring duration in seconds (default: 86400 = 24 hours)
- `INTERVAL`: Collection interval in seconds (default: 300 = 5 minutes)

**Environment Variables**:
- `PRODUCTION_URL`: Target URL for monitoring (default: https://flowreader.vercel.app)
- `P95_LATENCY_THRESHOLD`: P95 latency alert threshold in ms (default: 2000)
- `ERROR_RATE_THRESHOLD`: Error rate alert threshold in % (default: 5)

**Output Files**:
- Metrics JSON: `/tmp/flowreader-monitoring/metrics-YYYYMMDD-HHMMSS.json`
- Log file: `/tmp/flowreader-monitoring/24h-monitor.log`

### alert-validator.sh

**Purpose**: Validates the complete alert delivery chain from trigger detection through notification delivery to recovery confirmation.

**Features**:
- Alert trigger mechanism testing for all monitored metrics
- Notification channel validation (console, log, webhook simulation)
- Alert recovery detection and confirmation
- Comprehensive validation reporting
- Individual alert type testing capability

**Usage**:
```bash
./alert-validator.sh [COMMAND] [OPTIONS]
```

**Commands**:
- `comprehensive`: Run complete alert validation suite (default)
- `test <alert_type>`: Test specific alert type
- `report`: Generate validation report from existing logs

**Alert Types**:
- `p95_latency`: P95 response time alerts
- `health_check`: Health endpoint status alerts
- `error_rate`: Error rate threshold alerts
- `database`: Database connectivity alerts
- `security`: Security compliance alerts

**Output Files**:
- Validation log: `/tmp/flowreader-alert-validation/alert-validation-YYYYMMDD-HHMMSS.log`
- Validation report: `/tmp/flowreader-alert-validation/alert-validation-report-YYYYMMDD-HHMMSS.md`

### report-generator.sh

**Purpose**: Analyzes monitoring data and generates comprehensive baseline reports with statistical analysis and recommendations.

**Features**:
- Statistical analysis of monitoring metrics
- Anomaly detection and classification
- Performance baseline establishment
- Automated recommendations generation
- Multiple output formats (Markdown, JSON)

**Usage**:
```bash
./report-generator.sh [COMMAND] [OPTIONS]
```

**Commands**:
- `auto`: Auto-discover latest metrics and generate report (default)
- `generate <file>`: Generate report from specific metrics file
- `analyze <file>`: Analyze metrics file without generating full report

**Output Files**:
- Markdown report: `/tmp/flowreader-reports/24h-performance-report-YYYYMMDD-HHMMSS.md`
- JSON summary: `/tmp/flowreader-reports/24h-summary-YYYYMMDD-HHMMSS.json`

### security-monitor.sh

**Purpose**: Specialized monitoring for security compliance, vulnerability assessment, and security event pattern analysis.

**Features**:
- Security headers compliance checking (HSTS, CSP, X-Frame-Options, etc.)
- SSL/TLS configuration validation
- Certificate verification and expiry monitoring
- Vulnerability assessment and risk scoring
- Security pattern analysis and consistency checking
- Security baseline establishment

**Usage**:
```bash
./security-monitor.sh [OPTIONS]
```

**Options**:
- `-u, --url URL`: Set production URL
- `-d, --data-dir DIR`: Set data directory

**Output Files**:
- Security events log: `/tmp/flowreader-security-monitoring/security-events-YYYYMMDD-HHMMSS.log`
- Security baseline report: `/tmp/flowreader-security-monitoring/security-baseline-YYYYMMDD-HHMMSS.json`

### dashboard.sh

**Purpose**: Real-time terminal-based dashboard for visualizing monitoring data and system status.

**Features**:
- Real-time metrics visualization
- System health status indicators
- Performance trends with ASCII charts
- Active alerts display
- Statistical summaries
- Configurable refresh intervals

**Usage**:
```bash
./dashboard.sh [REFRESH_INTERVAL]
```

**Parameters**:
- `REFRESH_INTERVAL`: Dashboard refresh interval in seconds (default: 30)

**Controls**:
- `Ctrl+C`: Exit dashboard

## Configuration

### Baseline Thresholds

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| **P95 Latency** | ≤ 1500ms | > 2000ms | > 2500ms |
| **P50 Latency** | ≤ 1000ms | > 1500ms | > 2000ms |
| **Error Rate** | ≤ 1.0% | > 5.0% | > 10.0% |
| **Health Uptime** | ≥ 99.0% | < 98.0% | < 95.0% |
| **DB Uptime** | ≥ 99.5% | < 99.0% | < 98.0% |
| **Security Score** | ≥ 90/100 | < 80/100 | < 70/100 |

### Environment Variables

```bash
# Production configuration
export PRODUCTION_URL="https://flowreader.vercel.app"

# Alert thresholds
export P95_LATENCY_THRESHOLD=2000      # milliseconds
export P50_LATENCY_THRESHOLD=1500      # milliseconds
export ERROR_RATE_THRESHOLD=5          # percentage
export SECURITY_SCORE_THRESHOLD=80     # score out of 100

# Data directories
export MONITORING_DATA_DIR="/tmp/flowreader-monitoring"
export REPORTS_DIR="/tmp/flowreader-reports"
export SECURITY_DATA_DIR="/tmp/flowreader-security-monitoring"

# Alert delivery configuration
export ENABLE_CONSOLE_ALERTS=true
export ENABLE_LOG_ALERTS=true
export WEBHOOK_URL="https://hooks.slack.com/..."
```

## Data Formats

### Metrics JSON Structure

```json
{
  "monitoring_session": {
    "start_time": "2024-09-19T00:00:00Z",
    "duration_seconds": 86400,
    "interval_seconds": 300
  },
  "metrics": [
    {
      "timestamp": "2024-09-19T00:00:00Z",
      "health": {
        "status_code": 200,
        "response_time_ms": 245,
        "healthy": true
      },
      "database": {
        "healthy": true,
        "response_time_ms": 156
      },
      "performance": {
        "p50_latency_ms": 234,
        "p95_latency_ms": 456,
        "error_rate_percent": 0.0
      },
      "security": {
        "score": 100,
        "hsts": true,
        "csp": true
      },
      "alerts": {
        "p95_latency_alert": false,
        "health_alert": false
      }
    }
  ]
}
```

### Security Event Structure

```json
{
  "timestamp": "2024-09-19T00:00:00Z",
  "event_type": "security_headers_check",
  "compliance_score": 7,
  "compliance_percentage": 100.0,
  "headers_present": ["HSTS", "CSP", "X-Frame-Options"],
  "security_grade": "A+"
}
```

## Integration Examples

### CI/CD Pipeline Integration

```yaml
# GitHub Actions workflow
- name: Validate Production Monitoring
  run: |
    # Start monitoring
    ./scripts/monitoring/24h-monitor.sh 3600 60 &
    MONITOR_PID=$!

    # Wait for initial data collection
    sleep 120

    # Validate alerts
    ./scripts/monitoring/alert-validator.sh comprehensive

    # Generate report
    ./scripts/monitoring/report-generator.sh auto

    # Stop monitoring
    kill $MONITOR_PID
```

### Slack Integration

```bash
# Webhook notification example
send_slack_alert() {
    local alert_type="$1"
    local value="$2"
    local threshold="$3"

    curl -X POST -H 'Content-type: application/json' \
        --data "{
            \"text\":\"FlowReader Alert: $alert_type\",
            \"color\":\"warning\",
            \"fields\":[
                {\"title\":\"Value\",\"value\":\"$value\",\"short\":true},
                {\"title\":\"Threshold\",\"value\":\"$threshold\",\"short\":true}
            ]
        }" \
        "$SLACK_WEBHOOK_URL"
}
```

### Cron Job Setup

```bash
# Daily monitoring and reporting
0 0 * * * /path/to/scripts/monitoring/24h-monitor.sh 86400 300

# Hourly alert validation
0 * * * * /path/to/scripts/monitoring/alert-validator.sh comprehensive

# Weekly security monitoring
0 2 * * 0 /path/to/scripts/monitoring/security-monitor.sh

# Daily report generation
0 6 * * * /path/to/scripts/monitoring/report-generator.sh auto
```

## Troubleshooting

### Common Issues

#### No Monitoring Data
```bash
# Check if monitoring is running
ps aux | grep 24h-monitor.sh

# Verify data directory
ls -la /tmp/flowreader-monitoring/

# Check dependencies
which curl jq bc
```

#### Alert Validation Failures
```bash
# Test production connectivity
curl -I https://flowreader.vercel.app/api/health

# Check alert thresholds
echo "P95_LATENCY_THRESHOLD=$P95_LATENCY_THRESHOLD"

# Debug specific alert
./scripts/monitoring/alert-validator.sh test health_check
```

#### Report Generation Issues
```bash
# Verify metrics file format
jq empty /path/to/metrics.json

# Check for required data
jq '.metrics | length' /path/to/metrics.json

# Debug analysis
./scripts/monitoring/report-generator.sh analyze /path/to/metrics.json
```

### Dependencies

Required system dependencies:
- `curl`: HTTP client for API testing
- `jq`: JSON processor for data manipulation
- `bc`: Calculator for mathematical operations
- `openssl`: SSL/TLS analysis (optional, for security monitoring)

Install on Ubuntu/Debian:
```bash
sudo apt-get update
sudo apt-get install curl jq bc openssl
```

Install on macOS:
```bash
brew install curl jq bc openssl
```

## Performance Considerations

### Resource Usage

- **CPU**: Low impact, primarily I/O bound operations
- **Memory**: Minimal, streaming JSON processing
- **Disk**: Approximately 50MB per 24-hour monitoring session
- **Network**: ~1KB per monitoring cycle (every 5 minutes by default)

### Optimization Tips

1. **Monitoring Interval**: Adjust based on requirements vs. resource usage
2. **Data Retention**: Implement cleanup policies for old monitoring data
3. **Parallel Execution**: Run monitoring and reporting in parallel
4. **Caching**: Consider local caching for repeated API calls

## Security Considerations

### Data Protection

- Monitor logs may contain sensitive system information
- Implement log rotation and secure deletion
- Restrict access to monitoring data directories
- Use HTTPS for all external communications

### Access Control

```bash
# Secure monitoring directories
chmod 700 /tmp/flowreader-monitoring
chmod 700 /tmp/flowreader-reports
chmod 700 /tmp/flowreader-security-monitoring

# Restrict script execution
chmod 750 /path/to/scripts/monitoring/*.sh
```

## Future Enhancements

### Planned Features

1. **Machine Learning**: Anomaly detection using ML algorithms
2. **Predictive Alerts**: Alert on trending toward thresholds
3. **Dashboard Web UI**: Browser-based monitoring interface
4. **Mobile Notifications**: Push notifications for critical alerts
5. **Integration Plugins**: Grafana, Prometheus, Datadog connectors

### Contribution Guidelines

1. Follow existing code style and patterns
2. Add comprehensive error handling
3. Include usage documentation and examples
4. Test with both normal and edge case scenarios
5. Update this README with new features

## Support

For issues, questions, or contributions:

1. **Documentation**: Check `/docs/ops/` for additional monitoring guides
2. **Troubleshooting**: Review troubleshooting section above
3. **Logs**: Check monitoring logs for detailed error information
4. **Testing**: Use alert validator to verify system functionality

---

*This monitoring suite provides comprehensive production oversight for FlowReader, ensuring optimal performance, reliability, and security compliance.*