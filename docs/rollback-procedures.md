# Production Rollback Procedures Documentation

## Overview

This document outlines comprehensive rollback procedures for the FlowReader production deployment. It provides step-by-step instructions for handling various failure scenarios and ensuring rapid recovery with minimal downtime.

## Quick Reference

| **Emergency Contact** | **Action** |
|----------------------|------------|
| Critical failure detected | Execute immediate rollback (see Section 3.1) |
| Performance degradation | Monitor → Assess → Rollback if needed (see Section 3.2) |
| Security incident | Immediate rollback → Security review (see Section 3.3) |
| Post-deployment failure | Automated rollback triggered (see Section 2.3) |

---

## 1. Rollback Architecture

### 1.1 Deployment Infrastructure
- **Platform**: Vercel
- **Repository**: GitHub (`/Users/sheldonzhao/programs/FlowReader`)
- **Environments**:
  - Production: `https://flowreader.vercel.app`
  - Staging: Vercel preview deployments
- **Backup Strategy**: Previous deployment versions maintained by Vercel

### 1.2 Version Control Strategy
- **Branching**: All production deployments from `main` branch
- **Deployment Tracking**: GitHub releases with deployment metadata
- **Backup Reference**: Previous deployment URL stored during deployment process

### 1.3 Monitoring and Detection
- **Health Checks**: `/api/health` endpoint monitoring
- **Performance Metrics**: Response time baselines (< 3 seconds)
- **Security Monitoring**: Header validation and vulnerability scanning
- **Database Connectivity**: `/api/health/database` endpoint

---

## 2. Automated Rollback Procedures

### 2.1 Automated Rollback Triggers

The production deployment workflow includes automatic rollback in the following scenarios:

1. **Health Check Failures**
   - Health endpoint (`/api/health`) returns non-200 status
   - More than 10 consecutive health check failures
   - Response time exceeds 3 seconds consistently

2. **API Functionality Failures**
   - Critical API endpoints return unexpected responses
   - Authentication/authorization endpoints compromised
   - Database connectivity issues

3. **Security Validation Failures**
   - Missing critical security headers
   - Unexpected responses to security test patterns
   - SSL/TLS certificate issues

### 2.2 Automated Rollback Process

The automated rollback is triggered by the `rollback-on-failure` job in the production deployment workflow:

```yaml
rollback-on-failure:
  name: Emergency Rollback
  runs-on: ubuntu-latest
  needs: [production-deployment, post-deployment-verification]
  if: always() && needs.production-deployment.result == 'success' && needs.post-deployment-verification.result == 'failure'
```

**Automated Steps:**
1. Detect failure condition in post-deployment verification
2. Retrieve backup deployment reference from deployment job
3. Execute Vercel promotion of previous deployment
4. Verify rollback success with health checks
5. Send notifications about rollback status

### 2.3 Rollback Verification Process

After automated rollback:
1. **Health Check**: Verify `/api/health` endpoint returns 200
2. **Functionality Test**: Confirm critical endpoints work correctly
3. **Performance Check**: Ensure response times meet baseline
4. **Notification**: Update team via GitHub Actions summary

---

## 3. Manual Rollback Procedures

### 3.1 Emergency Rollback (Critical Failures)

**Trigger Conditions:**
- Complete service outage
- Data corruption detected
- Critical security breach
- Automated rollback failed

**Prerequisites:**
- Vercel CLI access with production permissions
- GitHub repository access
- Vercel project access token

**Step-by-Step Procedure:**

1. **Immediate Response (< 2 minutes)**
   ```bash
   # Install Vercel CLI if not available
   npm install -g vercel@latest

   # Login to Vercel
   vercel login

   # List recent deployments
   vercel ls flowreader --token=$VERCEL_TOKEN
   ```

2. **Identify Rollback Target (< 1 minute)**
   ```bash
   # Get deployment history (last 10 deployments)
   vercel ls flowreader --token=$VERCEL_TOKEN | head -10

   # Note the deployment URL of the last known good deployment
   # Format: https://flowreader-{hash}-{org}.vercel.app
   ```

3. **Execute Rollback (< 1 minute)**
   ```bash
   # Promote previous deployment to production
   vercel promote <PREVIOUS_DEPLOYMENT_URL> --token=$VERCEL_TOKEN

   # Example:
   # vercel promote https://flowreader-abc123-myorg.vercel.app --token=$VERCEL_TOKEN
   ```

4. **Immediate Verification (< 2 minutes)**
   ```bash
   # Test health endpoint
   curl -f https://flowreader.vercel.app/api/health

   # Test protected endpoint (should return 401)
   curl -I https://flowreader.vercel.app/api/books

   # Test frontend
   curl -I https://flowreader.vercel.app
   ```

**Total Time to Recovery: < 6 minutes**

### 3.2 Performance Degradation Rollback

**Trigger Conditions:**
- Response times > 3 seconds consistently
- High error rates (> 5%)
- Resource exhaustion indicators

**Assessment Period**: 5-10 minutes of monitoring

**Decision Matrix:**
| Condition | Response Time | Error Rate | Action |
|-----------|---------------|------------|--------|
| Mild degradation | 3-5 seconds | < 2% | Monitor for 10 minutes |
| Moderate degradation | 5-10 seconds | 2-5% | Prepare rollback, monitor for 5 minutes |
| Severe degradation | > 10 seconds | > 5% | Immediate rollback |

**Rollback Procedure:**
1. Document performance metrics before rollback
2. Execute emergency rollback procedure (Section 3.1)
3. Verify performance returns to baseline
4. Investigate root cause in staging environment

### 3.3 Security Incident Rollback

**Trigger Conditions:**
- Security vulnerability discovered in production
- Unauthorized access detected
- Data breach indicators
- Failed security scans

**Immediate Actions:**
1. **Do NOT wait for investigation** - rollback immediately
2. Execute emergency rollback (Section 3.1)
3. Verify security headers post-rollback:
   ```bash
   curl -I https://flowreader.vercel.app | grep -E "(X-Content-Type-Options|X-Frame-Options|X-XSS-Protection|Referrer-Policy)"
   ```
4. Initiate security incident response process
5. Do not redeploy until security review is complete

---

## 4. Rollback Decision Tree

```
Production Issue Detected
├── Critical Failure (Service Down)?
│   └── YES → Emergency Rollback (Section 3.1)
├── Security Issue?
│   └── YES → Immediate Rollback (Section 3.3)
├── Performance Degradation?
│   ├── Severe (>10s response, >5% errors) → Immediate Rollback
│   ├── Moderate (5-10s response, 2-5% errors) → Monitor 5min → Rollback
│   └── Mild (<5s response, <2% errors) → Monitor 10min → Assess
└── Functional Issue?
    ├── Critical Feature Broken → Emergency Rollback
    ├── Non-Critical Feature → Monitor → Rollback if worsening
    └── Minor Issue → Document → Fix Forward
```

---

## 5. Post-Rollback Procedures

### 5.1 Immediate Post-Rollback (0-15 minutes)

1. **Verify Service Restoration**
   ```bash
   # Comprehensive health check
   ./scripts/health-check.sh

   # Monitor for 10 minutes
   watch -n 30 "curl -s https://flowreader.vercel.app/api/health"
   ```

2. **Update Stakeholders**
   - Update GitHub issue/incident ticket
   - Notify team via configured channels
   - Update status page if applicable

3. **Gather Evidence**
   - Screenshot error conditions before rollback
   - Collect logs from failed deployment
   - Document timeline of events

### 5.2 Investigation Phase (15 minutes - 2 hours)

1. **Root Cause Analysis**
   - Review failed deployment logs
   - Compare working vs. failed deployment
   - Identify specific commit/change that caused issue

2. **Environment Comparison**
   ```bash
   # Compare staging and production configurations
   vercel env ls --environment=staging
   vercel env ls --environment=production
   ```

3. **Test in Staging**
   - Deploy failed version to staging
   - Reproduce the issue
   - Develop and test fix

### 5.3 Recovery Planning (2-24 hours)

1. **Fix Development**
   - Implement fix for root cause
   - Ensure fix doesn't introduce new issues
   - Add additional monitoring/tests if needed

2. **Validation Strategy**
   - Enhanced staging testing
   - Gradual rollout plan
   - Additional monitoring during redeployment

3. **Documentation Updates**
   - Update this rollback procedure if gaps found
   - Add new monitoring for similar issues
   - Update deployment checklist

---

## 6. Rollback Command Reference

### 6.1 Vercel Commands

```bash
# List all deployments
vercel ls [PROJECT_NAME] --token=$VERCEL_TOKEN

# Get deployment details
vercel inspect <DEPLOYMENT_URL> --token=$VERCEL_TOKEN

# Promote specific deployment to production
vercel promote <DEPLOYMENT_URL> --token=$VERCEL_TOKEN

# Check current production deployment
vercel ls --prod --token=$VERCEL_TOKEN

# Get deployment logs
vercel logs <DEPLOYMENT_URL> --token=$VERCEL_TOKEN
```

### 6.2 Health Check Commands

```bash
# Basic health check
curl -f https://flowreader.vercel.app/api/health

# Detailed health check with timing
curl -w "Time: %{time_total}s\nStatus: %{http_code}\n" \
     -s -o /dev/null \
     https://flowreader.vercel.app/api/health

# Security headers check
curl -I https://flowreader.vercel.app | grep -E "(X-Content-Type-Options|X-Frame-Options|X-XSS-Protection)"

# Protected endpoint test (should return 401)
curl -s -w "%{http_code}" -o /dev/null https://flowreader.vercel.app/api/books
```

### 6.3 GitHub Actions Commands

```bash
# Trigger emergency rollback workflow (if implemented)
gh workflow run emergency-rollback.yml

# Check workflow status
gh run list --workflow=deploy-production.yml

# View workflow logs
gh run view <RUN_ID> --log
```

---

## 7. Permissions and Access Requirements

### 7.1 Required Access

**For Emergency Rollback:**
- Vercel project access with deployment permissions
- GitHub repository write access
- Vercel CLI or dashboard access
- Production environment access

**Access Verification:**
```bash
# Test Vercel access
vercel whoami --token=$VERCEL_TOKEN

# Test GitHub access
gh auth status

# Test project access
vercel ls flowreader --token=$VERCEL_TOKEN
```

### 7.2 Emergency Contacts

| Role | Responsibility | Contact Method |
|------|----------------|----------------|
| DevOps Lead | Primary rollback authority | GitHub, Slack |
| Tech Lead | Technical decision making | GitHub, Slack |
| Product Owner | Business impact assessment | Slack, Email |
| Security Team | Security incident response | Security channel |

---

## 8. Communication Plan

### 8.1 Internal Communication

**Immediate (< 5 minutes):**
- GitHub issue creation with rollback label
- Team chat notification
- Update deployment status

**Short-term (< 30 minutes):**
- Stakeholder notification
- Root cause investigation update
- Recovery timeline estimate

**Long-term (< 24 hours):**
- Post-incident review
- Documentation updates
- Process improvements

### 8.2 External Communication

**If user-facing impact:**
- Status page update
- User notification (if applicable)
- Support team briefing

---

## 9. Testing and Validation

### 9.1 Rollback Procedure Testing

**Monthly Testing Schedule:**
- Test automated rollback in staging
- Validate manual rollback procedures
- Review and update documentation
- Verify access and permissions

**Test Checklist:**
- [ ] Automated rollback triggers correctly
- [ ] Manual rollback completes within time limits
- [ ] Health checks validate rollback success
- [ ] Communication notifications work
- [ ] Documentation is accurate and complete

### 9.2 Rollback Readiness Verification

**Before Each Production Deployment:**
- [ ] Previous deployment available for rollback
- [ ] Rollback procedures tested recently
- [ ] Required access tokens valid
- [ ] Monitoring systems operational
- [ ] Team aware of rollback procedures

---

## 10. Continuous Improvement

### 10.1 Metrics and KPIs

- **Mean Time to Detection (MTTD)**: < 5 minutes
- **Mean Time to Rollback (MTTR)**: < 10 minutes
- **Rollback Success Rate**: > 99%
- **False Positive Rate**: < 1%

### 10.2 Regular Reviews

**Weekly:**
- Review any rollback incidents
- Update procedures based on learnings

**Monthly:**
- Test rollback procedures
- Review metrics and performance
- Update documentation

**Quarterly:**
- Comprehensive procedure review
- Team training on rollback procedures
- Update emergency contact information

---

## Appendix A: Quick Reference Cards

### Emergency Rollback (Print and Keep Handy)

```
EMERGENCY ROLLBACK - CRITICAL FAILURE
═══════════════════════════════════════

1. ASSESS (30 seconds)
   - Service completely down?
   - Security breach?
   - Data corruption?

2. EXECUTE (2 minutes)
   vercel ls flowreader --token=$VERCEL_TOKEN
   vercel promote <PREVIOUS_URL> --token=$VERCEL_TOKEN

3. VERIFY (2 minutes)
   curl -f https://flowreader.vercel.app/api/health

4. COMMUNICATE (1 minute)
   - Update GitHub issue
   - Notify team
   - Document timeline

TOTAL TIME: < 6 MINUTES
```

### Health Check Commands

```
HEALTH CHECK COMMANDS
════════════════════

Basic Health:
curl -f https://flowreader.vercel.app/api/health

With Timing:
curl -w "Time: %{time_total}s\n" -s -o /dev/null \
     https://flowreader.vercel.app/api/health

Security Headers:
curl -I https://flowreader.vercel.app | grep X-

Protected Endpoint:
curl -s -w "%{http_code}" -o /dev/null \
     https://flowreader.vercel.app/api/books
```

---

**Document Version**: 1.0
**Last Updated**: 2025-09-19
**Next Review**: 2025-10-19
**Owner**: DevOps Team