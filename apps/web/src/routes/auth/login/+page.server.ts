import { createServerClient } from '@supabase/ssr';
import { redirect, fail } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ event, depends, cookies }) => {
  depends('supabase:auth');

  const supabase = createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (key) => cookies.get(key),
        set: (key, value, options) => cookies.set(key, value, options),
        remove: (key, options) => cookies.delete(key, options)
      }
    }
  );

  const {
    data: { session }
  } = await supabase.auth.getSession();

  // Redirect to library if already authenticated
  if (session) {
    throw redirect(303, '/library');
  }

  return {
    session
  };
};

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
      return fail(400, { error: 'Email and password are required' });
    }

    const supabase = createServerClient(
      PUBLIC_SUPABASE_URL,
      PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get: (key) => cookies.get(key),
          set: (key, value, options) => cookies.set(key, value, {
            ...options,
            path: '/'
          }),
          remove: (key, options) => cookies.delete(key, { ...options, path: '/' })
        }
      }
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      // Handle specific error cases
      let errorMessage = error.message;
      if (error.message.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else if (error.message.includes('Email not confirmed')) {
        errorMessage = 'Please check your email and click the confirmation link before signing in.';
      } else if (error.message.includes('fetch')) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      }
      return fail(400, { error: errorMessage });
    }

    throw redirect(303, '/library');
  }
};