# FlowReader Production Deployment Runbook

## Overview
This runbook provides comprehensive instructions for deploying FlowReader to production using Vercel + Supabase architecture.

**Architecture:**
- Frontend: SvelteKit on Vercel
- Backend: Vercel Serverless Functions
- Database: Supabase (PostgreSQL)
- Storage: Supabase Storage
- Task Queue: Upstash QStash
- AI Services: OpenAI API

## Prerequisites

### Required Tools & Versions
- **Node.js**: >= 18.0.0 (LTS recommended)
- **npm**: >= 9.0.0
- **Vercel CLI**: >= 28.0.0
- **Supabase CLI**: >= 1.100.0
- **Git**: Latest stable

### Required Accounts
- [Vercel Account](https://vercel.com) with Pro/Team plan (recommended)
- [Supabase Account](https://supabase.com) with Pro plan
- [OpenAI Account](https://platform.openai.com) with API access
- [Upstash Account](https://upstash.com) for QStash

## Environment Matrix

### Environment Overview

| Environment | URL | Purpose | Database | Auto Deploy |
|-------------|-----|---------|----------|-------------|
| **Development** | `http://localhost:5173` | Local development | Local Supabase | Manual |
| **Staging** | `https://flowreader-git-main-*.vercel.app` | Pre-production testing | Staging Supabase | Auto (on main push) |
| **Production** | `https://flowreader.vercel.app` | Live application | Production Supabase | Manual approval |

### Staging Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `PUBLIC_SUPABASE_URL` | ✅ | Staging Supabase project URL | `https://xxx-staging.supabase.co` |
| `PUBLIC_SUPABASE_ANON_KEY` | ✅ | Staging Supabase anonymous key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Staging service role key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `OPENAI_API_KEY` | ✅ | OpenAI API key (can be same as prod) | `sk-proj-xxx` |
| `QSTASH_URL` | ✅ | QStash endpoint URL | `https://qstash.upstash.io` |
| `QSTASH_TOKEN` | ✅ | QStash auth token (staging-specific) | `qstash_staging_xxx` |
| `JWT_SECRET` | ✅ | JWT signing secret (staging-specific) | Generated secure string |
| `NODE_ENV` | ✅ | Environment identifier | `staging` |
| `APP_URL` | ✅ | Staging app URL | `https://flowreader-git-main-*.vercel.app` |
| `FEATURE_TTS_ENABLED` | 🔹 | Enable TTS features for testing | `true` |
| `FEATURE_AI_ENHANCED` | 🔹 | Enhanced AI features | `true` |
| `FEATURE_SMART_NOTES` | 🔹 | Smart notes feature | `true` |
| `RATE_LIMIT_MAX` | 🔹 | API rate limit (higher for testing) | `200` |
| `RATE_LIMIT_WINDOW` | 🔹 | Rate limit window (ms) | `900000` |

### Production Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL | `https://xxx.supabase.co` |
| `PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `OPENAI_API_KEY` | ✅ | OpenAI API key | `sk-proj-xxx` |
| `QSTASH_URL` | ✅ | QStash endpoint URL | `https://qstash.upstash.io` |
| `QSTASH_TOKEN` | ✅ | QStash auth token | `qstash_xxx` |
| `JWT_SECRET` | ✅ | JWT signing secret (32+ chars) | Generated secure string |
| `NODE_ENV` | ✅ | Environment identifier | `production` |
| `APP_URL` | ✅ | Production app URL | `https://flowreader.vercel.app` |
| `FEATURE_TTS_ENABLED` | 🔹 | Enable TTS features | `false` (cost optimization) |
| `FEATURE_AI_ENHANCED` | 🔹 | Enhanced AI features | `true` |
| `FEATURE_SMART_NOTES` | 🔹 | Smart notes feature | `true` |
| `RATE_LIMIT_MAX` | 🔹 | API rate limit | `100` |
| `RATE_LIMIT_WINDOW` | 🔹 | Rate limit window (ms) | `900000` |
| `SENTRY_DSN` | 🔹 | Error tracking | Sentry DSN URL |

## CI/CD Pipeline Overview

### GitHub Actions Workflows

1. **Continuous Integration** (`.github/workflows/ci.yml`)
   - Triggers: Push to main/develop, Pull Requests
   - Actions: Type checking, linting, testing, security scan, build verification

2. **Staging Deployment** (`.github/workflows/deploy-staging.yml`)
   - Triggers: Push to main branch, manual workflow dispatch
   - Actions: Deploy to Vercel preview, run smoke tests, notify status

3. **Production Deployment** (`.github/workflows/deploy-production.yml`)
   - Triggers: Manual workflow dispatch only (requires "DEPLOY" confirmation)
   - Actions: Pre-checks, staging verification, production deploy, health checks, rollback on failure

### Branch Strategy

- **main**: Production-ready code, auto-deploys to staging
- **develop**: Development branch for feature integration
- **feature/***: Feature branches, create PRs to develop
- **hotfix/***: Emergency fixes, can PR directly to main

## Phase 0: Staging Environment Deployment

### 0.1 Automated Staging Deployment

Staging deployments are triggered automatically when code is pushed to the `main` branch:

```bash
# Push to main triggers automatic staging deployment
git checkout main
git pull origin main
git push origin main

# GitHub Actions will automatically:
# 1. Run CI checks
# 2. Deploy to Vercel preview environment
# 3. Run smoke tests
# 4. Report deployment status
```

### 0.2 Manual Staging Deployment

For manual staging deployments or testing branches:

```bash
# Using the deployment script
./scripts/deploy-staging.sh

# Or trigger GitHub Action manually
gh workflow run deploy-staging.yml

# Or using Vercel CLI directly
vercel --prod=false
```

### 0.3 Staging Environment Setup

#### 0.3.1 Create Staging Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create new project: `flowreader-staging`
3. Configure database:
```bash
# Link to staging project
supabase link --project-ref YOUR_STAGING_PROJECT_REF

# Apply migrations to staging
supabase db push

# Seed with test data
supabase db seed
```

#### 0.3.2 Configure Staging Environment Variables

```bash
# Set staging environment variables in Vercel
vercel env add PUBLIC_SUPABASE_URL preview
# Enter staging Supabase URL

vercel env add PUBLIC_SUPABASE_ANON_KEY preview
# Enter staging anonymous key

vercel env add SUPABASE_SERVICE_ROLE_KEY preview
# Enter staging service role key

vercel env add NODE_ENV preview
# Enter: staging

vercel env add APP_URL preview
# Enter: https://flowreader-git-main-yourorg.vercel.app

# Set additional staging-specific variables
vercel env add FEATURE_TTS_ENABLED preview
# Enter: true (for testing)

vercel env add RATE_LIMIT_MAX preview
# Enter: 200 (higher limit for testing)
```

### 0.4 Staging Verification

#### 0.4.1 Automated Verification

The staging deployment workflow automatically runs:
- Health checks
- API endpoint tests
- Frontend accessibility tests
- Security header verification
- Performance baseline checks

#### 0.4.2 Manual Verification

```bash
# Verify staging deployment
./scripts/verify-deployment.sh staging

# Test specific functionality
./scripts/test-api-endpoints.sh $STAGING_URL

# Load testing (optional)
# Use tools like k6, wrk, or artillery for load testing
```

#### 0.4.3 User Acceptance Testing

1. **Authentication Flow**
   - User registration
   - Email verification
   - Password reset
   - OAuth login (if enabled)

2. **Core Functionality**
   - File upload (EPUB/PDF)
   - Document processing
   - Reading position sync
   - Bookmark management

3. **AI Features**
   - Chat functionality
   - Smart notes generation
   - Content summarization

4. **Performance Testing**
   - Page load times
   - API response times
   - File upload speed
   - Large document handling

### 0.5 Staging Environment Management

#### 0.5.1 Database Management

```bash
# Reset staging database
supabase db reset --db-url $STAGING_DATABASE_URL

# Apply specific migration
supabase migration up --to 20231201000000

# Backup staging data
pg_dump $STAGING_DATABASE_URL > staging_backup_$(date +%Y%m%d).sql

# Restore from backup
psql $STAGING_DATABASE_URL < staging_backup_20231201.sql
```

#### 0.5.2 Environment Monitoring

```bash
# Check staging logs
vercel logs --app flowreader

# Monitor staging performance
# Use Vercel Analytics dashboard

# Check Supabase staging metrics
# Use Supabase Dashboard → Reports
```

## Phase 1: Pre-Deployment Setup

### 1.1 Environment Verification
```bash
# Run comprehensive verification
./scripts/verify-setup.sh

# Expected output: All checks should pass with "GO" status
```

### 1.2 Dependency Installation
```bash
# Install all dependencies
./scripts/install-deps.sh

# Verify installation
npm run type-check
npm run lint
```

### 1.3 Local Build Test
```bash
# Test production build locally
npm run build

# Verify build artifacts
ls -la apps/web/build/
ls -la .vercel/output/
```

## Phase 2: Supabase Production Setup

### 2.1 Create Supabase Project
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Choose organization and fill details:
   - **Name**: `flowreader-prod`
   - **Database Password**: Generate strong password
   - **Region**: Choose closest to users
   - **Plan**: Pro (required for production features)

### 2.2 Configure Database
```bash
# Link to production project
supabase link --project-ref YOUR_PROJECT_REF

# Apply migrations
supabase db push

# Verify schema
supabase db diff
```

### 2.3 Configure Authentication
1. In Supabase Dashboard → Authentication → Settings
2. Configure Site URL: `https://your-domain.com`
3. Add Redirect URLs:
   - `https://your-domain.com/auth/callback`
   - `http://localhost:5173/auth/callback` (for development)
4. Enable Email Auth (disable if using OAuth only)
5. Configure OAuth providers if needed

### 2.4 Configure Storage
1. In Supabase Dashboard → Storage
2. Create bucket: `book-uploads`
3. Set bucket policies:
```sql
-- Allow authenticated users to upload files
CREATE POLICY "Users can upload files" ON storage.objects
FOR INSERT WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to read their own files
CREATE POLICY "Users can read own files" ON storage.objects
FOR SELECT USING (auth.uid()::text = (storage.foldername(name))[1]);
```

### 2.5 Configure Row Level Security (RLS)
```sql
-- Enable RLS on all tables
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Add policies (see migration files for complete policies)
```

## Phase 3: Vercel Deployment

### 3.1 Install Vercel CLI
```bash
npm install -g vercel@latest
vercel --version
```

### 3.2 Project Setup
```bash
# Login to Vercel
vercel login

# Initialize project (run from project root)
vercel

# Follow prompts:
# - Link to existing project? N
# - Project name: flowreader
# - Directory: ./
# - Override settings? N
```

### 3.3 Environment Variables Setup
```bash
# Set production environment variables
vercel env add PUBLIC_SUPABASE_URL production
vercel env add PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add OPENAI_API_KEY production
vercel env add QSTASH_URL production
vercel env add QSTASH_TOKEN production
vercel env add JWT_SECRET production
vercel env add NODE_ENV production
vercel env add APP_URL production

# Set optional variables
vercel env add FEATURE_TTS_ENABLED production
vercel env add FEATURE_AI_ENHANCED production
vercel env add FEATURE_SMART_NOTES production
vercel env add RATE_LIMIT_MAX production
vercel env add RATE_LIMIT_WINDOW production

# Verify environment variables
vercel env ls
```

### 3.4 Deploy to Production
```bash
# Deploy to production
vercel --prod

# Verify deployment
curl -f https://your-domain.vercel.app/api/health
```

## Phase 4: Post-Deployment Verification

### 4.1 Health Checks
```bash
# Run API endpoint tests against production
API_BASE="https://your-domain.vercel.app/api" ./scripts/test-api-endpoints.sh

# Expected results:
# - Health endpoint: 200 OK
# - Protected endpoints: 401 without auth
# - Authenticated requests: Success with valid tokens
```

### 4.2 Database Connectivity
1. Check Supabase Dashboard → API Logs
2. Verify no connection errors
3. Test user registration flow
4. Test file upload functionality

### 4.3 Feature Testing
- [ ] User authentication (signup/login)
- [ ] File upload (EPUB/PDF)
- [ ] Document processing
- [ ] Reading position sync
- [ ] AI chat functionality
- [ ] Smart notes creation

## Phase 5: Domain & SSL Configuration

### 5.1 Custom Domain Setup
```bash
# Add custom domain
vercel domains add yourdomain.com

# Configure DNS (add CNAME record):
# CNAME: www -> cname.vercel-dns.com
# A: @ -> 76.76.19.19 (Vercel IP)
```

### 5.2 SSL Certificate
- Vercel automatically provisions SSL certificates
- Verify at: `https://yourdomain.com`
- Check certificate validity: 90-day Let's Encrypt

## Monitoring & Observability

### 5.1 Vercel Analytics
1. Enable in Vercel Dashboard → Analytics
2. Monitor Core Web Vitals
3. Set up alerts for performance degradation

### 5.2 Supabase Monitoring
1. Monitor in Supabase Dashboard → Reports
2. Check database performance
3. Monitor auth success rates
4. Review storage usage

### 5.3 Error Tracking (Optional)
```bash
# Add Sentry for error tracking
vercel env add SENTRY_DSN production

# Configure in app
# See apps/web/src/hooks.client.ts
```

## Enhanced Rollback Procedures

### Rollback Decision Matrix

| Issue Type | Severity | Rollback Strategy | Timeline |
|------------|----------|-------------------|----------|
| **Performance Degradation** | Low | Monitor, consider rollback if >10% degradation | 30 minutes |
| **Feature Bug** | Medium | Rollback if affects >25% of users | 15 minutes |
| **Security Issue** | High | Immediate rollback | 5 minutes |
| **Complete Outage** | Critical | Immediate rollback + incident response | 2 minutes |

### 5.1 Automated Rollback (GitHub Actions)

The production deployment workflow includes automatic rollback on failure:

```bash
# Trigger manual rollback via GitHub Actions
gh workflow run deploy-production.yml -f confirmation=ROLLBACK

# Check rollback status
gh run list --workflow=deploy-production.yml --limit=5
```

**Automated rollback triggers:**
- Health check failures
- Performance regression (>3s response time)
- High error rate (>5% within 5 minutes)
- Database connectivity issues

### 5.2 Manual Application Rollback

#### 5.2.1 Quick Rollback (Vercel)

```bash
# List recent deployments with timestamps
vercel ls --json | jq -r '.[] | "\(.name) \(.url) \(.createdAt)"'

# Get current production deployment
current_prod=$(vercel ls --prod | head -2 | tail -1 | awk '{print $2}')
echo "Current production: $current_prod"

# Find previous stable deployment
# Use deployment before current one
previous_deployment="flowreader-abc123.vercel.app"

# Perform rollback
vercel promote "https://$previous_deployment" --scope=production

# Verify rollback
curl -f "https://flowreader.vercel.app/api/health"
```

#### 5.2.2 Staged Rollback Process

```bash
# Step 1: Identify target rollback deployment
./scripts/list-deployments.sh --with-health-status

# Step 2: Test rollback target in staging first
vercel promote "https://target-deployment.vercel.app" --scope=preview

# Step 3: Verify staging rollback
./scripts/verify-deployment.sh staging "https://staging-rollback-url.vercel.app"

# Step 4: Execute production rollback
vercel promote "https://target-deployment.vercel.app" --scope=production

# Step 5: Verify production rollback
./scripts/verify-deployment.sh production
```

### 5.3 Database Rollback Strategies

#### 5.3.1 Migration Rollback

```bash
# List applied migrations
supabase migration list

# Create rollback migration (recommended approach)
supabase migration new rollback_feature_xyz

# Manual rollback to specific migration
supabase migration down --to 20231201000000

# Verify database state
supabase db diff
```

#### 5.3.2 Data Rollback (Point-in-Time Recovery)

```bash
# For Supabase Pro plans with Point-in-Time Recovery
# This must be done via Supabase Dashboard → Settings → Database

# Steps:
# 1. Go to Supabase Dashboard
# 2. Navigate to Settings → Database
# 3. Click "Point in time recovery"
# 4. Select recovery point (up to 7 days back)
# 5. Confirm recovery

# Alternative: Manual backup restore
pg_restore --verbose --clean --no-acl --no-owner \
  -h db.xxx.supabase.co -U postgres -d postgres \
  backup_file.sql
```

#### 5.3.3 Schema-Only Rollback

```bash
# Backup current schema
pg_dump --schema-only $DATABASE_URL > current_schema.sql

# Apply rollback schema
pg_dump --schema-only $ROLLBACK_DATABASE_URL | psql $DATABASE_URL

# Verify schema changes
supabase db diff --schema public
```

### 5.4 Environment Variable Rollback

```bash
# Backup current environment variables
vercel env ls > env_backup_$(date +%Y%m%d_%H%M%S).txt

# Restore previous environment variables
# (This requires manual restoration from backup)

# Quick environment variable fixes
vercel env rm PROBLEMATIC_VAR production
vercel env add PROBLEMATIC_VAR production
# Enter corrected value

# Trigger redeployment to apply env changes
vercel redeploy --prod
```

### 5.5 Feature Flag Rollback

```bash
# Disable problematic features via environment variables
vercel env add FEATURE_PROBLEMATIC_FEATURE false production
vercel env add FEATURE_AI_ENHANCED false production
vercel env add FEATURE_TTS_ENABLED false production

# Redeploy to apply feature flag changes
vercel redeploy --prod

# Verify feature is disabled
curl -s "https://flowreader.vercel.app/api/health" | jq '.features'
```

### 5.6 Emergency Procedures

#### 5.6.1 Complete Service Outage Response

```bash
# Immediate Response (0-2 minutes)
# 1. Activate incident response team
# 2. Enable maintenance mode
vercel env add MAINTENANCE_MODE true production
vercel redeploy --prod

# 3. Notify users via status page/social media
# 4. Begin rollback procedure

# Investigation Phase (2-15 minutes)
# 1. Check service health
./scripts/verify-deployment.sh production

# 2. Review recent deployments
vercel ls --limit=10

# 3. Check error logs
vercel logs --prod --limit=100

# 4. Monitor external services (Supabase, OpenAI)

# Recovery Phase (15-30 minutes)
# 1. Execute rollback based on root cause
# 2. Verify service restoration
# 3. Disable maintenance mode
vercel env rm MAINTENANCE_MODE production
vercel redeploy --prod

# 4. Conduct post-incident review
```

#### 5.6.2 Security Incident Response

```bash
# Immediate containment (0-5 minutes)
# 1. Isolate affected systems
vercel env add SECURITY_MODE true production

# 2. Rotate all API keys
# OpenAI API Key
export NEW_OPENAI_KEY="sk-proj-new-key"
vercel env add OPENAI_API_KEY "$NEW_OPENAI_KEY" production

# Supabase Service Role Key
export NEW_SUPABASE_KEY="new-service-role-key"
vercel env add SUPABASE_SERVICE_ROLE_KEY "$NEW_SUPABASE_KEY" production

# JWT Secret
export NEW_JWT_SECRET=$(openssl rand -base64 32)
vercel env add JWT_SECRET "$NEW_JWT_SECRET" production

# 3. Force user re-authentication
# This requires application-level implementation

# 4. Deploy security updates
vercel redeploy --prod

# Investigation and recovery
# 1. Analyze access logs
# 2. Identify compromised accounts
# 3. Implement additional security measures
# 4. Communicate with affected users
```

#### 5.6.3 Database Emergency Procedures

```bash
# Read-only mode activation
# This requires application-level implementation or Supabase configuration

# Database connection limiting
# Configure in Supabase Dashboard → Settings → Database
# Reduce max connections temporarily

# Emergency backup
pg_dump $DATABASE_URL | gzip > emergency_backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Database restoration (last resort)
# 1. Create new Supabase project
# 2. Restore from latest backup
# 3. Update environment variables
# 4. Redeploy application
```

### 5.7 Rollback Verification Checklist

After any rollback procedure:

- [ ] **Health Checks**: All health endpoints return 200
- [ ] **Authentication**: User login/logout working
- [ ] **Core Features**: File upload, processing, reading work
- [ ] **Database**: No connection errors, data integrity intact
- [ ] **Performance**: Response times within acceptable limits
- [ ] **Security**: All security headers present
- [ ] **Monitoring**: Error rates back to normal levels
- [ ] **User Communication**: Incident status communicated to users

### 5.8 Post-Rollback Actions

```bash
# 1. Verify rollback success
./scripts/verify-deployment.sh production

# 2. Monitor for 30 minutes
# Watch error rates, response times, user reports

# 3. Document incident
# Create incident report with:
# - Timeline of events
# - Root cause analysis
# - Actions taken
# - Lessons learned
# - Prevention measures

# 4. Schedule fix deployment
# Address root cause in development
# Test thoroughly in staging
# Plan production deployment

# 5. Communicate resolution
# Update status page
# Notify affected users
# Internal team debrief
```

### 5.9 Rollback Testing

Regular rollback testing ensures procedures work when needed:

```bash
# Monthly rollback drill
# 1. Schedule maintenance window
# 2. Deploy to production
# 3. Immediately rollback
# 4. Verify rollback success
# 5. Document any issues
# 6. Update procedures as needed

# Chaos engineering
# Use tools like Chaos Monkey to test resilience
# Simulate various failure scenarios
# Test automated recovery mechanisms
```

## Common Issues & Solutions

### Build Failures
```bash
# Clear build cache
vercel build --debug

# Check build logs
vercel logs

# Common fixes:
# - Update Node.js version in package.json engines
# - Clear npm cache: npm cache clean --force
# - Check TypeScript errors: npm run type-check
```

### Environment Variable Issues
```bash
# Verify variables are set
vercel env ls

# Pull environment for local testing
vercel env pull .env.local

# Common issues:
# - Missing quotes around values with special characters
# - Case sensitivity in variable names
# - Missing PUBLIC_ prefix for client-side variables
```

### Database Connection Issues
1. Check Supabase project status
2. Verify connection pooling settings
3. Check RLS policies aren't blocking requests
4. Monitor connection count in dashboard

### Performance Issues
1. Enable Vercel Edge Caching
2. Optimize database queries
3. Review Supabase performance insights
4. Consider CDN for static assets

## Security Checklist

### Pre-Production
- [ ] All secrets stored securely (no hardcoded values)
- [ ] Row Level Security (RLS) enabled on all tables
- [ ] API rate limiting configured
- [ ] CORS headers properly configured
- [ ] Content Security Policy (CSP) headers set
- [ ] Input validation on all endpoints
- [ ] File upload restrictions in place

### Post-Production
- [ ] Security headers audit
- [ ] Dependency vulnerability scan
- [ ] Regular security updates scheduled
- [ ] Access logs monitoring
- [ ] Penetration testing completed

## Maintenance Procedures

### Weekly Tasks
- Review error logs and metrics
- Check dependency updates
- Monitor database performance
- Verify backup integrity

### Monthly Tasks
- Security patches review
- Performance optimization review
- Cost analysis and optimization
- Disaster recovery drill

### Quarterly Tasks
- Full security audit
- Penetration testing
- Disaster recovery test
- Dependency major version updates

## Support & Escalation

### Primary Contacts
- **DevOps Lead**: [Contact Information]
- **Database Admin**: [Contact Information]
- **Security Team**: [Contact Information]

### Escalation Matrix
1. **Level 1**: Development team (response: 2 hours)
2. **Level 2**: Senior engineers (response: 1 hour)
3. **Level 3**: Architecture team (response: 30 minutes)
4. **Level 4**: External support (Vercel/Supabase)

### External Support Channels
- **Vercel Support**: https://vercel.com/support
- **Supabase Support**: https://supabase.com/support
- **OpenAI Support**: https://platform.openai.com/support

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing locally
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Build successful
- [ ] Security review completed

### Deployment
- [ ] Supabase project created and configured
- [ ] Vercel project deployed
- [ ] Custom domain configured
- [ ] SSL certificate verified
- [ ] Environment variables set

### Post-Deployment
- [ ] Health checks passing
- [ ] Core functionality verified
- [ ] Monitoring enabled
- [ ] Documentation updated
- [ ] Team notified

### Go-Live
- [ ] DNS propagated
- [ ] Performance baseline established
- [ ] Incident response ready
- [ ] Rollback plan confirmed

**Document Version**: 1.0
**Last Updated**: 2025-09-18
**Next Review**: 2025-10-18