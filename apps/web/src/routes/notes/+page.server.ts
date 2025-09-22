import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
  // No authentication required for personal use
  return {
    session: {
      user: {
        id: 'local-user',
        email: 'personal@local.com'
      }
    }
  };
};