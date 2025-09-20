# FlowReader Production Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying FlowReader to production, including pre-deployment checks, deployment execution, and rollback procedures.

## Prerequisites

### Required Environment Variables (GitHub Secrets)

Ensure the following secrets are configured in your GitHub repository settings:

**Vercel Configuration:**
- `VERCEL_ORG_ID` - Your Vercel organization ID
- `VERCEL_PROJECT_ID` - FlowReader project ID in Vercel
- `VERCEL_TOKEN` - Vercel deployment token with project access

**Database Configuration:**
- `PUBLIC_SUPABASE_URL` - Production Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database operations

**External Services:**
- `OPENAI_API_KEY` - OpenAI API key for AI features
- `QSTASH_TOKEN` - (Optional) Upstash QStash token for task queue
- `JWT_SECRET` - JWT signing secret (minimum 32 characters)

### Database Migration Status

The latest migration `003_dialog_history.sql` is production-ready with:
- Dialog message storage and retrieval system
- Row Level Security (RLS) policies for user isolation
- Performance-optimized indexes
- JSONB validation for structured data
- Automated cleanup functions for data retention

## Deployment Process

### 1. Pre-Deployment Checklist

Before initiating deployment, verify:

- [ ] All changes merged to `main` branch
- [ ] All tests passing in CI
- [ ] Database migrations reviewed and approved
- [ ] Environment variables configured in GitHub Secrets
- [ ] Staging environment validated (if applicable)

### 2. Manual Deployment Execution

#### Option A: GitHub Actions Workflow (Recommended)

1. **Navigate to Actions Tab**
   ```
   https://github.com/[your-org]/FlowReader/actions
   ```

2. **Select "Deploy to Production" Workflow**
   - Click "Run workflow" button
   - Select `main` branch
   - Type `DEPLOY` in the confirmation field
   - Choose whether to skip staging verification (not recommended)
   - Click "Run workflow"

3. **Monitor Deployment Progress**
   The workflow includes these stages:
   - Pre-deployment verification
   - Staging environment verification (optional)
   - Production deployment
   - Post-deployment health checks
   - Security scanning
   - Automatic rollback on failure

#### Option B: Manual Vercel CLI Deployment

If GitHub Actions is unavailable, use manual deployment:

```bash
# Install Vercel CLI
npm install -g vercel@latest

# Pull production environment
vercel pull --yes --environment=production --token=[VERCEL_TOKEN]

# Build for production
vercel build --prod --token=[VERCEL_TOKEN]

# Deploy to production
vercel deploy --prebuilt --prod --token=[VERCEL_TOKEN]
```

### 3. Database Migration Application

**Automatic Migration (Production-Ready):**
The migration `003_dialog_history.sql` includes:

```sql
-- Key features implemented:
-- 1. Dialog messages table with RLS security
-- 2. Performance indexes for user queries
-- 3. JSONB validation functions
-- 4. Automated cleanup procedures
-- 5. Statistical views for analytics
```

**Manual Migration (if needed):**
```bash
# Using Supabase CLI
supabase db push --project-ref [PROJECT_REF]

# Or apply specific migration
supabase migration up --project-ref [PROJECT_REF]
```

## Post-Deployment Verification

### 1. Automated Health Checks

The deployment workflow automatically verifies:

- **Health Endpoint**: `https://flowreader.vercel.app/api/health`
- **API Security**: Protected endpoints return proper 401 status
- **Performance**: Response times under 3 seconds
- **Database Connectivity**: Connection and query execution

### 2. Manual Verification Steps

After deployment, manually verify:

```bash
# Health check
curl https://flowreader.vercel.app/api/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2024-XX-XXTXX:XX:XX.XXXZ",
  "version": "0.1.0",
  "environment": "production",
  "services": {
    "database": "ok",
    "queue": "ok",
    "storage": "ok"
  }
}

# Security headers check
curl -I https://flowreader.vercel.app/

# Verify presence of security headers:
# - X-Content-Type-Options: nosniff
# - X-Frame-Options: DENY
# - X-XSS-Protection: 1; mode=block
# - Referrer-Policy: strict-origin-when-cross-origin
```

### 3. Functional Testing

Test critical user flows:

1. **Authentication Flow**
   - User registration/login
   - JWT token validation
   - Session persistence

2. **Core Features**
   - Book upload and processing
   - AI dialog interactions
   - Position tracking
   - Note-taking functionality

3. **Performance Validation**
   - Page load times under 3 seconds
   - API response times under 1 second
   - Database query performance

## Rollback Procedures

### 1. Automatic Rollback

The deployment workflow includes automatic rollback that triggers when:
- Health checks fail after 10 attempts
- API functionality tests fail
- Performance baseline not met
- Database connectivity issues

**Automatic Rollback Process:**
1. Identifies previous working deployment
2. Promotes previous deployment to production
3. Verifies rollback success
4. Notifies team of rollback completion

### 2. Manual Rollback

If manual rollback is required:

#### Option A: Vercel CLI Rollback

```bash
# List recent deployments
vercel ls --token=[VERCEL_TOKEN]

# Find working deployment URL
WORKING_DEPLOYMENT="https://flowreader-abc123.vercel.app"

# Promote working deployment
vercel promote $WORKING_DEPLOYMENT --token=[VERCEL_TOKEN]

# Verify rollback
curl https://flowreader.vercel.app/api/health
```

#### Option B: GitHub Actions Rollback

1. Navigate to successful deployment run
2. Note the deployment URL from logs
3. Use Vercel dashboard to promote previous deployment
4. Verify functionality

### 3. Database Rollback

If database rollback is needed:

```bash
# Using migration rollback script
supabase migration down --project-ref [PROJECT_REF]

# Or apply specific rollback
psql [DATABASE_URL] < supabase/migrations/003_dialog_history_rollback.sql
```

**Note**: Database rollbacks should be carefully tested in staging first.

## Monitoring and Observability

### 1. Production Monitoring

Monitor these metrics post-deployment:

- **Application Health**: `/api/health` endpoint
- **Error Rates**: API error responses (4xx/5xx)
- **Response Times**: Average API response times
- **User Sessions**: Authentication success rates
- **Database Performance**: Query execution times

### 2. Alerting Setup

Configure alerts for:

- Health check failures
- API error rate > 5%
- Response time > 3 seconds
- Database connection failures
- High memory/CPU usage

### 3. Log Analysis

Monitor application logs for:

```bash
# View recent production logs (Vercel)
vercel logs --token=[VERCEL_TOKEN] --since 1h

# Common issues to watch:
# - Authentication failures
# - Database connection errors
# - API rate limit violations
# - Unhandled exceptions
```

## Troubleshooting

### Common Deployment Issues

**1. Environment Variable Issues**
```bash
# Verify environment variables are set
vercel env ls --token=[VERCEL_TOKEN]

# Update missing variables
vercel env add [VAR_NAME] --token=[VERCEL_TOKEN]
```

**2. Database Connection Issues**
- Verify `PUBLIC_SUPABASE_URL` is correct
- Check `SUPABASE_SERVICE_ROLE_KEY` has proper permissions
- Test connection from production environment

**3. Build Failures**
- Check Node.js version compatibility (>= 18.0.0)
- Verify all dependencies are properly locked in package-lock.json
- Review build logs for specific errors

**4. Performance Issues**
- Monitor database query performance
- Check Vercel function timeout settings
- Verify CDN configuration for static assets

### Emergency Contacts

**Deployment Issues:**
- DevOps Team: [Contact Information]
- Platform Engineering: [Contact Information]

**Production Incidents:**
- On-call Engineer: [Contact Information]
- Incident Response: [Process Documentation]

## Security Considerations

### 1. Secrets Management

- All secrets stored in GitHub Secrets or Vercel environment variables
- No hardcoded secrets in codebase
- Regular rotation of API keys and tokens

### 2. Production Security

- HTTPS enforced with HSTS headers
- CSP headers configured for XSS protection
- CORS properly configured for authorized origins
- Rate limiting enabled on API endpoints

### 3. Database Security

- RLS policies enforce user-level data isolation
- Service role key has minimal required permissions
- Connection pooling configured for optimal performance
- Regular security updates applied

## Version History

| Version | Date | Changes | Migration |
|---------|------|---------|-----------|
| 0.1.0   | 2024-XX-XX | Initial production deployment | 003_dialog_history.sql |

---

## Quick Reference Commands

```bash
# Deploy to production
gh workflow run deploy-production.yml

# Check deployment status
gh run list --workflow=deploy-production.yml

# Manual health check
curl https://flowreader.vercel.app/api/health

# View production logs
vercel logs --token=[VERCEL_TOKEN] --since 1h

# Emergency rollback
vercel promote [PREVIOUS_DEPLOYMENT_URL] --token=[VERCEL_TOKEN]
```

---

**Last Updated**: 2024-09-19
**Next Review**: 2024-10-19