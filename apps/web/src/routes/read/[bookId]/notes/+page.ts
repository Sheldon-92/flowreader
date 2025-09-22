import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, parent }) => {
  const { session } = await parent();

  if (!session) {
    throw redirect(303, '/auth/login');
  }

  return {
    session,
    bookId: params.bookId
  };
};