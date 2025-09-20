# FlowReader Weekly Operations Report Template

**Report Period**: Week of [START_DATE] to [END_DATE]
**Generated**: [GENERATION_DATE]
**Report Version**: 1.0
**Status**: [OVERALL_STATUS: 🟢 Healthy / 🟡 Warning / 🔴 Critical]

---

## Executive Summary

### Service Level Objectives (SLO) Performance

- **Overall SLO Compliance**: [OVERALL_COMPLIANCE]% (Target: ≥95%)
- **Critical SLO Violations**: [CRITICAL_VIOLATIONS] incidents
- **Error Budget Status**: [ERROR_BUDGET_STATUS]
- **Week-over-Week Trend**: [TREND_DIRECTION] [TREND_PERCENTAGE]%

### Key Highlights

- ✅ **Achievements**: [KEY_ACHIEVEMENTS]
- ⚠️ **Concerns**: [KEY_CONCERNS]
- 🎯 **Action Items**: [PRIORITY_ACTIONS]

---

## SLO Compliance Dashboard

### Primary SLOs

| Metric | Target | This Week | Last Week | Trend | Status |
|--------|--------|-----------|-----------|-------|--------|
| **System Availability** | ≥99.5% | [AVAILABILITY_CURRENT]% | [AVAILABILITY_PREVIOUS]% | [AVAILABILITY_TREND] | [AVAILABILITY_STATUS] |
| **P95 Latency** | ≤1500ms | [P95_CURRENT]ms | [P95_PREVIOUS]ms | [P95_TREND] | [P95_STATUS] |
| **P99 Latency** | ≤2500ms | [P99_CURRENT]ms | [P99_PREVIOUS]ms | [P99_TREND] | [P99_STATUS] |
| **Error Rate** | ≤1.0% | [ERROR_RATE_CURRENT]% | [ERROR_RATE_PREVIOUS]% | [ERROR_RATE_TREND] | [ERROR_RATE_STATUS] |
| **Dialog Success Rate** | ≥95.0% | [DIALOG_SUCCESS_CURRENT]% | [DIALOG_SUCCESS_PREVIOUS]% | [DIALOG_SUCCESS_TREND] | [DIALOG_SUCCESS_STATUS] |
| **Security Compliance** | 100% | [SECURITY_CURRENT]% | [SECURITY_PREVIOUS]% | [SECURITY_TREND] | [SECURITY_STATUS] |

### Secondary SLOs

| Metric | Target | This Week | Status | Notes |
|--------|--------|-----------|--------|-------|
| **Database Availability** | ≥99.5% | [DB_AVAILABILITY]% | [DB_STATUS] | [DB_NOTES] |
| **API Response Success** | ≥99.9% | [API_SUCCESS]% | [API_STATUS] | [API_NOTES] |
| **Cost Efficiency** | ≤$0.007/req | $[COST_PER_REQUEST] | [COST_STATUS] | [COST_NOTES] |

---

## Error Budget Analysis

### Current Error Budget Status

```
Availability Error Budget (30-day window):
├── Target Reliability: 99.5% (216 minutes/month allowance)
├── Current Consumption: [ERROR_BUDGET_CONSUMED]% ([ERROR_BUDGET_MINUTES] minutes)
├── Remaining Budget: [ERROR_BUDGET_REMAINING]% ([ERROR_BUDGET_REMAINING_MINUTES] minutes)
└── Burn Rate: [BURN_RATE]x normal (Last 7 days)

Status: [ERROR_BUDGET_HEALTH] [ERROR_BUDGET_ICON]
```

### Error Budget Allocation This Week

| Category | Minutes Consumed | Percentage | Description |
|----------|------------------|------------|-------------|
| **Planned Maintenance** | [PLANNED_MINUTES] | [PLANNED_PERCENT]% | [PLANNED_DESCRIPTION] |
| **Deployment Issues** | [DEPLOYMENT_MINUTES] | [DEPLOYMENT_PERCENT]% | [DEPLOYMENT_DESCRIPTION] |
| **Infrastructure Issues** | [INFRASTRUCTURE_MINUTES] | [INFRASTRUCTURE_PERCENT]% | [INFRASTRUCTURE_DESCRIPTION] |
| **Third-party Outages** | [THIRD_PARTY_MINUTES] | [THIRD_PARTY_PERCENT]% | [THIRD_PARTY_DESCRIPTION] |
| **Unplanned Incidents** | [UNPLANNED_MINUTES] | [UNPLANNED_PERCENT]% | [UNPLANNED_DESCRIPTION] |
| **Total Consumption** | **[TOTAL_MINUTES]** | **[TOTAL_PERCENT]%** | |

### Error Budget Burn Rate Analysis

- **Fast Burn Events**: [FAST_BURN_COUNT] (>14.4x normal rate)
- **Slow Burn Periods**: [SLOW_BURN_COUNT] (1-14.4x normal rate)
- **Projected Budget Exhaustion**: [PROJECTION_DATE] (if current trend continues)

---

## Incident Summary

### Critical Incidents (SEV-1)

| Date | Duration | Impact | Root Cause | Resolution | SLO Impact |
|------|----------|---------|------------|------------|------------|
[CRITICAL_INCIDENTS_TABLE]

### Major Incidents (SEV-2)

| Date | Duration | Impact | Root Cause | Resolution | SLO Impact |
|------|----------|---------|------------|------------|------------|
[MAJOR_INCIDENTS_TABLE]

### Incident Metrics

- **Mean Time to Detection (MTTD)**: [MTTD] minutes
- **Mean Time to Resolution (MTTR)**: [MTTR] minutes
- **Mean Time Between Failures (MTBF)**: [MTBF] hours
- **Customer Notifications Sent**: [CUSTOMER_NOTIFICATIONS]
- **Postmortem Completion Rate**: [POSTMORTEM_COMPLETION]%

---

## Performance Analysis

### Latency Trends

```
P95 Latency Trends (7-day moving average):
[LATENCY_GRAPH_PLACEHOLDER]

Key Observations:
- Peak Latency: [PEAK_LATENCY]ms at [PEAK_TIME]
- Lowest Latency: [LOW_LATENCY]ms at [LOW_TIME]
- Average Improvement: [LATENCY_IMPROVEMENT]% vs last week
```

### Error Rate Analysis

- **Total Requests**: [TOTAL_REQUESTS] (vs [PREVIOUS_REQUESTS] last week)
- **Error Requests**: [ERROR_REQUESTS] ([ERROR_RATE_WEEKLY]% error rate)
- **Top Error Categories**:
  1. [ERROR_CATEGORY_1]: [ERROR_COUNT_1] ([ERROR_PERCENT_1]%)
  2. [ERROR_CATEGORY_2]: [ERROR_COUNT_2] ([ERROR_PERCENT_2]%)
  3. [ERROR_CATEGORY_3]: [ERROR_COUNT_3] ([ERROR_PERCENT_3]%)

### Quality Metrics

- **Dialog Success Rate**: [DIALOG_SUCCESS_RATE]%
- **Knowledge Enhancement Quality**: [KNOWLEDGE_QUALITY]%
- **User Satisfaction Score**: [USER_SATISFACTION]/5.0
- **Quality Regression Events**: [QUALITY_REGRESSIONS]

---

## Security & Compliance

### Security Compliance Status

| Security Control | Compliance | Status | Notes |
|------------------|------------|--------|-------|
| **HTTPS Enforcement** | [HTTPS_COMPLIANCE]% | [HTTPS_STATUS] | [HTTPS_NOTES] |
| **HSTS Headers** | [HSTS_COMPLIANCE]% | [HSTS_STATUS] | [HSTS_NOTES] |
| **CSP Headers** | [CSP_COMPLIANCE]% | [CSP_STATUS] | [CSP_NOTES] |
| **Security Headers** | [SECURITY_HEADERS_COMPLIANCE]% | [SECURITY_HEADERS_STATUS] | [SECURITY_HEADERS_NOTES] |
| **Certificate Validity** | [CERT_VALIDITY] days remaining | [CERT_STATUS] | [CERT_NOTES] |

### Security Events

- **Security Alerts**: [SECURITY_ALERTS] (vs [PREVIOUS_SECURITY_ALERTS] last week)
- **Failed Authentication Attempts**: [FAILED_AUTH]
- **Suspicious Activity Events**: [SUSPICIOUS_EVENTS]
- **Vulnerability Scans**: [VULN_SCANS] completed

---

## Operational Metrics

### Deployment Activity

| Date | Version | Type | Success | Rollback | Impact | SLO Effect |
|------|---------|------|---------|----------|--------|------------|
[DEPLOYMENT_TABLE]

### Deployment Success Rate
- **Total Deployments**: [TOTAL_DEPLOYMENTS]
- **Successful Deployments**: [SUCCESSFUL_DEPLOYMENTS] ([DEPLOYMENT_SUCCESS_RATE]%)
- **Rollbacks Required**: [ROLLBACKS] ([ROLLBACK_RATE]%)
- **Average Deployment Time**: [AVG_DEPLOYMENT_TIME] minutes

### Monitoring & Alerting

- **Total Alerts Fired**: [TOTAL_ALERTS]
- **Critical Alerts**: [CRITICAL_ALERTS] ([CRITICAL_ALERT_RATE]%)
- **False Positive Rate**: [FALSE_POSITIVE_RATE]%
- **Alert Response Time**: [ALERT_RESPONSE_TIME] minutes (avg)
- **Alert Resolution Time**: [ALERT_RESOLUTION_TIME] minutes (avg)

### Infrastructure Health

| Component | Availability | Performance | Status | Notes |
|-----------|--------------|-------------|--------|-------|
| **Vercel Platform** | [VERCEL_AVAILABILITY]% | [VERCEL_PERFORMANCE] | [VERCEL_STATUS] | [VERCEL_NOTES] |
| **Supabase Database** | [SUPABASE_AVAILABILITY]% | [SUPABASE_PERFORMANCE] | [SUPABASE_STATUS] | [SUPABASE_NOTES] |
| **OpenAI API** | [OPENAI_AVAILABILITY]% | [OPENAI_PERFORMANCE] | [OPENAI_STATUS] | [OPENAI_NOTES] |
| **CDN/Edge Functions** | [CDN_AVAILABILITY]% | [CDN_PERFORMANCE] | [CDN_STATUS] | [CDN_NOTES] |

---

## Cost Analysis

### Cost Breakdown

| Category | This Week | Last Week | Change | Monthly Projection |
|----------|-----------|-----------|--------|--------------------|
| **Infrastructure** | $[INFRA_COST] | $[INFRA_COST_PREV] | [INFRA_CHANGE]% | $[INFRA_MONTHLY] |
| **AI/ML Services** | $[AI_COST] | $[AI_COST_PREV] | [AI_CHANGE]% | $[AI_MONTHLY] |
| **Monitoring Tools** | $[MONITORING_COST] | $[MONITORING_COST_PREV] | [MONITORING_CHANGE]% | $[MONITORING_MONTHLY] |
| **Third-party Services** | $[THIRD_PARTY_COST] | $[THIRD_PARTY_COST_PREV] | [THIRD_PARTY_CHANGE]% | $[THIRD_PARTY_MONTHLY] |
| **Total** | **$[TOTAL_COST]** | **$[TOTAL_COST_PREV]** | **[TOTAL_CHANGE]%** | **$[TOTAL_MONTHLY]** |

### Cost Efficiency Metrics

- **Cost per Request**: $[COST_PER_REQUEST] (Target: ≤$0.007)
- **Cost per Successful Dialog**: $[COST_PER_DIALOG]
- **Token Optimization Savings**: $[TOKEN_SAVINGS] ([TOKEN_SAVINGS_PERCENT]% reduction)
- **Infrastructure Optimization**: $[INFRA_SAVINGS] saved

---

## Capacity Planning

### Traffic Analysis

- **Peak Concurrent Users**: [PEAK_USERS] (vs [PREV_PEAK_USERS] last week)
- **Average Daily Requests**: [AVG_DAILY_REQUESTS]
- **Peak Hourly Request Rate**: [PEAK_HOURLY_RATE] req/hr
- **Growth Rate**: [GROWTH_RATE]% week-over-week

### Resource Utilization

| Resource | Current Utilization | Peak Utilization | Capacity Remaining | Scaling Trigger |
|----------|-------------------|------------------|-------------------|-----------------|
| **CPU** | [CPU_AVG]% | [CPU_PEAK]% | [CPU_REMAINING]% | [CPU_TRIGGER]% |
| **Memory** | [MEMORY_AVG]% | [MEMORY_PEAK]% | [MEMORY_REMAINING]% | [MEMORY_TRIGGER]% |
| **Database Connections** | [DB_CONN_AVG] | [DB_CONN_PEAK] | [DB_CONN_REMAINING] | [DB_CONN_TRIGGER] |
| **API Rate Limits** | [API_RATE_AVG]% | [API_RATE_PEAK]% | [API_RATE_REMAINING]% | [API_RATE_TRIGGER]% |

### Capacity Recommendations

[CAPACITY_RECOMMENDATIONS]

---

## Team Performance

### On-Call Metrics

- **On-Call Engineers**: [ONCALL_ENGINEERS]
- **Pages Received**: [PAGES_RECEIVED]
- **Average Response Time**: [ONCALL_RESPONSE_TIME] minutes
- **Escalations**: [ESCALATIONS] ([ESCALATION_RATE]%)
- **Weekend/Holiday Pages**: [WEEKEND_PAGES]

### SRE Team Productivity

- **SLO Review Meetings**: [SLO_MEETINGS] completed
- **Runbook Updates**: [RUNBOOK_UPDATES]
- **Automation Improvements**: [AUTOMATION_IMPROVEMENTS]
- **Postmortems Completed**: [POSTMORTEMS_COMPLETED]
- **Training Sessions**: [TRAINING_SESSIONS]

---

## Action Items & Recommendations

### 🔴 Critical Actions (This Week)

1. **[CRITICAL_ACTION_1]**
   - Owner: [OWNER_1]
   - Due Date: [DUE_DATE_1]
   - Status: [STATUS_1]

2. **[CRITICAL_ACTION_2]**
   - Owner: [OWNER_2]
   - Due Date: [DUE_DATE_2]
   - Status: [STATUS_2]

### 🟡 High Priority Actions (Next 2 Weeks)

1. **[HIGH_ACTION_1]**
   - Owner: [OWNER_3]
   - Due Date: [DUE_DATE_3]
   - Status: [STATUS_3]

2. **[HIGH_ACTION_2]**
   - Owner: [OWNER_4]
   - Due Date: [DUE_DATE_4]
   - Status: [STATUS_4]

### 🟢 Medium Priority Improvements (Next Month)

1. **[MEDIUM_ACTION_1]**
   - Owner: [OWNER_5]
   - Due Date: [DUE_DATE_5]

2. **[MEDIUM_ACTION_2]**
   - Owner: [OWNER_6]
   - Due Date: [DUE_DATE_6]

---

## Trends & Forecasting

### 30-Day Trends

```
Key Metric Trends:
├── Availability: [AVAILABILITY_TREND_30D] (Target: ↗️ toward 99.5%+)
├── Latency: [LATENCY_TREND_30D] (Target: ↘️ toward <1500ms)
├── Error Rate: [ERROR_RATE_TREND_30D] (Target: ↘️ toward <1%)
└── Cost: [COST_TREND_30D] (Target: ↘️ optimization)
```

### Predictions & Alerts

- **Error Budget Depletion Risk**: [BUDGET_RISK_LEVEL] ([BUDGET_RISK_DATE])
- **Capacity Saturation Forecast**: [CAPACITY_SATURATION_DATE]
- **Cost Budget Alert**: [COST_BUDGET_STATUS] ([COST_BUDGET_PERCENT]% of monthly budget)
- **Seasonality Observations**: [SEASONALITY_NOTES]

---

## Learning & Improvements

### This Week's Learnings

1. **Technical Insights**
   - [TECHNICAL_LEARNING_1]
   - [TECHNICAL_LEARNING_2]

2. **Process Improvements**
   - [PROCESS_IMPROVEMENT_1]
   - [PROCESS_IMPROVEMENT_2]

3. **Tool Enhancements**
   - [TOOL_ENHANCEMENT_1]
   - [TOOL_ENHANCEMENT_2]

### Knowledge Sharing

- **Runbooks Updated**: [RUNBOOKS_UPDATED]
- **Documentation Improvements**: [DOCS_IMPROVEMENTS]
- **Training Materials Created**: [TRAINING_MATERIALS]
- **Team Knowledge Sessions**: [KNOWLEDGE_SESSIONS]

---

## Appendix

### Detailed Metrics

#### SLO Calculation Details
```
Availability Calculation:
- Measurement Window: [AVAILABILITY_WINDOW]
- Total Possible Uptime: [TOTAL_UPTIME] minutes
- Actual Downtime: [ACTUAL_DOWNTIME] minutes
- Availability: ((Total - Downtime) / Total) * 100 = [AVAILABILITY_CALCULATION]%

Latency Calculation:
- Sample Size: [LATENCY_SAMPLES] requests
- P95 Calculation: [P95_CALCULATION_METHOD]
- P99 Calculation: [P99_CALCULATION_METHOD]
```

#### Error Budget Mathematics
```
Error Budget Calculation:
- SLO Target: 99.5%
- Error Budget: 100% - 99.5% = 0.5%
- Time Window: 30 days = 43,200 minutes
- Allowed Downtime: 43,200 * 0.005 = 216 minutes
- Current Consumption: [CURRENT_DOWNTIME] minutes
- Budget Remaining: 216 - [CURRENT_DOWNTIME] = [BUDGET_REMAINING] minutes
```

### Tool Links

- **SLO Dashboard**: [SLO_DASHBOARD_URL]
- **Alert Manager**: [ALERT_MANAGER_URL]
- **Monitoring Scripts**: [MONITORING_SCRIPTS_PATH]
- **Runbook Library**: [RUNBOOK_LIBRARY_URL]
- **Incident Management**: [INCIDENT_MANAGEMENT_URL]

### Contact Information

- **SRE Team Lead**: [SRE_LEAD_EMAIL]
- **On-Call Engineer**: [ONCALL_EMAIL]
- **Engineering Manager**: [ENG_MANAGER_EMAIL]
- **Incident Commander**: [INCIDENT_COMMANDER_EMAIL]

---

## Report Generation Details

**Template Version**: 1.0
**Generated By**: [GENERATOR_NAME]
**Data Sources**:
- SLO Monitoring System
- Alert Management System
- Infrastructure Monitoring
- Cost Analysis Tools
- Incident Management System

**Next Report**: [NEXT_REPORT_DATE]

---

*This report is automatically generated from FlowReader's SLO monitoring infrastructure. For questions or clarifications, contact the SRE team.*

---

## Template Usage Instructions

### For Report Generators

This template contains placeholders in the format `[PLACEHOLDER_NAME]` that should be replaced with actual data when generating reports. Key placeholders include:

#### Date/Time Placeholders
- `[START_DATE]`, `[END_DATE]`, `[GENERATION_DATE]`
- `[NEXT_REPORT_DATE]`

#### Status Placeholders
- `[OVERALL_STATUS]` - 🟢/🟡/🔴 with status text
- `[*_STATUS]` - Individual metric statuses
- `[*_TREND]` - ↗️/↘️/➡️ trend indicators

#### Metric Placeholders
- `[*_CURRENT]`, `[*_PREVIOUS]` - Current and previous values
- `[*_PERCENT]` - Percentage values
- `[*_COUNT]` - Count values

#### Table Placeholders
- `[*_TABLE]` - Dynamic table content
- `[*_GRAPH_PLACEHOLDER]` - Chart/graph placeholders

### Automation Integration

This template is designed to work with:
- `slo-check.sh` monitoring script
- Dashboard data export tools
- Incident management systems
- Cost analysis tools

### Customization Guidelines

1. **Modify sections** based on your organization's needs
2. **Add/remove metrics** that are relevant to your SLOs
3. **Adjust targets** to match your SLO policy
4. **Customize notification preferences** in action items
5. **Add organization-specific** tool links and contact information