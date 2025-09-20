/**
 * Dialog History API Contract Tests
 *
 * Comprehensive contract testing and integration verification for dialog history endpoints.
 * Tests all request/response formats, error codes, edge cases, and security requirements.
 */

import { supabaseAdmin } from '../_lib/auth.js';

interface TestCase {
  name: string;
  description: string;
  category: 'contract' | 'security' | 'integration' | 'performance';
  priority: 'critical' | 'high' | 'medium' | 'low';
  execute: () => Promise<TestResult>;
}

interface TestResult {
  passed: boolean;
  message: string;
  duration: number;
  evidence?: any;
  errors?: string[];
}

interface ContractTestSuite {
  name: string;
  tests: TestCase[];
}

// Mock test data
const MOCK_TEST_DATA = {
  validBookId: '123e4567-e89b-12d3-a456-426614174000',
  invalidBookId: '456e7890-e12c-45d6-d789-234567890123',
  otherUserBookId: '789e0123-e45f-67g8-h901-345678901234',
  validUserId: 'user123-valid-user-id-456789',
  otherUserId: 'user456-other-user-id-789012',
  validToken: 'mock-valid-token-12345',
  invalidToken: 'mock-invalid-token-67890',
  expiredToken: 'mock-expired-token-abcde'
};

// Test configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const DIALOG_ENDPOINT = `${API_BASE_URL}/api/dialog/history`;

class DialogHistoryContractTester {
  private results: TestResult[] = [];

  // Helper to make API requests
  private async makeRequest(
    method: string,
    url: string,
    options: RequestInit = {}
  ): Promise<{ response: Response; duration: number }> {
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method,
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      const duration = Date.now() - startTime;
      return { response, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      throw new Error(`Request failed after ${duration}ms: ${error.message}`);
    }
  }

  // GET endpoint contract tests
  private getEndpointTests(): TestCase[] {
    return [
      {
        name: 'GET-001',
        description: 'Valid request returns 200 with messages array and pagination',
        category: 'contract',
        priority: 'critical',
        execute: async (): Promise<TestResult> => {
          const url = `${DIALOG_ENDPOINT}?bookId=${MOCK_TEST_DATA.validBookId}&limit=5`;
          const { response, duration } = await this.makeRequest('GET', url, {
            headers: {
              'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}`
            }
          });

          const body = await response.json();

          const validContract = (
            response.status === 200 &&
            Array.isArray(body.messages) &&
            body.pagination &&
            typeof body.pagination.hasMore === 'boolean'
          );

          return {
            passed: validContract,
            message: validContract
              ? 'Valid request contract fulfilled'
              : `Contract violation: status=${response.status}, hasMessages=${Array.isArray(body.messages)}, hasPagination=${!!body.pagination}`,
            duration,
            evidence: {
              status: response.status,
              responseStructure: {
                hasMessages: Array.isArray(body.messages),
                messagesCount: body.messages?.length,
                hasPagination: !!body.pagination,
                paginationKeys: body.pagination ? Object.keys(body.pagination) : []
              }
            }
          };
        }
      },

      {
        name: 'GET-002',
        description: 'Pagination with cursor works correctly',
        category: 'contract',
        priority: 'high',
        execute: async (): Promise<TestResult> => {
          // First request to get initial data
          const url1 = `${DIALOG_ENDPOINT}?bookId=${MOCK_TEST_DATA.validBookId}&limit=2`;
          const { response: response1, duration: duration1 } = await this.makeRequest('GET', url1, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` }
          });

          const body1 = await response1.json();

          if (!body1.pagination?.nextCursor) {
            return {
              passed: true,
              message: 'No pagination cursor available (no more data)',
              duration: duration1,
              evidence: { reason: 'empty_dataset' }
            };
          }

          // Second request with cursor
          const url2 = `${DIALOG_ENDPOINT}?bookId=${MOCK_TEST_DATA.validBookId}&limit=2&cursor=${body1.pagination.nextCursor}`;
          const { response: response2, duration: duration2 } = await this.makeRequest('GET', url2, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` }
          });

          const body2 = await response2.json();
          const totalDuration = duration1 + duration2;

          const validPagination = (
            response2.status === 200 &&
            Array.isArray(body2.messages) &&
            body2.pagination
          );

          return {
            passed: validPagination,
            message: validPagination
              ? 'Cursor-based pagination works correctly'
              : `Pagination failed: status=${response2.status}`,
            duration: totalDuration,
            evidence: {
              firstRequest: { status: response1.status, messageCount: body1.messages?.length },
              secondRequest: { status: response2.status, messageCount: body2.messages?.length },
              cursor: body1.pagination.nextCursor
            }
          };
        }
      },

      {
        name: 'GET-003',
        description: 'Intent filtering returns only matching messages',
        category: 'contract',
        priority: 'medium',
        execute: async (): Promise<TestResult> => {
          const url = `${DIALOG_ENDPOINT}?bookId=${MOCK_TEST_DATA.validBookId}&intent=enhance`;
          const { response, duration } = await this.makeRequest('GET', url, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` }
          });

          const body = await response.json();

          const validFiltering = (
            response.status === 200 &&
            Array.isArray(body.messages) &&
            body.messages.every((msg: any) => !msg.intent || msg.intent === 'enhance')
          );

          return {
            passed: validFiltering,
            message: validFiltering
              ? 'Intent filtering works correctly'
              : `Filtering failed: status=${response.status}, invalidMessages=${body.messages?.filter((m: any) => m.intent && m.intent !== 'enhance').length}`,
            duration,
            evidence: {
              status: response.status,
              messageCount: body.messages?.length,
              intents: body.messages?.map((m: any) => m.intent).filter(Boolean)
            }
          };
        }
      },

      {
        name: 'GET-004',
        description: 'Role filtering returns only matching messages',
        category: 'contract',
        priority: 'medium',
        execute: async (): Promise<TestResult> => {
          const url = `${DIALOG_ENDPOINT}?bookId=${MOCK_TEST_DATA.validBookId}&role=assistant`;
          const { response, duration } = await this.makeRequest('GET', url, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` }
          });

          const body = await response.json();

          const validFiltering = (
            response.status === 200 &&
            Array.isArray(body.messages) &&
            body.messages.every((msg: any) => msg.role === 'assistant')
          );

          return {
            passed: validFiltering,
            message: validFiltering
              ? 'Role filtering works correctly'
              : `Filtering failed: status=${response.status}, wrongRoles=${body.messages?.filter((m: any) => m.role !== 'assistant').length}`,
            duration,
            evidence: {
              status: response.status,
              messageCount: body.messages?.length,
              roles: body.messages?.map((m: any) => m.role)
            }
          };
        }
      },

      {
        name: 'GET-005',
        description: 'Missing bookId returns 400 Bad Request',
        category: 'contract',
        priority: 'critical',
        execute: async (): Promise<TestResult> => {
          const url = `${DIALOG_ENDPOINT}?limit=5`; // Missing bookId
          const { response, duration } = await this.makeRequest('GET', url, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` }
          });

          const body = await response.json();

          const validError = (
            response.status === 400 &&
            body.error &&
            body.error.message?.includes('bookId')
          );

          return {
            passed: validError,
            message: validError
              ? 'Missing bookId properly rejected'
              : `Expected 400 for missing bookId, got ${response.status}`,
            duration,
            evidence: {
              status: response.status,
              errorMessage: body.error?.message
            }
          };
        }
      },

      {
        name: 'GET-006',
        description: 'Invalid bookId format returns 400 Bad Request',
        category: 'contract',
        priority: 'high',
        execute: async (): Promise<TestResult> => {
          const url = `${DIALOG_ENDPOINT}?bookId=invalid-uuid-format`;
          const { response, duration } = await this.makeRequest('GET', url, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` }
          });

          const body = await response.json();

          const validError = (
            response.status === 400 &&
            body.error &&
            body.error.message?.includes('UUID')
          );

          return {
            passed: validError,
            message: validError
              ? 'Invalid bookId format properly rejected'
              : `Expected 400 for invalid UUID, got ${response.status}`,
            duration,
            evidence: {
              status: response.status,
              errorMessage: body.error?.message
            }
          };
        }
      },

      {
        name: 'GET-007',
        description: 'Invalid limit values return 400 Bad Request',
        category: 'contract',
        priority: 'medium',
        execute: async (): Promise<TestResult> => {
          const testCases = [
            { limit: '0', desc: 'zero' },
            { limit: '101', desc: 'too high' },
            { limit: '-1', desc: 'negative' },
            { limit: 'abc', desc: 'non-numeric' }
          ];

          for (const testCase of testCases) {
            const url = `${DIALOG_ENDPOINT}?bookId=${MOCK_TEST_DATA.validBookId}&limit=${testCase.limit}`;
            const { response, duration } = await this.makeRequest('GET', url, {
              headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` }
            });

            if (response.status !== 400) {
              return {
                passed: false,
                message: `Invalid limit (${testCase.desc}) should return 400, got ${response.status}`,
                duration,
                evidence: { testCase: testCase.limit, status: response.status }
              };
            }
          }

          return {
            passed: true,
            message: 'All invalid limit values properly rejected',
            duration: 100, // Estimated
            evidence: { testedCases: testCases.map(tc => tc.desc) }
          };
        }
      },

      {
        name: 'GET-008',
        description: 'Invalid intent values return 422 Unprocessable Entity',
        category: 'contract',
        priority: 'medium',
        execute: async (): Promise<TestResult> => {
          const url = `${DIALOG_ENDPOINT}?bookId=${MOCK_TEST_DATA.validBookId}&intent=invalid_intent`;
          const { response, duration } = await this.makeRequest('GET', url, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` }
          });

          const body = await response.json();

          const validError = (
            response.status === 422 &&
            body.error &&
            body.error.details?.errors?.some((e: any) => e.parameter === 'intent')
          );

          return {
            passed: validError,
            message: validError
              ? 'Invalid intent properly rejected'
              : `Expected 422 for invalid intent, got ${response.status}`,
            duration,
            evidence: {
              status: response.status,
              errorDetails: body.error?.details
            }
          };
        }
      },

      {
        name: 'GET-009',
        description: 'Invalid role values return 422 Unprocessable Entity',
        category: 'contract',
        priority: 'medium',
        execute: async (): Promise<TestResult> => {
          const url = `${DIALOG_ENDPOINT}?bookId=${MOCK_TEST_DATA.validBookId}&role=invalid_role`;
          const { response, duration } = await this.makeRequest('GET', url, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` }
          });

          const body = await response.json();

          const validError = (
            response.status === 422 &&
            body.error &&
            body.error.details?.errors?.some((e: any) => e.parameter === 'role')
          );

          return {
            passed: validError,
            message: validError
              ? 'Invalid role properly rejected'
              : `Expected 422 for invalid role, got ${response.status}`,
            duration,
            evidence: {
              status: response.status,
              errorDetails: body.error?.details
            }
          };
        }
      },

      {
        name: 'GET-010',
        description: 'Invalid cursor format returns 400 Bad Request',
        category: 'contract',
        priority: 'medium',
        execute: async (): Promise<TestResult> => {
          const url = `${DIALOG_ENDPOINT}?bookId=${MOCK_TEST_DATA.validBookId}&cursor=invalid-cursor-format`;
          const { response, duration } = await this.makeRequest('GET', url, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` }
          });

          const body = await response.json();

          const validError = (
            response.status === 400 &&
            body.error &&
            body.error.message?.includes('cursor')
          );

          return {
            passed: validError,
            message: validError
              ? 'Invalid cursor format properly rejected'
              : `Expected 400 for invalid cursor, got ${response.status}`,
            duration,
            evidence: {
              status: response.status,
              errorMessage: body.error?.message
            }
          };
        }
      }
    ];
  }

  // POST endpoint contract tests
  private postEndpointTests(): TestCase[] {
    return [
      {
        name: 'POST-001',
        description: 'Valid single message creation returns 201',
        category: 'contract',
        priority: 'critical',
        execute: async (): Promise<TestResult> => {
          const requestBody = {
            messages: [{
              bookId: MOCK_TEST_DATA.validBookId,
              role: 'user',
              content: 'What does this passage mean?',
              intent: 'explain',
              selection: {
                text: 'selected text',
                chapterId: MOCK_TEST_DATA.validBookId
              }
            }]
          };

          const { response, duration } = await this.makeRequest('POST', DIALOG_ENDPOINT, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` },
            body: JSON.stringify(requestBody)
          });

          const body = await response.json();

          const validCreation = (
            response.status === 201 &&
            Array.isArray(body.saved) &&
            body.saved.length === 1 &&
            body.count === 1 &&
            body.saved[0].id &&
            body.saved[0].createdAt
          );

          return {
            passed: validCreation,
            message: validCreation
              ? 'Single message creation successful'
              : `Creation failed: status=${response.status}, saved=${body.saved?.length}`,
            duration,
            evidence: {
              status: response.status,
              response: body,
              requestBody
            }
          };
        }
      },

      {
        name: 'POST-002',
        description: 'Valid batch message creation returns 201',
        category: 'contract',
        priority: 'high',
        execute: async (): Promise<TestResult> => {
          const requestBody = {
            messages: [
              {
                bookId: MOCK_TEST_DATA.validBookId,
                role: 'user',
                content: 'Question 1'
              },
              {
                bookId: MOCK_TEST_DATA.validBookId,
                role: 'assistant',
                content: 'Answer 1',
                metrics: { tokens: 50, cost: 0.001 }
              }
            ]
          };

          const { response, duration } = await this.makeRequest('POST', DIALOG_ENDPOINT, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` },
            body: JSON.stringify(requestBody)
          });

          const body = await response.json();

          const validCreation = (
            response.status === 201 &&
            Array.isArray(body.saved) &&
            body.saved.length === 2 &&
            body.count === 2
          );

          return {
            passed: validCreation,
            message: validCreation
              ? 'Batch message creation successful'
              : `Batch creation failed: status=${response.status}, saved=${body.saved?.length}`,
            duration,
            evidence: {
              status: response.status,
              response: body,
              requestBody
            }
          };
        }
      },

      {
        name: 'POST-003',
        description: 'T5 enhancement message with metadata storage',
        category: 'integration',
        priority: 'high',
        execute: async (): Promise<TestResult> => {
          const requestBody = {
            messages: [{
              bookId: MOCK_TEST_DATA.validBookId,
              role: 'assistant',
              content: 'Enhanced explanation with cultural context and historical background...',
              intent: 'enhance',
              selection: {
                text: 'Democracy in America',
                chapterId: MOCK_TEST_DATA.validBookId
              },
              metrics: { tokens: 200, cost: 0.004 }
            }]
          };

          const { response, duration } = await this.makeRequest('POST', DIALOG_ENDPOINT, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` },
            body: JSON.stringify(requestBody)
          });

          const body = await response.json();

          const validEnhancement = (
            response.status === 201 &&
            body.saved?.length === 1 &&
            body.saved[0].id
          );

          return {
            passed: validEnhancement,
            message: validEnhancement
              ? 'T5 enhancement data properly stored'
              : `Enhancement storage failed: status=${response.status}`,
            duration,
            evidence: {
              status: response.status,
              response: body,
              enhancementData: {
                intent: requestBody.messages[0].intent,
                hasMetrics: !!requestBody.messages[0].metrics,
                hasSelection: !!requestBody.messages[0].selection
              }
            }
          };
        }
      },

      {
        name: 'POST-004',
        description: 'Missing required fields return 400 Bad Request',
        category: 'contract',
        priority: 'critical',
        execute: async (): Promise<TestResult> => {
          const invalidBodies = [
            { messages: [{ bookId: MOCK_TEST_DATA.validBookId }] }, // Missing role and content
            { messages: [{ role: 'user', content: 'test' }] }, // Missing bookId
            { messages: [{ bookId: MOCK_TEST_DATA.validBookId, role: 'user' }] }, // Missing content
            {} // Missing messages array
          ];

          for (let i = 0; i < invalidBodies.length; i++) {
            const { response, duration } = await this.makeRequest('POST', DIALOG_ENDPOINT, {
              headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` },
              body: JSON.stringify(invalidBodies[i])
            });

            if (response.status !== 400) {
              return {
                passed: false,
                message: `Invalid body ${i + 1} should return 400, got ${response.status}`,
                duration,
                evidence: { invalidBody: invalidBodies[i], status: response.status }
              };
            }
          }

          return {
            passed: true,
            message: 'All invalid request bodies properly rejected',
            duration: 100, // Estimated
            evidence: { testedCases: invalidBodies.length }
          };
        }
      },

      {
        name: 'POST-005',
        description: 'Invalid role values return 422 Unprocessable Entity',
        category: 'contract',
        priority: 'high',
        execute: async (): Promise<TestResult> => {
          const requestBody = {
            messages: [{
              bookId: MOCK_TEST_DATA.validBookId,
              role: 'invalid_role',
              content: 'test message'
            }]
          };

          const { response, duration } = await this.makeRequest('POST', DIALOG_ENDPOINT, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` },
            body: JSON.stringify(requestBody)
          });

          const body = await response.json();

          const validError = (
            response.status === 422 &&
            body.error &&
            body.error.details?.errors?.some((e: any) => e.field === 'role')
          );

          return {
            passed: validError,
            message: validError
              ? 'Invalid role properly rejected'
              : `Expected 422 for invalid role, got ${response.status}`,
            duration,
            evidence: {
              status: response.status,
              errorDetails: body.error?.details
            }
          };
        }
      },

      {
        name: 'POST-006',
        description: 'Empty content returns 422 Unprocessable Entity',
        category: 'contract',
        priority: 'high',
        execute: async (): Promise<TestResult> => {
          const requestBody = {
            messages: [{
              bookId: MOCK_TEST_DATA.validBookId,
              role: 'user',
              content: ''
            }]
          };

          const { response, duration } = await this.makeRequest('POST', DIALOG_ENDPOINT, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` },
            body: JSON.stringify(requestBody)
          });

          const body = await response.json();

          const validError = (
            response.status === 422 &&
            body.error &&
            body.error.details?.errors?.some((e: any) => e.field === 'content')
          );

          return {
            passed: validError,
            message: validError
              ? 'Empty content properly rejected'
              : `Expected 422 for empty content, got ${response.status}`,
            duration,
            evidence: {
              status: response.status,
              errorDetails: body.error?.details
            }
          };
        }
      },

      {
        name: 'POST-007',
        description: 'Content too long returns 422 Unprocessable Entity',
        category: 'contract',
        priority: 'medium',
        execute: async (): Promise<TestResult> => {
          const longContent = 'a'.repeat(10001); // Over 10,000 character limit
          const requestBody = {
            messages: [{
              bookId: MOCK_TEST_DATA.validBookId,
              role: 'user',
              content: longContent
            }]
          };

          const { response, duration } = await this.makeRequest('POST', DIALOG_ENDPOINT, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` },
            body: JSON.stringify(requestBody)
          });

          const body = await response.json();

          const validError = (
            response.status === 422 &&
            body.error &&
            body.error.details?.errors?.some((e: any) => e.field === 'content')
          );

          return {
            passed: validError,
            message: validError
              ? 'Overlong content properly rejected'
              : `Expected 422 for long content, got ${response.status}`,
            duration,
            evidence: {
              status: response.status,
              contentLength: longContent.length,
              errorDetails: body.error?.details
            }
          };
        }
      },

      {
        name: 'POST-008',
        description: 'Too many messages returns 400 Bad Request',
        category: 'contract',
        priority: 'medium',
        execute: async (): Promise<TestResult> => {
          const messages = Array.from({ length: 11 }, (_, i) => ({
            bookId: MOCK_TEST_DATA.validBookId,
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${i + 1}`
          }));

          const requestBody = { messages };

          const { response, duration } = await this.makeRequest('POST', DIALOG_ENDPOINT, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` },
            body: JSON.stringify(requestBody)
          });

          const body = await response.json();

          const validError = (
            response.status === 400 &&
            body.error &&
            body.error.message?.includes('1-10')
          );

          return {
            passed: validError,
            message: validError
              ? 'Too many messages properly rejected'
              : `Expected 400 for 11 messages, got ${response.status}`,
            duration,
            evidence: {
              status: response.status,
              messageCount: messages.length,
              errorMessage: body.error?.message
            }
          };
        }
      },

      {
        name: 'POST-009',
        description: 'Invalid UUID format in bookId returns 422',
        category: 'contract',
        priority: 'high',
        execute: async (): Promise<TestResult> => {
          const requestBody = {
            messages: [{
              bookId: 'invalid-uuid-format',
              role: 'user',
              content: 'test message'
            }]
          };

          const { response, duration } = await this.makeRequest('POST', DIALOG_ENDPOINT, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` },
            body: JSON.stringify(requestBody)
          });

          const body = await response.json();

          const validError = (
            response.status === 422 &&
            body.error &&
            body.error.details?.errors?.some((e: any) => e.field === 'bookId')
          );

          return {
            passed: validError,
            message: validError
              ? 'Invalid UUID format properly rejected'
              : `Expected 422 for invalid UUID, got ${response.status}`,
            duration,
            evidence: {
              status: response.status,
              errorDetails: body.error?.details
            }
          };
        }
      },

      {
        name: 'POST-010',
        description: 'Invalid JSON body returns 400 Bad Request',
        category: 'contract',
        priority: 'medium',
        execute: async (): Promise<TestResult> => {
          const { response, duration } = await this.makeRequest('POST', DIALOG_ENDPOINT, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` },
            body: '{ invalid json content'
          });

          const body = await response.json();

          const validError = (
            response.status === 400 &&
            body.error &&
            body.error.message?.includes('JSON')
          );

          return {
            passed: validError,
            message: validError
              ? 'Invalid JSON properly rejected'
              : `Expected 400 for invalid JSON, got ${response.status}`,
            duration,
            evidence: {
              status: response.status,
              errorMessage: body.error?.message
            }
          };
        }
      }
    ];
  }

  // Security and authentication tests
  private securityTests(): TestCase[] {
    return [
      {
        name: 'SEC-001',
        description: 'Missing authentication returns 401 Unauthorized',
        category: 'security',
        priority: 'critical',
        execute: async (): Promise<TestResult> => {
          const url = `${DIALOG_ENDPOINT}?bookId=${MOCK_TEST_DATA.validBookId}`;
          const { response, duration } = await this.makeRequest('GET', url);

          const validAuth = response.status === 401;

          return {
            passed: validAuth,
            message: validAuth
              ? 'Missing authentication properly rejected'
              : `Expected 401 for missing auth, got ${response.status}`,
            duration,
            evidence: {
              status: response.status,
              headers: Object.fromEntries(response.headers.entries())
            }
          };
        }
      },

      {
        name: 'SEC-002',
        description: 'Invalid token returns 401 Unauthorized',
        category: 'security',
        priority: 'critical',
        execute: async (): Promise<TestResult> => {
          const url = `${DIALOG_ENDPOINT}?bookId=${MOCK_TEST_DATA.validBookId}`;
          const { response, duration } = await this.makeRequest('GET', url, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.invalidToken}` }
          });

          const validAuth = response.status === 401;

          return {
            passed: validAuth,
            message: validAuth
              ? 'Invalid token properly rejected'
              : `Expected 401 for invalid token, got ${response.status}`,
            duration,
            evidence: {
              status: response.status,
              tokenUsed: MOCK_TEST_DATA.invalidToken.substring(0, 10) + '...'
            }
          };
        }
      },

      {
        name: 'SEC-003',
        description: 'Cross-user book access returns 403 Forbidden',
        category: 'security',
        priority: 'critical',
        execute: async (): Promise<TestResult> => {
          const url = `${DIALOG_ENDPOINT}?bookId=${MOCK_TEST_DATA.otherUserBookId}`;
          const { response, duration } = await this.makeRequest('GET', url, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` }
          });

          const body = await response.json();

          const validAccess = (
            response.status === 403 &&
            body.error &&
            body.error.details?.reason === 'not_owner'
          );

          return {
            passed: validAccess,
            message: validAccess
              ? 'Cross-user access properly blocked'
              : `Expected 403 for cross-user access, got ${response.status}`,
            duration,
            evidence: {
              status: response.status,
              errorDetails: body.error?.details,
              bookIdAttempted: MOCK_TEST_DATA.otherUserBookId
            }
          };
        }
      },

      {
        name: 'SEC-004',
        description: 'Rate limiting enforced after multiple requests',
        category: 'security',
        priority: 'high',
        execute: async (): Promise<TestResult> => {
          const url = `${DIALOG_ENDPOINT}?bookId=${MOCK_TEST_DATA.validBookId}`;
          const requests = [];

          // Make multiple rapid requests
          for (let i = 0; i < 6; i++) {
            requests.push(
              this.makeRequest('GET', url, {
                headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` }
              })
            );
          }

          const responses = await Promise.all(requests);
          const rateLimited = responses.some(({ response }) => response.status === 429);
          const totalDuration = responses.reduce((sum, { duration }) => sum + duration, 0);

          return {
            passed: rateLimited,
            message: rateLimited
              ? 'Rate limiting properly enforced'
              : 'Rate limiting not triggered (may need more requests)',
            duration: totalDuration,
            evidence: {
              requestCount: requests.length,
              statusCodes: responses.map(({ response }) => response.status),
              rateLimitedCount: responses.filter(({ response }) => response.status === 429).length
            }
          };
        }
      },

      {
        name: 'SEC-005',
        description: 'SQL injection attempts safely handled',
        category: 'security',
        priority: 'high',
        execute: async (): Promise<TestResult> => {
          const maliciousInputs = [
            "'; DROP TABLE dialog_messages; --",
            "' OR '1'='1",
            "'; UPDATE dialog_messages SET content='hacked'; --",
            "<script>alert('xss')</script>"
          ];

          for (const maliciousInput of maliciousInputs) {
            const requestBody = {
              messages: [{
                bookId: MOCK_TEST_DATA.validBookId,
                role: 'user',
                content: maliciousInput
              }]
            };

            const { response, duration } = await this.makeRequest('POST', DIALOG_ENDPOINT, {
              headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` },
              body: JSON.stringify(requestBody)
            });

            // Should either reject malicious input or safely store it
            if (response.status === 500) {
              return {
                passed: false,
                message: `SQL injection vulnerability detected with input: ${maliciousInput}`,
                duration,
                evidence: { maliciousInput, status: response.status }
              };
            }
          }

          return {
            passed: true,
            message: 'SQL injection attempts safely handled',
            duration: 100, // Estimated
            evidence: { testedInputs: maliciousInputs.length }
          };
        }
      }
    ];
  }

  // Performance tests
  private performanceTests(): TestCase[] {
    return [
      {
        name: 'PERF-001',
        description: 'Pagination performance with large datasets',
        category: 'performance',
        priority: 'medium',
        execute: async (): Promise<TestResult> => {
          const url = `${DIALOG_ENDPOINT}?bookId=${MOCK_TEST_DATA.validBookId}&limit=50`;
          const { response, duration } = await this.makeRequest('GET', url, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` }
          });

          const performanceTarget = 200; // 200ms target
          const performanceAcceptable = duration < performanceTarget;

          return {
            passed: performanceAcceptable,
            message: performanceAcceptable
              ? `Pagination performed well (${duration}ms < ${performanceTarget}ms)`
              : `Pagination too slow (${duration}ms > ${performanceTarget}ms)`,
            duration,
            evidence: {
              status: response.status,
              responseTime: duration,
              target: performanceTarget,
              requestSize: 50
            }
          };
        }
      },

      {
        name: 'PERF-002',
        description: 'Response size validation for large requests',
        category: 'performance',
        priority: 'low',
        execute: async (): Promise<TestResult> => {
          const url = `${DIALOG_ENDPOINT}?bookId=${MOCK_TEST_DATA.validBookId}&limit=100`;
          const { response, duration } = await this.makeRequest('GET', url, {
            headers: { 'Authorization': `Bearer ${MOCK_TEST_DATA.validToken}` }
          });

          const body = await response.json();
          const responseSize = JSON.stringify(body).length;
          const sizeLimit = 1024 * 1024; // 1MB limit

          const sizeAcceptable = responseSize < sizeLimit;

          return {
            passed: sizeAcceptable,
            message: sizeAcceptable
              ? `Response size acceptable (${Math.round(responseSize / 1024)}KB)`
              : `Response too large (${Math.round(responseSize / 1024)}KB)`,
            duration,
            evidence: {
              responseSize,
              sizeLimit,
              messageCoun: body.messages?.length
            }
          };
        }
      }
    ];
  }

  // Run all test suites
  public async runContractTests(): Promise<{
    summary: any;
    detailed: any;
    recommendation: 'GO' | 'NO-GO';
  }> {
    console.log('\n🧪 Dialog History API Contract Tests');
    console.log('='.repeat(80));

    const testSuites: ContractTestSuite[] = [
      { name: 'GET Endpoint Contract Tests', tests: this.getEndpointTests() },
      { name: 'POST Endpoint Contract Tests', tests: this.postEndpointTests() },
      { name: 'Security & Authentication Tests', tests: this.securityTests() },
      { name: 'Performance Tests', tests: this.performanceTests() }
    ];

    const results: any = {
      suites: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      criticalFailures: 0,
      duration: 0
    };

    const startTime = Date.now();

    for (const suite of testSuites) {
      console.log(`\n📋 ${suite.name}`);
      console.log('-'.repeat(40));

      const suiteResults = {
        name: suite.name,
        tests: [],
        passed: 0,
        failed: 0,
        duration: 0
      };

      for (const test of suite.tests) {
        const testStartTime = Date.now();

        try {
          const result = await test.execute();
          const testDuration = Date.now() - testStartTime;

          suiteResults.tests.push({
            ...test,
            result,
            duration: testDuration
          });

          if (result.passed) {
            suiteResults.passed++;
            results.passedTests++;
            console.log(`  ✅ ${test.name}: ${result.message} (${result.duration}ms)`);
          } else {
            suiteResults.failed++;
            results.failedTests++;
            if (test.priority === 'critical') {
              results.criticalFailures++;
            }
            console.log(`  ❌ ${test.name}: ${result.message} (${result.duration}ms)`);
          }

          suiteResults.duration += testDuration;

        } catch (error) {
          console.log(`  💥 ${test.name}: Test execution failed - ${error.message}`);
          suiteResults.failed++;
          results.failedTests++;
          if (test.priority === 'critical') {
            results.criticalFailures++;
          }
        }

        results.totalTests++;
      }

      results.suites.push(suiteResults);
      results.duration += suiteResults.duration;
    }

    const endTime = Date.now();
    results.totalDuration = endTime - startTime;

    // Generate summary
    const passRate = (results.passedTests / results.totalTests * 100).toFixed(1);
    const recommendation = results.criticalFailures === 0 && results.passedTests >= results.totalTests * 0.8 ? 'GO' : 'NO-GO';

    const summary = {
      totalTests: results.totalTests,
      passed: results.passedTests,
      failed: results.failedTests,
      passRate: `${passRate}%`,
      criticalFailures: results.criticalFailures,
      duration: `${results.totalDuration}ms`,
      recommendation
    };

    console.log('\n' + '='.repeat(80));
    console.log('📊 CONTRACT TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${summary.totalTests}`);
    console.log(`Passed: ${summary.passed} (${summary.passRate})`);
    console.log(`Failed: ${summary.failed}`);
    console.log(`Critical Failures: ${summary.criticalFailures}`);
    console.log(`Duration: ${summary.duration}`);
    console.log(`\nRecommendation: ${recommendation}`);

    if (recommendation === 'GO') {
      console.log('✅ All critical tests passed. API ready for production.');
    } else {
      console.log('❌ Critical failures detected. Review required before deployment.');
    }

    return {
      summary,
      detailed: results,
      recommendation
    };
  }
}

// Export for use in test runners
export { DialogHistoryContractTester };

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new DialogHistoryContractTester();
  tester.runContractTests()
    .then(result => {
      process.exit(result.recommendation === 'GO' ? 0 : 1);
    })
    .catch(error => {
      console.error('Contract test execution failed:', error);
      process.exit(1);
    });
}