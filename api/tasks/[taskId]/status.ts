import { VercelRequest, VercelResponse } from '@vercel/node';
import { TaskQueue } from '../../_lib/queue.js';

/**
 * Task Status API Endpoint
 * 
 * Returns the current status of a background task
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { taskId } = req.query;

    if (!taskId || typeof taskId !== 'string') {
      return res.status(400).json({ error: 'Task ID is required' });
    }

    console.log(`🔍 Checking status for task: ${taskId}`);

    // Authenticate user (basic validation)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization' });
    }

    // Get task status
    const task = await TaskQueue.getTaskStatus(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Return task status with appropriate details
    const response = {
      id: task.id,
      kind: task.kind,
      status: task.status,
      created_at: task.created_at,
      updated_at: task.updated_at,
      ...(task.result && { result: task.result }),
      ...(task.error_code && { error_code: task.error_code })
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('❌ Task status check failed:', error);
    
    return res.status(500).json({
      error: 'Failed to get task status',
      timestamp: new Date().toISOString()
    });
  }
}