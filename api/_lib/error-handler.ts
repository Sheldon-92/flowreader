import { v4 as uuidv4 } from 'uuid';
import type { ApiError } from '@flowreader/shared';

export class ApiErrorHandler {
  static createErrorResponse(
    code: string,
    message: string,
    status: number,
    details?: Record<string, any>,
    retryAfter?: number
  ): Response {
    const errorResponse: { error: ApiError } = {
      error: {
        code,
        message,
        details,
        timestamp: new Date().toISOString(),
        request_id: uuidv4(),
        retry_after: retryAfter
      }
    };

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'X-Request-ID': errorResponse.error.request_id
    };

    if (retryAfter) {
      headers['Retry-After'] = retryAfter.toString();
    }

    return new Response(JSON.stringify(errorResponse), {
      status,
      headers
    });
  }

  static badRequest(message: string, details?: Record<string, any>): Response {
    return this.createErrorResponse('BAD_REQUEST', message, 400, details);
  }

  static unauthorized(message = 'Authentication required'): Response {
    return this.createErrorResponse('UNAUTHORIZED', message, 401);
  }

  static forbidden(message = 'Access denied'): Response {
    return this.createErrorResponse('FORBIDDEN', message, 403);
  }

  static notFound(message = 'Resource not found'): Response {
    return this.createErrorResponse('NOT_FOUND', message, 404);
  }

  static quotaExceeded(message: string, retryAfter: number): Response {
    return this.createErrorResponse('QUOTA_EXCEEDED', message, 429, undefined, retryAfter);
  }

  static rateLimited(message: string, retryAfter: number): Response {
    return this.createErrorResponse('RATE_LIMITED', message, 429, undefined, retryAfter);
  }

  static externalServiceError(service: string, retryAfter = 300): Response {
    return this.createErrorResponse(
      'EXTERNAL_SERVICE_ERROR',
      `${service} is temporarily unavailable`,
      503,
      { service },
      retryAfter
    );
  }

  static internalServerError(message = 'Internal server error'): Response {
    return this.createErrorResponse('INTERNAL_ERROR', message, 500);
  }
}

// Wrapper for API functions with error handling
export function withErrorHandling(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (error) {
      console.error('Unhandled error in API:', error);
      
      if (error instanceof Error) {
        // Check for specific error types
        if (error.message.includes('quota')) {
          return ApiErrorHandler.quotaExceeded('Usage quota exceeded', 3600);
        }
        if (error.message.includes('network') || error.message.includes('timeout')) {
          return ApiErrorHandler.externalServiceError('External API');
        }
        if (error.message.includes('unauthorized')) {
          return ApiErrorHandler.unauthorized();
        }
      }

      return ApiErrorHandler.internalServerError();
    }
  };
}

// Helper to create success response
export function createSuccessResponse<T>(
  data: T,
  status: number = 200,
  meta?: {
    request_id?: string;
    quota?: {
      used: number;
      limit: number;
      reset_date: string;
    };
  }
): Response {
  const response = {
    data,
    meta: {
      request_id: meta?.request_id || uuidv4(),
      timestamp: new Date().toISOString(),
      ...meta
    }
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': response.meta.request_id
    }
  });
}