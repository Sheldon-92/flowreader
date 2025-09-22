import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Create Supabase server client for compatibility
  event.locals.supabase = createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (key) => event.cookies.get(key),
        set: (key, value, options) => event.cookies.set(key, value, options),
        remove: (key, options) => event.cookies.delete(key, options)
      }
    }
  );

  // Mock session function for personal use - no authentication required
  event.locals.getSession = async () => {
    return {
      user: {
        id: 'local-user',
        email: 'personal@local.com',
        created_at: new Date().toISOString()
      },
      access_token: 'mock-token'
    };
  };

  // No authentication checks - personal use only

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      // Allow CORS and auth headers
      return name === 'content-range' || name === 'x-supabase-api-version';
    }
  });
};