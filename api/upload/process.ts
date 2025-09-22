import { VercelRequest, VercelResponse } from '@vercel/node';
import { convertVercelRequest, authenticateRequestWithSecurity, enhancedAuth } from '../_lib/auth-enhanced';
import { uploadRateLimiter, withRateLimit } from '../_lib/rate-limiter';
import { supabaseAdmin } from '../_lib/auth';
import { EPUBProcessor } from '../_lib/epub-processor';
import * as path from 'path';

// Main handler with rate limiting applied first
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Convert to standard Request for enhanced auth and rate limiting
    const request = convertVercelRequest(req);

    // Apply upload-specific rate limiting first
    const rateLimitResult = await uploadRateLimiter.checkLimit(request);
    if (!rateLimitResult.allowed) {
      // Log rate limit violation
      await enhancedAuth.logSecurityEvent(
        'rate_limit_exceeded',
        null,
        enhancedAuth['extractSecurityContext'](request),
        {
          endpoint: 'upload/process',
          remaining: rateLimitResult.remaining,
          resetTime: rateLimitResult.resetTime,
          retryAfter: rateLimitResult.retryAfter
        },
        'high'
      );

      return res.status(429).json({
        error: 'Upload rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter,
        message: 'Too many file uploads. Please wait before uploading again.',
        resetTime: rateLimitResult.resetTime
      });
    }

    // Delegate to main processing function
    return await processHandler(req, res);

  } catch (error) {
    console.error('Handler wrapper error:', error);
    return res.status(500).json({
      error: 'Service temporarily unavailable',
      message: 'Please try again later'
    });
  }
}

// Main processing logic with enhanced security
async function processHandler(req: VercelRequest, res: VercelResponse) {
  try {
    // Convert to standard Request for enhanced auth
    const request = convertVercelRequest(req);

    // Enhanced Authentication with security features
    const authResult = await authenticateRequestWithSecurity(request);

    if (!authResult.user) {
      // Log authentication failure
      await enhancedAuth.logSecurityEvent(
        'auth_failure_upload',
        null,
        enhancedAuth['extractSecurityContext'](request),
        { endpoint: 'upload/process', reason: authResult.error },
        'high'
      );

      return res.status(401).json({
        error: 'Authentication required',
        message: 'Valid authentication token required for file processing'
      });
    }

    const user = authResult.user;

    // Input validation - NEVER trust client-provided userId
    const { filePath, fileName } = req.body;
    const userId = user.id; // Always use authenticated user ID from token

    if (!filePath || !fileName) {
      await enhancedAuth.logSecurityEvent(
        'validation_failure',
        userId,
        enhancedAuth['extractSecurityContext'](request),
        { endpoint: 'upload/process', reason: 'missing_required_fields', filePath: !!filePath, fileName: !!fileName },
        'medium'
      );
      return res.status(400).json({ error: 'Missing required fields: filePath, fileName' });
    }

    // Enhanced path validation - ensure filePath is within user's namespace
    if (!validateUserFilePath(filePath, userId)) {
      await enhancedAuth.logSecurityEvent(
        'path_traversal_attempt',
        userId,
        enhancedAuth['extractSecurityContext'](request),
        { endpoint: 'upload/process', filePath, userId, reason: 'invalid_namespace' },
        'critical'
      );
      return res.status(403).json({
        error: 'Access denied - file path must be within your user directory',
        message: 'Files must be located in your designated upload directory'
      });
    }

    // Enhanced filename validation - prevent dangerous characters
    if (!validateFileName(fileName)) {
      await enhancedAuth.logSecurityEvent(
        'filename_validation_failure',
        userId,
        enhancedAuth['extractSecurityContext'](request),
        { endpoint: 'upload/process', fileName, reason: 'dangerous_characters' },
        'high'
      );
      return res.status(400).json({
        error: 'Invalid filename',
        message: 'Filename contains invalid characters. Only alphanumeric, hyphens, underscores, and dots are allowed.'
      });
    }

    // Validate file type with enhanced checks
    if (!validateFileType(fileName)) {
      await enhancedAuth.logSecurityEvent(
        'filetype_validation_failure',
        userId,
        enhancedAuth['extractSecurityContext'](request),
        { endpoint: 'upload/process', fileName, reason: 'unsupported_type' },
        'medium'
      );
      return res.status(400).json({
        error: 'Unsupported file type',
        message: 'Only EPUB files are supported for processing'
      });
    }

    // Download file from storage with ownership verification
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('books')
      .download(filePath);

    if (downloadError) {
      await enhancedAuth.logSecurityEvent(
        'file_access_failure',
        userId,
        enhancedAuth['extractSecurityContext'](request),
        { endpoint: 'upload/process', filePath, error: downloadError.message },
        'medium'
      );
      return res.status(404).json({
        error: 'File not found',
        message: 'The specified file could not be found or you do not have access to it'
      });
    }

    // Validate file size constraints
    const fileBuffer = await fileData.arrayBuffer();
    const fileSize = fileBuffer.byteLength;

    if (!validateFileSize(fileSize)) {
      await enhancedAuth.logSecurityEvent(
        'file_size_violation',
        userId,
        enhancedAuth['extractSecurityContext'](request),
        { endpoint: 'upload/process', filePath, fileSize, maxSize: getMaxFileSize() },
        'medium'
      );
      return res.status(413).json({
        error: 'File too large',
        message: `File size (${Math.round(fileSize / 1024 / 1024)}MB) exceeds the maximum allowed size of ${Math.round(getMaxFileSize() / 1024 / 1024)}MB`
      });
    }

    // Check if book already exists (idempotency check)
    const { data: existingBook } = await supabaseAdmin
      .from('books')
      .select('id, processed')
      .eq('owner_id', userId)
      .eq('file_path', filePath)
      .single();

    if (existingBook && existingBook.processed) {
      // Book already processed, return existing data
      await enhancedAuth.logSecurityEvent(
        'file_already_processed',
        userId,
        enhancedAuth['extractSecurityContext'](request),
        { endpoint: 'upload/process', filePath, bookId: existingBook.id },
        'low'
      );

      const { data: chapters } = await supabaseAdmin
        .from('chapters')
        .select('id')
        .eq('book_id', existingBook.id);

      return res.status(200).json({
        message: 'Book already processed',
        bookId: existingBook.id,
        chaptersCount: chapters?.length || 0
      });
    }

    // Process EPUB file with real parser
    const timestamp = Date.now();

    // Log successful file processing start
    await enhancedAuth.logSecurityEvent(
      'file_processing_started',
      userId,
      enhancedAuth['extractSecurityContext'](request),
      { endpoint: 'upload/process', filePath, fileName, fileSize },
      'low'
    );

    try {
      // Use real EPUB processor
      const processor = new EPUBProcessor();
      const fileBufferData = Buffer.from(fileBuffer);

      const processingResult = await processor.processUploadedEPUB(
        fileBufferData,
        fileName,
        userId
      );

      // Update the file path in the book record if needed
      if (processingResult.book.file_path !== filePath) {
        await supabaseAdmin
          .from('books')
          .update({ file_path: filePath })
          .eq('id', processingResult.book.id);
      }

      // Mark book as processed
      await supabaseAdmin
        .from('books')
        .update({ processed: true })
        .eq('id', processingResult.book.id);

      // Log successful processing
      await enhancedAuth.logSecurityEvent(
        'file_processing_completed',
        userId,
        enhancedAuth['extractSecurityContext'](request),
        {
          endpoint: 'upload/process',
          bookId: processingResult.book.id,
          filePath,
          fileName,
          chaptersCount: processingResult.chaptersCount,
          processingTime: processingResult.processingStats.processingTime,
          wordCount: processingResult.processingStats.wordCount
        },
        'low'
      );

      return res.status(200).json({
        success: true,
        book: {
          id: processingResult.book.id,
          title: processingResult.book.title,
          author: processingResult.book.author,
          chaptersCount: processingResult.chaptersCount,
          processingTime: Date.now() - timestamp
        },
        stats: processingResult.processingStats
      });

    } catch (processingError) {
      // Log processing error
      await enhancedAuth.logSecurityEvent(
        'file_processing_error',
        userId,
        enhancedAuth['extractSecurityContext'](request),
        {
          endpoint: 'upload/process',
          filePath,
          fileName,
          error: processingError instanceof Error ? processingError.message : 'Unknown error'
        },
        'high'
      );

      return res.status(500).json({
        error: 'File processing failed',
        message: processingError instanceof Error ? processingError.message : 'An error occurred while processing the EPUB file'
      });
    }

  } catch (error) {
    console.error('Process endpoint error:', error);

    // Convert request for logging (if not already done)
    let request;
    try {
      request = convertVercelRequest(req);
    } catch {
      // If conversion fails, create minimal context
      request = null;
    }

    // Log critical error with context
    if (request) {
      await enhancedAuth.logSecurityEvent(
        'endpoint_error',
        null, // May not have user context in error cases
        enhancedAuth['extractSecurityContext'](request),
        {
          endpoint: 'upload/process',
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        },
        'critical'
      );
    }

    // Handle specific error types with proper status codes
    if (error instanceof Error) {
      if (error.message.includes('Authentication required') || error.message.includes('Invalid token')) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Valid authentication token required'
        });
      }
      if (error.message.includes('Rate limit')) {
        return res.status(429).json({
          error: 'Upload rate limit exceeded',
          retryAfter: (error as any).rateLimitInfo?.retryAfter,
          message: 'Too many requests. Please wait before trying again.'
        });
      }
      if (error.message.includes('File not found')) {
        return res.status(404).json({
          error: 'File not found or access denied',
          message: 'The specified file could not be found or you do not have access to it'
        });
      }
      if (error.message.includes('Access denied')) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have permission to access this resource'
        });
      }
    }

    return res.status(500).json({
      error: 'Processing failed',
      message: 'An unexpected error occurred while processing the file'
    });
  }
}

// Helper functions for enhanced validation
function validateUserFilePath(filePath: string, userId: string): boolean {
  // Normalize the path to prevent traversal attempts
  const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');

  // Check for path traversal attempts
  if (normalizedPath.includes('../') || normalizedPath.includes('..\\')) {
    return false;
  }

  // Ensure the path starts with uploads/<userId>/
  const expectedPrefix = `uploads/${userId}/`;
  if (!normalizedPath.startsWith(expectedPrefix)) {
    return false;
  }

  // Ensure no absolute paths or suspicious patterns
  if (normalizedPath.startsWith('/') || normalizedPath.includes('://')) {
    return false;
  }

  return true;
}

function validateFileName(fileName: string): boolean {
  // Check for null, undefined, or empty string
  if (!fileName || typeof fileName !== 'string') {
    return false;
  }

  // Check length constraints
  if (fileName.length < 1 || fileName.length > 255) {
    return false;
  }

  // Check for dangerous characters - only allow alphanumeric, hyphens, underscores, dots
  const dangerousChars = /[^a-zA-Z0-9._-]/;
  if (dangerousChars.test(fileName)) {
    return false;
  }

  // Check for path traversal attempts
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return false;
  }

  // Check for control characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f-\x9f]/.test(fileName)) {
    return false;
  }

  // Ensure it doesn't start or end with dots (hidden files, relative paths)
  if (fileName.startsWith('.') || fileName.endsWith('.')) {
    return false;
  }

  return true;
}

function validateFileType(fileName: string): boolean {
  if (!fileName || typeof fileName !== 'string') {
    return false;
  }

  // Convert to lowercase for case-insensitive comparison
  const lowerFileName = fileName.toLowerCase();

  // Only allow EPUB files
  return lowerFileName.endsWith('.epub');
}

function validateFileSize(fileSize: number): boolean {
  const maxSize = getMaxFileSize();
  return fileSize > 0 && fileSize <= maxSize;
}

function getMaxFileSize(): number {
  // 50MB maximum file size for EPUB files
  return 50 * 1024 * 1024;
}