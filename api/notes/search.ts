import { withErrorHandling, ApiErrorHandler, createSuccessResponse } from '../_lib/error-handler.js';
import { requireAuthWithSecurity } from '../_lib/auth-enhanced.js';
import { supabaseAdmin } from '../_lib/auth.js';
import type { Note, AutoNoteMeta } from '@flowreader/shared';
import { NotesSearchPerformanceMonitor } from './performance.js';

interface SearchNotesRequest {
  q?: string;              // Full-text search query
  bookId?: string;         // Filter by book
  chapterId?: string;      // Filter by chapter
  source?: 'manual' | 'auto'; // Filter by source
  type?: string;           // Filter by note type (enhance, explain, etc.)
  generationMethod?: 'knowledge_enhancement' | 'dialog_summary' | 'context_analysis';
  hasSelection?: boolean;  // Filter notes with/without selections
  tags?: string[];         // Filter by specific tags
  minConfidence?: number;  // Minimum confidence for auto notes
  limit?: number;          // Pagination limit
  offset?: number;         // Pagination offset
  sortBy?: 'created_at' | 'confidence' | 'content_length' | 'relevance';
  sortOrder?: 'asc' | 'desc';
}

interface SearchNotesResponse {
  notes: Note[];
  total: number;
  hasMore: boolean;
  filters: {
    q?: string;
    bookId?: string;
    chapterId?: string;
    source?: string;
    type?: string;
    generationMethod?: string;
    hasSelection?: boolean;
    tags?: string[];
    minConfidence?: number;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
  performance: {
    queryTime: number;
    resultsCount: number;
  };
}

async function searchNotesHandler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return ApiErrorHandler.createErrorResponse(
      'METHOD_NOT_ALLOWED',
      'Method not allowed',
      405
    );
  }

  const startTime = Date.now();
  const user = await requireAuthWithSecurity(req);

  // Parse URL for performance monitoring
  const url = new URL(req.url);
  const searchParams = Object.fromEntries(url.searchParams.entries());

  const result = await searchNotes(req, user);

  // Record performance metrics
  const queryTime = Date.now() - startTime;
  const monitor = NotesSearchPerformanceMonitor.getInstance();

  if (result.ok) {
    const data = await result.json();
    const resultCount = data.data?.notes?.length || 0;

    // Record benchmark for performance monitoring
    await monitor.recordSearchBenchmark(
      determineQueryType(searchParams),
      searchParams,
      queryTime,
      resultCount,
      ['idx_notes_search_vector', 'idx_notes_user_book_created'] // Would be determined from query plan
    );

    data.performance = {
      ...data.performance,
      queryTime
    };
    return createSuccessResponse(data, 200);
  }

  return result;
}

async function searchNotes(req: Request, user: { id: string; email: string }): Promise<Response> {
  try {
    const url = new URL(req.url);
    const params = url.searchParams;

    // Parse and validate query parameters
    const searchParams: SearchNotesRequest = {
      q: params.get('q') || undefined,
      bookId: params.get('bookId') || undefined,
      chapterId: params.get('chapterId') || undefined,
      source: (params.get('source') as 'manual' | 'auto') || undefined,
      type: params.get('type') || undefined,
      generationMethod: (params.get('generationMethod') as any) || undefined,
      hasSelection: params.get('hasSelection') === 'true' ? true :
                   params.get('hasSelection') === 'false' ? false : undefined,
      tags: params.get('tags') ? params.get('tags')!.split(',') : undefined,
      minConfidence: params.get('minConfidence') ? parseFloat(params.get('minConfidence')!) : undefined,
      limit: Math.min(parseInt(params.get('limit') || '20'), 100), // Max 100 items
      offset: Math.max(parseInt(params.get('offset') || '0'), 0),
      sortBy: (params.get('sortBy') as any) || 'created_at',
      sortOrder: (params.get('sortOrder') as 'asc' | 'desc') || 'desc'
    };

    // Validate parameters
    if (searchParams.minConfidence && (searchParams.minConfidence < 0 || searchParams.minConfidence > 1)) {
      return ApiErrorHandler.badRequest('minConfidence must be between 0 and 1');
    }

    // Build the query
    let query = supabaseAdmin
      .from('notes')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id);

    // Apply filters with RLS
    if (searchParams.bookId) {
      // Verify user owns the book
      const { data: book, error: bookError } = await supabaseAdmin
        .from('books')
        .select('id')
        .eq('id', searchParams.bookId)
        .eq('owner_id', user.id)
        .single();

      if (bookError || !book) {
        return ApiErrorHandler.createErrorResponse(
          'FORBIDDEN',
          'Book not found or access denied',
          403,
          { bookId: searchParams.bookId }
        );
      }

      query = query.eq('book_id', searchParams.bookId);
    }

    // Filter by source
    if (searchParams.source) {
      query = query.eq('source', searchParams.source);
    }

    // Filter by chapter using tags
    if (searchParams.chapterId) {
      query = query.contains('tags', [`chapter:${searchParams.chapterId}`]);
    }

    // Filter by note type using tags
    if (searchParams.type) {
      query = query.contains('tags', [`intent:${searchParams.type}`]);
    }

    // Filter by generation method (for auto notes)
    if (searchParams.generationMethod && searchParams.source === 'auto') {
      query = query.contains('tags', [`method:${searchParams.generationMethod}`]);
    }

    // Filter by selection presence
    if (searchParams.hasSelection === true) {
      query = query.contains('tags', ['has_selection']);
    } else if (searchParams.hasSelection === false) {
      query = query.not('tags', 'cs', ['has_selection']);
    }

    // Filter by specific tags
    if (searchParams.tags && searchParams.tags.length > 0) {
      query = query.contains('tags', searchParams.tags);
    }

    // Filter by minimum confidence for auto notes
    if (searchParams.minConfidence && searchParams.source === 'auto') {
      // Use a more complex query to filter by confidence stored in tags
      const confidenceFilter = `confidence:${searchParams.minConfidence}`;
      // This will need a custom function for proper numeric comparison
      // For now, we'll handle this post-query
    }

    // Full-text search in content
    if (searchParams.q) {
      const searchTerm = searchParams.q.trim();
      if (searchTerm.length > 0) {
        // Use PostgreSQL full-text search with prefix matching
        if (searchTerm.length >= 3) {
          // Use prefix matching for longer terms
          query = query.or(`content.ilike.%${searchTerm}%,tags.cs.{${searchTerm}}`);
        } else {
          // Simple case-insensitive search for short terms
          query = query.ilike('content', `%${searchTerm}%`);
        }
      }
    }

    // Apply sorting
    if (searchParams.sortBy === 'relevance' && searchParams.q) {
      // For relevance sorting, we'll order by text similarity (simplified)
      query = query.order('created_at', { ascending: false });
    } else if (searchParams.sortBy === 'content_length') {
      // Use char_length function for content length sorting
      query = query.order('char_length(content)', { ascending: searchParams.sortOrder === 'asc' });
    } else if (searchParams.sortBy === 'confidence') {
      // Confidence sorting for auto notes - we'll handle this post-query
      query = query.order('created_at', { ascending: searchParams.sortOrder === 'asc' });
    } else {
      query = query.order(searchParams.sortBy, { ascending: searchParams.sortOrder === 'asc' });
    }

    // Apply pagination
    query = query.range(searchParams.offset, searchParams.offset + searchParams.limit - 1);

    const { data: notes, error, count } = await query;

    if (error) {
      console.error('Failed to search notes:', error);
      return ApiErrorHandler.internalServerError('Failed to search notes');
    }

    let filteredNotes = notes || [];

    // Post-query filtering for confidence (if needed)
    if (searchParams.minConfidence && searchParams.source === 'auto') {
      filteredNotes = filteredNotes.filter(note => {
        const confidenceTag = note.tags?.find((tag: string) => tag.startsWith('confidence:'));
        if (confidenceTag) {
          const confidence = parseFloat(confidenceTag.replace('confidence:', ''));
          return confidence >= searchParams.minConfidence!;
        }
        return false;
      });
    }

    // Post-query sorting for confidence
    if (searchParams.sortBy === 'confidence' && searchParams.source === 'auto') {
      filteredNotes.sort((a, b) => {
        const getConfidence = (note: any) => {
          const confidenceTag = note.tags?.find((tag: string) => tag.startsWith('confidence:'));
          return confidenceTag ? parseFloat(confidenceTag.replace('confidence:', '')) : 0;
        };

        const confidenceA = getConfidence(a);
        const confidenceB = getConfidence(b);

        return searchParams.sortOrder === 'asc' ? confidenceA - confidenceB : confidenceB - confidenceA;
      });
    }

    // Transform database notes to API format
    const transformedNotes: Note[] = filteredNotes.map(note => transformDbNoteToApi(note));

    const total = count || 0;
    const hasMore = searchParams.offset + searchParams.limit < total;

    const response: SearchNotesResponse = {
      notes: transformedNotes,
      total,
      hasMore,
      filters: {
        q: searchParams.q,
        bookId: searchParams.bookId,
        chapterId: searchParams.chapterId,
        source: searchParams.source,
        type: searchParams.type,
        generationMethod: searchParams.generationMethod,
        hasSelection: searchParams.hasSelection,
        tags: searchParams.tags,
        minConfidence: searchParams.minConfidence
      },
      pagination: {
        limit: searchParams.limit,
        offset: searchParams.offset,
        total
      },
      performance: {
        queryTime: 0, // Will be set by the main handler
        resultsCount: transformedNotes.length
      }
    };

    return createSuccessResponse(response, 200);

  } catch (error) {
    console.error('Search notes error:', error);

    // Handle rate limit errors
    if (error instanceof Error && (error as any).rateLimitInfo) {
      return ApiErrorHandler.createErrorResponse(
        'RATE_LIMITED',
        'Too many requests',
        429,
        { retryAfter: (error as any).rateLimitInfo.retryAfter }
      );
    }

    return ApiErrorHandler.internalServerError('Failed to search notes');
  }
}

function transformDbNoteToApi(dbNote: any): Note {
  // Extract metadata from tags array
  const tags = dbNote.tags || [];
  const meta: any = {};

  // Parse metadata from tags
  tags.forEach((tag: string) => {
    if (tag.startsWith('intent:')) {
      meta.intent = tag.replace('intent:', '');
    } else if (tag.startsWith('method:')) {
      meta.generationMethod = tag.replace('method:', '');
    } else if (tag.startsWith('confidence:')) {
      meta.confidence = parseFloat(tag.replace('confidence:', ''));
    } else if (tag.startsWith('chapter:')) {
      meta.chapterId = tag.replace('chapter:', '');
    } else if (tag.startsWith('type:')) {
      meta.type = tag.replace('type:', '');
    }
  });

  // Add source selection if available
  if (tags.includes('has_selection')) {
    // In a real implementation, this would be stored in a separate field or table
    meta.sourceSelection = {
      text: 'Selection preserved', // Placeholder - would be stored separately
      start: 0,
      end: 0
    };
  }

  const note: Note = {
    id: dbNote.id,
    userId: dbNote.user_id,
    bookId: dbNote.book_id,
    chapterId: meta.chapterId,
    content: dbNote.content,
    source: dbNote.source || 'manual',
    meta: dbNote.source === 'auto' ? meta as AutoNoteMeta : meta,
    createdAt: dbNote.created_at
  };

  return note;
}

function determineQueryType(searchParams: Record<string, string>): string {
  if (searchParams.q) {
    if (Object.keys(searchParams).length > 2) { // q + other filters
      return 'complex_full_text_search';
    }
    return 'simple_full_text_search';
  }

  if (searchParams.source && searchParams.type) {
    return 'filtered_search';
  }

  if (searchParams.minConfidence) {
    return 'confidence_filtered_search';
  }

  if (searchParams.hasSelection) {
    return 'selection_filtered_search';
  }

  if (searchParams.bookId) {
    return 'book_specific_search';
  }

  if (parseInt(searchParams.offset || '0') > 0) {
    return 'paginated_search';
  }

  return 'basic_search';
}

export default withErrorHandling(searchNotesHandler);