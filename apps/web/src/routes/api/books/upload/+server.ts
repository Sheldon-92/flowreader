import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '@supabase/auth-helpers-sveltekit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { RequestHandler } from './$types';

// Import from API layer
const API_BASE_URL = process.env.APP_URL || 'http://localhost:3000';

export const POST: RequestHandler = async ({ request, event, fetch }) => {
  try {
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

    // Parse request body
    const body = await request.json();
    const { fileName, fileSize, fileData, userId } = body;

    // Validate input
    if (!fileName || !fileSize || !fileData || !userId) {
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!fileName.toLowerCase().endsWith('.epub')) {
      return json({ error: 'Only EPUB files are supported' }, { status: 400 });
    }

    if (fileSize > 50 * 1024 * 1024) { // 50MB limit
      return json({ error: 'File size exceeds 50MB limit' }, { status: 400 });
    }

    if (session.user.id !== userId) {
      return json({ error: 'User ID mismatch' }, { status: 403 });
    }

    // Forward to Vercel API function
    const apiResponse = await fetch(`${API_BASE_URL}/api/books/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        fileName,
        fileSize,
        fileData,
        userId
      })
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json();
      return json({ error: errorData.message || 'Upload failed' }, { status: apiResponse.status });
    }

    const result = await apiResponse.json();
    return json(result);

  } catch (error) {
    console.error('Upload endpoint error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};