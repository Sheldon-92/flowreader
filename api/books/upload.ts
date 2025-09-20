import { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';
import { TaskQueue } from '../_lib/queue.js';
import { EPUBProcessor } from '../_lib/epub-processor.js';
import { supabaseAdmin } from '../_lib/auth.js';
import { convertVercelRequest, requireAuthWithSecurity } from '../_lib/auth-enhanced';
import { uploadRateLimiter } from '../_lib/rate-limiter';
import { inputValidator } from '../_lib/input-validator';

interface UploadRequest {
  fileName: string;
  fileSize: number;
  fileData: number[]; // Array representation of buffer
  // userId removed - now extracted from JWT token for security
}

/**
 * EPUB Upload API Endpoint
 * 
 * Handles EPUB file uploads and initiates processing pipeline.
 * For large files, creates background task. For small files, processes immediately.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📚 EPUB upload request received');

    // Convert to standard Request for enhanced auth
    const request = convertVercelRequest(req);

    // Enhanced Authentication with rate limiting
    const user = await requireAuthWithSecurity(request);

    // Upload-specific rate limiting
    const rateLimitResult = await uploadRateLimiter.checkLimit(request);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: 'Upload rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter
      });
    }

    // Validate request body - userId now comes from authenticated user
    const { fileName, fileSize, fileData } = req.body;
    const userId = user.id; // Always use authenticated user ID

    if (!fileName || !fileSize || !fileData) {
      return res.status(400).json({ error: 'Missing required fields: fileName, fileSize, fileData' });
    }

    // Input validation for file upload
    const validationResult = inputValidator.validateSignedUrlRequest({
      fileName,
      fileSize
    });

    if (!validationResult.valid) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validationResult.errors
      });
    }

    // Convert array back to Buffer
    const fileBuffer = Buffer.from(fileData);
    const fileHash = createHash('sha256').update(fileBuffer).digest('hex');

    console.log(`📋 Upload details: ${fileName} (${fileSize} bytes, hash: ${fileHash.substring(0, 8)}...)`);

    // Check for duplicate uploads
    const { data: existingBook } = await supabaseAdmin
      .from('books')
      .select('id, title')
      .eq('owner_id', userId)
      .eq('metadata->>file_hash', fileHash)
      .single();

    if (existingBook) {
      console.log('📚 Duplicate book detected, returning existing book');
      return res.status(200).json({
        success: true,
        duplicate: true,
        bookId: existingBook.id,
        message: `"${existingBook.title}" is already in your library`
      });
    }

    // Decide processing strategy based on file size
    const IMMEDIATE_PROCESSING_LIMIT = 5 * 1024 * 1024; // 5MB

    if (fileSize <= IMMEDIATE_PROCESSING_LIMIT) {
      console.log('🚀 Processing small file immediately');
      
      // Process immediately for small files
      const processor = new EPUBProcessor();
      const result = await processor.processUploadedEPUB(fileBuffer, fileName, userId);

      return res.status(200).json({
        success: true,
        immediate: true,
        bookId: result.book.id,
        bookTitle: result.book.title,
        bookAuthor: result.book.author,
        chaptersCount: result.chaptersCount,
        processingStats: result.processingStats
      });

    } else {
      console.log('⏳ Queuing large file for background processing');

      // Queue for background processing for large files
      const idempotencyKey = `epub-upload-${userId}-${fileHash}`;
      
      const taskResult = await TaskQueue.createTask(
        'epub_parse',
        {
          user_id: userId,
          file_name: fileName,
          file_size: fileSize,
          file_data: Array.from(fileBuffer), // Store as array for JSON serialization
          file_hash: fileHash
        },
        idempotencyKey
      );

      if (taskResult.existing) {
        console.log('⚡ Existing task found, returning task ID');
        return res.status(200).json({
          success: true,
          taskId: taskResult.task_id,
          existing: true,
          message: 'Processing already in progress'
        });
      }

      return res.status(202).json({
        success: true,
        taskId: taskResult.task_id,
        message: 'File queued for processing',
        estimatedTime: 'Processing will complete in 2-5 minutes'
      });
    }

  } catch (error) {
    console.error('❌ EPUB upload failed:', error);

    // Handle authentication errors first
    if (error instanceof Error) {
      if (error.message.includes('Authentication required') || error.message.includes('Invalid token')) {
        return res.status(401).json({
          error: 'Authentication required',
          timestamp: new Date().toISOString()
        });
      }
      if (error.message.includes('Rate limit')) {
        return res.status(429).json({
          error: 'Upload rate limit exceeded',
          retryAfter: (error as any).rateLimitInfo?.retryAfter,
          timestamp: new Date().toISOString()
        });
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = errorMessage.includes('not found') ? 404
                     : errorMessage.includes('duplicate') ? 409
                     : errorMessage.includes('quota') ? 429
                     : 500;

    return res.status(statusCode).json({
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
}