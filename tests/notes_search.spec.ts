import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSupabaseAdmin } from '../supabase/supabase-admin';
import type { Database } from '../supabase/database.types';

// Mock data for testing
const testUser = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'test@example.com'
};

const testBook = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  owner_id: testUser.id,
  title: 'Test Book',
  author: 'Test Author',
  file_path: '/test/path'
};

const testNotes = [
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    user_id: testUser.id,
    book_id: testBook.id,
    content: 'This is a manual note about knowledge enhancement and historical context.',
    source: 'manual',
    tags: ['source:manual', 'intent:enhance', 'has_selection']
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440004',
    user_id: testUser.id,
    book_id: testBook.id,
    content: 'Auto-generated note explaining complex concepts with high confidence.',
    source: 'auto',
    tags: ['source:auto', 'method:knowledge_enhancement', 'intent:explain', 'confidence:0.9', 'has_selection']
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440005',
    user_id: testUser.id,
    book_id: testBook.id,
    content: 'Dialog summary note from recent conversation.',
    source: 'auto',
    tags: ['source:auto', 'method:dialog_summary', 'intent:analyze', 'confidence:0.7']
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440006',
    user_id: testUser.id,
    book_id: testBook.id,
    content: 'Context analysis note with medium confidence.',
    source: 'auto',
    tags: ['source:auto', 'method:context_analysis', 'intent:enhance', 'confidence:0.6', 'has_selection']
  }
];

describe('Notes Search API', () => {
  let supabase: ReturnType<typeof createSupabaseAdmin>;
  let authToken: string;

  beforeEach(async () => {
    supabase = createSupabaseAdmin();

    // Create test user (simulate auth)
    authToken = 'mock-jwt-token';

    // Insert test book
    await supabase.from('books').insert(testBook);

    // Insert test notes
    await supabase.from('notes').insert(testNotes);
  });

  afterEach(async () => {
    // Clean up test data
    await supabase.from('notes').delete().eq('user_id', testUser.id);
    await supabase.from('books').delete().eq('id', testBook.id);
  });

  describe('Basic Search Functionality', () => {
    it('should return all notes when no search parameters provided', async () => {
      const response = await fetch('/api/notes/search', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes).toHaveLength(4);
      expect(data.data.total).toBe(4);
      expect(data.data.hasMore).toBe(false);
    });

    it('should perform full-text search in note content', async () => {
      const response = await fetch('/api/notes/search?q=knowledge+enhancement', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes.length).toBeGreaterThan(0);
      expect(data.data.notes.some((note: any) =>
        note.content.toLowerCase().includes('knowledge enhancement')
      )).toBe(true);
    });

    it('should handle case-insensitive search', async () => {
      const response = await fetch('/api/notes/search?q=KNOWLEDGE', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes.length).toBeGreaterThan(0);
    });

    it('should return empty results for non-existent search terms', async () => {
      const response = await fetch('/api/notes/search?q=nonexistent_term_xyz', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes).toHaveLength(0);
      expect(data.data.total).toBe(0);
    });
  });

  describe('Filtering Functionality', () => {
    it('should filter by book ID', async () => {
      const response = await fetch(`/api/notes/search?bookId=${testBook.id}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes).toHaveLength(4);
      expect(data.data.notes.every((note: any) => note.bookId === testBook.id)).toBe(true);
    });

    it('should filter by source type', async () => {
      const response = await fetch('/api/notes/search?source=auto', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes).toHaveLength(3);
      expect(data.data.notes.every((note: any) => note.source === 'auto')).toBe(true);
    });

    it('should filter by note type/intent', async () => {
      const response = await fetch('/api/notes/search?type=enhance', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes.length).toBeGreaterThan(0);
      expect(data.data.notes.every((note: any) =>
        note.meta?.intent === 'enhance'
      )).toBe(true);
    });

    it('should filter by generation method', async () => {
      const response = await fetch('/api/notes/search?source=auto&generationMethod=knowledge_enhancement', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes.length).toBeGreaterThan(0);
      expect(data.data.notes.every((note: any) =>
        note.meta?.generationMethod === 'knowledge_enhancement'
      )).toBe(true);
    });

    it('should filter by selection presence', async () => {
      const response = await fetch('/api/notes/search?hasSelection=true', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes.length).toBe(3); // Notes with has_selection tag
    });

    it('should filter by minimum confidence', async () => {
      const response = await fetch('/api/notes/search?source=auto&minConfidence=0.8', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes.length).toBe(1); // Only the 0.9 confidence note
      expect(data.data.notes[0].meta.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should combine multiple filters', async () => {
      const response = await fetch('/api/notes/search?source=auto&type=enhance&hasSelection=true', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes.length).toBe(1); // Only one note matches all criteria
    });
  });

  describe('Sorting Functionality', () => {
    it('should sort by created_at descending by default', async () => {
      const response = await fetch('/api/notes/search', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      const notes = data.data.notes;
      for (let i = 0; i < notes.length - 1; i++) {
        const current = new Date(notes[i].createdAt);
        const next = new Date(notes[i + 1].createdAt);
        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
      }
    });

    it('should sort by created_at ascending when specified', async () => {
      const response = await fetch('/api/notes/search?sortBy=created_at&sortOrder=asc', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      const notes = data.data.notes;
      for (let i = 0; i < notes.length - 1; i++) {
        const current = new Date(notes[i].createdAt);
        const next = new Date(notes[i + 1].createdAt);
        expect(current.getTime()).toBeLessThanOrEqual(next.getTime());
      }
    });

    it('should sort by confidence for auto notes', async () => {
      const response = await fetch('/api/notes/search?source=auto&sortBy=confidence&sortOrder=desc', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      const notes = data.data.notes;
      for (let i = 0; i < notes.length - 1; i++) {
        const currentConf = notes[i].meta?.confidence || 0;
        const nextConf = notes[i + 1].meta?.confidence || 0;
        expect(currentConf).toBeGreaterThanOrEqual(nextConf);
      }
    });

    it('should sort by content length', async () => {
      const response = await fetch('/api/notes/search?sortBy=content_length&sortOrder=desc', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      const notes = data.data.notes;
      for (let i = 0; i < notes.length - 1; i++) {
        expect(notes[i].content.length).toBeGreaterThanOrEqual(notes[i + 1].content.length);
      }
    });
  });

  describe('Pagination', () => {
    it('should respect limit parameter', async () => {
      const response = await fetch('/api/notes/search?limit=2', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes).toHaveLength(2);
      expect(data.data.pagination.limit).toBe(2);
      expect(data.data.hasMore).toBe(true);
    });

    it('should respect offset parameter', async () => {
      const response = await fetch('/api/notes/search?limit=2&offset=2', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes).toHaveLength(2);
      expect(data.data.pagination.offset).toBe(2);
    });

    it('should enforce maximum limit of 100', async () => {
      const response = await fetch('/api/notes/search?limit=150', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.pagination.limit).toBe(100);
    });

    it('should handle offset beyond available results', async () => {
      const response = await fetch('/api/notes/search?offset=100', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes).toHaveLength(0);
      expect(data.data.hasMore).toBe(false);
    });
  });

  describe('Response Format', () => {
    it('should include all required response fields', async () => {
      const response = await fetch('/api/notes/search', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data).toHaveProperty('notes');
      expect(data.data).toHaveProperty('total');
      expect(data.data).toHaveProperty('hasMore');
      expect(data.data).toHaveProperty('filters');
      expect(data.data).toHaveProperty('pagination');
      expect(data.data).toHaveProperty('performance');
    });

    it('should include performance metrics', async () => {
      const response = await fetch('/api/notes/search?q=test', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.performance).toHaveProperty('queryTime');
      expect(data.data.performance).toHaveProperty('resultsCount');
      expect(typeof data.data.performance.queryTime).toBe('number');
      expect(typeof data.data.performance.resultsCount).toBe('number');
    });

    it('should include applied filters in response', async () => {
      const response = await fetch('/api/notes/search?q=test&source=auto&type=enhance', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.filters.q).toBe('test');
      expect(data.data.filters.source).toBe('auto');
      expect(data.data.filters.type).toBe('enhance');
    });

    it('should transform database notes to API format correctly', async () => {
      const response = await fetch('/api/notes/search?source=auto&limit=1', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      const note = data.data.notes[0];
      expect(note).toHaveProperty('id');
      expect(note).toHaveProperty('userId');
      expect(note).toHaveProperty('bookId');
      expect(note).toHaveProperty('content');
      expect(note).toHaveProperty('source');
      expect(note).toHaveProperty('meta');
      expect(note).toHaveProperty('createdAt');

      // Auto note should have extended meta
      if (note.source === 'auto') {
        expect(note.meta).toHaveProperty('generationMethod');
        expect(note.meta).toHaveProperty('confidence');
      }
    });
  });

  describe('Error Handling', () => {
    it('should return 401 for missing authentication', async () => {
      const response = await fetch('/api/notes/search');
      expect(response.status).toBe(401);
    });

    it('should return 401 for invalid authentication', async () => {
      const response = await fetch('/api/notes/search', {
        headers: { 'Authorization': 'Bearer invalid-token' }
      });
      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid minConfidence parameter', async () => {
      const response = await fetch('/api/notes/search?minConfidence=1.5', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      expect(response.status).toBe(400);
    });

    it('should return 403 for inaccessible book', async () => {
      const invalidBookId = '550e8400-e29b-41d4-a716-446655440999';
      const response = await fetch(`/api/notes/search?bookId=${invalidBookId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      expect(response.status).toBe(403);
    });

    it('should return 405 for non-GET methods', async () => {
      const response = await fetch('/api/notes/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      expect(response.status).toBe(405);
    });
  });

  describe('Security', () => {
    it('should only return notes owned by authenticated user', async () => {
      // Insert note for different user
      const otherUserId = '550e8400-e29b-41d4-a716-446655440999';
      await supabase.from('notes').insert({
        id: '550e8400-e29b-41d4-a716-446655440998',
        user_id: otherUserId,
        book_id: testBook.id,
        content: 'Other user note',
        source: 'manual',
        tags: ['source:manual']
      });

      const response = await fetch('/api/notes/search', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes).toHaveLength(4); // Only original test notes
      expect(data.data.notes.every((note: any) => note.userId === testUser.id)).toBe(true);

      // Cleanup
      await supabase.from('notes').delete().eq('user_id', otherUserId);
    });

    it('should validate book ownership for book-specific searches', async () => {
      // Create book owned by different user
      const otherUserId = '550e8400-e29b-41d4-a716-446655440999';
      const otherBookId = '550e8400-e29b-41d4-a716-446655440998';

      await supabase.from('books').insert({
        id: otherBookId,
        owner_id: otherUserId,
        title: 'Other User Book',
        author: 'Other Author',
        file_path: '/other/path'
      });

      const response = await fetch(`/api/notes/search?bookId=${otherBookId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(403);

      // Cleanup
      await supabase.from('books').delete().eq('id', otherBookId);
    });

    it('should sanitize search input to prevent injection', async () => {
      const maliciousQuery = "'; DROP TABLE notes; --";
      const response = await fetch(`/api/notes/search?q=${encodeURIComponent(maliciousQuery)}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      // Should handle gracefully without causing database errors
      const data = await response.json();
      expect(data.data.notes).toHaveLength(0); // No matches for malicious query
    });
  });

  describe('Performance', () => {
    it('should complete searches within reasonable time limits', async () => {
      const startTime = Date.now();

      const response = await fetch('/api/notes/search?q=knowledge', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should report accurate performance metrics', async () => {
      const response = await fetch('/api/notes/search?q=knowledge', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.performance.queryTime).toBeGreaterThan(0);
      expect(data.data.performance.resultsCount).toBe(data.data.notes.length);
    });

    it('should handle large result sets efficiently', async () => {
      // Insert additional test notes to simulate larger dataset
      const additionalNotes = Array.from({ length: 50 }, (_, i) => ({
        id: `550e8400-e29b-41d4-a716-44665544${i.toString().padStart(4, '0')}`,
        user_id: testUser.id,
        book_id: testBook.id,
        content: `Test note ${i} with various content for performance testing`,
        source: 'manual',
        tags: ['source:manual', `test:${i}`]
      }));

      await supabase.from('notes').insert(additionalNotes);

      const response = await fetch('/api/notes/search?limit=100', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.notes.length).toBeGreaterThan(50);
      expect(data.data.performance.queryTime).toBeLessThan(500); // Should be efficient

      // Cleanup
      await supabase.from('notes').delete().in('id', additionalNotes.map(n => n.id));
    });
  });
});