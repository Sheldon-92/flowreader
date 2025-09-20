import { withErrorHandling, ApiErrorHandler, createSuccessResponse } from '../_lib/error-handler.js';
import { requireAuth } from '../_lib/auth.js';
import { TaskQueue } from '../_lib/queue.js';

async function taskStatusHandler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return ApiErrorHandler.badRequest('Method not allowed');
  }

  // Extract task ID from URL
  const url = new URL(req.url);
  const taskId = url.pathname.split('/').pop();

  if (!taskId) {
    return ApiErrorHandler.badRequest('Task ID required');
  }

  // Authenticate user
  const user = await requireAuth(req);

  try {
    const task = await TaskQueue.getTaskStatus(taskId, user.id);

    if (!task) {
      return ApiErrorHandler.notFound('Task not found');
    }

    // Format response based on task status
    const response = {
      task_id: task.id,
      status: task.status,
      created_at: task.created_at,
      updated_at: task.updated_at
    };

    // Add result data for completed tasks
    if (task.status === 'completed' && task.result) {
      (response as any).result = task.result;
    }

    // Add error information for failed tasks
    if (task.status === 'failed' && task.error_code) {
      (response as any).error = {
        code: task.error_code,
        message: 'Task processing failed'
      };
    }

    // Add progress estimate for processing tasks
    if (task.status === 'processing') {
      const processingTime = Date.now() - new Date(task.updated_at).getTime();
      (response as any).processing_time_ms = processingTime;
      
      // Estimate progress based on task kind and elapsed time
      let estimatedProgress = 0;
      switch (task.kind) {
        case 'epub_parse':
          estimatedProgress = Math.min(90, (processingTime / 10000) * 100); // 10s estimate
          break;
        case 'tts_generate':
          estimatedProgress = Math.min(95, (processingTime / 20000) * 100); // 20s estimate
          break;
        case 'embedding_create':
          estimatedProgress = Math.min(85, (processingTime / 15000) * 100); // 15s estimate
          break;
      }
      (response as any).estimated_progress = Math.round(estimatedProgress);
    }

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Task status error:', error);
    return ApiErrorHandler.internalServerError('Failed to retrieve task status');
  }
}

export default withErrorHandling(taskStatusHandler);