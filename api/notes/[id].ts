import { withErrorHandling, ApiErrorHandler, createSuccessResponse } from '../_lib/error-handler.js';
import { requireAuth, supabaseAdmin } from '../_lib/auth.js';
import type { Note } from '@flowreader/shared';

async function noteByIdHandler(req: Request): Promise<Response> {
  const user = await requireAuth(req);

  if (req.method === 'GET') {
    return await getNote(user.id, req);
  } else {
    return ApiErrorHandler.badRequest('Method not allowed');
  }
}

async function getNote(userId: string, req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const noteId = pathParts[pathParts.length - 1];

    if (!noteId) {
      return ApiErrorHandler.badRequest('Note ID is required');
    }

    // Fetch the note and verify user access
    const { data: note, error: noteError } = await supabaseAdmin
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .eq('user_id', userId)
      .single();

    if (noteError) {
      if (noteError.code === 'PGRST116') {
        return ApiErrorHandler.notFound('Note not found');
      }
      console.error('Failed to fetch note:', noteError);
      return ApiErrorHandler.internalServerError('Failed to fetch note');
    }

    if (!note) {
      return ApiErrorHandler.notFound('Note not found');
    }

    // Verify user still has access to the associated book
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('id')
      .eq('id', note.book_id)
      .or(`owner_id.eq.${userId},namespace.eq.public`)
      .single();

    if (bookError || !book) {
      return ApiErrorHandler.notFound('Associated book not found or access denied');
    }

    // Transform database record to API schema
    const chapterTag = note.tags?.find((tag: string) => tag.startsWith('chapter:'));
    const chapterId = chapterTag ? chapterTag.replace('chapter:', '') : undefined;
    const hasSelection = note.tags?.includes('has_selection');
    const intentTag = note.tags?.find((tag: string) => tag.startsWith('intent:'));
    const intent = intentTag ? intentTag.replace('intent:', '') as any : undefined;

    const responseNote: Note = {
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

    return createSuccessResponse(responseNote);

  } catch (error) {
    console.error('Note fetch error:', error);
    return ApiErrorHandler.internalServerError('Failed to fetch note');
  }
}

export default withErrorHandling(noteByIdHandler);