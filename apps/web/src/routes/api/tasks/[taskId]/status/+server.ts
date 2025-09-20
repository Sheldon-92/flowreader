import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '@supabase/auth-helpers-sveltekit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { RequestHandler } from './$types';

// Import from API layer
const API_BASE_URL = process.env.APP_URL || 'http://localhost:3000';

export const GET: RequestHandler = async ({ params, event, fetch }) => {
  try {
    const { taskId } = params;

    // Authenticate user
    const supabase = createSupabaseServerClient({
      supabaseUrl: PUBLIC_SUPABASE_URL,
      supabaseKey: PUBLIC_SUPABASE_ANON_KEY,
      event
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Forward to Vercel API function
    const apiResponse = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      }
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json();
      return json({ error: errorData.message || 'Failed to get task status' }, { status: apiResponse.status });
    }

    const result = await apiResponse.json();
    return json(result);

  } catch (error) {
    console.error('Task status endpoint error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};