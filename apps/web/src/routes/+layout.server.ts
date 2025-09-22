import { createServerClient } from '@supabase/ssr';
import { redirect } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ event, depends, cookies }) => {
  // Return a mock session for personal use - no authentication required
  return {
    session: {
      user: {
        id: 'local-user',
        email: 'personal@local.com',
        created_at: new Date().toISOString()
      },
      access_token: 'mock-token'
    }
  };
};