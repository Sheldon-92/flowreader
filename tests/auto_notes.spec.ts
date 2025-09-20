import { test, expect } from '@playwright/test';
import type { AutoNoteRequest, AutoNoteResponse } from '@flowreader/shared';

// Test data setup
const TEST_USER = {
  email: 'test-auto-notes@example.com',
  password: 'test-password-123!'
};

const TEST_BOOK_ID = 'test-book-auto-notes-123';
const TEST_SELECTION = {
  text: 'This is a sample text selection for testing auto notes generation.',
  start: 100,
  end: 165,
  chapterId: 'chapter-1'
};

let authToken: string;
let bookId: string;

test.describe('Auto Notes MVP', () => {
  test.beforeAll(async ({ request }) => {
    // Setup: Create test user and book
    const loginResponse = await request.post('/api/auth/login', {
      data: TEST_USER
    });
    expect(loginResponse.ok()).toBeTruthy();

    const { access_token } = await loginResponse.json();
    authToken = access_token;

    // Create a test book for notes
    const bookResponse = await request.post('/api/books', {
      headers: { 'Authorization': `Bearer ${authToken}` },
      data: {
        title: 'Test Book for Auto Notes',
        author: 'Test Author',
        content: 'This is test book content for auto notes testing. ' + TEST_SELECTION.text
      }
    });

    if (bookResponse.ok()) {
      const book = await bookResponse.json();
      bookId = book.id;
    } else {
      bookId = TEST_BOOK_ID; // Fallback for existing book
    }
  });

  test.describe('Auto Note Generation API', () => {
    test('should create auto note with knowledge enhancement', async ({ request }) => {
      const noteRequest: AutoNoteRequest = {
        bookId,
        selection: TEST_SELECTION,
        intent: 'enhance',
        options: {
          includeMetrics: true
        }
      };

      const response = await request.post('/api/notes/auto', {
        headers: { 'Authorization': `Bearer ${authToken}` },
        data: noteRequest
      });

      expect(response.status()).toBe(201);

      const autoNote: AutoNoteResponse = await response.json();

      // Verify response structure
      expect(autoNote).toHaveProperty('id');
      expect(autoNote).toHaveProperty('content');
      expect(autoNote.source).toBe('auto');
      expect(autoNote.bookId).toBe(bookId);
      expect(autoNote.selection).toEqual(TEST_SELECTION);

      // Verify auto note metadata
      expect(autoNote.meta).toHaveProperty('generationMethod');
      expect(autoNote.meta).toHaveProperty('confidence');
      expect(autoNote.meta).toHaveProperty('type');
      expect(autoNote.meta).toHaveProperty('position');
      expect(autoNote.meta.confidence).toBeGreaterThan(0.6);

      // Verify enhanced fields
      expect(autoNote.meta.type).toBe('enhancement');
      expect(autoNote.meta.position).toEqual({
        chapterId: TEST_SELECTION.chapterId,
        start: TEST_SELECTION.start,
        end: TEST_SELECTION.end
      });

      // Verify metrics (if requested)
      expect(autoNote.metrics).toHaveProperty('tokens');
      expect(autoNote.metrics).toHaveProperty('processingTime');
    });

    test('should create auto note with context analysis', async ({ request }) => {
      const noteRequest: AutoNoteRequest = {
        bookId,
        selection: TEST_SELECTION,
        // No intent specified - should default to context analysis
        options: {
          includeMetrics: true
        }
      };

      const response = await request.post('/api/notes/auto', {
        headers: { 'Authorization': `Bearer ${authToken}` },
        data: noteRequest
      });

      expect(response.status()).toBe(201);

      const autoNote: AutoNoteResponse = await response.json();

      expect(autoNote.meta.generationMethod).toBe('context_analysis');
      expect(autoNote.meta.type).toBe('analysis');
      expect(autoNote.meta.confidence).toBeGreaterThanOrEqual(0.6);
    });

    test('should create auto note from dialog summary', async ({ request }) => {
      // First, create some dialog history
      await request.post('/api/chat/stream', {
        headers: { 'Authorization': `Bearer ${authToken}` },
        data: {
          book_id: bookId,
          message: 'What is the main theme of this book?',
          selection: TEST_SELECTION.text
        }
      });

      const noteRequest: AutoNoteRequest = {
        bookId,
        contextScope: 'recent_dialog',
        options: {
          includeMetrics: true
        }
      };

      const response = await request.post('/api/notes/auto', {
        headers: { 'Authorization': `Bearer ${authToken}` },
        data: noteRequest
      });

      expect(response.status()).toBe(201);

      const autoNote: AutoNoteResponse = await response.json();

      expect(autoNote.meta.generationMethod).toBe('dialog_summary');
      expect(autoNote.meta.type).toBe('summary');
      expect(autoNote.meta.contextScope).toBe('recent_dialog');
    });

    test('should reject requests with invalid book access', async ({ request }) => {
      const noteRequest: AutoNoteRequest = {
        bookId: 'invalid-book-id',
        selection: TEST_SELECTION,
        intent: 'enhance'
      };

      const response = await request.post('/api/notes/auto', {
        headers: { 'Authorization': `Bearer ${authToken}` },
        data: noteRequest
      });

      expect(response.status()).toBe(403);

      const error = await response.json();
      expect(error.error.code).toBe('FORBIDDEN');
    });

    test('should handle rate limiting', async ({ request }) => {
      // Make multiple rapid requests to trigger rate limiting
      const requests = Array.from({ length: 25 }, () =>
        request.post('/api/notes/auto', {
          headers: { 'Authorization': `Bearer ${authToken}` },
          data: {
            bookId,
            selection: TEST_SELECTION,
            intent: 'enhance'
          }
        })
      );

      const responses = await Promise.all(requests);

      // Should have at least one rate limited response
      const rateLimitedResponses = responses.filter(r => r.status() === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    test('should validate input parameters', async ({ request }) => {
      // Missing bookId
      const invalidRequest1 = await request.post('/api/notes/auto', {
        headers: { 'Authorization': `Bearer ${authToken}` },
        data: {
          selection: TEST_SELECTION
        }
      });
      expect(invalidRequest1.status()).toBe(422);

      // Invalid intent
      const invalidRequest2 = await request.post('/api/notes/auto', {
        headers: { 'Authorization': `Bearer ${authToken}` },
        data: {
          bookId,
          intent: 'invalid-intent'
        }
      });
      expect(invalidRequest2.status()).toBe(422);
    });
  });

  test.describe('Notes List API', () => {
    let createdNoteIds: string[] = [];

    test.beforeAll(async ({ request }) => {
      // Create multiple test notes
      const requests = [
        { intent: 'enhance', method: 'knowledge_enhancement' },
        { intent: 'explain', method: 'context_analysis' },
        { contextScope: 'recent_dialog', method: 'dialog_summary' }
      ];

      for (const req of requests) {
        const response = await request.post('/api/notes/auto', {
          headers: { 'Authorization': `Bearer ${authToken}` },
          data: {
            bookId,
            selection: req.method !== 'dialog_summary' ? TEST_SELECTION : undefined,
            intent: req.intent || undefined,
            contextScope: req.contextScope || undefined
          }
        });

        if (response.ok()) {
          const note = await response.json();
          createdNoteIds.push(note.id);
        }
      }
    });

    test('should list all notes', async ({ request }) => {
      const response = await request.get('/api/notes/list', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status()).toBe(200);

      const result = await response.json();
      expect(result).toHaveProperty('notes');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('hasMore');
      expect(result).toHaveProperty('pagination');

      expect(Array.isArray(result.notes)).toBeTruthy();
      expect(result.total).toBeGreaterThanOrEqual(createdNoteIds.length);
    });

    test('should filter notes by source', async ({ request }) => {
      const response = await request.get('/api/notes/list?source=auto', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status()).toBe(200);

      const result = await response.json();
      expect(result.notes.every((note: any) => note.source === 'auto')).toBeTruthy();
    });

    test('should filter notes by generation method', async ({ request }) => {
      const response = await request.get('/api/notes/list?source=auto&generationMethod=knowledge_enhancement', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status()).toBe(200);

      const result = await response.json();
      result.notes.forEach((note: any) => {
        expect(note.source).toBe('auto');
        expect(note.meta.generationMethod).toBe('knowledge_enhancement');
      });
    });

    test('should search notes by content', async ({ request }) => {
      const response = await request.get('/api/notes/list?search=sample text', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status()).toBe(200);

      const result = await response.json();
      // Should find notes containing our test selection text
      expect(result.notes.length).toBeGreaterThan(0);
    });

    test('should support pagination', async ({ request }) => {
      const response1 = await request.get('/api/notes/list?limit=2&offset=0', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response1.status()).toBe(200);

      const result1 = await response1.json();
      expect(result1.notes.length).toBeLessThanOrEqual(2);
      expect(result1.pagination.limit).toBe(2);
      expect(result1.pagination.offset).toBe(0);

      if (result1.hasMore) {
        const response2 = await request.get('/api/notes/list?limit=2&offset=2', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });

        expect(response2.status()).toBe(200);

        const result2 = await response2.json();
        expect(result2.pagination.offset).toBe(2);

        // Should not have duplicate notes
        const ids1 = result1.notes.map((n: any) => n.id);
        const ids2 = result2.notes.map((n: any) => n.id);
        expect(ids1.some((id: string) => ids2.includes(id))).toBeFalsy();
      }
    });

    test('should sort notes correctly', async ({ request }) => {
      const response = await request.get('/api/notes/list?sortBy=created_at&sortOrder=desc', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status()).toBe(200);

      const result = await response.json();

      // Check if notes are sorted by creation date (newest first)
      for (let i = 1; i < result.notes.length; i++) {
        const prevDate = new Date(result.notes[i - 1].createdAt);
        const currDate = new Date(result.notes[i].createdAt);
        expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
      }
    });
  });

  test.describe('Frontend Notes Interface', () => {
    test('should display notes listing page', async ({ page }) => {
      // Login first
      await page.goto('/auth/login');
      await page.fill('input[type="email"]', TEST_USER.email);
      await page.fill('input[type="password"]', TEST_USER.password);
      await page.click('button[type="submit"]');

      // Navigate to notes page
      await page.goto('/notes');

      // Check page elements
      await expect(page.locator('h1')).toContainText('Notes');
      await expect(page.locator('[data-testid="notes-filters"]')).toBeVisible();
      await expect(page.locator('[data-testid="notes-list"]')).toBeVisible();
    });

    test('should filter notes by source', async ({ page }) => {
      await page.goto('/notes');

      // Select auto notes filter
      await page.selectOption('select[id="source"]', 'auto');
      await page.click('button:text("Search")');

      // Wait for results
      await page.waitForSelector('[data-testid="note-card"]', { timeout: 5000 });

      // Verify all visible notes are auto-generated
      const autoLabels = await page.locator('[data-testid="note-card"] .badge:text("Auto")').count();
      const totalCards = await page.locator('[data-testid="note-card"]').count();

      expect(autoLabels).toBe(totalCards);
    });

    test('should search notes by content', async ({ page }) => {
      await page.goto('/notes');

      // Search for our test content
      await page.fill('input[id="search"]', 'sample text');
      await page.click('button:text("Search")');

      // Should find results
      await page.waitForSelector('[data-testid="note-card"]', { timeout: 5000 });

      const resultCount = await page.locator('[data-testid="note-card"]').count();
      expect(resultCount).toBeGreaterThan(0);
    });

    test('should navigate to note detail page', async ({ page }) => {
      await page.goto('/notes');

      // Click on first note
      await page.waitForSelector('[data-testid="note-card"]', { timeout: 5000 });
      await page.click('[data-testid="note-card"]:first-child');

      // Should navigate to detail page
      await expect(page).toHaveURL(/\/notes\/[a-f0-9-]+/);
      await expect(page.locator('h1')).toContainText('Note Details');
    });

    test('should display note metadata for auto notes', async ({ page }) => {
      await page.goto('/notes?source=auto');

      // Click on first auto note
      await page.waitForSelector('[data-testid="note-card"]', { timeout: 5000 });
      await page.click('[data-testid="note-card"]:first-child');

      // Should show generation details
      await expect(page.locator('h3:text("Generation Details")')).toBeVisible();
      await expect(page.locator('text=Generation Method')).toBeVisible();
      await expect(page.locator('text=Confidence Score')).toBeVisible();
    });
  });

  test.describe('Integration with Reading Flow', () => {
    test('should not disrupt existing reading experience', async ({ page }) => {
      // Login and navigate to a book
      await page.goto('/auth/login');
      await page.fill('input[type="email"]', TEST_USER.email);
      await page.fill('input[type="password"]', TEST_USER.password);
      await page.click('button[type="submit"]');

      await page.goto(`/read/${bookId}`);

      // Verify reading interface loads normally
      await expect(page.locator('[data-testid="book-reader"]')).toBeVisible();

      // Test text selection (should not interfere with auto notes)
      const textElement = page.locator('text=This is test book content').first();
      await textElement.dblclick();

      // Selection popover should appear
      await expect(page.locator('[data-testid="selection-popover"]')).toBeVisible();
    });

    test('should create auto note from reading interface', async ({ page }) => {
      await page.goto(`/read/${bookId}`);

      // Select text and trigger auto note creation
      const textElement = page.locator('text=sample text selection').first();
      await textElement.dblclick();

      // Look for auto note option in popover
      await page.click('button:text("Generate Auto Note")');

      // Should show success feedback
      await expect(page.locator('text=Note created successfully')).toBeVisible();
    });
  });

  test.describe('Error Handling and Edge Cases', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      await page.goto('/notes');

      // Simulate network failure
      await page.route('/api/notes/list*', route => route.abort());

      await page.reload();

      // Should show error state
      await expect(page.locator('text=Error loading notes')).toBeVisible();
      await expect(page.locator('button:text("Try Again")')).toBeVisible();
    });

    test('should handle empty states', async ({ page }) => {
      // Filter to a combination that returns no results
      await page.goto('/notes?source=auto&search=nonexistenttext123456789');

      // Should show empty state
      await expect(page.locator('text=No notes found')).toBeVisible();
      await expect(page.locator('text=Try adjusting your filters')).toBeVisible();
    });

    test('should handle invalid note IDs', async ({ page }) => {
      await page.goto('/notes/invalid-note-id-12345');

      // Should show not found error
      await expect(page.locator('text=Note not found')).toBeVisible();
      await expect(page.locator('button:text("Back to Notes")')).toBeVisible();
    });
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: Delete test notes and book
    if (createdNoteIds.length > 0) {
      for (const noteId of createdNoteIds) {
        await request.delete(`/api/notes/${noteId}`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
      }
    }

    if (bookId && bookId !== TEST_BOOK_ID) {
      await request.delete(`/api/books/${bookId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    }
  });
});