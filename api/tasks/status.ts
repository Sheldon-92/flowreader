import { VercelRequest, VercelResponse } from '@vercel/node';
import { convertVercelRequest, authenticateRequestWithSecurity, enhancedAuth } from '../_lib/auth-enhanced';
import { withRateLimit, apiRateLimiter } from '../_lib/rate-limiter';
import { inputValidator } from '../_lib/input-validator';
import { ApiErrorHandler } from '../_lib/error-handler';
import { supabaseAdmin } from '../_lib/auth';

// Core handler function that will be wrapped with rate limiting
async function taskStatusHandler(request: Request): Promise<Response> {
  // Enhanced Authentication with security logging
  const authResult = await authenticateRequestWithSecurity(request);

  if (!authResult.user) {
    // Log authentication failure
    await enhancedAuth.logSecurityEvent(
      'auth_failure',
      null,
      {
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        userAgent: request.headers.get('user-agent')?.substring(0, 255) || 'unknown',
        endpoint: 'GET /api/tasks/status'
      },
      { reason: authResult.error || 'authentication_failed' },
      'medium'
    );

    return new Response(
      JSON.stringify({ error: 'Authentication required' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  const user = authResult.user;

  // Extract taskId from URL
  const url = new URL(request.url);
  const taskId = url.searchParams.get('taskId');

  // Input validation
  if (!taskId || typeof taskId !== 'string') {
    return new Response(
      JSON.stringify({ error: 'Task ID is required' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // Validate UUID format for task ID
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(taskId)) {
    return new Response(
      JSON.stringify({ error: 'Invalid task ID format' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // Get task from database with ownership verification
  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', user.id) // Only allow users to see their own tasks
    .single();

  if (error || !task) {
    // Log potential unauthorized access attempt
    await enhancedAuth.logSecurityEvent(
      'unauthorized_access_attempt',
      user.id,
      {
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        userAgent: request.headers.get('user-agent')?.substring(0, 255) || 'unknown',
        endpoint: 'GET /api/tasks/status'
      },
      {
        attempted_task_id: taskId,
        reason: error ? 'database_error' : 'task_not_found_or_access_denied'
      },
      'high'
    );

    return new Response(
      JSON.stringify({ error: 'Task not found or access denied' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // Return task status
  return new Response(
    JSON.stringify({
      id: task.id,
      kind: task.kind,
      status: task.status,
      created_at: task.created_at,
      updated_at: task.updated_at,
      result: task.result,
      error_code: task.error_code
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

// Apply rate limiting middleware and export as Vercel API handler
const rateLimitedHandler = withRateLimit(apiRateLimiter)(taskStatusHandler);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Convert to standard Request for enhanced auth
    const request = convertVercelRequest(req);

    // Call the rate-limited handler
    const response = await rateLimitedHandler(request);

    // Convert Response back to Vercel response
    const data = await response.text();

    // Copy rate limit headers
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (key.toLowerCase().startsWith('x-ratelimit') || key.toLowerCase() === 'retry-after') {
        headers[key] = value;
      }
    });

    return res.status(response.status).set(headers).send(data);

  } catch (error) {
    console.error('Task status endpoint error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}