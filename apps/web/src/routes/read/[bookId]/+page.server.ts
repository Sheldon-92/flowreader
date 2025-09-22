import { createServerClient } from '@supabase/ssr';
import { redirect } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, event, depends, cookies }) => {
  // No authentication required for personal use
  const { bookId } = params;

  return {
    session: {
      user: {
        id: 'local-user',
        email: 'personal@local.com'
      }
    },
    bookId
  };
};