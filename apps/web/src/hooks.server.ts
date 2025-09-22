import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Create Supabase server client
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

  // Helper function to get session
  event.locals.getSession = async () => {
    const {
      data: { session }
    } = await event.locals.supabase.auth.getSession();
    return session;
  };

  // Protected routes that require authentication
  const protectedRoutes = ['/library', '/reader', '/settings'];
  const isProtectedRoute = protectedRoutes.some(route => 
    event.url.pathname.startsWith(route)
  );

  if (isProtectedRoute) {
    const session = await event.locals.getSession();
    if (!session) {
      throw redirect(302, '/auth/login');
    }
  }

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      // Allow CORS and auth headers
      return name === 'content-range' || name === 'x-supabase-api-version';
    }
  });
};