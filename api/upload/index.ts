import { withErrorHandling, ApiErrorHandler, createSuccessResponse } from '../_lib/error-handler.js';
import { requireAuth } from '../_lib/auth.js';
import { TaskQueue } from '../_lib/queue.js';
import { CONFIG } from '@flowreader/shared';

async function uploadHandler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return ApiErrorHandler.badRequest('Method not allowed');
  }

  // Authenticate user
  const user = await requireAuth(req);

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const idempotencyKey = req.headers.get('idempotency-key');

    if (!file) {
      return ApiErrorHandler.badRequest('No file provided');
    }

    // Validate file size
    if (file.size > CONFIG.MAX_FILE_SIZE) {
      return ApiErrorHandler.badRequest(
        'File too large', 
        { 
          max_size: CONFIG.MAX_FILE_SIZE, 
          provided_size: file.size 
        }
      );
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    const isValidFormat = CONFIG.SUPPORTED_FORMATS.some(format => 
      fileName.endsWith(format)
    );

    if (!isValidFormat) {
      return ApiErrorHandler.badRequest(
        'Unsupported file format',
        {
          supported_formats: CONFIG.SUPPORTED_FORMATS,
          provided_format: fileName.split('.').pop()
        }
      );
    }

    // Create file hash for idempotency
    const fileBuffer = await file.arrayBuffer();
    const fileHash = await crypto.subtle.digest('SHA-256', fileBuffer);
    const hashHex = Array.from(new Uint8Array(fileHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const defaultIdempotencyKey = `upload-${user.id}-${hashHex}`;
    const finalIdempotencyKey = idempotencyKey || defaultIdempotencyKey;

    // Create upload task
    const { task_id, existing } = await TaskQueue.createTask(
      'epub_parse',
      {
        user_id: user.id,
        file_name: file.name,
        file_size: file.size,
        file_hash: hashHex,
        file_data: Array.from(new Uint8Array(fileBuffer)) // TODO: Store in proper file storage
      },
      finalIdempotencyKey
    );

    const response = {
      task_id,
      message: existing ? 'File already uploaded' : 'Upload initiated',
      estimated_duration: Math.ceil(file.size / 1024 / 1024) * 2 // 2s per MB estimate
    };

    return createSuccessResponse(response, existing ? 200 : 202);

  } catch (error) {
    console.error('Upload error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Authentication')) {
        return ApiErrorHandler.unauthorized();
      }
      if (error.message.includes('File too large')) {
        return ApiErrorHandler.badRequest('File exceeds maximum size limit');
      }
    }
    
    return ApiErrorHandler.internalServerError('Upload failed');
  }
}

export default withErrorHandling(uploadHandler);