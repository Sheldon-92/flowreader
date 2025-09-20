import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
  const session = await locals.getSession();

  if (!session) {
    throw redirect(303, '/auth/login');
  }

  return {
    session
  };
};