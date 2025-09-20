import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  convertVercelRequest,
  authenticateRequestWithSecurity,
  enhancedAuth
} from '../_lib/auth-enhanced';
import { uploadRateLimiter } from '../_lib/rate-limiter';
import { supabaseAdmin } from '../_lib/auth';

// Configuration constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILENAME_LENGTH = 255;
const ALLOWED_FILE_EXTENSIONS = ['.epub'];
const UPLOAD_EXPIRY_SECONDS = 3600; // 1 hour

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Convert Vercel request to standard Request for enhanced auth
  const request = convertVercelRequest(req);

  try {
    // Apply rate limiting first
    const rateLimitResult = await uploadRateLimiter.checkLimit(request);

    if (!rateLimitResult.allowed) {
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', '10');
      res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
      res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime.toString());

      if (rateLimitResult.retryAfter) {
        res.setHeader('Retry-After', rateLimitResult.retryAfter.toString());
      }

      // Log rate limit violation
      await enhancedAuth.logSecurityEvent(
        'upload_rate_limit_exceeded',
        null,
        {
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          endpoint: 'POST /api/upload/signed-url'
        },
        {
          remaining: rateLimitResult.remaining,
          resetTime: rateLimitResult.resetTime
        },
        'medium'
      );

      return res.status(429).json({
        error: 'Too many upload requests',
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

    // Extract and validate request body
    const { fileName, fileSize } = req.body;

    // Enhanced input validation
    const validationErrors = validateUploadInput(fileName, fileSize);
    if (validationErrors.length > 0) {
      // Log input validation failure
      await enhancedAuth.logSecurityEvent(
        'upload_validation_failure',
        user.id,
        {
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          endpoint: 'POST /api/upload/signed-url'
        },
        {
          fileName,
          fileSize,
          errors: validationErrors
        },
        'medium'
      );

      return res.status(400).json({
        error: 'Validation failed',
        details: validationErrors
      });
    }

    // Use admin client for storage operations

    // Generate user-isolated file path
    const timestamp = Date.now();
    const sanitizedFileName = sanitizeFileName(fileName);
    const filePath = `uploads/${user.id}/${timestamp}-${sanitizedFileName}`;

    // Create signed upload URL
    const { data, error } = await supabaseAdmin.storage
      .from('books')
      .createSignedUploadUrl(filePath);

    if (error) {
      console.error('Supabase signed URL error:', error);

      // Log storage error
      await enhancedAuth.logSecurityEvent(
        'upload_storage_error',
        user.id,
        {
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          endpoint: 'POST /api/upload/signed-url'
        },
        {
          fileName: sanitizedFileName,
          fileSize,
          storageError: error.message
        },
        'high'
      );

      return res.status(500).json({ error: 'Failed to create upload URL' });
    }

    // Log successful upload URL generation
    await enhancedAuth.logSecurityEvent(
      'upload_url_generated',
      user.id,
      {
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        endpoint: 'POST /api/upload/signed-url'
      },
      {
        fileName: sanitizedFileName,
        fileSize,
        filePath
      },
      'low'
    );

    // Set rate limit headers for successful response
    res.setHeader('X-RateLimit-Limit', '10');
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime.toString());

    return res.status(200).json({
      uploadUrl: data.signedUrl,
      filePath: filePath,
      maxFileSize: MAX_FILE_SIZE,
      expiresIn: UPLOAD_EXPIRY_SECONDS
    });

  } catch (error) {
    console.error('Signed URL endpoint error:', error);

    // Log critical error
    await enhancedAuth.logSecurityEvent(
      'upload_endpoint_error',
      null,
      {
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        endpoint: 'POST /api/upload/signed-url'
      },
      {
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      'critical'
    );

    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Validate upload input parameters
 */
function validateUploadInput(fileName: any, fileSize: any): string[] {
  const errors: string[] = [];

  // Validate fileName
  if (!fileName || typeof fileName !== 'string') {
    errors.push('fileName is required and must be a string');
  } else {
    if (fileName.length === 0) {
      errors.push('fileName cannot be empty');
    }

    if (fileName.length > MAX_FILENAME_LENGTH) {
      errors.push(`fileName exceeds maximum length of ${MAX_FILENAME_LENGTH} characters`);
    }

    // Check file extension
    const hasValidExtension = ALLOWED_FILE_EXTENSIONS.some(ext =>
      fileName.toLowerCase().endsWith(ext)
    );

    if (!hasValidExtension) {
      errors.push(`Only ${ALLOWED_FILE_EXTENSIONS.join(', ')} files are supported`);
    }

    // Check for path traversal attempts
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      errors.push('fileName contains invalid characters');
    }

    // Check for null bytes and other problematic characters
    if (/[\x00-\x1f\x7f-\x9f]/.test(fileName)) {
      errors.push('fileName contains control characters');
    }
  }

  // Validate fileSize
  if (fileSize === undefined || fileSize === null) {
    errors.push('fileSize is required');
  } else {
    const size = Number(fileSize);

    if (isNaN(size) || size <= 0) {
      errors.push('fileSize must be a positive number');
    }

    if (size > MAX_FILE_SIZE) {
      errors.push(`File size exceeds ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB limit`);
    }
  }

  return errors;
}

/**
 * Sanitize filename to prevent security issues
 */
function sanitizeFileName(fileName: string): string {
  return fileName
    // Remove any path separators and special characters
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    // Remove multiple consecutive underscores
    .replace(/_+/g, '_')
    // Remove leading/trailing underscores and dots
    .replace(/^[_.]+|[_.]+$/g, '')
    // Ensure we have a filename
    || 'upload';
}