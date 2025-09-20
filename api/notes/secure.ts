import { withErrorHandling, ApiErrorHandler, createSuccessResponse } from '../_lib/error-handler.js';
import { requireAuthWithSecurity } from '../_lib/auth-enhanced.js';
import { withRateLimit, apiRateLimiter } from '../_lib/rate-limiter.js';
import { inputValidator } from '../_lib/input-validator.js';
import { supabaseAdmin } from '../_lib/auth.js';
import type { Note } from '@flowreader/shared';

async function secureNotesHandler(req: Request): Promise<Response> {
  // Enhanced authentication with rate limiting and security logging
  const user = await requireAuthWithSecurity(req);

  if (req.method === 'POST') {
    return await createNoteSecure(user.id, req);
  } else if (req.method === 'GET') {
    return await listNotesSecure(user.id, req);
  } else {
    return ApiErrorHandler.badRequest('Method not allowed');
  }
}

async function createNoteSecure(userId: string, req: Request): Promise<Response> {
  try {
    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch (error) {
      return ApiErrorHandler.badRequest('Invalid JSON in request body');
    }

    // Enhanced input validation with sanitization
    const validationResult = inputValidator.validateNoteCreation(body);
    if (!validationResult.valid) {
      return ApiErrorHandler.badRequest(
        'Validation failed',
        { errors: validationResult.errors }
      );
    }

    const { bookId, content, chapterId, selection, meta } = validationResult.sanitizedData!;

    // Verify user has access to this book with enhanced security checks
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('id, owner_id, namespace')
      .eq('id', bookId)
      .single();

    if (bookError || !book) {
      // Log potential security violation
      await supabaseAdmin.rpc('log_security_event', {
        p_event_type: 'data_access',
        p_user_id: userId,
        p_details: {
          attempted_book_id: bookId,
          action: 'create_note',
          result: 'book_not_found'
        },
        p_severity: 'medium'
      });

      return ApiErrorHandler.notFound('Book not found or access denied');
    }

    // Check if user has access (owner or public book)
    if (book.owner_id !== userId && book.namespace !== 'public') {
      // Log security violation attempt
      await supabaseAdmin.rpc('log_security_event', {
        p_event_type: 'privilege_escalation_attempt',
        p_user_id: userId,
        p_details: {
          attempted_book_id: bookId,
          book_owner: book.owner_id,
          action: 'create_note'
        },
        p_severity: 'high'
      });

      return ApiErrorHandler.forbidden('Access denied to this book');
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

    // Rate limiting check for note creation (additional protection)
    const { data: recentNotes } = await supabaseAdmin
      .from('notes')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 60000).toISOString()); // Last minute

    if (recentNotes && recentNotes.length >= 10) {
      return ApiErrorHandler.rateLimited('Too many notes created recently', 60);
    }

    // Insert the note with enhanced metadata
    const { data: note, error: insertError } = await supabaseAdmin
      .from('notes')
      .insert({
        user_id: userId,
        book_id: bookId,
        content,
        tags: [
          ...(chapterId ? [`chapter:${chapterId}`] : []),
          ...(selection?.text ? ['has_selection'] : []),
          ...(meta?.intent ? [`intent:${meta.intent}`] : []),
          'secure_created' // Mark as created through secure endpoint
        ]
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('Failed to create note:', insertError);

      // Log creation failure for security monitoring
      await supabaseAdmin.rpc('log_security_event', {
        p_event_type: 'data_access',
        p_user_id: userId,
        p_details: {
          book_id: bookId,
          action: 'create_note',
          result: 'database_error',
          error: insertError.message
        },
        p_severity: 'medium'
      });

      return ApiErrorHandler.internalServerError('Failed to create note');
    }

    // Log successful note creation
    await supabaseAdmin.rpc('log_security_event', {
      p_event_type: 'data_access',
      p_user_id: userId,
      p_details: {
        book_id: bookId,
        note_id: note.id,
        action: 'create_note',
        result: 'success'
      },
      p_severity: 'info'
    });

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
    console.error('Secure note creation error:', error);

    // Log the error for security monitoring
    await supabaseAdmin.rpc('log_security_event', {
      p_event_type: 'security_policy_violation',
      p_user_id: userId,
      p_details: {
        action: 'create_note',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      p_severity: 'high'
    });

    return ApiErrorHandler.internalServerError('Failed to create note');
  }
}

async function listNotesSecure(userId: string, req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const bookId = url.searchParams.get('bookId');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const cursor = url.searchParams.get('cursor');

    // Validate required parameters
    if (!bookId) {
      return ApiErrorHandler.badRequest('bookId query parameter is required');
    }

    // Validate bookId format
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(bookId)) {
      return ApiErrorHandler.badRequest('Invalid bookId format');
    }

    // Verify user has access to this book
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('id, owner_id, namespace')
      .eq('id', bookId)
      .single();

    if (bookError || !book) {
      // Log potential security violation
      await supabaseAdmin.rpc('log_security_event', {
        p_event_type: 'data_access',
        p_user_id: userId,
        p_details: {
          attempted_book_id: bookId,
          action: 'list_notes',
          result: 'book_not_found'
        },
        p_severity: 'medium'
      });

      return ApiErrorHandler.notFound('Book not found or access denied');
    }

    // Check if user has access (owner or public book)
    if (book.owner_id !== userId && book.namespace !== 'public') {
      // Log security violation attempt
      await supabaseAdmin.rpc('log_security_event', {
        p_event_type: 'privilege_escalation_attempt',
        p_user_id: userId,
        p_details: {
          attempted_book_id: bookId,
          book_owner: book.owner_id,
          action: 'list_notes'
        },
        p_severity: 'high'
      });

      return ApiErrorHandler.forbidden('Access denied to this book');
    }

    // Build query with enhanced security
    let query = supabaseAdmin
      .from('notes')
      .select('*')
      .eq('user_id', userId) // Always filter by user ID for security
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })
      .limit(limit + 1); // Fetch one extra to determine if there are more

    // Apply cursor-based pagination
    if (cursor) {
      // Validate cursor format (should be ISO timestamp)
      try {
        new Date(cursor).toISOString();
        query = query.lt('created_at', cursor);
      } catch {
        return ApiErrorHandler.badRequest('Invalid cursor format');
      }
    }

    const { data: notesData, error: notesError } = await query;

    if (notesError) {
      console.error('Failed to fetch notes:', notesError);

      // Log database error for monitoring
      await supabaseAdmin.rpc('log_security_event', {
        p_event_type: 'data_access',
        p_user_id: userId,
        p_details: {
          book_id: bookId,
          action: 'list_notes',
          result: 'database_error',
          error: notesError.message
        },
        p_severity: 'medium'
      });

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

    // Log successful access
    await supabaseAdmin.rpc('log_security_event', {
      p_event_type: 'data_access',
      p_user_id: userId,
      p_details: {
        book_id: bookId,
        action: 'list_notes',
        result: 'success',
        count: transformedNotes.length
      },
      p_severity: 'info'
    });

    const response = {
      items: transformedNotes,
      nextCursor: hasMore ? items[items.length - 1].created_at : undefined,
      meta: {
        count: transformedNotes.length,
        hasMore,
        limit
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Secure notes list error:', error);

    // Log the error for security monitoring
    await supabaseAdmin.rpc('log_security_event', {
      p_event_type: 'security_policy_violation',
      p_user_id: userId,
      p_details: {
        action: 'list_notes',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      p_severity: 'high'
    });

    return ApiErrorHandler.internalServerError('Failed to fetch notes');
  }
}

// Export handler with rate limiting and error handling
export default withRateLimit(apiRateLimiter)(withErrorHandling(secureNotesHandler));