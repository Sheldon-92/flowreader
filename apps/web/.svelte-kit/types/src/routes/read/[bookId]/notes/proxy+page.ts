// @ts-nocheck
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { createSupabaseClient } from '$lib/supabase.js';

export const load = async ({ params, parent, fetch, depends }: Parameters<PageLoad>[0]) => {
  depends('supabase:auth');

  const { supabase, session } = await parent();

  if (!session) {
    throw redirect(303, '/auth/login');
  }

  return {
    supabase: createSupabaseClient({ fetch, depends }),
    session,
    bookId: params.bookId
  };
};