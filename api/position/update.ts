import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  convertVercelRequest,
  authenticateRequestWithSecurity,
  enhancedAuth
} from '../_lib/auth-enhanced';
import { apiRateLimiter } from '../_lib/rate-limiter';
import { supabaseAdmin } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Convert Vercel request to standard Request for enhanced auth
  const request = convertVercelRequest(req);

  try {
    // Apply rate limiting first
    const rateLimitResult = await apiRateLimiter.checkLimit(request);

    if (!rateLimitResult.allowed) {
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', '100');
      res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
      res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime.toString());

      if (rateLimitResult.retryAfter) {
        res.setHeader('Retry-After', rateLimitResult.retryAfter.toString());
      }

      // Log rate limit violation
      await enhancedAuth.logSecurityEvent(
        'position_rate_limit_exceeded',
        null,
        {
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          endpoint: 'POST /api/position/update'
        },
        {
          remaining: rateLimitResult.remaining,
          resetTime: rateLimitResult.resetTime
        },
        'medium'
      );

      return res.status(429).json({
        error: 'Too many position update requests',
        retryAfter: rateLimitResult.retryAfter
      });
    }

    // Enhanced authentication with security logging
    const authResult = await authenticateRequestWithSecurity(request);

    if (!authResult.user) {
      return res.status(401).json({
        error: authResult.error || 'Authentication required'
      });
    }

    const user = authResult.user;

    // Extract and validate request body - NEVER trust client-provided userId
    const { bookId, chapterIdx, cfiPosition, percentage } = req.body;
    const userId = user.id; // Always use authenticated user ID from token

    // Enhanced input validation
    const validationErrors = validatePositionUpdate(bookId, chapterIdx, cfiPosition, percentage);
    if (validationErrors.length > 0) {
      // Log input validation failure
      await enhancedAuth.logSecurityEvent(
        'position_validation_failure',
        user.id,
        {
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          endpoint: 'POST /api/position/update'
        },
        {
          bookId,
          chapterIdx,
          cfiPosition: cfiPosition?.substring(0, 50), // Truncate for logging
          percentage,
          errors: validationErrors
        },
        'medium'
      );

      return res.status(400).json({
        error: 'Validation failed',
        details: validationErrors
      });
    }

    // Verify book ownership before updating position
    const { data: bookOwnership, error: ownershipError } = await supabaseAdmin
      .from('books')
      .select('owner_id')
      .eq('id', bookId)
      .eq('owner_id', userId)
      .single();

    if (ownershipError || !bookOwnership) {
      // Log unauthorized access attempt
      await enhancedAuth.logSecurityEvent(
        'position_unauthorized_access',
        user.id,
        {
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          endpoint: 'POST /api/position/update'
        },
        {
          bookId,
          userId: user.id,
          ownershipError: ownershipError?.message || 'Book not found'
        },
        'high'
      );

      return res.status(403).json({
        error: 'Access denied - book not found or not owned by user'
      });
    }

    // Call stored procedure to update reading position with RLS enforcement
    const { data, error } = await supabaseAdmin.rpc('update_reading_position', {
      p_user_id: userId,
      p_book_id: bookId,
      p_chapter_idx: chapterIdx,
      p_cfi_position: cfiPosition || '',
      p_percentage: Math.min(100, Math.max(0, percentage))
    });

    if (error) {
      console.error('Reading position update error:', error);

      // Log database error
      await enhancedAuth.logSecurityEvent(
        'position_update_db_error',
        user.id,
        {
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          endpoint: 'POST /api/position/update'
        },
        {
          bookId,
          userId: user.id,
          dbError: error.message
        },
        'high'
      );

      return res.status(500).json({ error: 'Failed to update position' });
    }

    // Log successful position update
    await enhancedAuth.logSecurityEvent(
      'position_update_success',
      user.id,
      {
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        endpoint: 'POST /api/position/update'
      },
      {
        bookId,
        chapterIdx,
        percentage: Math.min(100, Math.max(0, percentage))
      },
      'low'
    );

    // Set rate limit headers for successful response
    res.setHeader('X-RateLimit-Limit', '100');
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime.toString());

    return res.status(200).json({
      success: true,
      position: {
        bookId,
        chapterIdx,
        percentage: Math.min(100, Math.max(0, percentage)),
        updatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Position update endpoint error:', error);

    // Log critical error
    await enhancedAuth.logSecurityEvent(
      'position_endpoint_error',
      null,
      {
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        endpoint: 'POST /api/position/update'
      },
      {
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      'critical'
    );

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Authentication required') || error.message.includes('Invalid token')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      if (error.message.includes('Rate limit')) {
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: (error as any).rateLimitInfo?.retryAfter
        });
      }
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Validate position update input parameters
 */
function validatePositionUpdate(
  bookId: any,
  chapterIdx: any,
  cfiPosition: any,
  percentage: any
): string[] {
  const errors: string[] = [];

  // Validate bookId
  if (!bookId || typeof bookId !== 'string') {
    errors.push('bookId is required and must be a string');
  } else {
    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(bookId)) {
      errors.push('bookId must be a valid UUID');
    }
  }

  // Validate chapterIdx
  if (chapterIdx === undefined || chapterIdx === null) {
    errors.push('chapterIdx is required');
  } else {
    const idx = Number(chapterIdx);
    if (isNaN(idx) || idx < 0 || !Number.isInteger(idx)) {
      errors.push('chapterIdx must be a non-negative integer');
    }
  }

  // Validate percentage
  if (percentage === undefined || percentage === null) {
    errors.push('percentage is required');
  } else {
    const pct = Number(percentage);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      errors.push('percentage must be a number between 0 and 100');
    }
  }

  // Validate cfiPosition (optional but if provided, should be a string)
  if (cfiPosition !== undefined && cfiPosition !== null && typeof cfiPosition !== 'string') {
    errors.push('cfiPosition must be a string if provided');
  }

  // Check for potential XSS or injection attempts
  if (typeof cfiPosition === 'string' && cfiPosition.length > 1000) {
    errors.push('cfiPosition exceeds maximum length of 1000 characters');
  }

  return errors;
}