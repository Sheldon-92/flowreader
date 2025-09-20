import { withErrorHandling, ApiErrorHandler, createSuccessResponse } from '../_lib/error-handler.js';
import { requireAuthWithSecurity } from '../_lib/auth-enhanced.js';
import { supabaseAdmin } from '../_lib/auth.js';
import type { Note, AutoNoteMeta } from '@flowreader/shared';

interface ListNotesRequest {
  bookId?: string;
  source?: 'manual' | 'auto';
  generationMethod?: 'knowledge_enhancement' | 'dialog_summary' | 'context_analysis';
  limit?: number;
  offset?: number;
  search?: string;
  sortBy?: 'created_at' | 'confidence' | 'content_length';
  sortOrder?: 'asc' | 'desc';
}

interface ListNotesResponse {
  notes: Note[];
  total: number;
  hasMore: boolean;
  filters: {
    bookId?: string;
    source?: string;
    generationMethod?: string;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

async function listNotesHandler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return ApiErrorHandler.createErrorResponse(
      'METHOD_NOT_ALLOWED',
      'Method not allowed',
      405
    );
  }

  const user = await requireAuthWithSecurity(req);
  return await listNotes(req, user);
}

async function listNotes(req: Request, user: { id: string; email: string }): Promise<Response> {
  try {
    const url = new URL(req.url);
    const params = url.searchParams;

    // Parse and validate query parameters
    const filters: ListNotesRequest = {
      bookId: params.get('bookId') || undefined,
      source: (params.get('source') as 'manual' | 'auto') || undefined,
      generationMethod: (params.get('generationMethod') as any) || undefined,
      limit: Math.min(parseInt(params.get('limit') || '20'), 100), // Max 100 items
      offset: Math.max(parseInt(params.get('offset') || '0'), 0),
      search: params.get('search') || undefined,
      sortBy: (params.get('sortBy') as any) || 'created_at',
      sortOrder: (params.get('sortOrder') as 'asc' | 'desc') || 'desc'
    };

    // Build the query
    let query = supabaseAdmin
      .from('notes')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id);

    // Apply filters
    if (filters.bookId) {
      // Verify user owns the book
      const { data: book, error: bookError } = await supabaseAdmin
        .from('books')
        .select('id')
        .eq('id', filters.bookId)
        .eq('owner_id', user.id)
        .single();

      if (bookError || !book) {
        return ApiErrorHandler.createErrorResponse(
          'FORBIDDEN',
          'Book not found or access denied',
          403,
          { bookId: filters.bookId }
        );
      }

      query = query.eq('book_id', filters.bookId);
    }

    if (filters.source) {
      query = query.eq('source', filters.source);
    }

    // Filter by generation method (for auto notes)
    if (filters.generationMethod && filters.source === 'auto') {
      query = query.contains('tags', [`method:${filters.generationMethod}`]);
    }

    // Search in content
    if (filters.search) {
      query = query.ilike('content', `%${filters.search}%`);
    }

    // Apply sorting
    const orderColumn = filters.sortBy === 'content_length' ? 'char_length(content)' : filters.sortBy;
    query = query.order(orderColumn, { ascending: filters.sortOrder === 'asc' });

    // Apply pagination
    query = query.range(filters.offset, filters.offset + filters.limit - 1);

    const { data: notes, error, count } = await query;

    if (error) {
      console.error('Failed to fetch notes:', error);
      return ApiErrorHandler.internalServerError('Failed to fetch notes');
    }

    // Transform database notes to API format
    const transformedNotes: Note[] = (notes || []).map(note => transformDbNoteToApi(note));

    const total = count || 0;
    const hasMore = filters.offset + filters.limit < total;

    const response: ListNotesResponse = {
      notes: transformedNotes,
      total,
      hasMore,
      filters: {
        bookId: filters.bookId,
        source: filters.source,
        generationMethod: filters.generationMethod
      },
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        total
      }
    };

    return createSuccessResponse(response, 200);

  } catch (error) {
    console.error('List notes error:', error);

    // Handle rate limit errors
    if (error instanceof Error && (error as any).rateLimitInfo) {
      return ApiErrorHandler.createErrorResponse(
        'RATE_LIMITED',
        'Too many requests',
        429,
        { retryAfter: (error as any).rateLimitInfo.retryAfter }
      );
    }

    return ApiErrorHandler.internalServerError('Failed to list notes');
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
    }
  });

  // Add source selection if available (would need to be stored separately in production)
  if (tags.includes('has_selection')) {
    // In a real implementation, this would be stored in a separate field or table
    meta.sourceSelection = undefined; // Placeholder
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

export default withErrorHandling(listNotesHandler);