import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, url }) => {
  const { supabase, session } = await parent();

  // No authentication required for personal use

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