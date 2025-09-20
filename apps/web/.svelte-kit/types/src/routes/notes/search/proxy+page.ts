// @ts-nocheck
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load = async ({ parent, url }: Parameters<PageLoad>[0]) => {
  const { supabase, session } = await parent();

  if (!session) {
    throw redirect(303, '/auth/login');
  }

  // Extract search parameters from URL
  const searchParams = {
    q: url.searchParams.get('q') || '',
    bookId: url.searchParams.get('bookId') || '',
    source: url.searchParams.get('source') || '',
    type: url.searchParams.get('type') || '',
    hasSelection: url.searchParams.get('hasSelection') || '',
    tags: url.searchParams.get('tags') || '',
    minConfidence: url.searchParams.get('minConfidence') || '',
    sortBy: url.searchParams.get('sortBy') || 'created_at',
    sortOrder: url.searchParams.get('sortOrder') || 'desc'
  };

  return {
    searchParams,
    supabase,
    session
  };
};