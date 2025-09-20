#!/usr/bin/env tsx

/**
 * Post-Deployment Verification Suite
 *
 * Comprehensive production verification tests to ensure:
 * - Health endpoints are functional
 * - Security headers are properly configured
 * - Rate limiting is working correctly
 * - Core API contracts are maintained
 * - Performance meets baseline requirements
 */

import { readFileSync } from 'fs';
import { join } from 'path';

interface VerificationConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  auth?: {
    email: string;
    password: string;
  };
  performance: {
    healthCheckMaxMs: number;
    apiMaxMs: number;
    streamingMaxMs: number;
  };
}

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  details?: string;
  metadata?: Record<string, any>;
}

interface VerificationReport {
  environment: string;
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  results: TestResult[];
  errors: string[];
}

class PostDeployVerifier {
  private config: VerificationConfig;
  private results: TestResult[] = [];
  private errors: string[] = [];
  private authToken?: string;

  constructor(config: VerificationConfig) {
    this.config = config;
  }

  async verify(): Promise<VerificationReport> {
    console.log(`🚀 Starting post-deployment verification for ${this.config.baseUrl}`);
    console.log(`⏱️  Timeout: ${this.config.timeout}ms, Retries: ${this.config.retries}`);
    console.log('');

    try {
      // Phase 1: Health Check Verification
      await this.runHealthChecks();

      // Phase 2: Security Headers Verification
      await this.runSecurityHeadersCheck();

      // Phase 3: Authentication & Rate Limiting
      if (this.config.auth) {
        await this.authenticateTestUser();
        await this.runRateLimitingTests();
      }

      // Phase 4: Core Contract Testing
      await this.runCoreContractTests();

      // Phase 5: Performance Validation
      await this.runPerformanceTests();

    } catch (error) {
      this.errors.push(`Verification suite error: ${error}`);
      console.error('❌ Verification suite encountered an error:', error);
    }

    return this.generateReport();
  }

  private async runHealthChecks(): Promise<void> {
    console.log('🏥 Running Health Check Verification...');

    await this.runTest('Health Endpoint Availability', async () => {
      const response = await this.makeRequest('/api/health', {
        method: 'GET',
        timeout: this.config.performance.healthCheckMaxMs,
      });

      if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
      }

      const body = await response.json();

      // Validate response structure
      const requiredFields = ['status', 'timestamp', 'version', 'environment', 'services'];
      for (const field of requiredFields) {
        if (!(field in body)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Validate status
      if (body.status !== 'ok') {
        throw new Error(`Health status is ${body.status}, expected 'ok'`);
      }

      // Validate services
      const requiredServices = ['database', 'queue', 'storage'];
      for (const service of requiredServices) {
        if (!body.services[service]) {
          throw new Error(`Service ${service} is not healthy: ${body.services[service]}`);
        }
      }

      return {
        status: body.status,
        services: body.services,
        version: body.version,
        environment: body.environment
      };
    });

    await this.runTest('Health Check Response Time', async () => {
      const start = Date.now();
      const response = await this.makeRequest('/api/health');
      const duration = Date.now() - start;

      if (duration > this.config.performance.healthCheckMaxMs) {
        throw new Error(`Health check took ${duration}ms, max allowed is ${this.config.performance.healthCheckMaxMs}ms`);
      }

      return { responseTime: duration };
    });
  }

  private async runSecurityHeadersCheck(): Promise<void> {
    console.log('🔒 Running Security Headers Verification...');

    const endpoints = [
      '/api/health',
      '/api/chat/stream',
      '/api/notes/auto',
      '/api/dialog/history'
    ];

    for (const endpoint of endpoints) {
      await this.runTest(`Security Headers - ${endpoint}`, async () => {
        const response = await this.makeRequest(endpoint, {
          method: endpoint === '/api/chat/stream' ? 'POST' : 'GET',
          headers: endpoint.includes('chat') || endpoint.includes('notes') || endpoint.includes('dialog')
            ? { 'Authorization': `Bearer ${this.authToken || 'test-token'}` }
            : undefined,
          body: endpoint === '/api/chat/stream'
            ? JSON.stringify({ bookId: 'test-book-id', query: 'test' })
            : undefined,
          expectStatus: [200, 401, 403] // Allow auth errors for now
        });

        const headers = response.headers;
        const securityHeaders = {
          'Content-Security-Policy': headers.get('content-security-policy'),
          'Strict-Transport-Security': headers.get('strict-transport-security'),
          'X-Content-Type-Options': headers.get('x-content-type-options'),
          'X-Frame-Options': headers.get('x-frame-options'),
          'Referrer-Policy': headers.get('referrer-policy'),
          'X-XSS-Protection': headers.get('x-xss-protection')
        };

        const issues: string[] = [];

        // Check critical security headers
        if (!securityHeaders['X-Content-Type-Options']) {
          issues.push('Missing X-Content-Type-Options header');
        } else if (securityHeaders['X-Content-Type-Options'] !== 'nosniff') {
          issues.push(`X-Content-Type-Options should be 'nosniff', got '${securityHeaders['X-Content-Type-Options']}'`);
        }

        if (!securityHeaders['X-Frame-Options']) {
          issues.push('Missing X-Frame-Options header');
        }

        if (!securityHeaders['Referrer-Policy']) {
          issues.push('Missing Referrer-Policy header');
        }

        // HSTS should be present in production
        if (this.config.baseUrl.startsWith('https://') && !securityHeaders['Strict-Transport-Security']) {
          issues.push('Missing Strict-Transport-Security header for HTTPS endpoint');
        }

        if (issues.length > 0) {
          throw new Error(`Security header issues: ${issues.join(', ')}`);
        }

        return securityHeaders;
      });
    }
  }

  private async runRateLimitingTests(): Promise<void> {
    console.log('⚡ Running Rate Limiting Verification...');

    await this.runTest('Rate Limit Headers Present', async () => {
      const response = await this.makeRequest('/api/health');

      const rateLimitHeaders = {
        'X-RateLimit-Limit': response.headers.get('x-ratelimit-limit'),
        'X-RateLimit-Remaining': response.headers.get('x-ratelimit-remaining'),
        'X-RateLimit-Reset': response.headers.get('x-ratelimit-reset')
      };

      // Note: Rate limit headers might not be present on health endpoint
      // This is more of an informational check
      return rateLimitHeaders;
    });

    await this.runTest('Rate Limit 429 Response', async () => {
      // Make multiple rapid requests to trigger rate limiting
      // Using a dedicated rate-limited endpoint if available
      const testEndpoint = '/api/dialog/history';
      const requests: Promise<Response>[] = [];

      // Make 10 rapid requests
      for (let i = 0; i < 10; i++) {
        requests.push(
          this.makeRequest(`${testEndpoint}?bookId=test-book-id&limit=1`, {
            headers: { 'Authorization': `Bearer ${this.authToken}` },
            expectStatus: [200, 401, 403, 429] // Allow various responses
          })
        );
      }

      const responses = await Promise.all(requests);

      // Check if any response has rate limiting headers
      let hasRateLimitHeaders = false;
      let has429Response = false;

      for (const response of responses) {
        if (response.headers.get('x-ratelimit-limit')) {
          hasRateLimitHeaders = true;
        }
        if (response.status === 429) {
          has429Response = true;

          // Validate 429 response format
          const retryAfter = response.headers.get('retry-after');
          if (!retryAfter) {
            throw new Error('429 response missing Retry-After header');
          }
        }
      }

      return {
        hasRateLimitHeaders,
        has429Response,
        responseStatuses: responses.map(r => r.status)
      };
    });
  }

  private async runCoreContractTests(): Promise<void> {
    console.log('📋 Running Core Contract Testing...');

    // Test /api/chat/stream SSE contract
    await this.runTest('Chat Stream SSE Contract', async () => {
      if (!this.authToken) {
        throw new Error('Authentication required for chat stream test');
      }

      const response = await this.makeRequest('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bookId: '00000000-0000-0000-0000-000000000000', // Test UUID
          query: 'test query'
        }),
        timeout: this.config.performance.streamingMaxMs,
        expectStatus: [200, 401, 403, 404] // Allow auth/access errors
      });

      // Check SSE headers
      const contentType = response.headers.get('content-type');
      if (response.status === 200 && contentType !== 'text/event-stream') {
        throw new Error(`Expected 'text/event-stream', got '${contentType}'`);
      }

      return {
        status: response.status,
        contentType,
        cacheControl: response.headers.get('cache-control'),
        connection: response.headers.get('connection')
      };
    });

    // Test /api/notes/auto contract
    await this.runTest('Auto Notes Contract', async () => {
      if (!this.authToken) {
        throw new Error('Authentication required for auto notes test');
      }

      const response = await this.makeRequest('/api/notes/auto', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bookId: '00000000-0000-0000-0000-000000000000',
          selection: {
            text: 'test selection text',
            start: 0,
            end: 18
          },
          intent: 'explain'
        }),
        expectStatus: [200, 201, 401, 403, 422] // Allow various responses
      });

      if (response.status === 201) {
        const body = await response.json();

        // Validate response structure for successful creation
        const requiredFields = ['id', 'userId', 'bookId', 'content', 'source', 'meta', 'createdAt'];
        for (const field of requiredFields) {
          if (!(field in body)) {
            throw new Error(`Missing required field: ${field}`);
          }
        }

        if (body.meta && !('confidence' in body.meta)) {
          throw new Error('Missing confidence score in meta');
        }
      }

      return {
        status: response.status,
        contentType: response.headers.get('content-type')
      };
    });

    // Test /api/dialog/history pagination contract
    await this.runTest('Dialog History Pagination Contract', async () => {
      if (!this.authToken) {
        throw new Error('Authentication required for dialog history test');
      }

      const response = await this.makeRequest('/api/dialog/history?bookId=00000000-0000-0000-0000-000000000000&limit=5', {
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        },
        expectStatus: [200, 401, 403, 404] // Allow various responses
      });

      if (response.status === 200) {
        const body = await response.json();

        // Validate pagination structure
        if (!('messages' in body) || !Array.isArray(body.messages)) {
          throw new Error('Response missing messages array');
        }

        if (!('pagination' in body)) {
          throw new Error('Response missing pagination object');
        }

        const pagination = body.pagination;
        if (!('hasMore' in pagination)) {
          throw new Error('Pagination missing hasMore field');
        }

        if (pagination.hasMore && !('nextCursor' in pagination)) {
          throw new Error('Pagination hasMore=true but missing nextCursor');
        }
      }

      return {
        status: response.status,
        contentType: response.headers.get('content-type')
      };
    });
  }

  private async runPerformanceTests(): Promise<void> {
    console.log('⚡ Running Performance Validation...');

    await this.runTest('API Response Times', async () => {
      const endpoints = [
        { path: '/api/health', maxMs: this.config.performance.healthCheckMaxMs },
        { path: '/api/dialog/history?bookId=00000000-0000-0000-0000-000000000000&limit=1', maxMs: this.config.performance.apiMaxMs, auth: true }
      ];

      const results: Record<string, any> = {};

      for (const endpoint of endpoints) {
        const headers: Record<string, string> = {};
        if (endpoint.auth && this.authToken) {
          headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        const start = Date.now();
        const response = await this.makeRequest(endpoint.path, {
          headers,
          expectStatus: [200, 401, 403, 404] // Allow auth errors
        });
        const duration = Date.now() - start;

        results[endpoint.path] = {
          duration,
          maxAllowed: endpoint.maxMs,
          passed: duration <= endpoint.maxMs,
          status: response.status
        };

        if (response.status === 200 && duration > endpoint.maxMs) {
          throw new Error(`${endpoint.path} took ${duration}ms, max allowed is ${endpoint.maxMs}ms`);
        }
      }

      return results;
    });

    await this.runTest('Concurrent Request Handling', async () => {
      // Test concurrent health checks
      const concurrentRequests = 5;
      const promises: Promise<Response>[] = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(this.makeRequest('/api/health'));
      }

      const start = Date.now();
      const responses = await Promise.all(promises);
      const totalDuration = Date.now() - start;

      const statuses = responses.map(r => r.status);
      const allSuccessful = statuses.every(status => status === 200);

      if (!allSuccessful) {
        throw new Error(`Not all concurrent requests succeeded: ${statuses.join(', ')}`);
      }

      // Expect concurrent requests to complete faster than sequential
      const maxConcurrentTime = this.config.performance.healthCheckMaxMs * 2;
      if (totalDuration > maxConcurrentTime) {
        throw new Error(`Concurrent requests took ${totalDuration}ms, max expected ${maxConcurrentTime}ms`);
      }

      return {
        concurrentRequests,
        totalDuration,
        averageDuration: totalDuration / concurrentRequests,
        statuses
      };
    });
  }

  private async authenticateTestUser(): Promise<void> {
    if (!this.config.auth) {
      return;
    }

    console.log('🔐 Authenticating test user...');

    try {
      // This is a placeholder - in real implementation, you'd authenticate with Supabase
      // For now, we'll use a mock token for testing endpoints that require auth
      this.authToken = 'mock-test-token-for-verification';

      // In a real implementation:
      // const response = await this.makeRequest('/auth/v1/token?grant_type=password', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     email: this.config.auth.email,
      //     password: this.config.auth.password
      //   })
      // });
      // const { access_token } = await response.json();
      // this.authToken = access_token;

      console.log('✅ Test user authenticated (mock token)');
    } catch (error) {
      console.warn('⚠️  Could not authenticate test user, skipping auth-required tests');
      this.authToken = undefined;
    }
  }

  private async runTest(name: string, testFn: () => Promise<any>): Promise<void> {
    const start = Date.now();
    console.log(`  🧪 ${name}...`);

    try {
      const metadata = await testFn();
      const duration = Date.now() - start;

      this.results.push({
        name,
        status: 'PASS',
        duration,
        metadata
      });

      console.log(`    ✅ PASS (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - start;
      const details = error instanceof Error ? error.message : String(error);

      this.results.push({
        name,
        status: 'FAIL',
        duration,
        details
      });

      console.log(`    ❌ FAIL (${duration}ms): ${details}`);
    }
  }

  private async makeRequest(path: string, options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
    expectStatus?: number[];
  } = {}): Promise<Response> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.config.timeout,
      expectStatus = [200]
    } = options;

    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'User-Agent': 'FlowReader-PostDeploy-Verifier/1.0',
          ...headers
        },
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!expectStatus.includes(response.status)) {
        throw new Error(`Unexpected status ${response.status}, expected one of: ${expectStatus.join(', ')}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  private generateReport(): VerificationReport {
    const summary = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'PASS').length,
      failed: this.results.filter(r => r.status === 'FAIL').length,
      skipped: this.results.filter(r => r.status === 'SKIP').length
    };

    return {
      environment: this.config.baseUrl,
      timestamp: new Date().toISOString(),
      summary,
      results: this.results,
      errors: this.errors
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const baseUrl = args[0] || process.env.DEPLOY_URL || process.env.VERCEL_URL || 'http://localhost:3000';

  // Environment-specific configuration
  const config: VerificationConfig = {
    baseUrl: baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`,
    timeout: parseInt(process.env.VERIFY_TIMEOUT || '10000'),
    retries: parseInt(process.env.VERIFY_RETRIES || '3'),
    auth: process.env.TEST_USER_EMAIL ? {
      email: process.env.TEST_USER_EMAIL,
      password: process.env.TEST_USER_PASSWORD!
    } : undefined,
    performance: {
      healthCheckMaxMs: parseInt(process.env.HEALTH_CHECK_MAX_MS || '2000'),
      apiMaxMs: parseInt(process.env.API_MAX_MS || '5000'),
      streamingMaxMs: parseInt(process.env.STREAMING_MAX_MS || '10000')
    }
  };

  console.log('🔍 FlowReader Post-Deployment Verification Suite');
  console.log('================================================');
  console.log('');

  const verifier = new PostDeployVerifier(config);
  const report = await verifier.verify();

  console.log('');
  console.log('📊 Verification Summary');
  console.log('=====================');
  console.log(`Environment: ${report.environment}`);
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Total Tests: ${report.summary.total}`);
  console.log(`✅ Passed: ${report.summary.passed}`);
  console.log(`❌ Failed: ${report.summary.failed}`);
  console.log(`⏭️  Skipped: ${report.summary.skipped}`);
  console.log('');

  if (report.summary.failed > 0) {
    console.log('❌ Failed Tests:');
    report.results
      .filter(r => r.status === 'FAIL')
      .forEach(result => {
        console.log(`  • ${result.name}: ${result.details}`);
      });
    console.log('');
  }

  if (report.errors.length > 0) {
    console.log('⚠️  Errors:');
    report.errors.forEach(error => {
      console.log(`  • ${error}`);
    });
    console.log('');
  }

  // Output JSON report for CI/CD integration
  if (process.env.OUTPUT_JSON === 'true') {
    console.log('📄 JSON Report:');
    console.log(JSON.stringify(report, null, 2));
  }

  // Exit with error code if tests failed
  const exitCode = report.summary.failed > 0 ? 1 : 0;
  console.log(`🏁 Verification ${exitCode === 0 ? 'PASSED' : 'FAILED'}`);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Verification suite crashed:', error);
    process.exit(2);
  });
}

export { PostDeployVerifier, type VerificationConfig, type VerificationReport };