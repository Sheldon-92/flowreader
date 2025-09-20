import { withErrorHandling, ApiErrorHandler, createSuccessResponse } from '../_lib/error-handler.js';
import { requireAuth, supabaseAdmin } from '../_lib/auth.js';
import type { Note } from '@flowreader/shared';

async function notesHandler(req: Request): Promise<Response> {
  const user = await requireAuth(req);

  if (req.method === 'POST') {
    return await createNote(user.id, req);
  } else if (req.method === 'GET') {
    return await listNotes(user.id, req);
  } else {
    return ApiErrorHandler.badRequest('Method not allowed');
  }
}

async function createNote(userId: string, req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { bookId, chapterId, selection, content, meta } = body;

    // Validate required fields
    if (!bookId) {
      return ApiErrorHandler.badRequest('bookId is required');
    }

    if (!content || typeof content !== 'string') {
      return ApiErrorHandler.badRequest('content is required and must be a string');
    }

    // Validate content length (max 4k chars as per requirements)
    if (content.length > 4000) {
      return ApiErrorHandler.badRequest('content must be 4000 characters or less');
    }

    // Validate selection text length if provided (max 1k chars as per requirements)
    if (selection?.text && selection.text.length > 1000) {
      return ApiErrorHandler.badRequest('selection text must be 1000 characters or less');
    }

    // Verify user has access to this book
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('id')
      .eq('id', bookId)
      .or(`owner_id.eq.${userId},namespace.eq.public`)
      .single();

    if (bookError || !book) {
      return ApiErrorHandler.notFound('Book not found or access denied');
    }

    // Verify chapter exists if chapterId is provided
    if (chapterId) {
      const { data: chapter, error: chapterError } = await supabaseAdmin
        .from('chapters')
        .select('id')
        .eq('id', chapterId)
        .eq('book_id', bookId)
        .single();

      if (chapterError || !chapter) {
        return ApiErrorHandler.badRequest('Invalid chapterId for this book');
      }
    }

    // Insert the note
    const { data: note, error: insertError } = await supabaseAdmin
      .from('notes')
      .insert({
        user_id: userId,
        book_id: bookId,
        content,
        // Store additional fields in a structured way
        tags: [
          ...(chapterId ? [`chapter:${chapterId}`] : []),
          ...(selection?.text ? ['has_selection'] : []),
          ...(meta?.intent ? [`intent:${meta.intent}`] : [])
        ]
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('Failed to create note:', insertError);
      return ApiErrorHandler.internalServerError('Failed to create note');
    }

    // Transform the database response to match our API schema
    const responseNote: Note = {
      id: note.id,
      userId: note.user_id,
      bookId: note.book_id,
      chapterId,
      selection,
      content: note.content,
      source: 'manual',
      meta,
      createdAt: note.created_at
    };

    return createSuccessResponse(responseNote, 201);

  } catch (error) {
    console.error('Note creation error:', error);
    return ApiErrorHandler.internalServerError('Failed to create note');
  }
}

async function listNotes(userId: string, req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const bookId = url.searchParams.get('bookId');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const cursor = url.searchParams.get('cursor');

    if (!bookId) {
      return ApiErrorHandler.badRequest('bookId query parameter is required');
    }

    // Verify user has access to this book
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('id')
      .eq('id', bookId)
      .or(`owner_id.eq.${userId},namespace.eq.public`)
      .single();

    if (bookError || !book) {
      return ApiErrorHandler.notFound('Book not found or access denied');
    }

    // Build query
    let query = supabaseAdmin
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })
      .limit(limit + 1); // Fetch one extra to determine if there are more

    // Apply cursor-based pagination
    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data: notesData, error: notesError } = await query;

    if (notesError) {
      console.error('Failed to fetch notes:', notesError);
      return ApiErrorHandler.internalServerError('Failed to fetch notes');
    }

    const notes = notesData || [];
    const hasMore = notes.length > limit;
    const items = hasMore ? notes.slice(0, limit) : notes;

    // Transform database records to API schema
    const transformedNotes: Note[] = items.map(note => {
      // Parse chapter and selection info from tags
      const chapterTag = note.tags?.find((tag: string) => tag.startsWith('chapter:'));
      const chapterId = chapterTag ? chapterTag.replace('chapter:', '') : undefined;
      const hasSelection = note.tags?.includes('has_selection');
      const intentTag = note.tags?.find((tag: string) => tag.startsWith('intent:'));
      const intent = intentTag ? intentTag.replace('intent:', '') as any : undefined;

      return {
        id: note.id,
        userId: note.user_id,
        bookId: note.book_id,
        chapterId,
        selection: hasSelection ? { text: 'Selection preserved', start: 0, end: 0 } : undefined,
        content: note.content,
        source: 'manual' as const,
        meta: intent ? { intent } : undefined,
        createdAt: note.created_at
      };
    });

    const response = {
      items: transformedNotes,
      nextCursor: hasMore ? items[items.length - 1].created_at : undefined
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Notes list error:', error);
    return ApiErrorHandler.internalServerError('Failed to fetch notes');
  }
}

export default withErrorHandling(notesHandler);