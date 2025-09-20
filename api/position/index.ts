import { withErrorHandling, ApiErrorHandler, createSuccessResponse } from '../_lib/error-handler.js';
import { requireAuth, supabaseAdmin } from '../_lib/auth.js';

async function positionHandler(req: Request): Promise<Response> {
  const user = await requireAuth(req);

  if (req.method === 'POST') {
    return await updatePosition(user.id, req);
  } else if (req.method === 'GET') {
    return await getPosition(user.id, req);
  } else {
    return ApiErrorHandler.badRequest('Method not allowed');
  }
}

async function updatePosition(userId: string, req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { book_id, chapter_idx, cfi_position, percentage } = body;

    // Validate input
    if (!book_id) {
      return ApiErrorHandler.badRequest('Book ID is required');
    }

    if (typeof chapter_idx !== 'number' || chapter_idx < 0) {
      return ApiErrorHandler.badRequest('Valid chapter index is required');
    }

    if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
      return ApiErrorHandler.badRequest('Valid percentage (0-100) is required');
    }

    // Verify user has access to this book
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('id')
      .eq('id', book_id)
      .or(`owner_id.eq.${userId},namespace.eq.public`)
      .single();

    if (bookError || !book) {
      return ApiErrorHandler.notFound('Book not found');
    }

    // Update reading position using the upsert function
    const { error: positionError } = await supabaseAdmin
      .rpc('update_reading_position', {
        p_user_id: userId,
        p_book_id: book_id,
        p_chapter_idx: chapter_idx,
        p_cfi_position: cfi_position || '',
        p_percentage: percentage
      });

    if (positionError) {
      throw positionError;
    }

    // Also update the book's reading_progress for denormalized access
    const { error: bookUpdateError } = await supabaseAdmin
      .from('books')
      .update({
        reading_progress: {
          current_cfi: cfi_position || '',
          current_chapter: chapter_idx,
          percentage,
          last_read: new Date().toISOString()
        }
      })
      .eq('id', book_id)
      .eq('owner_id', userId);

    // Don't fail if book update fails (it might be a public book)
    if (bookUpdateError) {
      console.warn('Failed to update book progress:', bookUpdateError);
    }

    const response = {
      book_id,
      chapter_idx,
      cfi_position: cfi_position || '',
      percentage,
      updated_at: new Date().toISOString()
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Position update error:', error);
    return ApiErrorHandler.internalServerError('Failed to update reading position');
  }
}

async function getPosition(userId: string, req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const bookId = url.searchParams.get('book_id');

    if (!bookId) {
      return ApiErrorHandler.badRequest('Book ID is required');
    }

    // Verify user has access to this book
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('id')
      .eq('id', bookId)
      .or(`owner_id.eq.${userId},namespace.eq.public`)
      .single();

    if (bookError || !book) {
      return ApiErrorHandler.notFound('Book not found');
    }

    // Get reading position
    const { data: position, error: positionError } = await supabaseAdmin
      .from('reading_positions')
      .select('*')
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .single();

    if (positionError && positionError.code !== 'PGRST116') {
      throw positionError;
    }

    const response = position ? {
      book_id: position.book_id,
      chapter_idx: position.chapter_idx,
      cfi_position: position.cfi_position,
      percentage: position.percentage,
      updated_at: position.updated_at
    } : {
      book_id: bookId,
      chapter_idx: 0,
      cfi_position: '',
      percentage: 0,
      updated_at: null
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Position fetch error:', error);
    return ApiErrorHandler.internalServerError('Failed to fetch reading position');
  }
}

export default withErrorHandling(positionHandler);