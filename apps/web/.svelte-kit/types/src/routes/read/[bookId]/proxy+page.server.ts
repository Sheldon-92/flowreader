// @ts-nocheck
import { createSupabaseServerClient } from '@supabase/auth-helpers-sveltekit';
import { redirect } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { PageServerLoad } from './$types';

export const load = async ({ params, event, depends }: Parameters<PageServerLoad>[0]) => {
  depends('supabase:auth');

  const supabase = createSupabaseServerClient({
    supabaseUrl: PUBLIC_SUPABASE_URL,
    supabaseKey: PUBLIC_SUPABASE_ANON_KEY,
    event
  });

  const {
    data: { session }
  } = await supabase.auth.getSession();

  // Redirect to login if not authenticated
  if (!session) {
    throw redirect(303, '/auth/login');
  }

  const { bookId } = params;

  return {
    supabase,
    session,
    bookId
  };
};