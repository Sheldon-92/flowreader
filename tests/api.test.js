const { test, expect } = require('@playwright/test');

// Simple API endpoint tests
test.describe('FlowReader API Tests', () => {
  const API_BASE = 'http://localhost:3001/api';
  const TEST_TOKEN = 'Bearer test-token-123';

  test('health endpoint returns ok', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('services');
  });

  test('signed-url endpoint requires auth', async ({ request }) => {
    const response = await request.post(`${API_BASE}/upload/signed-url`, {
      data: { fileName: 'test.epub', fileSize: 1000 }
    });
    expect(response.status()).toBe(401);
  });

  test('signed-url endpoint validates file type', async ({ request }) => {
    const response = await request.post(`${API_BASE}/upload/signed-url`, {
      headers: { 'Authorization': TEST_TOKEN },
      data: { fileName: 'test.pdf', fileSize: 1000 }
    });
    expect(response.status()).toBe(400);
    
    const data = await response.json();
    expect(data.error).toContain('EPUB');
  });

  test('task status endpoint requires task ID', async ({ request }) => {
    const response = await request.get(`${API_BASE}/tasks/status`);
    expect(response.status()).toBe(400);
  });

  test('position update requires auth', async ({ request }) => {
    const response = await request.post(`${API_BASE}/position/update`, {
      data: {
        bookId: 'test-book-id',
        chapterIdx: 0,
        percentage: 50,
        userId: 'test-user-id'
      }
    });
    expect(response.status()).toBe(401);
  });
});
EOF < /dev/null