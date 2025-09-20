/**
 * Background Task Processor Endpoint
 * 
 * This endpoint is called by QStash (or other queue systems) to process
 * background tasks like EPUB parsing, TTS generation, and embedding creation
 */

import { withErrorHandling, ApiErrorHandler, createSuccessResponse } from '../_lib/error-handler.js';
import { TaskProcessor } from '../_lib/queue.js';

async function taskProcessHandler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return ApiErrorHandler.badRequest('Method not allowed');
  }

  try {
    const body = await req.json();
    const { taskId, kind, payload } = body;

    if (!taskId) {
      return ApiErrorHandler.badRequest('Task ID is required');
    }

    console.log(`🔄 Processing task ${taskId} of type ${kind}`);

    // Process the task
    await TaskProcessor.processTask(taskId);

    console.log(`✅ Task ${taskId} processed successfully`);

    return createSuccessResponse({
      task_id: taskId,
      status: 'processed',
      processed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Task processing error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return ApiErrorHandler.internalServerError(
      `Task processing failed: ${errorMessage}`
    );
  }
}

export default withErrorHandling(taskProcessHandler);