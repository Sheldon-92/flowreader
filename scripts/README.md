# FlowReader Rollback Scripts

This directory contains automated scripts for managing production rollbacks and deployment verification.

## Quick Start

### Emergency Rollback (Critical Situations)

```bash
# Immediate rollback with confirmation
./emergency-rollback.sh --confirm

# Rollback to specific deployment
./emergency-rollback.sh --deployment-url https://flowreader-abc123-org.vercel.app
```

### Health Checks

```bash
# Check production health
./health-check.sh --environment production

# Check with custom URL
./health-check.sh --url https://custom-deployment.vercel.app
```

### Deployment Status

```bash
# View current deployment status
./deployment-status.sh --current

# Show rollback candidates
./deployment-status.sh --rollback-candidates
```

### Decision Support

```bash
# Interactive rollback decision tree
./rollback-decision-tree.sh
```

## Scripts Overview

### 🚨 emergency-rollback.sh

**Purpose**: Automated emergency rollback for production failures

**Features**:
- Automatic previous deployment detection
- Comprehensive health verification
- Incident documentation generation
- Safety confirmations and timeouts
- Detailed logging and notifications

**Usage**:
```bash
./emergency-rollback.sh [OPTIONS]

Options:
  --confirm                    Skip confirmation prompt
  --deployment-url <url>       Specific deployment to rollback to
  -h, --help                  Show help message
```

**Environment Variables**:
- `VERCEL_TOKEN`: Required for Vercel API access

### 🔍 health-check.sh

**Purpose**: Comprehensive health verification for deployments

**Features**:
- Multi-endpoint health testing
- Performance baseline verification
- Security header validation
- Response time monitoring
- Configurable retry logic

**Usage**:
```bash
./health-check.sh [OPTIONS]

Options:
  -e, --environment ENV        Target environment (staging|production)
  -u, --url URL               Custom base URL to check
  -t, --timeout SECONDS       Request timeout [default: 30]
  -r, --retries COUNT         Number of retries [default: 3]
  -v, --verbose               Enable verbose output
```

### 📊 deployment-status.sh

**Purpose**: Deployment monitoring and rollback candidate identification

**Features**:
- Current deployment information
- Rollback candidate health assessment
- Deployment timeline visualization
- Quick command reference

**Usage**:
```bash
./deployment-status.sh [OPTIONS]

Options:
  -p, --project NAME          Project name [default: flowreader]
  -n, --count NUMBER          Number of deployments to list
  --current                   Show only current deployment info
  --rollback-candidates       Show deployments suitable for rollback
  --health-check             Check current production health
```

### 🚦 rollback-decision-tree.sh

**Purpose**: Interactive decision support for rollback scenarios

**Features**:
- Issue severity assessment
- Impact analysis
- Timing considerations
- Rollback feasibility check
- Decision reasoning and documentation

**Usage**:
```bash
./rollback-decision-tree.sh
```

Interactive prompts will guide you through:
1. Issue type and severity assessment
2. User impact evaluation
3. Timing analysis
4. Rollback feasibility check
5. Recommended action with reasoning

## Rollback Procedures

### 🔴 Critical Failures (< 5 minutes)

1. **Immediate Assessment**:
   ```bash
   ./health-check.sh --environment production
   ```

2. **Emergency Rollback**:
   ```bash
   ./emergency-rollback.sh --confirm
   ```

3. **Verification**:
   ```bash
   ./health-check.sh --environment production
   ```

### 🟡 Degraded Performance (5-15 minutes)

1. **Decision Support**:
   ```bash
   ./rollback-decision-tree.sh
   ```

2. **Monitor and Assess**:
   ```bash
   ./deployment-status.sh --current
   ./health-check.sh --environment production --verbose
   ```

3. **Execute if Needed**:
   ```bash
   ./emergency-rollback.sh
   ```

### 🟢 Minor Issues (Investigation First)

1. **Status Check**:
   ```bash
   ./deployment-status.sh --rollback-candidates
   ```

2. **Detailed Analysis**:
   ```bash
   ./health-check.sh --environment production --verbose
   ```

3. **Decision Tree**:
   ```bash
   ./rollback-decision-tree.sh
   ```

## GitHub Actions Integration

### Emergency Rollback Workflow

Trigger via GitHub Actions:
```bash
gh workflow run emergency-rollback.yml \
  -f rollback_reason="Critical service failure" \
  -f confirmation="ROLLBACK"
```

### Manual Trigger

1. Go to GitHub Actions tab
2. Select "Emergency Rollback" workflow
3. Click "Run workflow"
4. Fill in required parameters:
   - **Reason**: Select appropriate reason
   - **Confirmation**: Type "ROLLBACK"
   - **Target Deployment**: (optional) Specific deployment URL

## Prerequisites

### Required Tools

```bash
# Vercel CLI
npm install -g vercel@latest

# Basic utilities (usually pre-installed)
curl
bc  # For arithmetic calculations
```

### Environment Setup

```bash
# Set Vercel token
export VERCEL_TOKEN="your-vercel-token"

# Verify access
vercel whoami
vercel ls flowreader
```

### Permissions Required

- Vercel project access with deployment permissions
- GitHub repository write access (for workflows)
- Production environment access

## Monitoring Integration

### Health Check Automation

Add to crontab for continuous monitoring:
```bash
# Check production health every 5 minutes
*/5 * * * * /path/to/health-check.sh --environment production >> /var/log/health-check.log 2>&1
```

### Alert Integration

Scripts support integration with:
- Slack webhooks
- PagerDuty incidents
- Email notifications
- GitHub issue creation

## Safety Features

### Confirmation Requirements

- Emergency rollback requires explicit confirmation
- GitHub Actions workflow requires typing "ROLLBACK"
- Decision tree provides reasoning for all recommendations

### Rollback Verification

- Automatic health checks after rollback
- Performance baseline verification
- Security header validation
- Extended monitoring period

### Incident Documentation

- Automatic incident record generation
- Timeline documentation
- Decision reasoning capture
- Artifact preservation

## Troubleshooting

### Common Issues

**"Vercel CLI not found"**:
```bash
npm install -g vercel@latest
```

**"VERCEL_TOKEN not set"**:
```bash
export VERCEL_TOKEN="your-token"
# OR
vercel login
```

**"No previous deployment found"**:
- Check project name: `vercel ls`
- Verify permissions: `vercel whoami`
- Ensure deployments exist: `vercel ls flowreader`

**"Health check timeout"**:
- Check network connectivity
- Verify production URL
- Increase timeout: `--timeout 60`

### Log Locations

- Health check logs: `health-check-YYYYMMDD-HHMMSS.log`
- Rollback incidents: `rollback-incident-YYYYMMDD-HHMMSS.md`
- Decision records: `rollback-decision-YYYYMMDD-HHMMSS.txt`

### Support Contacts

- **DevOps Team**: GitHub issues with `rollback` label
- **Emergency**: Use GitHub Actions Emergency Rollback workflow
- **Documentation**: See `/docs/rollback-procedures.md`

## Best Practices

### Before Using Scripts

1. ✅ Verify production status
2. ✅ Check recent deployments
3. ✅ Confirm rollback target health
4. ✅ Have incident communication ready

### During Rollback

1. 📝 Document timeline and actions
2. 📊 Monitor health checks continuously
3. 📢 Communicate status to stakeholders
4. 🔍 Gather evidence for investigation

### After Rollback

1. 🕵️ Investigate root cause
2. 🧪 Test fix in staging
3. 📋 Plan redeployment strategy
4. 📚 Update procedures if needed
5. 🔄 Conduct post-incident review

## Script Dependencies

```
emergency-rollback.sh
├── vercel CLI
├── curl
├── bc (optional, for calculations)
└── VERCEL_TOKEN

health-check.sh
├── curl
├── bc (optional, for calculations)
└── vercel CLI (optional)

deployment-status.sh
├── vercel CLI
└── VERCEL_TOKEN

rollback-decision-tree.sh
├── curl
├── vercel CLI (optional)
└── bc (optional)
```

## Testing

### Test in Staging

```bash
# Test health checks
./health-check.sh --url https://staging-deployment.vercel.app

# Test deployment status
./deployment-status.sh --project staging-project

# Test decision tree (non-destructive)
./rollback-decision-tree.sh
```

### Validation Checklist

- [ ] Scripts are executable (`chmod +x *.sh`)
- [ ] Vercel CLI installed and authenticated
- [ ] VERCEL_TOKEN environment variable set
- [ ] Production URL accessible
- [ ] Previous deployments available for rollback
- [ ] Health endpoints responding correctly
- [ ] GitHub Actions workflows can be triggered

---

**⚠️ Important**: These scripts perform critical production operations. Always test in staging first and ensure you understand the implications of each action.