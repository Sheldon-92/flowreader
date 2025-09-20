import { withErrorHandling, ApiErrorHandler, createSuccessResponse } from '../_lib/error-handler.js';
import { requireAuth, supabaseAdmin } from '../_lib/auth.js';

async function libraryHandler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return ApiErrorHandler.badRequest('Method not allowed');
  }

  // Authenticate user
  const user = await requireAuth(req);

  try {
    const url = new URL(req.url);
    const cursor = url.searchParams.get('cursor');
    const query = url.searchParams.get('query');
    const sort = url.searchParams.get('sort') || 'updated_at';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

    let booksQuery = supabaseAdmin
      .from('books')
      .select(`
        id,
        title,
        author,
        reading_progress,
        upload_date,
        metadata,
        namespace
      `)
      .or(`owner_id.eq.${user.id},namespace.eq.public`)
      .order(sort, { ascending: false })
      .limit(limit + 1); // +1 to check if there are more results

    // Apply cursor pagination
    if (cursor) {
      booksQuery = booksQuery.lt('upload_date', cursor);
    }

    // Apply search filter
    if (query) {
      booksQuery = booksQuery.or(
        `title.ilike.%${query}%,author.ilike.%${query}%`
      );
    }

    const { data: books, error } = await booksQuery;

    if (error) {
      throw error;
    }

    // Check if there are more results
    const hasMore = books.length > limit;
    const items = hasMore ? books.slice(0, limit) : books;

    // Format response
    const response = {
      items: items.map(book => ({
        book_id: book.id,
        title: book.title,
        author: book.author,
        progress: book.reading_progress?.percentage || 0,
        last_read_at: book.reading_progress?.last_read || null,
        cover_url: book.metadata?.cover_url || null,
        namespace: book.namespace,
        word_count: book.metadata?.word_count || null,
        estimated_reading_time: book.metadata?.estimated_reading_time || null
      })),
      next_cursor: hasMore ? items[items.length - 1].upload_date : null,
      total_displayed: items.length,
      has_more: hasMore
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Library fetch error:', error);
    return ApiErrorHandler.internalServerError('Failed to fetch library');
  }
}

export default withErrorHandling(libraryHandler);