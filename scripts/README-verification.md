# Post-Deployment Verification Suite

Comprehensive production verification tests for FlowReader deployments.

## Quick Start

```bash
# Verify local development
npm run verify:post-deploy http://localhost:3000

# Verify staging deployment
npm run verify:staging https://staging.flowreader.app

# Verify production deployment
npm run verify:production https://flowreader.app

# With custom configuration
VERIFY_TIMEOUT=20000 npm run verify:post-deploy https://your-app.vercel.app
```

## What It Tests

### 🏥 Health Check Verification
- `/api/health` endpoint availability
- Response format validation
- Service status checks
- Response time performance

### 🔒 Security Headers Verification
- Content-Security-Policy
- Strict-Transport-Security (HTTPS only)
- X-Content-Type-Options
- X-Frame-Options
- Referrer-Policy
- X-XSS-Protection

### ⚡ Rate Limiting Verification
- Rate limit headers presence
- 429 response handling
- Retry-After header validation

### 📋 Core Contract Testing
- **Chat Stream (`/api/chat/stream`)**: SSE streaming format
- **Auto Notes (`/api/notes/auto`)**: Response structure with confidence scores
- **Dialog History (`/api/dialog/history`)**: Pagination contract

### ⚡ Performance Validation
- API response time thresholds
- Concurrent request handling
- Resource efficiency checks

## Configuration

### Environment Variables

```bash
# Base URL (can be passed as argument)
BASE_URL=https://your-app.vercel.app

# Request settings
VERIFY_TIMEOUT=10000          # Request timeout in ms
VERIFY_RETRIES=3              # Number of retries

# Performance thresholds
HEALTH_CHECK_MAX_MS=2000      # Health check max response time
API_MAX_MS=5000               # API endpoints max response time
STREAMING_MAX_MS=10000        # Streaming endpoints max response time

# Test user (optional - enables auth tests)
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=test-password

# Output format
OUTPUT_JSON=true              # Output JSON report for CI/CD
```

### Example Configuration Files

Create `.env.verify` based on `verify-config.example.env`:

```bash
cp scripts/verify-config.example.env .env.verify
```

## CI/CD Integration

### GitHub Actions

The verification suite automatically runs after successful deployments using the provided workflow:

```yaml
# .github/workflows/post-deploy-verify.yml
- Run after Vercel deployments
- Configurable environments (production/staging/preview)
- Automatic PR comments for preview deployments
- Artifact uploads for reports
```

### Manual Trigger

```bash
# Trigger via GitHub Actions UI
# Environment: production|staging|preview
# Base URL: (optional) https://your-custom-url.com
```

### Vercel Integration

Add to `vercel.json`:

```json
{
  "github": {
    "autoJobCancelation": false
  },
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 30
    }
  }
}
```

## Acceptance Criteria

### AC-1: Health Check Returns 200 with Valid Payload
✅ `/api/health` returns 200 status
✅ Response includes required fields: `status`, `timestamp`, `version`, `environment`, `services`
✅ Status is `'ok'`
✅ All services report healthy status

### AC-2: Security and Rate Limit Headers Present
✅ Critical security headers present on all endpoints
✅ Rate limiting headers included in responses
✅ 429 responses include Retry-After header

### AC-3: Core Endpoints Respond Per Contract
✅ Chat stream returns proper SSE format
✅ Auto notes include confidence scores and metadata
✅ Dialog history includes proper pagination structure

### AC-4: Performance Meets Targets
✅ Health check: < 2s (staging) / < 3s (production)
✅ API endpoints: < 5s (staging) / < 8s (production)
✅ Streaming: < 10s (staging) / < 15s (production)

## Report Format

### Console Output
```
🔍 FlowReader Post-Deployment Verification Suite
================================================

🏥 Running Health Check Verification...
  🧪 Health Endpoint Availability...
    ✅ PASS (234ms)
  🧪 Health Check Response Time...
    ✅ PASS (234ms)

📊 Verification Summary
=====================
Environment: https://flowreader.app
Total Tests: 15
✅ Passed: 15
❌ Failed: 0
⏭️ Skipped: 0

🏁 Verification PASSED
```

### JSON Report (CI/CD)
```json
{
  "environment": "https://flowreader.app",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "summary": {
    "total": 15,
    "passed": 15,
    "failed": 0,
    "skipped": 0
  },
  "results": [
    {
      "name": "Health Endpoint Availability",
      "status": "PASS",
      "duration": 234,
      "metadata": {
        "status": "ok",
        "services": {"database": "ok", "queue": "ok", "storage": "ok"}
      }
    }
  ],
  "errors": []
}
```

## Troubleshooting

### Common Issues

**Authentication Required Tests Failing**
```bash
# Set test user credentials
export TEST_USER_EMAIL=test@example.com
export TEST_USER_PASSWORD=your-test-password
```

**Timeout Errors**
```bash
# Increase timeout for slower environments
export VERIFY_TIMEOUT=20000
```

**Rate Limiting False Positives**
```bash
# Reduce concurrent requests or wait between runs
sleep 60 && npm run verify:post-deploy
```

### Debug Mode

```bash
# Enable verbose logging
DEBUG=* npm run verify:post-deploy

# Test specific endpoints only
# (modify script to comment out unwanted test phases)
```

## Development

### Adding New Tests

```typescript
// In PostDeployVerifier class
private async runCustomTests(): Promise<void> {
  await this.runTest('My Custom Test', async () => {
    const response = await this.makeRequest('/api/my-endpoint');

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    return { customMetadata: 'test-data' };
  });
}
```

### Test Categories

1. **Health Tests**: Service availability and basic functionality
2. **Security Tests**: Headers, HTTPS, CSP policies
3. **Performance Tests**: Response times and resource usage
4. **Contract Tests**: API response structure validation
5. **Integration Tests**: End-to-end workflow validation

---

**Need Help?**
- Check the [GitHub Actions logs](../../actions) for detailed test results
- Review the verification report artifacts
- File an issue if you discover missing test coverage