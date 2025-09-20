import { withErrorHandling, ApiErrorHandler, createSuccessResponse } from '../_lib/error-handler.js';
import { requireAuthWithSecurity } from '../_lib/auth-enhanced.js';
import { withRateLimit, apiRateLimiter } from '../_lib/rate-limiter.js';
import { inputValidator } from '../_lib/input-validator.js';
import { supabaseAdmin } from '../_lib/auth.js';

interface DialogMessage {
  id: string;
  userId: string;
  bookId: string;
  role: 'user' | 'assistant';
  content: string;
  intent?: 'translate' | 'explain' | 'analyze' | 'ask' | 'enhance';
  selection?: {
    text: string;
    start?: number;
    end?: number;
    chapterId?: string;
  };
  targetLang?: string;
  metrics?: {
    tokens: number;
    cost: number;
  };
  createdAt: string;
}

interface PaginationResponse {
  hasMore: boolean;
  nextCursor?: string;
  totalEstimate?: number;
}

interface DialogHistoryResponse {
  messages: DialogMessage[];
  pagination: PaginationResponse;
}

// Cursor utilities for pagination
function encodeCursor(timestamp: string): string {
  return Buffer.from(timestamp).toString('base64');
}

function decodeCursor(cursor: string): string {
  try {
    return Buffer.from(cursor, 'base64').toString('utf-8');
  } catch (error) {
    throw new Error('Invalid cursor format');
  }
}

async function dialogHistoryHandler(req: Request): Promise<Response> {
  const user = await requireAuthWithSecurity(req);

  if (req.method === 'GET') {
    return await handleGetHistory(req, user);
  } else if (req.method === 'POST') {
    return await handleSaveMessages(req, user);
  } else {
    return ApiErrorHandler.createErrorResponse(
      'METHOD_NOT_ALLOWED',
      'Method not allowed',
      405
    );
  }
}

async function handleGetHistory(req: Request, user: { id: string; email: string }): Promise<Response> {
  try {
    const url = new URL(req.url);
    const bookId = url.searchParams.get('bookId');
    const limitParam = url.searchParams.get('limit');
    const cursor = url.searchParams.get('cursor');
    const intent = url.searchParams.get('intent');
    const role = url.searchParams.get('role');

    // Validate required parameters
    if (!bookId) {
      return ApiErrorHandler.badRequest('Missing required parameter: bookId');
    }

    // Validate bookId format
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(bookId)) {
      return ApiErrorHandler.badRequest('Invalid bookId format. Must be a valid UUID');
    }

    // Validate and sanitize limit
    let limit = 20; // default
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return ApiErrorHandler.badRequest('Limit must be between 1 and 100');
      }
      limit = parsedLimit;
    }

    // Validate optional filters
    if (intent && !['translate', 'explain', 'analyze', 'ask', 'enhance'].includes(intent)) {
      return ApiErrorHandler.createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid parameter format',
        422,
        {
          errors: [{
            parameter: 'intent',
            value: intent,
            message: 'Must be one of: translate, explain, analyze, ask, enhance'
          }]
        }
      );
    }

    if (role && !['user', 'assistant'].includes(role)) {
      return ApiErrorHandler.createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid parameter format',
        422,
        {
          errors: [{
            parameter: 'role',
            value: role,
            message: 'Must be \'user\' or \'assistant\''
          }]
        }
      );
    }

    // Verify user has access to this book
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('id, owner_id')
      .eq('id', bookId)
      .eq('owner_id', user.id)
      .single();

    if (bookError || !book) {
      return ApiErrorHandler.createErrorResponse(
        'FORBIDDEN',
        'Access denied to book or dialog history',
        403,
        {
          bookId,
          reason: 'not_owner'
        }
      );
    }

    // Build query
    let query = supabaseAdmin
      .from('dialog_messages')
      .select('*')
      .eq('user_id', user.id)
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })
      .limit(limit + 1); // Fetch one extra to determine if there are more

    // Apply optional filters
    if (intent) {
      query = query.eq('intent', intent);
    }
    if (role) {
      query = query.eq('role', role);
    }

    // Apply cursor-based pagination
    if (cursor) {
      const timestamp = decodeCursor(cursor);
      query = query.lt('created_at', timestamp);
    }

    const { data: messagesData, error: messagesError } = await query;

    if (messagesError) {
      console.error('Failed to fetch dialog messages:', messagesError);
      return ApiErrorHandler.internalServerError('Failed to fetch dialog history');
    }

    const messages = messagesData || [];
    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    // Transform database records to API schema
    const transformedMessages: DialogMessage[] = items.map(msg => ({
      id: msg.id,
      userId: msg.user_id,
      bookId: msg.book_id,
      role: msg.role,
      content: msg.content,
      intent: msg.intent || undefined,
      selection: msg.selection || undefined,
      targetLang: msg.target_lang || undefined,
      metrics: msg.metrics || undefined,
      createdAt: msg.created_at
    }));

    // Get total estimate for pagination with applied filters
    let countQuery = supabaseAdmin
      .from('dialog_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('book_id', bookId);

    if (intent) {
      countQuery = countQuery.eq('intent', intent);
    }
    if (role) {
      countQuery = countQuery.eq('role', role);
    }

    const { count: totalCount } = await countQuery;

    const response: DialogHistoryResponse = {
      messages: transformedMessages,
      pagination: {
        hasMore,
        nextCursor: hasMore ? encodeCursor(items[items.length - 1].created_at) : undefined,
        totalEstimate: totalCount || undefined
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Dialog history retrieval error:', error);
    if (error instanceof Error && error.message === 'Invalid cursor format') {
      return ApiErrorHandler.badRequest('Invalid cursor format');
    }
    return ApiErrorHandler.internalServerError('Failed to fetch dialog history');
  }
}

async function handleSaveMessages(req: Request, user: { id: string; email: string }): Promise<Response> {
  try {
    const body = await req.json();

    // Validate request body structure
    if (!body || typeof body !== 'object') {
      return ApiErrorHandler.badRequest('Invalid request body');
    }

    if (!Array.isArray(body.messages)) {
      return ApiErrorHandler.badRequest('Messages must be a non-empty array');
    }

    if (body.messages.length === 0 || body.messages.length > 10) {
      return ApiErrorHandler.badRequest('Must provide 1-10 messages per request');
    }

    // Validate each message
    const validationErrors: any[] = [];
    const validatedMessages: any[] = [];

    for (let i = 0; i < body.messages.length; i++) {
      const message = body.messages[i];
      const messageIndex = i;

      // Basic field validation
      if (!message.bookId) {
        validationErrors.push({
          messageIndex,
          field: 'bookId',
          message: 'bookId is required'
        });
        continue;
      }

      if (!message.role || !['user', 'assistant'].includes(message.role)) {
        validationErrors.push({
          messageIndex,
          field: 'role',
          value: message.role,
          message: 'Must be \'user\' or \'assistant\''
        });
        continue;
      }

      if (!message.content || typeof message.content !== 'string' || message.content.trim().length === 0) {
        validationErrors.push({
          messageIndex,
          field: 'content',
          message: 'Content cannot be empty'
        });
        continue;
      }

      if (message.content.length > 10000) {
        validationErrors.push({
          messageIndex,
          field: 'content',
          message: 'Content must be 10,000 characters or less'
        });
        continue;
      }

      // Validate UUID format for bookId
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(message.bookId)) {
        validationErrors.push({
          messageIndex,
          field: 'bookId',
          value: message.bookId,
          message: 'Must be a valid UUID'
        });
        continue;
      }

      // Validate optional fields
      if (message.intent && !['translate', 'explain', 'analyze', 'ask', 'enhance'].includes(message.intent)) {
        validationErrors.push({
          messageIndex,
          field: 'intent',
          value: message.intent,
          message: 'Must be one of: translate, explain, analyze, ask, enhance'
        });
        continue;
      }

      if (message.selection) {
        if (typeof message.selection !== 'object') {
          validationErrors.push({
            messageIndex,
            field: 'selection',
            message: 'Selection must be an object'
          });
          continue;
        }

        if (message.selection.text && message.selection.text.length > 1000) {
          validationErrors.push({
            messageIndex,
            field: 'selection.text',
            message: 'Selection text must be 1000 characters or less'
          });
          continue;
        }

        if (message.selection.chapterId && !uuidPattern.test(message.selection.chapterId)) {
          validationErrors.push({
            messageIndex,
            field: 'selection.chapterId',
            value: message.selection.chapterId,
            message: 'Must be a valid UUID'
          });
          continue;
        }
      }

      if (message.targetLang && !/^[a-z]{2}(-[A-Z]{2})?$/.test(message.targetLang)) {
        validationErrors.push({
          messageIndex,
          field: 'targetLang',
          value: message.targetLang,
          message: 'Must be in ISO 639-1 format (e.g., \'en\', \'es-ES\')'
        });
        continue;
      }

      if (message.metrics) {
        if (typeof message.metrics !== 'object') {
          validationErrors.push({
            messageIndex,
            field: 'metrics',
            message: 'Metrics must be an object'
          });
          continue;
        }

        if (message.metrics.tokens !== undefined && (typeof message.metrics.tokens !== 'number' || message.metrics.tokens < 0)) {
          validationErrors.push({
            messageIndex,
            field: 'metrics.tokens',
            value: message.metrics.tokens,
            message: 'Must be a non-negative number'
          });
          continue;
        }

        if (message.metrics.cost !== undefined && (typeof message.metrics.cost !== 'number' || message.metrics.cost < 0)) {
          validationErrors.push({
            messageIndex,
            field: 'metrics.cost',
            value: message.metrics.cost,
            message: 'Must be a non-negative number'
          });
          continue;
        }
      }

      // Verify user has access to this book
      const { data: book, error: bookError } = await supabaseAdmin
        .from('books')
        .select('id, owner_id')
        .eq('id', message.bookId)
        .eq('owner_id', user.id)
        .single();

      if (bookError || !book) {
        validationErrors.push({
          messageIndex,
          field: 'bookId',
          value: message.bookId,
          message: 'Book not found or access denied'
        });
        continue;
      }

      validatedMessages.push({
        user_id: user.id,
        book_id: message.bookId,
        role: message.role,
        content: message.content.trim(),
        intent: message.intent || null,
        selection: message.selection || null,
        target_lang: message.targetLang || null,
        metrics: message.metrics || null
      });
    }

    if (validationErrors.length > 0) {
      return ApiErrorHandler.createErrorResponse(
        'VALIDATION_ERROR',
        'Message validation failed',
        422,
        { errors: validationErrors }
      );
    }

    // Insert messages
    const { data: insertedMessages, error: insertError } = await supabaseAdmin
      .from('dialog_messages')
      .insert(validatedMessages)
      .select('id, created_at');

    if (insertError) {
      console.error('Failed to save dialog messages:', insertError);
      return ApiErrorHandler.internalServerError('Failed to save messages');
    }

    const response = {
      saved: insertedMessages?.map(msg => ({
        id: msg.id,
        createdAt: msg.created_at
      })) || [],
      count: insertedMessages?.length || 0
    };

    return createSuccessResponse(response, 201);

  } catch (error) {
    console.error('Dialog message save error:', error);
    if (error instanceof Error && error.message.includes('JSON')) {
      return ApiErrorHandler.badRequest('Invalid JSON in request body');
    }
    return ApiErrorHandler.internalServerError('Failed to save messages');
  }
}

// Apply rate limiting and error handling
export default withErrorHandling(
  withRateLimit(apiRateLimiter)(dialogHistoryHandler)
);