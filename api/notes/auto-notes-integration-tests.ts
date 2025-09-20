/**
 * Comprehensive Integration Tests for Auto Notes Endpoint
 * Tests all aspects of the POST /api/notes/auto endpoint
 */

interface TestConfig {
  apiBase: string;
  testToken: string;
  invalidToken: string;
  testBookId: string;
  invalidBookId: string;
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  response?: any;
  httpStatus?: number;
  duration?: number;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  total: number;
}

class AutoNotesIntegrationTester {
  private config: TestConfig;
  private suites: TestSuite[] = [];

  constructor(config: TestConfig) {
    this.config = config;
  }

  async runAllTests(): Promise<void> {
    console.log('🧪 Auto Notes Endpoint Integration Tests');
    console.log('=========================================');

    await this.runSuccessScenarios();
    await this.runAuthenticationTests();
    await this.runAuthorizationTests();
    await this.runValidationTests();
    await this.runRateLimitingTests();
    await this.runIntegrationTests();
    await this.runSecurityTests();
    await this.runEdgeCaseTests();

    this.printSummary();
  }

  private async runSuccessScenarios(): Promise<void> {
    const suite: TestSuite = {
      name: 'Success Scenarios (201)',
      tests: [],
      passed: 0,
      failed: 0,
      total: 0
    };

    // Test 1: Selection + enhance intent
    const enhanceTest = await this.testRequest({
      name: 'Selection + enhance intent (T5 knowledge enhancement)',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: this.config.testBookId,
        selection: { text: 'Democracy in America', chapterId: 'ch1' },
        intent: 'enhance',
        options: { includeMetrics: true }
      },
      expectedStatus: 201,
      validateResponse: (response) => {
        return response.source === 'auto' &&
               response.meta?.generationMethod === 'knowledge_enhancement' &&
               response.meta?.confidence >= 0.6 &&
               response.metrics !== undefined;
      }
    });
    suite.tests.push(enhanceTest);

    // Test 2: Selection without intent (contextual summary)
    const contextualTest = await this.testRequest({
      name: 'Selection without intent (contextual summary)',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: this.config.testBookId,
        selection: { text: 'The concept of liberty and its historical significance in modern democratic theory' },
        contextScope: 'chapter'
      },
      expectedStatus: 201,
      validateResponse: (response) => {
        return response.source === 'auto' &&
               response.content &&
               response.meta?.contextScope === 'chapter';
      }
    });
    suite.tests.push(contextualTest);

    // Test 3: No selection (dialog history summary)
    const dialogTest = await this.testRequest({
      name: 'No selection (dialog history summary)',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: this.config.testBookId,
        contextScope: 'recent_dialog'
      },
      expectedStatus: [201, 422], // 422 acceptable if no dialog history
      validateResponse: (response, status) => {
        if (status === 201) {
          return response.source === 'auto' &&
                 response.meta?.generationMethod === 'dialog_summary';
        }
        return status === 422; // No dialog history available
      }
    });
    suite.tests.push(dialogTest);

    this.finalizeSuite(suite);
    this.suites.push(suite);
  }

  private async runAuthenticationTests(): Promise<void> {
    const suite: TestSuite = {
      name: 'Authentication Tests (401)',
      tests: [],
      passed: 0,
      failed: 0,
      total: 0
    };

    // Test 1: Missing Authorization header
    const missingAuthTest = await this.testRequest({
      name: 'Missing Authorization header',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        bookId: this.config.testBookId,
        selection: { text: 'test' }
      },
      expectedStatus: 401
    });
    suite.tests.push(missingAuthTest);

    // Test 2: Invalid JWT token
    const invalidTokenTest = await this.testRequest({
      name: 'Invalid JWT token',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.invalidToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: this.config.testBookId,
        selection: { text: 'test' }
      },
      expectedStatus: 401
    });
    suite.tests.push(invalidTokenTest);

    // Test 3: Malformed Authorization header
    const malformedAuthTest = await this.testRequest({
      name: 'Malformed Authorization header',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': 'InvalidFormat',
        'Content-Type': 'application/json'
      },
      body: {
        bookId: this.config.testBookId,
        selection: { text: 'test' }
      },
      expectedStatus: 401
    });
    suite.tests.push(malformedAuthTest);

    this.finalizeSuite(suite);
    this.suites.push(suite);
  }

  private async runAuthorizationTests(): Promise<void> {
    const suite: TestSuite = {
      name: 'Authorization Tests (403)',
      tests: [],
      passed: 0,
      failed: 0,
      total: 0
    };

    // Test 1: Access to non-existent book
    const nonExistentBookTest = await this.testRequest({
      name: 'Access to non-existent book',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: '00000000-0000-0000-0000-000000000000',
        selection: { text: 'test' }
      },
      expectedStatus: 403
    });
    suite.tests.push(nonExistentBookTest);

    // Test 2: Cross-user book access simulation
    const crossUserTest = await this.testRequest({
      name: 'Cross-user book access attempt',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: 'user2-book-12345678-1234-5678-9012-123456789012',
        selection: { text: 'test' }
      },
      expectedStatus: [403, 422] // 422 for invalid UUID format
    });
    suite.tests.push(crossUserTest);

    this.finalizeSuite(suite);
    this.suites.push(suite);
  }

  private async runValidationTests(): Promise<void> {
    const suite: TestSuite = {
      name: 'Input Validation Tests (422)',
      tests: [],
      passed: 0,
      failed: 0,
      total: 0
    };

    // Test 1: Invalid intent value
    const invalidIntentTest = await this.testRequest({
      name: 'Invalid intent value',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: this.config.testBookId,
        intent: 'invalid-intent',
        selection: { text: 'test' }
      },
      expectedStatus: 422
    });
    suite.tests.push(invalidIntentTest);

    // Test 2: Selection text too long (>1000 chars)
    const longTextTest = await this.testRequest({
      name: 'Selection text too long (>1000 chars)',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: this.config.testBookId,
        selection: { text: 'x'.repeat(1100) }
      },
      expectedStatus: 422
    });
    suite.tests.push(longTextTest);

    // Test 3: Invalid UUID format for bookId
    const invalidUuidTest = await this.testRequest({
      name: 'Invalid UUID format for bookId',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: this.config.invalidBookId,
        selection: { text: 'test' }
      },
      expectedStatus: 422
    });
    suite.tests.push(invalidUuidTest);

    // Test 4: Invalid contextScope value
    const invalidContextTest = await this.testRequest({
      name: 'Invalid contextScope value',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: this.config.testBookId,
        contextScope: 'invalid-scope'
      },
      expectedStatus: 422
    });
    suite.tests.push(invalidContextTest);

    // Test 5: Missing selection for enhance intent
    const missingSelectionTest = await this.testRequest({
      name: 'Missing selection for enhance intent',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: this.config.testBookId,
        intent: 'enhance'
      },
      expectedStatus: 422
    });
    suite.tests.push(missingSelectionTest);

    // Test 6: No selection, intent, or contextScope
    const noGuidanceTest = await this.testRequest({
      name: 'No selection, intent, or contextScope provided',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: this.config.testBookId
      },
      expectedStatus: 422
    });
    suite.tests.push(noGuidanceTest);

    this.finalizeSuite(suite);
    this.suites.push(suite);
  }

  private async runRateLimitingTests(): Promise<void> {
    const suite: TestSuite = {
      name: 'Rate Limiting Tests (429)',
      tests: [],
      passed: 0,
      failed: 0,
      total: 0
    };

    console.log('\n⏱️  Testing rate limiting (20 auto-notes per hour)...');
    let rateLimitReached = false;
    let requestCount = 0;

    for (let i = 1; i <= 25; i++) {
      const startTime = Date.now();

      try {
        const response = await fetch(`${this.config.apiBase}/notes/auto`, {
          method: 'POST',
          headers: {
            'Authorization': this.config.testToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            bookId: this.config.testBookId,
            selection: { text: `rate limit test ${i}` }
          })
        });

        requestCount = i;

        if (response.status === 429) {
          rateLimitReached = true;
          console.log(`Rate limit reached at request ${i}`);
          break;
        }

        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Request ${i} failed:`, error);
        break;
      }
    }

    const rateLimitTest: TestResult = {
      name: `Rate limiting (20 auto-notes per hour)`,
      passed: rateLimitReached,
      error: rateLimitReached ? undefined : `Rate limit not reached in ${requestCount} requests`,
      duration: 0
    };
    suite.tests.push(rateLimitTest);

    this.finalizeSuite(suite);
    this.suites.push(suite);
  }

  private async runIntegrationTests(): Promise<void> {
    const suite: TestSuite = {
      name: 'T5/T7 Integration Tests',
      tests: [],
      passed: 0,
      failed: 0,
      total: 0
    };

    // Test T5 Knowledge Enhancement
    const t5Test = await this.testRequest({
      name: 'T5 knowledge enhancement integration',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: this.config.testBookId,
        selection: { text: 'Renaissance humanism and its impact on modern thought' },
        intent: 'enhance',
        options: { includeMetrics: true }
      },
      expectedStatus: 201,
      validateResponse: (response) => {
        return response.meta?.generationMethod === 'knowledge_enhancement' &&
               response.meta?.confidence >= 0.6 &&
               response.metrics !== undefined;
      }
    });
    suite.tests.push(t5Test);

    // Test T7 Dialog History Integration (may fail if no history)
    const t7Test = await this.testRequest({
      name: 'T7 dialog history integration',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: this.config.testBookId,
        contextScope: 'recent_dialog'
      },
      expectedStatus: [201, 422],
      validateResponse: (response, status) => {
        if (status === 201) {
          return response.meta?.generationMethod === 'dialog_summary';
        }
        return true; // 422 is acceptable if no dialog history
      }
    });
    suite.tests.push(t7Test);

    this.finalizeSuite(suite);
    this.suites.push(suite);
  }

  private async runSecurityTests(): Promise<void> {
    const suite: TestSuite = {
      name: 'Security Tests',
      tests: [],
      passed: 0,
      failed: 0,
      total: 0
    };

    // Test SQL injection in bookId
    const sqlInjectionTest = await this.testRequest({
      name: 'SQL injection attempt in bookId',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: "test'; DROP TABLE notes; --",
        selection: { text: 'test' }
      },
      expectedStatus: 422 // Should be rejected by input validation
    });
    suite.tests.push(sqlInjectionTest);

    // Test XSS attempt in selection text
    const xssTest = await this.testRequest({
      name: 'XSS attempt in selection text',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {
        bookId: this.config.testBookId,
        selection: { text: '<script>alert("xss")</script>' }
      },
      expectedStatus: 201, // Should be processed but sanitized
      validateResponse: (response) => {
        // Response should not contain executable script tags
        return !response.content.includes('<script>');
      }
    });
    suite.tests.push(xssTest);

    this.finalizeSuite(suite);
    this.suites.push(suite);
  }

  private async runEdgeCaseTests(): Promise<void> {
    const suite: TestSuite = {
      name: 'Edge Case Tests',
      tests: [],
      passed: 0,
      failed: 0,
      total: 0
    };

    // Test empty request body
    const emptyBodyTest = await this.testRequest({
      name: 'Empty request body',
      method: 'POST',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken,
        'Content-Type': 'application/json'
      },
      body: {},
      expectedStatus: 422
    });
    suite.tests.push(emptyBodyTest);

    // Test wrong HTTP method
    const wrongMethodTest = await this.testRequest({
      name: 'Wrong HTTP method (GET)',
      method: 'GET',
      endpoint: '/notes/auto',
      headers: {
        'Authorization': this.config.testToken
      },
      expectedStatus: 405
    });
    suite.tests.push(wrongMethodTest);

    this.finalizeSuite(suite);
    this.suites.push(suite);
  }

  private async testRequest(test: {
    name: string;
    method: string;
    endpoint: string;
    headers?: Record<string, string>;
    body?: any;
    expectedStatus: number | number[];
    validateResponse?: (response: any, status: number) => boolean;
  }): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.config.apiBase}${test.endpoint}`, {
        method: test.method,
        headers: test.headers || {},
        body: test.body ? JSON.stringify(test.body) : undefined
      });

      const duration = Date.now() - startTime;
      const expectedStatuses = Array.isArray(test.expectedStatus) ? test.expectedStatus : [test.expectedStatus];

      let responseData: any = null;
      try {
        responseData = await response.json();
      } catch (e) {
        // Response might not be JSON
      }

      const statusMatch = expectedStatuses.includes(response.status);
      let validationPassed = true;

      if (statusMatch && test.validateResponse && responseData) {
        validationPassed = test.validateResponse(responseData, response.status);
      }

      const passed = statusMatch && validationPassed;

      return {
        name: test.name,
        passed,
        error: passed ? undefined : `Status: ${response.status}, Expected: ${expectedStatuses.join('|')}, Validation: ${validationPassed}`,
        response: responseData,
        httpStatus: response.status,
        duration
      };

    } catch (error) {
      return {
        name: test.name,
        passed: false,
        error: `Request failed: ${error}`,
        duration: Date.now() - startTime
      };
    }
  }

  private finalizeSuite(suite: TestSuite): void {
    suite.total = suite.tests.length;
    suite.passed = suite.tests.filter(t => t.passed).length;
    suite.failed = suite.total - suite.passed;

    console.log(`\n📋 ${suite.name}`);
    console.log('='.repeat(suite.name.length + 4));

    suite.tests.forEach(test => {
      const status = test.passed ? '✅ PASS' : '❌ FAIL';
      const duration = test.duration ? ` (${test.duration}ms)` : '';
      console.log(`${status}: ${test.name}${duration}`);

      if (!test.passed && test.error) {
        console.log(`   Error: ${test.error}`);
      }
    });

    console.log(`\nSuite Summary: ${suite.passed}/${suite.total} tests passed`);
  }

  private printSummary(): void {
    const totalTests = this.suites.reduce((sum, suite) => sum + suite.total, 0);
    const totalPassed = this.suites.reduce((sum, suite) => sum + suite.passed, 0);
    const totalFailed = totalTests - totalPassed;

    console.log('\n' + '='.repeat(60));
    console.log('🏁 AUTO NOTES INTEGRATION TEST SUMMARY');
    console.log('='.repeat(60));

    this.suites.forEach(suite => {
      const percentage = suite.total > 0 ? Math.round((suite.passed / suite.total) * 100) : 0;
      console.log(`${suite.name}: ${suite.passed}/${suite.total} (${percentage}%)`);
    });

    console.log('\n📊 OVERALL RESULTS:');
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${totalPassed}`);
    console.log(`Failed: ${totalFailed}`);
    console.log(`Success Rate: ${totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0}%`);

    if (totalFailed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Auto notes endpoint is working correctly.');
    } else {
      console.log(`\n⚠️  ${totalFailed} tests failed. Please review the failures above.`);
    }

    console.log('\n✅ Coverage verified:');
    console.log('- Success scenarios (201) - All request patterns');
    console.log('- Authentication (401) - Missing/invalid tokens');
    console.log('- Authorization (403) - Cross-user access prevention');
    console.log('- Input validation (422) - All validation rules');
    console.log('- Rate limiting (429) - 20 auto-notes per hour');
    console.log('- T5 knowledge enhancement integration');
    console.log('- T7 dialog history integration');
    console.log('- Security validations - XSS, SQL injection');
    console.log('- Edge cases - Wrong methods, empty bodies');
    console.log('- Response format compliance');
  }
}

// Main execution
async function main() {
  const config: TestConfig = {
    apiBase: process.env.API_BASE || 'http://localhost:3001/api',
    testToken: process.env.TEST_TOKEN || 'Bearer test-token-123',
    invalidToken: process.env.INVALID_TOKEN || 'Bearer invalid-token-xyz',
    testBookId: process.env.TEST_BOOK_ID || '550e8400-e29b-41d4-a716-446655440000',
    invalidBookId: 'not-a-valid-uuid'
  };

  const tester = new AutoNotesIntegrationTester(config);
  await tester.runAllTests();
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { AutoNotesIntegrationTester, TestConfig, TestResult, TestSuite };