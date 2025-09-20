# Post-Deployment Verification Usage Examples

## Quick Reference

```bash
# Basic verification
npm run verify:post-deploy https://your-app.vercel.app

# Shell script with environment presets
./scripts/verify.sh --env production https://flowreader.app

# Makefile shortcuts
make verify URL=https://your-app.vercel.app
make verify-production  # requires PRODUCTION_URL env var
```

## Complete Examples

### 1. Local Development Verification

```bash
# Start your dev server first
npm run dev

# In another terminal
npm run verify:post-deploy http://localhost:3000

# Or with preset
./scripts/verify.sh --env local
```

### 2. Staging Environment

```bash
# Direct URL
npm run verify:staging https://staging-flowreader.vercel.app

# With environment variables
export STAGING_URL=https://staging-flowreader.vercel.app
make verify-staging

# Custom timeout for slower staging
VERIFY_TIMEOUT=20000 ./scripts/verify.sh https://staging-flowreader.vercel.app
```

### 3. Production Environment

```bash
# Full production verification
export PRODUCTION_URL=https://flowreader.app
export VERIFY_TIMEOUT=15000
export HEALTH_CHECK_MAX_MS=3000
export API_MAX_MS=8000

make verify-production

# Or all-in-one
./scripts/verify.sh --env production https://flowreader.app
```

### 4. CI/CD Integration

**GitHub Actions (automatic)**
```yaml
# Workflow automatically runs after deployments
# See .github/workflows/post-deploy-verify.yml
```

**Manual GitHub Actions**
```bash
# Trigger via GitHub UI
# - Go to Actions tab
# - Select "Post-Deployment Verification"
# - Click "Run workflow"
# - Choose environment and optional URL
```

**Vercel Deploy Hook**
```bash
# Add to vercel.json
{
  "github": {
    "autoJobCancelation": false
  }
}
```

### 5. Advanced Configuration

**Custom configuration file**
```bash
# Create .env.verify
cp scripts/verify-config.example.env .env.verify

# Edit your settings
nano .env.verify

# Run with config
./scripts/verify.sh https://your-app.vercel.app
```

**Example .env.verify**
```bash
BASE_URL=https://flowreader.app
VERIFY_TIMEOUT=15000
HEALTH_CHECK_MAX_MS=3000
API_MAX_MS=8000
STREAMING_MAX_MS=15000
TEST_USER_EMAIL=test@flowreader.app
TEST_USER_PASSWORD=secure-test-password
OUTPUT_JSON=false
```

### 6. Troubleshooting Examples

**Debug verbose output**
```bash
DEBUG=* npm run verify:post-deploy https://your-app.vercel.app
```

**Custom timeouts for slow networks**
```bash
VERIFY_TIMEOUT=30000 \
HEALTH_CHECK_MAX_MS=5000 \
API_MAX_MS=15000 \
./scripts/verify.sh https://your-app.vercel.app
```

**JSON output for processing**
```bash
npm run verify:post-deploy https://your-app.vercel.app \
  | jq '.results[] | select(.status == "FAIL")'
```

**Test specific aspects only**
```bash
# Edit scripts/post-deploy-verify.ts to comment out test phases
# For example, comment out security tests for internal testing

# Then run normally
npm run verify:post-deploy https://internal-staging.app
```

## Expected Output Examples

### Successful Verification
```
🔍 FlowReader Post-Deployment Verification Suite
================================================

🏥 Running Health Check Verification...
  🧪 Health Endpoint Availability...
    ✅ PASS (234ms)
  🧪 Health Check Response Time...
    ✅ PASS (234ms)

🔒 Running Security Headers Verification...
  🧪 Security Headers - /api/health...
    ✅ PASS (156ms)
  🧪 Security Headers - /api/chat/stream...
    ✅ PASS (189ms)

⚡ Running Rate Limiting Verification...
  🧪 Rate Limit Headers Present...
    ✅ PASS (123ms)

📋 Running Core Contract Testing...
  🧪 Chat Stream SSE Contract...
    ✅ PASS (345ms)
  🧪 Auto Notes Contract...
    ✅ PASS (278ms)

⚡ Running Performance Validation...
  🧪 API Response Times...
    ✅ PASS (456ms)

📊 Verification Summary
=====================
Environment: https://flowreader.app
Total Tests: 12
✅ Passed: 12
❌ Failed: 0
⏭️ Skipped: 0

🏁 Verification PASSED
```

### Failed Verification
```
🔍 FlowReader Post-Deployment Verification Suite
================================================

🏥 Running Health Check Verification...
  🧪 Health Endpoint Availability...
    ❌ FAIL (5000ms): Request timeout after 5000ms

📊 Verification Summary
=====================
Environment: https://broken-app.vercel.app
Total Tests: 1
✅ Passed: 0
❌ Failed: 1

❌ Failed Tests:
  • Health Endpoint Availability: Request timeout after 5000ms

🏁 Verification FAILED
```

## Integration Examples

### 1. Slack Notifications

```bash
#!/bin/bash
# slack-notify-verification.sh

RESULT=$(npm run verify:post-deploy $1 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  curl -X POST -H 'Content-type: application/json' \
    --data '{"text":"✅ Post-deployment verification PASSED for '$1'"}' \
    $SLACK_WEBHOOK_URL
else
  curl -X POST -H 'Content-type: application/json' \
    --data '{"text":"❌ Post-deployment verification FAILED for '$1'"}' \
    $SLACK_WEBHOOK_URL
fi
```

### 2. Custom Monitoring Integration

```bash
#!/bin/bash
# custom-monitoring.sh

OUTPUT_JSON=true npm run verify:post-deploy $1 > verification-report.json

# Send to monitoring system
curl -X POST -H 'Content-Type: application/json' \
  -d @verification-report.json \
  https://monitoring.your-company.com/api/verification-reports
```

### 3. Rollback on Failure

```bash
#!/bin/bash
# deploy-with-verification.sh

DEPLOY_URL=$1

echo "🚀 Deploying to $DEPLOY_URL..."
# Your deployment commands here

echo "🔍 Running post-deployment verification..."
if npm run verify:post-deploy $DEPLOY_URL; then
  echo "✅ Deployment verified successfully"
else
  echo "❌ Verification failed, rolling back..."
  # Your rollback commands here
  exit 1
fi
```

## Testing the Verification Suite

```bash
# Test the verification suite itself
npm run test:verify-suite

# Self-test only
npm run test:verify-suite -- --self-test

# Manual test with known endpoints
npm run verify:post-deploy http://httpstat.us/200  # Should pass
npm run verify:post-deploy http://httpstat.us/500  # Should fail
```

## Performance Baseline Examples

```bash
# Establish baseline for new environment
HEALTH_CHECK_MAX_MS=1000 \
API_MAX_MS=3000 \
npm run verify:post-deploy https://new-environment.app

# If it passes, update your configuration
echo "HEALTH_CHECK_MAX_MS=1000" >> .env.verify
echo "API_MAX_MS=3000" >> .env.verify
```

---

For more detailed information, see:
- `scripts/README-verification.md` - Complete documentation
- `scripts/verify.sh --help` - Command line help
- `.github/workflows/post-deploy-verify.yml` - CI/CD configuration