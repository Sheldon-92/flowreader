import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Configuration for tests
const API_BASE = process.env.API_BASE || 'http://localhost:3001/api';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test data generation helpers
const generateUUID = () => crypto.randomUUID();

const createTestUser = async () => {
  const email = `test-${Date.now()}@example.com`;
  const password = 'testPassword123!';

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error) throw error;
  return { user: data.user!, email, password };
};

const createTestBook = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from('books')
    .insert({
      id: generateUUID(),
      owner_id: userId,
      title: `Test Book ${Date.now()}`,
      file_path: '/test/book.epub',
      status: 'ready'
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
};

const createTestDialogMessages = async (userId: string, bookId: string, count: number) => {
  const messages = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      user_id: userId,
      book_id: bookId,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Test message ${i + 1}`,
      intent: i % 3 === 0 ? 'explain' : undefined,
      created_at: new Date(Date.now() - (count - i) * 1000).toISOString()
    });
  }

  const { data, error } = await supabaseAdmin
    .from('dialog_messages')
    .insert(messages)
    .select('id, created_at');

  if (error) throw error;
  return data;
};

const authenticateUser = async (email: string, password: string) => {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return data.session!.access_token;
};

const cleanupTestData = async (userId: string, bookId?: string) => {
  // Clean dialog messages
  await supabaseAdmin
    .from('dialog_messages')
    .delete()
    .eq('user_id', userId);

  // Clean books
  if (bookId) {
    await supabaseAdmin
      .from('books')
      .delete()
      .eq('id', bookId);
  }

  // Clean user
  await supabaseAdmin.auth.admin.deleteUser(userId);
};

test.describe('Dialog History API Contract Tests', () => {
  test.describe('GET /api/dialog/history', () => {
    test('AC-1: Returns paginated dialog history per contract', async ({ request }) => {
      // Setup test data
      const { user, email, password } = await createTestUser();
      const bookId = await createTestBook(user.id);
      await createTestDialogMessages(user.id, bookId, 5);
      const token = await authenticateUser(email, password);

      try {
        // Test successful retrieval
        const response = await request.get(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: {
            bookId,
            limit: '3'
          }
        });

        expect(response.ok()).toBeTruthy();
        expect(response.status()).toBe(200);

        const data = await response.json();

        // Validate response structure per contract
        expect(data).toHaveProperty('data');
        expect(data.data).toHaveProperty('messages');
        expect(data.data).toHaveProperty('pagination');
        expect(data).toHaveProperty('meta');

        // Validate messages structure
        expect(Array.isArray(data.data.messages)).toBeTruthy();
        expect(data.data.messages.length).toBeLessThanOrEqual(3);

        if (data.data.messages.length > 0) {
          const message = data.data.messages[0];
          expect(message).toHaveProperty('id');
          expect(message).toHaveProperty('userId', user.id);
          expect(message).toHaveProperty('bookId', bookId);
          expect(message).toHaveProperty('role');
          expect(message).toHaveProperty('content');
          expect(message).toHaveProperty('createdAt');
          expect(['user', 'assistant']).toContain(message.role);
        }

        // Validate pagination structure
        expect(data.data.pagination).toHaveProperty('hasMore');
        expect(typeof data.data.pagination.hasMore).toBe('boolean');

        if (data.data.pagination.hasMore) {
          expect(data.data.pagination).toHaveProperty('nextCursor');
          expect(typeof data.data.pagination.nextCursor).toBe('string');
        }

        if (data.data.pagination.totalEstimate !== undefined) {
          expect(typeof data.data.pagination.totalEstimate).toBe('number');
          expect(data.data.pagination.totalEstimate).toBeGreaterThanOrEqual(0);
        }

        // Validate meta structure
        expect(data.meta).toHaveProperty('timestamp');

      } finally {
        await cleanupTestData(user.id, bookId);
      }
    });

    test('AC-1: Cursor pagination works correctly', async ({ request }) => {
      const { user, email, password } = await createTestUser();
      const bookId = await createTestBook(user.id);
      await createTestDialogMessages(user.id, bookId, 10);
      const token = await authenticateUser(email, password);

      try {
        // First page
        const page1Response = await request.get(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: { bookId, limit: '3' }
        });

        expect(page1Response.ok()).toBeTruthy();
        const page1Data = await page1Response.json();

        expect(page1Data.data.messages.length).toBe(3);
        expect(page1Data.data.pagination.hasMore).toBe(true);
        expect(page1Data.data.pagination.nextCursor).toBeDefined();

        // Second page with cursor
        const page2Response = await request.get(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: {
            bookId,
            limit: '3',
            cursor: page1Data.data.pagination.nextCursor
          }
        });

        expect(page2Response.ok()).toBeTruthy();
        const page2Data = await page2Response.json();

        expect(page2Data.data.messages.length).toBe(3);
        expect(page2Data.data.pagination.hasMore).toBe(true);

        // Verify no overlap between pages
        const page1Ids = page1Data.data.messages.map((m: any) => m.id);
        const page2Ids = page2Data.data.messages.map((m: any) => m.id);
        const intersection = page1Ids.filter((id: string) => page2Ids.includes(id));
        expect(intersection.length).toBe(0);

        // Verify chronological order (newest first)
        const page1Timestamps = page1Data.data.messages.map((m: any) => new Date(m.createdAt).getTime());
        const page2Timestamps = page2Data.data.messages.map((m: any) => new Date(m.createdAt).getTime());

        for (let i = 0; i < page1Timestamps.length - 1; i++) {
          expect(page1Timestamps[i]).toBeGreaterThanOrEqual(page1Timestamps[i + 1]);
        }
        expect(Math.min(...page1Timestamps)).toBeGreaterThan(Math.max(...page2Timestamps));

      } finally {
        await cleanupTestData(user.id, bookId);
      }
    });

    test('AC-1: Filters by intent and role work correctly', async ({ request }) => {
      const { user, email, password } = await createTestUser();
      const bookId = await createTestBook(user.id);

      // Create messages with specific intents and roles
      await supabaseAdmin.from('dialog_messages').insert([
        { user_id: user.id, book_id: bookId, role: 'user', content: 'Explain this', intent: 'explain' },
        { user_id: user.id, book_id: bookId, role: 'assistant', content: 'Here is explanation', intent: 'explain' },
        { user_id: user.id, book_id: bookId, role: 'user', content: 'Translate this', intent: 'translate' },
        { user_id: user.id, book_id: bookId, role: 'assistant', content: 'Here is translation', intent: 'translate' }
      ]);

      const token = await authenticateUser(email, password);

      try {
        // Test intent filter
        const explainResponse = await request.get(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: { bookId, intent: 'explain' }
        });

        expect(explainResponse.ok()).toBeTruthy();
        const explainData = await explainResponse.json();

        expect(explainData.data.messages.length).toBe(2);
        explainData.data.messages.forEach((msg: any) => {
          expect(msg.intent).toBe('explain');
        });

        // Test role filter
        const userResponse = await request.get(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: { bookId, role: 'user' }
        });

        expect(userResponse.ok()).toBeTruthy();
        const userData = await userResponse.json();

        expect(userData.data.messages.length).toBe(2);
        userData.data.messages.forEach((msg: any) => {
          expect(msg.role).toBe('user');
        });

        // Test combined filters
        const combinedResponse = await request.get(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: { bookId, role: 'user', intent: 'translate' }
        });

        expect(combinedResponse.ok()).toBeTruthy();
        const combinedData = await combinedResponse.json();

        expect(combinedData.data.messages.length).toBe(1);
        expect(combinedData.data.messages[0].role).toBe('user');
        expect(combinedData.data.messages[0].intent).toBe('translate');

      } finally {
        await cleanupTestData(user.id, bookId);
      }
    });

    test('AC-2: Strict RLS - Returns 403 for cross-user access', async ({ request }) => {
      // Create two users and their books
      const { user: user1, email: email1, password: password1 } = await createTestUser();
      const { user: user2, email: email2, password: password2 } = await createTestUser();

      const book1Id = await createTestBook(user1.id);
      const book2Id = await createTestBook(user2.id);

      await createTestDialogMessages(user1.id, book1Id, 3);
      await createTestDialogMessages(user2.id, book2Id, 3);

      const token1 = await authenticateUser(email1, password1);
      const token2 = await authenticateUser(email2, password2);

      try {
        // User1 trying to access User2's dialog history
        const response = await request.get(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token1}` },
          params: { bookId: book2Id }
        });

        expect(response.status()).toBe(403);

        const errorData = await response.json();
        expect(errorData.error).toHaveProperty('code', 'FORBIDDEN');
        expect(errorData.error).toHaveProperty('message', 'Access denied to book or dialog history');
        expect(errorData.error.details).toHaveProperty('bookId', book2Id);
        expect(errorData.error.details).toHaveProperty('reason', 'not_owner');

        // Verify own book access still works
        const ownResponse = await request.get(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token1}` },
          params: { bookId: book1Id }
        });

        expect(ownResponse.ok()).toBeTruthy();

      } finally {
        await cleanupTestData(user1.id, book1Id);
        await cleanupTestData(user2.id, book2Id);
      }
    });

    test('Returns 400 for missing bookId', async ({ request }) => {
      const { user, email, password } = await createTestUser();
      const token = await authenticateUser(email, password);

      try {
        const response = await request.get(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        expect(response.status()).toBe(400);
        const errorData = await response.json();
        expect(errorData.error.message).toContain('Missing required parameter: bookId');

      } finally {
        await cleanupTestData(user.id);
      }
    });

    test('Returns 400 for invalid bookId format', async ({ request }) => {
      const { user, email, password } = await createTestUser();
      const token = await authenticateUser(email, password);

      try {
        const response = await request.get(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: { bookId: 'invalid-uuid' }
        });

        expect(response.status()).toBe(400);
        const errorData = await response.json();
        expect(errorData.error.message).toContain('Invalid bookId format');

      } finally {
        await cleanupTestData(user.id);
      }
    });

    test('Returns 422 for invalid parameters', async ({ request }) => {
      const { user, email, password } = await createTestUser();
      const bookId = await createTestBook(user.id);
      const token = await authenticateUser(email, password);

      try {
        // Invalid intent
        const intentResponse = await request.get(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: { bookId, intent: 'invalid_intent' }
        });

        expect(intentResponse.status()).toBe(422);
        const intentError = await intentResponse.json();
        expect(intentError.error.code).toBe('VALIDATION_ERROR');
        expect(intentError.error.details.errors[0].parameter).toBe('intent');

        // Invalid role
        const roleResponse = await request.get(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: { bookId, role: 'invalid_role' }
        });

        expect(roleResponse.status()).toBe(422);
        const roleError = await roleResponse.json();
        expect(roleError.error.code).toBe('VALIDATION_ERROR');
        expect(roleError.error.details.errors[0].parameter).toBe('role');

        // Invalid limit
        const limitResponse = await request.get(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: { bookId, limit: '150' }
        });

        expect(limitResponse.status()).toBe(400);

      } finally {
        await cleanupTestData(user.id, bookId);
      }
    });

    test('Returns 401 for missing authentication', async ({ request }) => {
      const response = await request.get(`${API_BASE}/dialog/history`, {
        params: { bookId: generateUUID() }
      });

      expect(response.status()).toBe(401);
    });
  });

  test.describe('POST /api/dialog/history', () => {
    test('AC-1: Saves dialog messages per contract', async ({ request }) => {
      const { user, email, password } = await createTestUser();
      const bookId = await createTestBook(user.id);
      const token = await authenticateUser(email, password);

      try {
        const messages = [
          {
            bookId,
            role: 'user',
            content: 'Can you translate this sentence?',
            intent: 'translate',
            selection: {
              text: 'Hello world',
              start: 0,
              end: 11,
              chapterId: generateUUID()
            },
            targetLang: 'es'
          },
          {
            bookId,
            role: 'assistant',
            content: 'Hola mundo',
            intent: 'translate',
            metrics: {
              tokens: 15,
              cost: 0.0003
            }
          }
        ];

        const response = await request.post(`${API_BASE}/dialog/history`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          data: { messages }
        });

        expect(response.status()).toBe(201);

        const responseData = await response.json();

        // Validate response structure per contract
        expect(responseData).toHaveProperty('data');
        expect(responseData.data).toHaveProperty('saved');
        expect(responseData.data).toHaveProperty('count', 2);
        expect(responseData).toHaveProperty('meta');

        expect(Array.isArray(responseData.data.saved)).toBeTruthy();
        expect(responseData.data.saved.length).toBe(2);

        responseData.data.saved.forEach((saved: any) => {
          expect(saved).toHaveProperty('id');
          expect(saved).toHaveProperty('createdAt');
          expect(typeof saved.id).toBe('string');
          expect(typeof saved.createdAt).toBe('string');
        });

        // Verify messages were actually saved by retrieving them
        const getResponse = await request.get(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: { bookId }
        });

        expect(getResponse.ok()).toBeTruthy();
        const getData = await getResponse.json();

        expect(getData.data.messages.length).toBeGreaterThanOrEqual(2);

        // Verify message content and structure
        const savedUserMessage = getData.data.messages.find((m: any) => m.role === 'user');
        const savedAssistantMessage = getData.data.messages.find((m: any) => m.role === 'assistant');

        expect(savedUserMessage).toBeDefined();
        expect(savedUserMessage.content).toBe('Can you translate this sentence?');
        expect(savedUserMessage.intent).toBe('translate');
        expect(savedUserMessage.selection.text).toBe('Hello world');
        expect(savedUserMessage.targetLang).toBe('es');

        expect(savedAssistantMessage).toBeDefined();
        expect(savedAssistantMessage.content).toBe('Hola mundo');
        expect(savedAssistantMessage.metrics.tokens).toBe(15);
        expect(savedAssistantMessage.metrics.cost).toBe(0.0003);

      } finally {
        await cleanupTestData(user.id, bookId);
      }
    });

    test('AC-2: Strict RLS - Returns validation error for cross-user book access', async ({ request }) => {
      const { user: user1, email: email1, password: password1 } = await createTestUser();
      const { user: user2 } = await createTestUser();

      const book2Id = await createTestBook(user2.id);
      const token1 = await authenticateUser(email1, password1);

      try {
        const messages = [
          {
            bookId: book2Id,
            role: 'user',
            content: 'Test message'
          }
        ];

        const response = await request.post(`${API_BASE}/dialog/history`, {
          headers: {
            'Authorization': `Bearer ${token1}`,
            'Content-Type': 'application/json'
          },
          data: { messages }
        });

        expect(response.status()).toBe(422);

        const errorData = await response.json();
        expect(errorData.error.code).toBe('VALIDATION_ERROR');
        expect(errorData.error.details.errors[0].field).toBe('bookId');
        expect(errorData.error.details.errors[0].message).toBe('Book not found or access denied');

      } finally {
        await cleanupTestData(user1.id);
        await cleanupTestData(user2.id, book2Id);
      }
    });

    test('Returns 400 for invalid request body', async ({ request }) => {
      const { user, email, password } = await createTestUser();
      const token = await authenticateUser(email, password);

      try {
        // Empty body
        const response1 = await request.post(`${API_BASE}/dialog/history`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          data: {}
        });

        expect(response1.status()).toBe(400);

        // Non-array messages
        const response2 = await request.post(`${API_BASE}/dialog/history`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          data: { messages: 'not an array' }
        });

        expect(response2.status()).toBe(400);

        // Empty array
        const response3 = await request.post(`${API_BASE}/dialog/history`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          data: { messages: [] }
        });

        expect(response3.status()).toBe(400);

      } finally {
        await cleanupTestData(user.id);
      }
    });

    test('Returns 422 for message validation errors', async ({ request }) => {
      const { user, email, password } = await createTestUser();
      const bookId = await createTestBook(user.id);
      const token = await authenticateUser(email, password);

      try {
        const invalidMessages = [
          {
            bookId,
            role: 'invalid_role',
            content: ''
          },
          {
            bookId,
            role: 'user',
            content: 'A'.repeat(10001), // Too long
            intent: 'invalid_intent'
          }
        ];

        const response = await request.post(`${API_BASE}/dialog/history`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          data: { messages: invalidMessages }
        });

        expect(response.status()).toBe(422);

        const errorData = await response.json();
        expect(errorData.error.code).toBe('VALIDATION_ERROR');
        expect(errorData.error.details.errors.length).toBeGreaterThan(0);

        // Check that validation errors are properly structured
        const errors = errorData.error.details.errors;
        expect(errors.some((e: any) => e.field === 'role' && e.messageIndex === 0)).toBeTruthy();
        expect(errors.some((e: any) => e.field === 'content' && e.messageIndex === 0)).toBeTruthy();
        expect(errors.some((e: any) => e.field === 'content' && e.messageIndex === 1)).toBeTruthy();
        expect(errors.some((e: any) => e.field === 'intent' && e.messageIndex === 1)).toBeTruthy();

      } finally {
        await cleanupTestData(user.id, bookId);
      }
    });

    test('Validates selection and metrics fields', async ({ request }) => {
      const { user, email, password } = await createTestUser();
      const bookId = await createTestBook(user.id);
      const token = await authenticateUser(email, password);

      try {
        const messagesWithInvalidFields = [
          {
            bookId,
            role: 'user',
            content: 'Test message',
            selection: {
              text: 'A'.repeat(1001), // Too long
              chapterId: 'invalid-uuid'
            },
            targetLang: 'invalid-lang-format',
            metrics: {
              tokens: -5, // Negative
              cost: 'not a number'
            }
          }
        ];

        const response = await request.post(`${API_BASE}/dialog/history`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          data: { messages: messagesWithInvalidFields }
        });

        expect(response.status()).toBe(422);

        const errorData = await response.json();
        const errors = errorData.error.details.errors;

        expect(errors.some((e: any) => e.field === 'selection.text')).toBeTruthy();
        expect(errors.some((e: any) => e.field === 'selection.chapterId')).toBeTruthy();
        expect(errors.some((e: any) => e.field === 'targetLang')).toBeTruthy();
        expect(errors.some((e: any) => e.field === 'metrics.tokens')).toBeTruthy();
        expect(errors.some((e: any) => e.field === 'metrics.cost')).toBeTruthy();

      } finally {
        await cleanupTestData(user.id, bookId);
      }
    });

    test('Returns 401 for missing authentication', async ({ request }) => {
      const response = await request.post(`${API_BASE}/dialog/history`, {
        headers: { 'Content-Type': 'application/json' },
        data: { messages: [{ bookId: generateUUID(), role: 'user', content: 'test' }] }
      });

      expect(response.status()).toBe(401);
    });
  });

  test.describe('Method Not Allowed', () => {
    test('Returns 405 for unsupported methods', async ({ request }) => {
      const { user, email, password } = await createTestUser();
      const token = await authenticateUser(email, password);

      try {
        const response = await request.patch(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        expect(response.status()).toBe(405);

      } finally {
        await cleanupTestData(user.id);
      }
    });
  });

  test.describe('T99 Compatibility Regression Tests', () => {
    test('Maintains backward compatibility with existing chat stream integration', async ({ request }) => {
      // This test ensures that the dialog history API doesn't break existing functionality
      // by testing the integration points mentioned in the API contract

      const { user, email, password } = await createTestUser();
      const bookId = await createTestBook(user.id);
      const token = await authenticateUser(email, password);

      try {
        // Simulate the flow described in the API contract
        // where chat stream saves messages to dialog history
        const dialogMessages = [
          {
            bookId,
            role: 'user',
            content: 'Explain this passage about quantum mechanics',
            intent: 'explain',
            selection: {
              text: 'The quantum state of a particle...',
              start: 1250,
              end: 1380,
              chapterId: generateUUID()
            }
          },
          {
            bookId,
            role: 'assistant',
            content: 'This passage introduces the fundamental concept of quantum superposition...',
            intent: 'explain',
            metrics: {
              tokens: 156,
              cost: 0.00312
            }
          }
        ];

        // Save messages (simulating chat stream completion)
        const saveResponse = await request.post(`${API_BASE}/dialog/history`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          data: { messages: dialogMessages }
        });

        expect(saveResponse.status()).toBe(201);

        // Retrieve messages (for conversation context)
        const getResponse = await request.get(`${API_BASE}/dialog/history`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: { bookId, limit: '10' }
        });

        expect(getResponse.ok()).toBeTruthy();
        const data = await getResponse.json();

        // Verify the saved messages can be retrieved for context
        expect(data.data.messages.length).toBe(2);

        const userMsg = data.data.messages.find((m: any) => m.role === 'user');
        const assistantMsg = data.data.messages.find((m: any) => m.role === 'assistant');

        expect(userMsg.intent).toBe('explain');
        expect(userMsg.selection.text).toBe('The quantum state of a particle...');
        expect(assistantMsg.metrics.tokens).toBe(156);
        expect(assistantMsg.metrics.cost).toBe(0.00312);

      } finally {
        await cleanupTestData(user.id, bookId);
      }
    });
  });
});