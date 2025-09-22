import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, parent }) => {
  const { session } = await parent();

  // No authentication required for personal use

  return {
    session,
    bookId: params.bookId
  };
};