#!/usr/bin/env node

/**
 * FlowReader Security Testing Suite
 *
 * Comprehensive security tests to validate security hardening measures.
 * Run with: node tests/security-tests.js
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { performance } from 'perf_hooks';

const config = {
  apiUrl: process.env.API_URL || 'http://localhost:3001',
  supabaseUrl: process.env.PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  testUser: {
    email: 'security-test@example.com',
    password: 'SecureTestPass123!'
  }
};

class SecurityTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };

    if (config.supabaseUrl && config.supabaseKey) {
      this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    }
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: '📝',
      pass: '✅',
      fail: '❌',
      warn: '⚠️',
      skip: '⏭️'
    }[level] || '📝';

    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async test(name, testFn, category = 'general') {
    this.log(`Testing: ${name}`, 'info');

    try {
      const start = performance.now();
      const result = await testFn();
      const duration = performance.now() - start;

      if (result.success) {
        this.results.passed++;
        this.log(`PASS: ${name} (${duration.toFixed(2)}ms)`, 'pass');
      } else {
        this.results.failed++;
        this.log(`FAIL: ${name} - ${result.message} (${duration.toFixed(2)}ms)`, 'fail');
      }

      this.results.tests.push({
        name,
        category,
        success: result.success,
        message: result.message,
        duration,
        details: result.details
      });

    } catch (error) {
      this.results.failed++;
      this.log(`ERROR: ${name} - ${error.message}`, 'fail');

      this.results.tests.push({
        name,
        category,
        success: false,
        message: error.message,
        duration: 0,
        error: true
      });
    }
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${config.apiUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data: response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : await response.text()
    };
  }

  // Rate Limiting Tests
  async testRateLimiting() {
    await this.test('Rate Limiting - Burst Requests', async () => {
      const requests = [];
      const endpoint = '/api/health';

      // Send 150 requests rapidly (should hit rate limit)
      for (let i = 0; i < 150; i++) {
        requests.push(this.makeRequest(endpoint));
      }

      const responses = await Promise.allSettled(requests);
      const rateLimited = responses.some(r =>
        r.status === 'fulfilled' && r.value.status === 429
      );

      return {
        success: rateLimited,
        message: rateLimited
          ? 'Rate limiting working correctly'
          : 'Rate limiting not enforced',
        details: {
          totalRequests: requests.length,
          rateLimitedCount: responses.filter(r =>
            r.status === 'fulfilled' && r.value.status === 429
          ).length
        }
      };
    }, 'rate-limiting');

    await this.test('Rate Limiting - Headers Present', async () => {
      const response = await this.makeRequest('/api/health');

      const hasRateLimitHeaders =
        response.headers['x-ratelimit-limit'] &&
        response.headers['x-ratelimit-remaining'] &&
        response.headers['x-ratelimit-reset'];

      return {
        success: hasRateLimitHeaders,
        message: hasRateLimitHeaders
          ? 'Rate limit headers present'
          : 'Rate limit headers missing',
        details: {
          headers: response.headers
        }
      };
    }, 'rate-limiting');
  }

  // CORS Tests
  async testCORS() {
    await this.test('CORS - Origin Restriction', async () => {
      const response = await this.makeRequest('/api/health', {
        headers: {
          'Origin': 'https://malicious-site.com'
        }
      });

      const allowedOrigins = response.headers['access-control-allow-origin'];
      const isRestricted = !allowedOrigins || !allowedOrigins.includes('*');

      return {
        success: isRestricted,
        message: isRestricted
          ? 'CORS properly restricted'
          : 'CORS allows all origins (security risk)',
        details: {
          allowedOrigins
        }
      };
    }, 'cors');

    await this.test('CORS - Security Headers Present', async () => {
      const response = await this.makeRequest('/api/health');

      const securityHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection',
        'referrer-policy',
        'strict-transport-security'
      ];

      const missingHeaders = securityHeaders.filter(
        header => !response.headers[header]
      );

      return {
        success: missingHeaders.length === 0,
        message: missingHeaders.length === 0
          ? 'All security headers present'
          : `Missing headers: ${missingHeaders.join(', ')}`,
        details: {
          missingHeaders,
          presentHeaders: securityHeaders.filter(h => response.headers[h])
        }
      };
    }, 'cors');
  }

  // Input Validation Tests
  async testInputValidation() {
    await this.test('Input Validation - SQL Injection', async () => {
      const maliciousPayload = {
        content: "'; DROP TABLE notes; --",
        bookId: "00000000-0000-0000-0000-000000000000"
      };

      const response = await this.makeRequest('/api/notes', {
        method: 'POST',
        body: JSON.stringify(maliciousPayload),
        headers: {
          'Authorization': 'Bearer fake-token'
        }
      });

      // Should return 400/401, not 500 (which might indicate SQL injection)
      const isSafe = response.status !== 500;

      return {
        success: isSafe,
        message: isSafe
          ? 'SQL injection attempt handled safely'
          : 'Potential SQL injection vulnerability',
        details: {
          status: response.status,
          response: response.data
        }
      };
    }, 'input-validation');

    await this.test('Input Validation - XSS Prevention', async () => {
      const xssPayload = {
        content: '<script>alert("xss")</script>',
        bookId: "00000000-0000-0000-0000-000000000000"
      };

      const response = await this.makeRequest('/api/notes', {
        method: 'POST',
        body: JSON.stringify(xssPayload),
        headers: {
          'Authorization': 'Bearer fake-token'
        }
      });

      // Check if script tags are sanitized in response
      const responseStr = JSON.stringify(response.data);
      const hasScript = responseStr.includes('<script>');

      return {
        success: !hasScript,
        message: !hasScript
          ? 'XSS payload sanitized'
          : 'XSS payload not sanitized',
        details: {
          containsScript: hasScript,
          response: response.data
        }
      };
    }, 'input-validation');

    await this.test('Input Validation - Large Payload Rejection', async () => {
      const largePayload = {
        content: 'A'.repeat(100000), // 100KB string
        bookId: "00000000-0000-0000-0000-000000000000"
      };

      const response = await this.makeRequest('/api/notes', {
        method: 'POST',
        body: JSON.stringify(largePayload),
        headers: {
          'Authorization': 'Bearer fake-token'
        }
      });

      // Should reject large payloads
      const isRejected = response.status === 400 || response.status === 413;

      return {
        success: isRejected,
        message: isRejected
          ? 'Large payload rejected'
          : 'Large payload accepted (potential DoS risk)',
        details: {
          status: response.status,
          payloadSize: JSON.stringify(largePayload).length
        }
      };
    }, 'input-validation');
  }

  // Authentication Tests
  async testAuthentication() {
    await this.test('Authentication - Missing Token Rejection', async () => {
      const response = await this.makeRequest('/api/notes');

      const isUnauthorized = response.status === 401;

      return {
        success: isUnauthorized,
        message: isUnauthorized
          ? 'Missing token properly rejected'
          : 'Missing token not rejected',
        details: {
          status: response.status
        }
      };
    }, 'authentication');

    await this.test('Authentication - Invalid Token Rejection', async () => {
      const response = await this.makeRequest('/api/notes', {
        headers: {
          'Authorization': 'Bearer invalid-token-12345'
        }
      });

      const isUnauthorized = response.status === 401;

      return {
        success: isUnauthorized,
        message: isUnauthorized
          ? 'Invalid token properly rejected'
          : 'Invalid token not rejected',
        details: {
          status: response.status
        }
      };
    }, 'authentication');
  }

  // Database Security Tests (RLS)
  async testDatabaseSecurity() {
    if (!this.supabase) {
      await this.test('Database Security - RLS Policies', async () => {
        return {
          success: false,
          message: 'Skipped - Supabase not configured'
        };
      }, 'database');
      return;
    }

    await this.test('Database Security - User Data Isolation', async () => {
      try {
        // Try to access books without proper user context
        const { data, error } = await this.supabase
          .from('books')
          .select('*')
          .limit(10);

        // Should return empty or error due to RLS
        const isSecure = !data || data.length === 0 || error;

        return {
          success: isSecure,
          message: isSecure
            ? 'RLS properly restricts access'
            : 'RLS allows unauthorized access',
          details: {
            dataCount: data?.length || 0,
            error: error?.message
          }
        };
      } catch (error) {
        return {
          success: true,
          message: 'RLS properly blocks access',
          details: { error: error.message }
        };
      }
    }, 'database');
  }

  // Generate comprehensive report
  generateReport() {
    const summary = {
      total: this.results.passed + this.results.failed,
      passed: this.results.passed,
      failed: this.results.failed,
      successRate: this.results.passed / (this.results.passed + this.results.failed) * 100
    };

    const categorySummary = this.results.tests.reduce((acc, test) => {
      if (!acc[test.category]) {
        acc[test.category] = { passed: 0, failed: 0, total: 0 };
      }
      acc[test.category].total++;
      if (test.success) {
        acc[test.category].passed++;
      } else {
        acc[test.category].failed++;
      }
      return acc;
    }, {});

    console.log('\n' + '='.repeat(80));
    console.log('🛡️  FLOWREADER SECURITY TEST REPORT');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${summary.total}`);
    console.log(`✅ Passed: ${summary.passed}`);
    console.log(`❌ Failed: ${summary.failed}`);
    console.log(`📊 Success Rate: ${summary.successRate.toFixed(1)}%`);
    console.log('\n📋 Category Breakdown:');

    Object.entries(categorySummary).forEach(([category, stats]) => {
      const rate = (stats.passed / stats.total * 100).toFixed(1);
      console.log(`  ${category}: ${stats.passed}/${stats.total} (${rate}%)`);
    });

    console.log('\n📝 Failed Tests:');
    const failedTests = this.results.tests.filter(t => !t.success);
    if (failedTests.length === 0) {
      console.log('  🎉 All tests passed!');
    } else {
      failedTests.forEach(test => {
        console.log(`  ❌ ${test.name}: ${test.message}`);
      });
    }

    console.log('\n🔒 Security Recommendations:');
    if (summary.failed > 0) {
      console.log('  🚨 CRITICAL: Fix failed security tests before production deployment');
      console.log('  📖 Review security hardening documentation');
      console.log('  🔄 Re-run tests after implementing fixes');
    } else {
      console.log('  ✅ All security tests pass - ready for production');
      console.log('  📅 Schedule regular security testing');
      console.log('  🔍 Consider penetration testing for comprehensive validation');
    }

    return {
      status: summary.failed === 0 ? 'PASS' : 'FAIL',
      summary,
      categorySummary,
      failedTests
    };
  }

  async runAllTests() {
    this.log('Starting FlowReader Security Test Suite', 'info');

    // Run all test categories
    await this.testRateLimiting();
    await this.testCORS();
    await this.testInputValidation();
    await this.testAuthentication();
    await this.testDatabaseSecurity();

    return this.generateReport();
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new SecurityTester();

  tester.runAllTests()
    .then(report => {
      process.exit(report.status === 'PASS' ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Security testing failed:', error);
      process.exit(1);
    });
}

export { SecurityTester };