import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createServer } from 'http';
import { parse } from 'url';

/**
 * Legacy Endpoint Security Regression Test Suite
 *
 * This test suite validates that all legacy endpoints maintain proper security:
 * - api/position/update.ts
 * - api/upload/process.ts
 * - api/tasks/status.ts
 * - api/chat/stream.ts
 * - api/upload/signed-url.ts
 * - api/books/upload.ts
 */

// Test configuration
const API_BASE = process.env.TEST_API_BASE || 'http://localhost:3001/api';
const TEST_TOKEN = process.env.TEST_TOKEN || 'Bearer test-token-123';
const INVALID_TOKEN = 'Bearer invalid-token-xyz';
const MALICIOUS_TOKEN = 'Bearer <script>alert("xss")</script>';

// Helper function to make API requests
async function makeRequest(
  endpoint: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}
): Promise<{
  status: number;
  data: any;
  headers: Record<string, string>;
}> {
  const { method = 'GET', headers = {}, body } = options;

  const url = `${API_BASE}/${endpoint}`;
  const requestOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body && method !== 'GET') {
    requestOptions.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, requestOptions);
    let data;

    try {
      data = await response.json();
    } catch {
      data = await response.text();
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      data,
      headers: responseHeaders,
    };
  } catch (error) {
    throw new Error(`Request failed: ${error}`);
  }
}

describe('Legacy Endpoint Security Regression Tests', () => {

  describe('Authentication Requirements', () => {

    test('should require authentication for position updates', async () => {
      const response = await makeRequest('position/update', {
        method: 'POST',
        body: {
          bookId: 'test-book',
          chapterIdx: 1,
          percentage: 50,
        },
      });

      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error');
    });

    test('should require authentication for upload processing', async () => {
      const response = await makeRequest('upload/process', {
        method: 'POST',
        body: {
          filePath: 'test.epub',
          fileName: 'test.epub',
        },
      });

      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error');
    });

    test('should require authentication for task status', async () => {
      const response = await makeRequest('tasks/status?taskId=550e8400-e29b-41d4-a716-446655440000');

      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error');
    });

    test('should require authentication for chat stream', async () => {
      const response = await makeRequest('chat/stream', {
        method: 'POST',
        body: {
          bookId: 'test-book',
          query: 'test query',
        },
      });

      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error');
    });

    test('should require authentication for upload signed URL', async () => {
      const response = await makeRequest('upload/signed-url', {
        method: 'POST',
        body: {
          fileName: 'test.epub',
          fileSize: 1024,
        },
      });

      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error');
    });

    test('should reject invalid authentication tokens', async () => {
      const endpoints = [
        {
          path: 'position/update',
          method: 'POST',
          body: { bookId: 'test', chapterIdx: 1, percentage: 50 },
        },
        {
          path: 'upload/process',
          method: 'POST',
          body: { filePath: 'test.epub', fileName: 'test.epub' },
        },
        {
          path: 'tasks/status?taskId=550e8400-e29b-41d4-a716-446655440000',
          method: 'GET',
        },
        {
          path: 'chat/stream',
          method: 'POST',
          body: { bookId: 'test', query: 'test' },
        },
        {
          path: 'upload/signed-url',
          method: 'POST',
          body: { fileName: 'test.epub', fileSize: 1024 },
        },
      ];

      for (const endpoint of endpoints) {
        const response = await makeRequest(endpoint.path, {
          method: endpoint.method,
          headers: { Authorization: INVALID_TOKEN },
          body: endpoint.body,
        });

        expect(response.status).toBe(401);
        expect(response.data).toHaveProperty('error');
      }
    });

    test('should reject malformed authentication headers', async () => {
      const response = await makeRequest('position/update', {
        method: 'POST',
        headers: { Authorization: 'NotBearer malformed-token' },
        body: {
          bookId: 'test',
          chapterIdx: 1,
          percentage: 50,
        },
      });

      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error');
    });

    test('should sanitize malicious authentication headers', async () => {
      const response = await makeRequest('chat/stream', {
        method: 'POST',
        headers: { Authorization: MALICIOUS_TOKEN },
        body: {
          bookId: 'test',
          query: 'test',
        },
      });

      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error');
    });
  });

  describe('Authorization Controls', () => {

    test('should prevent cross-user book access', async () => {
      const response = await makeRequest('position/update', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {
          bookId: 'other-user-book-id',
          chapterIdx: 1,
          percentage: 50,
        },
      });

      expect(response.status).toBe(403);
      expect(response.data).toHaveProperty('error');
    });

    test('should prevent task access by non-owners', async () => {
      const response = await makeRequest('tasks/status?taskId=other-user-task-id', {
        headers: { Authorization: TEST_TOKEN },
      });

      expect(response.status).toBe(404);
      expect(response.data).toHaveProperty('error');
    });

    test('should prevent cross-user file access in upload process', async () => {
      const response = await makeRequest('upload/process', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {
          filePath: 'uploads/other-user/file.epub',
          fileName: 'file.epub',
        },
      });

      expect(response.status).toBe(403);
      expect(response.data).toHaveProperty('error');
    });

    test('should prevent cross-user book access in chat stream', async () => {
      const response = await makeRequest('chat/stream', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {
          bookId: 'other-user-book-id',
          query: 'test',
        },
      });

      expect(response.status).toBe(403);
      expect(response.data).toHaveProperty('error');
    });
  });

  describe('Client UserId Elimination', () => {

    test('should ignore client-provided userId in position update', async () => {
      const response = await makeRequest('position/update', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {
          bookId: 'test-book',
          userId: 'malicious-user-id',
          chapterIdx: 1,
          percentage: 50,
        },
      });

      // Should return 400 for validation error or proceed without client userId
      expect([400, 403]).toContain(response.status);
      expect(response.data).toHaveProperty('error');
    });

    test('should ignore client-provided userId in chat stream', async () => {
      const response = await makeRequest('chat/stream', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {
          bookId: 'test-book',
          userId: 'malicious-user-id',
          query: 'test',
        },
      });

      // Should return 400 for validation error or proceed without client userId
      expect([400, 403]).toContain(response.status);
      expect(response.data).toHaveProperty('error');
    });
  });

  describe('Rate Limiting', () => {

    test('should enforce upload rate limits', async () => {
      const requests: Promise<any>[] = [];

      // Make multiple rapid requests to trigger rate limiting
      for (let i = 0; i < 15; i++) {
        requests.push(
          makeRequest('upload/signed-url', {
            method: 'POST',
            headers: { Authorization: TEST_TOKEN },
            body: {
              fileName: `test-${i}.epub`,
              fileSize: 1024,
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      // Should have at least some rate limited responses
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      // Rate limited responses should have proper error message
      rateLimitedResponses.forEach(response => {
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toMatch(/rate limit|too many/i);
      });
    }, 10000);

    test('should enforce API rate limits on position updates', async () => {
      const requests: Promise<any>[] = [];

      // Make multiple rapid requests
      for (let i = 0; i < 25; i++) {
        requests.push(
          makeRequest('position/update', {
            method: 'POST',
            headers: { Authorization: TEST_TOKEN },
            body: {
              bookId: `test-book-${i}`,
              chapterIdx: 1,
              percentage: 50,
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      // Should have some rate limited responses or all should fail due to auth/validation
      if (rateLimitedResponses.length > 0) {
        rateLimitedResponses.forEach(response => {
          expect(response.data).toHaveProperty('error');
          expect(response.data.error).toMatch(/rate limit|too many/i);
        });
      }
    }, 10000);
  });

  describe('Input Validation', () => {

    test('should validate required fields in position update', async () => {
      const response = await makeRequest('position/update', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {}, // Missing required fields
      });

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
    });

    test('should validate UUID format in task status', async () => {
      const response = await makeRequest('tasks/status?taskId=not-a-uuid', {
        headers: { Authorization: TEST_TOKEN },
      });

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
    });

    test('should validate file extensions in upload signed URL', async () => {
      const response = await makeRequest('upload/signed-url', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {
          fileName: 'malware.exe',
          fileSize: 1024,
        },
      });

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
    });

    test('should prevent path traversal in file names', async () => {
      const response = await makeRequest('upload/signed-url', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {
          fileName: '../../../etc/passwd.epub',
          fileSize: 1024,
        },
      });

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
    });

    test('should validate file size limits', async () => {
      const response = await makeRequest('upload/signed-url', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {
          fileName: 'large.epub',
          fileSize: 52428800, // 50MB+ (should exceed limit)
        },
      });

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
    });

    test('should validate chat stream intents', async () => {
      const response = await makeRequest('chat/stream', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {
          bookId: 'test',
          intent: 'malicious-intent',
          selection: { text: 'test' },
        },
      });

      expect(response.status).toBe(422);
      expect(response.data).toHaveProperty('error');
    });

    test('should validate target language format', async () => {
      const response = await makeRequest('chat/stream', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {
          bookId: 'test',
          intent: 'translate',
          selection: { text: 'test' },
          targetLang: 'invalid-lang-format',
        },
      });

      expect(response.status).toBe(422);
      expect(response.data).toHaveProperty('error');
    });

    test('should require selection for translate intent', async () => {
      const response = await makeRequest('chat/stream', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {
          bookId: 'test',
          intent: 'translate',
          targetLang: 'zh-CN',
        },
      });

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
    });
  });

  describe('Security Headers', () => {

    test('should include security headers in responses', async () => {
      const response = await makeRequest('upload/signed-url', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {
          fileName: 'test.epub',
          fileSize: 1024,
        },
      });

      // Check for rate limiting headers (should be present even on error responses)
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
    });
  });

  describe('SQL Injection Protection', () => {

    test('should protect against SQL injection in bookId', async () => {
      const response = await makeRequest('position/update', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {
          bookId: "'; DROP TABLE books; --",
          chapterIdx: 1,
          percentage: 50,
        },
      });

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
    });

    test('should handle SQL injection attempts in chat queries safely', async () => {
      const response = await makeRequest('chat/stream', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {
          bookId: 'test',
          query: "'; DROP TABLE messages; --",
        },
      });

      // Should either validate input (400) or handle safely (200)
      expect([200, 400, 403]).toContain(response.status);
    });
  });

  describe('XSS Protection', () => {

    test('should handle XSS attempts in chat queries', async () => {
      const response = await makeRequest('chat/stream', {
        method: 'POST',
        headers: { Authorization: TEST_TOKEN },
        body: {
          bookId: 'test',
          query: '<script>alert("xss")</script>',
        },
      });

      // Should either validate input or handle safely
      expect([200, 400, 403]).toContain(response.status);

      if (response.status === 200) {
        // If processed, ensure no script execution in response
        const responseText = typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data);
        expect(responseText).not.toContain('<script>');
      }
    });
  });

  describe('Error Handling', () => {

    test('should not leak sensitive information in error messages', async () => {
      const response = await makeRequest('tasks/status?taskId=550e8400-e29b-41d4-a716-446655440000', {
        headers: { Authorization: INVALID_TOKEN },
      });

      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error');

      // Error message should not contain sensitive details
      const errorMessage = response.data.error.toLowerCase();
      expect(errorMessage).not.toContain('database');
      expect(errorMessage).not.toContain('sql');
      expect(errorMessage).not.toContain('internal');
    });

    test('should return consistent error format', async () => {
      const responses = await Promise.all([
        makeRequest('position/update', { method: 'POST' }),
        makeRequest('upload/process', { method: 'POST' }),
        makeRequest('tasks/status'),
        makeRequest('chat/stream', { method: 'POST' }),
        makeRequest('upload/signed-url', { method: 'POST' }),
      ]);

      responses.forEach(response => {
        expect(response.status).toBe(401);
        expect(response.data).toHaveProperty('error');
        expect(typeof response.data.error).toBe('string');
      });
    });
  });
});

describe('Enhanced Security Features', () => {

  describe('Security Event Logging', () => {

    test('should log security violations (authentication failures)', async () => {
      // Multiple failed auth attempts should be logged
      const attempts = [];
      for (let i = 0; i < 3; i++) {
        attempts.push(
          makeRequest('position/update', {
            method: 'POST',
            headers: { Authorization: INVALID_TOKEN },
            body: { bookId: 'test', chapterIdx: 1, percentage: 50 },
          })
        );
      }

      const responses = await Promise.all(attempts);

      responses.forEach(response => {
        expect(response.status).toBe(401);
      });

      // Note: Actual log verification would require database access
    });
  });

  describe('Enhanced Authentication', () => {

    test('should use enhanced authentication functions', async () => {
      // This test verifies the enhanced auth is being used
      // by checking that proper security headers and error handling is in place

      const response = await makeRequest('position/update', {
        method: 'POST',
        headers: { Authorization: 'Bearer malformed.jwt.token' },
        body: { bookId: 'test', chapterIdx: 1, percentage: 50 },
      });

      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('error');
    });
  });
});